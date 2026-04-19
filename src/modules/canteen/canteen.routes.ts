import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const menuSchema = z.object({
  date: z.string(),
  // Support single string (legacy) ou tableau
  starter: z.string().optional(),
  starters: z.array(z.string()).optional(),
  mainCourse: z.string().optional(),
  mainCourses: z.array(z.string()).optional(),
  sideDish: z.string().optional(),
  dessert: z.string().optional(),
  desserts: z.array(z.string()).optional(),
  isVegetarianOption: z.boolean().default(false),
  // Champs nutritionnels
  calories: z.number().nullable().optional(),
  proteins: z.number().nullable().optional(),
  carbs: z.number().nullable().optional(),
  fats: z.number().nullable().optional(),
  notes: z.string().optional(),
  // Régimes alimentaires particuliers
  allergens: z.array(z.string()).optional(),
  dietaryOptions: z.array(z.string()).optional(),
});

// Normalise le body reçu vers les colonnes DB
function buildDbPayload(body: z.infer<typeof menuSchema>) {
  // Tableaux -> stocker comme JSON dans des colonnes jsonb ou comme texte joint
  const starters = body.starters?.filter(Boolean) ?? (body.starter ? [body.starter] : []);
  const mainCourses = body.mainCourses?.filter(Boolean) ?? (body.mainCourse ? [body.mainCourse] : []);
  const desserts = body.desserts?.filter(Boolean) ?? (body.dessert ? [body.dessert] : []);

  return {
    date: body.date,
    // Colonnes texte legacy (compatibilité)
    starter: starters[0] ?? null,
    main_course: mainCourses[0] ?? '',
    side_dish: mainCourses[1] ?? body.sideDish ?? null,
    dessert: desserts[0] ?? null,
    // Colonnes jsonb pour les tableaux complets
    starters: starters,
    main_courses: mainCourses,
    desserts_list: desserts,
    // Végétarien
    is_vegetarian_option: body.isVegetarianOption ?? false,
    // Nutrition
    calories: body.calories ?? null,
    proteins: body.proteins ?? null,
    carbs: body.carbs ?? null,
    fats: body.fats ?? null,
    // Notes et régimes
    notes: body.notes ?? null,
    allergens: body.allergens ?? [],
    dietary_options: body.dietaryOptions ?? [],
  };
}

