"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const notifications_1 = require("../../utils/notifications");
const email_1 = require("../../utils/email");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const attendanceSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid(),
    classId: zod_1.z.string().uuid(),
    scheduleSlotId: zod_1.z.string().uuid().optional(),
    date: zod_1.z.string(),
    status: zod_1.z.enum(['present', 'absent', 'late', 'excused']),
    reason: zod_1.z.string().optional(),
});
// GET /attendance
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, pagination_1.getPagination)(req);
        const { studentId, classId, startDate, endDate, status } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('attendance')
            .select(`
        *,
        students(student_number, profiles(first_name, last_name, avatar_url)),
        classes(name),
        schedule_slots(subjects(name), start_time, end_time)
      `, { count: 'exact' })
            .order('date', { ascending: false })
            .range(offset, offset + limit - 1);
        if (req.user.role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin
                .from('students').select('id').eq('profile_id', req.user.id).single();
            query = query.eq('student_id', student?.id);
        }
        else if (req.user.role === 'parent') {
            const { data: parent } = await supabase_1.supabaseAdmin
                .from('parents').select('id').eq('profile_id', req.user.id).single();
            const { data: children } = await supabase_1.supabaseAdmin
                .from('parent_student').select('student_id').eq('parent_id', parent?.id);
            const childIds = (children || []).map((c) => c.student_id);
            if (childIds.length > 0)
                query = query.in('student_id', childIds);
        }
        if (studentId)
            query = query.eq('student_id', studentId);
        if (classId)
            query = query.eq('class_id', classId);
        if (status)
            query = query.eq('status', status);
        if (startDate)
            query = query.gte('date', startDate);
        if (endDate)
            query = query.lte('date', endDate);
        const { data, count, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch attendance', 500);
        return res.json((0, pagination_1.paginate)(data || [], count || 0, { page, limit, offset }));
    }
    catch (err) {
        return next(err);
    }
});
// GET /attendance/stats - summary for student
router.get('/stats', async (req, res, next) => {
    try {
        let studentId = req.query.studentId;
        if (req.user.role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin
                .from('students').select('id').eq('profile_id', req.user.id).single();
            studentId = student?.id;
        }
        if (!studentId)
            throw new error_middleware_1.AppError('studentId required', 400);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('attendance')
            .select('status')
            .eq('student_id', studentId);
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch stats', 500);
        const stats = (data || []).reduce((acc, row) => {
            acc[row.status] = (acc[row.status] || 0) + 1;
            return acc;
        }, {});
        const total = (data || []).length;
        const absenceRate = total > 0 ? (((stats.absent || 0) + (stats.late || 0)) / total * 100).toFixed(1) : '0.0';
        return res.json((0, pagination_1.successResponse)({ stats, total, absenceRate }));
    }
    catch (err) {
        return next(err);
    }
});
// POST /attendance - teacher marks attendance
router.post('/', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const body = attendanceSchema.parse(req.body);
        let teacherId;
        if (req.user.role === 'teacher') {
            const { data: teacher } = await supabase_1.supabaseAdmin
                .from('teachers').select('id').eq('profile_id', req.user.id).single();
            teacherId = teacher?.id;
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('attendance')
            .upsert({
            student_id: body.studentId,
            class_id: body.classId,
            schedule_slot_id: body.scheduleSlotId,
            teacher_id: teacherId,
            date: body.date,
            status: body.status,
            reason: body.reason,
        }, { onConflict: 'student_id,date,schedule_slot_id' })
            .select('*, students(profile_id, profiles(first_name, last_name, email))')
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to record attendance', 500);
        // If absent or late, notify student and parents
        if (body.status === 'absent' || body.status === 'late') {
            const studentData = data.students;
            const studentProfileId = studentData?.profile_id;
            if (studentProfileId) {
                await (0, notifications_1.createNotification)({
                    recipientId: studentProfileId,
                    type: 'absence',
                    title: body.status === 'absent' ? 'Absence enregistrée' : 'Retard enregistré',
                    body: `Vous avez été marqué(e) ${body.status === 'absent' ? 'absent(e)' : 'en retard'} le ${body.date}`,
                    data: { attendanceId: data.id },
                });
                // Notify parents
                const parentProfileIds = await (0, notifications_1.getStudentParentProfileIds)(body.studentId);
                const studentName = `${studentData?.profiles?.first_name} ${studentData?.profiles?.last_name}`;
                for (const parentId of parentProfileIds) {
                    await (0, notifications_1.createNotification)({
                        recipientId: parentId,
                        type: 'absence',
                        title: `Absence de ${studentName}`,
                        body: `${studentName} a été marqué(e) ${body.status === 'absent' ? 'absent(e)' : 'en retard'} le ${body.date}`,
                        data: { attendanceId: data.id, studentId: body.studentId },
                    });
                }
                // Send email to parents
                const { data: parentEmails } = await supabase_1.supabaseAdmin
                    .from('parent_student')
                    .select('parents(profiles(id))')
                    .eq('student_id', body.studentId);
                // Email notification (fire and forget)
                if (studentData?.profiles?.email) {
                    (0, email_1.sendAbsenceNotification)(studentData.profiles.email, studentData.profiles.first_name, studentName, body.date).catch(console.error);
                }
            }
        }
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// POST /attendance/bulk - mark multiple students at once
router.post('/bulk', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { records } = zod_1.z.object({
            records: zod_1.z.array(attendanceSchema),
        }).parse(req.body);
        let teacherId;
        if (req.user.role === 'teacher') {
            const { data: teacher } = await supabase_1.supabaseAdmin
                .from('teachers').select('id').eq('profile_id', req.user.id).single();
            teacherId = teacher?.id;
        }
        const insertData = records.map((r) => ({
            student_id: r.studentId,
            class_id: r.classId,
            schedule_slot_id: r.scheduleSlotId,
            teacher_id: teacherId,
            date: r.date,
            status: r.status,
            reason: r.reason,
        }));
        const { data, error } = await supabase_1.supabaseAdmin
            .from('attendance')
            .upsert(insertData, { onConflict: 'student_id,date,schedule_slot_id' })
            .select();
        if (error)
            throw new error_middleware_1.AppError('Failed to record bulk attendance', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data, `${records.length} records saved`));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /attendance/:id
router.patch('/:id', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const updates = zod_1.z.object({
            status: zod_1.z.enum(['present', 'absent', 'late', 'excused']).optional(),
            reason: zod_1.z.string().optional(),
        }).parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('attendance').update(updates).eq('id', req.params.id).select().single();
        if (error || !data)
            throw new error_middleware_1.AppError('Record not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=attendance.routes.js.map