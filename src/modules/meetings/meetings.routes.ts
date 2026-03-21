import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification } from '../../utils/notifications';
import { sendMeetingNotification } from '../../utils/email';

const router = Router();
router.use(authenticate);

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

    let query = supabaseAdmin
      .from('meetings')
      .select(`
        *,
        teachers(profiles(first_name, last_name, avatar_url)),
        parents(profiles(first_name, last_name, avatar_url)),
        students(student_number, profiles(first_name, last_name))
      `, { count: 'exact' })
      .order('scheduled_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (req.user!.role === 'teacher') {
      const { data: teacher } = await supabaseAdmin
        .from('teachers').select('id').eq('profile_id', req.user!.id).single();
      query = query.eq('teacher_id', teacher?.id);
    } else if (req.user!.role === 'parent') {
      const { data: parent } = await supabaseAdmin
        .from('parents').select('id').eq('profile_id', req.user!.id).single();
      query = query.eq('parent_id', parent?.id);
    }

    if (status) query = query.eq('status', status);

    const { data, count, error } = await query;
    if (error) throw new AppError('Failed to fetch meetings', 500);

    return res.json(paginate(data || [], count || 0, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

// POST /meetings - parent or teacher requests a meeting
router.post('/', authorize('parent', 'teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = meetingSchema.parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('meetings')
      .insert({
        teacher_id: body.teacherId,
        parent_id: body.parentId,
        student_id: body.studentId,
        requested_by: req.user!.id,
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

    if (error || !data) throw new AppError('Failed to create meeting request', 500);

    // Notify the other party
    const teacherProfileId = (data as any).teachers?.profiles?.id;
    const parentProfileId = (data as any).parents?.profiles?.id;
    const requesterIsParent = req.user!.role === 'parent';

    const notifyId = requesterIsParent ? teacherProfileId : parentProfileId;
    if (notifyId) {
      await createNotification({
        recipientId: notifyId,
        type: 'meeting',
        title: 'Demande de réunion',
        body: `Une réunion a été demandée${body.scheduledAt ? ` pour le ${new Date(body.scheduledAt).toLocaleDateString('fr-FR')}` : ''}`,
        data: { meetingId: data.id },
      });
    }

    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /meetings/:id/confirm - teacher confirms
router.patch('/:id/confirm', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scheduledAt, location } = z.object({
      scheduledAt: z.string(),
      location: z.string().optional(),
    }).parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('meetings')
      .update({ status: 'confirmed', scheduled_at: scheduledAt, location })
      .eq('id', req.params.id)
      .select(`
        *,
        teachers(profiles(first_name, last_name)),
        parents(profiles(id, first_name, last_name, email))
      `)
      .single();

    if (error || !data) throw new AppError('Meeting not found', 404);

    // Notify parent
    const parentData = (data as any).parents?.profiles;
    if (parentData?.id) {
      await createNotification({
        recipientId: parentData.id,
        type: 'meeting',
        title: 'Réunion confirmée',
        body: `Votre réunion est confirmée pour le ${new Date(scheduledAt).toLocaleDateString('fr-FR')}`,
        data: { meetingId: data.id },
      });

      // Email notification
      const teacherName = `${(data as any).teachers?.profiles?.first_name} ${(data as any).teachers?.profiles?.last_name}`;
      if (parentData.email) {
        sendMeetingNotification(
          parentData.email,
          parentData.first_name,
          new Date(scheduledAt).toLocaleDateString('fr-FR'),
          teacherName
        ).catch(console.error);
      }
    }

    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /meetings/:id/cancel
router.patch('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('meetings')
      .update({ status: 'cancelled', cancellation_reason: reason })
      .eq('id', req.params.id)
      .select('*, teachers(profiles(id)), parents(profiles(id))')
      .single();

    if (error || !data) throw new AppError('Meeting not found', 404);

    // Notify the other party
    const teacherProfileId = (data as any).teachers?.profiles?.id;
    const parentProfileId = (data as any).parents?.profiles?.id;
    const notifyId = req.user!.role === 'parent' ? teacherProfileId : parentProfileId;

    if (notifyId) {
      await createNotification({
        recipientId: notifyId,
        type: 'meeting',
        title: 'Réunion annulée',
        body: reason || 'La réunion a été annulée',
        data: { meetingId: data.id },
      });
    }

    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /meetings/:id/complete
router.patch('/:id/complete', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('meetings')
      .update({ status: 'completed' })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) throw new AppError('Meeting not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

export default router;
