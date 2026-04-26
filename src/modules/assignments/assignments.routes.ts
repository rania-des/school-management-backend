import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createBulkNotifications, getClassStudentProfileIds } from '../../utils/notifications';
import { uploadFile, deleteFile, STORAGE_BUCKETS } from '../../utils/storage';
import multer from 'multer';
import { uploadRateLimit } from '../../middleware/rateLimit.middleware';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const assignmentSchema = z.object({
  subjectId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['homework', 'project', 'exam', 'exercise', 'report', 'course']),
  dueDate: z.string().optional(),
  points: z.number().optional(),
});

// GET /assignments
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { classId, subjectId, type } = req.query;

    let query = supabaseAdmin
      .from('assignments')
      .select(`
        *,
        subjects(name, code, color),
        classes(name),
        teachers(profiles(first_name, last_name))
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin
        .from('students').select('class_id').eq('profile_id', req.user!.id).single();
      if (student?.class_id) query = query.eq('class_id', student.class_id);
    } else if (req.user!.role === 'teacher') {
      const { data: teacher } = await supabaseAdmin
        .from('teachers').select('id').eq('profile_id', req.user!.id).single();
      if (teacher) query = query.eq('teacher_id', teacher.id);
    } else if (req.user!.role === 'parent') {
      const { data: parent } = await supabaseAdmin
        .from('parents').select('id').eq('profile_id', req.user!.id).single();
      const { data: children } = await supabaseAdmin
        .from('parent_student').select('students(class_id)').eq('parent_id', parent?.id);
      const classIds = (children || []).map((c: any) => c.students?.class_id).filter(Boolean);
      if (classIds.length > 0) query = query.in('class_id', classIds);
    }

    if (classId) query = query.eq('class_id', classId);
    if (subjectId) query = query.eq('subject_id', subjectId);
    if (type) query = query.eq('type', type);

    const { data, count, error } = await query;
    if (error) throw new AppError('Failed to fetch assignments', 500);

    return res.json(paginate(data || [], count || 0, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

// GET /assignments/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('assignments')
      .select(`*, subjects(name), classes(name), teachers(profiles(first_name, last_name))`)
      .eq('id', req.params.id)
      .single();

    if (error || !data) throw new AppError('Assignment not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// POST /assignments - teacher creates
router.post('/', authorize('teacher', 'admin'), uploadRateLimit, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = assignmentSchema.parse(
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    );

    const { data: teacher } = await supabaseAdmin
      .from('teachers').select('id').eq('profile_id', req.user!.id).single();

    let fileUrl: string | undefined;
    if (req.file) {
      fileUrl = await uploadFile(STORAGE_BUCKETS.ASSIGNMENTS, req.file, teacher?.id || 'admin');
    }

    const { data, error } = await supabaseAdmin
      .from('assignments')
      .insert({
        teacher_id: teacher?.id,
        subject_id: body.subjectId,
        class_id: body.classId,
        academic_year_id: body.academicYearId,
        title: body.title,
        description: body.description,
        type: body.type,
        due_date: body.dueDate,
        points: body.points,
        file_url: fileUrl,
      })
      .select()
      .single();

    if (error || !data) throw new AppError('Failed to create assignment', 500);

    // Notify all students in the class
    const studentProfileIds = await getClassStudentProfileIds(body.classId);
    if (body.type === 'course') {
      await createBulkNotifications(studentProfileIds, {
        type: 'course',
        title: '📖 Nouveau cours disponible',
        body: `${body.title} - Consultez-le maintenant dans votre espace cours`,
        data: { courseId: data.id, type: 'course' },
      });
    } else {
      await createBulkNotifications(studentProfileIds, {
        type: 'assignment',
        title: 'Nouveau devoir',
        body: `${body.title} - à rendre le ${body.dueDate || 'date non définie'}`,
        data: { assignmentId: data.id },
      });
    }

    return res.status(201).json(successResponse(data, 'Assignment created'));
  } catch (err) {
    return next(err);
  }
});

// PATCH /assignments/:id
router.patch('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = assignmentSchema.partial().parse(req.body);
    const mapped: Record<string, unknown> = {};
    if (updates.title) mapped.title = updates.title;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.dueDate !== undefined) mapped.due_date = updates.dueDate;
    if (updates.points !== undefined) mapped.points = updates.points;

    const { data, error } = await supabaseAdmin
      .from('assignments').update(mapped).eq('id', req.params.id).select().single();

    if (error || !data) throw new AppError('Assignment not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// DELETE /assignments/:id
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = await supabaseAdmin
      .from('assignments').select('file_url').eq('id', req.params.id).single();

    if (data?.file_url) {
      await deleteFile(STORAGE_BUCKETS.ASSIGNMENTS, data.file_url);
    }

    await supabaseAdmin.from('assignments').delete().eq('id', req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

// ==================== SUBMISSIONS ====================

// GET /assignments/:id/submissions - teacher sees all; student sees own
router.get('/:id/submissions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let query = supabaseAdmin
      .from('submissions')
      .select(`*, students(student_number, profiles(first_name, last_name))`)
      .eq('assignment_id', req.params.id);

    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin
        .from('students').select('id').eq('profile_id', req.user!.id).single();
      query = query.eq('student_id', student?.id);
    }

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch submissions', 500);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// POST /assignments/:id/submissions - student submits
router.post('/:id/submissions', authorize('student'), uploadRateLimit, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: student } = await supabaseAdmin
      .from('students').select('id').eq('profile_id', req.user!.id).single();

    if (!student) throw new AppError('Student not found', 404);

    let fileUrl: string | undefined;
    if (req.file) {
      fileUrl = await uploadFile(STORAGE_BUCKETS.SUBMISSIONS, req.file, student.id);
    }

    const textContent = req.body.textContent;

    // Check if assignment exists and not past due
    const { data: assignment } = await supabaseAdmin
      .from('assignments').select('due_date').eq('id', req.params.id).single();

    const isLate = assignment?.due_date && new Date() > new Date(assignment.due_date);

    const { data, error } = await supabaseAdmin
      .from('submissions')
      .upsert({
        assignment_id: req.params.id,
        student_id: student.id,
        file_url: fileUrl,
        text_content: textContent,
        status: isLate ? 'late' : 'submitted',
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'assignment_id,student_id' })
      .select()
      .single();

    if (error) throw new AppError('Failed to submit assignment', 500);
    return res.status(201).json(successResponse(data, 'Assignment submitted'));
  } catch (err) {
    return next(err);
  }
});

// PATCH /assignments/:id/submissions/:submissionId/grade - teacher grades
router.patch('/:id/submissions/:submissionId/grade', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { score, feedback } = z.object({
      score: z.number().min(0).max(20),
      feedback: z.string().optional(),
    }).parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('submissions')
      .update({ score, feedback, status: 'graded', graded_at: new Date().toISOString() })
      .eq('id', req.params.submissionId)
      .select('*, students(profile_id)')
      .single();

    if (error || !data) throw new AppError('Submission not found', 404);

    // Notify student
    const studentProfileId = (data as any).students?.profile_id;
    if (studentProfileId) {
      await createNotification({
        recipientId: studentProfileId,
        type: 'grade',
        title: 'Devoir noté',
        body: `Votre devoir a été noté : ${score}/20`,
        data: { submissionId: data.id },
      });
    }

    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// helper inline for single notification
async function createNotification(params: any) {
  await supabaseAdmin.from('notifications').insert({
    recipient_id: params.recipientId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data,
  });
}

export default router;