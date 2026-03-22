"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const slotSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid(),
    subjectId: zod_1.z.string().uuid(),
    teacherId: zod_1.z.string().uuid(),
    academicYearId: zod_1.z.string().uuid(),
    dayOfWeek: zod_1.z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
    startTime: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
    endTime: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
    room: zod_1.z.string().optional(),
});
// GET /schedule - get schedule for current user's class
router.get('/', async (req, res, next) => {
    try {
        let classId = req.query.classId;
        const { academicYearId } = req.query;
        // Resolve classId based on role
        if (!classId) {
            if (req.user.role === 'student') {
                const { data } = await supabase_1.supabaseAdmin
                    .from('students').select('class_id').eq('profile_id', req.user.id).single();
                classId = data?.class_id;
            }
            else if (req.user.role === 'parent') {
                const { data: parent } = await supabase_1.supabaseAdmin
                    .from('parents').select('id').eq('profile_id', req.user.id).single();
                const { data: children } = await supabase_1.supabaseAdmin
                    .from('parent_student')
                    .select('students(class_id)')
                    .eq('parent_id', parent?.id)
                    .limit(1)
                    .single();
                classId = children?.students?.class_id;
            }
        }
        if (!classId)
            throw new error_middleware_1.AppError('classId is required', 400);
        let query = supabase_1.supabaseAdmin
            .from('schedule_slots')
            .select(`
        *,
        subjects(name, code, color),
        teachers(profiles(first_name, last_name)),
        classes(name)
      `)
            .eq('class_id', classId)
            .eq('is_active', true)
            .order('day_of_week')
            .order('start_time');
        if (academicYearId)
            query = query.eq('academic_year_id', academicYearId);
        const { data, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch schedule', 500);
        // Group by day
        const grouped = {};
        (data || []).forEach((slot) => {
            if (!grouped[slot.day_of_week])
                grouped[slot.day_of_week] = [];
            grouped[slot.day_of_week].push(slot);
        });
        return res.json((0, pagination_1.successResponse)({ schedule: grouped, slots: data }));
    }
    catch (err) {
        return next(err);
    }
});
// GET /schedule/teacher - teacher's own schedule
router.get('/teacher', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { academicYearId } = req.query;
        let teacherId;
        if (req.user.role === 'teacher') {
            const { data } = await supabase_1.supabaseAdmin
                .from('teachers').select('id').eq('profile_id', req.user.id).single();
            if (!data)
                throw new error_middleware_1.AppError('Teacher not found', 404);
            teacherId = data.id;
        }
        else {
            teacherId = req.query.teacherId;
            if (!teacherId)
                throw new error_middleware_1.AppError('teacherId required', 400);
        }
        let query = supabase_1.supabaseAdmin
            .from('schedule_slots')
            .select('*, subjects(name, color), classes(name)')
            .eq('teacher_id', teacherId)
            .eq('is_active', true)
            .order('day_of_week')
            .order('start_time');
        if (academicYearId)
            query = query.eq('academic_year_id', academicYearId);
        const { data, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch teacher schedule', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// POST /schedule - admin creates a slot
router.post('/', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const body = slotSchema.parse(req.body);
        // Check for conflicts
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('schedule_slots')
            .select('id')
            .eq('class_id', body.classId)
            .eq('day_of_week', body.dayOfWeek)
            .eq('is_active', true)
            .or(`start_time.lte.${body.endTime},end_time.gte.${body.startTime}`);
        if (existing && existing.length > 0) {
            throw new error_middleware_1.AppError('Schedule conflict detected for this class', 409);
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('schedule_slots')
            .insert({
            class_id: body.classId,
            subject_id: body.subjectId,
            teacher_id: body.teacherId,
            academic_year_id: body.academicYearId,
            day_of_week: body.dayOfWeek,
            start_time: body.startTime,
            end_time: body.endTime,
            room: body.room,
        })
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to create schedule slot', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /schedule/:id
router.patch('/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const updates = slotSchema.partial().parse(req.body);
        const mapped = {};
        if (updates.dayOfWeek)
            mapped.day_of_week = updates.dayOfWeek;
        if (updates.startTime)
            mapped.start_time = updates.startTime;
        if (updates.endTime)
            mapped.end_time = updates.endTime;
        if (updates.room !== undefined)
            mapped.room = updates.room;
        if (updates.teacherId)
            mapped.teacher_id = updates.teacherId;
        if (updates.subjectId)
            mapped.subject_id = updates.subjectId;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('schedule_slots').update(mapped).eq('id', req.params.id).select().single();
        if (error || !data)
            throw new error_middleware_1.AppError('Slot not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /schedule/:id
router.delete('/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        await supabase_1.supabaseAdmin.from('schedule_slots').update({ is_active: false }).eq('id', req.params.id);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=schedule.routes.js.map