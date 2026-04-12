import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import { sbGetOne } from '../../utils/sbClient';

const router = Router();
router.use(authenticate);
router.use(authorize('student', 'admin'));

// GET /student/my-profile
router.get('/my-profile', async (req, res, next) => {
  try {
    const student = await sbGetOne(
      'students',
      `profile_id=eq.${req.user!.id}&select=*,classes(name),profiles:profile_id(first_name,last_name,email,avatar_url,phone)`
    );
    if (!student) throw new AppError('Student not found', 404);
    res.json(successResponse(student));
  } catch (err) { next(err); }
});

export default router;