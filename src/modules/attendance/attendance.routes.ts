import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import { sbGet, sbGetOne, sbUpsert, sbDelete, extractFirst } from '../../utils/sbClient';

const router = Router();
router.use(authenticate);

const attendanceSchema = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  scheduleSlotId: z.string().uuid().optional(),
  date: z.string(),
  status: z.enum(['present', 'absent', 'late']),
  reason: z.string().optional(),
});

// GET /attendance/teacher/classes
router.get('/teacher/classes', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teacher = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=id`);
    if (!teacher) throw new AppError('Teacher not found', 404);

    const slots = await sbGet('schedule_slots', `teacher_id=eq.${teacher.id}&is_active=eq.true&select=*,classes(id,name),subjects(id,name)`);

    const classMap = new Map();
    for (const slot of slots) {
      const key = `${slot.class_id}_${slot.subject_id}`;
      if (!classMap.has(key)) {
        classMap.set(key, {
          classId: slot.class_id,
          className: extractFirst(slot.classes)?.name || `Classe ${slot.class_id}`,
          subjectId: slot.subject_id,
          subjectName: extractFirst(slot.subjects)?.name || 'Matière',
          slots: [],
        });
      }
      classMap.get(key).slots.push({ day: slot.day_of_week, start: slot.start_time, end: slot.end_time, room: slot.room });
    }
    return res.json(successResponse(Array.from(classMap.values())));
  } catch (err) { return next(err); }
});

// GET /attendance/students/:classId
router.get('/students/:classId', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const students = await sbGet('students', `class_id=eq.${req.params.classId}&select=id,profile_id,student_number,profiles:profile_id(first_name,last_name,email)`);
    const formatted = students.map((s: any) => ({
      ...s,
      profiles: extractFirst(s.profiles),
    }));
    return res.json(successResponse(formatted));
  } catch (err) { return next(err); }
});

// GET /attendance
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId, studentId, date, startDate, endDate, limit = 100 } = req.query;
    let params = `select=*,students(*,profiles:profile_id(first_name,last_name)),classes(*),teachers(*)&order=date.desc&limit=${limit}`;
    if (classId) params += `&class_id=eq.${classId}`;
    if (studentId) params += `&student_id=eq.${studentId}`;
    if (date) params += `&date=eq.${date}`;
    if (startDate) params += `&date=gte.${startDate}`;
    if (endDate) params += `&date=lte.${endDate}`;

    if (req.user!.role === 'student') {
      const student = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=id`);
      if (student) params += `&student_id=eq.${student.id}`;
    } else if (req.user!.role === 'parent') {
      const parent = await sbGetOne('parents', `profile_id=eq.${req.user!.id}&select=id`);
      if (parent) {
        const children = await sbGet('parent_student', `parent_id=eq.${parent.id}&select=student_id`);
        const childIds = children.map((c: any) => c.student_id).filter(Boolean);
        if (childIds.length > 0) params += `&student_id=in.(${childIds.join(',')})`;
      }
    }

    const data = await sbGet('attendance', params);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// POST /attendance/bulk
router.post('/bulk', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attendances } = z.object({ attendances: z.array(attendanceSchema) }).parse(req.body);
    const teacher = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=id`);

    const records = attendances.map((a) => ({
      student_id: a.studentId, class_id: a.classId,
      schedule_slot_id: a.scheduleSlotId || null,
      teacher_id: teacher?.id || null, date: a.date,
      status: a.status, reason: a.reason || null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }));

    const data = await sbUpsert('attendance', records, 'student_id,class_id,date');
    return res.status(201).json(successResponse(data, `${data.length} attendance records saved`));
  } catch (err) { return next(err); }
});

// GET /attendance/stats/:studentId
router.get('/stats/:studentId', authorize('teacher', 'admin', 'parent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period } = req.query;
    let params = `student_id=eq.${req.params.studentId}&select=status,date`;
    if (period) {
      const startDate = new Date();
      if (period === 'week') startDate.setDate(startDate.getDate() - 7);
      else if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);
      else if (period === 'year') startDate.setFullYear(startDate.getFullYear() - 1);
      params += `&date=gte.${startDate.toISOString().split('T')[0]}`;
    }
    const data = await sbGet('attendance', params);
    const stats = {
      present: data.filter((a: any) => a.status === 'present').length,
      absent:  data.filter((a: any) => a.status === 'absent').length,
      late:    data.filter((a: any) => a.status === 'late').length,
      total:   data.length,
    };
    return res.json(successResponse(stats));
  } catch (err) { return next(err); }
});

// DELETE /attendance/:id
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbDelete('attendance', `id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;