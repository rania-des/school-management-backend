import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import { createNotification, createBulkNotifications, getClassStudentProfileIds } from '../../utils/notifications';

const router = Router();

// Toutes les routes teacher nécessitent d'être authentifié + rôle teacher/admin
router.use(authenticate);
router.use(authorize('teacher', 'admin'));

// ── Helper ────────────────────────────────────────────────────────────────────

function extractFirstItem(data: any): any {
  if (!data) return null;
  if (Array.isArray(data) && data.length > 0) return data[0];
  return data;
}

// Helper pour récupérer l'ID teacher depuis le profile_id (clé hardcodée temporairement)
async function getTeacherId(profileId: string): Promise<string> {
  // Clés hardcodées temporairement pour contourner Railway
  const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
  
  const url = `${SUPABASE_URL}/rest/v1/teachers?profile_id=eq.${profileId}&select=id`;
  console.log('🔍 getTeacherId URL:', url);
  
  const res = await fetch(url, {
    headers: { 
      'apikey': SUPABASE_KEY, 
      'Authorization': `Bearer ${SUPABASE_KEY}` 
    }
  });
  
  const data = (await res.json()) as any[];
  console.log('🔍 getTeacherId data:', JSON.stringify(data));
  console.log('🔍 getTeacherId response status:', res.status);
  console.log('🔍 getTeacherId response ok:', res.ok);
  
  if (!res.ok) {
    throw new AppError(`Supabase API error: ${res.status}`, 500);
  }
  
  if (!data?.[0]?.id) {
    throw new AppError('Teacher not found for profile: ' + profileId, 404);
  }
  
  return data[0].id;
}

// =============================================================================
// CLASSES & STUDENTS
// =============================================================================

