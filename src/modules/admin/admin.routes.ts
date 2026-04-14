import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import crypto from 'crypto';

const router = Router();
router.use(authenticate, authorize('admin'));

// ── Supabase REST helpers (avec clés hardcodées comme dans teacher.routes.ts) ──
const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

function sbHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

async function sbGet(table: string, params = ''): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbGet ${table} → ${res.status}:`, err);
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data ? [data] : []);
}

async function sbGetOne(table: string, params = ''): Promise<any> {
  const rows = await sbGet(table, params);
  return rows[0] ?? null;
}

async function sbInsert(table: string, body: object | object[]): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbInsert ${table} → ${res.status}:`, err);
    throw new Error(`DB insert failed on ${table}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data.length > 0 ? data[0] : data) : data;
}

async function sbUpdate(table: string, params: string, body: object): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbUpdate ${table} → ${res.status}:`, err);
    throw new Error(`DB update failed on ${table}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data.length > 0 ? data[0] : data) : data;
}

async function sbDelete(table: string, params: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: sbHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbDelete ${table} → ${res.status}:`, err);
    throw new Error(`DB delete failed on ${table}`);
  }
}

// ── Helpers pour créer automatiquement les entrées manquantes ─────────────────
async function ensureStudentExists(profileId: string): Promise<string> {
  // Chercher l'étudiant existant dans la table students
  let student = await sbGetOne('students', `profile_id=eq.${profileId}`);
  
  if (!student) {
    // Créer l'entrée student si elle n'existe pas
    const studentNumber = `STU${Date.now()}${Math.floor(Math.random() * 1000)}`;
    student = await sbInsert('students', {
      id: crypto.randomUUID(),
      profile_id: profileId,
      student_number: studentNumber,
      enrollment_date: new Date().toISOString().split('T')[0],
    });
    console.log(`✅ Auto-created student record for profile ${profileId} with ID ${student.id}`);
  }
  
  return student.id;
}

async function ensureParentExists(profileId: string): Promise<string> {
  // Chercher le parent existant dans la table parents
  let parent = await sbGetOne('parents', `profile_id=eq.${profileId}`);
  
  if (!parent) {
    // Créer l'entrée parent si elle n'existe pas
    parent = await sbInsert('parents', {
      id: crypto.randomUUID(),
      profile_id: profileId,
    });
    console.log(`✅ Auto-created parent record for profile ${profileId} with ID ${parent.id}`);
  }
  
  return parent.id;
}

async function ensureTeacherExists(profileId: string): Promise<string> {
  // Chercher l'enseignant existant dans la table teachers
  let teacher = await sbGetOne('teachers', `profile_id=eq.${profileId}`);
  
  if (!teacher) {
    // Créer l'entrée teacher si elle n'existe pas
    teacher = await sbInsert('teachers', {
      id: crypto.randomUUID(),
      profile_id: profileId,
      employee_number: `TCH${Date.now()}${Math.floor(Math.random() * 1000)}`,
      hire_date: new Date().toISOString().split('T')[0],
    });
    console.log(`✅ Auto-created teacher record for profile ${profileId} with ID ${teacher.id}`);
  }
  
  return teacher.id;
}

// ── SECTIONS ──────────────────────────────────────────────────────────────────
router.get('/sections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await sbGet('sections', 'select=*&order=name').catch(() => null);
    if (!data || data.length === 0) return res.json(successResponse([
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
    if (!data || data.length === 0) return res.json(successResponse([
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
    
    // S'assurer que l'enseignant existe dans la table teachers
    await ensureTeacherExists(body.teacherId);
    
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

// ✅ CORRIGÉ: POST /parent-student avec auto-création des entrées manquantes
router.post('/parent-student', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      parentId: z.string().uuid(),
      studentId: z.string().uuid(),
      relationship: z.string().default('parent'),
      isPrimary: z.boolean().default(false),
    }).parse(req.body);
    
    // Ici parentId et studentId sont des profile_ids (IDs de la table profiles)
    // Il faut les convertir en IDs des tables parents/students
    const parentTableId = await ensureParentExists(body.parentId);
    const studentTableId = await ensureStudentExists(body.studentId);
    
    console.log(`Liaison parent-student: parentTableId=${parentTableId}, studentTableId=${studentTableId}`);
    
    const data = await sbInsert('parent_student', {
      parent_id: parentTableId,
      student_id: studentTableId,
      relationship: body.relationship,
      is_primary: body.isPrimary,
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
    
    // S'assurer que l'étudiant existe dans la table students
    const studentTableId = await ensureStudentExists(req.params.id);
    
    const data = await sbUpdate('students', `id=eq.${studentTableId}`, updates);
    if (!data) throw new AppError('Student not found', 404);
    return res.json(successResponse(data, 'Student updated'));
  } catch (err) { return next(err); }
});

// ✅ CORRIGÉ: PATCH /students/:studentId/enroll - Affectation à une classe
router.patch('/students/:studentId/enroll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId } = z.object({ classId: z.string().uuid() }).parse(req.body);
    
    console.log(`📚 Enrollment request: studentId=${req.params.studentId}, classId=${classId}`);
    
    // Ici studentId est le profile_id (ID de la table profiles)
    // Il faut d'abord s'assurer qu'il a une entrée dans students
    const studentTableId = await ensureStudentExists(req.params.studentId);
    
    console.log(`📚 Student table ID: ${studentTableId}`);
    
    // Mettre à jour la classe
    const data = await sbUpdate('students', `id=eq.${studentTableId}`, { class_id: classId });
    
    if (!data) throw new AppError('Student not found', 404);
    
    // Vérifier que la mise à jour a bien fonctionné
    const updatedStudent = await sbGetOne('students', `id=eq.${studentTableId}`);
    console.log(`📚 Updated student: class_id=${updatedStudent?.class_id}`);
    
    return res.json(successResponse(data, 'Student enrolled in class'));
  } catch (err) { 
    console.error('❌ Enrollment error:', err);
    return next(err); 
  }
});

// ── TEACHER MANAGEMENT ────────────────────────────────────────────────────────
router.patch('/teachers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { specialization, employeeNumber, hireDate } = req.body;
    const updates: any = {};
    if (specialization !== undefined) updates.specialization = specialization;
    if (employeeNumber !== undefined) updates.employee_number = employeeNumber;
    if (hireDate !== undefined) updates.hire_date = hireDate;
    
    // S'assurer que l'enseignant existe dans la table teachers
    const teacherTableId = await ensureTeacherExists(req.params.id);
    
    const data = await sbUpdate('teachers', `id=eq.${teacherTableId}`, updates);
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
    
    // S'assurer que le parent existe dans la table parents
    const parentTableId = await ensureParentExists(req.params.id);
    
    const data = await sbUpdate('parents', `id=eq.${parentTableId}`, updates);
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

export default router;