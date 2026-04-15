import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import { createNotification, createBulkNotifications, getClassStudentProfileIds } from '../../utils/notifications';

const router = Router();

router.use(authenticate);
router.use(authorize('teacher', 'admin'));

function extractFirstItem(data: any): any {
  if (!data) return null;
  if (Array.isArray(data) && data.length > 0) return data[0];
  return data;
}

async function getTeacherId(profileId: string): Promise<string> {
  const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
  
  const url = `${SUPABASE_URL}/rest/v1/teachers?profile_id=eq.${profileId}&select=id`;
  
  const res = await fetch(url, {
    headers: { 
      'apikey': SUPABASE_KEY, 
      'Authorization': `Bearer ${SUPABASE_KEY}` 
    }
  });
  
  const data = (await res.json()) as any[];
  
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

router.get('/classes', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);

    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const resSlots = await fetch(
      `${SUPABASE_URL}/rest/v1/schedule_slots?teacher_id=eq.${teacherId}&is_active=eq.true&select=class_id,subject_id,classes:class_id(id,name),subjects:subject_id(id,name)`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const slots = (await resSlots.json()) as any[];

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
    next(err); 
  }
});

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
      headers: { 
        'apikey': SUPABASE_KEY, 
        'Authorization': `Bearer ${SUPABASE_KEY}`, 
        'Content-Type': 'application/json', 
        'Prefer': 'return=representation' 
      },
      body: JSON.stringify({
        teacher_id:       teacherId,
        student_id:       studentId,
        class_id:         classId,
        subject_id:       subjectId,
        academic_year_id: req.body.academicYearId || null,
        score:            Number(value ?? req.body.score),
        max_score:        maxValue ? Number(maxValue) : (req.body.maxScore ? Number(req.body.maxScore) : 20),
        coefficient:      req.body.coefficient ? Number(req.body.coefficient) : 1,
        title:            req.body.title || type || 'Note',
        period:           period,
        grade_date:       req.body.gradeDate || new Date().toISOString().split('T')[0],
        description:      comment || req.body.description || null,
      })
    });
    const dataArr = (await resInsert.json()) as any[];
    const data = dataArr[0];

    if (!resInsert.ok) throw new AppError(`Failed to create grade: ${resInsert.status}`, 500);

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

