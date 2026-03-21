import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';

const router = Router();
router.use(authenticate, authorize('admin'));

// ==================== CLASSES ====================

const classSchema = z.object({
  name: z.string().min(1).max(100),
  levelId: z.string().uuid().optional(),
  academicYearId: z.string().uuid(),
  capacity: z.number().default(30),
  room: z.string().optional(),
});

router.get('/classes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { academicYearId, levelId } = req.query;

    let query = supabaseAdmin
      .from('classes')
      .select(`*, levels(name), academic_years(name)`, { count: 'exact' })
      .order('name')
      .range(offset, offset + limit - 1);

    if (academicYearId) query = query.eq('academic_year_id', academicYearId);
    if (levelId) query = query.eq('level_id', levelId);

    const { data, count, error } = await query;
    if (error) throw new AppError('Failed to fetch classes', 500);
    return res.json(paginate(data || [], count || 0, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

router.post('/classes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = classSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('classes')
      .insert({ name: body.name, level_id: body.levelId, academic_year_id: body.academicYearId, capacity: body.capacity, room: body.room })
      .select()
      .single();
    if (error) throw new AppError('Failed to create class', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

router.patch('/classes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = classSchema.partial().parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('classes').update(updates).eq('id', req.params.id).select().single();
    if (error || !data) throw new AppError('Class not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

router.delete('/classes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supabaseAdmin.from('classes').delete().eq('id', req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

// ==================== SUBJECTS ====================

const subjectSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().optional(),
  coefficient: z.number().positive().default(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
  description: z.string().optional(),
});

router.get('/subjects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin.from('subjects').select('*').order('name');
    if (error) throw new AppError('Failed to fetch subjects', 500);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

router.post('/subjects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = subjectSchema.parse(req.body);
    const { data, error } = await supabaseAdmin.from('subjects').insert(body).select().single();
    if (error) throw new AppError('Failed to create subject', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

router.patch('/subjects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = subjectSchema.partial().parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('subjects').update(updates).eq('id', req.params.id).select().single();
    if (error || !data) throw new AppError('Subject not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

router.delete('/subjects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supabaseAdmin.from('subjects').delete().eq('id', req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

// ==================== TEACHER ASSIGNMENTS ====================

router.get('/teacher-assignments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId, teacherId, academicYearId } = req.query;
    let query = supabaseAdmin
      .from('teacher_assignments')
      .select(`*, teachers(profiles(first_name, last_name)), subjects(name), classes(name)`);
    if (classId) query = query.eq('class_id', classId);
    if (teacherId) query = query.eq('teacher_id', teacherId);
    if (academicYearId) query = query.eq('academic_year_id', academicYearId);

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch assignments', 500);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

router.post('/teacher-assignments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      teacherId: z.string().uuid(),
      subjectId: z.string().uuid(),
      classId: z.string().uuid(),
      academicYearId: z.string().uuid(),
      isMainTeacher: z.boolean().default(false),
    }).parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('teacher_assignments')
      .insert({
        teacher_id: body.teacherId,
        subject_id: body.subjectId,
        class_id: body.classId,
        academic_year_id: body.academicYearId,
        is_main_teacher: body.isMainTeacher,
      })
      .select()
      .single();

    if (error) throw new AppError('Failed to assign teacher', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

router.delete('/teacher-assignments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supabaseAdmin.from('teacher_assignments').delete().eq('id', req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

// ==================== PARENT-STUDENT LINKS ====================

router.post('/parent-student', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      parentId: z.string().uuid(),
      studentId: z.string().uuid(),
      relationship: z.string().default('parent'),
      isPrimary: z.boolean().default(false),
    }).parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('parent_student')
      .insert({
        parent_id: body.parentId,
        student_id: body.studentId,
        relationship: body.relationship,
        is_primary: body.isPrimary,
      })
      .select()
      .single();

    if (error) throw new AppError('Failed to link parent and student', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

router.delete('/parent-student/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supabaseAdmin.from('parent_student').delete().eq('id', req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

// ==================== ACADEMIC YEARS ====================

router.get('/academic-years', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin.from('academic_years').select('*').order('start_date', { ascending: false });
    if (error) throw new AppError('Failed to fetch years', 500);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

router.post('/academic-years', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      name: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      isCurrent: z.boolean().default(false),
    }).parse(req.body);

    // If setting as current, unset others first
    if (body.isCurrent) {
      await supabaseAdmin.from('academic_years').update({ is_current: false }).eq('is_current', true);
    }

    const { data, error } = await supabaseAdmin
      .from('academic_years')
      .insert({ name: body.name, start_date: body.startDate, end_date: body.endDate, is_current: body.isCurrent })
      .select()
      .single();

    if (error) throw new AppError('Failed to create academic year', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// ==================== ESTABLISHMENT ====================

router.get('/establishment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = await supabaseAdmin.from('establishments').select('*').limit(1).single();
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

router.patch('/establishment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      name: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      website: z.string().optional(),
    }).parse(req.body);

    const { data: existing } = await supabaseAdmin.from('establishments').select('id').limit(1).single();
    const { data, error } = await supabaseAdmin
      .from('establishments').update(body).eq('id', existing?.id).select().single();

    if (error) throw new AppError('Failed to update establishment', 500);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// ==================== STUDENT ENROLLMENT IN CLASS ====================

router.patch('/students/:studentId/enroll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId } = z.object({ classId: z.string().uuid() }).parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('students')
      .update({ class_id: classId })
      .eq('id', req.params.studentId)
      .select()
      .single();

    if (error || !data) throw new AppError('Student not found', 404);
    return res.json(successResponse(data, 'Student enrolled in class'));
  } catch (err) {
    return next(err);
  }
});

export default router;
