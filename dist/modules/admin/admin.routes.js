"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'));
// ==================== CLASSES ====================
const classSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    levelId: zod_1.z.string().uuid().optional(),
    academicYearId: zod_1.z.string().uuid(),
    capacity: zod_1.z.number().default(30),
    room: zod_1.z.string().optional(),
});
router.get('/classes', async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, pagination_1.getPagination)(req);
        const { academicYearId, levelId } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('classes')
            .select(`*, levels(name), academic_years(name)`, { count: 'exact' })
            .order('name')
            .range(offset, offset + limit - 1);
        if (academicYearId)
            query = query.eq('academic_year_id', academicYearId);
        if (levelId)
            query = query.eq('level_id', levelId);
        const { data, count, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch classes', 500);
        return res.json((0, pagination_1.paginate)(data || [], count || 0, { page, limit, offset }));
    }
    catch (err) {
        return next(err);
    }
});
router.post('/classes', async (req, res, next) => {
    try {
        const body = classSchema.parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('classes')
            .insert({ name: body.name, level_id: body.levelId, academic_year_id: body.academicYearId, capacity: body.capacity, room: body.room })
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to create class', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
router.patch('/classes/:id', async (req, res, next) => {
    try {
        const updates = classSchema.partial().parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('classes').update(updates).eq('id', req.params.id).select().single();
        if (error || !data)
            throw new error_middleware_1.AppError('Class not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
router.delete('/classes/:id', async (req, res, next) => {
    try {
        await supabase_1.supabaseAdmin.from('classes').delete().eq('id', req.params.id);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// ==================== SUBJECTS ====================
const subjectSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    code: zod_1.z.string().optional(),
    coefficient: zod_1.z.number().positive().default(1),
    color: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
    description: zod_1.z.string().optional(),
});
router.get('/subjects', async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin.from('subjects').select('*').order('name');
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch subjects', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
router.post('/subjects', async (req, res, next) => {
    try {
        const body = subjectSchema.parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin.from('subjects').insert(body).select().single();
        if (error)
            throw new error_middleware_1.AppError('Failed to create subject', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
router.patch('/subjects/:id', async (req, res, next) => {
    try {
        const updates = subjectSchema.partial().parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('subjects').update(updates).eq('id', req.params.id).select().single();
        if (error || !data)
            throw new error_middleware_1.AppError('Subject not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
router.delete('/subjects/:id', async (req, res, next) => {
    try {
        await supabase_1.supabaseAdmin.from('subjects').delete().eq('id', req.params.id);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// ==================== TEACHER ASSIGNMENTS ====================
router.get('/teacher-assignments', async (req, res, next) => {
    try {
        const { classId, teacherId, academicYearId } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('teacher_assignments')
            .select(`*, teachers(profiles(first_name, last_name)), subjects(name), classes(name)`);
        if (classId)
            query = query.eq('class_id', classId);
        if (teacherId)
            query = query.eq('teacher_id', teacherId);
        if (academicYearId)
            query = query.eq('academic_year_id', academicYearId);
        const { data, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch assignments', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
router.post('/teacher-assignments', async (req, res, next) => {
    try {
        const body = zod_1.z.object({
            teacherId: zod_1.z.string().uuid(),
            subjectId: zod_1.z.string().uuid(),
            classId: zod_1.z.string().uuid(),
            academicYearId: zod_1.z.string().uuid(),
            isMainTeacher: zod_1.z.boolean().default(false),
        }).parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('teacher_assignments')
            .insert({
            teacher_id: body.teacherId,
            subject_id: body.subjectId,
            class_id: body.classId,
            academic_year_id: body.academicYearId,
            is_main_teacher: body.isMainTeacher,
        })
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to assign teacher', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
router.delete('/teacher-assignments/:id', async (req, res, next) => {
    try {
        await supabase_1.supabaseAdmin.from('teacher_assignments').delete().eq('id', req.params.id);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// ==================== PARENT-STUDENT LINKS ====================
router.post('/parent-student', async (req, res, next) => {
    try {
        const body = zod_1.z.object({
            parentId: zod_1.z.string().uuid(),
            studentId: zod_1.z.string().uuid(),
            relationship: zod_1.z.string().default('parent'),
            isPrimary: zod_1.z.boolean().default(false),
        }).parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('parent_student')
            .insert({
            parent_id: body.parentId,
            student_id: body.studentId,
            relationship: body.relationship,
            is_primary: body.isPrimary,
        })
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to link parent and student', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
router.delete('/parent-student/:id', async (req, res, next) => {
    try {
        await supabase_1.supabaseAdmin.from('parent_student').delete().eq('id', req.params.id);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// ==================== ACADEMIC YEARS ====================
router.get('/academic-years', async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin.from('academic_years').select('*').order('start_date', { ascending: false });
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch years', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
router.post('/academic-years', async (req, res, next) => {
    try {
        const body = zod_1.z.object({
            name: zod_1.z.string(),
            startDate: zod_1.z.string(),
            endDate: zod_1.z.string(),
            isCurrent: zod_1.z.boolean().default(false),
        }).parse(req.body);
        // If setting as current, unset others first
        if (body.isCurrent) {
            await supabase_1.supabaseAdmin.from('academic_years').update({ is_current: false }).eq('is_current', true);
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('academic_years')
            .insert({ name: body.name, start_date: body.startDate, end_date: body.endDate, is_current: body.isCurrent })
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to create academic year', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// ==================== ESTABLISHMENT ====================
router.get('/establishment', async (req, res, next) => {
    try {
        const { data } = await supabase_1.supabaseAdmin.from('establishments').select('*').limit(1).single();
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
router.patch('/establishment', async (req, res, next) => {
    try {
        const body = zod_1.z.object({
            name: zod_1.z.string().optional(),
            address: zod_1.z.string().optional(),
            phone: zod_1.z.string().optional(),
            email: zod_1.z.string().email().optional(),
            website: zod_1.z.string().optional(),
        }).parse(req.body);
        const { data: existing } = await supabase_1.supabaseAdmin.from('establishments').select('id').limit(1).single();
        const { data, error } = await supabase_1.supabaseAdmin
            .from('establishments').update(body).eq('id', existing?.id).select().single();
        if (error)
            throw new error_middleware_1.AppError('Failed to update establishment', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// ==================== STUDENT ENROLLMENT IN CLASS ====================
router.patch('/students/:studentId/enroll', async (req, res, next) => {
    try {
        const { classId } = zod_1.z.object({ classId: zod_1.z.string().uuid() }).parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('students')
            .update({ class_id: classId })
            .eq('id', req.params.studentId)
            .select()
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Student not found', 404);
        return res.json((0, pagination_1.successResponse)(data, 'Student enrolled in class'));
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=admin.routes.js.map