// GET /api/v1/teacher/classes — classes assignées à l'enseignant
router.get('/classes', async (req, res, next) => {
  try {
    console.log('🔍 /classes - req.user:', req.user?.id);
    const teacherId = await getTeacherId(req.user!.id);
    console.log('🔍 /classes - teacherId:', teacherId);

    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const resSlots = await fetch(
      `${SUPABASE_URL}/rest/v1/schedule_slots?teacher_id=eq.${teacherId}&is_active=eq.true&select=class_id,subject_id,classes:class_id(id,name),subjects:subject_id(id,name)`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const slots = (await resSlots.json()) as any[];
    console.log('🔍 /classes - slots count:', slots?.length);

    if (!resSlots.ok) throw new AppError('Failed to fetch teacher classes', 500);

    const classMap = new Map();
    for (const slot of slots || []) {
      const key = `${slot.class_id}_${slot.subject_id}`;
      if (!classMap.has(key)) {
        const classItem   = extractFirstItem(slot.classes);
        const subjectItem = extractFirstItem(slot.subjects);
        classMap.set(key, {
          classId:     slot.class_id,
          className:   classItem?.name   || `Classe ${slot.class_id}`,
          subjectId:   slot.subject_id,
          subjectName: subjectItem?.name || 'Matière',
        });
      }
    }

    res.json(successResponse(Array.from(classMap.values())));
  } catch (err) { 
    console.error('🔍 /classes - error:', err);
    next(err); 
  }
});

// GET /api/v1/teacher/students/:classId — élèves d'une classe
router.get('/students/:classId', async (req, res, next) => {
  try {
    const { classId } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const resStudents = await fetch(
      `${SUPABASE_URL}/rest/v1/students?class_id=eq.${classId}&select=id,profile_id,student_number,profiles:profile_id(first_name,last_name,email,avatar_url)`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const students = (await resStudents.json()) as any[];

    if (!resStudents.ok) throw new AppError('Failed to fetch students', 500);

    const formatted = (students || []).map((s: any) => ({
      id:             s.id,
      profile_id:     s.profile_id,
      student_number: s.student_number,
      profile:        extractFirstItem(s.profiles),
    }));

    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// =============================================================================
// EMPLOI DU TEMPS
// =============================================================================

// GET /api/v1/teacher/schedule — emploi du temps de l'enseignant
router.get('/schedule', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const resSlots = await fetch(
      `${SUPABASE_URL}/rest/v1/schedule_slots?teacher_id=eq.${teacherId}&is_active=eq.true&select=*,subjects:subject_id(name,color),classes:class_id(name)&order=day_of_week,start_time`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const slots = (await resSlots.json()) as any[];

    if (!resSlots.ok) throw new AppError('Failed to fetch schedule', 500);

    const formatted = (slots || []).map((slot: any) => ({
      ...slot,
      subjects: extractFirstItem(slot.subjects),
      classes:  extractFirstItem(slot.classes),
    }));

    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// =============================================================================
// STATISTIQUES
// =============================================================================

// GET /api/v1/teacher/stats — stats résumées
router.get('/stats', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const [classesRes, assignmentsRes, gradesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/schedule_slots?teacher_id=eq.${teacherId}&is_active=eq.true&select=class_id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }),
      fetch(`${SUPABASE_URL}/rest/v1/assignments?teacher_id=eq.${teacherId}&select=id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }),
      fetch(`${SUPABASE_URL}/rest/v1/grades?teacher_id=eq.${teacherId}&select=id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }),
    ]);

    const classesData = (await classesRes.json()) as any[];
    const assignmentsData = (await assignmentsRes.json()) as any[];
    const gradesData = (await gradesRes.json()) as any[];

    res.json(successResponse({
      totalClasses:     classesData?.length || 0,
      totalAssignments: assignmentsData?.length || 0,
      totalGrades:      gradesData?.length || 0,
    }));
  } catch (err) { next(err); }
});

// =============================================================================
// NOTES (GRADES)
// =============================================================================

// GET /api/v1/teacher/grades?classId=&subjectId=&period=
router.get('/grades', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, subjectId, period } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    let url = `${SUPABASE_URL}/rest/v1/grades?teacher_id=eq.${teacherId}&select=*,students:student_id(id,student_number,profiles:profile_id(first_name,last_name)),subjects:subject_id(name)&order=created_at.desc`;
    if (classId)   url += `&class_id=eq.${classId}`;
    if (subjectId) url += `&subject_id=eq.${subjectId}`;
    if (period)    url += `&period=eq.${period}`;

    const resData = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const data = (await resData.json()) as any[];

    if (!resData.ok) throw new AppError('Failed to fetch grades', 500);

    const formatted = (data || []).map((g: any) => ({
      ...g,
      student: extractFirstItem(g.students),
      subject: extractFirstItem(g.subjects),
    }));

    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// POST /api/v1/teacher/grades — ajouter une note
router.post('/grades', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { studentId, classId, subjectId, value, maxValue, period, type, comment } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    if (!studentId || !classId || !subjectId || value === undefined || !period) {
      throw new AppError('studentId, classId, subjectId, value et period sont requis', 400);
    }

    const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/grades`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        teacher_id: teacherId,
        student_id: studentId,
        class_id:   classId,
        subject_id: subjectId,
        value:      Number(value),
        max_value:  maxValue ? Number(maxValue) : 20,
        period,
        type:       type || 'exam',
        comment:    comment || null,
      })
    });
    const dataArr = (await resInsert.json()) as any[];
    const data = dataArr[0];

    if (!resInsert.ok) throw new AppError(`Failed to create grade`, 500);

    // Notification à l'élève
    const resStudent = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}&select=profile_id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const studentArr = (await resStudent.json()) as any[];
    const student = studentArr[0];

    if (student?.profile_id) {
      await createNotification({
        recipientId: student.profile_id,
        type:        'grade',
        title:       'Nouvelle note ajoutée',
        body:        `Une note de ${value}/${maxValue || 20} a été ajoutée.`,
        data:        { gradeId: data.id },
      });
    }

    res.status(201).json(successResponse(data, 'Note ajoutée avec succès'));
  } catch (err) { next(err); }
});

// PUT /api/v1/teacher/grades/:gradeId — modifier une note
router.put('/grades/:gradeId', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { gradeId } = req.params;
    const { value, maxValue, comment } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const updateBody: any = { comment };
    if (value    !== undefined) updateBody.value     = Number(value);
    if (maxValue !== undefined) updateBody.max_value = Number(maxValue);

    const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/grades?id=eq.${gradeId}&teacher_id=eq.${teacherId}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(updateBody)
    });
    const dataArr = (await resUpdate.json()) as any[];
    const data = dataArr[0];

    if (!resUpdate.ok || !data) throw new AppError('Grade not found or not authorized', 404);

    res.json(successResponse(data, 'Note modifiée avec succès'));
  } catch (err) { next(err); }
});

// DELETE /api/v1/teacher/grades/:gradeId
router.delete('/grades/:gradeId', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { gradeId } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const resDelete = await fetch(`${SUPABASE_URL}/rest/v1/grades?id=eq.${gradeId}&teacher_id=eq.${teacherId}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });

    if (!resDelete.ok) throw new AppError('Failed to delete grade', 500);

    res.json(successResponse(null, 'Note supprimée'));
  } catch (err) { next(err); }
});

