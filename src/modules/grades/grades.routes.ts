import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification, createBulkNotifications, getStudentParentProfileIds } from '../../utils/notifications';

const router = Router();
router.use(authenticate);

const gradeSchema = z.object({
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  period: z.enum(['trimester_1', 'trimester_2', 'trimester_3', 'semester_1', 'semester_2', 'annual']),
  score: z.number().min(0).max(20),
  maxScore: z.number().default(20),
  coefficient: z.number().positive().default(1),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  gradeDate: z.string().optional(),
});

// GET /grades - student sees own, teacher sees their class, admin sees all
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { studentId, classId, subjectId, period, academicYearId } = req.query;

    let query = supabaseAdmin
      .from('grades')
      .select(`
        *,
        subjects(name, code, coefficient),
        students(student_number, profiles(first_name, last_name)),
        teachers(profiles(first_name, last_name)),
        classes(name)
      `, { count: 'exact' })
      .order('grade_date', { ascending: false })
      .range(offset, offset + limit - 1);

    const role = req.user!.role;

    if (role === 'student') {
      // Student sees only their own grades
      const { data: student } = await supabaseAdmin
        .from('students').select('id').eq('profile_id', req.user!.id).single();
      if (!student) throw new AppError('Student not found', 404);
      query = query.eq('student_id', student.id);
    } else if (role === 'parent') {
      // Parent sees children's grades
      const { data: parent } = await supabaseAdmin
        .from('parents').select('id').eq('profile_id', req.user!.id).single();
      if (!parent) throw new AppError('Parent not found', 404);
      const { data: children } = await supabaseAdmin
        .from('parent_student').select('student_id').eq('parent_id', parent.id);
      const childIds = (children || []).map((c: any) => c.student_id);
      query = query.in('student_id', childIds);
    } else if (role === 'teacher') {
      const { data: teacher } = await supabaseAdmin
        .from('teachers').select('id').eq('profile_id', req.user!.id).single();
      if (!teacher) throw new AppError('Teacher not found', 404);
      query = query.eq('teacher_id', teacher.id);
    }

    if (studentId) query = query.eq('student_id', studentId);
    if (classId) query = query.eq('class_id', classId);
    if (subjectId) query = query.eq('subject_id', subjectId);
    if (period) query = query.eq('period', period);
    if (academicYearId) query = query.eq('academic_year_id', academicYearId);

    const { data, count, error } = await query;
    if (error) throw new AppError('Failed to fetch grades', 500);

    return res.json(paginate(data || [], count || 0, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

// POST /grades - teacher or admin creates a grade
router.post('/', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = gradeSchema.parse(req.body);

    let teacherId = body.studentId; // placeholder
    if (req.user!.role === 'teacher') {
      const { data: teacher } = await supabaseAdmin
        .from('teachers').select('id').eq('profile_id', req.user!.id).single();
      if (!teacher) throw new AppError('Teacher not found', 404);
      teacherId = teacher.id;
    }

    const { data, error } = await supabaseAdmin
      .from('grades')
      .insert({
        student_id: body.studentId,
        subject_id: body.subjectId,
        teacher_id: req.user!.role === 'teacher' ? teacherId : null,
        class_id: body.classId,
        academic_year_id: body.academicYearId,
        period: body.period,
        score: body.score,
        max_score: body.maxScore,
        coefficient: body.coefficient,
        title: body.title,
        description: body.description,
        grade_date: body.gradeDate || new Date().toISOString().split('T')[0],
      })
      .select('*, subjects(name), students(profile_id, profiles(first_name, last_name))')
      .single();

    if (error || !data) throw new AppError('Failed to create grade', 500);

    // Notify student
    const studentProfileId = (data as any).students?.profile_id;
    if (studentProfileId) {
      await createNotification({
        recipientId: studentProfileId,
        type: 'grade',
        title: 'Nouvelle note',
        body: `Vous avez reçu ${body.score}/20 en ${(data as any).subjects?.name} - ${body.title}`,
        data: { gradeId: data.id, score: body.score },
      });

      // Notify parents too
      const parentProfileIds = await getStudentParentProfileIds(body.studentId);
      for (const parentId of parentProfileIds) {
        await createNotification({
          recipientId: parentId,
          type: 'grade',
          title: 'Nouvelle note',
          body: `Note de ${(data as any).students?.profiles?.first_name}: ${body.score}/20 en ${(data as any).subjects?.name}`,
          data: { gradeId: data.id },
        });
      }
    }

    return res.status(201).json(successResponse(data, 'Grade created'));
  } catch (err) {
    return next(err);
  }
});

