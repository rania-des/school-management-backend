import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { getPagination, paginate, successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  const data = await res.json();
  if (!res.ok) console.error(`❌ sbGet ${path.split('?')[0]} → ${res.status}:`, JSON.stringify(data).slice(0, 200));
  return { data, ok: res.ok };
}
async function sbPatch(path: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any[];
  return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
}

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  gender: z.enum(['male', 'female']).optional(),
  dateOfBirth: z.string().optional(),
  specialization: z.string().optional(),
});

// Helper pour récupérer les données spécifiques au rôle
async function getRoleData(profileId: string, role: string): Promise<any> {
  if (role === 'student') {
    const { data } = await sbGet(`students?profile_id=eq.${profileId}&select=*,classes:class_id(id,name)`);
    const student = Array.isArray(data) ? data[0] : null;
    if (student) {
      const classes = Array.isArray(student.classes) ? student.classes[0] : student.classes;
      return {
        id: student.id,
        student_number: student.student_number,
        class_id: student.class_id,
        enrollment_date: student.enrollment_date,
        classes: classes ? { id: classes.id, name: classes.name } : null
      };
    }
    return null;
  }
  if (role === 'teacher') {
    const { data } = await sbGet(`teachers?profile_id=eq.${profileId}&select=*`);
    const teacher = Array.isArray(data) ? data[0] : null;
    return teacher ? {
      id: teacher.id,
      specialization: teacher.specialization,
      employee_number: teacher.employee_number,
      hire_date: teacher.hire_date
    } : null;
  }
  if (role === 'parent') {
    const { data } = await sbGet(`parents?profile_id=eq.${profileId}&select=*`);
    const parent = Array.isArray(data) ? data[0] : null;
    return parent ? {
      id: parent.id,
      profession: parent.profession
    } : null;
  }
  return null;
}

// GET /users/me/profile
router.get('/me/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = await sbGet(`profiles?id=eq.${req.user!.id}&select=*`);
    const user = Array.isArray(data) ? data[0] : null;
    if (!user) throw new AppError('Profile not found', 404);
    
    // Ajouter les données spécifiques au rôle
    const roleData = await getRoleData(req.user!.id, user.role);
    
    return res.json(successResponse({ ...user, roleData }));
  } catch (err) { return next(err); }
});

// PATCH /users/me/profile
router.patch('/me/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    const upd: Record<string, unknown> = {};
    if (body.firstName) upd.first_name = body.firstName;
    if (body.lastName) upd.last_name = body.lastName;
    if (body.phone !== undefined) upd.phone = body.phone;
    if (body.address !== undefined) upd.address = body.address;
    if (body.gender) upd.gender = body.gender;
    if (body.dateOfBirth) upd.date_of_birth = body.dateOfBirth;
    const { data, ok } = await sbPatch(`profiles?id=eq.${req.user!.id}`, upd);
    if (!ok) throw new AppError('Failed to update profile', 500);
    
    // Ajouter les données spécifiques au rôle
    const roleData = await getRoleData(req.user!.id, data.role);
    
    return res.json(successResponse({ ...data, roleData }, 'Profile updated successfully'));
  } catch (err) { return next(err); }
});

// PATCH /users/:id/profile (admin)
router.patch('/:id/profile', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    const upd: Record<string, unknown> = {};
    if (body.firstName) upd.first_name = body.firstName;
    if (body.lastName) upd.last_name = body.lastName;
    if (body.phone !== undefined) upd.phone = body.phone;
    if (body.address !== undefined) upd.address = body.address;
    if (body.gender) upd.gender = body.gender;
    if (body.dateOfBirth) upd.date_of_birth = body.dateOfBirth;
    const { data, ok } = await sbPatch(`profiles?id=eq.${req.params.id}`, upd);
    if (!ok || !data) throw new AppError('User not found', 404);
    
    // Ajouter les données spécifiques au rôle
    const roleData = await getRoleData(req.params.id, data.role);
    
    return res.json(successResponse({ ...data, roleData }, 'Profile updated'));
  } catch (err) { return next(err); }
});

// PATCH /users/:id/role
router.patch('/:id/role', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = z.object({
      role: z.enum(['student', 'teacher', 'parent', 'admin'])
    }).parse(req.body);
    const { data, ok } = await sbPatch(`profiles?id=eq.${req.params.id}`, { role });
    if (!ok || !data) throw new AppError('User not found', 404);
    
    // Ajouter les données spécifiques au rôle
    const roleData = await getRoleData(req.params.id, role);
    
    return res.json(successResponse({ ...data, roleData }, 'Role updated'));
  } catch (err) { return next(err); }
});

// GET /users  — admin voit tout, teacher voit seulement students
router.get('/', authorize('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { role, search } = req.query;

    let url = `profiles?select=*&order=created_at.desc&offset=${offset}&limit=${limit}`;

    if (role) {
      url += `&role=eq.${role}`;
    } else if (req.user!.role === 'teacher') {
      url += `&role=eq.student`;
    }

    if (search) {
      url += `&or=(first_name.ilike.*${search}*,last_name.ilike.*${search}*,email.ilike.*${search}*)`;
    }

    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];

    // Enrichir chaque user avec ses données spécifiques au rôle
    const enriched = await Promise.all(arr.map(async (user: any) => {
      const roleData = await getRoleData(user.id, user.role);
      return { ...user, roleData };
    }));

    return res.json(paginate(enriched, enriched.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// GET /users/:id
router.get('/:id', authorize('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = await sbGet(`profiles?id=eq.${req.params.id}&select=*`);
    const user = Array.isArray(data) ? data[0] : null;
    if (!user) throw new AppError('User not found', 404);
    if (req.user!.role === 'teacher' && user.role !== 'student') throw new AppError('Forbidden', 403);
    
    // ✅ CORRIGÉ: Ajouter les données spécifiques au rôle (ID dans tables students/parents/teachers)
    const roleData = await getRoleData(req.params.id, user.role);
    
    return res.json(successResponse({ ...user, roleData }));
  } catch (err) { return next(err); }
});

// PATCH /users/:id/status
router.patch('/:id/status', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const { data, ok } = await sbPatch(`profiles?id=eq.${req.params.id}`, { is_active: isActive });
    if (!ok || !data) throw new AppError('User not found', 404);
    
    // Ajouter les données spécifiques au rôle
    const roleData = await getRoleData(req.params.id, data.role);
    
    return res.json(successResponse({ ...data, roleData }, `User ${isActive ? 'activated' : 'deactivated'}`));
  } catch (err) { return next(err); }
});

export default router;