// =============================================================================
// DEVOIRS (ASSIGNMENTS)
// =============================================================================

// GET /api/v1/teacher/assignments?classId=&subjectId=
router.get('/assignments', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, subjectId } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    let url = `${SUPABASE_URL}/rest/v1/assignments?teacher_id=eq.${teacherId}&select=*,subjects:subject_id(name),classes:class_id(name)&order=due_date`;
    if (classId)   url += `&class_id=eq.${classId}`;
    if (subjectId) url += `&subject_id=eq.${subjectId}`;

    const resData = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const data = (await resData.json()) as any[];

    if (!resData.ok) throw new AppError('Failed to fetch assignments', 500);

    const formatted = (data || []).map((a: any) => ({
      ...a,
      subject: extractFirstItem(a.subjects),
      class:   extractFirstItem(a.classes),
    }));

    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// POST /api/v1/teacher/assignments — créer un devoir
router.post('/assignments', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, subjectId, title, description, dueDate, type, maxScore } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    if (!classId || !subjectId || !title || !dueDate) {
      throw new AppError('classId, subjectId, title et dueDate sont requis', 400);
    }

    const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/assignments`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        teacher_id:  teacherId,
        class_id:    classId,
        subject_id:  subjectId,
        title,
        description: description || null,
        due_date:    dueDate,
        type:        type || 'homework',
        max_score:   maxScore ? Number(maxScore) : null,
      })
    });
    const dataArr = (await resInsert.json()) as any[];
    const data = dataArr[0];

    if (!resInsert.ok) throw new AppError(`Failed to create assignment`, 500);

    // Notification en masse à tous les élèves de la classe
    const studentProfileIds = await getClassStudentProfileIds(classId);
    if (studentProfileIds.length > 0) {
      await createBulkNotifications(studentProfileIds, {
        type:  'assignment',
        title: `Nouveau devoir : ${title}`,
        body:  `À rendre pour le ${new Date(dueDate).toLocaleDateString('fr-FR')}`,
        data:  { assignmentId: data.id },
      });
    }

    res.status(201).json(successResponse(data, 'Devoir créé avec succès'));
  } catch (err) { next(err); }
});

// PUT /api/v1/teacher/assignments/:assignmentId
router.put('/assignments/:assignmentId', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;
    const { title, description, dueDate, type, maxScore } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const updateBody: any = { title, description, due_date: dueDate, type };
    if (maxScore !== undefined) updateBody.max_score = Number(maxScore);

    const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}&teacher_id=eq.${teacherId}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(updateBody)
    });
    const dataArr = (await resUpdate.json()) as any[];
    const data = dataArr[0];

    if (!resUpdate.ok || !data) throw new AppError('Assignment not found or not authorized', 404);

    res.json(successResponse(data, 'Devoir modifié'));
  } catch (err) { next(err); }
});

// DELETE /api/v1/teacher/assignments/:assignmentId
router.delete('/assignments/:assignmentId', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const resDelete = await fetch(`${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}&teacher_id=eq.${teacherId}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });

    if (!resDelete.ok) throw new AppError('Failed to delete assignment', 500);

    res.json(successResponse(null, 'Devoir supprimé'));
  } catch (err) { next(err); }
});