router.put('/grades/:gradeId', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { gradeId } = req.params;
    const { value, maxValue, comment } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

    const updateBody: any = { description: comment };
    if (value !== undefined) updateBody.score = Number(value);
    if (maxValue !== undefined) updateBody.max_score = Number(maxValue);

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

router.get('/assignments', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, subjectId, type } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    
    let url = `${SUPABASE_URL}/rest/v1/assignments?teacher_id=eq.${teacherId}&select=*&order=due_date`;
    if (classId)   url += `&class_id=eq.${classId}`;
    if (subjectId) url += `&subject_id=eq.${subjectId}`;
    if (type)      url += `&type=eq.${type}`;
    
    const resData = await fetch(url, { headers: H });
    const data = (await resData.json()) as any[];
    
    if (!resData.ok) throw new AppError('Failed to fetch assignments', 500);
    
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

router.post('/assignments', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, subjectId, title, description, dueDate, type, maxScore } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    if (!classId || !subjectId || !title) {
      throw new AppError('classId, subjectId et title sont requis', 400);
    }

    const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/assignments`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        teacher_id:       teacherId,
        class_id:         classId,
        subject_id:       subjectId,
        academic_year_id: req.body.academicYearId || null,
        title,
        description:      description || null,
        due_date:         dueDate || null,
        type:             type || 'homework',
        points:           maxScore ? Number(maxScore) : null,
      })
    });
    const dataArr = (await resInsert.json()) as any[];
    const data = dataArr[0];

    if (!resInsert.ok) throw new AppError(`Failed to create assignment: ${resInsert.status}`, 500);

    const studentProfileIds = await getClassStudentProfileIds(classId);
    if (studentProfileIds.length > 0) {
      const notificationTitle = type === 'course' ? 'Nouveau cours publié' : 'Nouveau devoir';
      const notificationBody = type === 'course'
        ? `${title} - ${description || 'Consultez le nouveau cours'}`
        : `${title}${dueDate ? ` — À rendre pour le ${new Date(dueDate).toLocaleDateString('fr-FR')}` : ''}`;
      
      await createBulkNotifications(studentProfileIds, {
        type:  type === 'course' ? 'course' : 'assignment',
        title: notificationTitle,
        body:  notificationBody,
        data:  { assignmentId: data.id, type: type || 'homework' },
      });
    }

    res.status(201).json(successResponse(data, type === 'course' ? 'Cours créé avec succès' : 'Devoir créé avec succès'));
  } catch (err) { next(err); }
});

router.put('/assignments/:assignmentId', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;
    const { title, description, dueDate, type, maxScore } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    const updateBody: any = { title, description, due_date: dueDate, type };
    if (maxScore !== undefined) updateBody.points = Number(maxScore);

    const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}&teacher_id=eq.${teacherId}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify(updateBody)
    });
    const dataArr = (await resUpdate.json()) as any[];
    const data = dataArr[0];

    if (!resUpdate.ok || !data) throw new AppError('Assignment not found or not authorized', 404);

    res.json(successResponse(data, 'Devoir modifié'));
  } catch (err) { next(err); }
});

router.delete('/assignments/:assignmentId', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

    const resDelete = await fetch(`${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}&teacher_id=eq.${teacherId}`, {
      method: 'DELETE',
      headers: H
    });

    if (!resDelete.ok) throw new AppError('Failed to delete assignment', 500);

    res.json(successResponse(null, 'Devoir supprimé'));
  } catch (err) { next(err); }
});

router.get('/assignments/:assignmentId/submissions', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

    const resCheck = await fetch(`${SUPABASE_URL}/rest/v1/assignments?id=eq.${assignmentId}&teacher_id=eq.${teacherId}&select=id`, { headers: H });
    const checkArr = (await resCheck.json()) as any[];
    const assignment = checkArr[0];

    if (!assignment) throw new AppError('Assignment not found or not authorized', 404);

    const resData = await fetch(`${SUPABASE_URL}/rest/v1/submissions?assignment_id=eq.${assignmentId}&select=*,students:student_id(id,student_number,profiles:profile_id(first_name,last_name))`, { headers: H });
    const data = (await resData.json()) as any[];

    if (!resData.ok) throw new AppError('Failed to fetch submissions', 500);

    const formatted = (data || []).map((s: any) => ({
      ...s,
      student: extractFirstItem(s.students),
    }));

    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

router.patch('/submissions/:submissionId/grade', async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    if (score === undefined) throw new AppError('score est requis', 400);

    const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${submissionId}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ score: Number(score), feedback: feedback || null, status: 'graded' })
    });
    const dataArr = (await resUpdate.json()) as any[];
    const data = dataArr[0];

    if (!resUpdate.ok) throw new AppError('Failed to grade submission', 500);

    res.json(successResponse(data, 'Soumission notée'));
  } catch (err) { next(err); }
});

// ✅ ROUTE POUR AJOUTER/MODIFIER UN COMMENTAIRE (sans note)
router.patch('/submissions/:submissionId/comment', async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { comment } = req.body;
    
    if (!comment?.trim()) {
      throw new AppError('comment est requis', 400);
    }

    const teacherId = await getTeacherId(req.user!.id);
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    // 1. Récupérer la soumission pour avoir student_id
    const subRes = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${submissionId}&select=student_id`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const subData = (await subRes.json()) as any[];
    const submission = subData[0];
    
    if (!submission) {
      throw new AppError('Submission not found', 404);
    }

    // 2. Vérifier si un commentaire professeur existe déjà
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/teacher_comments?submission_id=eq.${submissionId}&teacher_id=eq.${teacherId}&comment_type=eq.teacher_feedback&select=id`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const existing = (await existingRes.json()) as any[];

    let result;
    if (existing && existing.length > 0) {
      // Mise à jour
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/teacher_comments?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify({
          comment: comment.trim(),
          updated_at: new Date().toISOString(),
        })
      });
      const updateData = (await updateRes.json()) as any[];
      result = updateData[0];
      if (!updateRes.ok) throw new AppError('Failed to update comment', 500);
    } else {
      // Création
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/teacher_comments`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({
          submission_id: submissionId,
          teacher_id: teacherId,
          student_id: submission.student_id,
          comment: comment.trim(),
          comment_type: 'teacher_feedback',
          created_at: new Date().toISOString(),
        })
      });
      const insertData = (await insertRes.json()) as any[];
      result = insertData[0];
      if (!insertRes.ok) throw new AppError('Failed to add comment', 500);
    }

    // 3. Notifier l'élève
    const studentRes = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${submission.student_id}&select=profile_id`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const studentArr = (await studentRes.json()) as any[];
    const studentProfileId = studentArr[0]?.profile_id;
    
    if (studentProfileId) {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_id: studentProfileId,
          type: 'comment',
          title: 'Nouveau commentaire sur votre devoir',
          body: `Un professeur a commenté votre travail.`,
          data: { submissionId },
          created_at: new Date().toISOString(),
        })
      });
    }

    res.json(successResponse(result, existing?.length ? 'Commentaire mis à jour' : 'Commentaire ajouté'));
  } catch (err) { 
    console.error('Erreur dans /comment:', err);
    next(err); 
  }
});

// =============================================================================
// PRÉSENCES (ATTENDANCE)
// =============================================================================

router.post('/attendance', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { records } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 
      'apikey': SUPABASE_KEY, 
      'Authorization': `Bearer ${SUPABASE_KEY}`, 
      'Content-Type': 'application/json', 
      'Prefer': 'resolution=merge-duplicates,return=representation',
      'X-Upsert': 'true'
    };

    if (!Array.isArray(records) || records.length === 0) {
      throw new AppError('records[] est requis', 400);
    }

    const rows = records.map((r: any) => ({
      teacher_id:       teacherId,
      student_id:       r.studentId,
      class_id:         r.classId,
      schedule_slot_id: r.scheduleSlotId || null,
      status:           r.status,
      date:             r.date,
      reason:           r.reason || r.note || null,
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    }));

    const resUpsert = await fetch(`${SUPABASE_URL}/rest/v1/attendance`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify(rows)
    });
    const data = (await resUpsert.json()) as any[];

    if (!resUpsert.ok) {
      console.error('Attendance upsert error:', await resUpsert.text());
      throw new AppError(`Failed to save attendance: ${resUpsert.status}`, 500);
    }

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

router.get('/announcements', async (req, res, next) => {
  try {
    const { classId } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

    let url = `${SUPABASE_URL}/rest/v1/announcements?or=(author_id.eq.${req.user!.id},target_role.eq.teacher,target_role.is.null)&order=created_at.desc`;
    if (classId) url += `&class_id=eq.${classId}`;

    const resData = await fetch(url, { headers: H });
    const data = (await resData.json()) as any[];

    if (!resData.ok) throw new AppError('Failed to fetch announcements', 500);

    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

router.post('/announcements', async (req, res, next) => {
  try {
    const { title, content, classId, targetRole } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    if (!title || !content) throw new AppError('title et content sont requis', 400);

    const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/announcements`, {
      method: 'POST',
      headers: H,
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

router.delete('/announcements/:announcementId', async (req, res, next) => {
  try {
    const { announcementId } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

    const resDelete = await fetch(`${SUPABASE_URL}/rest/v1/announcements?id=eq.${announcementId}&author_id=eq.${req.user!.id}`, {
      method: 'DELETE',
      headers: H
    });

    if (!resDelete.ok) throw new AppError('Failed to delete announcement', 500);

    res.json(successResponse(null, 'Annonce supprimée'));
  } catch (err) { next(err); }
});

// =============================================================================
// MESSAGERIE
// =============================================================================

router.get('/messages/conversations', async (req, res, next) => {
  try {
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    const userId = req.user!.id;

    const partRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversation_participants?profile_id=eq.${userId}&select=conversation_id`,
      { headers: H }
    );
    const parts = await partRes.json() as any[];
    if (!parts?.length) return res.json(successResponse([]));

    const convIds = parts.map((p: any) => p.conversation_id).join(',');

    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?id=in.(${convIds})&select=id,subject,created_at,created_by&order=created_at.desc`,
      { headers: H }
    );
    const conversations = await convRes.json() as any[];

    const result = await Promise.all((conversations || []).map(async (conv: any) => {
      const msgRes = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${conv.id}&select=content,created_at,sender_id&order=created_at.desc&limit=1`,
        { headers: H }
      );
      const msgs = await msgRes.json() as any[];
      return { ...conv, last_message: msgs[0] || null };
    }));

    res.json(successResponse(result));
  } catch (err) { next(err); }
});

router.get('/messages/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const myId       = req.user!.id;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

    const resData = await fetch(
      `${SUPABASE_URL}/rest/v1/messages?or=(and(sender_id.eq.${myId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${myId}))&select=*&order=created_at`,
      { headers: H }
    );
    const data = (await resData.json()) as any[];

    if (!resData.ok) throw new AppError('Failed to fetch messages', 500);

    await fetch(`${SUPABASE_URL}/rest/v1/messages?receiver_id=eq.${myId}&sender_id=eq.${userId}&is_read=eq.false`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: true })
    }).catch(() => {});

    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

router.post('/messages', async (req, res, next) => {
  try {
    const { receiverId, content } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
    const senderId = req.user!.id;

    if (!receiverId || !content) throw new AppError('receiverId et content sont requis', 400);

    const resMyParts = await fetch(
      `${SUPABASE_URL}/rest/v1/conversation_participants?profile_id=eq.${senderId}&select=conversation_id`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const myParts = (await resMyParts.json()) as any[];
    const myConvIds = myParts.map((p: any) => p.conversation_id);

    let conversationId: string | null = null;

    if (myConvIds.length > 0) {
      const resOtherParts = await fetch(
        `${SUPABASE_URL}/rest/v1/conversation_participants?profile_id=eq.${receiverId}&conversation_id=in.(${myConvIds.join(',')})&select=conversation_id`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      const otherParts = (await resOtherParts.json()) as any[];
      if (otherParts.length > 0) conversationId = otherParts[0].conversation_id;
    }

    if (!conversationId) {
      const resConv = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ created_by: senderId })
      });
      const convArr = (await resConv.json()) as any[];
      conversationId = convArr[0]?.id;
      if (!conversationId) throw new AppError('Failed to create conversation', 500);

      await fetch(`${SUPABASE_URL}/rest/v1/conversation_participants`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { conversation_id: conversationId, profile_id: senderId },
          { conversation_id: conversationId, profile_id: receiverId },
        ])
      });
    }

    const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
      })
    });
    const dataArr = (await resInsert.json()) as any[];
    const data = dataArr[0];

    if (!resInsert.ok) throw new AppError('Failed to send message', 500);

    await createNotification({
      recipientId: receiverId,
      type: 'message',
      title: 'Nouveau message',
      body: content.substring(0, 100),
      data: { messageId: data.id, senderId },
    });

    res.status(201).json(successResponse(data, 'Message envoyé'));
  } catch (err) { next(err); }
});

// =============================================================================
// PROFIL ENSEIGNANT
// =============================================================================

router.get('/profile', async (req, res, next) => {
  try {
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

    const resProfile = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user!.id}&select=*`, { headers: H });
    const profileArr = (await resProfile.json()) as any[];
    const profile = profileArr[0];

    if (!resProfile.ok || !profile) throw new AppError('Profile not found', 404);

    const resTeacher = await fetch(`${SUPABASE_URL}/rest/v1/teachers?profile_id=eq.${req.user!.id}&select=*`, { headers: H });
    const teacherArr = (await resTeacher.json()) as any[];
    const teacher = teacherArr[0];

    res.json(successResponse({ ...profile, teacherData: teacher || null }));
  } catch (err) { next(err); }
});

router.patch('/profile', async (req, res, next) => {
  try {
    const { firstName, lastName, phone, address, gender, avatarUrl } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    const updates: Record<string, any> = {};
    if (firstName !== undefined) updates.first_name = firstName;
    if (lastName !== undefined) updates.last_name = lastName;
    if (phone !== undefined) updates.phone = phone;
    if (address !== undefined) updates.address = address;
    if (gender !== undefined) updates.gender = gender;
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

    if (Object.keys(updates).length === 0) {
      throw new AppError('Aucune donnée à mettre à jour', 400);
    }

    const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user!.id}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify(updates)
    });
    const dataArr = (await resUpdate.json()) as any[];
    const data = dataArr[0];

    if (!resUpdate.ok) throw new AppError('Failed to update profile', 500);

    res.json(successResponse(data, 'Profil mis à jour'));
  } catch (err) { next(err); }
});

export default router;