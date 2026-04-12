import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { uploadFile, STORAGE_BUCKETS } from '../../utils/storage';
import { getPagination, paginate, successResponse } from '../../utils/pagination';
import { sbGet, sbGetOne, sbUpdate, sbDelete } from '../../utils/sbClient';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
    const data = await sbGetOne('profiles', `id=eq.${req.user!.id}&select=*`);
    if (!data) throw new AppError('Profile not found', 404);
    return res.json(successResponse(data));
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
    const data = await sbUpdate('profiles', `id=eq.${req.user!.id}`, updateData);
    return res.json(successResponse(data, 'Profile updated successfully'));
  } catch (err) { return next(err); }
});

// POST /users/me/avatar
router.post('/me/avatar', upload.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);
    const url = await uploadFile(STORAGE_BUCKETS.AVATARS, req.file, req.user!.id);
    await sbUpdate('profiles', `id=eq.${req.user!.id}`, { avatar_url: url });
    return res.json(successResponse({ avatarUrl: url }));
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
    const data = await sbUpdate('profiles', `id=eq.${req.params.id}`, updateData);
    if (!data) throw new AppError('User not found', 404);
    if (body.specialization && data.role === 'teacher') {
      await sbUpdate('teachers', `profile_id=eq.${req.params.id}`, { specialization: body.specialization });
    }
    return res.json(successResponse(data, 'Profile updated'));
  } catch (err) { return next(err); }
});

// PATCH /users/:id/role (admin)
router.patch('/:id/role', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = z.object({ role: z.enum(['student', 'teacher', 'parent', 'admin']) }).parse(req.body);
    const data = await sbUpdate('profiles', `id=eq.${req.params.id}`, { role });
    if (!data) throw new AppError('User not found', 404);
    return res.json(successResponse(data, 'Role updated'));
  } catch (err) { return next(err); }
});

// GET /users (admin + teacher)
router.get('/', authorize('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { role, search } = req.query;
    let params = `select=*&order=created_at.desc&offset=${offset}&limit=${limit}`;
    if (role) params += `&role=eq.${role}`;
    else if (req.user!.role === 'teacher') params += `&role=eq.student`;
    if (search) params += `&or=(first_name.ilike.*${search}*,last_name.ilike.*${search}*,email.ilike.*${search}*)`;
    const data = await sbGet('profiles', params);
    return res.json(paginate(data, data.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// GET /users/:id (admin + teacher)
router.get('/:id', authorize('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await sbGetOne('profiles', `id=eq.${req.params.id}&select=*`);
    if (!data) throw new AppError('User not found', 404);
    if (req.user!.role === 'teacher' && data.role !== 'student') throw new AppError('Forbidden', 403);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /users/:id/status (admin)
router.patch('/:id/status', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const data = await sbUpdate('profiles', `id=eq.${req.params.id}`, { is_active: isActive });
    if (!data) throw new AppError('User not found', 404);
    return res.json(successResponse(data, `User ${isActive ? 'activated' : 'deactivated'}`));
  } catch (err) { return next(err); }
});

// DELETE /users/:id (admin) — uses Supabase Auth Admin API via fetch
router.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.user!.id) throw new AppError('Cannot delete your own account', 400);
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const res2 = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${req.params.id}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!res2.ok) throw new AppError('Failed to delete user', 500);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;