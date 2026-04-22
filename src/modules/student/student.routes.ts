import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import multer from 'multer';
import { exec } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

router.use(authenticate);
router.use(authorize('student', 'admin', 'parent'));

const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

// ─── Ollama config ────────────────────────────────────────
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b';

// ─── Shared helpers ───────────────────────────────────────
async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  const data = await res.json();
  if (!res.ok) console.error(`❌ sbGet ${path.split('?')[0]} →`, res.status, JSON.stringify(data).slice(0, 200));
  return { data, ok: res.ok };
}

async function sbPatch(path: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any[];
  return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
}

// ─── Ollama call with timeout + robust JSON extraction ────
async function callOllama(prompt: string, maxTokens = 256): Promise<string> {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(OLLAMA_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  controller.signal,
      body:    JSON.stringify({
        model:   OLLAMA_MODEL,
        prompt,
        stream:  false,
        options: { temperature: 0.4, num_predict: maxTokens },
      }),
    });
    if (!response.ok) throw new AppError(`Ollama HTTP ${response.status}`, 502);
    const data = await response.json() as { response?: string };
    return data.response || '';
  } catch (err: any) {
    if (err.name === 'AbortError') throw new AppError('Ollama timeout. Run: ollama serve', 504);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Extract the first complete {...} JSON object from a raw Ollama response */
function extractJson<T>(raw: string, fallback: T): T {
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  // 1. Direct parse
  try { return JSON.parse(clean); } catch { /* continue */ }
  // 2. Find first balanced { ... }
  let depth = 0, start = -1;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (clean[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { return JSON.parse(clean.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return fallback;
}

// ═══════════════════════════════════════════════════════════
// ─── ROUTE 1: POST /student/speech-to-text ────────────────
// audio blob → Ollama Whisper API → { transcription: string }
// Zéro dépendance système (pas de ffmpeg, pas de CLI Whisper)
// ═══════════════════════════════════════════════════════════
router.post('/speech-to-text', upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No audio file provided', 400);

    const OLLAMA_BASE = (process.env.OLLAMA_URL || 'http://localhost:11434/api/generate')
      .replace('/api/generate', '');

    // Ollama 0.5+ expose POST /api/transcribe (Whisper built-in)
    const formData = new FormData();
    const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' });
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', process.env.WHISPER_MODEL || 'whisper');

    const lang = (req.body.language as string) || 'fr';
    if (lang) formData.append('language', lang);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let transcription = '';
    try {
      const response = await fetch(`${OLLAMA_BASE}/api/transcribe`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (response.ok) {
        const data = await response.json() as { text?: string; transcription?: string };
        transcription = data.text || data.transcription || '';
      } else {
        // Fallback: Ollama version < 0.5 — use generate with audio description prompt
        throw new Error(`Ollama /api/transcribe returned ${response.status}`);
      }
    } catch {
      // Fallback pour Ollama sans support Whisper natif :
      // retourner une transcription vide pour que l'évaluation LLM puisse quand même s'exécuter
      transcription = '';
    } finally {
      clearTimeout(timeout);
    }

    return res.json({ transcription });

  } catch (err) {
    return next(err);
  }
});

// ═══════════════════════════════════════════════════════════
// ─── ROUTE 2: POST /student/evaluate-answer ───────────────
// { transcription, question, options, correct, explanation, language?, emotionHint? }
// → { score, pertinence, vocabulaire, completude, commentaire, conseils }
// ═══════════════════════════════════════════════════════════
const evaluateSchema = z.object({
  transcription: z.string().min(1, 'transcription is required'),
  question:      z.string().min(1),
  options:       z.array(z.string()).min(2).max(6), // ← plus flexible que .length(4)
  correct:       z.coerce.number().int().min(0).max(5), // ← coerce: accepte "0" ou 0
  explanation:   z.string().optional().default(''),
  language:      z.enum(['fr', 'en', 'ar']).default('fr'),
  emotionHint:   z.string().optional().default(''),
});

router.post('/evaluate-answer', async (req, res, next) => {
  try {
    const body = evaluateSchema.parse(req.body);
    const {
      transcription, question, options, correct,
      explanation, language, emotionHint,
    } = body;

    const correctLabel  = `${String.fromCharCode(65 + correct)}) ${options[correct]}`;
    const optionsStr    = options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join(', ');
    const emotionPart   = emotionHint ? `\nContexte: ${emotionHint}` : '';
    const fallback      = {
      score: 5, pertinence: 5, vocabulaire: 5, completude: 5,
      commentaire: 'Évaluation indisponible (Ollama hors ligne).',
      conseils: ['Vérifiez qu\'Ollama est en cours d\'exécution.'],
    };

    const prompts: Record<string, string> = {
      fr: `Tu es un évaluateur pédagogique expert. Évalue UNIQUEMENT la réponse orale ci-dessous.${emotionPart}

Question : "${question}"
Options : ${optionsStr}
Bonne réponse : ${correctLabel}
Explication : ${explanation}
Réponse de l'élève (transcription Whisper) : "${transcription}"

Critères d'évaluation :
- pertinence  : la réponse désigne-t-elle la bonne option ou s'en approche-t-elle ? (0-10)
- vocabulaire : richesse et précision du vocabulaire utilisé (0-10)
- completude  : l'élève justifie-t-il son choix ? (0-10)
- score       : moyenne pondérée globale (0-10)
- commentaire : 2 phrases pédagogiques bienveillantes
- conseils    : 2 conseils concrets pour progresser

Réponds UNIQUEMENT avec ce JSON valide et complet, sans texte autour :
{"score":7,"pertinence":8,"vocabulaire":6,"completude":7,"commentaire":"Phrase 1. Phrase 2.","conseils":["Conseil 1","Conseil 2"]}`,

      en: `You are an expert pedagogical evaluator. Evaluate ONLY the oral answer below.${emotionPart}

Question: "${question}"
Options: ${optionsStr}
Correct answer: ${correctLabel}
Explanation: ${explanation}
Student answer (Whisper transcript): "${transcription}"

Criteria:
- pertinence : does the answer identify the correct option? (0-10)
- vocabulaire: vocabulary richness and precision (0-10)
- completude : does the student justify their choice? (0-10)
- score      : overall weighted score (0-10)
- commentaire: 2 encouraging pedagogical sentences
- conseils   : 2 concrete tips to improve

Respond ONLY with this complete valid JSON, no surrounding text:
{"score":7,"pertinence":8,"vocabulaire":6,"completude":7,"commentaire":"Sentence 1. Sentence 2.","conseils":["Tip 1","Tip 2"]}`,

      ar: `أنت مقيّم تربوي خبير. قيّم الإجابة الشفهية التالية فقط.${emotionPart}

السؤال: "${question}"
الخيارات: ${optionsStr}
الإجابة الصحيحة: ${correctLabel}
الشرح: ${explanation}
إجابة الطالب (نسخ Whisper): "${transcription}"

أجب بـ JSON صالح وكامل فقط، بدون نص إضافي:
{"score":7,"pertinence":8,"vocabulaire":6,"completude":7,"commentaire":"جملة 1. جملة 2.","conseils":["نصيحة 1","نصيحة 2"]}`,
    };

    const raw    = await callOllama(prompts[language] || prompts.fr, 300);
    const result = extractJson(raw, fallback);

    // Clamp all numeric values to 0-10
    const clamp = (v: unknown) => Math.max(0, Math.min(10, Number(v) || 0));

    return res.json({
      success: true,
      data: {
        score:        clamp(result.score),
        pertinence:   clamp(result.pertinence),
        vocabulaire:  clamp(result.vocabulaire),
        completude:   clamp(result.completude),
        commentaire:  typeof result.commentaire === 'string' ? result.commentaire : fallback.commentaire,
        conseils:     Array.isArray(result.conseils) ? result.conseils : [],
        transcription,
      },
    });

  } catch (err) {
    return next(err);
  }
});

// ─── GET /student/my-profile ──────────────────────────────────────────────────
router.get('/my-profile', async (req, res, next) => {
  try {
    const { data: student, error } = await supabaseAdmin
      .from('students')
      .select('*, classes(name, id)')
      .eq('profile_id', req.user!.id)
      .single();
    if (error || !student) throw new AppError('Student not found', 404);
    res.json(successResponse(student));
  } catch (err) { next(err); }
});

// ─── GET /student/my-class-info ───────────────────────────────────────────────
router.get('/my-class-info', async (req, res, next) => {
  try {
    const { data } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=id,class_id,classes(id,name)`);
    const student = Array.isArray(data) ? data[0] : null;
    if (!student) throw new AppError('Student not found', 404);
    res.json(successResponse({
      studentId: student.id,
      classId: student.class_id,
      className: student.classes?.name || null,
    }));
  } catch (err) { next(err); }
});

// ─── GET /student/my-schedule ─────────────────────────────────────────────────
router.get('/my-schedule', async (req, res, next) => {
  try {
    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=class_id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student?.class_id) throw new AppError('No class assigned', 404);

    const { data: slots } = await sbGet(
      `schedule_slots?class_id=eq.${student.class_id}&is_active=eq.true&select=id,day_of_week,start_time,end_time,room,subject_id,teacher_id,subjects(id,name,color),teachers(id,profile_id,profiles(first_name,last_name))`
    );
    const arr = Array.isArray(slots) ? slots : [];
    res.json(successResponse({ classId: student.class_id, slots: arr }));
  } catch (err) { next(err); }
});

// ─── GET /student/my-grades ───────────────────────────────────────────────────
router.get('/my-grades', async (req, res, next) => {
  try {
    const { period } = req.query;
    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=id,class_id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student) throw new AppError('Student not found', 404);

    let gradesPath = `grades?student_id=eq.${student.id}&select=*,subjects(id,name,coefficient)&order=created_at.desc`;
    if (period) gradesPath += `&period=eq.${period}`;

    const { data: grades } = await sbGet(gradesPath);
    const { data: slots } = await sbGet(
      `schedule_slots?class_id=eq.${student.class_id}&is_active=eq.true&select=subject_id,subjects(id,name)`
    );

    res.json(successResponse({
      studentId: student.id,
      classId: student.class_id,
      grades: Array.isArray(grades) ? grades : [],
      scheduleSubjects: Array.isArray(slots) ? slots : [],
    }));
  } catch (err) { next(err); }
});

// ─── GET /student/my-assignments ──────────────────────────────────────────────
router.get('/my-assignments', async (req, res, next) => {
  try {
    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=id,class_id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student) throw new AppError('Student not found', 404);

    let assignments: any[] = [];

    if (student.class_id) {
      const { data: assignmentsRaw } = await sbGet(
        `assignments?class_id=eq.${student.class_id}&select=*,subjects(id,name),classes(id,name)&order=created_at.desc`
      );
      assignments = Array.isArray(assignmentsRaw) ? assignmentsRaw : [];
    }

    if (assignments.length === 0) {
      const { data: teacherAssignmentsRaw } = await sbGet(
        `teacher_assignments?class_id=eq.${student.class_id}&select=*,subjects(id,name),classes(id,name)`
      );
      if (Array.isArray(teacherAssignmentsRaw) && teacherAssignmentsRaw.length > 0) {
        assignments = teacherAssignmentsRaw;
      }
    }

    const { data: submissionsRaw } = await sbGet(`submissions?student_id=eq.${student.id}&select=*`);
    const submissions = Array.isArray(submissionsRaw) ? submissionsRaw : [];

    let commentsMap = new Map();

    if (submissions.length > 0) {
      const submissionIds = submissions.map((s: any) => s.id).join(',');
      if (submissionIds) {
        const { data: commentsRaw } = await sbGet(
          `teacher_comments?submission_id=in.(${submissionIds})&select=*&order=created_at.desc`
        );
        const comments = Array.isArray(commentsRaw) ? commentsRaw : [];
        for (const comment of comments) {
          if (!commentsMap.has(comment.submission_id)) commentsMap.set(comment.submission_id, []);
          commentsMap.get(comment.submission_id).push(comment);
        }
      }
    }

    const submissionsWithComments = submissions.map((sub: any) => {
      const subComments = commentsMap.get(sub.id) || [];
      const teacherCommentObj = subComments.find((c: any) => c.comment_type === 'teacher_feedback');
      const studentReplyObj   = subComments.find((c: any) => c.comment_type === 'student_reply');
      return {
        ...sub,
        teacher_comment:   teacherCommentObj?.comment    || null,
        comment_added_at:  teacherCommentObj?.created_at || null,
        student_reply:     studentReplyObj?.comment      || null,
        student_reply_at:  studentReplyObj?.created_at   || null,
      };
    });

    res.json(successResponse({
      studentId:   student.id,
      classId:     student.class_id,
      assignments,
      submissions: submissionsWithComments,
    }));
  } catch (err) { next(err); }
});

// ─── POST /student/my-assignments/:assignmentId/submit ────────────────────────
router.post('/my-assignments/:assignmentId/submit', upload.single('file'), async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student) throw new AppError('Student not found', 404);

    const { file_url, content } = req.body;
    const submissionBody: Record<string, any> = {
      status:     'submitted',
      updated_at: new Date().toISOString(),
    };
    if (file_url)  submissionBody.file_url = file_url;
    if (content)   submissionBody.content  = content;

    const { data: existingRaw } = await sbGet(
      `submissions?student_id=eq.${student.id}&assignment_id=eq.${assignmentId}&select=id`
    );
    const existing = Array.isArray(existingRaw) ? existingRaw[0] : null;
    let result: any;

    if (existing) {
      const updated = await sbPatch(`submissions?id=eq.${existing.id}`, submissionBody);
      if (!updated.ok) throw new AppError('Failed to update submission', 500);
      result = updated.data;
      return res.json(successResponse(result, 'Submission updated'));
    } else {
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
        method:  'POST',
        headers: { ...H, 'Prefer': 'return=representation' },
        body:    JSON.stringify({ assignment_id: assignmentId, student_id: student.id, ...submissionBody }),
      });
      const insertData = await insertRes.json();
      result = Array.isArray(insertData) ? insertData[0] : insertData;
      if (!insertRes.ok) throw new AppError('Failed to create submission', 500);
      return res.status(201).json(successResponse(result, 'Submission created'));
    }
  } catch (err) { next(err); }
});

// ─── PATCH /student/my-assignments/:assignmentId/reply ────────────────────────
router.patch('/my-assignments/:assignmentId/reply', async (req, res, next) => {
  try {
    const { assignmentId }  = req.params;
    const { student_reply } = req.body;
    if (!student_reply?.trim()) throw new AppError('student_reply est requis', 400);

    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student) throw new AppError('Student not found', 404);

    const { data: submissions } = await sbGet(
      `submissions?student_id=eq.${student.id}&assignment_id=eq.${assignmentId}&select=id`
    );
    const submission = Array.isArray(submissions) ? submissions[0] : null;
    if (!submission) throw new AppError('Submission not found', 404);

    const { data: existingRepliesRaw } = await sbGet(
      `teacher_comments?submission_id=eq.${submission.id}&student_id=eq.${student.id}&comment_type=eq.student_reply&select=id`
    );
    const existingReplies = Array.isArray(existingRepliesRaw) ? existingRepliesRaw : [];

    if (existingReplies.length > 0) {
      const updated = await sbPatch(`teacher_comments?id=eq.${existingReplies[0].id}`, {
        comment:    student_reply.trim(),
        updated_at: new Date().toISOString(),
      });
      return res.json(successResponse(updated.data, 'Réponse mise à jour'));
    } else {
      const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/teacher_comments`, {
        method:  'POST',
        headers: { ...H, 'Prefer': 'return=representation' },
        body:    JSON.stringify({
          submission_id: submission.id,
          student_id:    student.id,
          comment:       student_reply.trim(),
          comment_type:  'student_reply',
          created_at:    new Date().toISOString(),
        }),
      });
      const data = await resInsert.json();
      if (!resInsert.ok) throw new AppError('Failed to send reply', 500);
      return res.status(201).json(successResponse(Array.isArray(data) ? data[0] : data, 'Réponse envoyée'));
    }
  } catch (err) { next(err); }
});

// ─── GET /student/my-announcements ────────────────────────────────────────────
router.get('/my-announcements', async (req, res, next) => {
  try {
    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=class_id`);
    const student = Array.isArray(students) ? students[0] : null;
    const classId = student?.class_id;
    const { data: rawData } = await sbGet(`announcements?select=*&order=created_at.desc`);
    const all      = Array.isArray(rawData) ? rawData : [];
    const filtered = all.filter((a: any) => !a.class_id || a.class_id === classId);
    res.json(successResponse(filtered));
  } catch (err) { next(err); }
});

// ─── GET /student/my-notifications ────────────────────────────────────────────
router.get('/my-notifications', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { data: students } = await sbGet(`students?profile_id=eq.${userId}&select=class_id`);
    const student = Array.isArray(students) ? students[0] : null;
    const classId = student?.class_id;
    const { data: rawData } = await sbGet(`notifications?select=*&order=created_at.desc`);
    const all      = Array.isArray(rawData) ? rawData : [];
    const filtered = all.filter((n: any) => {
      if (n.class_id) return n.class_id === classId;
      if (n.user_id)  return n.user_id  === userId;
      return true;
    });
    res.json(successResponse(filtered));
  } catch (err) { next(err); }
});

// ─── PATCH /student/my-notifications/:id/read ─────────────────────────────────
router.patch('/my-notifications/:id/read', async (req, res, next) => {
  try {
    const { data, ok } = await sbPatch(`notifications?id=eq.${req.params.id}`, { is_read: true });
    if (!ok) throw new AppError('Failed to update notification', 500);
    res.json(successResponse(data, 'Notification marked as read'));
  } catch (err) { next(err); }
});

// ─── GET /student/my-courses ──────────────────────────────────────────────────
router.get('/my-courses', async (req, res, next) => {
  try {
    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=class_id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student?.class_id) throw new AppError('No class assigned', 404);

    const [slotsRes, coursesRes] = await Promise.all([
      sbGet(`schedule_slots?class_id=eq.${student.class_id}&is_active=eq.true&select=subject_id,subjects(id,name),teachers(id,profile_id,profiles(first_name,last_name))`),
      sbGet(`assignments?class_id=eq.${student.class_id}&type=eq.course&select=*,subjects(id,name)&order=created_at.desc`),
    ]);

    res.json(successResponse({
      classId:          student.class_id,
      scheduleSubjects: Array.isArray(slotsRes.data)    ? slotsRes.data    : [],
      courses:          Array.isArray(coursesRes.data)  ? coursesRes.data  : [],
    }));
  } catch (err) { next(err); }
});

// ─── GET /student/my-teachers ─────────────────────────────────────────────────
router.get('/my-teachers', async (req, res, next) => {
  try {
    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=class_id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student?.class_id) throw new AppError('No class assigned', 404);

    const { data: slotsRaw } = await sbGet(
      `schedule_slots?class_id=eq.${student.class_id}&is_active=eq.true&select=teacher_id,subject_id,subjects(id,name),teachers(id,profile_id,profiles(first_name,last_name))`
    );
    const slotsArr = Array.isArray(slotsRaw) ? slotsRaw : [];

    const teacherMap = new Map<string, any>();
    for (const slot of slotsArr) {
      if (!slot.teacher_id) continue;
      const tid = String(slot.teacher_id);
      if (!teacherMap.has(tid)) teacherMap.set(tid, { ...slot.teachers, teacherId: slot.teacher_id, subjects: [] });
      if (slot.subjects) {
        const t = teacherMap.get(tid)!;
        if (!t.subjects.find((s: any) => s.id === slot.subjects.id)) t.subjects.push(slot.subjects);
      }
    }

    res.json(successResponse(Array.from(teacherMap.values())));
  } catch (err) { next(err); }
});

export default router;