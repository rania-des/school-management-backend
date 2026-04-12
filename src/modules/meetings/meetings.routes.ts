import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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

const meetingSchema = z.object({
  teacherId: z.string().uuid(),
  parentId: z.string().uuid(),
  studentId: z.string().uuid(),
  scheduledAt: z.string().optional(),
  durationMinutes: z.number().default(30),
  location: z.string().optional(),
  notes: z.string().optional(),
});

// GET /meetings
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status } = req.query;

    let url = `meetings?select=*&order=scheduled_at.asc&offset=${offset}&limit=${limit}`;

    if (req.user!.role === 'teacher') {
      const { data: teachers } = await sbGet(`teachers?profile_id=eq.${req.user!.id}&select=id`);
      const teacherId = Array.isArray(teachers) && teachers[0]?.id;
      if (teacherId) url += `&teacher_id=eq.${teacherId}`;
    } else if (req.user!.role === 'parent') {
      const { data: parents } = await sbGet(`parents?profile_id=eq.${req.user!.id}&select=id`);
      const parentId = Array.isArray(parents) && parents[0]?.id;
      if (parentId) url += `&parent_id=eq.${parentId}`;
    }

    if (status) url += `&status=eq.${status}`;

    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];

    return res.json(paginate(arr, arr.length, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

// POST /meetings
router.post('/', authorize('parent', 'teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = meetingSchema.parse(req.body);
    const { data, ok } = await sbPost('meetings', {
      teacher_id: body.teacherId,
      parent_id: body.parentId,
      student_id: body.studentId,
      requested_by: req.user!.id,
      scheduled_at: body.scheduledAt,
      duration_minutes: body.durationMinutes,
      location: body.location,
      notes: body.notes,
      status: 'requested',
    });
    if (!ok || !data) throw new AppError('Failed to create meeting request', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /meetings/:id/confirm
router.patch('/:id/confirm', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scheduledAt, location } = z.object({
      scheduledAt: z.string(),
      location: z.string().optional(),
    }).parse(req.body);

    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, {
      status: 'confirmed',
      scheduled_at: scheduledAt,
      location,
    });
    if (!ok || !data) throw new AppError('Meeting not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /meetings/:id/cancel
router.patch('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, {
      status: 'cancelled',
      cancellation_reason: reason,
    });
    if (!ok || !data) throw new AppError('Meeting not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /meetings/:id/complete
router.patch('/:id/complete', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, { status: 'completed' });
    if (!ok || !data) throw new AppError('Meeting not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

export default router;