// GET /api/v1/teacher/assignments/:assignmentId/submissions — soumissions d'un devoir
router.get('/assignments/:assignmentId/submissions', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    // Vérifier que le devoir appartient à l'enseignant
    const resCheck = await fetch(`${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}&teacher_id=eq.${teacherId}&select=id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const checkArr = (await resCheck.json()) as any[];
    const assignment = checkArr[0];

    if (!assignment) throw new AppError('Assignment not found or not authorized', 404);

    const resData = await fetch(`${SUPABASE_URL}/rest/v1/submissions?assignment_id=eq.${assignmentId}&select=*,students:student_id(id,student_number,profiles:profile_id(first_name,last_name))`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const data = (await resData.json()) as any[];

    if (!resData.ok) throw new AppError('Failed to fetch submissions', 500);

    const formatted = (data || []).map((s: any) => ({ ...s, student: extractFirstItem(s.students) }));

    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// PATCH /api/v1/teacher/submissions/:submissionId/grade — noter une soumission
router.patch('/submissions/:submissionId/grade', async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    if (score === undefined) throw new AppError('score est requis', 400);

    const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${submissionId}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ score: Number(score), feedback: feedback || null, status: 'graded' })
    });
    const dataArr = (await resUpdate.json()) as any[];
    const data = dataArr[0];

    if (!resUpdate.ok) throw new AppError('Failed to grade submission', 500);

    res.json(successResponse(data, 'Soumission notée'));
  } catch (err) { next(err); }
});

// =============================================================================
// PRÉSENCES (ATTENDANCE)
// =============================================================================

// POST /api/v1/teacher/attendance — enregistrer les présences (tableau)
router.post('/attendance', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { records } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    if (!Array.isArray(records) || records.length === 0) {
      throw new AppError('records[] est requis', 400);
    }

    const rows = records.map((r: any) => ({
      teacher_id: teacherId,
      student_id: r.studentId,
      class_id:   r.classId,
      status:     r.status,
      date:       r.date,
      note:       r.note || null,
    }));

    const resUpsert = await fetch(`${SUPABASE_URL}/rest/v1/attendance?on_conflict=student_id,class_id,date`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows)
    });
    const data = (await resUpsert.json()) as any[];

    if (!resUpsert.ok) throw new AppError(`Failed to save attendance`, 500);

    // Notifications aux parents pour les absences
    const absents = records.filter((r: any) => r.status === 'absent');
    for (const absent of absents) {
      const resStudent = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${absent.studentId}&select=id,profile_id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      const studentArr = (await resStudent.json()) as any[];
      const student = studentArr[0];

      if (student) {
        const resParents = await fetch(`${SUPABASE_URL}/rest/v1/parent_student?student_id=eq.${student.id}&select=parents:parent_id(profile_id)`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const parentLinks = (await resParents.json()) as any[];

        const parentProfileIds = (parentLinks || [])
          .map((pl: any) => extractFirstItem(pl.parents)?.profile_id)
          .filter(Boolean);

        if (parentProfileIds.length > 0) {
          await createBulkNotifications(parentProfileIds, {
            type:  'absence',
            title: 'Absence signalée',
            body:  `Votre enfant a été marqué absent le ${absent.date}.`,
            data:  { studentId: student.id, date: absent.date },
          });
        }
      }
    }

    res.status(201).json(successResponse(data, 'Présences enregistrées'));
  } catch (err) { next(err); }
});

// =============================================================================
// ANNONCES (ANNOUNCEMENTS)
// =============================================================================

// GET /api/v1/teacher/announcements
router.get('/announcements', async (req, res, next) => {
  try {
    const { classId } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    let url = `${SUPABASE_URL}/rest/v1/announcements?or=(author_id.eq.${req.user!.id},target_role.eq.teacher,target_role.is.null)&order=created_at.desc`;
    if (classId) url += `&class_id=eq.${classId}`;

    const resData = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const data = (await resData.json()) as any[];

    if (!resData.ok) throw new AppError('Failed to fetch announcements', 500);

    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// POST /api/v1/teacher/announcements
router.post('/announcements', async (req, res, next) => {
  try {
    const { title, content, classId, targetRole } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    if (!title || !content) throw new AppError('title et content sont requis', 400);

    const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/announcements`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        author_id:   req.user!.id,
        title,
        content,
        class_id:    classId    || null,
        target_role: targetRole || null,
      })
    });
    const dataArr = (await resInsert.json()) as any[];
    const data = dataArr[0];

    if (!resInsert.ok) throw new AppError(`Failed to create announcement`, 500);

    // Si une classe est ciblée, notifier les élèves
    if (classId) {
      const studentProfileIds = await getClassStudentProfileIds(classId);
      if (studentProfileIds.length > 0) {
        await createBulkNotifications(studentProfileIds, {
          type:  'announcement',
          title: `Nouvelle annonce : ${title}`,
          body:  content.substring(0, 100),
          data:  { announcementId: data.id },
        });
      }
    }

    res.status(201).json(successResponse(data, 'Annonce publiée'));
  } catch (err) { next(err); }
});

