import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification } from '../../utils/notifications';

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
      const tid = Array.isArray(teachers) ? teachers[0]?.id : null;
      if (tid) url += `&teacher_id=eq.${tid}`;
      else return res.json(paginate([], 0, { page, limit, offset }));
    } else if (req.user!.role === 'parent') {
      const { data: parents } = await sbGet(`parents?profile_id=eq.${req.user!.id}&select=id`);
      const pid = Array.isArray(parents) ? parents[0]?.id : null;
      if (pid) url += `&parent_id=eq.${pid}`;
      else return res.json(paginate([], 0, { page, limit, offset }));
    }

    if (status) url += `&status=eq.${status}`;

    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];
    return res.json(paginate(arr, arr.length, { page, limit, offset }));
  } catch (err) { return next(err); }
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
      scheduled_at: body.scheduledAt || null,
      duration_minutes: body.durationMinutes,
      location: body.location || null,
      notes: body.notes || null,
      status: 'requested',
    });
    if (!ok || !data) throw new AppError('Failed to create meeting request', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /meetings/:id/confirm
router.patch('/:id/confirm', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scheduledAt, location } = z.object({
      scheduledAt: z.string(),
      location: z.string().optional(),
    }).parse(req.body);

    // 1. Vérifier que le meeting existe
    const { data: existing } = await sbGet(`meetings?id=eq.${req.params.id}&select=*`);
    const meeting = Array.isArray(existing) ? existing[0] : null;
    if (!meeting) throw new AppError('Meeting not found', 404);

    // 2. Vérifier que le statut permet la confirmation
    if (meeting.status !== 'requested') {
      throw new AppError(`Cannot confirm a meeting with status '${meeting.status}'`, 400);
    }

    // 3. Patcher
    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, {
      status: 'confirmed',
      scheduled_at: scheduledAt,
      location: location || null,
    });
    if (!ok || !data) throw new AppError('Failed to confirm meeting', 500);

    // 4. Notifier le parent
    const { data: parentProfile } = await sbGet(`parents?id=eq.${meeting.parent_id}&select=profile_id`);
    const parentProfileId = Array.isArray(parentProfile) ? parentProfile[0]?.profile_id : null;
    if (parentProfileId) {
      await createNotification({
        recipientId: parentProfileId,
        type: 'meeting',
        title: 'Réunion confirmée',
        body: `Votre réunion a été confirmée pour le ${new Date(scheduledAt).toLocaleString('fr-FR')}.`,
        data: { meetingId: req.params.id },
      });
    }

    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /meetings/:id/cancel
router.patch('/:id/cancel', authorize('teacher', 'parent', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);

    // 1. Vérifier que le meeting existe
    const { data: existing } = await sbGet(`meetings?id=eq.${req.params.id}&select=*`);
    const meeting = Array.isArray(existing) ? existing[0] : null;
    if (!meeting) throw new AppError('Meeting not found', 404);

    // 2. Vérifier que le statut permet l'annulation
    if (meeting.status === 'cancelled') throw new AppError('Meeting is already cancelled', 400);
    if (meeting.status === 'completed') throw new AppError('Cannot cancel a completed meeting', 400);

    // 3. Vérifier que l'utilisateur est participant (sauf admin)
    if (req.user!.role !== 'admin') {
      const { data: teacherRow } = await sbGet(`teachers?profile_id=eq.${req.user!.id}&select=id`);
      const teacherId = Array.isArray(teacherRow) ? teacherRow[0]?.id : null;
      const { data: parentRow } = await sbGet(`parents?profile_id=eq.${req.user!.id}&select=id`);
      const parentId = Array.isArray(parentRow) ? parentRow[0]?.id : null;

      const isTeacher = teacherId && meeting.teacher_id === teacherId;
      const isParent = parentId && meeting.parent_id === parentId;
      if (!isTeacher && !isParent) throw new AppError('Forbidden', 403);
    }

    // 4. Patcher
    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, {
      status: 'cancelled',
      cancellation_reason: reason || null,
    });
    if (!ok || !data) throw new AppError('Failed to cancel meeting', 500);

    // 5. Notifier l'autre participant
    const { data: teacherProfile } = await sbGet(`teachers?id=eq.${meeting.teacher_id}&select=profile_id`);
    const teacherProfileId = Array.isArray(teacherProfile) ? teacherProfile[0]?.profile_id : null;
    const { data: parentProfile } = await sbGet(`parents?id=eq.${meeting.parent_id}&select=profile_id`);
    const parentProfileId = Array.isArray(parentProfile) ? parentProfile[0]?.profile_id : null;

    const cancelledByRole = req.user!.role;
    const recipientId = cancelledByRole === 'parent' ? teacherProfileId : parentProfileId;
    if (recipientId) {
      await createNotification({
        recipientId,
        type: 'meeting',
        title: 'Réunion annulée',
        body: reason ? `La réunion a été annulée. Raison : ${reason}` : 'Une réunion a été annulée.',
        data: { meetingId: req.params.id },
      });
    }

    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /meetings/:id/complete
router.patch('/:id/complete', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Vérifier que le meeting existe
    const { data: existing } = await sbGet(`meetings?id=eq.${req.params.id}&select=*`);
    const meeting = Array.isArray(existing) ? existing[0] : null;
    if (!meeting) throw new AppError('Meeting not found', 404);

    // 2. Vérifier que le statut permet la complétion
    if (meeting.status !== 'confirmed') {
      throw new AppError(`Cannot complete a meeting with status '${meeting.status}'`, 400);
    }

    // 3. Patcher
    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, { status: 'completed' });
    if (!ok || !data) throw new AppError('Failed to complete meeting', 500);

    // 4. Notifier le parent
    const { data: parentProfile } = await sbGet(`parents?id=eq.${meeting.parent_id}&select=profile_id`);
    const parentProfileId = Array.isArray(parentProfile) ? parentProfile[0]?.profile_id : null;
    if (parentProfileId) {
      await createNotification({
        recipientId: parentProfileId,
        type: 'meeting',
        title: 'Réunion terminée',
        body: 'La réunion a été marquée comme terminée.',
        data: { meetingId: req.params.id },
      });
    }

    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

export default router;