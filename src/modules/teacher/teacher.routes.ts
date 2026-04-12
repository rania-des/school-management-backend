import { Router } from 'express';
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import { createNotification, createBulkNotifications, getClassStudentProfileIds } from '../../utils/notifications';

const router = Router();

router.use(authenticate);
router.use(authorize('teacher', 'admin'));

// ── Supabase REST helpers ─────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function sbHeaders() {
  return {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

async function sbGet(table: string, params: string = ''): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbGet ${table} → ${res.status}:`, err);
    throw new AppError(`DB query failed on ${table}`, 500);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data ? [data] : []);
}

async function sbGetOne(table: string, params: string = ''): Promise<any> {
  const rows = await sbGet(table, params);
  return rows[0] ?? null;
}

async function sbInsert(table: string, body: object | object[]): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbInsert ${table} → ${res.status}:`, err);
    throw new AppError(`DB insert failed on ${table}: ${err}`, 500);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data.length > 0 ? data[0] : data) : data;
}

async function sbUpsert(table: string, body: object | object[], onConflict: string): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbUpsert ${table} → ${res.status}:`, err);
    throw new AppError(`DB upsert failed on ${table}`, 500);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function sbUpdate(table: string, params: string, body: object): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbUpdate ${table} → ${res.status}:`, err);
    throw new AppError(`DB update failed on ${table}`, 500);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data.length > 0 ? data[0] : data) : data;
}

