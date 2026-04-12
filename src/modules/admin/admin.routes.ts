import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';

const router = Router();
router.use(authenticate, authorize('admin'));

const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  return { data: await res.json(), ok: res.ok };
}
async function sbPost(path: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(body)
  });
  const data = await res.json() as any[];
  return { data: data[0], ok: res.ok };
}
async function sbPatch(path: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(body)
  });
  const data = await res.json() as any[];
  return { data: data[0], ok: res.ok };
}
async function sbDelete(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'DELETE', headers: H });
  return { ok: res.ok };
}

// ==================== SECTIONS ====================

router.get('/sections', async (req, res, next) => {
  try {
    const { data, ok } = await sbGet('sections?order=name');
    if (!ok) return res.json(successResponse([
      { id: '1', name: 'Mathématiques', code: 'MATH' },
      { id: '2', name: 'Sciences', code: 'SCI' },
      { id: '3', name: 'Lettres', code: 'LET' },
      { id: '4', name: 'Économie', code: 'ECO' },
      { id: '5', name: 'Informatique', code: 'INFO' },
      { id: '6', name: 'Technique', code: 'TECH' },
    ]));
    return res.json(successResponse(data || []));
  } catch (err) { return next(err); }
});

// ==================== LEVELS ====================

router.get('/levels', async (req, res, next) => {
  try {
    const { data, ok } = await sbGet('levels?order=order_index');
    if (!ok) return res.json(successResponse([
      { id: '1', name: '1ère année', order_index: 1 },
      { id: '2', name: '2ème année', order_index: 2 },
      { id: '3', name: '3ème année', order_index: 3 },
      { id: '4', name: '4ème année', order_index: 4 },
      { id: '5', name: 'Terminale', order_index: 5 },
    ]));
    return res.json(successResponse(data || []));
  } catch (err) { return next(err); }
});

// ==================== CLASSES ====================

const classSchema = z.object({
  name: z.string().min(1).max(100),
  levelId: z.string().uuid().optional().nullable(),
  sectionId: z.string().uuid().optional().nullable(),
  academicYearId: z.string().uuid(),
  capacity: z.number().default(30),
  room: z.string().optional().nullable(),
});

