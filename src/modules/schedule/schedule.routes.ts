import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const slotSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().optional(),
});

// GET /schedule - get schedule for current user's class
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let classId = req.query.classId as string;
    const { academicYearId } = req.query;

    // Resolve classId based on role
    if (!classId) {
      if (req.user!.role === 'student') {
        const { data } = await supabaseAdmin
          .from('students').select('class_id').eq('profile_id', req.user!.id).single();
        classId = data?.class_id;
      } else if (req.user!.role === 'parent') {
        const { data: parent } = await supabaseAdmin
          .from('parents').select('id').eq('profile_id', req.user!.id).single();
        const { data: children } = await supabaseAdmin
          .from('parent_student')
          .select('students(class_id)')
          .eq('parent_id', parent?.id)
          .limit(1)
          .single();
        classId = (children as any)?.students?.class_id;
      }
    }

    if (!classId) throw new AppError('classId is required', 400);

    let query = supabaseAdmin
      .from('schedule_slots')
      .select(`
        *,
        subjects(name, code, color),
        teachers(profiles(first_name, last_name)),
        classes(name)
      `)
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('day_of_week')
      .order('start_time');

    if (academicYearId) query = query.eq('academic_year_id', academicYearId);

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch schedule', 500);

    // Group by day
    const grouped: Record<string, unknown[]> = {};
    (data || []).forEach((slot: any) => {
      if (!grouped[slot.day_of_week]) grouped[slot.day_of_week] = [];
      grouped[slot.day_of_week].push(slot);
    });

    return res.json(successResponse({ schedule: grouped, slots: data }));
  } catch (err) {
    return next(err);
  }
});

// GET /schedule/teacher - teacher's own schedule
router.get('/teacher', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { academicYearId } = req.query;

    let teacherId: string;
    if (req.user!.role === 'teacher') {
      const { data } = await supabaseAdmin
        .from('teachers').select('id').eq('profile_id', req.user!.id).single();
      if (!data) throw new AppError('Teacher not found', 404);
      teacherId = data.id;
    } else {
      teacherId = req.query.teacherId as string;
      if (!teacherId) throw new AppError('teacherId required', 400);
    }

    let query = supabaseAdmin
      .from('schedule_slots')
      .select('*, subjects(name, color), classes(name)')
      .eq('teacher_id', teacherId)
      .eq('is_active', true)
      .order('day_of_week')
      .order('start_time');

    if (academicYearId) query = query.eq('academic_year_id', academicYearId);

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch teacher schedule', 500);

    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// POST /schedule - admin creates a slot
router.post('/', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = slotSchema.parse(req.body);

    // ✅ Résoudre teachers.id depuis profile_id si nécessaire
    let finalTeacherId = body.teacherId;
    const { data: teacherDirect } = await supabaseAdmin
      .from('teachers').select('id').eq('id', body.teacherId).maybeSingle();
    if (!teacherDirect) {
      const { data: teacherByProfile } = await supabaseAdmin
        .from('teachers').select('id').eq('profile_id', body.teacherId).maybeSingle();
      if (teacherByProfile) finalTeacherId = teacherByProfile.id;
    }

    // ✅ Conflict check corrigé — chevauchement réel
    const { data: existing } = await supabaseAdmin
      .from('schedule_slots')
      .select('id')
      .eq('class_id', body.classId)
      .eq('day_of_week', body.dayOfWeek)
      .eq('is_active', true)
      .lt('start_time', body.endTime)
      .gt('end_time', body.startTime);

    if (existing && existing.length > 0) {
      throw new AppError('Schedule conflict detected for this class', 409);
    }

    const { data, error } = await supabaseAdmin
      .from('schedule_slots')
      .insert({
        class_id: body.classId,
        subject_id: body.subjectId,
        teacher_id: finalTeacherId,
        academic_year_id: body.academicYearId,
        day_of_week: body.dayOfWeek,
        start_time: body.startTime,
        end_time: body.endTime,
        room: body.room,
      })
      .select()
      .single();

    if (error) throw new AppError(`Failed to create schedule slot: ${error.message}`, 500);
    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// DELETE /schedule/:id
router.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supabaseAdmin.from('schedule_slots').update({ is_active: false }).eq('id', req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export default router;
