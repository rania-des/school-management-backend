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
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  gender: z.enum(['male', 'female']).optional(),
  dateOfBirth: z.string().optional(),
  specialization: z.string().optional(),
});

async function getRoleId(profileId: string, role: string): Promise<string | null> {
  if (role === 'student') {
    const { data } = await supabaseAdmin.from('students').select('id').eq('profile_id', profileId).maybeSingle();
    return data?.id || null;
  } else if (role === 'teacher') {
    const { data } = await supabaseAdmin.from('teachers').select('id').eq('profile_id', profileId).maybeSingle();
    return data?.id || null;
  } else if (role === 'parent') {
    const { data } = await supabaseAdmin.from('parents').select('id').eq('profile_id', profileId).maybeSingle();
    return data?.id || null;
  }
  return null;
}

async function getRoleData(profileId: string, role: string): Promise<any> {
  if (role === 'student') {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select(`
        *,
        classes(name, academic_years(name)),
        parent_student(
          id, is_primary, relationship,
          parents(
            id, profile_id,
            profiles(first_name, last_name, email, phone)
          )
        )
      `)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error) console.error('getRoleData student error:', error.message);
    else console.log('getRoleData student:', profileId, '| data:', JSON.stringify(data));
    return data;
  } else if (role === 'teacher') {
    const { data } = await supabaseAdmin
      .from('teachers')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();
    return data;
  } else if (role === 'parent') {
    const { data } = await supabaseAdmin
      .from('parents')
      .select(`
        *,
        parent_student(
          id, is_primary,
          students(
            id, student_number,
            profiles(first_name, last_name),
            classes(name)
          )
        )
      `)
      .eq('profile_id', profileId)
      .maybeSingle();
    return data;
  }
  return null;
}

router.get('/me/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles').select('*').eq('id', req.user!.id).single();
    if (error || !data) throw new AppError('Profile not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

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
      .from('profiles').update(updateData).eq('id', req.user!.id).select().single();
    if (error) throw new AppError('Failed to update profile', 500);
    return res.json(successResponse(data, 'Profile updated successfully'));
  } catch (err) { return next(err); }
});

router.post('/me/avatar', upload.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);
    const url = await uploadFile(STORAGE_BUCKETS.AVATARS, req.file, req.user!.id);
    const { data } = await supabaseAdmin
      .from('profiles').update({ avatar_url: url }).eq('id', req.user!.id).select('avatar_url').single();
    return res.json(successResponse({ avatarUrl: data?.avatar_url }));
  } catch (err) { return next(err); }
});

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
    const { data, error } = await supabaseAdmin
      .from('profiles').update(updateData).eq('id', req.params.id).select().single();
    if (error || !data) throw new AppError('User not found', 404);
    if (body.specialization && data.role === 'teacher') {
      await supabaseAdmin.from('teachers')
        .update({ specialization: body.specialization })
        .eq('profile_id', req.params.id);
    }
    return res.json(successResponse(data, 'Profile updated'));
  } catch (err) { return next(err); }
});

router.patch('/:id/role', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = z.object({
      role: z.enum(['student', 'teacher', 'parent', 'admin'])
    }).parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('profiles').update({ role }).eq('id', req.params.id).select().single();
    if (error || !data) throw new AppError('User not found', 404);
    return res.json(successResponse(data, 'Role updated'));
  } catch (err) { return next(err); }
});

router.get('/', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { role, search } = req.query;
    let query = supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (role) query = query.eq('role', role as string);
    if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, count, error } = await query;
    if (error) throw new AppError('Failed to fetch users', 500);
    const enriched = await Promise.all((data || []).map(async (profile: any) => {
      const roleId = await getRoleId(profile.id, profile.role);
      let className = null;
      if (profile.role === 'student' && roleId) {
        const { data: student } = await supabaseAdmin
          .from('students').select('classes(name)').eq('id', roleId).maybeSingle();
        className = (student as any)?.classes?.name || null;
      }
      return {
        ...profile,
        roleId,
        roleData: className ? { classes: { name: className } } : undefined,
      };
    }));
    return res.json(paginate(enriched, count || 0, { page, limit, offset }));
  } catch (err) { return next(err); }
});

router.get('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles').select('*').eq('id', req.params.id).single();
    if (error || !data) throw new AppError('User not found', 404);
    const roleId = await getRoleId(data.id, data.role);
    const roleData = await getRoleData(data.id, data.role);
    return res.json(successResponse({ ...data, roleId, roleData }));
  } catch (err) { return next(err); }
});

router.patch('/:id/status', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('profiles').update({ is_active: isActive }).eq('id', req.params.id).select().single();
    if (error || !data) throw new AppError('User not found', 404);
    return res.json(successResponse(data, `User ${isActive ? 'activated' : 'deactivated'}`));
  } catch (err) { return next(err); }
});

router.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.user!.id) throw new AppError('Cannot delete your own account', 400);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) throw new AppError('Failed to delete user', 500);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;