// GET /grades/bulletin - get full bulletin for a student/period
router.get('/bulletin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, period, academicYearId } = req.query;

    if (!studentId || !period || !academicYearId) {
      throw new AppError('studentId, period, and academicYearId are required', 400);
    }

    // Verify access
    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin
        .from('students').select('id').eq('profile_id', req.user!.id).single();
      if (!student || student.id !== studentId) throw new AppError('Forbidden', 403);
    }

    const { data: grades, error } = await supabaseAdmin
      .from('grades')
      .select('*, subjects(name, code, coefficient), teachers(profiles(first_name, last_name))')
      .eq('student_id', studentId as string)
      .eq('period', period as string)
      .eq('academic_year_id', academicYearId as string)
      .order('subjects(name)', { ascending: true });

    if (error) throw new AppError('Failed to fetch bulletin', 500);

    // Calculate averages
    let totalWeightedScore = 0;
    let totalWeight = 0;

    const gradesWithAvg = (grades || []).map((g: any) => {
      const weight = g.coefficient * (g.subjects?.coefficient || 1);
      totalWeightedScore += g.score * weight;
      totalWeight += weight;
      return g;
    });

    const generalAverage = totalWeight > 0 ? (totalWeightedScore / totalWeight).toFixed(2) : null;

    // Get comments
    const { data: comments } = await supabaseAdmin
      .from('teacher_comments')
      .select('*, subjects(name), teachers(profiles(first_name, last_name))')
      .eq('student_id', studentId as string)
      .eq('period', period as string)
      .eq('academic_year_id', academicYearId as string);

    // Get ranking
    const { data: studentData } = await supabaseAdmin
      .from('students').select('class_id').eq('id', studentId as string).single();

    const { data: ranking } = await supabaseAdmin.rpc('get_class_ranking', {
      p_class_id: studentData?.class_id,
      p_period: period,
      p_academic_year_id: academicYearId,
    });

    const studentRank = (ranking || []).find((r: any) => r.student_id === studentId);

    return res.json(successResponse({
      grades: gradesWithAvg,
      comments: comments || [],
      generalAverage,
      rank: studentRank?.rank,
      classSize: (ranking || []).length,
    }));
  } catch (err) {
    return next(err);
  }
});

// PATCH /grades/:id
router.patch('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = z.object({
      score: z.number().min(0).max(20).optional(),
      title: z.string().optional(),
      description: z.string().optional(),
    }).parse(req.body);

    const updateData: Record<string, unknown> = {};
    if (updates.score !== undefined) updateData.score = updates.score;
    if (updates.title) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;

    const { data, error } = await supabaseAdmin
      .from('grades')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) throw new AppError('Grade not found or update failed', 404);
    return res.json(successResponse(data, 'Grade updated'));
  } catch (err) {
    return next(err);
  }
});

// DELETE /grades/:id
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error } = await supabaseAdmin.from('grades').delete().eq('id', req.params.id);
    if (error) throw new AppError('Failed to delete grade', 500);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

// POST /grades/comments - teacher adds a pedagogical comment
router.post('/comments', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      studentId: z.string().uuid(),
      subjectId: z.string().uuid().optional(),
      classId: z.string().uuid(),
      academicYearId: z.string().uuid(),
      period: z.enum(['trimester_1', 'trimester_2', 'trimester_3', 'semester_1', 'semester_2', 'annual']),
      comment: z.string().min(1),
      isPositive: z.boolean().default(true),
    }).parse(req.body);

    const { data: teacher } = await supabaseAdmin
      .from('teachers').select('id').eq('profile_id', req.user!.id).single();

    const { data, error } = await supabaseAdmin
      .from('teacher_comments')
      .insert({
        teacher_id: teacher?.id,
        student_id: body.studentId,
        subject_id: body.subjectId,
        class_id: body.classId,
        academic_year_id: body.academicYearId,
        period: body.period,
        comment: body.comment,
        is_positive: body.isPositive,
      })
      .select()
      .single();

    if (error) throw new AppError('Failed to save comment', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

export default router;