router.get('/classes', async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { academicYearId, levelId } = req.query;
    let url = `classes?select=*&order=name&offset=${offset}&limit=${limit}`;
    if (academicYearId) url += `&academic_year_id=eq.${academicYearId}`;
    if (levelId) url += `&level_id=eq.${levelId}`;
    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];
    return res.json(paginate(arr, arr.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

router.post('/classes', async (req, res, next) => {
  try {
    const body = classSchema.parse(req.body);
    const { data, ok } = await sbPost('classes', {
      name: body.name, level_id: body.levelId || null,
      section_id: body.sectionId || null, academic_year_id: body.academicYearId,
      capacity: body.capacity, room: body.room || null,
    });
    if (!ok) throw new AppError('Failed to create class', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

router.patch('/classes/:id', async (req, res, next) => {
  try {
    const updates = classSchema.partial().parse(req.body);
    const mapped: any = {};
    if (updates.name) mapped.name = updates.name;
    if (updates.capacity) mapped.capacity = updates.capacity;
    if (updates.room !== undefined) mapped.room = updates.room;
    if (updates.levelId !== undefined) mapped.level_id = updates.levelId;
    if (updates.sectionId !== undefined) mapped.section_id = updates.sectionId;
    const { data, ok } = await sbPatch(`classes?id=eq.${req.params.id}`, mapped);
    if (!ok || !data) throw new AppError('Class not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.delete('/classes/:id', async (req, res, next) => {
  try {
    await sbDelete(`classes?id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// ==================== SUBJECTS ====================

const subjectSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().optional(),
  coefficient: z.number().positive().default(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
  description: z.string().optional(),
  sectionId: z.string().uuid().optional().nullable(),
});

router.get('/subjects', async (req, res, next) => {
  try {
    const { sectionId } = req.query;
    let url = 'subjects?order=name';
    if (sectionId) url += `&section_id=eq.${sectionId}`;
    const { data } = await sbGet(url);
    return res.json(successResponse(Array.isArray(data) ? data : []));
  } catch (err) { return next(err); }
});

router.post('/subjects', async (req, res, next) => {
  try {
    const body = subjectSchema.parse(req.body);
    const { data, ok } = await sbPost('subjects', {
      name: body.name, code: body.code, coefficient: body.coefficient,
      color: body.color, description: body.description, section_id: body.sectionId || null,
    });
    if (!ok) throw new AppError('Failed to create subject', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

router.patch('/subjects/:id', async (req, res, next) => {
  try {
    const updates = subjectSchema.partial().parse(req.body);
    const { data, ok } = await sbPatch(`subjects?id=eq.${req.params.id}`, updates);
    if (!ok || !data) throw new AppError('Subject not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.delete('/subjects/:id', async (req, res, next) => {
  try {
    await sbDelete(`subjects?id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// ==================== TEACHER ASSIGNMENTS ====================

router.get('/teacher-assignments', async (req, res, next) => {
  try {
    const { classId, teacherId, academicYearId } = req.query;
    let url = 'teacher_assignments?select=*';
    if (classId) url += `&class_id=eq.${classId}`;
    if (teacherId) url += `&teacher_id=eq.${teacherId}`;
    if (academicYearId) url += `&academic_year_id=eq.${academicYearId}`;
    const { data } = await sbGet(url);
    return res.json(successResponse(Array.isArray(data) ? data : []));
  } catch (err) { return next(err); }
});

router.post('/teacher-assignments', async (req, res, next) => {
  try {
    const body = z.object({
      teacherId: z.string().uuid(), subjectId: z.string().uuid(),
      classId: z.string().uuid(), academicYearId: z.string().uuid(),
      isMainTeacher: z.boolean().default(false),
    }).parse(req.body);
    const { data, ok } = await sbPost('teacher_assignments', {
      teacher_id: body.teacherId, subject_id: body.subjectId,
      class_id: body.classId, academic_year_id: body.academicYearId,
      is_main_teacher: body.isMainTeacher,
    });
    if (!ok) throw new AppError('Failed to assign teacher', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

router.delete('/teacher-assignments/:id', async (req, res, next) => {
  try {
    await sbDelete(`teacher_assignments?id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// ==================== PARENT-STUDENT LINKS ====================

router.post('/parent-student', async (req, res, next) => {
  try {
    const body = z.object({
      parentId: z.string().uuid(), studentId: z.string().uuid(),
      relationship: z.string().default('parent'), isPrimary: z.boolean().default(false),
    }).parse(req.body);

    let finalParentId = body.parentId;
    const { data: pd } = await sbGet(`parents?id=eq.${body.parentId}&select=id`);
    if (!Array.isArray(pd) || !pd[0]) {
      const { data: pp } = await sbGet(`parents?profile_id=eq.${body.parentId}&select=id`);
      if (Array.isArray(pp) && pp[0]) finalParentId = pp[0].id;
      else throw new AppError(`Parent not found`, 404);
    }

    let finalStudentId = body.studentId;
    const { data: sd } = await sbGet(`students?id=eq.${body.studentId}&select=id`);
    if (!Array.isArray(sd) || !sd[0]) {
      const { data: sp } = await sbGet(`students?profile_id=eq.${body.studentId}&select=id`);
      if (Array.isArray(sp) && sp[0]) finalStudentId = sp[0].id;
      else throw new AppError(`Student not found`, 404);
    }

    const { data, ok } = await sbPost('parent_student', {
      parent_id: finalParentId, student_id: finalStudentId,
      relationship: body.relationship, is_primary: body.isPrimary,
    });
    if (!ok) throw new AppError('Failed to link', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// ==================== ACADEMIC YEARS ====================

router.get('/academic-years', async (req, res, next) => {
  try {
    const { data } = await sbGet('academic_years?order=start_date.desc');
    return res.json(successResponse(Array.isArray(data) ? data : []));
  } catch (err) { return next(err); }
});

router.post('/academic-years', async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string(), startDate: z.string(), endDate: z.string(),
      isCurrent: z.boolean().default(false),
    }).parse(req.body);
    if (body.isCurrent) await sbPatch('academic_years?is_current=eq.true', { is_current: false });
    const { data, ok } = await sbPost('academic_years', {
      name: body.name, start_date: body.startDate, end_date: body.endDate, is_current: body.isCurrent,
    });
    if (!ok) throw new AppError('Failed to create academic year', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

router.patch('/academic-years/:id', async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().optional(), startDate: z.string().optional(),
      endDate: z.string().optional(), isCurrent: z.boolean().optional(),
    }).parse(req.body);
    if (body.isCurrent) await sbPatch('academic_years?is_current=eq.true', { is_current: false });
    const mapped: any = {};
    if (body.name) mapped.name = body.name;
    if (body.startDate) mapped.start_date = body.startDate;
    if (body.endDate) mapped.end_date = body.endDate;
    if (body.isCurrent !== undefined) mapped.is_current = body.isCurrent;
    const { data, ok } = await sbPatch(`academic_years?id=eq.${req.params.id}`, mapped);
    if (!ok || !data) throw new AppError('Academic year not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

router.delete('/academic-years/:id', async (req, res, next) => {
  try {
    await sbDelete(`academic_years?id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// ==================== USERS ====================

router.get('/users', async (req, res, next) => {
  try {
    const { role, search } = req.query;
    const { page, limit, offset } = getPagination(req);
    let url = `profiles?select=*&order=created_at.desc&offset=${offset}&limit=${limit}`;
    if (role) url += `&role=eq.${role}`;
    if (search) url += `&or=(first_name.ilike.*${search}*,last_name.ilike.*${search}*,email.ilike.*${search}*)`;
    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];
    return res.json(paginate(arr, arr.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// ==================== ESTABLISHMENT ====================

router.get('/establishment', async (req, res, next) => {
  try {
    const { data } = await sbGet('establishments?limit=1');
    const arr = Array.isArray(data) ? data : [];
    return res.json(successResponse(arr[0] || null));
  } catch (err) { return next(err); }
});

router.patch('/establishment', async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().optional(), address: z.string().optional(),
      phone: z.string().optional(), email: z.string().email().optional(),
      website: z.string().optional(),
    }).parse(req.body);
    const { data: existing } = await sbGet('establishments?select=id&limit=1');
    const arr = Array.isArray(existing) ? existing : [];
    if (!arr[0]) throw new AppError('Establishment not found', 404);
    const { data, ok } = await sbPatch(`establishments?id=eq.${arr[0].id}`, body);
    if (!ok) throw new AppError('Failed to update establishment', 500);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// ==================== STUDENT ENROLLMENT ====================

router.patch('/students/:studentId/enroll', async (req, res, next) => {
  try {
    const { classId } = z.object({ classId: z.string().uuid() }).parse(req.body);
    const { data, ok } = await sbPatch(`students?id=eq.${req.params.studentId}`, { class_id: classId });
    if (!ok || !data) throw new AppError('Student not found', 404);
    return res.json(successResponse(data, 'Student enrolled in class'));
  } catch (err) { return next(err); }
});

export default router;