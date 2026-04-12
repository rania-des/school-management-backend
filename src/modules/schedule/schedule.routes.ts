import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import { sbGet, sbGetOne, sbInsert, sbUpdate } from '../../utils/sbClient';

const router = Router();
router.use(authenticate);

const slotSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid().optional().nullable(),
  academicYearId: z.string().uuid(),
  dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().optional().nullable(),
});

// GET /schedule
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let classId = req.query.classId as string;
    const { academicYearId } = req.query;

    if (!classId) {
      if (req.user!.role === 'student') {
        const s = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=class_id`);
        classId = s?.class_id;
      } else if (req.user!.role === 'parent') {
        const parent = await sbGetOne('parents', `profile_id=eq.${req.user!.id}&select=id`);
        const link = await sbGetOne('parent_student', `parent_id=eq.${parent?.id}&select=students(class_id)&limit=1`);
        classId = link?.students?.class_id;
      }
    }
    if (!classId) throw new AppError('classId is required', 400);

    let params = `class_id=eq.${classId}&is_active=eq.true&select=*,subjects(name,code,color),teachers(profiles:profile_id(first_name,last_name)),classes(name)&order=day_of_week,start_time`;
    if (academicYearId) params += `&academic_year_id=eq.${academicYearId}`;

    const data = await sbGet('schedule_slots', params);

    const grouped: Record<string, unknown[]> = {};
    data.forEach((slot: any) => {
      if (!grouped[slot.day_of_week]) grouped[slot.day_of_week] = [];
      grouped[slot.day_of_week].push(slot);
    });

    return res.json(successResponse({ schedule: grouped, slots: data }));
  } catch (err) { return next(err); }
});

// GET /schedule/teacher
router.get('/teacher', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let teacherId: string;
    if (req.user!.role === 'teacher') {
      const t = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=id`);
      if (!t) throw new AppError('Teacher not found', 404);
      teacherId = t.id;
    } else {
      teacherId = req.query.teacherId as string;
      if (!teacherId) throw new AppError('teacherId required', 400);
    }
    const { academicYearId } = req.query;
    let params = `teacher_id=eq.${teacherId}&is_active=eq.true&select=*,subjects(name,color),classes(name)&order=day_of_week,start_time`;
    if (academicYearId) params += `&academic_year_id=eq.${academicYearId}`;
    const data = await sbGet('schedule_slots', params);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// POST /schedule
router.post('/', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = slotSchema.parse(req.body);

    // Resolve teacher id
    let finalTeacherId: string | null = null;
    if (body.teacherId) {
      const byId = await sbGetOne('teachers', `id=eq.${body.teacherId}&select=id`);
      if (byId) { finalTeacherId = byId.id; }
      else {
        const byProfile = await sbGetOne('teachers', `profile_id=eq.${body.teacherId}&select=id`);
        if (byProfile) finalTeacherId = byProfile.id;
      }
    }

    // Conflict check
    const existing = await sbGet(
      'schedule_slots',
      `class_id=eq.${body.classId}&day_of_week=eq.${body.dayOfWeek}&is_active=eq.true&start_time=lt.${body.endTime}&end_time=gt.${body.startTime}&select=id`
    );
    if (existing.length > 0) throw new AppError('Schedule conflict detected for this class', 409);

    const data = await sbInsert('schedule_slots', {
      class_id: body.classId, subject_id: body.subjectId, teacher_id: finalTeacherId,
      academic_year_id: body.academicYearId, day_of_week: body.dayOfWeek,
      start_time: body.startTime, end_time: body.endTime, room: body.room || null,
    });
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// DELETE /schedule/:id (soft delete)
router.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbUpdate('schedule_slots', `id=eq.${req.params.id}`, { is_active: false });
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;