// DELETE /api/v1/teacher/announcements/:announcementId
router.delete('/announcements/:announcementId', async (req, res, next) => {
  try {
    const { announcementId } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const resDelete = await fetch(`${SUPABASE_URL}/rest/v1/announcements?id=eq.${announcementId}&author_id=eq.${req.user!.id}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });

    if (!resDelete.ok) throw new AppError('Failed to delete announcement', 500);

    res.json(successResponse(null, 'Annonce supprimée'));
  } catch (err) { next(err); }
});

// =============================================================================
// MESSAGERIE
// =============================================================================

// GET /api/v1/teacher/messages/conversations
router.get('/messages/conversations', async (req, res, next) => {
  try {
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const resData = await fetch(
      `${SUPABASE_URL}/rest/v1/messages?or=(sender_id.eq.${req.user!.id},receiver_id.eq.${req.user!.id})&select=id,sender_id,receiver_id,content,created_at,is_read,sender:sender_id(first_name,last_name,avatar_url),receiver:receiver_id(first_name,last_name,avatar_url)&order=created_at.desc`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const data = (await resData.json()) as any[];

    if (!resData.ok) throw new AppError('Failed to fetch conversations', 500);

    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// GET /api/v1/teacher/messages/:userId — conversation avec un utilisateur
router.get('/messages/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const myId       = req.user!.id;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const resData = await fetch(
      `${SUPABASE_URL}/rest/v1/messages?or=(and(sender_id.eq.${myId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${myId}))&select=*&order=created_at`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const data = (await resData.json()) as any[];

    if (!resData.ok) throw new AppError('Failed to fetch messages', 500);

    // Marquer les messages reçus comme lus
    await fetch(`${SUPABASE_URL}/rest/v1/messages?receiver_id=eq.${myId}&sender_id=eq.${userId}&is_read=eq.false`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: true })
    }).catch(() => {});

    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// POST /api/v1/teacher/messages — envoyer un message
router.post('/messages', async (req, res, next) => {
  try {
    const { receiverId, content } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    if (!receiverId || !content) throw new AppError('receiverId et content sont requis', 400);

    const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        sender_id:   req.user!.id,
        receiver_id: receiverId,
        content,
        is_read:     false,
      })
    });
    const dataArr = (await resInsert.json()) as any[];
    const data = dataArr[0];

    if (!resInsert.ok) throw new AppError(`Failed to send message`, 500);

    // Notification au destinataire
    await createNotification({
      recipientId: receiverId,
      type:        'message',
      title:       `Nouveau message`,
      body:        content.substring(0, 100),
      data:        { messageId: data.id, senderId: req.user!.id },
    });

    res.status(201).json(successResponse(data, 'Message envoyé'));
  } catch (err) { next(err); }
});

// =============================================================================
// PROFIL ENSEIGNANT
// =============================================================================

// GET /api/v1/teacher/profile
router.get('/profile', async (req, res, next) => {
  try {
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const resProfile = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user!.id}&select=*`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const profileArr = (await resProfile.json()) as any[];
    const profile = profileArr[0];

    if (!resProfile.ok || !profile) throw new AppError('Profile not found', 404);

    const resTeacher = await fetch(`${SUPABASE_URL}/rest/v1/teachers?profile_id=eq.${req.user!.id}&select=*`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const teacherArr = (await resTeacher.json()) as any[];
    const teacher = teacherArr[0];

    res.json(successResponse({ ...profile, teacherData: teacher || null }));
  } catch (err) { next(err); }
});

// PATCH /api/v1/teacher/profile — mettre à jour le profil
router.patch('/profile', async (req, res, next) => {
  try {
    const { firstName, lastName, phone, address, gender, avatarUrl } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const updates: Record<string, any> = {};
    if (firstName !== undefined) updates.first_name  = firstName;
    if (lastName  !== undefined) updates.last_name   = lastName;
    if (phone     !== undefined) updates.phone       = phone;
    if (address   !== undefined) updates.address     = address;
    if (gender    !== undefined) updates.gender      = gender;
    if (avatarUrl !== undefined) updates.avatar_url  = avatarUrl;

    if (Object.keys(updates).length === 0) {
      throw new AppError('Aucune donnée à mettre à jour', 400);
    }

    const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user!.id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(updates)
    });
    const dataArr = (await resUpdate.json()) as any[];
    const data = dataArr[0];

    if (!resUpdate.ok) throw new AppError('Failed to update profile', 500);

    res.json(successResponse(data, 'Profil mis à jour'));
  } catch (err) { next(err); }
});

export default router;