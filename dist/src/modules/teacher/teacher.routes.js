"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const notifications_1 = require("../../utils/notifications");
const pdfkit_1 = __importDefault(require("pdfkit"));
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.authorize)('teacher', 'admin'));
const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
function extractFirstItem(data) {
    if (!data)
        return null;
    if (Array.isArray(data) && data.length > 0)
        return data[0];
    return data;
}
async function getTeacherId(profileId) {
    const url = `${SUPABASE_URL}/rest/v1/teachers?profile_id=eq.${profileId}&select=id`;
    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });
    const data = (await res.json());
    if (!res.ok) {
        throw new error_middleware_1.AppError(`Supabase API error: ${res.status}`, 500);
    }
    if (!data?.[0]?.id) {
        throw new error_middleware_1.AppError('Teacher not found for profile: ' + profileId, 404);
    }
    return data[0].id;
}
// =============================================================================
// CLASSES & STUDENTS
// =============================================================================
router.get('/classes', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const resSlots = await fetch(`${SUPABASE_URL}/rest/v1/schedule_slots?teacher_id=eq.${teacherId}&is_active=eq.true&select=class_id,subject_id,classes:class_id(id,name,academic_year_id),subjects:subject_id(id,name)`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const slots = (await resSlots.json());
        if (!resSlots.ok)
            throw new error_middleware_1.AppError('Failed to fetch teacher classes', 500);
        const classMap = new Map();
        for (const slot of slots || []) {
            const key = `${slot.class_id}_${slot.subject_id}`;
            if (!classMap.has(key)) {
                const classItem = extractFirstItem(slot.classes);
                const subjectItem = extractFirstItem(slot.subjects);
                classMap.set(key, {
                    classId: slot.class_id,
                    className: classItem?.name || `Classe ${slot.class_id}`,
                    subjectId: slot.subject_id,
                    subjectName: subjectItem?.name || 'Matière',
                    academicYearId: classItem?.academic_year_id || null,
                });
            }
        }
        res.json((0, pagination_1.successResponse)(Array.from(classMap.values())));
    }
    catch (err) {
        next(err);
    }
});
router.get('/students/:classId', async (req, res, next) => {
    try {
        const { classId } = req.params;
        const resStudents = await fetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${classId}&select=id,profile_id,student_number,profiles:profile_id(first_name,last_name,email,avatar_url)`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const students = (await resStudents.json());
        if (!resStudents.ok)
            throw new error_middleware_1.AppError('Failed to fetch students', 500);
        const formatted = (students || []).map((s) => ({
            id: s.id,
            profile_id: s.profile_id,
            student_number: s.student_number,
            profile: extractFirstItem(s.profiles),
        }));
        res.json((0, pagination_1.successResponse)(formatted));
    }
    catch (err) {
        next(err);
    }
});
// =============================================================================
// EMPLOI DU TEMPS
// =============================================================================
router.get('/schedule', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const resSlots = await fetch(`${SUPABASE_URL}/rest/v1/schedule_slots?teacher_id=eq.${teacherId}&is_active=eq.true&select=*,subjects:subject_id(name,color),classes:class_id(name)&order=day_of_week,start_time`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const slots = (await resSlots.json());
        if (!resSlots.ok)
            throw new error_middleware_1.AppError('Failed to fetch schedule', 500);
        const formatted = (slots || []).map((slot) => ({
            ...slot,
            subjects: extractFirstItem(slot.subjects),
            classes: extractFirstItem(slot.classes),
        }));
        res.json((0, pagination_1.successResponse)(formatted));
    }
    catch (err) {
        next(err);
    }
});
// =============================================================================
// STATISTIQUES
// =============================================================================
router.get('/stats', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const [classesRes, assignmentsRes, gradesRes] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/schedule_slots?teacher_id=eq.${teacherId}&is_active=eq.true&select=class_id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }),
            fetch(`${SUPABASE_URL}/rest/v1/assignments?teacher_id=eq.${teacherId}&select=id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }),
            fetch(`${SUPABASE_URL}/rest/v1/grades?teacher_id=eq.${teacherId}&select=id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }),
        ]);
        const classesData = (await classesRes.json());
        const assignmentsData = (await assignmentsRes.json());
        const gradesData = (await gradesRes.json());
        res.json((0, pagination_1.successResponse)({
            totalClasses: classesData?.length || 0,
            totalAssignments: assignmentsData?.length || 0,
            totalGrades: gradesData?.length || 0,
        }));
    }
    catch (err) {
        next(err);
    }
});
// =============================================================================
// NOTES (GRADES)
// =============================================================================
router.get('/grades', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const { classId, subjectId, period } = req.query;
        let url = `${SUPABASE_URL}/rest/v1/grades?teacher_id=eq.${teacherId}&select=*,students:student_id(id,student_number,profiles:profile_id(first_name,last_name)),subjects:subject_id(name)&order=created_at.desc`;
        if (classId)
            url += `&class_id=eq.${classId}`;
        if (subjectId)
            url += `&subject_id=eq.${subjectId}`;
        if (period)
            url += `&period=eq.${period}`;
        const resData = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const data = (await resData.json());
        if (!resData.ok)
            throw new error_middleware_1.AppError('Failed to fetch grades', 500);
        const formatted = (data || []).map((g) => ({
            ...g,
            student: extractFirstItem(g.students),
            subject: extractFirstItem(g.subjects),
        }));
        res.json((0, pagination_1.successResponse)(formatted));
    }
    catch (err) {
        next(err);
    }
});
router.post('/grades', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const { studentId, classId, subjectId, value, maxValue, period, type, comment } = req.body;
        if (!studentId || !classId || !subjectId || value === undefined || !period) {
            throw new error_middleware_1.AppError('studentId, classId, subjectId, value et period sont requis', 400);
        }
        const insertBody = {
            teacher_id: teacherId,
            student_id: studentId,
            class_id: classId,
            subject_id: subjectId,
            academic_year_id: req.body.academicYearId || null,
            score: Number(value ?? req.body.score),
            max_score: maxValue ? Number(maxValue) : (req.body.maxScore ? Number(req.body.maxScore) : 20),
            coefficient: req.body.coefficient ? Number(req.body.coefficient) : 1,
            title: req.body.title || type || 'Note',
            period: period,
            grade_date: req.body.gradeDate || new Date().toISOString().split('T')[0],
            description: comment || req.body.description || null,
        };
        const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/grades`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(insertBody)
        });
        const rawText = await resInsert.text();
        if (!resInsert.ok) {
            console.error('Supabase insert error:', rawText);
            throw new error_middleware_1.AppError(`Failed to create grade: ${resInsert.status} - ${rawText}`, 500);
        }
        const dataArr = JSON.parse(rawText);
        const data = dataArr[0];
        const resStudent = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}&select=profile_id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const studentArr = (await resStudent.json());
        const student = studentArr[0];
        if (student?.profile_id) {
            await (0, notifications_1.createNotification)({
                recipientId: student.profile_id,
                type: 'grade',
                title: 'Nouvelle note ajoutée',
                body: `Une note de ${value}/${maxValue || 20} a été ajoutée.`,
                data: { gradeId: data.id },
            });
        }
        res.status(201).json((0, pagination_1.successResponse)(data, 'Note ajoutée avec succès'));
    }
    catch (err) {
        next(err);
    }
});
router.put('/grades/:gradeId', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const { gradeId } = req.params;
        const { value, maxValue, comment } = req.body;
        const updateBody = { description: comment };
        if (value !== undefined)
            updateBody.score = Number(value);
        if (maxValue !== undefined)
            updateBody.max_score = Number(maxValue);
        const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/grades?id=eq.${gradeId}&teacher_id=eq.${teacherId}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify(updateBody)
        });
        const rawText = await resUpdate.text();
        if (!resUpdate.ok) {
            console.error('Supabase update error:', rawText);
            throw new error_middleware_1.AppError(`Failed to update grade: ${resUpdate.status} - ${rawText}`, 500);
        }
        const dataArr = JSON.parse(rawText);
        const data = dataArr[0];
        if (!data)
            throw new error_middleware_1.AppError('Grade not found or not authorized', 404);
        res.json((0, pagination_1.successResponse)(data, 'Note modifiée avec succès'));
    }
    catch (err) {
        next(err);
    }
});
router.delete('/grades/:gradeId', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const { gradeId } = req.params;
        const resDelete = await fetch(`${SUPABASE_URL}/rest/v1/grades?id=eq.${gradeId}&teacher_id=eq.${teacherId}`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!resDelete.ok) {
            const rawText = await resDelete.text();
            throw new error_middleware_1.AppError(`Failed to delete grade: ${resDelete.status} - ${rawText}`, 500);
        }
        res.json((0, pagination_1.successResponse)(null, 'Note supprimée'));
    }
    catch (err) {
        next(err);
    }
});
// =============================================================================
// DEVOIRS (ASSIGNMENTS)
// =============================================================================
router.get('/assignments', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const { classId, subjectId, type } = req.query;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        let url = `${SUPABASE_URL}/rest/v1/assignments?teacher_id=eq.${teacherId}&select=*&order=due_date`;
        if (classId)
            url += `&class_id=eq.${classId}`;
        if (subjectId)
            url += `&subject_id=eq.${subjectId}`;
        if (type)
            url += `&type=eq.${type}`;
        const resData = await fetch(url, { headers: H });
        const data = (await resData.json());
        if (!resData.ok)
            throw new error_middleware_1.AppError('Failed to fetch assignments', 500);
        res.json((0, pagination_1.successResponse)(data || []));
    }
    catch (err) {
        next(err);
    }
});
router.post('/assignments', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const { classId, subjectId, title, description, dueDate, type, maxScore, fileUrl } = req.body;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
        if (!classId || !subjectId || !title) {
            throw new error_middleware_1.AppError('classId, subjectId et title sont requis', 400);
        }
        let academicYearId = req.body.academicYearId || null;
        if (!academicYearId) {
            const resClass = await fetch(`${SUPABASE_URL}/rest/v1/classes?id=eq.${classId}&select=academic_year_id`, { headers: H });
            if (resClass.ok) {
                const classArr = (await resClass.json());
                academicYearId = classArr?.[0]?.academic_year_id || null;
            }
        }
        const insertBody = {
            teacher_id: teacherId,
            class_id: classId,
            subject_id: subjectId,
            title,
            description: description || null,
            due_date: dueDate || null,
            type: type || 'homework',
            points: maxScore ? Number(maxScore) : null,
        };
        if (academicYearId)
            insertBody.academic_year_id = academicYearId;
        if (fileUrl)
            insertBody.file_url = fileUrl;
        const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/assignments`, {
            method: 'POST',
            headers: H,
            body: JSON.stringify(insertBody),
        });
        const rawText = await resInsert.text();
        if (!resInsert.ok) {
            console.error('Supabase insert error:', rawText);
            throw new error_middleware_1.AppError(`Failed to create assignment: ${resInsert.status} - ${rawText}`, 500);
        }
        const dataArr = JSON.parse(rawText);
        const data = dataArr[0];
        const studentProfileIds = await (0, notifications_1.getClassStudentProfileIds)(classId);
        if (studentProfileIds.length > 0) {
            const notificationTitle = type === 'course' ? 'Nouveau cours publié' : 'Nouveau devoir';
            const notificationBody = type === 'course'
                ? `${title} - ${description || 'Consultez le nouveau cours'}`
                : `${title}${dueDate ? ` — À rendre pour le ${new Date(dueDate).toLocaleDateString('fr-FR')}` : ''}`;
            await (0, notifications_1.createBulkNotifications)(studentProfileIds, {
                type: type === 'course' ? 'course' : 'assignment',
                title: notificationTitle,
                body: notificationBody,
                data: { assignmentId: data.id, type: type || 'homework' },
            });
        }
        res.status(201).json((0, pagination_1.successResponse)(data, type === 'course' ? 'Cours créé avec succès' : 'Devoir créé avec succès'));
    }
    catch (err) {
        next(err);
    }
});
router.put('/assignments/:assignmentId', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const { assignmentId } = req.params;
        const { title, description, dueDate, type, maxScore } = req.body;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
        const updateBody = { title, description, due_date: dueDate, type };
        if (maxScore !== undefined)
            updateBody.points = Number(maxScore);
        const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}&teacher_id=eq.${teacherId}`, {
            method: 'PATCH',
            headers: H,
            body: JSON.stringify(updateBody)
        });
        const rawText = await resUpdate.text();
        if (!resUpdate.ok) {
            console.error('Supabase update error:', rawText);
            throw new error_middleware_1.AppError(`Failed to update assignment: ${resUpdate.status} - ${rawText}`, 500);
        }
        const dataArr = JSON.parse(rawText);
        const data = dataArr[0];
        if (!data)
            throw new error_middleware_1.AppError('Assignment not found or not authorized', 404);
        res.json((0, pagination_1.successResponse)(data, 'Devoir modifié'));
    }
    catch (err) {
        next(err);
    }
});
router.delete('/assignments/:assignmentId', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const { assignmentId } = req.params;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        const resDelete = await fetch(`${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}&teacher_id=eq.${teacherId}`, {
            method: 'DELETE',
            headers: H
        });
        if (!resDelete.ok) {
            const rawText = await resDelete.text();
            throw new error_middleware_1.AppError(`Failed to delete assignment: ${resDelete.status} - ${rawText}`, 500);
        }
        res.json((0, pagination_1.successResponse)(null, 'Devoir supprimé'));
    }
    catch (err) {
        next(err);
    }
});
// GET /teacher/assignments/:assignmentId/submissions
router.get('/assignments/:assignmentId/submissions', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const { assignmentId } = req.params;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}&teacher_id=eq.${teacherId}&select=id`, { headers: H });
        const checkData = (await checkRes.json());
        if (!checkRes.ok || checkData.length === 0) {
            throw new error_middleware_1.AppError('Assignment not found or not authorized', 404);
        }
        const submissionsRes = await fetch(`${SUPABASE_URL}/rest/v1/submissions?assignment_id=eq.${assignmentId}&select=*,students:student_id(id,student_number,profiles:profile_id(first_name,last_name))`, { headers: H });
        const submissions = (await submissionsRes.json());
        if (!submissionsRes.ok)
            throw new error_middleware_1.AppError('Failed to fetch submissions', 500);
        const submissionIds = submissions.map((s) => s.id).join(',');
        let teacherCommentsMap = new Map();
        let studentRepliesMap = new Map();
        if (submissionIds) {
            const commentsRes = await fetch(`${SUPABASE_URL}/rest/v1/teacher_comments?submission_id=in.(${submissionIds})&select=submission_id,comment,created_at,comment_type`, { headers: H });
            const comments = (await commentsRes.json());
            for (const c of comments) {
                if (c.comment_type === 'teacher_feedback') {
                    teacherCommentsMap.set(c.submission_id, {
                        teacher_comment: c.comment,
                        comment_added_at: c.created_at,
                    });
                }
                else if (c.comment_type === 'student_reply') {
                    studentRepliesMap.set(c.submission_id, {
                        student_reply: c.comment,
                        student_reply_at: c.created_at,
                    });
                }
            }
        }
        const formatted = submissions.map((sub) => {
            const studentObj = sub.students;
            const profile = studentObj?.profiles;
            const teacherComment = teacherCommentsMap.get(sub.id);
            const studentReply = studentRepliesMap.get(sub.id);
            return {
                ...sub,
                student: {
                    id: studentObj?.id,
                    student_number: studentObj?.student_number,
                    profile: profile ? { first_name: profile.first_name, last_name: profile.last_name } : null,
                },
                teacher_comment: teacherComment?.teacher_comment || null,
                comment_added_at: teacherComment?.comment_added_at || null,
                student_reply: studentReply?.student_reply || null,
                student_reply_at: studentReply?.student_reply_at || null,
            };
        });
        res.json((0, pagination_1.successResponse)(formatted));
    }
    catch (err) {
        next(err);
    }
});
router.patch('/submissions/:submissionId/grade', async (req, res, next) => {
    try {
        const { submissionId } = req.params;
        const { score, feedback } = req.body;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
        if (score === undefined)
            throw new error_middleware_1.AppError('score est requis', 400);
        const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${submissionId}`, {
            method: 'PATCH',
            headers: H,
            body: JSON.stringify({ score: Number(score), feedback: feedback || null, status: 'graded' })
        });
        const rawText = await resUpdate.text();
        if (!resUpdate.ok) {
            console.error('Supabase update error:', rawText);
            throw new error_middleware_1.AppError(`Failed to grade submission: ${resUpdate.status} - ${rawText}`, 500);
        }
        const dataArr = JSON.parse(rawText);
        const data = dataArr[0];
        res.json((0, pagination_1.successResponse)(data, 'Soumission notée'));
    }
    catch (err) {
        next(err);
    }
});
// ✅ CORRECTION: Route pour les commentaires (sans score)
router.patch('/submissions/:submissionId/comment', async (req, res, next) => {
    try {
        const { submissionId } = req.params;
        const { comment } = req.body;
        if (!comment?.trim()) {
            throw new error_middleware_1.AppError('comment est requis', 400);
        }
        const teacherId = await getTeacherId(req.user.id);
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
        const subRes = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${submissionId}&select=student_id`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const subData = (await subRes.json());
        const submission = subData[0];
        if (!submission) {
            throw new error_middleware_1.AppError('Submission not found', 404);
        }
        const existingRes = await fetch(`${SUPABASE_URL}/rest/v1/teacher_comments?submission_id=eq.${submissionId}&teacher_id=eq.${teacherId}&comment_type=eq.teacher_feedback&select=id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const existing = (await existingRes.json());
        let result;
        if (existing && existing.length > 0) {
            const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/teacher_comments?id=eq.${existing[0].id}`, {
                method: 'PATCH',
                headers: H,
                body: JSON.stringify({
                    comment: comment.trim(),
                    updated_at: new Date().toISOString(),
                })
            });
            const rawText = await updateRes.text();
            if (!updateRes.ok) {
                console.error('Supabase update error:', rawText);
                throw new error_middleware_1.AppError(`Failed to update comment: ${updateRes.status} - ${rawText}`, 500);
            }
            const updateData = JSON.parse(rawText);
            result = updateData[0];
        }
        else {
            const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/teacher_comments`, {
                method: 'POST',
                headers: H,
                body: JSON.stringify({
                    submission_id: submissionId,
                    teacher_id: teacherId,
                    student_id: submission.student_id,
                    comment: comment.trim(),
                    comment_type: 'teacher_feedback',
                    created_at: new Date().toISOString(),
                })
            });
            const rawText = await insertRes.text();
            if (!insertRes.ok) {
                console.error('Supabase insert error:', rawText);
                throw new error_middleware_1.AppError(`Failed to add comment: ${insertRes.status} - ${rawText}`, 500);
            }
            const insertData = JSON.parse(rawText);
            result = insertData[0];
        }
        const studentRes = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${submission.student_id}&select=profile_id`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const studentArr = (await studentRes.json());
        const studentProfileId = studentArr[0]?.profile_id;
        if (studentProfileId) {
            await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient_id: studentProfileId,
                    type: 'comment',
                    title: 'Nouveau commentaire sur votre devoir',
                    body: `Un professeur a commenté votre travail.`,
                    data: { submissionId },
                    created_at: new Date().toISOString(),
                })
            });
        }
        res.json((0, pagination_1.successResponse)(result, existing?.length ? 'Commentaire mis à jour' : 'Commentaire ajouté'));
    }
    catch (err) {
        console.error('Erreur dans /comment:', err);
        next(err);
    }
});
// =============================================================================
// PRÉSENCES (ATTENDANCE)
// =============================================================================
// ✅ IMPORTANT: Route GET /attendance/export-pdf DOIT être AVANT POST /attendance
// =============================================================================
// EXPORT PDF - FEUILLE D'APPEL
// =============================================================================
router.get('/attendance/export-pdf', async (req, res, next) => {
    try {
        const { classId, date } = req.query;
        if (!classId || !date) {
            throw new error_middleware_1.AppError('classId et date sont requis', 400);
        }
        // 1. Récupérer infos classe
        const classRes = await fetch(`${SUPABASE_URL}/rest/v1/classes?id=eq.${classId}&select=name`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const classData = (await classRes.json());
        const className = classData[0]?.name || `Classe ${classId}`;
        // 2. Récupérer les élèves de la classe
        const studentsRes = await fetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${classId}&select=id,student_number,profiles:profile_id(first_name,last_name)`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const students = (await studentsRes.json());
        // 3. Récupérer les présences existantes pour cette date
        const attRes = await fetch(`${SUPABASE_URL}/rest/v1/attendance?class_id=eq.${classId}&date=eq.${date}&select=student_id,status`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const attendances = (await attRes.json());
        const attMap = new Map(attendances.map((a) => [a.student_id, a.status]));
        // 4. Générer le PDF
        const doc = new pdfkit_1.default({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="appel_${className}_${date}.pdf"`);
        doc.pipe(res);
        // En-tête
        doc.fontSize(18).fillColor('#f59e0b').text('Feuille d\'Appel', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(13).fillColor('#1f2937').text(`Classe : ${className}`, { align: 'center' });
        doc.fontSize(11).fillColor('#6b7280').text(`Date : ${new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
        doc.moveDown(0.5);
        // Ligne séparatrice
        doc.strokeColor('#f59e0b').lineWidth(2)
            .moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.8);
        // Légende des statuts
        const statusLabels = {
            present: 'Présent',
            absent: 'Absent',
            late: 'Retard',
        };
        const statusColors = {
            present: '#16a34a',
            absent: '#dc2626',
            late: '#ea580c',
        };
        // Stats en-tête
        const presentCount = [...attMap.values()].filter(v => v === 'present').length;
        const absentCount = [...attMap.values()].filter(v => v === 'absent').length;
        const lateCount = [...attMap.values()].filter(v => v === 'late').length;
        const total = students.length;
        doc.fontSize(10).fillColor('#374151')
            .text(`Total élèves : ${total}   |   Présents : ${presentCount}   |   Absents : ${absentCount}   |   Retards : ${lateCount}`, { align: 'center' });
        doc.moveDown(0.8);
        // En-tête tableau
        const colX = { num: 45, name: 80, status: 400, sign: 480 };
        const rowHeight = 28;
        const startY = doc.y;
        // Header row background
        doc.rect(40, startY, 515, rowHeight).fill('#fef3c7');
        doc.fontSize(10).fillColor('#92400e')
            .text('#', colX.num, startY + 9, { width: 30 })
            .text('Nom Prénom', colX.name, startY + 9, { width: 300 })
            .text('Statut', colX.status, startY + 9, { width: 70 })
            .text('Signature', colX.sign, startY + 9, { width: 70 });
        doc.strokeColor('#d1d5db').lineWidth(0.5)
            .moveTo(40, startY + rowHeight).lineTo(555, startY + rowHeight).stroke();
        // Lignes élèves
        let y = startY + rowHeight;
        students
            .sort((a, b) => {
            const lastA = a.profiles?.last_name || '';
            const lastB = b.profiles?.last_name || '';
            return lastA.localeCompare(lastB, 'fr');
        })
            .forEach((student, index) => {
            // Nouvelle page si nécessaire
            if (y + rowHeight > 800) {
                doc.addPage();
                y = 40;
            }
            const bg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
            doc.rect(40, y, 515, rowHeight).fill(bg);
            const status = attMap.get(student.id) || null;
            const profile = student.profiles;
            const fullName = `${profile?.last_name || ''} ${profile?.first_name || ''}`.trim();
            doc.fontSize(9).fillColor('#374151')
                .text(String(index + 1), colX.num, y + 9, { width: 30 })
                .text(fullName, colX.name, y + 9, { width: 300 })
                .text(student.student_number ? `N°${student.student_number}` : '', colX.name, y + 18, { width: 300 });
            if (status) {
                doc.fontSize(9).fillColor(statusColors[status] || '#374151')
                    .text(statusLabels[status] || status, colX.status, y + 9, { width: 70 });
            }
            else {
                // Case vide pour signature si pas encore rempli
                doc.strokeColor('#d1d5db').lineWidth(0.5)
                    .rect(colX.status, y + 6, 60, 16).stroke();
            }
            // Ligne signature (toujours vide pour signature manuscrite)
            doc.strokeColor('#9ca3af').lineWidth(0.3)
                .moveTo(colX.sign, y + rowHeight - 5)
                .lineTo(colX.sign + 65, y + rowHeight - 5)
                .stroke();
            // Séparateur de ligne
            doc.strokeColor('#e5e7eb').lineWidth(0.3)
                .moveTo(40, y + rowHeight).lineTo(555, y + rowHeight).stroke();
            y += rowHeight;
        });
        // Pied de page
        doc.moveDown(1);
        doc.fontSize(8).fillColor('#9ca3af')
            .text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, { align: 'right' });
        doc.end();
    }
    catch (err) {
        next(err);
    }
});
router.post('/attendance', async (req, res, next) => {
    try {
        const teacherId = await getTeacherId(req.user.id);
        const { records } = req.body;
        const H = {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation',
            'X-Upsert': 'true'
        };
        if (!Array.isArray(records) || records.length === 0) {
            throw new error_middleware_1.AppError('records[] est requis', 400);
        }
        const rows = records.map((r) => ({
            teacher_id: teacherId,
            student_id: r.studentId,
            class_id: r.classId,
            schedule_slot_id: r.scheduleSlotId || null,
            status: r.status,
            date: r.date,
            reason: r.reason || r.note || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }));
        const resUpsert = await fetch(`${SUPABASE_URL}/rest/v1/attendance`, {
            method: 'POST',
            headers: H,
            body: JSON.stringify(rows)
        });
        const rawText = await resUpsert.text();
        if (!resUpsert.ok) {
            console.error('Attendance upsert error:', rawText);
            throw new error_middleware_1.AppError(`Failed to save attendance: ${resUpsert.status} - ${rawText}`, 500);
        }
        const data = JSON.parse(rawText);
        const absents = records.filter((r) => r.status === 'absent');
        for (const absent of absents) {
            const resStudent = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${absent.studentId}&select=id,profile_id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const studentArr = (await resStudent.json());
            const student = studentArr[0];
            if (student) {
                const resParents = await fetch(`${SUPABASE_URL}/rest/v1/parent_student?student_id=eq.${student.id}&select=parents:parent_id(profile_id)`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
                const parentLinks = (await resParents.json());
                const parentProfileIds = (parentLinks || [])
                    .map((pl) => extractFirstItem(pl.parents)?.profile_id)
                    .filter(Boolean);
                if (parentProfileIds.length > 0) {
                    await (0, notifications_1.createBulkNotifications)(parentProfileIds, {
                        type: 'absence',
                        title: 'Absence signalée',
                        body: `Votre enfant a été marqué absent le ${absent.date}.`,
                        data: { studentId: student.id, date: absent.date },
                    });
                }
            }
        }
        res.status(201).json((0, pagination_1.successResponse)(data, 'Présences enregistrées'));
    }
    catch (err) {
        next(err);
    }
});
// =============================================================================
// ANNONCES (ANNOUNCEMENTS)
// =============================================================================
router.get('/announcements', async (req, res, next) => {
    try {
        const { classId } = req.query;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        let url = `${SUPABASE_URL}/rest/v1/announcements?or=(author_id.eq.${req.user.id},target_role.eq.teacher,target_role.is.null)&order=created_at.desc`;
        if (classId)
            url += `&class_id=eq.${classId}`;
        const resData = await fetch(url, { headers: H });
        const data = (await resData.json());
        if (!resData.ok)
            throw new error_middleware_1.AppError('Failed to fetch announcements', 500);
        res.json((0, pagination_1.successResponse)(data || []));
    }
    catch (err) {
        next(err);
    }
});
router.post('/announcements', async (req, res, next) => {
    try {
        const { title, content, classId, targetRole } = req.body;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
        if (!title || !content)
            throw new error_middleware_1.AppError('title et content sont requis', 400);
        const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/announcements`, {
            method: 'POST',
            headers: H,
            body: JSON.stringify({
                author_id: req.user.id,
                title,
                content,
                class_id: classId || null,
                target_role: targetRole || null,
            })
        });
        const rawText = await resInsert.text();
        if (!resInsert.ok) {
            console.error('Supabase insert error:', rawText);
            throw new error_middleware_1.AppError(`Failed to create announcement: ${resInsert.status} - ${rawText}`, 500);
        }
        const dataArr = JSON.parse(rawText);
        const data = dataArr[0];
        if (classId) {
            const studentProfileIds = await (0, notifications_1.getClassStudentProfileIds)(classId);
            if (studentProfileIds.length > 0) {
                await (0, notifications_1.createBulkNotifications)(studentProfileIds, {
                    type: 'announcement',
                    title: `Nouvelle annonce : ${title}`,
                    body: content.substring(0, 100),
                    data: { announcementId: data.id },
                });
            }
        }
        res.status(201).json((0, pagination_1.successResponse)(data, 'Annonce publiée'));
    }
    catch (err) {
        next(err);
    }
});
router.delete('/announcements/:announcementId', async (req, res, next) => {
    try {
        const { announcementId } = req.params;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        const resDelete = await fetch(`${SUPABASE_URL}/rest/v1/announcements?id=eq.${announcementId}&author_id=eq.${req.user.id}`, {
            method: 'DELETE',
            headers: H
        });
        if (!resDelete.ok) {
            const rawText = await resDelete.text();
            throw new error_middleware_1.AppError(`Failed to delete announcement: ${resDelete.status} - ${rawText}`, 500);
        }
        res.json((0, pagination_1.successResponse)(null, 'Annonce supprimée'));
    }
    catch (err) {
        next(err);
    }
});
// =============================================================================
// MESSAGERIE
// =============================================================================
router.get('/messages/conversations', async (req, res, next) => {
    try {
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        const userId = req.user.id;
        const partRes = await fetch(`${SUPABASE_URL}/rest/v1/conversation_participants?profile_id=eq.${userId}&select=conversation_id`, { headers: H });
        const parts = await partRes.json();
        if (!parts?.length)
            return res.json((0, pagination_1.successResponse)([]));
        const convIds = parts.map((p) => p.conversation_id).join(',');
        const convRes = await fetch(`${SUPABASE_URL}/rest/v1/conversations?id=in.(${convIds})&select=id,subject,created_at,created_by&order=created_at.desc`, { headers: H });
        const conversations = await convRes.json();
        const result = await Promise.all((conversations || []).map(async (conv) => {
            const msgRes = await fetch(`${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${conv.id}&select=content,created_at,sender_id&order=created_at.desc&limit=1`, { headers: H });
            const msgs = await msgRes.json();
            return { ...conv, last_message: msgs[0] || null };
        }));
        res.json((0, pagination_1.successResponse)(result));
    }
    catch (err) {
        next(err);
    }
});
router.get('/messages/:userId', async (req, res, next) => {
    try {
        const { userId } = req.params;
        const myId = req.user.id;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        const resData = await fetch(`${SUPABASE_URL}/rest/v1/messages?or=(and(sender_id.eq.${myId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${myId}))&select=*&order=created_at`, { headers: H });
        const data = (await resData.json());
        if (!resData.ok)
            throw new error_middleware_1.AppError('Failed to fetch messages', 500);
        await fetch(`${SUPABASE_URL}/rest/v1/messages?receiver_id=eq.${myId}&sender_id=eq.${userId}&is_read=eq.false`, {
            method: 'PATCH',
            headers: { ...H, 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_read: true })
        }).catch(() => { });
        res.json((0, pagination_1.successResponse)(data || []));
    }
    catch (err) {
        next(err);
    }
});
router.post('/messages', async (req, res, next) => {
    try {
        const { receiverId, content } = req.body;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
        const senderId = req.user.id;
        if (!receiverId || !content)
            throw new error_middleware_1.AppError('receiverId et content sont requis', 400);
        const resMyParts = await fetch(`${SUPABASE_URL}/rest/v1/conversation_participants?profile_id=eq.${senderId}&select=conversation_id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const myParts = (await resMyParts.json());
        const myConvIds = myParts.map((p) => p.conversation_id);
        let conversationId = null;
        if (myConvIds.length > 0) {
            const resOtherParts = await fetch(`${SUPABASE_URL}/rest/v1/conversation_participants?profile_id=eq.${receiverId}&conversation_id=in.(${myConvIds.join(',')})&select=conversation_id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const otherParts = (await resOtherParts.json());
            if (otherParts.length > 0)
                conversationId = otherParts[0].conversation_id;
        }
        if (!conversationId) {
            const resConv = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
                method: 'POST',
                headers: H,
                body: JSON.stringify({ created_by: senderId })
            });
            const convArr = (await resConv.json());
            conversationId = convArr[0]?.id;
            if (!conversationId)
                throw new error_middleware_1.AppError('Failed to create conversation', 500);
            await fetch(`${SUPABASE_URL}/rest/v1/conversation_participants`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify([
                    { conversation_id: conversationId, profile_id: senderId },
                    { conversation_id: conversationId, profile_id: receiverId },
                ])
            });
        }
        const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
            method: 'POST',
            headers: H,
            body: JSON.stringify({
                conversation_id: conversationId,
                sender_id: senderId,
                content,
            })
        });
        const rawText = await resInsert.text();
        if (!resInsert.ok) {
            console.error('Supabase insert error:', rawText);
            throw new error_middleware_1.AppError(`Failed to send message: ${resInsert.status} - ${rawText}`, 500);
        }
        const dataArr = JSON.parse(rawText);
        const data = dataArr[0];
        await (0, notifications_1.createNotification)({
            recipientId: receiverId,
            type: 'message',
            title: 'Nouveau message',
            body: content.substring(0, 100),
            data: { messageId: data.id, senderId },
        });
        res.status(201).json((0, pagination_1.successResponse)(data, 'Message envoyé'));
    }
    catch (err) {
        next(err);
    }
});
// =============================================================================
// PROFIL ENSEIGNANT
// =============================================================================
router.get('/profile', async (req, res, next) => {
    try {
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        const resProfile = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user.id}&select=*`, { headers: H });
        const profileArr = (await resProfile.json());
        const profile = profileArr[0];
        if (!resProfile.ok || !profile)
            throw new error_middleware_1.AppError('Profile not found', 404);
        const resTeacher = await fetch(`${SUPABASE_URL}/rest/v1/teachers?profile_id=eq.${req.user.id}&select=*`, { headers: H });
        const teacherArr = (await resTeacher.json());
        const teacher = teacherArr[0];
        res.json((0, pagination_1.successResponse)({ ...profile, teacherData: teacher || null }));
    }
    catch (err) {
        next(err);
    }
});
router.patch('/profile', async (req, res, next) => {
    try {
        const { firstName, lastName, phone, address, gender, avatarUrl } = req.body;
        const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
        const updates = {};
        if (firstName !== undefined)
            updates.first_name = firstName;
        if (lastName !== undefined)
            updates.last_name = lastName;
        if (phone !== undefined)
            updates.phone = phone;
        if (address !== undefined)
            updates.address = address;
        if (gender !== undefined)
            updates.gender = gender;
        if (avatarUrl !== undefined)
            updates.avatar_url = avatarUrl;
        if (Object.keys(updates).length === 0) {
            throw new error_middleware_1.AppError('Aucune donnée à mettre à jour', 400);
        }
        const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user.id}`, {
            method: 'PATCH',
            headers: H,
            body: JSON.stringify(updates)
        });
        const rawText = await resUpdate.text();
        if (!resUpdate.ok) {
            console.error('Supabase update error:', rawText);
            throw new error_middleware_1.AppError(`Failed to update profile: ${resUpdate.status} - ${rawText}`, 500);
        }
        const dataArr = JSON.parse(rawText);
        const data = dataArr[0];
        res.json((0, pagination_1.successResponse)(data, 'Profil mis à jour'));
    }
    catch (err) {
        next(err);
    }
});
// =============================================================================
// TÉLÉCHARGEMENT DE FICHIERS (travaux à faire, cours, compte-rendus, soumissions)
// =============================================================================
router.get('/download-file', async (req, res, next) => {
    try {
        const { url, name } = req.query;
        if (!url || typeof url !== 'string') {
            throw new error_middleware_1.AppError('URL parameter required', 400);
        }
        // Autoriser les deux buckets : assignments (devoirs/cours) et submissions (travaux élèves)
        const allowedPrefixes = [
            `${SUPABASE_URL}/storage/v1/object/assignments/`,
            `${SUPABASE_URL}/storage/v1/object/submissions/`,
            `${SUPABASE_URL}/storage/v1/object/public/assignments/`,
            `${SUPABASE_URL}/storage/v1/object/public/submissions/`,
        ];
        const isAllowed = allowedPrefixes.some(prefix => url.startsWith(prefix));
        if (!isAllowed) {
            throw new error_middleware_1.AppError('Invalid file URL', 403);
        }
        const response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
            },
        });
        if (!response.ok)
            throw new error_middleware_1.AppError('File not found', 404);
        const buffer = await response.arrayBuffer();
        const fileName = (typeof name === 'string' ? name : null) || url.split('/').pop() || 'file';
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(Buffer.from(buffer));
    }
    catch (err) {
        next(err);
    }
});
// =============================================================================
// QR CODE — PRÉSENCE AUTOMATIQUE
// =============================================================================
const QR_SECRET = process.env.QR_JWT_SECRET || 'qr_fallback_secret_change_me';
/**
 * POST /teacher/attendance/qr-session
 * Génère un token JWT signé valable 5 min pour le scan QR élève.
 * Body: { classId, subjectId?, date }
 */
router.post('/attendance/qr-session', async (req, res, next) => {
    try {
        const jwt = await Promise.resolve().then(() => __importStar(require('jsonwebtoken')));
        const { classId, subjectId, date } = req.body;
        if (!classId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new error_middleware_1.AppError('classId et date (YYYY-MM-DD) sont requis', 400);
        }
        const teacherId = await getTeacherId(req.user.id);
        const expiresIn = 5 * 60; // 5 min
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        const payload = {
            type: 'qr_attendance',
            classId,
            subjectId: subjectId ?? null,
            teacherId,
            date,
        };
        const token = jwt.default.sign(payload, QR_SECRET, { expiresIn });
        res.status(201).json((0, pagination_1.successResponse)({ token, expiresAt }, 'QR session créée — valide 5 minutes'));
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=teacher.routes.js.map