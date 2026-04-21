"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const H = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
};
async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
    return { data: await res.json(), ok: res.ok };
}
async function sbPost(path, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
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
async function sbDelete(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'DELETE', headers: H });
    return { ok: res.ok };
}
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
        let url = `payments?select=*&order=created_at.desc&offset=${offset}&limit=${limit}`;
        if (req.user.role === 'student') {
            const { data: students } = await sbGet(`students?profile_id=eq.${req.user.id}&select=id`);
            const sid = Array.isArray(students) ? students[0]?.id : null;
            if (sid)
                url += `&student_id=eq.${sid}`;
            else
                return res.json((0, pagination_1.paginate)([], 0, { page, limit, offset }));
        }
        else if (req.user.role === 'parent') {
            const { data: parents } = await sbGet(`parents?profile_id=eq.${req.user.id}&select=id`);
            const parentId = Array.isArray(parents) ? parents[0]?.id : null;
            if (parentId) {
                const { data: links } = await sbGet(`parent_student?parent_id=eq.${parentId}&select=student_id`);
                const childIds = (Array.isArray(links) ? links : []).map((c) => c.student_id).filter(Boolean);
                if (childIds.length > 0)
                    url += `&student_id=in.(${childIds.join(',')})`;
                else
                    return res.json((0, pagination_1.paginate)([], 0, { page, limit, offset }));
            }
        }
        if (status)
            url += `&status=eq.${status}`;
        if (type)
            url += `&type=eq.${type}`;
        const { data } = await sbGet(url);
        const arr = Array.isArray(data) ? data : [];
        return res.json((0, pagination_1.paginate)(arr, arr.length, { page, limit, offset }));
    }
    catch (err) {
        return next(err);
    }
});
// GET /payments/stats
router.get('/stats', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { academicYearId } = req.query;
        let url = `payments?select=amount,status,type`;
        if (academicYearId)
            url += `&academic_year_id=eq.${academicYearId}`;
        const { data } = await sbGet(url);
        const arr = Array.isArray(data) ? data : [];
        const stats = { total: 0, paid: 0, pending: 0, overdue: 0, byType: {} };
        arr.forEach((p) => {
            const amt = parseFloat(p.amount) || 0;
            stats.total += amt;
            if (p.status === 'paid')
                stats.paid += amt;
            if (p.status === 'pending')
                stats.pending += amt;
            if (p.status === 'overdue')
                stats.overdue += amt;
            stats.byType[p.type] = (stats.byType[p.type] || 0) + amt;
        });
        return res.json((0, pagination_1.successResponse)(stats));
    }
    catch (err) {
        return next(err);
    }
});
// POST /payments
router.post('/', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const body = paymentSchema.parse(req.body);
        const { data, ok } = await sbPost('payments', {
            student_id: body.studentId,
            type: body.type,
            amount: body.amount,
            description: body.description || null,
            due_date: body.dueDate || null,
            academic_year_id: body.academicYearId || null,
            status: 'pending',
        });
        if (!ok || !data)
            throw new error_middleware_1.AppError('Failed to create payment', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /payments/:id/mark-paid
router.patch('/:id/mark-paid', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data, ok } = await sbPatch(`payments?id=eq.${req.params.id}`, {
            status: 'paid',
            paid_at: new Date().toISOString(),
        });
        if (!ok || !data)
            throw new error_middleware_1.AppError('Payment not found', 404);
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
        const { data, ok } = await sbPatch(`payments?id=eq.${req.params.id}`, { status });
        if (!ok || !data)
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
        await sbDelete(`payments?id=eq.${req.params.id}`);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=payments.routes.js.map