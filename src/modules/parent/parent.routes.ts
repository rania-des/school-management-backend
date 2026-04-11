import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);
router.use(authorize('parent', 'admin'));

// GET /parents/children
router.get('/children', async (req, res, next) => {
  try {
    const { data: parent } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('profile_id', req.user!.id)
      .single();

    if (!parent) {
      throw new AppError('Parent not found', 404);
    }

    const { data: children, error } = await supabaseAdmin
      .from('parent_student')
      .select(`
        student_id,
        relationship,
        is_primary,
        students(
          id,
          student_number,
          class_id,
          classes(name),
          users:profile_id(first_name, last_name, email, avatar_url)
        )
      `)
      .eq('parent_id', parent.id);

    if (error) {
      throw new AppError('Failed to fetch children', 500);
    }

    res.json(successResponse(children || []));
  } catch (err) {
    next(err);
  }
});

export default router;