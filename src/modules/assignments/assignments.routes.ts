import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createBulkNotifications, getClassStudentProfileIds, createNotification } from '../../utils/notifications';
import { uploadFile, deleteFile, STORAGE_BUCKETS } from '../../utils/storage';
import { sbGet, sbGetOne, sbInsert, sbUpdate, sbDelete, sbUpsert } from '../../utils/sbClient';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const assignmentSchema = z.object({
  subjectId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['homework', 'project', 'exam', 'exercise', 'report']),
  dueDate: z.string().optional(),
  points: z.number().optional(),
});

// GET /assignments
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { classId, subjectId, type } = req.query;
    let params = `select=*,subjects(name,code,color),classes(name),teachers(profiles:profile_id(first_name,last_name))&order=created_at.desc&offset=${offset}&limit=${limit}`;

    if (req.user!.role === 'student') {
      const student = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=class_id`);
      if (student?.class_id) params += `&class_id=eq.${student.class_id}`;
    } else if (req.user!.role === 'teacher') {
      const teacher = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=id`);
      if (teacher) params += `&teacher_id=eq.${teacher.id}`;
    } else if (req.user!.role === 'parent') {
      const parent = await sbGetOne('parents', `profile_id=eq.${req.user!.id}&select=id`);
      const children = await sbGet('parent_student', `parent_id=eq.${parent?.id}&select=students(class_id)`);
      const classIds = children.map((c: any) => c.students?.class_id).filter(Boolean);
      if (classIds.length > 0) params += `&class_id=in.(${classIds.join(',')})`;
    }

    if (classId) params += `&class_id=eq.${classId}`;
    if (subjectId) params += `&subject_id=eq.${subjectId}`;
    if (type) params += `&type=eq.${type}`;

    const data = await sbGet('assignments', params);
    return res.json(paginate(data, data.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// GET /assignments/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await sbGetOne('assignments', `id=eq.${req.params.id}&select=*,subjects(name),classes(name),teachers(profiles:profile_id(first_name,last_name))`);
    if (!data) throw new AppError('Assignment not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// POST /assignments
router.post('/', authorize('teacher', 'admin'), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = assignmentSchema.parse(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    const teacher = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=id`);

    let fileUrl: string | undefined;
    if (req.file) fileUrl = await uploadFile(STORAGE_BUCKETS.ASSIGNMENTS, req.file, teacher?.id || 'admin');

    const data = await sbInsert('assignments', {
      teacher_id: teacher?.id, subject_id: body.subjectId, class_id: body.classId,
      academic_year_id: body.academicYearId, title: body.title,
      description: body.description, type: body.type, due_date: body.dueDate,
      points: body.points, file_url: fileUrl,
    });

    const studentProfileIds = await getClassStudentProfileIds(body.classId);
    await createBulkNotifications(studentProfileIds, {
      type: 'assignment', title: 'Nouveau devoir',
      body: `${body.title} - à rendre le ${body.dueDate || 'date non définie'}`,
      data: { assignmentId: data.id },
    });

    return res.status(201).json(successResponse(data, 'Assignment created'));
  } catch (err) { return next(err); }
});

// PATCH /assignments/:id
router.patch('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = assignmentSchema.partial().parse(req.body);
    const mapped: any = {};
    if (updates.title) mapped.title = updates.title;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.dueDate !== undefined) mapped.due_date = updates.dueDate;
    if (updates.points !== undefined) mapped.points = updates.points;
    const data = await sbUpdate('assignments', `id=eq.${req.params.id}`, mapped);
    if (!data) throw new AppError('Assignment not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// DELETE /assignments/:id
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await sbGetOne('assignments', `id=eq.${req.params.id}&select=file_url`);
    if (existing?.file_url) await deleteFile(STORAGE_BUCKETS.ASSIGNMENTS, existing.file_url);
    await sbDelete('assignments', `id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// GET /assignments/:id/submissions
router.get('/:id/submissions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let params = `assignment_id=eq.${req.params.id}&select=*,students(student_number,profiles:profile_id(first_name,last_name))`;
    if (req.user!.role === 'student') {
      const student = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=id`);
      if (student) params += `&student_id=eq.${student.id}`;
    }
    const data = await sbGet('submissions', params);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// POST /assignments/:id/submissions
router.post('/:id/submissions', authorize('student'), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=id`);
    if (!student) throw new AppError('Student not found', 404);

    let fileUrl: string | undefined;
    if (req.file) fileUrl = await uploadFile(STORAGE_BUCKETS.SUBMISSIONS, req.file, student.id);

    const assignment = await sbGetOne('assignments', `id=eq.${req.params.id}&select=due_date`);
    const isLate = assignment?.due_date && new Date() > new Date(assignment.due_date);

    const data = await sbUpsert('submissions', {
      assignment_id: req.params.id, student_id: student.id,
      file_url: fileUrl, text_content: req.body.textContent,
      status: isLate ? 'late' : 'submitted', submitted_at: new Date().toISOString(),
    }, 'assignment_id,student_id');

    return res.status(201).json(successResponse(Array.isArray(data) ? data[0] : data, 'Assignment submitted'));
  } catch (err) { return next(err); }
});

// PATCH /assignments/:id/submissions/:submissionId/grade
router.patch('/:id/submissions/:submissionId/grade', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { score, feedback } = z.object({ score: z.number().min(0).max(20), feedback: z.string().optional() }).parse(req.body);
    const data = await sbUpdate('submissions', `id=eq.${req.params.submissionId}`,
      { score, feedback, status: 'graded', graded_at: new Date().toISOString() });
    if (!data) throw new AppError('Submission not found', 404);

    const submission = await sbGetOne('submissions', `id=eq.${req.params.submissionId}&select=student_id,students(profile_id)`);
    const studentProfileId = submission?.students?.profile_id;
    if (studentProfileId) {
      await createNotification({ recipientId: studentProfileId, type: 'grade',
        title: 'Devoir noté', body: `Votre devoir a été noté : ${score}/20`,
        data: { submissionId: req.params.submissionId } });
    }
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

export default router;