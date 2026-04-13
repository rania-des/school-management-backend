import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const attendanceSchema = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  scheduleSlotId: z.string().uuid().optional(),
  date: z.string(),
  status: z.enum(['present', 'absent', 'late']),
  reason: z.string().optional(),
});

// ============================================
// ROUTES POUR ENSEIGNANTS
// ============================================

// GET /attendance/teacher/classes - Récupérer les classes de l'enseignant
router.get('/teacher/classes', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .single();

    if (!teacher) throw new AppError('Teacher not found', 404);

    const { data: slots, error } = await supabaseAdmin
      .from('schedule_slots')
      .select('*, classes(id, name), subjects(id, name)')
      .eq('teacher_id', teacher.id)
      .eq('is_active', true);

    if (error) throw new AppError('Failed to fetch teacher classes', 500);

    const classMap = new Map();
    for (const slot of slots || []) {
      const key = `${slot.class_id}_${slot.subject_id}`;
      if (!classMap.has(key)) {
        classMap.set(key, {
          classId: slot.class_id,
          className: slot.classes?.name || `Classe ${slot.class_id}`,
          subjectId: slot.subject_id,
          subjectName: slot.subjects?.name || 'Matière',
          slots: [],
        });
      }
      classMap.get(key).slots.push({
        day: slot.day_of_week,
        start: slot.start_time,
        end: slot.end_time,
        room: slot.room,
      });
    }

    return res.json(successResponse(Array.from(classMap.values())));
  } catch (err) {
    return next(err);
  }
});

// GET /attendance/students/:classId - Récupérer les élèves d'une classe
router.get('/students/:classId', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
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

    if (error) throw new AppError('Failed to fetch students', 500);

    return res.json(successResponse(students || []));
  } catch (err) {
    return next(err);
  }
});

// ============================================
// ROUTES GÉNÉRALES
// ============================================

// GET /attendance - Liste des présences avec filtres
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId, studentId, date, startDate, endDate, limit = 100 } = req.query;
    
    let query = supabaseAdmin
      .from('attendance')
      .select('*, students(*, profiles(first_name, last_name)), classes(*), teachers(*)')
      .order('date', { ascending: false })
      .limit(Number(limit));

    if (classId) query = query.eq('class_id', classId);
    if (studentId) query = query.eq('student_id', studentId);
    if (date) query = query.eq('date', date);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    // Filtrer par rôle
    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('profile_id', req.user!.id)
        .single();
      if (student) query = query.eq('student_id', student.id);
    } else if (req.user!.role === 'parent') {
      const { data: parent } = await supabaseAdmin
        .from('parents')
        .select('id')
        .eq('profile_id', req.user!.id)
        .single();
      if (parent) {
        const { data: children } = await supabaseAdmin
          .from('parent_student')
          .select('student_id')
          .eq('parent_id', parent.id);
        const childIds = (children || []).map((c: any) => c.student_id);
        if (childIds.length > 0) query = query.in('student_id', childIds);
      }
    }

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch attendance', 500);

    return res.json(successResponse(data || []));
  } catch (err) {
    return next(err);
  }
});

// POST /attendance/bulk - Enregistrement multiple des présences
router.post('/bulk', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attendances } = z.object({
      attendances: z.array(attendanceSchema),
    }).parse(req.body);

    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('profile_id', req.user!.id)
      .single();

    const records = attendances.map((a) => ({
      student_id: a.studentId,
      class_id: a.classId,
      schedule_slot_id: a.scheduleSlotId || null,
      teacher_id: teacher?.id || null,
      date: a.date,
      status: a.status,
      reason: a.reason || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .upsert(records, { onConflict: 'student_id,class_id,date' })
      .select();

    if (error) throw new AppError(`Failed to save attendance: ${error.message}`, 500);

    return res.status(201).json(successResponse(data, `${data?.length} attendance records saved`));
  } catch (err) {
    return next(err);
  }
});

// GET /attendance/stats/:studentId - Statistiques d'absence pour un élève
router.get('/stats/:studentId', authorize('teacher', 'admin', 'parent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const { period } = req.query;

    let query = supabaseAdmin
      .from('attendance')
      .select('status, date')
      .eq('student_id', studentId);

    if (period) {
      const startDate = new Date();
      if (period === 'week') startDate.setDate(startDate.getDate() - 7);
      else if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);
      else if (period === 'year') startDate.setFullYear(startDate.getFullYear() - 1);
      query = query.gte('date', startDate.toISOString().split('T')[0]);
    }

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch attendance stats', 500);

    const stats = {
      present: (data || []).filter((a: any) => a.status === 'present').length,
      absent: (data || []).filter((a: any) => a.status === 'absent').length,
      late: (data || []).filter((a: any) => a.status === 'late').length,
      total: (data || []).length,
    };

    return res.json(successResponse(stats));
  } catch (err) {
    return next(err);
  }
});

// DELETE /attendance/:id - Supprimer une entrée de présence
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabaseAdmin
      .from('attendance')
      .delete()
      .eq('id', id);

    if (error) throw new AppError('Failed to delete attendance record', 500);
    
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});
// GET /attendance/students/:classId - Récupérer les élèves d'une classe
router.get('/students/:classId', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
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

    if (error) throw new AppError('Failed to fetch students', 500);

    // Formater la réponse
    const formattedStudents = (students || []).map((s: any) => ({
      id: s.id,
      profile_id: s.profile_id,
      student_number: s.student_number,
      users: s.users && Array.isArray(s.users) ? s.users[0] : s.users
    }));

    return res.json(successResponse(formattedStudents || []));
  } catch (err) {
    return next(err);
  }
});

export default router;