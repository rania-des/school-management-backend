import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);
router.use(authorize('student', 'admin', 'parent'));

const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

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
// ✅ CORRIGÉ: Récupération des commentaires depuis teacher_comments
router.get('/my-assignments', async (req, res, next) => {
  try {
    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=id,class_id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student) throw new AppError('Student not found', 404);

    // Récupérer les devoirs de la classe
    const { data: assignments } = await sbGet(
      `assignments?class_id=eq.${student.class_id}&select=*,subjects(id,name),classes(id,name)&order=created_at.desc`
    );

    // Récupérer les soumissions de l'étudiant
    const { data: submissions } = await sbGet(
      `submissions?student_id=eq.${student.id}&select=*`
    );

    // Récupérer les commentaires associés aux soumissions
    const submissionIds = (submissions || []).map((s: any) => s.id).join(',');
    let commentsMap = new Map();
    
    if (submissionIds) {
      // Récupérer les commentaires qui ont submission_id
      const { data: comments } = await sbGet(
        `teacher_comments?submission_id=in.(${submissionIds})&select=*&order=created_at.desc`
      );
      
      // Grouper les commentaires par submission_id
      for (const comment of (comments || [])) {
        if (!commentsMap.has(comment.submission_id)) {
          commentsMap.set(comment.submission_id, []);
        }
        commentsMap.get(comment.submission_id).push(comment);
      }
    }

    // Fusionner les soumissions avec leurs commentaires
    const submissionsWithComments = (submissions || []).map((sub: any) => {
      const subComments = commentsMap.get(sub.id) || [];
      
      // Trouver le commentaire du professeur (comment_type = 'teacher_feedback' ou par défaut le premier)
      const teacherCommentObj = subComments.find((c: any) => c.comment_type === 'teacher_feedback') || subComments[0];
      // Trouver la réponse de l'étudiant
      const studentReplyObj = subComments.find((c: any) => c.comment_type === 'student_reply');
      
      return {
        ...sub,
        teacher_comment: teacherCommentObj?.comment || null,
        comment_added_at: teacherCommentObj?.created_at || null,
        student_reply: studentReplyObj?.comment || null,
        student_reply_at: studentReplyObj?.created_at || null,
      };
    });

    res.json(successResponse({
      studentId: student.id,
      classId: student.class_id,
      assignments: Array.isArray(assignments) ? assignments : [],
      submissions: submissionsWithComments,
    }));
  } catch (err) { 
    console.error('Erreur GET /my-assignments:', err);
    next(err); 
  }
});

