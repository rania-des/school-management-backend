import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import { createNotification, createBulkNotifications, getClassStudentProfileIds } from '../../utils/notifications';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Helper fetch vers Supabase REST
async function sb(table: string, params = '', options?: RequestInit): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new AppError((data as any)?.message || 'Supabase error', 500);
  return Array.isArray(data) ? data : [data];
}

// Auth middleware
router.use(authenticate);
router.use(authorize('teacher', 'admin'));

// Helper — récupérer l'ID teacher depuis profile_id
async function getTeacherId(profileId: string): Promise<string> {
  const rows = await sb('teachers', `profile_id=eq.${profileId}&select=id`);
  if (!rows?.[0]) throw new AppError('Teacher not found', 404);
  return rows[0].id;
}

function extractFirstItem(data: any): any {
  if (!data) return null;
  if (Array.isArray(data) && data.length > 0) return data[0];
  return data;
}

// =============================================================================
// CLASSES & STUDENTS
// =============================================================================

router.get('/classes', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const slots = await sb('schedule_slots',
      `teacher_id=eq.${teacherId}&is_active=eq.true&select=class_id,subject_id,classes:class_id(id,name),subjects:subject_id(id,name)`
    );

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
  } catch (err) { next(err); }
});

router.get('/students/:classId', async (req, res, next) => {
  try {
    const { classId } = req.params;
    const students = await sb('students',
      `class_id=eq.${classId}&select=id,profile_id,student_number,profiles:profile_id(first_name,last_name,email,avatar_url)`
    );
    const formatted = (students || []).map((s: any) => ({
      id: s.id, profile_id: s.profile_id, student_number: s.student_number,
      profile: extractFirstItem(s.profiles),
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
    const slots = await sb('schedule_slots',
      `teacher_id=eq.${teacherId}&is_active=eq.true&select=*,subjects:subject_id(name,color),classes:class_id(name)&order=day_of_week,start_time`
    );
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
    const [classes, assignments, grades] = await Promise.all([
      sb('schedule_slots', `teacher_id=eq.${teacherId}&is_active=eq.true&select=class_id`),
      sb('assignments',    `teacher_id=eq.${teacherId}&select=id`),
      sb('grades',         `teacher_id=eq.${teacherId}&select=id`),
    ]);
    res.json(successResponse({
      totalClasses:     classes?.length     || 0,
      totalAssignments: assignments?.length || 0,
      totalGrades:      grades?.length      || 0,
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

    let params = `teacher_id=eq.${teacherId}&select=*,students:student_id(id,student_number,profiles:profile_id(first_name,last_name)),subjects:subject_id(name)&order=created_at.desc`;
    if (classId)   params += `&class_id=eq.${classId}`;
    if (subjectId) params += `&subject_id=eq.${subjectId}`;
    if (period)    params += `&period=eq.${period}`;

    const data = await sb('grades', params);
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

    if (!studentId || !classId || !subjectId || value === undefined || !period)
      throw new AppError('studentId, classId, subjectId, value et period sont requis', 400);

    const data = await sb('grades', '', {
      method: 'POST',
      body: JSON.stringify({
        teacher_id: teacherId, student_id: studentId, class_id: classId,
        subject_id: subjectId, value: Number(value), max_value: maxValue ? Number(maxValue) : 20,
        period, type: type || 'exam', comment: comment || null,
      }),
    });

    const grade = Array.isArray(data) ? data[0] : data;

    const students = await sb('students', `id=eq.${studentId}&select=profile_id`);
    if (students?.[0]?.profile_id) {
      await createNotification({
        recipientId: students[0].profile_id, type: 'grade',
        title: 'Nouvelle note ajoutée',
        body: `Une note de ${value}/${maxValue || 20} a été ajoutée.`,
        data: { gradeId: grade?.id },
      });
    }

    res.status(201).json(successResponse(grade, 'Note ajoutée avec succès'));
  } catch (err) { next(err); }
});

router.put('/grades/:gradeId', async (req, res, next) => {
  try {
    const teacherId   = await getTeacherId(req.user!.id);
    const { gradeId } = req.params;
    const { value, maxValue, comment } = req.body;

    const data = await sb('grades', `id=eq.${gradeId}&teacher_id=eq.${teacherId}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: Number(value), max_value: maxValue ? Number(maxValue) : undefined, comment }),
    });
    if (!data?.length) throw new AppError('Grade not found or not authorized', 404);
    res.json(successResponse(data[0], 'Note modifiée avec succès'));
  } catch (err) { next(err); }
});

router.delete('/grades/:gradeId', async (req, res, next) => {
  try {
    const teacherId   = await getTeacherId(req.user!.id);
    const { gradeId } = req.params;
    await sb('grades', `id=eq.${gradeId}&teacher_id=eq.${teacherId}`, { method: 'DELETE' });
    res.json(successResponse(null, 'Note supprimée'));
  } catch (err) { next(err); }
});

// =============================================================================
// DEVOIRS (ASSIGNMENTS)
// =============================================================================

router.get('/assignments', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, subjectId } = req.query;

    let params = `teacher_id=eq.${teacherId}&select=*,subjects:subject_id(name),classes:class_id(name)&order=due_date`;
    if (classId)   params += `&class_id=eq.${classId}`;
    if (subjectId) params += `&subject_id=eq.${subjectId}`;

    const data = await sb('assignments', params);
    const formatted = (data || []).map((a: any) => ({
      ...a,
      subject: extractFirstItem(a.subjects),
      class:   extractFirstItem(a.classes),
    }));
    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

router.post('/assignments', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, subjectId, title, description, dueDate, type, maxScore } = req.body;

    if (!classId || !subjectId || !title || !dueDate)
      throw new AppError('classId, subjectId, title et dueDate sont requis', 400);

    const data = await sb('assignments', '', {
      method: 'POST',
      body: JSON.stringify({
        teacher_id: teacherId, class_id: classId, subject_id: subjectId,
        title, description: description || null, due_date: dueDate,
        type: type || 'homework', max_score: maxScore ? Number(maxScore) : null,
      }),
    });
    const assignment = Array.isArray(data) ? data[0] : data;

    const studentProfileIds = await getClassStudentProfileIds(classId);
    if (studentProfileIds.length > 0) {
      await createBulkNotifications(studentProfileIds, {
        type: 'assignment', title: `Nouveau devoir : ${title}`,
        body: `À rendre pour le ${new Date(dueDate).toLocaleDateString('fr-FR')}`,
        data: { assignmentId: assignment?.id },
      });
    }
    res.status(201).json(successResponse(assignment, 'Devoir créé avec succès'));
  } catch (err) { next(err); }
});

router.put('/assignments/:assignmentId', async (req, res, next) => {
  try {
    const teacherId        = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;
    const { title, description, dueDate, type, maxScore } = req.body;

    const data = await sb('assignments', `id=eq.${assignmentId}&teacher_id=eq.${teacherId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title, description, due_date: dueDate, type, max_score: maxScore ? Number(maxScore) : undefined }),
    });
    if (!data?.length) throw new AppError('Assignment not found or not authorized', 404);
    res.json(successResponse(data[0], 'Devoir modifié'));
  } catch (err) { next(err); }
});

router.delete('/assignments/:assignmentId', async (req, res, next) => {
  try {
    const teacherId        = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;
    await sb('assignments', `id=eq.${assignmentId}&teacher_id=eq.${teacherId}`, { method: 'DELETE' });
    res.json(successResponse(null, 'Devoir supprimé'));
  } catch (err) { next(err); }
});

router.get('/assignments/:assignmentId/submissions', async (req, res, next) => {
  try {
    const teacherId        = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;

    const asgmt = await sb('assignments', `id=eq.${assignmentId}&teacher_id=eq.${teacherId}&select=id`);
    if (!asgmt?.length) throw new AppError('Assignment not found or not authorized', 404);

    const data = await sb('submissions',
      `assignment_id=eq.${assignmentId}&select=*,students:student_id(id,student_number,profiles:profile_id(first_name,last_name))`
    );
    const formatted = (data || []).map((s: any) => ({ ...s, student: extractFirstItem(s.students) }));
    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

router.patch('/submissions/:submissionId/grade', async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;
    if (score === undefined) throw new AppError('score est requis', 400);

    const data = await sb('submissions', `id=eq.${submissionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ score: Number(score), feedback: feedback || null, status: 'graded' }),
    });
    res.json(successResponse(Array.isArray(data) ? data[0] : data, 'Soumission notée'));
  } catch (err) { next(err); }
});

// =============================================================================
// PRÉSENCES (ATTENDANCE)
// =============================================================================

router.get('/attendance', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, date, startDate, endDate } = req.query;

    let params = `teacher_id=eq.${teacherId}&select=*,students:student_id(id,student_number,profiles:profile_id(first_name,last_name))&order=date.desc`;
    if (classId)   params += `&class_id=eq.${classId}`;
    if (date)      params += `&date=eq.${date}`;
    if (startDate) params += `&date=gte.${startDate}`;
    if (endDate)   params += `&date=lte.${endDate}`;

    const data = await sb('attendance', params);
    const formatted = (data || []).map((a: any) => ({ ...a, student: extractFirstItem(a.students) }));
    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

router.post('/attendance', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0)
      throw new AppError('records[] est requis', 400);

    const rows = records.map((r: any) => ({
      teacher_id: teacherId, student_id: r.studentId, class_id: r.classId,
      status: r.status, date: r.date, note: r.note || null,
    }));

    const data = await sb('attendance', 'on_conflict=student_id,class_id,date', {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=representation',
      } as any,
      body: JSON.stringify(rows),
    });

    const absents = records.filter((r: any) => r.status === 'absent');
    for (const absent of absents) {
      const students = await sb('students', `id=eq.${absent.studentId}&select=id,profile_id`);
      const student = students?.[0];
      if (student) {
        const parentLinks = await sb('parent_student', `student_id=eq.${student.id}&select=parents:parent_id(profile_id)`);
        const parentProfileIds = (parentLinks || []).map((pl: any) => extractFirstItem(pl.parents)?.profile_id).filter(Boolean);
        if (parentProfileIds.length > 0) {
          await createBulkNotifications(parentProfileIds, {
            type: 'absence', title: 'Absence signalée',
            body: `Votre enfant a été marqué absent le ${absent.date}.`,
            data: { studentId: student.id, date: absent.date },
          });
        }
      }
    }
    res.status(201).json(successResponse(data, 'Présences enregistrées'));
  } catch (err) { next(err); }
});

// =============================================================================
// ANNONCES
// =============================================================================

router.get('/announcements', async (req, res, next) => {
  try {
    const { classId } = req.query;
    let params = `select=*&order=created_at.desc`;
    if (classId) params += `&class_id=eq.${classId}`;
    const data = await sb('announcements', params);
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

router.post('/announcements', async (req, res, next) => {
  try {
    const { title, content, classId, targetRole } = req.body;
    if (!title || !content) throw new AppError('title et content sont requis', 400);

    const data = await sb('announcements', '', {
      method: 'POST',
      body: JSON.stringify({
        author_id: req.user!.id, title, content,
        class_id: classId || null, target_role: targetRole || null,
      }),
    });
    const announcement = Array.isArray(data) ? data[0] : data;

    if (classId) {
      const studentProfileIds = await getClassStudentProfileIds(classId);
      if (studentProfileIds.length > 0) {
        await createBulkNotifications(studentProfileIds, {
          type: 'announcement', title: `Nouvelle annonce : ${title}`,
          body: content.substring(0, 100), data: { announcementId: announcement?.id },
        });
      }
    }
    res.status(201).json(successResponse(announcement, 'Annonce publiée'));
  } catch (err) { next(err); }
});

router.delete('/announcements/:announcementId', async (req, res, next) => {
  try {
    const { announcementId } = req.params;
    await sb('announcements', `id=eq.${announcementId}&author_id=eq.${req.user!.id}`, { method: 'DELETE' });
    res.json(successResponse(null, 'Annonce supprimée'));
  } catch (err) { next(err); }
});

// =============================================================================
// MESSAGERIE
// =============================================================================

router.get('/messages/conversations', async (req, res, next) => {
  try {
    const myId = req.user!.id;
    const data = await sb('messages',
      `or=(sender_id.eq.${myId},receiver_id.eq.${myId})&select=id,sender_id,receiver_id,content,created_at,is_read,sender:sender_id(first_name,last_name,avatar_url),receiver:receiver_id(first_name,last_name,avatar_url)&order=created_at.desc`
    );
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

router.get('/messages/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const myId = req.user!.id;
    const data = await sb('messages',
      `or=(and(sender_id.eq.${myId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${myId}))&select=*&order=created_at`
    );
    await sb('messages', `receiver_id=eq.${myId}&sender_id=eq.${userId}&is_read=eq.false`, {
      method: 'PATCH', body: JSON.stringify({ is_read: true }),
    });
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

router.post('/messages', async (req, res, next) => {
  try {
    const { receiverId, content } = req.body;
    if (!receiverId || !content) throw new AppError('receiverId et content sont requis', 400);

    const data = await sb('messages', '', {
      method: 'POST',
      body: JSON.stringify({ sender_id: req.user!.id, receiver_id: receiverId, content, is_read: false }),
    });
    const message = Array.isArray(data) ? data[0] : data;

    await createNotification({
      recipientId: receiverId, type: 'message',
      title: `Message de ${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim(),
      body: content.substring(0, 100), data: { messageId: message?.id, senderId: req.user!.id },
    });
    res.status(201).json(successResponse(message, 'Message envoyé'));
  } catch (err) { next(err); }
});

// =============================================================================
// PROFIL
// =============================================================================

router.get('/profile', async (req, res, next) => {
  try {
    const profiles = await sb('profiles', `id=eq.${req.user!.id}&select=*`);
    if (!profiles?.length) throw new AppError('Profile not found', 404);
    const teachers = await sb('teachers', `profile_id=eq.${req.user!.id}&select=*`);
    res.json(successResponse({ ...profiles[0], teacherData: teachers?.[0] || null }));
  } catch (err) { next(err); }
});

router.patch('/profile', async (req, res, next) => {
  try {
    const { firstName, lastName, phone, address, gender, avatarUrl } = req.body;
    const updates: Record<string, any> = {};
    if (firstName !== undefined) updates.first_name = firstName;
    if (lastName  !== undefined) updates.last_name  = lastName;
    if (phone     !== undefined) updates.phone      = phone;
    if (address   !== undefined) updates.address    = address;
    if (gender    !== undefined) updates.gender     = gender;
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

    if (Object.keys(updates).length === 0)
      throw new AppError('Aucune donnée à mettre à jour', 400);

    const data = await sb('profiles', `id=eq.${req.user!.id}`, {
      method: 'PATCH', body: JSON.stringify(updates),
    });
    res.json(successResponse(Array.isArray(data) ? data[0] : data, 'Profil mis à jour'));
  } catch (err) { next(err); }
});

export default router;