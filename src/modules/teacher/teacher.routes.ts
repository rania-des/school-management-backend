import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);
router.use(authorize('teacher', 'admin'));

// Helper pour extraire les données correctement
function extractFirstItem(data: any): any {
  if (!data) return null;
  if (Array.isArray(data) && data.length > 0) return data[0];
  return data;
}

// GET /teacher/classes - Récupérer les classes de l'enseignant
router.get('/classes', async (req, res, next) => {
  try {
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .single();

    if (!teacher) {
      throw new AppError('Teacher not found', 404);
    }

    const { data: slots, error } = await supabaseAdmin
      .from('schedule_slots')
      .select(`
        class_id,
        subject_id,
        classes:class_id(id, name),
        subjects:subject_id(id, name)
      `)
      .eq('teacher_id', teacher.id)
      .eq('is_active', true);

    if (error) {
      throw new AppError('Failed to fetch teacher classes', 500);
    }

    const classMap = new Map();
    for (const slot of slots || []) {
      const key = `${slot.class_id}_${slot.subject_id}`;
      if (!classMap.has(key)) {
        // Extraire correctement les données
        const classItem = extractFirstItem(slot.classes);
        const subjectItem = extractFirstItem(slot.subjects);
        
        classMap.set(key, {
          classId: slot.class_id,
          className: classItem?.name || `Classe ${slot.class_id}`,
          subjectId: slot.subject_id,
          subjectName: subjectItem?.name || 'Matière',
        });
      }
    }

    res.json(successResponse(Array.from(classMap.values())));
  } catch (err) {
    next(err);
  }
});

// GET /teacher/students/:classId - Récupérer les élèves d'une classe
router.get('/students/:classId', async (req, res, next) => {
  try {
    const { classId } = req.params;

    const { data: students, error } = await supabaseAdmin
      .from('students')
      .select(`
        id,
        profile_id,
        student_number,
        users:profile_id(first_name, last_name, email)
      `)
      .eq('class_id', classId);

    if (error) {
      throw new AppError('Failed to fetch students', 500);
    }

    // Formater les étudiants
    const formattedStudents = (students || []).map((student: any) => ({
      id: student.id,
      profile_id: student.profile_id,
      student_number: student.student_number,
      users: extractFirstItem(student.users)
    }));

    res.json(successResponse(formattedStudents || []));
  } catch (err) {
    next(err);
  }
});

// GET /teacher/schedule - Emploi du temps de l'enseignant
router.get('/schedule', async (req, res, next) => {
  try {
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .single();

    if (!teacher) {
      throw new AppError('Teacher not found', 404);
    }

    const { data: slots, error } = await supabaseAdmin
      .from('schedule_slots')
      .select(`
        *,
        subjects:subject_id(name, color),
        classes:class_id(name)
      `)
      .eq('teacher_id', teacher.id)
      .eq('is_active', true)
      .order('day_of_week')
      .order('start_time');

    if (error) {
      throw new AppError('Failed to fetch schedule', 500);
    }

    // Formater les créneaux
    const formattedSlots = (slots || []).map((slot: any) => ({
      ...slot,
      subjects: extractFirstItem(slot.subjects),
      classes: extractFirstItem(slot.classes)
    }));

    res.json(successResponse(formattedSlots || []));
  } catch (err) {
    next(err);
  }
});

// GET /teacher/stats - Statistiques de l'enseignant
router.get('/stats', async (req, res, next) => {
  try {
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .single();

    if (!teacher) {
      throw new AppError('Teacher not found', 404);
    }

    const [classesRes, assignmentsRes] = await Promise.all([
      supabaseAdmin
        .from('schedule_slots')
        .select('class_id', { count: 'exact', head: true })
        .eq('teacher_id', teacher.id)
        .eq('is_active', true),
      supabaseAdmin
        .from('assignments')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', teacher.id)
    ]);

    res.json(successResponse({
      totalClasses: classesRes.count || 0,
      totalAssignments: assignmentsRes.count || 0,
    }));
  } catch (err) {
    next(err);
  }
});

export default router;