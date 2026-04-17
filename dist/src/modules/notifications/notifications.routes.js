"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// GET /notifications
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .select('*')
            .eq('recipient_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch notifications', 500);
        return res.json((0, pagination_1.successResponse)(data || []));
    }
    catch (err) {
        return next(err);
    }
});
// GET /notifications/unread-count
router.get('/unread-count', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { count, error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('recipient_id', userId)
            .eq('is_read', false);
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch count', 500);
        return res.json((0, pagination_1.successResponse)({ count: count || 0 }));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /notifications/read-all
router.patch('/read-all', async (req, res, next) => {
    try {
        const userId = req.user.id;
        await supabase_1.supabaseAdmin.from('notifications').update({ is_read: true }).eq('recipient_id', userId).eq('is_read', false);
        return res.json((0, pagination_1.successResponse)(null, 'All marked as read'));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /notifications/:id/read
router.patch('/:id/read', async (req, res, next) => {
    try {
        const userId = req.user.id;
        await supabase_1.supabaseAdmin.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('recipient_id', userId);
        return res.json((0, pagination_1.successResponse)(null));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /notifications/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const userId = req.user.id;
        await supabase_1.supabaseAdmin.from('notifications').delete().eq('id', req.params.id).eq('recipient_id', userId);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=notifications.routes.js.map