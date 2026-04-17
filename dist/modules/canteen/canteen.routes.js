"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const menuSchema = zod_1.z.object({
    date: zod_1.z.string(),
    starter: zod_1.z.string().optional(),
    mainCourse: zod_1.z.string().min(1),
    sideDish: zod_1.z.string().optional(),
    dessert: zod_1.z.string().optional(),
    isVegetarianOption: zod_1.z.boolean().default(false),
    notes: zod_1.z.string().optional(),
});
// GET /canteen/menus - get menus for a date range
router.get('/menus', async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        // Default: current week
        const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data, error } = await supabase_1.supabaseAdmin
            .from('canteen_menus')
            .select('*')
            .gte('date', start)
            .lte('date', end)
            .order('date');
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch menus', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// GET /canteen/menus/today
router.get('/menus/today', async (req, res, next) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase_1.supabaseAdmin
            .from('canteen_menus').select('*').eq('date', today).single();
        if (error)
            return res.json((0, pagination_1.successResponse)(null, 'No menu for today'));
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// POST /canteen/menus - admin creates/updates menu
router.post('/menus', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const body = menuSchema.parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
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
        if (error)
            throw new error_middleware_1.AppError('Failed to save menu', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /canteen/menus/:id
router.patch('/menus/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const updates = menuSchema.partial().parse(req.body);
        const mapped = {};
        if (updates.starter !== undefined)
            mapped.starter = updates.starter;
        if (updates.mainCourse)
            mapped.main_course = updates.mainCourse;
        if (updates.sideDish !== undefined)
            mapped.side_dish = updates.sideDish;
        if (updates.dessert !== undefined)
            mapped.dessert = updates.dessert;
        if (updates.isVegetarianOption !== undefined)
            mapped.is_vegetarian_option = updates.isVegetarianOption;
        if (updates.notes !== undefined)
            mapped.notes = updates.notes;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('canteen_menus').update(mapped).eq('id', req.params.id).select().single();
        if (error || !data)
            throw new error_middleware_1.AppError('Menu not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /canteen/menus/:id
router.delete('/menus/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        await supabase_1.supabaseAdmin.from('canteen_menus').delete().eq('id', req.params.id);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=canteen.routes.js.map