// GET /canteen/menus - accessible à tous les rôles authentifiés
router.get('/menus', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;
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

// POST /canteen/menus - admin crée/modifie un menu
router.post('/menus', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = menuSchema.parse(req.body);
    const payload = buildDbPayload(body);

    const { data, error } = await supabaseAdmin
      .from('canteen_menus')
      .upsert(payload, { onConflict: 'date' })
      .select()
      .single();

    if (error) throw new AppError(`Failed to save menu: ${error.message}`, 500);
    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /canteen/menus/:id
router.patch('/menus/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = menuSchema.partial().parse(req.body);
    const partial: Record<string, unknown> = {};

    // Champs tableau
    if (body.starters !== undefined || body.starter !== undefined) {
      const arr = body.starters?.filter(Boolean) ?? (body.starter ? [body.starter] : []);
      partial.starters = arr;
      partial.starter = arr[0] ?? null;
    }
    if (body.mainCourses !== undefined || body.mainCourse !== undefined) {
      const arr = body.mainCourses?.filter(Boolean) ?? (body.mainCourse ? [body.mainCourse] : []);
      partial.main_courses = arr;
      partial.main_course = arr[0] ?? '';
      partial.side_dish = arr[1] ?? body.sideDish ?? null;
    }
    if (body.desserts !== undefined || body.dessert !== undefined) {
      const arr = body.desserts?.filter(Boolean) ?? (body.dessert ? [body.dessert] : []);
      partial.desserts_list = arr;
      partial.dessert = arr[0] ?? null;
    }
    // Champs simples
    if (body.isVegetarianOption !== undefined) partial.is_vegetarian_option = body.isVegetarianOption;
    if (body.calories !== undefined) partial.calories = body.calories;
    if (body.proteins !== undefined) partial.proteins = body.proteins;
    if (body.carbs !== undefined) partial.carbs = body.carbs;
    if (body.fats !== undefined) partial.fats = body.fats;
    if (body.notes !== undefined) partial.notes = body.notes;
    if (body.allergens !== undefined) partial.allergens = body.allergens;
    if (body.dietaryOptions !== undefined) partial.dietary_options = body.dietaryOptions;

    const { data, error } = await supabaseAdmin
      .from('canteen_menus').update(partial).eq('id', req.params.id).select().single();

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

// =============================================================================
// ÉLÈVES (pour le select régimes)
// =============================================================================

// GET /canteen/students — liste élèves pour select régimes (admin seulement)
router.get('/students', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select(`
        id,
        profile_id,
        class:classes(id, name)
      `);

    if (error) throw new AppError('Failed to fetch students', 500);

    const profileIds = (data || []).map((s: any) => s.profile_id).filter(Boolean);
    const { data: profiles } = profileIds.length
      ? await supabaseAdmin.from('profiles').select('id, first_name, last_name').in('id', profileIds)
      : { data: [] };

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const result = (data || []).map((s: any) => ({
      id:         s.id,
      first_name: profileMap.get(s.profile_id)?.first_name || '',
      last_name:  profileMap.get(s.profile_id)?.last_name  || '',
      class_name: (s.class as any)?.name || '',
    }));

    return res.json(successResponse(result));
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// RÉGIMES ALIMENTAIRES PARTICULIERS
// =============================================================================

const dietSchema = z.object({
  student_id: z.string().uuid(),
  diet_type: z.enum(['vegetarian', 'vegan', 'halal', 'gluten_free', 'lactose_free', 'diabetic', 'allergy', 'other']),
  description: z.string().optional(),
  allergies: z.array(z.string()).default([]),
  valid_from: z.string().optional(),
  valid_until: z.string().optional(),
  medical_certificate_url: z.string().optional(),
  is_active: z.boolean().default(true),
});

// ✅ CORRIGÉ: GET /canteen/diets — accessible à student, parent ET admin
router.get('/diets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req as any;
    let studentId = req.query.student_id as string;

    if (user.role === 'student') {
      // Récupère l'ID étudiant lié au profil connecté, ignore le query param
      const { data: student, error: studentError } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('profile_id', user.id)
        .single();

      if (studentError || !student) return res.json(successResponse([]));
      studentId = student.id;

    } else if (user.role === 'parent') {
      if (!studentId) return res.json(successResponse([]));
      // Vérifie que l'enfant appartient à ce parent
      const { data: children } = await supabaseAdmin
        .from('students')
        .select('id, profiles!inner(id)')
        .eq('id', studentId);
      if (!children?.length) throw new AppError('Accès refusé', 403);

    } else if (user.role === 'admin') {
      if (!studentId) {
        // Admin sans student_id -> retourner tous les régimes
        const { data, error } = await supabaseAdmin
          .from('canteen_diets')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw new AppError('Failed to fetch diets', 500);
        
        // Enrichir avec les infos étudiant pour l'admin
        if (data && data.length > 0) {
          const studentIds = [...new Set(data.map((d: any) => d.student_id))];
          const { data: students } = await supabaseAdmin
            .from('students')
            .select('id, profile_id, class_id')
            .in('id', studentIds);
          
          const profileIds = [...new Set((students || []).map((s: any) => s.profile_id).filter(Boolean))];
          const { data: profiles } = profileIds.length
            ? await supabaseAdmin.from('profiles').select('id, first_name, last_name').in('id', profileIds)
            : { data: [] };
          
          const classIds = [...new Set((students || []).map((s: any) => s.class_id).filter(Boolean))];
          const { data: classes } = classIds.length
            ? await supabaseAdmin.from('classes').select('id, name').in('id', classIds)
            : { data: [] };
          
          const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
          const classMap = new Map((classes || []).map((c: any) => [c.id, c]));
          const studentMap = new Map((students || []).map((s: any) => [s.id, {
            id: s.id,
            first_name: profileMap.get(s.profile_id)?.first_name || '',
            last_name: profileMap.get(s.profile_id)?.last_name || '',
            class: classMap.get(s.class_id) || null,
          }]));
          
          const enriched = data.map((d: any) => ({
            ...d,
            student: studentMap.get(d.student_id) || null,
          }));
          return res.json(successResponse(enriched));
        }
        return res.json(successResponse(data || []));
      }

    } else {
      throw new AppError('Accès refusé', 403);
    }

    const { data, error } = await supabaseAdmin
      .from('canteen_diets')
      .select('*')
      .eq('student_id', studentId);

    if (error) throw new AppError('Failed to fetch diets', 500);
    return res.json(successResponse(data || []));
  } catch (err) {
    return next(err);
  }
});

// POST /canteen/diets — créer un régime (admin seulement)
router.post('/diets', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = dietSchema.parse(req.body);

    // Vérifier que l'étudiant existe
    const { data: studentCheck, error: studentError } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('id', body.student_id)
      .single();

    if (studentError || !studentCheck) {
      console.error('Student not found error:', studentError);
      return res.status(400).json({ error: `Student not found: ${body.student_id}` });
    }

    const { data, error } = await supabaseAdmin
      .from('canteen_diets')
      .insert({
        student_id:              body.student_id,
        diet_type:               body.diet_type,
        description:             body.description ?? null,
        allergies:               body.allergies ?? [],
        valid_from:              body.valid_from ?? null,
        valid_until:             body.valid_until ?? null,
        medical_certificate_url: body.medical_certificate_url ?? null,
        is_active:               body.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to create diet', detail: error.message, code: error.code });
    }

    return res.status(201).json(successResponse(data, 'Régime alimentaire ajouté avec succès'));
  } catch (err) {
    return next(err);
  }
});

// PATCH /canteen/diets/:id — modifier un régime (admin seulement)
router.patch('/diets/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = dietSchema.partial().parse(req.body);

    const mapped: Record<string, unknown> = {};
    if (updates.student_id !== undefined) mapped.student_id = updates.student_id;
    if (updates.diet_type !== undefined) mapped.diet_type = updates.diet_type;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.allergies !== undefined) mapped.allergies = updates.allergies;
    if (updates.valid_from !== undefined) mapped.valid_from = updates.valid_from;
    if (updates.valid_until !== undefined) mapped.valid_until = updates.valid_until;
    if (updates.medical_certificate_url !== undefined) mapped.medical_certificate_url = updates.medical_certificate_url;
    if (updates.is_active !== undefined) mapped.is_active = updates.is_active;

    const { data, error } = await supabaseAdmin
      .from('canteen_diets')
      .update(mapped)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      console.error('Supabase update error:', error);
      throw new AppError('Diet not found', 404);
    }

    return res.json(successResponse(data, 'Régime alimentaire modifié avec succès'));
  } catch (err) {
    return next(err);
  }
});

// DELETE /canteen/diets/:id — supprimer un régime (admin seulement)
router.delete('/diets/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('canteen_diets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase delete error:', error);
      throw new AppError('Failed to delete diet', 500);
    }

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export default router;