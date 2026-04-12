import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { getPagination, paginate, successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  return { data: await res.json(), ok: res.ok };
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

// GET /users/me/profile
router.get('/me/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Table : profiles (confirmé dans la liste des tables)
    const { data } = await sbGet(`profiles?id=eq.${req.user!.id}&select=*`);
    const user = Array.isArray(data) ? data[0] : null;
    if (!user) throw new AppError('Profile not found', 404);
    return res.json(successResponse(user));
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
    return res.json(successResponse(data, 'Profile updated successfully'));
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
    return res.json(successResponse(data, 'Profile updated'));
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
    return res.json(successResponse(data, 'Role updated'));
  } catch (err) { return next(err); }
});

// GET /users  — admin voit tout, teacher voit seulement students
router.get('/', authorize('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { role, search } = req.query;

    // Table : profiles
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

    // Enrichir chaque user avec son class_id si student
    const enriched = await Promise.all(arr.map(async (user: any) => {
      if (user.role === 'student') {
        const { data: st } = await sbGet(`students?profile_id=eq.${user.id}&select=id,class_id`);
        const student = Array.isArray(st) ? st[0] : null;
        if (student?.class_id) {
          const { data: cls } = await sbGet(`classes?id=eq.${student.class_id}&select=name`);
          const className = Array.isArray(cls) ? cls[0]?.name : null;
          return { ...user, roleId: student.id, roleData: { classes: { name: className } } };
        }
        return { ...user, roleId: student?.id || null };
      }
      if (user.role === 'teacher') {
        const { data: te } = await sbGet(`teachers?profile_id=eq.${user.id}&select=id`);
        const teacher = Array.isArray(te) ? te[0] : null;
        return { ...user, roleId: teacher?.id || null };
      }
      if (user.role === 'parent') {
        const { data: pa } = await sbGet(`parents?profile_id=eq.${user.id}&select=id`);
        const parent = Array.isArray(pa) ? pa[0] : null;
        return { ...user, roleId: parent?.id || null };
      }
      return user;
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
    return res.json(successResponse(user));
  } catch (err) { return next(err); }
});

// PATCH /users/:id/status
router.patch('/:id/status', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const { data, ok } = await sbPatch(`profiles?id=eq.${req.params.id}`, { is_active: isActive });
    if (!ok || !data) throw new AppError('User not found', 404);
    return res.json(successResponse(data, `User ${isActive ? 'activated' : 'deactivated'}`));
  } catch (err) { return next(err); }
});

export default router;