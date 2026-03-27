import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

// GET /notifications
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new AppError('Failed to fetch notifications', 500);
    return res.json(successResponse(data || []));
  } catch (err) { return next(err); }
});

// GET /notifications/unread-count
router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('is_read', false);
    if (error) throw new AppError('Failed to fetch count', 500);
    return res.json(successResponse({ count: count || 0 }));
  } catch (err) { return next(err); }
});

// PATCH /notifications/read-all
router.patch('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    await supabaseAdmin.from('notifications').update({ is_read: true }).eq('recipient_id', userId).eq('is_read', false);
    return res.json(successResponse(null, 'All marked as read'));
  } catch (err) { return next(err); }
});

// PATCH /notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    await supabaseAdmin.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('recipient_id', userId);
    return res.json(successResponse(null));
  } catch (err) { return next(err); }
});

// DELETE /notifications/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    await supabaseAdmin.from('notifications').delete().eq('id', req.params.id).eq('recipient_id', userId);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;
