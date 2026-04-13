import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);
router.use(authorize('parent', 'admin'));

// ─── Helper : récupère le parent_id depuis le profile_id ───────────────────────
async function getParentId(profileId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('parents')
    .select('id')
    .eq('profile_id', profileId)
    .single();
  if (error || !data) throw new AppError('Parent introuvable', 404);
  return data.id;
}

// ─── GET /parent/children ──────────────────────────────────────────────────────
// Retourne les enfants liés au parent connecté (avec classe + profil)
router.get('/children', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parentId = await getParentId(req.user!.id);

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
          classes(id, name),
          users:profile_id(first_name, last_name, email, avatar_url)
        )
      `)
      .eq('parent_id', parentId);

    if (error) throw new AppError('Erreur chargement enfants', 500);
    res.json(successResponse(children || []));
  } catch (err) { next(err); }
});

// ─── GET /parent/children/:studentId/grades ────────────────────────────────────
// Notes d'un enfant, filtrage optionnel par period
router.get('/children/:studentId/grades', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const { period } = req.query;

    let query = supabaseAdmin
      .from('grades')
      .select('*, subjects(id, name, coefficient)')
      .eq('student_id', studentId);

    if (period && period !== 'all') {
      query = query.eq('period', period as string);
    }

    const { data, error } = await query;
    if (error) throw new AppError('Erreur chargement notes', 500);
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// ─── GET /parent/children/:studentId/grades/comments ──────────────────────────
// Commentaires professeur sur une matière précise
router.get('/children/:studentId/grades/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const { subjectId } = req.query;

    let query = supabaseAdmin
      .from('teacher_comments')
      .select('*, subjects(name), teachers(profile_id, profiles(first_name, last_name))')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (subjectId) query = query.eq('subject_id', subjectId as string);

    const { data, error } = await query;
    if (error) throw new AppError('Erreur chargement commentaires', 500);
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// ─── GET /parent/children/:studentId/attendance ────────────────────────────────
router.get('/children/:studentId/attendance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('student_id', studentId);
    if (error) throw new AppError('Erreur chargement absences', 500);
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// ─── GET /parent/children/:studentId/assignments ───────────────────────────────
router.get('/children/:studentId/assignments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;

    // Récupérer la classe de l'enfant
    const { data: student, error: sErr } = await supabaseAdmin
      .from('students')
      .select('class_id')
      .eq('id', studentId)
      .single();
    if (sErr || !student) throw new AppError('Élève introuvable', 404);

    const { data: assignments, error: aErr } = await supabaseAdmin
      .from('assignments')
      .select('*, subjects(id, name), classes(id, name)')
      .eq('class_id', student.class_id)
      .order('created_at', { ascending: false });
    if (aErr) throw new AppError('Erreur chargement devoirs', 500);

    const { data: submissions, error: subErr } = await supabaseAdmin
      .from('submissions')
      .select('*')
      .eq('student_id', studentId);
    if (subErr) throw new AppError('Erreur chargement soumissions', 500);

    res.json(successResponse({ assignments: assignments || [], submissions: submissions || [] }));
  } catch (err) { next(err); }
});

// ─── GET /parent/children/:studentId/schedule ─────────────────────────────────
router.get('/children/:studentId/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;

    const { data: student, error: sErr } = await supabaseAdmin
      .from('students')
      .select('class_id')
      .eq('id', studentId)
      .single();
    if (sErr || !student) throw new AppError('Élève introuvable', 404);

    const { data, error } = await supabaseAdmin
      .from('schedule_slots')
      .select('*, subjects(id, name), teachers(id, profile_id, profiles(first_name, last_name))')
      .eq('class_id', student.class_id)
      .eq('is_active', true);
    if (error) throw new AppError('Erreur chargement emploi du temps', 500);
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// ─── GET /parent/children/:studentId/notifications ────────────────────────────
router.get('/children/:studentId/notifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('student_id', studentId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new AppError('Erreur chargement notifications', 500);
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// ─── PATCH /parent/notifications/:id/read ─────────────────────────────────────
router.patch('/notifications/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new AppError('Erreur mise à jour notification', 500);
    res.json(successResponse({ success: true }));
  } catch (err) { next(err); }
});

// ─── PATCH /parent/notifications/read-all ─────────────────────────────────────
router.patch('/notifications/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!ids || ids.length === 0) {
      return res.json(successResponse({ success: true }));
    }
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw new AppError('Erreur mise à jour notifications', 500);
    res.json(successResponse({ success: true }));
  } catch (err) { next(err); }
});

// ─── GET /parent/children/:studentId/predictions ──────────────────────────────
// Données agrégées pour la page de prédictions
router.get('/children/:studentId/predictions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;

    const { data: student } = await supabaseAdmin
      .from('students')
      .select('class_id')
      .eq('id', studentId)
      .single();

    const [commentsRes, gradesRes, attendanceRes, assignmentsRes, submissionsRes] = await Promise.all([
      supabaseAdmin
        .from('teacher_comments')
        .select('*, subjects(name), teachers(profile_id, profiles(first_name, last_name))')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('grades')
        .select('*, subjects(name, coefficient)')
        .eq('student_id', studentId),
      supabaseAdmin
        .from('attendance')
        .select('*')
        .eq('student_id', studentId),
      student ? supabaseAdmin
        .from('assignments')
        .select('*')
        .eq('class_id', student.class_id) : Promise.resolve({ data: [] }),
      supabaseAdmin
        .from('submissions')
        .select('*')
        .eq('student_id', studentId),
    ]);

    res.json(successResponse({
      comments: commentsRes.data || [],
      grades: gradesRes.data || [],
      attendance: attendanceRes.data || [],
      assignments: assignmentsRes.data || [],
      submissions: submissionsRes.data || [],
    }));
  } catch (err) { next(err); }
});

export default router;