async function sbDelete(table: string, params: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, { method: 'DELETE', headers: sbHeaders() });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbDelete ${table} → ${res.status}:`, err);
    throw new AppError(`DB delete failed on ${table}`, 500);
  }
}

function extractFirstItem(data: any): any {
  if (!data) return null;
  if (Array.isArray(data) && data.length > 0) return data[0];
  return data;
}

async function getTeacherId(profileId: string): Promise<string> {
  let teacher = await sbGetOne('teachers', `profile_id=eq.${profileId}&select=id`);
  if (!teacher) {
    teacher = await sbInsert('teachers', { profile_id: profileId });
  }
  return teacher.id;
}

// =============================================================================
// CLASSES & STUDENTS
// =============================================================================

router.get('/classes', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const slots = await sbGet(
      'schedule_slots',
      `teacher_id=eq.${teacherId}&is_active=eq.true&select=class_id,subject_id,classes:class_id(id,name),subjects:subject_id(id,name)`
    );
    const classMap = new Map();
    for (const slot of slots) {
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
    const students = await sbGet(
      'students',
      `class_id=eq.${classId}&select=id,profile_id,student_number,profiles:profile_id(first_name,last_name,email,avatar_url)`
    );
    const formatted = students.map((s: any) => ({
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
    const slots = await sbGet(
      'schedule_slots',
      `teacher_id=eq.${teacherId}&is_active=eq.true&select=*,subjects:subject_id(name,color),classes:class_id(name)&order=day_of_week,start_time`
    );
    const formatted = slots.map((slot: any) => ({
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
    const [classesData, assignmentsData, gradesData] = await Promise.all([
      sbGet('schedule_slots', `teacher_id=eq.${teacherId}&is_active=eq.true&select=class_id`),
      sbGet('assignments', `teacher_id=eq.${teacherId}&select=id`),
      sbGet('grades', `teacher_id=eq.${teacherId}&select=id`),
    ]);
    res.json(successResponse({
      totalClasses:     classesData.length,
      totalAssignments: assignmentsData.length,
      totalGrades:      gradesData.length,
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
    const data = await sbGet('grades', params);
    const formatted = data.map((g: any) => ({
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
    if (!studentId || !classId || !subjectId || value === undefined || !period) {
      throw new AppError('studentId, classId, subjectId, value et period sont requis', 400);
    }
    const data = await sbInsert('grades', {
      teacher_id: teacherId, student_id: studentId, class_id: classId, subject_id: subjectId,
      value: Number(value), max_value: maxValue ? Number(maxValue) : 20, period,
      type: type || 'exam', comment: comment || null,
    });
    const student = await sbGetOne('students', `id=eq.${studentId}&select=profile_id`);
    if (student?.profile_id) {
      await createNotification({ recipientId: student.profile_id, type: 'grade',
        title: 'Nouvelle note ajoutée', body: `Une note de ${value}/${maxValue || 20} a été ajoutée.`,
        data: { gradeId: data.id } });
    }
    res.status(201).json(successResponse(data, 'Note ajoutée avec succès'));
  } catch (err) { next(err); }
});

router.put('/grades/:gradeId', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { gradeId } = req.params;
    const { value, maxValue, comment } = req.body;
    const updateBody: any = { comment };
    if (value    !== undefined) updateBody.value     = Number(value);
    if (maxValue !== undefined) updateBody.max_value = Number(maxValue);
    const data = await sbUpdate('grades', `id=eq.${gradeId}&teacher_id=eq.${teacherId}`, updateBody);
    if (!data) throw new AppError('Grade not found or not authorized', 404);
    res.json(successResponse(data, 'Note modifiée avec succès'));
  } catch (err) { next(err); }
});

router.delete('/grades/:gradeId', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { gradeId } = req.params;
    await sbDelete('grades', `id=eq.${gradeId}&teacher_id=eq.${teacherId}`);
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
    let params = `teacher_id=eq.${teacherId}&select=*,subjects:subject_id(name),classes:class_id(name)&order=due_date`;
    if (classId)   params += `&class_id=eq.${classId}`;
    if (subjectId) params += `&subject_id=eq.${subjectId}`;
    if (type)      params += `&type=eq.${type}`;
    const data = await sbGet('assignments', params);
    const formatted = data.map((a: any) => ({
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
    const { classId, subjectId, title, description, dueDate, type, fileData, fileName } = req.body;
    if (!classId || !subjectId || !title) {
      throw new AppError('classId, subjectId et title sont requis', 400);
    }
    let fileUrl: string | null = null;
    if (fileData && fileName) {
      fileUrl = fileData;
    }
    const data = await sbInsert('assignments', {
      teacher_id: teacherId, class_id: classId, subject_id: subjectId, title,
      description: description || null, due_date: dueDate || null,
      type: type || 'homework', file_url: fileUrl, file_name: fileName || null,
    });
    const studentProfileIds = await getClassStudentProfileIds(classId);
    if (studentProfileIds.length > 0) {
      await createBulkNotifications(studentProfileIds, {
        type: 'assignment', title: `Nouveau devoir : ${title}`,
        body: dueDate ? `À rendre pour le ${new Date(dueDate).toLocaleDateString('fr-FR')}` : 'Nouveau devoir disponible',
        data: { assignmentId: data.id },
      });
    }
    res.status(201).json(successResponse(data, 'Devoir créé avec succès'));
  } catch (err) { next(err); }
});

router.delete('/assignments/:assignmentId', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;
    await sbDelete('assignments', `id=eq.${assignmentId}&teacher_id=eq.${teacherId}`);
    res.json(successResponse(null, 'Devoir supprimé'));
  } catch (err) { next(err); }
});

router.get('/assignments/:assignmentId/submissions', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;
    const assignment = await sbGetOne('assignments', `id=eq.${assignmentId}&teacher_id=eq.${teacherId}&select=id`);
    if (!assignment) throw new AppError('Assignment not found or not authorized', 404);
    const data = await sbGet(
      'submissions',
      `assignment_id=eq.${assignmentId}&select=*,students:student_id(id,student_number,profiles:profile_id(first_name,last_name))`
    );
    const formatted = data.map((s: any) => ({ ...s, student: extractFirstItem(s.students) }));
    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

router.patch('/submissions/:submissionId/grade', async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;
    if (score === undefined) throw new AppError('score est requis', 400);
    const data = await sbUpdate('submissions', `id=eq.${submissionId}`,
      { score: Number(score), feedback: feedback || null, status: 'graded' });
    res.json(successResponse(data, 'Soumission notée'));
  } catch (err) { next(err); }
});

// =============================================================================
// PRÉSENCES (ATTENDANCE)
// =============================================================================

router.post('/attendance', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      throw new AppError('records[] est requis', 400);
    }
    const rows = records.map((r: any) => ({
      teacher_id: teacherId, student_id: r.studentId, class_id: r.classId,
      status: r.status, date: r.date, note: r.note || null,
    }));
    const data = await sbUpsert('attendance', rows, 'student_id,class_id,date');
    const absents = records.filter((r: any) => r.status === 'absent');
    for (const absent of absents) {
      const student = await sbGetOne('students', `id=eq.${absent.studentId}&select=id,profile_id`);
      if (student) {
        const parentLinks = await sbGet('parent_student', `student_id=eq.${student.id}&select=parents:parent_id(profile_id)`);
        const parentProfileIds = parentLinks.map((pl: any) => extractFirstItem(pl.parents)?.profile_id).filter(Boolean);
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
// ANNONCES (ANNOUNCEMENTS)
// =============================================================================

router.get('/announcements', async (req, res, next) => {
  try {
    const { classId } = req.query;
    let params = `author_id=eq.${req.user!.id}&select=*,classes:class_id(name)&order=published_at.desc`;
    if (classId) params += `&class_id=eq.${classId}`;
    const data = await sbGet('announcements', params);
    res.json(successResponse(data));
  } catch (err) { next(err); }
});

router.post('/announcements', async (req, res, next) => {
  try {
    const { title, content, classId } = req.body;
    if (!title || !content) throw new AppError('title et content sont requis', 400);
    const data = await sbInsert('announcements', {
      author_id: req.user!.id, title, content,
      class_id: classId || null, published_at: new Date().toISOString(),
    });
    if (classId) {
      const studentProfileIds = await getClassStudentProfileIds(classId);
      if (studentProfileIds.length > 0) {
        await createBulkNotifications(studentProfileIds, {
          type: 'announcement', title: `Nouvelle annonce : ${title}`,
          body: content.substring(0, 100), data: { announcementId: data.id },
        });
      }
    }
    res.status(201).json(successResponse(data, 'Annonce publiée'));
  } catch (err) { next(err); }
});

router.delete('/announcements/:announcementId', async (req, res, next) => {
  try {
    const { announcementId } = req.params;
    await sbDelete('announcements', `id=eq.${announcementId}&author_id=eq.${req.user!.id}`);
    res.json(successResponse(null, 'Annonce supprimée'));
  } catch (err) { next(err); }
});

// =============================================================================
// MESSAGERIE
// =============================================================================

router.get('/messages/conversations', async (req, res, next) => {
  try {
    const myId = req.user!.id;
    const data = await sbGet(
      'messages',
      `or=(sender_id.eq.${myId},receiver_id.eq.${myId})&select=id,sender_id,receiver_id,content,created_at,is_read&order=created_at.desc`
    );
    // Get unique conversations by partner
    const conversationsMap = new Map();
    for (const msg of data) {
      const partnerId = msg.sender_id === myId ? msg.receiver_id : msg.sender_id;
      if (!conversationsMap.has(partnerId)) {
        const partner = await sbGetOne('profiles', `id=eq.${partnerId}&select=first_name,last_name`);
        conversationsMap.set(partnerId, {
          partnerId,
          otherName: partner ? `${partner.first_name} ${partner.last_name || ''}`.trim() : 'Utilisateur',
          content: msg.content,
          created_at: msg.created_at,
        });
      }
    }
    res.json(successResponse(Array.from(conversationsMap.values())));
  } catch (err) { next(err); }
});

router.get('/messages/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const myId = req.user!.id;
    const data = await sbGet(
      'messages',
      `or=(and(sender_id.eq.${myId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${myId}))&select=*&order=created_at`
    );
    await sbUpdate('messages', `receiver_id=eq.${myId}&sender_id=eq.${userId}&is_read=eq.false`, { is_read: true }).catch(() => {});
    res.json(successResponse(data));
  } catch (err) { next(err); }
});

router.post('/messages', async (req, res, next) => {
  try {
    const { receiverId, content } = req.body;
    if (!receiverId || !content) throw new AppError('receiverId et content sont requis', 400);
    const data = await sbInsert('messages', {
      sender_id: req.user!.id, receiver_id: receiverId, content, is_read: false,
    });
    await createNotification({
      recipientId: receiverId, type: 'message',
      title: `Nouveau message`,
      body: content.substring(0, 100),
      data: { messageId: data.id, senderId: req.user!.id },
    });
    res.status(201).json(successResponse(data, 'Message envoyé'));
  } catch (err) { next(err); }
});

// =============================================================================
// PROFIL ENSEIGNANT
// =============================================================================

router.get('/profile', async (req, res, next) => {
  try {
    const profile = await sbGetOne('profiles', `id=eq.${req.user!.id}&select=*`);
    if (!profile) throw new AppError('Profile not found', 404);
    const teacher = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=*`);
    res.json(successResponse({ ...profile, teacherData: teacher || null }));
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
    if (Object.keys(updates).length === 0) throw new AppError('Aucune donnée à mettre à jour', 400);
    const data = await sbUpdate('profiles', `id=eq.${req.user!.id}`, updates);
    res.json(successResponse(data, 'Profil mis à jour'));
  } catch (err) { next(err); }
});

export default router;