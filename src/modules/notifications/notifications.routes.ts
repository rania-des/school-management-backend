import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

// GET /notifications
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { isRead, type } = req.query;

    let query = supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('recipient_id', req.user!.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (isRead !== undefined) query = query.eq('is_read', isRead === 'true');
    if (type) query = query.eq('type', type);

    const { data, count, error } = await query;
    if (error) throw new AppError('Failed to fetch notifications', 500);

    return res.json(paginate(data || [], count || 0, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

// GET /notifications/unread-count
router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', req.user!.id)
      .eq('is_read', false);

    if (error) throw new AppError('Failed to fetch count', 500);
    return res.json(successResponse({ count: count || 0 }));
  } catch (err) {
    return next(err);
  }
});

// PATCH /notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('recipient_id', req.user!.id)
      .select()
      .single();

    if (error || !data) throw new AppError('Notification not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /notifications/read-all
router.patch('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_id', req.user!.id)
      .eq('is_read', false);

    if (error) throw new AppError('Failed to mark all as read', 500);
    return res.json(successResponse(null, 'All notifications marked as read'));
  } catch (err) {
    return next(err);
  }
});

// DELETE /notifications/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('id', req.params.id)
      .eq('recipient_id', req.user!.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export default router;
