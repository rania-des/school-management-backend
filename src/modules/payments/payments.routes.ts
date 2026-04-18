import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const H = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  return { data: await res.json(), ok: res.ok };
}
async function sbPost(path: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any[];
  return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
}
async function sbPatch(path: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any[];
  return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
}
async function sbDelete(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'DELETE', headers: H });
  return { ok: res.ok };
}

const paymentSchema = z.object({
  studentId: z.string().uuid(),
  type: z.enum(['tuition', 'canteen', 'trip', 'activity', 'other']),
  amount: z.number().positive(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  academicYearId: z.string().uuid().optional(),
});

// GET /payments
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status, type } = req.query;

    let url = `payments?select=*&order=created_at.desc&offset=${offset}&limit=${limit}`;

    if (req.user!.role === 'student') {
      const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=id`);
      const sid = Array.isArray(students) ? students[0]?.id : null;
      if (sid) url += `&student_id=eq.${sid}`;
      else return res.json(paginate([], 0, { page, limit, offset }));
    } else if (req.user!.role === 'parent') {
      const { data: parents } = await sbGet(`parents?profile_id=eq.${req.user!.id}&select=id`);
      const parentId = Array.isArray(parents) ? parents[0]?.id : null;
      if (parentId) {
        const { data: links } = await sbGet(`parent_student?parent_id=eq.${parentId}&select=student_id`);
        const childIds = (Array.isArray(links) ? links : []).map((c: any) => c.student_id).filter(Boolean);
        if (childIds.length > 0) url += `&student_id=in.(${childIds.join(',')})`;
        else return res.json(paginate([], 0, { page, limit, offset }));
      }
    }

    if (status) url += `&status=eq.${status}`;
    if (type) url += `&type=eq.${type}`;

    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];
    return res.json(paginate(arr, arr.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// GET /payments/stats
router.get('/stats', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { academicYearId } = req.query;
    let url = `payments?select=amount,status,type`;
    if (academicYearId) url += `&academic_year_id=eq.${academicYearId}`;
    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];
    const stats = { total: 0, paid: 0, pending: 0, overdue: 0, byType: {} as Record<string, number> };
    arr.forEach((p: any) => {
      const amt = parseFloat(p.amount) || 0;
      stats.total += amt;
      if (p.status === 'paid') stats.paid += amt;
      if (p.status === 'pending') stats.pending += amt;
      if (p.status === 'overdue') stats.overdue += amt;
      stats.byType[p.type] = (stats.byType[p.type] || 0) + amt;
    });
    return res.json(successResponse(stats));
  } catch (err) { return next(err); }
});

// POST /payments
router.post('/', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
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
    if (!ok || !data) throw new AppError('Failed to create payment', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /payments/:id/mark-paid
router.patch('/:id/mark-paid', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, ok } = await sbPatch(`payments?id=eq.${req.params.id}`, {
      status: 'paid',
      paid_at: new Date().toISOString(),
    });
    if (!ok || !data) throw new AppError('Payment not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /payments/:id/status
router.patch('/:id/status', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({
      status: z.enum(['pending', 'paid', 'overdue', 'cancelled']),
    }).parse(req.body);
    const { data, ok } = await sbPatch(`payments?id=eq.${req.params.id}`, { status });
    if (!ok || !data) throw new AppError('Payment not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// DELETE /payments/:id
router.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbDelete(`payments?id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;