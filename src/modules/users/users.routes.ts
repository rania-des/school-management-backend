import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { uploadFile, STORAGE_BUCKETS } from '../../utils/storage';
import multer from 'multer';
import { getPagination, paginate, successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const updateProfileSchema = z.object({
  firstName: z.string().min(2).max(100).optional(),
  lastName: z.string().min(2).max(100).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  gender: z.enum(['male', 'female']).optional(),
  dateOfBirth: z.string().optional(),
});

// GET /users/me/profile - update own profile
router.get('/me/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user!.id)
      .single();

    if (error || !data) throw new AppError('Profile not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
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

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', req.user!.id)
      .select()
      .single();

    if (error) throw new AppError('Failed to update profile', 500);
    return res.json(successResponse(data, 'Profile updated successfully'));
  } catch (err) {
    return next(err);
  }
});

// POST /users/me/avatar
router.post('/me/avatar', upload.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const url = await uploadFile(STORAGE_BUCKETS.AVATARS, req.file, req.user!.id);

    const { data } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', req.user!.id)
      .select('avatar_url')
      .single();

    return res.json(successResponse({ avatarUrl: data?.avatar_url }));
  } catch (err) {
    return next(err);
  }
});

// ==================== ADMIN ROUTES ====================

// GET /users - list all users (admin only)
router.get('/', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { role, search } = req.query;

    let query = supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (role) query = query.eq('role', role);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) throw new AppError('Failed to fetch users', 500);

    return res.json(paginate(data || [], count || 0, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

// GET /users/:id (admin only)
router.get('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) throw new AppError('User not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /users/:id/status (admin: activate/deactivate)
router.patch('/:id/status', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) throw new AppError('User not found', 404);
    return res.json(successResponse(data, `User ${isActive ? 'activated' : 'deactivated'}`));
  } catch (err) {
    return next(err);
  }
});

// DELETE /users/:id (admin only)
router.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.user!.id) {
      throw new AppError('Cannot delete your own account', 400);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) throw new AppError('Failed to delete user', 500);

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export default router;
