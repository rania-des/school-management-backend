"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const notifications_1 = require("../../utils/notifications");
const storage_1 = require("../../utils/storage");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const assignmentSchema = zod_1.z.object({
    subjectId: zod_1.z.string().uuid(),
    classId: zod_1.z.string().uuid(),
    academicYearId: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().optional(),
    type: zod_1.z.enum(['homework', 'project', 'exam', 'exercise', 'report']),
    dueDate: zod_1.z.string().optional(),
    points: zod_1.z.number().optional(),
});
// GET /assignments
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, pagination_1.getPagination)(req);
        const { classId, subjectId, type } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('assignments')
            .select(`
        *,
        subjects(name, code, color),
        classes(name),
        teachers(profiles(first_name, last_name))
      `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (req.user.role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin
                .from('students').select('class_id').eq('profile_id', req.user.id).single();
            if (student?.class_id)
                query = query.eq('class_id', student.class_id);
        }
        else if (req.user.role === 'teacher') {
            const { data: teacher } = await supabase_1.supabaseAdmin
                .from('teachers').select('id').eq('profile_id', req.user.id).single();
            if (teacher)
                query = query.eq('teacher_id', teacher.id);
        }
        else if (req.user.role === 'parent') {
            const { data: parent } = await supabase_1.supabaseAdmin
                .from('parents').select('id').eq('profile_id', req.user.id).single();
            const { data: children } = await supabase_1.supabaseAdmin
                .from('parent_student').select('students(class_id)').eq('parent_id', parent?.id);
            const classIds = (children || []).map((c) => c.students?.class_id).filter(Boolean);
            if (classIds.length > 0)
                query = query.in('class_id', classIds);
        }
        if (classId)
            query = query.eq('class_id', classId);
        if (subjectId)
            query = query.eq('subject_id', subjectId);
        if (type)
            query = query.eq('type', type);
        const { data, count, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch assignments', 500);
        return res.json((0, pagination_1.paginate)(data || [], count || 0, { page, limit, offset }));
    }
    catch (err) {
        return next(err);
    }
});
// GET /assignments/:id
router.get('/:id', async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('assignments')
            .select(`*, subjects(name), classes(name), teachers(profiles(first_name, last_name))`)
            .eq('id', req.params.id)
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Assignment not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// POST /assignments - teacher creates
router.post('/', (0, auth_middleware_1.authorize)('teacher', 'admin'), upload.single('file'), async (req, res, next) => {
    try {
        const body = assignmentSchema.parse(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
        const { data: teacher } = await supabase_1.supabaseAdmin
            .from('teachers').select('id').eq('profile_id', req.user.id).single();
        let fileUrl;
        if (req.file) {
            fileUrl = await (0, storage_1.uploadFile)(storage_1.STORAGE_BUCKETS.ASSIGNMENTS, req.file, teacher?.id || 'admin');
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('assignments')
            .insert({
            teacher_id: teacher?.id,
            subject_id: body.subjectId,
            class_id: body.classId,
            academic_year_id: body.academicYearId,
            title: body.title,
            description: body.description,
            type: body.type,
            due_date: body.dueDate,
            points: body.points,
            file_url: fileUrl,
        })
            .select()
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Failed to create assignment', 500);
        // Notify all students in the class
        const studentProfileIds = await (0, notifications_1.getClassStudentProfileIds)(body.classId);
        await (0, notifications_1.createBulkNotifications)(studentProfileIds, {
            type: 'assignment',
            title: 'Nouveau devoir',
            body: `${body.title} - à rendre le ${body.dueDate || 'date non définie'}`,
            data: { assignmentId: data.id },
        });
        return res.status(201).json((0, pagination_1.successResponse)(data, 'Assignment created'));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /assignments/:id
router.patch('/:id', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const updates = assignmentSchema.partial().parse(req.body);
        const mapped = {};
        if (updates.title)
            mapped.title = updates.title;
        if (updates.description !== undefined)
            mapped.description = updates.description;
        if (updates.dueDate !== undefined)
            mapped.due_date = updates.dueDate;
        if (updates.points !== undefined)
            mapped.points = updates.points;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('assignments').update(mapped).eq('id', req.params.id).select().single();
        if (error || !data)
            throw new error_middleware_1.AppError('Assignment not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /assignments/:id
router.delete('/:id', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('assignments').select('file_url').eq('id', req.params.id).single();
        if (data?.file_url) {
            await (0, storage_1.deleteFile)(storage_1.STORAGE_BUCKETS.ASSIGNMENTS, data.file_url);
        }
        await supabase_1.supabaseAdmin.from('assignments').delete().eq('id', req.params.id);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// ==================== SUBMISSIONS ====================
// GET /assignments/:id/submissions - teacher sees all; student sees own
router.get('/:id/submissions', async (req, res, next) => {
    try {
        let query = supabase_1.supabaseAdmin
            .from('submissions')
            .select(`*, students(student_number, profiles(first_name, last_name))`)
            .eq('assignment_id', req.params.id);
        if (req.user.role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin
                .from('students').select('id').eq('profile_id', req.user.id).single();
            query = query.eq('student_id', student?.id);
        }
        const { data, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch submissions', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// POST /assignments/:id/submissions - student submits
router.post('/:id/submissions', (0, auth_middleware_1.authorize)('student'), upload.single('file'), async (req, res, next) => {
    try {
        const { data: student } = await supabase_1.supabaseAdmin
            .from('students').select('id').eq('profile_id', req.user.id).single();
        if (!student)
            throw new error_middleware_1.AppError('Student not found', 404);
        let fileUrl;
        if (req.file) {
            fileUrl = await (0, storage_1.uploadFile)(storage_1.STORAGE_BUCKETS.SUBMISSIONS, req.file, student.id);
        }
        const textContent = req.body.textContent;
        // Check if assignment exists and not past due
        const { data: assignment } = await supabase_1.supabaseAdmin
            .from('assignments').select('due_date').eq('id', req.params.id).single();
        const isLate = assignment?.due_date && new Date() > new Date(assignment.due_date);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('submissions')
            .upsert({
            assignment_id: req.params.id,
            student_id: student.id,
            file_url: fileUrl,
            text_content: textContent,
            status: isLate ? 'late' : 'submitted',
            submitted_at: new Date().toISOString(),
        }, { onConflict: 'assignment_id,student_id' })
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to submit assignment', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data, 'Assignment submitted'));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /assignments/:id/submissions/:submissionId/grade - teacher grades
router.patch('/:id/submissions/:submissionId/grade', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { score, feedback } = zod_1.z.object({
            score: zod_1.z.number().min(0).max(20),
            feedback: zod_1.z.string().optional(),
        }).parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('submissions')
            .update({ score, feedback, status: 'graded', graded_at: new Date().toISOString() })
            .eq('id', req.params.submissionId)
            .select('*, students(profile_id)')
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Submission not found', 404);
        // Notify student
        const studentProfileId = data.students?.profile_id;
        if (studentProfileId) {
            await createNotification({
                recipientId: studentProfileId,
                type: 'grade',
                title: 'Devoir noté',
                body: `Votre devoir a été noté : ${score}/20`,
                data: { submissionId: data.id },
            });
        }
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// helper inline for single notification
async function createNotification(params) {
    await supabase_1.supabaseAdmin.from('notifications').insert({
        recipient_id: params.recipientId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data,
    });
}
exports.default = router;
//# sourceMappingURL=assignments.routes.js.map