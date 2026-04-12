import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification } from '../../utils/notifications';
import { sendMeetingNotification } from '../../utils/email';
import { sbGet, sbGetOne, sbInsert, sbUpdate, extractFirst } from '../../utils/sbClient';

const router = Router();
router.use(authenticate);

const meetingSchema = z.object({
  teacherId: z.string().uuid(), parentId: z.string().uuid(), studentId: z.string().uuid(),
  scheduledAt: z.string().optional(), durationMinutes: z.number().default(30),
  location: z.string().optional(), notes: z.string().optional(),
});

// GET /meetings
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status } = req.query;
    let params = `select=*,teachers(profiles:profile_id(first_name,last_name,avatar_url)),parents(profiles:profile_id(first_name,last_name,avatar_url)),students(student_number,profiles:profile_id(first_name,last_name))&order=scheduled_at&offset=${offset}&limit=${limit}`;

    if (req.user!.role === 'teacher') {
      const teacher = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=id`);
      if (teacher) params += `&teacher_id=eq.${teacher.id}`;
    } else if (req.user!.role === 'parent') {
      const parent = await sbGetOne('parents', `profile_id=eq.${req.user!.id}&select=id`);
      if (parent) params += `&parent_id=eq.${parent.id}`;
    }

    if (status) params += `&status=eq.${status}`;
    const data = await sbGet('meetings', params);
    return res.json(paginate(data, data.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// POST /meetings
router.post('/', authorize('parent', 'teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = meetingSchema.parse(req.body);
    const data = await sbInsert('meetings', {
      teacher_id: body.teacherId, parent_id: body.parentId, student_id: body.studentId,
      requested_by: req.user!.id, scheduled_at: body.scheduledAt,
      duration_minutes: body.durationMinutes, location: body.location,
      notes: body.notes, status: 'requested',
    });

    // Get teacher & parent profile IDs for notification
    const teacher = await sbGetOne('teachers', `id=eq.${body.teacherId}&select=profile_id`);
    const parent  = await sbGetOne('parents',  `id=eq.${body.parentId}&select=profile_id`);
    const notifyId = req.user!.role === 'parent' ? teacher?.profile_id : parent?.profile_id;
    if (notifyId) {
      await createNotification({ recipientId: notifyId, type: 'meeting',
        title: 'Demande de réunion',
        body: `Une réunion a été demandée${body.scheduledAt ? ` pour le ${new Date(body.scheduledAt).toLocaleDateString('fr-FR')}` : ''}`,
        data: { meetingId: data.id } });
    }
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /meetings/:id/confirm
router.patch('/:id/confirm', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scheduledAt, location } = z.object({
      scheduledAt: z.string(), location: z.string().optional(),
    }).parse(req.body);

    const data = await sbUpdate('meetings', `id=eq.${req.params.id}`,
      { status: 'confirmed', scheduled_at: scheduledAt, location });
    if (!data) throw new AppError('Meeting not found', 404);

    // Notify parent
    const meeting = await sbGetOne('meetings', `id=eq.${req.params.id}&select=parent_id,teacher_id,teachers(profiles:profile_id(first_name,last_name)),parents(profiles:profile_id(id,first_name,last_name,email))`);
    const parentProfile = extractFirst(meeting?.parents)?.profiles;
    const teacherProfile = extractFirst(meeting?.teachers)?.profiles;
    const parentProfileId = Array.isArray(parentProfile) ? parentProfile[0]?.id : parentProfile?.id;

    if (parentProfileId) {
      await createNotification({ recipientId: parentProfileId, type: 'meeting',
        title: 'Réunion confirmée',
        body: `Votre réunion est confirmée pour le ${new Date(scheduledAt).toLocaleDateString('fr-FR')}`,
        data: { meetingId: data.id } });
    }
    const parentEmail = Array.isArray(parentProfile) ? parentProfile[0]?.email : parentProfile?.email;
    const parentFirstName = Array.isArray(parentProfile) ? parentProfile[0]?.first_name : parentProfile?.first_name;
    const teacherName = teacherProfile ? `${Array.isArray(teacherProfile) ? teacherProfile[0]?.first_name : teacherProfile?.first_name} ${Array.isArray(teacherProfile) ? teacherProfile[0]?.last_name : teacherProfile?.last_name}` : '';
    if (parentEmail) {
      sendMeetingNotification(parentEmail, parentFirstName, new Date(scheduledAt).toLocaleDateString('fr-FR'), teacherName).catch(console.error);
    }
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /meetings/:id/cancel
router.patch('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
    const data = await sbUpdate('meetings', `id=eq.${req.params.id}`,
      { status: 'cancelled', cancellation_reason: reason });
    if (!data) throw new AppError('Meeting not found', 404);

    const meeting = await sbGetOne('meetings', `id=eq.${req.params.id}&select=teacher_id,parent_id,teachers(profile_id),parents(profile_id)`);
    const teacherProfileId = extractFirst(meeting?.teachers)?.profile_id;
    const parentProfileId  = extractFirst(meeting?.parents)?.profile_id;
    const notifyId = req.user!.role === 'parent' ? teacherProfileId : parentProfileId;
    if (notifyId) {
      await createNotification({ recipientId: notifyId, type: 'meeting',
        title: 'Réunion annulée', body: reason || 'La réunion a été annulée',
        data: { meetingId: data.id } });
    }
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /meetings/:id/complete
router.patch('/:id/complete', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await sbUpdate('meetings', `id=eq.${req.params.id}`, { status: 'completed' });
    if (!data) throw new AppError('Meeting not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

export default router;