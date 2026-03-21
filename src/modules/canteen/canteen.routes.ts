import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const menuSchema = z.object({
  date: z.string(),
  starter: z.string().optional(),
  mainCourse: z.string().min(1),
  sideDish: z.string().optional(),
  dessert: z.string().optional(),
  isVegetarianOption: z.boolean().default(false),
  notes: z.string().optional(),
});

// GET /canteen/menus - get menus for a date range
router.get('/menus', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;

    // Default: current week
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('canteen_menus')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date');

    if (error) throw new AppError('Failed to fetch menus', 500);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// GET /canteen/menus/today
router.get('/menus/today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabaseAdmin
      .from('canteen_menus').select('*').eq('date', today).single();

    if (error) return res.json(successResponse(null, 'No menu for today'));
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// POST /canteen/menus - admin creates/updates menu
router.post('/menus', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = menuSchema.parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('canteen_menus')
      .upsert({
        date: body.date,
        starter: body.starter,
        main_course: body.mainCourse,
        side_dish: body.sideDish,
        dessert: body.dessert,
        is_vegetarian_option: body.isVegetarianOption,
        notes: body.notes,
      }, { onConflict: 'date' })
      .select()
      .single();

    if (error) throw new AppError('Failed to save menu', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /canteen/menus/:id
router.patch('/menus/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = menuSchema.partial().parse(req.body);
    const mapped: Record<string, unknown> = {};
    if (updates.starter !== undefined) mapped.starter = updates.starter;
    if (updates.mainCourse) mapped.main_course = updates.mainCourse;
    if (updates.sideDish !== undefined) mapped.side_dish = updates.sideDish;
    if (updates.dessert !== undefined) mapped.dessert = updates.dessert;
    if (updates.isVegetarianOption !== undefined) mapped.is_vegetarian_option = updates.isVegetarianOption;
    if (updates.notes !== undefined) mapped.notes = updates.notes;

    const { data, error } = await supabaseAdmin
      .from('canteen_menus').update(mapped).eq('id', req.params.id).select().single();

    if (error || !data) throw new AppError('Menu not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// DELETE /canteen/menus/:id
router.delete('/menus/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supabaseAdmin.from('canteen_menus').delete().eq('id', req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export default router;