// ─── POST /student/my-assignments/:assignmentId/submit ────────────────────────
router.post('/my-assignments/:assignmentId/submit', async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { file_data, file_name, ...rest } = req.body;

    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student) throw new AppError('Student not found', 404);

    const { data: assignmentArr } = await sbGet(`assignments?id=eq.${assignmentId}&select=due_date`);
    const assignment = Array.isArray(assignmentArr) ? assignmentArr[0] : null;
    const isLate = assignment?.due_date && new Date() > new Date(assignment.due_date);

    let fileUrl: string | undefined;
    if (file_data && file_name) {
      try {
        const base64Data = file_data.includes(',') ? file_data.split(',')[1] : file_data;
        const mimeType = file_data.includes(',') ? file_data.split(';')[0].replace('data:', '') : 'application/octet-stream';
        const buffer = Buffer.from(base64Data, 'base64');

        const ext = file_name.split('.').pop() || 'bin';
        const filePath = `${student.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from('submissions')
          .upload(filePath, buffer, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          console.error('Upload error:', uploadError.message);
        } else {
          const { data: urlData } = supabaseAdmin.storage
            .from('submissions')
            .getPublicUrl(filePath);
          fileUrl = urlData.publicUrl;
        }
      } catch (uploadErr) {
        console.error('Upload exception:', uploadErr);
      }
    }

    const { data: existing } = await sbGet(
      `submissions?student_id=eq.${student.id}&assignment_id=eq.${assignmentId}&select=id`
    );
    const existingArr = Array.isArray(existing) ? existing : [];

    const submissionBody: any = {
      ...rest,
      submitted_at: new Date().toISOString(),
      status: isLate ? 'late' : 'submitted',
    };
    if (fileUrl) submissionBody.file_url = fileUrl;
    if (file_name) submissionBody.file_name = file_name;

    if (existingArr.length > 0) {
      const updated = await sbPatch(`submissions?id=eq.${existingArr[0].id}`, submissionBody);
      return res.json(successResponse(updated.data, 'Submission updated'));
    } else {
      const subRes = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          assignment_id: assignmentId,
          student_id: student.id,
          ...submissionBody,
        }),
      });
      const data = await subRes.json();
      return res.status(201).json(successResponse(Array.isArray(data) ? data[0] : data, 'Submission created'));
    }
  } catch (err) { next(err); }
});

// ─── PATCH /student/my-assignments/:assignmentId/reply ────────────────────────
// ✅ CORRIGÉ: Utilisation de teacher_comments pour la réponse
router.patch('/my-assignments/:assignmentId/reply', async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { student_reply } = req.body;
    if (!student_reply?.trim()) throw new AppError('student_reply est requis', 400);

    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student) throw new AppError('Student not found', 404);

    const { data: submissions } = await sbGet(`submissions?student_id=eq.${student.id}&assignment_id=eq.${assignmentId}&select=id`);
    const submission = Array.isArray(submissions) ? submissions[0] : null;
    if (!submission) throw new AppError('Submission not found', 404);

    // Vérifier si une réponse existe déjà
    const { data: existingReplies } = await sbGet(
      `teacher_comments?submission_id=eq.${submission.id}&student_id=eq.${student.id}&comment_type=eq.student_reply&select=id`
    );
    
    if (existingReplies && Array.isArray(existingReplies) && existingReplies.length > 0) {
      // Mettre à jour la réponse existante
      const updated = await sbPatch(`teacher_comments?id=eq.${existingReplies[0].id}`, {
        comment: student_reply.trim(),
        updated_at: new Date().toISOString(),
      });
      return res.json(successResponse(updated.data, 'Réponse mise à jour'));
    } else {
      // Créer une nouvelle réponse
      const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/teacher_comments`, {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          submission_id: submission.id,
          student_id: student.id,
          comment: student_reply.trim(),
          comment_type: 'student_reply',
          created_at: new Date().toISOString(),
        })
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

    const { data } = await sbGet(`announcements?select=*&order=created_at.desc`);
    const all = Array.isArray(data) ? data : [];
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

    const { data } = await sbGet(`notifications?select=*&order=created_at.desc`);
    const all = Array.isArray(data) ? data : [];
    const filtered = all.filter((n: any) => {
      if (n.class_id) return n.class_id === classId;
      if (n.user_id) return n.user_id === userId;
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
      sbGet(`schedule_slots?class_id=eq.${student.class_id}&is_active=eq.true&select=subject_id,subjects(id,name)`),
      sbGet(`assignments?class_id=eq.${student.class_id}&type=eq.course&select=*,subjects(id,name)&order=created_at.desc`),
    ]);

    res.json(successResponse({
      classId: student.class_id,
      scheduleSubjects: Array.isArray(slotsRes.data) ? slotsRes.data : [],
      courses: Array.isArray(coursesRes.data) ? coursesRes.data : [],
    }));
  } catch (err) { next(err); }
});

// ─── GET /student/my-teachers ─────────────────────────────────────────────────
router.get('/my-teachers', async (req, res, next) => {
  try {
    const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=class_id`);
    const student = Array.isArray(students) ? students[0] : null;
    if (!student?.class_id) throw new AppError('No class assigned', 404);

    const { data: slots } = await sbGet(
      `schedule_slots?class_id=eq.${student.class_id}&is_active=eq.true&select=teacher_id,subject_id,subjects(id,name),teachers(id,profile_id,profiles(first_name,last_name))`
    );
    const slotsArr = Array.isArray(slots) ? slots : [];

    const teacherMap = new Map<string, any>();
    for (const slot of slotsArr) {
      if (!slot.teacher_id) continue;
      const tid = String(slot.teacher_id);
      if (!teacherMap.has(tid)) {
        teacherMap.set(tid, {
          ...slot.teachers,
          teacherId: slot.teacher_id,
          subjects: [],
        });
      }
      if (slot.subjects) {
        const t = teacherMap.get(tid)!;
        if (!t.subjects.find((s: any) => s.id === slot.subjects.id)) {
          t.subjects.push(slot.subjects);
        }
      }
    }

    res.json(successResponse(Array.from(teacherMap.values())));
  } catch (err) { next(err); }
});

export default router;