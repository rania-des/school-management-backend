import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);
router.use(authorize('student', 'admin'));

// GET /students/my-profile
router.get('/my-profile', async (req, res, next) => {
  try {
    const { data: student, error } = await supabaseAdmin
      .from('students')
      .select(`
        *,
        classes(name),
        users:profile_id(first_name, last_name, email, avatar_url, phone)
      `)
      .eq('profile_id', req.user!.id)
      .single();

    if (error || !student) {
      throw new AppError('Student not found', 404);
    }

    res.json(successResponse(student));
  } catch (err) {
    next(err);
  }
});

export default router;