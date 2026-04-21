"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const supabase_1 = require("../../config/supabase");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const multer_1 = __importDefault(require("multer"));
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const crypto_1 = require("crypto");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.authorize)('student', 'admin', 'parent'));
const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
    const data = await res.json();
    if (!res.ok)
        console.error(`❌ sbGet ${path.split('?')[0]} →`, res.status, JSON.stringify(data).slice(0, 200));
    return { data, ok: res.ok };
}
async function sbPatch(path, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'PATCH',
        headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
}
// ─── POST /student/speech-to-text ─────────────────────────────────────────────
router.post('/speech-to-text', upload.single('audio'), async (req, res, next) => {
    try {
        if (!req.file)
            throw new error_middleware_1.AppError('No audio file provided', 400);
        const lang = req.body.language || 'fr';
        const tmpId = (0, crypto_1.randomUUID)();
        const inPath = (0, path_1.join)((0, os_1.tmpdir)(), `${tmpId}.webm`);
        const outPath = (0, path_1.join)((0, os_1.tmpdir)(), `${tmpId}.wav`);
        // Write uploaded blob to disk
        (0, fs_1.writeFileSync)(inPath, req.file.buffer);
        // Convert webm → wav via ffmpeg (required by Whisper)
        await new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`ffmpeg -y -i "${inPath}" -ar 16000 -ac 1 "${outPath}"`, (err) => {
                if (err)
                    reject(new error_middleware_1.AppError('ffmpeg conversion failed. Is ffmpeg installed?', 500));
                else
                    resolve();
            });
        });
        // Call Whisper CLI
        const whisperModel = process.env.WHISPER_MODEL || 'base';
        const transcription = await new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`whisper "${outPath}" --model ${whisperModel} --language ${lang} --output_format txt --output_dir "${(0, os_1.tmpdir)()}"`, (err, stdout, stderr) => {
                if (err) {
                    reject(new error_middleware_1.AppError('Whisper failed. Run: pip install openai-whisper', 500));
                }
                else {
                    // Whisper writes <filename>.txt next to the wav
                    const txtPath = outPath.replace('.wav', '.txt');
                    try {
                        const text = require('fs').readFileSync(txtPath, 'utf-8').trim();
                        if ((0, fs_1.existsSync)(txtPath))
                            (0, fs_1.unlinkSync)(txtPath);
                        resolve(text);
                    }
                    catch {
                        resolve(stdout.trim() || '');
                    }
                }
            });
        });
        // Cleanup temp files
        if ((0, fs_1.existsSync)(inPath))
            (0, fs_1.unlinkSync)(inPath);
        if ((0, fs_1.existsSync)(outPath))
            (0, fs_1.unlinkSync)(outPath);
        return res.json({ transcription });
    }
    catch (err) {
        return next(err);
    }
});
// ─── GET /student/my-profile ──────────────────────────────────────────────────
router.get('/my-profile', async (req, res, next) => {
    try {
        const { data: student, error } = await supabase_1.supabaseAdmin
            .from('students')
            .select('*, classes(name, id)')
            .eq('profile_id', req.user.id)
            .single();
        if (error || !student)
            throw new error_middleware_1.AppError('Student not found', 404);
        res.json((0, pagination_1.successResponse)(student));
    }
    catch (err) {
        next(err);
    }
});
// ─── GET /student/my-class-info ───────────────────────────────────────────────
router.get('/my-class-info', async (req, res, next) => {
    try {
        const { data } = await sbGet(`students?profile_id=eq.${req.user.id}&select=id,class_id,classes(id,name)`);
        const student = Array.isArray(data) ? data[0] : null;
        if (!student)
            throw new error_middleware_1.AppError('Student not found', 404);
        res.json((0, pagination_1.successResponse)({
            studentId: student.id,
            classId: student.class_id,
            className: student.classes?.name || null,
        }));
    }
    catch (err) {
        next(err);
    }
});
// ─── GET /student/my-schedule ─────────────────────────────────────────────────
router.get('/my-schedule', async (req, res, next) => {
    try {
        const { data: students } = await sbGet(`students?profile_id=eq.${req.user.id}&select=class_id`);
        const student = Array.isArray(students) ? students[0] : null;
        if (!student?.class_id)
            throw new error_middleware_1.AppError('No class assigned', 404);
        const { data: slots } = await sbGet(`schedule_slots?class_id=eq.${student.class_id}&is_active=eq.true&select=id,day_of_week,start_time,end_time,room,subject_id,teacher_id,subjects(id,name,color),teachers(id,profile_id,profiles(first_name,last_name))`);
        const arr = Array.isArray(slots) ? slots : [];
        res.json((0, pagination_1.successResponse)({ classId: student.class_id, slots: arr }));
    }
    catch (err) {
        next(err);
    }
});
// ─── GET /student/my-grades ───────────────────────────────────────────────────
router.get('/my-grades', async (req, res, next) => {
    try {
        const { period } = req.query;
        const { data: students } = await sbGet(`students?profile_id=eq.${req.user.id}&select=id,class_id`);
        const student = Array.isArray(students) ? students[0] : null;
        if (!student)
            throw new error_middleware_1.AppError('Student not found', 404);
        let gradesPath = `grades?student_id=eq.${student.id}&select=*,subjects(id,name,coefficient)&order=created_at.desc`;
        if (period)
            gradesPath += `&period=eq.${period}`;
        const { data: grades } = await sbGet(gradesPath);
        const { data: slots } = await sbGet(`schedule_slots?class_id=eq.${student.class_id}&is_active=eq.true&select=subject_id,subjects(id,name)`);
        res.json((0, pagination_1.successResponse)({
            studentId: student.id,
            classId: student.class_id,
            grades: Array.isArray(grades) ? grades : [],
            scheduleSubjects: Array.isArray(slots) ? slots : [],
        }));
    }
    catch (err) {
        next(err);
    }
});
// ─── GET /student/my-assignments ──────────────────────────────────────────────
router.get('/my-assignments', async (req, res, next) => {
    try {
        const { data: students } = await sbGet(`students?profile_id=eq.${req.user.id}&select=id,class_id`);
        const student = Array.isArray(students) ? students[0] : null;
        if (!student)
            throw new error_middleware_1.AppError('Student not found', 404);
        let assignments = [];
        if (student.class_id) {
            const { data: assignmentsRaw } = await sbGet(`assignments?class_id=eq.${student.class_id}&select=*,subjects(id,name),classes(id,name)&order=created_at.desc`);
            assignments = Array.isArray(assignmentsRaw) ? assignmentsRaw : [];
        }
        if (assignments.length === 0) {
            const { data: teacherAssignmentsRaw } = await sbGet(`teacher_assignments?class_id=eq.${student.class_id}&select=*,subjects(id,name),classes(id,name)`);
            if (Array.isArray(teacherAssignmentsRaw) && teacherAssignmentsRaw.length > 0) {
                assignments = teacherAssignmentsRaw;
            }
        }
        const { data: submissionsRaw } = await sbGet(`submissions?student_id=eq.${student.id}&select=*`);
        const submissions = Array.isArray(submissionsRaw) ? submissionsRaw : [];
        let commentsMap = new Map();
        if (submissions.length > 0) {
            const submissionIds = submissions.map((s) => s.id).join(',');
            if (submissionIds) {
                const { data: commentsRaw } = await sbGet(`teacher_comments?submission_id=in.(${submissionIds})&select=*&order=created_at.desc`);
                const comments = Array.isArray(commentsRaw) ? commentsRaw : [];
                for (const comment of comments) {
                    if (!commentsMap.has(comment.submission_id)) {
                        commentsMap.set(comment.submission_id, []);
                    }
                    commentsMap.get(comment.submission_id).push(comment);
                }
            }
        }
        const submissionsWithComments = submissions.map((sub) => {
            const subComments = commentsMap.get(sub.id) || [];
            const teacherCommentObj = subComments.find((c) => c.comment_type === 'teacher_feedback');
            const studentReplyObj = subComments.find((c) => c.comment_type === 'student_reply');
            return {
                ...sub,
                teacher_comment: teacherCommentObj?.comment || null,
                comment_added_at: teacherCommentObj?.created_at || null,
                student_reply: studentReplyObj?.comment || null,
                student_reply_at: studentReplyObj?.created_at || null,
            };
        });
        console.log(`📊 Assignments trouvés: ${assignments.length}`);
        console.log(`📊 Submissions trouvées: ${submissions.length}`);
        res.json((0, pagination_1.successResponse)({
            studentId: student.id,
            classId: student.class_id,
            assignments: assignments,
            submissions: submissionsWithComments,
        }));
    }
    catch (err) {
        console.error('Erreur GET /my-assignments:', err);
        next(err);
    }
});
// ─── POST /student/my-assignments/:assignmentId/submit ────────────────────────
// ✅ VERSION CORRIGÉE - Accepte file_url direct du front
router.post('/my-assignments/:assignmentId/submit', upload.single('file'), async (req, res, next) => {
    try {
        const { assignmentId } = req.params;
        // Nouvelle méthode: file_url directement depuis le front (upload déjà fait)
        const { file_url, file_name: bodyFileName } = req.body;
        let fileUrl = file_url;
        let fileName = bodyFileName;
        console.log(`\n========== [SUBMIT] NOUVELLE SOUMISSION ==========`);
        console.log(`📤 Assignment ID: ${assignmentId}`);
        console.log(`📎 file_url: ${fileUrl || 'non fourni'}`);
        console.log(`📎 file_name: ${fileName || 'non fourni'}`);
        // Rétrocompatibilité: si pas de file_url mais un fichier uploadé via multer
        if (!fileUrl && req.file) {
            console.log(`🔄 Fallback: upload via multer (ancienne méthode)`);
            try {
                const buffer = req.file.buffer;
                const mimeType = req.file.mimetype;
                const fname = req.file.originalname;
                fileName = fname;
                const ext = fname.split('.').pop() || 'bin';
                const filePath = `fallback/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
                const { error: uploadError } = await supabase_1.supabaseAdmin.storage
                    .from('submissions')
                    .upload(filePath, buffer, { contentType: mimeType, cacheControl: '3600', upsert: true });
                if (!uploadError) {
                    const { data: urlData } = supabase_1.supabaseAdmin.storage.from('submissions').getPublicUrl(filePath);
                    fileUrl = urlData.publicUrl;
                    console.log(`✅ Fichier uploadé via fallback: ${fileUrl}`);
                }
                else {
                    console.error('❌ Fallback upload error:', uploadError);
                }
            }
            catch (uploadErr) {
                console.error('❌ Fallback upload exception:', uploadErr);
            }
        }
        // 1. Récupérer l'étudiant
        const { data: students } = await sbGet(`students?profile_id=eq.${req.user.id}&select=id`);
        const student = Array.isArray(students) ? students[0] : null;
        if (!student) {
            console.error(`❌ Student non trouvé pour profile: ${req.user.id}`);
            throw new error_middleware_1.AppError('Student not found', 404);
        }
        console.log(`✅ Student ID: ${student.id}`);
        // 2. Vérifier si le devoir existe
        const { data: assignmentArr } = await sbGet(`assignments?id=eq.${assignmentId}&select=due_date,title,id`);
        const assignment = Array.isArray(assignmentArr) ? assignmentArr[0] : null;
        if (!assignment) {
            console.error(`❌ Assignment non trouvé: ${assignmentId}`);
            throw new error_middleware_1.AppError('Assignment not found', 404);
        }
        console.log(`✅ Assignment trouvé: "${assignment.title}" (ID: ${assignment.id})`);
        console.log(`📅 Due date: ${assignment.due_date}`);
        const isLate = assignment.due_date && new Date() > new Date(assignment.due_date);
        console.log(`⏰ Est en retard: ${isLate}`);
        // 3. Vérifier si une soumission existe déjà
        const { data: existing } = await sbGet(`submissions?student_id=eq.${student.id}&assignment_id=eq.${assignmentId}&select=id,status`);
        const existingArr = Array.isArray(existing) ? existing : [];
        console.log(`🔍 Soumission existante: ${existingArr.length > 0 ? `OUI (ID: ${existingArr[0].id})` : 'NON'}`);
        const submissionBody = {
            submitted_at: new Date().toISOString(),
            status: isLate ? 'late' : 'submitted',
        };
        if (fileUrl) {
            submissionBody.file_url = fileUrl;
            submissionBody.file_name = fileName;
        }
        let result;
        if (existingArr.length > 0) {
            // Mise à jour
            console.log(`🔄 Mise à jour de la soumission existante: ${existingArr[0].id}`);
            const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${existingArr[0].id}`, {
                method: 'PATCH',
                headers: { ...H, 'Prefer': 'return=representation' },
                body: JSON.stringify(submissionBody)
            });
            const updateData = await updateRes.json();
            result = Array.isArray(updateData) ? updateData[0] : updateData;
            if (!updateRes.ok) {
                console.error('❌ Update error:', updateData);
                throw new error_middleware_1.AppError('Failed to update submission', 500);
            }
            console.log(`✅ Submission mise à jour avec succès! ID: ${result?.id}`);
            console.log(`==========================================\n`);
            return res.json((0, pagination_1.successResponse)(result, 'Submission updated'));
        }
        else {
            // Création
            console.log(`✨ Création d'une nouvelle soumission`);
            const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
                method: 'POST',
                headers: { ...H, 'Prefer': 'return=representation' },
                body: JSON.stringify({
                    assignment_id: assignmentId,
                    student_id: student.id,
                    ...submissionBody,
                }),
            });
            const insertData = await insertRes.json();
            result = Array.isArray(insertData) ? insertData[0] : insertData;
            if (!insertRes.ok) {
                console.error('❌ Insert error - Status:', insertRes.status);
                console.error('❌ Insert error - Data:', insertData);
                throw new error_middleware_1.AppError('Failed to create submission', 500);
            }
            console.log(`✅ Nouvelle soumission créée avec succès! ID: ${result?.id}`);
            console.log(`==========================================\n`);
            return res.status(201).json((0, pagination_1.successResponse)(result, 'Submission created'));
        }
    }
    catch (err) {
        console.error('❌ Erreur globale dans submit:', err);
        next(err);
    }
});
// ─── PATCH /student/my-assignments/:assignmentId/reply ────────────────────────
router.patch('/my-assignments/:assignmentId/reply', async (req, res, next) => {
    try {
        const { assignmentId } = req.params;
        const { student_reply } = req.body;
        if (!student_reply?.trim())
            throw new error_middleware_1.AppError('student_reply est requis', 400);
        const { data: students } = await sbGet(`students?profile_id=eq.${req.user.id}&select=id`);
        const student = Array.isArray(students) ? students[0] : null;
        if (!student)
            throw new error_middleware_1.AppError('Student not found', 404);
        const { data: submissions } = await sbGet(`submissions?student_id=eq.${student.id}&assignment_id=eq.${assignmentId}&select=id`);
        const submission = Array.isArray(submissions) ? submissions[0] : null;
        if (!submission)
            throw new error_middleware_1.AppError('Submission not found', 404);
        const { data: existingRepliesRaw } = await sbGet(`teacher_comments?submission_id=eq.${submission.id}&student_id=eq.${student.id}&comment_type=eq.student_reply&select=id`);
        const existingReplies = Array.isArray(existingRepliesRaw) ? existingRepliesRaw : [];
        if (existingReplies.length > 0) {
            const updated = await sbPatch(`teacher_comments?id=eq.${existingReplies[0].id}`, {
                comment: student_reply.trim(),
                updated_at: new Date().toISOString(),
            });
            return res.json((0, pagination_1.successResponse)(updated.data, 'Réponse mise à jour'));
        }
        else {
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
            if (!resInsert.ok)
                throw new error_middleware_1.AppError('Failed to send reply', 500);
            return res.status(201).json((0, pagination_1.successResponse)(Array.isArray(data) ? data[0] : data, 'Réponse envoyée'));
        }
    }
    catch (err) {
        next(err);
    }
});
// ─── GET /student/my-announcements ────────────────────────────────────────────
router.get('/my-announcements', async (req, res, next) => {
    try {
        const { data: students } = await sbGet(`students?profile_id=eq.${req.user.id}&select=class_id`);
        const student = Array.isArray(students) ? students[0] : null;
        const classId = student?.class_id;
        const { data: rawData } = await sbGet(`announcements?select=*&order=created_at.desc`);
        const all = Array.isArray(rawData) ? rawData : [];
        const filtered = all.filter((a) => !a.class_id || a.class_id === classId);
        res.json((0, pagination_1.successResponse)(filtered));
    }
    catch (err) {
        next(err);
    }
});
// ─── GET /student/my-notifications ────────────────────────────────────────────
router.get('/my-notifications', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { data: students } = await sbGet(`students?profile_id=eq.${userId}&select=class_id`);
        const student = Array.isArray(students) ? students[0] : null;
        const classId = student?.class_id;
        const { data: rawData } = await sbGet(`notifications?select=*&order=created_at.desc`);
        const all = Array.isArray(rawData) ? rawData : [];
        const filtered = all.filter((n) => {
            if (n.class_id)
                return n.class_id === classId;
            if (n.user_id)
                return n.user_id === userId;
            return true;
        });
        res.json((0, pagination_1.successResponse)(filtered));
    }
    catch (err) {
        next(err);
    }
});
// ─── PATCH /student/my-notifications/:id/read ─────────────────────────────────
router.patch('/my-notifications/:id/read', async (req, res, next) => {
    try {
        const { data, ok } = await sbPatch(`notifications?id=eq.${req.params.id}`, { is_read: true });
        if (!ok)
            throw new error_middleware_1.AppError('Failed to update notification', 500);
        res.json((0, pagination_1.successResponse)(data, 'Notification marked as read'));
    }
    catch (err) {
        next(err);
    }
});
// ─── GET /student/my-courses ──────────────────────────────────────────────────
router.get('/my-courses', async (req, res, next) => {
    try {
        const { data: students } = await sbGet(`students?profile_id=eq.${req.user.id}&select=class_id`);
        const student = Array.isArray(students) ? students[0] : null;
        if (!student?.class_id)
            throw new error_middleware_1.AppError('No class assigned', 404);
        const [slotsRes, coursesRes] = await Promise.all([
            sbGet(`schedule_slots?class_id=eq.${student.class_id}&is_active=eq.true&select=subject_id,subjects(id,name),teachers(id,profile_id,profiles(first_name,last_name))`),
            sbGet(`assignments?class_id=eq.${student.class_id}&type=eq.course&select=*,subjects(id,name)&order=created_at.desc`),
        ]);
        const slotsData = Array.isArray(slotsRes.data) ? slotsRes.data : [];
        const coursesData = Array.isArray(coursesRes.data) ? coursesRes.data : [];
        res.json((0, pagination_1.successResponse)({
            classId: student.class_id,
            scheduleSubjects: slotsData,
            courses: coursesData,
        }));
    }
    catch (err) {
        next(err);
    }
});
// ─── GET /student/my-teachers ─────────────────────────────────────────────────
router.get('/my-teachers', async (req, res, next) => {
    try {
        const { data: students } = await sbGet(`students?profile_id=eq.${req.user.id}&select=class_id`);
        const student = Array.isArray(students) ? students[0] : null;
        if (!student?.class_id)
            throw new error_middleware_1.AppError('No class assigned', 404);
        const { data: slotsRaw } = await sbGet(`schedule_slots?class_id=eq.${student.class_id}&is_active=eq.true&select=teacher_id,subject_id,subjects(id,name),teachers(id,profile_id,profiles(first_name,last_name))`);
        const slotsArr = Array.isArray(slotsRaw) ? slotsRaw : [];
        const teacherMap = new Map();
        for (const slot of slotsArr) {
            if (!slot.teacher_id)
                continue;
            const tid = String(slot.teacher_id);
            if (!teacherMap.has(tid)) {
                teacherMap.set(tid, {
                    ...slot.teachers,
                    teacherId: slot.teacher_id,
                    subjects: [],
                });
            }
            if (slot.subjects) {
                const t = teacherMap.get(tid);
                if (!t.subjects.find((s) => s.id === slot.subjects.id)) {
                    t.subjects.push(slot.subjects);
                }
            }
        }
        res.json((0, pagination_1.successResponse)(Array.from(teacherMap.values())));
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=student.routes.js.map