import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { sbGet, sbGetOne, sbInsert, sbUpdate, sbDelete, sbUpsert } from '../../utils/sbClient';

const router = Router();
router.use(authenticate, authorize('admin'));

// ── SECTIONS ──────────────────────────────────────────────────────────────────
router.get('/sections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await sbGet('sections', 'select=*&order=name').catch(() => null);
    if (!data) return res.json(successResponse([
      { id: '1', name: 'Mathématiques', code: 'MATH' },
      { id: '2', name: 'Sciences', code: 'SCI' },
      { id: '3', name: 'Lettres', code: 'LET' },
      { id: '4', name: 'Économie', code: 'ECO' },
      { id: '5', name: 'Informatique', code: 'INFO' },
      { id: '6', name: 'Technique', code: 'TECH' },
    ]));
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// ── LEVELS ────────────────────────────────────────────────────────────────────
router.get('/levels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await sbGet('levels', 'select=*&order=order_index').catch(() => null);
    if (!data) return res.json(successResponse([
      { id: '1', name: '1ère année', order_index: 1 },
      { id: '2', name: '2ème année', order_index: 2 },
      { id: '3', name: '3ème année', order_index: 3 },
      { id: '4', name: '4ème année', order_index: 4 },
      { id: '5', name: 'Terminale', order_index: 5 },
    ]));
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// ── CLASSES ───────────────────────────────────────────────────────────────────
const classSchema = z.object({
  name: z.string().min(1).max(100),
  levelId: z.string().uuid().optional().nullable(),
  sectionId: z.string().uuid().optional().nullable(),
  academicYearId: z.string().uuid(),
  capacity: z.number().default(30),
  room: z.string().optional().nullable(),
});

router.get('/classes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { academicYearId, levelId } = req.query;
    let params = `select=*,academic_years(name,is_current)&order=name&offset=${offset}&limit=${limit}`;
    if (academicYearId) params += `&academic_year_id=eq.${academicYearId}`;
    if (levelId) params += `&level_id=eq.${levelId}`;
    const data = await sbGet('classes', params);
    return res.json(paginate(data, data.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

router.get('/classes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cls = await sbGetOne('classes', `id=eq.${req.params.id}&select=*,students(id,student_number,profiles:profile_id(first_name,last_name,email))`);
    if (!cls) throw new AppError('Class not found', 404);
    return res.json(successResponse(cls));
  } catch (err) { return next(err); }
});

router.post('/classes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = classSchema.parse(req.body);
    const data = await sbInsert('classes', {
      name: body.name, level_id: body.levelId || null, section_id: body.sectionId || null,
      academic_year_id: body.academicYearId, capacity: body.capacity, room: body.room || null,
    });
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

router.patch('/classes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = classSchema.partial().parse(req.body);
    const mapped: any = {};
    if (updates.name) mapped.name = updates.name;
    if (updates.capacity) mapped.capacity = updates.capacity;
    if (updates.room !== undefined) mapped.room = updates.room;
    if (updates.levelId !== undefined) mapped.level_id = updates.levelId;
    if (updates.sectionId !== undefined) mapped.section_id = updates.sectionId;
    const data = await sbUpdate('classes', `id=eq.${req.params.id}`, mapped);
    if (!data) throw new AppError('Class not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.delete('/classes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbDelete('classes', `id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// ── SUBJECTS ──────────────────────────────────────────────────────────────────
const subjectSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().optional(),
  coefficient: z.number().positive().default(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
  description: z.string().optional(),
  sectionId: z.string().uuid().optional().nullable(),
});

router.get('/subjects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sectionId } = req.query;
    let params = 'select=*&order=name';
    if (sectionId) params += `&section_id=eq.${sectionId}`;
    const data = await sbGet('subjects', params);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.post('/subjects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = subjectSchema.parse(req.body);
    const data = await sbInsert('subjects', {
      name: body.name, code: body.code, coefficient: body.coefficient,
      color: body.color, description: body.description, section_id: body.sectionId || null,
    });
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

router.patch('/subjects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = subjectSchema.partial().parse(req.body);
    const mapped: any = {};
    if (updates.name) mapped.name = updates.name;
    if (updates.code !== undefined) mapped.code = updates.code;
    if (updates.coefficient) mapped.coefficient = updates.coefficient;
    if (updates.color) mapped.color = updates.color;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.sectionId !== undefined) mapped.section_id = updates.sectionId;
    const data = await sbUpdate('subjects', `id=eq.${req.params.id}`, mapped);
    if (!data) throw new AppError('Subject not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.delete('/subjects/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbDelete('subjects', `id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// ── TEACHER ASSIGNMENTS ───────────────────────────────────────────────────────
router.get('/teacher-assignments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId, teacherId, academicYearId } = req.query;
    let params = 'select=*,teachers(profiles:profile_id(first_name,last_name)),subjects(name),classes(name)';
    if (classId) params += `&class_id=eq.${classId}`;
    if (teacherId) params += `&teacher_id=eq.${teacherId}`;
    if (academicYearId) params += `&academic_year_id=eq.${academicYearId}`;
    const data = await sbGet('teacher_assignments', params);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.post('/teacher-assignments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      teacherId: z.string().uuid(), subjectId: z.string().uuid(),
      classId: z.string().uuid(), academicYearId: z.string().uuid(),
      isMainTeacher: z.boolean().default(false),
    }).parse(req.body);
    const data = await sbInsert('teacher_assignments', {
      teacher_id: body.teacherId, subject_id: body.subjectId, class_id: body.classId,
      academic_year_id: body.academicYearId, is_main_teacher: body.isMainTeacher,
    });
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

router.delete('/teacher-assignments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbDelete('teacher_assignments', `id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// ── PARENT-STUDENT LINKS ──────────────────────────────────────────────────────
router.get('/parent-student', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, parentId } = req.query;
    let params = 'select=*,parents(profiles:profile_id(first_name,last_name,email)),students(profiles:profile_id(first_name,last_name,email),classes(name))';
    if (studentId) params += `&student_id=eq.${studentId}`;
    if (parentId) params += `&parent_id=eq.${parentId}`;
    const data = await sbGet('parent_student', params);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.post('/parent-student', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      parentId: z.string().uuid(), studentId: z.string().uuid(),
      relationship: z.string().default('parent'), isPrimary: z.boolean().default(false),
    }).parse(req.body);

    let finalParentId = body.parentId;
    const byId = await sbGetOne('parents', `id=eq.${body.parentId}&select=id`).catch(() => null);
    if (!byId) {
      const byProfile = await sbGetOne('parents', `profile_id=eq.${body.parentId}&select=id`);
      if (!byProfile) throw new AppError(`Parent not found for id: ${body.parentId}`, 404);
      finalParentId = byProfile.id;
    }

    let finalStudentId = body.studentId;
    const sById = await sbGetOne('students', `id=eq.${body.studentId}&select=id`).catch(() => null);
    if (!sById) {
      const sByProfile = await sbGetOne('students', `profile_id=eq.${body.studentId}&select=id`);
      if (!sByProfile) throw new AppError(`Student not found for id: ${body.studentId}`, 404);
      finalStudentId = sByProfile.id;
    }

    const data = await sbInsert('parent_student', {
      parent_id: finalParentId, student_id: finalStudentId,
      relationship: body.relationship, is_primary: body.isPrimary,
    });
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

router.delete('/parent-student/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbDelete('parent_student', `id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// ── STUDENT MANAGEMENT ────────────────────────────────────────────────────────
router.patch('/students/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentNumber, classId, enrollmentDate } = req.body;
    const updates: any = {};
    if (studentNumber !== undefined) updates.student_number = studentNumber;
    if (classId !== undefined) updates.class_id = classId;
    if (enrollmentDate !== undefined) updates.enrollment_date = enrollmentDate;
    
    const data = await sbUpdate('students', `id=eq.${req.params.id}`, updates);
    if (!data) throw new AppError('Student not found', 404);
    return res.json(successResponse(data, 'Student updated'));
  } catch (err) { return next(err); }
});

// ── TEACHER MANAGEMENT ────────────────────────────────────────────────────────
router.patch('/teachers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { specialization, employeeNumber, hireDate } = req.body;
    const updates: any = {};
    if (specialization !== undefined) updates.specialization = specialization;
    if (employeeNumber !== undefined) updates.employee_number = employeeNumber;
    if (hireDate !== undefined) updates.hire_date = hireDate;
    
    const data = await sbUpdate('teachers', `id=eq.${req.params.id}`, updates);
    if (!data) throw new AppError('Teacher not found', 404);
    return res.json(successResponse(data, 'Teacher updated'));
  } catch (err) { return next(err); }
});

// ── PARENT MANAGEMENT ─────────────────────────────────────────────────────────
router.patch('/parents/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { profession } = req.body;
    const updates: any = {};
    if (profession !== undefined) updates.profession = profession;
    
    const data = await sbUpdate('parents', `id=eq.${req.params.id}`, updates);
    if (!data) throw new AppError('Parent not found', 404);
    return res.json(successResponse(data, 'Parent updated'));
  } catch (err) { return next(err); }
});

// ── ACADEMIC YEARS ────────────────────────────────────────────────────────────
router.get('/academic-years', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await sbGet('academic_years', 'select=*&order=start_date.desc');
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.post('/academic-years', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      name: z.string(), startDate: z.string(), endDate: z.string(), isCurrent: z.boolean().default(false),
    }).parse(req.body);
    if (body.isCurrent) {
      await sbUpdate('academic_years', 'is_current=eq.true', { is_current: false }).catch(() => {});
    }
    const data = await sbInsert('academic_years', {
      name: body.name, start_date: body.startDate, end_date: body.endDate, is_current: body.isCurrent,
    });
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

router.patch('/academic-years/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      name: z.string().optional(), startDate: z.string().optional(),
      endDate: z.string().optional(), isCurrent: z.boolean().optional(),
    }).parse(req.body);
    if (body.isCurrent) {
      await sbUpdate('academic_years', 'is_current=eq.true', { is_current: false }).catch(() => {});
    }
    const mapped: any = {};
    if (body.name) mapped.name = body.name;
    if (body.startDate) mapped.start_date = body.startDate;
    if (body.endDate) mapped.end_date = body.endDate;
    if (body.isCurrent !== undefined) mapped.is_current = body.isCurrent;
    const data = await sbUpdate('academic_years', `id=eq.${req.params.id}`, mapped);
    if (!data) throw new AppError('Academic year not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.delete('/academic-years/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbDelete('academic_years', `id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// ── USERS (admin view) ────────────────────────────────────────────────────────
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role, search } = req.query;
    const { page, limit, offset } = getPagination(req);
    let params = `select=*&order=created_at.desc&offset=${offset}&limit=${limit}`;
    if (role) params += `&role=eq.${role}`;
    if (search) params += `&or=(first_name.ilike.*${search}*,last_name.ilike.*${search}*,email.ilike.*${search}*)`;
    const data = await sbGet('profiles', params);
    return res.json(paginate(data, data.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// ── ESTABLISHMENT ─────────────────────────────────────────────────────────────
router.get('/establishment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await sbGetOne('establishments', 'select=*&limit=1');
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.patch('/establishment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      name: z.string().optional(), address: z.string().optional(),
      phone: z.string().optional(), email: z.string().email().optional(),
      website: z.string().optional(),
    }).parse(req.body);
    const existing = await sbGetOne('establishments', 'select=id&limit=1');
    if (!existing) throw new AppError('Establishment not found', 404);
    const data = await sbUpdate('establishments', `id=eq.${existing.id}`, body);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// ── STUDENT ENROLLMENT ────────────────────────────────────────────────────────
router.patch('/students/:studentId/enroll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId } = z.object({ classId: z.string().uuid() }).parse(req.body);
    const data = await sbUpdate('students', `id=eq.${req.params.studentId}`, { class_id: classId });
    if (!data) throw new AppError('Student not found', 404);
    return res.json(successResponse(data, 'Student enrolled in class'));
  } catch (err) { return next(err); }
});

export default router;