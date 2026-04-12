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
    const { data } = await sbGet(`profiles?id=eq.${req.user!.id}`);
    const user = Array.isArray(data) ? data[0] : null;
    if (!user) throw new AppError('Profile not found', 404);
    return res.json(successResponse(user));
  } catch (err) { return next(err); }
});

// PATCH /users/me/profile
router.patch('/me/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    const updateData: Record<string, unknown> = {};
    if (body.firstName) updateData.first_name = body.firstName;
    if (body.lastName) updateData.last_name = body.lastName;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.gender) updateData.gender = body.gender;
    if (body.dateOfBirth) updateData.date_of_birth = body.dateOfBirth;
    const { data, ok } = await sbPatch(`profiles?id=eq.${req.user!.id}`, updateData);
    if (!ok) throw new AppError('Failed to update profile', 500);
    return res.json(successResponse(data, 'Profile updated successfully'));
  } catch (err) { return next(err); }
});

// PATCH /users/:id/profile (admin)
router.patch('/:id/profile', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    const updateData: Record<string, unknown> = {};
    if (body.firstName) updateData.first_name = body.firstName;
    if (body.lastName) updateData.last_name = body.lastName;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.gender) updateData.gender = body.gender;
    if (body.dateOfBirth) updateData.date_of_birth = body.dateOfBirth;
    const { data, ok } = await sbPatch(`profiles?id=eq.${req.params.id}`, updateData);
    if (!ok || !data) throw new AppError('User not found', 404);
    return res.json(successResponse(data, 'Profile updated'));
  } catch (err) { return next(err); }
});

// PATCH /users/:id/role (admin)
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

// GET /users - admin + teacher
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

    return res.json(paginate(arr, arr.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// GET /users/:id
router.get('/:id', authorize('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = await sbGet(`profiles?id=eq.${req.params.id}`);
    const user = Array.isArray(data) ? data[0] : null;
    if (!user) throw new AppError('User not found', 404);
    if (req.user!.role === 'teacher' && user.role !== 'student') {
      throw new AppError('Forbidden', 403);
    }
    return res.json(successResponse(user));
  } catch (err) { return next(err); }
});

// PATCH /users/:id/status (admin)
router.patch('/:id/status', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const { data, ok } = await sbPatch(`profiles?id=eq.${req.params.id}`, { is_active: isActive });
    if (!ok || !data) throw new AppError('User not found', 404);
    return res.json(successResponse(data, `User ${isActive ? 'activated' : 'deactivated'}`));
  } catch (err) { return next(err); }
});

export default router;