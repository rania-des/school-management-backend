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
const meetingSchema = zod_1.z.object({
    teacherId: zod_1.z.string().uuid(),
    parentId: zod_1.z.string().uuid(),
    studentId: zod_1.z.string().uuid(),
    scheduledAt: zod_1.z.string().optional(),
    durationMinutes: zod_1.z.number().default(30),
    location: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
// GET /meetings
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, pagination_1.getPagination)(req);
        const { status } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('meetings')
            .select(`
        *,
        teachers(profiles(first_name, last_name, avatar_url)),
        parents(profiles(first_name, last_name, avatar_url)),
        students(student_number, profiles(first_name, last_name))
      `, { count: 'exact' })
            .order('scheduled_at', { ascending: true })
            .range(offset, offset + limit - 1);
        if (req.user.role === 'teacher') {
            const { data: teacher } = await supabase_1.supabaseAdmin
                .from('teachers').select('id').eq('profile_id', req.user.id).single();
            query = query.eq('teacher_id', teacher?.id);
        }
        else if (req.user.role === 'parent') {
            const { data: parent } = await supabase_1.supabaseAdmin
                .from('parents').select('id').eq('profile_id', req.user.id).single();
            query = query.eq('parent_id', parent?.id);
        }
        if (status)
            query = query.eq('status', status);
        const { data, count, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch meetings', 500);
        return res.json((0, pagination_1.paginate)(data || [], count || 0, { page, limit, offset }));
    }
    catch (err) {
        return next(err);
    }
});
// POST /meetings - parent or teacher requests a meeting
router.post('/', (0, auth_middleware_1.authorize)('parent', 'teacher', 'admin'), async (req, res, next) => {
    try {
        const body = meetingSchema.parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('meetings')
            .insert({
            teacher_id: body.teacherId,
            parent_id: body.parentId,
            student_id: body.studentId,
            requested_by: req.user.id,
            scheduled_at: body.scheduledAt,
            duration_minutes: body.durationMinutes,
            location: body.location,
            notes: body.notes,
            status: 'requested',
        })
            .select(`
        *,
        teachers(profiles(id, first_name, last_name, email)),
        parents(profiles(id, first_name, last_name, email))
      `)
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Failed to create meeting request', 500);
        // Notify the other party
        const teacherProfileId = data.teachers?.profiles?.id;
        const parentProfileId = data.parents?.profiles?.id;
        const requesterIsParent = req.user.role === 'parent';
        const notifyId = requesterIsParent ? teacherProfileId : parentProfileId;
        if (notifyId) {
            await (0, notifications_1.createNotification)({
                recipientId: notifyId,
                type: 'meeting',
                title: 'Demande de réunion',
                body: `Une réunion a été demandée${body.scheduledAt ? ` pour le ${new Date(body.scheduledAt).toLocaleDateString('fr-FR')}` : ''}`,
                data: { meetingId: data.id },
            });
        }
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /meetings/:id/confirm - teacher confirms
router.patch('/:id/confirm', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { scheduledAt, location } = zod_1.z.object({
            scheduledAt: zod_1.z.string(),
            location: zod_1.z.string().optional(),
        }).parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('meetings')
            .update({ status: 'confirmed', scheduled_at: scheduledAt, location })
            .eq('id', req.params.id)
            .select(`
        *,
        teachers(profiles(first_name, last_name)),
        parents(profiles(id, first_name, last_name, email))
      `)
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Meeting not found', 404);
        // Notify parent
        const parentData = data.parents?.profiles;
        if (parentData?.id) {
            await (0, notifications_1.createNotification)({
                recipientId: parentData.id,
                type: 'meeting',
                title: 'Réunion confirmée',
                body: `Votre réunion est confirmée pour le ${new Date(scheduledAt).toLocaleDateString('fr-FR')}`,
                data: { meetingId: data.id },
            });
            // Email notification
            const teacherName = `${data.teachers?.profiles?.first_name} ${data.teachers?.profiles?.last_name}`;
            if (parentData.email) {
                (0, email_1.sendMeetingNotification)(parentData.email, parentData.first_name, new Date(scheduledAt).toLocaleDateString('fr-FR'), teacherName).catch(console.error);
            }
        }
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /meetings/:id/cancel
router.patch('/:id/cancel', async (req, res, next) => {
    try {
        const { reason } = zod_1.z.object({ reason: zod_1.z.string().optional() }).parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('meetings')
            .update({ status: 'cancelled', cancellation_reason: reason })
            .eq('id', req.params.id)
            .select('*, teachers(profiles(id)), parents(profiles(id))')
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Meeting not found', 404);
        // Notify the other party
        const teacherProfileId = data.teachers?.profiles?.id;
        const parentProfileId = data.parents?.profiles?.id;
        const notifyId = req.user.role === 'parent' ? teacherProfileId : parentProfileId;
        if (notifyId) {
            await (0, notifications_1.createNotification)({
                recipientId: notifyId,
                type: 'meeting',
                title: 'Réunion annulée',
                body: reason || 'La réunion a été annulée',
                data: { meetingId: data.id },
            });
        }
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /meetings/:id/complete
router.patch('/:id/complete', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('meetings')
            .update({ status: 'completed' })
            .eq('id', req.params.id)
            .select()
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Meeting not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=meetings.routes.js.map