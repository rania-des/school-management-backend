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
const multer_1 = __importDefault(require("multer"));
const storage_1 = require("../../utils/storage");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const paymentSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid(),
    type: zod_1.z.enum(['tuition', 'canteen', 'trip', 'activity', 'other']),
    amount: zod_1.z.number().positive(),
    description: zod_1.z.string().optional(),
    dueDate: zod_1.z.string().optional(),
    academicYearId: zod_1.z.string().uuid().optional(),
});
// GET /payments
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, pagination_1.getPagination)(req);
        const { status, type } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('payments')
            .select(`
        *,
        students(student_number, profiles(first_name, last_name))
      `, { count: 'exact' })
            .order('created_at', { ascending: false })
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
        if (status)
            query = query.eq('status', status);
        if (type)
            query = query.eq('type', type);
        const { data, count, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch payments', 500);
        return res.json((0, pagination_1.paginate)(data || [], count || 0, { page, limit, offset }));
    }
    catch (err) {
        return next(err);
    }
});
// GET /payments/stats - financial summary
router.get('/stats', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { academicYearId } = req.query;
        let query = supabase_1.supabaseAdmin.from('payments').select('amount, status, type');
        if (academicYearId)
            query = query.eq('academic_year_id', academicYearId);
        const { data, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch stats', 500);
        const stats = {
            total: 0,
            paid: 0,
            pending: 0,
            overdue: 0,
            byType: {},
        };
        (data || []).forEach((p) => {
            stats.total += parseFloat(p.amount);
            if (p.status === 'paid')
                stats.paid += parseFloat(p.amount);
            if (p.status === 'pending')
                stats.pending += parseFloat(p.amount);
            if (p.status === 'overdue')
                stats.overdue += parseFloat(p.amount);
            stats.byType[p.type] = (stats.byType[p.type] || 0) + parseFloat(p.amount);
        });
        return res.json((0, pagination_1.successResponse)(stats));
    }
    catch (err) {
        return next(err);
    }
});
// POST /payments - admin creates
router.post('/', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const body = paymentSchema.parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('payments')
            .insert({
            student_id: body.studentId,
            type: body.type,
            amount: body.amount,
            description: body.description,
            due_date: body.dueDate,
            academic_year_id: body.academicYearId,
            status: 'pending',
        })
            .select('*, students(profile_id)')
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Failed to create payment', 500);
        // Notify student and parents
        const studentProfileId = data.students?.profile_id;
        if (studentProfileId) {
            await (0, notifications_1.createNotification)({
                recipientId: studentProfileId,
                type: 'payment',
                title: 'Nouveau paiement',
                body: `${body.description || body.type}: ${body.amount} TND${body.dueDate ? ` - Échéance: ${body.dueDate}` : ''}`,
                data: { paymentId: data.id },
            });
        }
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /payments/:id/mark-paid - admin marks as paid + uploads receipt
router.patch('/:id/mark-paid', (0, auth_middleware_1.authorize)('admin'), upload.single('receipt'), async (req, res, next) => {
    try {
        let receiptUrl;
        if (req.file) {
            receiptUrl = await (0, storage_1.uploadFile)(storage_1.STORAGE_BUCKETS.RECEIPTS, req.file, req.params.id);
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('payments')
            .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            receipt_url: receiptUrl,
        })
            .eq('id', req.params.id)
            .select('*, students(profile_id)')
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Payment not found', 404);
        // Notify student
        const studentProfileId = data.students?.profile_id;
        if (studentProfileId) {
            await (0, notifications_1.createNotification)({
                recipientId: studentProfileId,
                type: 'payment',
                title: 'Paiement confirmé',
                body: 'Votre paiement a été confirmé. Le reçu est disponible.',
                data: { paymentId: data.id, receiptUrl },
            });
        }
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /payments/:id/status
router.patch('/:id/status', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { status } = zod_1.z.object({
            status: zod_1.z.enum(['pending', 'paid', 'overdue', 'cancelled']),
        }).parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('payments').update({ status }).eq('id', req.params.id).select().single();
        if (error || !data)
            throw new error_middleware_1.AppError('Payment not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /payments/:id
router.delete('/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        await supabase_1.supabaseAdmin.from('payments').delete().eq('id', req.params.id);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=payments.routes.js.map