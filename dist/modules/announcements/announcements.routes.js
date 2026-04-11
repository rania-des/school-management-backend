"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const notifications_1 = require("../../utils/notifications");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const announcementSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid().optional().nullable(),
    title: zod_1.z.string().min(1).max(255),
    content: zod_1.z.string().min(1),
    isPinned: zod_1.z.boolean().default(false),
    expiresAt: zod_1.z.string().optional(),
});
// GET /announcements
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, pagination_1.getPagination)(req);
        const { classId, pinned } = req.query;
        const now = new Date().toISOString();
        const role = req.user.role;
        let query = supabase_1.supabaseAdmin
            .from('announcements')
            .select(`*, users(first_name, last_name, role), classes(name)`, { count: 'exact' })
            .order('is_pinned', { ascending: false })
            .order('published_at', { ascending: false })
            .range(offset, offset + limit - 1);
        // ✅ Filtre expiration
        query = query.or(`expires_at.is.null,expires_at.gt.${now}`);
        // ✅ Filtre par rôle
        if (role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin
                .from('students').select('class_id').eq('profile_id', req.user.id).maybeSingle();
            if (student?.class_id) {
                query = query.or(`class_id.is.null,class_id.eq.${student.class_id}`);
            }
            else {
                query = query.is('class_id', null);
            }
        }
        else if (role === 'parent') {
            const { data: parent } = await supabase_1.supabaseAdmin
                .from('parents').select('id').eq('profile_id', req.user.id).maybeSingle();
            const { data: children } = await supabase_1.supabaseAdmin
                .from('parent_student').select('students(class_id)').eq('parent_id', parent?.id || '');
            const classIds = (children || []).map((c) => c.students?.class_id).filter(Boolean);
            if (classIds.length > 0) {
                query = query.or(`class_id.is.null,class_id.in.(${classIds.join(',')})`);
            }
            else {
                query = query.is('class_id', null);
            }
        }
        if (classId === 'null') {
            query = query.is('class_id', null);
        }
        else if (classId) {
            query = query.eq('class_id', classId);
        }
        if (pinned === 'true')
            query = query.eq('is_pinned', true);
        const { data, count, error } = await query;
        console.log('announcements:', { role, count, error: error?.message });
        if (error)
            throw new error_middleware_1.AppError(`Failed to fetch announcements: ${error.message}`, 500);
        return res.json((0, pagination_1.paginate)(data || [], count || 0, { page, limit, offset }));
    }
    catch (err) {
        return next(err);
    }
});
// POST /announcements
router.post('/', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const body = announcementSchema.parse(req.body);
        if (req.user.role === 'teacher' && !body.classId) {
            throw new error_middleware_1.AppError('Teachers must specify a classId', 400);
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('announcements')
            .insert({
            author_id: req.user.id,
            class_id: body.classId || null,
            title: body.title,
            content: body.content,
            is_pinned: body.isPinned,
            expires_at: body.expiresAt || null,
            published_at: new Date().toISOString(),
        })
            .select()
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError(`Failed to create announcement: ${error?.message}`, 500);
        if (body.classId) {
            const profileIds = await (0, notifications_1.getClassStudentProfileIds)(body.classId);
            await (0, notifications_1.createBulkNotifications)(profileIds, {
                type: 'announcement',
                title: body.title,
                body: body.content.substring(0, 100),
                data: { announcementId: data.id },
            });
        }
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /announcements/:id
router.patch('/:id', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const updates = announcementSchema.partial().parse(req.body);
        const mapped = {};
        if (updates.title)
            mapped.title = updates.title;
        if (updates.content)
            mapped.content = updates.content;
        if (updates.isPinned !== undefined)
            mapped.is_pinned = updates.isPinned;
        if (updates.expiresAt !== undefined)
            mapped.expires_at = updates.expiresAt;
        let query = supabase_1.supabaseAdmin.from('announcements').update(mapped).eq('id', req.params.id);
        if (req.user.role === 'teacher')
            query = query.eq('author_id', req.user.id);
        const { data, error } = await query.select().single();
        if (error || !data)
            throw new error_middleware_1.AppError('Announcement not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /announcements/:id
router.delete('/:id', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        let query = supabase_1.supabaseAdmin.from('announcements').delete().eq('id', req.params.id);
        if (req.user.role === 'teacher')
            query = query.eq('author_id', req.user.id);
        await query;
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=announcements.routes.js.map