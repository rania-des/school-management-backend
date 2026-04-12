import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import { sbGetOne, sbGet } from '../../utils/sbClient';

const router = Router();
router.use(authenticate);
router.use(authorize('parent', 'admin'));

// GET /parent/children
router.get('/children', async (req, res, next) => {
  try {
    const parent = await sbGetOne('parents', `profile_id=eq.${req.user!.id}&select=id`);
    if (!parent) throw new AppError('Parent not found', 404);

    const children = await sbGet(
      'parent_student',
      `parent_id=eq.${parent.id}&select=student_id,relationship,is_primary,students(id,student_number,class_id,classes(name),profiles:profile_id(first_name,last_name,email,avatar_url))`
    );
    res.json(successResponse(children));
  } catch (err) { next(err); }
});

export default router;