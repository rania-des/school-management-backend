import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { supabaseAdmin } from '../../config/supabase';
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

// Helper pour récupérer l'ID teacher depuis le profile_id
async function getTeacherId(profileId: string): Promise<string> {
  const { data: teacher } = await supabaseAdmin
    .from('teachers')
    .select('id')
    .eq('profile_id', profileId)
    .single();

  if (teacher) return teacher.id;

  const { data: created, error: createError } = await supabaseAdmin
    .from('teachers')
    .insert({ profile_id: profileId })
    .select('id')
    .single();

  if (createError || !created) {
    console.error(`getTeacherId: impossible de créer le teacher pour profile_id=${profileId}`, createError);
    throw new AppError(`Teacher record not found and could not be created for profile ${profileId}`, 500);
  }

  return created.id;
}

// =============================================================================
// CLASSES & STUDENTS
// =============================================================================

router.get('/classes', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);

    const { data: slots, error } = await supabaseAdmin
      .from('schedule_slots')
      .select(`
        class_id,
        subject_id,
        classes:class_id(id, name),
        subjects:subject_id(id, name)
      `)
      .eq('teacher_id', teacherId)
      .eq('is_active', true);

    if (error) throw new AppError('Failed to fetch teacher classes', 500);

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

    const { data: students, error } = await supabaseAdmin
      .from('students')
      .select(`
        id,
        profile_id,
        student_number,
        profiles:profile_id(first_name, last_name, email, avatar_url)
      `)
      .eq('class_id', classId);

    if (error) throw new AppError('Failed to fetch students', 500);

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

    const { data: slots, error } = await supabaseAdmin
      .from('schedule_slots')
      .select(`
        *,
        subjects:subject_id(name, color),
        classes:class_id(name)
      `)
      .eq('teacher_id', teacherId)
      .eq('is_active', true)
      .order('day_of_week')
      .order('start_time');

    if (error) throw new AppError('Failed to fetch schedule', 500);

    const formatted = (slots || []).map((slot: any) => ({
      ...slot,
      subjects: extractFirstItem(slot.subjects),
      classes:  extractFirstItem(slot.classes),
    }));

    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// =============================================================================
// NOTES (GRADES)
// =============================================================================

router.get('/grades', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, subjectId, period } = req.query;

    let query = supabaseAdmin
      .from('grades')
      .select(`
        *,
        students:student_id(id, student_number, profiles:profile_id(first_name, last_name)),
        subjects:subject_id(name)
      `)
      .eq('teacher_id', teacherId);

    if (classId)   query = query.eq('class_id',   classId as string);
    if (subjectId) query = query.eq('subject_id', subjectId as string);
    if (period)    query = query.eq('period',      period as string);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new AppError('Failed to fetch grades', 500);

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

    if (!studentId || !classId || !subjectId || value === undefined || !period) {
      throw new AppError('studentId, classId, subjectId, value et period sont requis', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('grades')
      .insert({
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
      .select()
      .single();

    if (error) throw new AppError(`Failed to create grade: ${error.message}`, 500);

    const { data: student } = await supabaseAdmin
      .from('students')
      .select('profile_id')
      .eq('id', studentId)
      .single();

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
    const teacherId         = await getTeacherId(req.user!.id);
    const { gradeId }       = req.params;
    const { value, maxValue, comment } = req.body;

    const { data, error } = await supabaseAdmin
      .from('grades')
      .update({ value: Number(value), max_value: maxValue ? Number(maxValue) : undefined, comment })
      .eq('id', gradeId)
      .eq('teacher_id', teacherId)
      .select()
      .single();

    if (error) throw new AppError('Failed to update grade', 500);
    if (!data)  throw new AppError('Grade not found or not authorized', 404);

    res.json(successResponse(data, 'Note modifiée avec succès'));
  } catch (err) { next(err); }
});

router.delete('/grades/:gradeId', async (req, res, next) => {
  try {
    const teacherId   = await getTeacherId(req.user!.id);
    const { gradeId } = req.params;

    const { error } = await supabaseAdmin
      .from('grades')
      .delete()
      .eq('id', gradeId)
      .eq('teacher_id', teacherId);

    if (error) throw new AppError('Failed to delete grade', 500);

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

    let query = supabaseAdmin
      .from('assignments')
      .select(`
        *,
        subjects:subject_id(name),
        classes:class_id(name)
      `)
      .eq('teacher_id', teacherId);

    if (classId)   query = query.eq('class_id',   classId as string);
    if (subjectId) query = query.eq('subject_id', subjectId as string);
    if (type)      query = query.eq('type',       type as string);

    const { data, error } = await query.order('due_date', { ascending: true });
    if (error) throw new AppError('Failed to fetch assignments', 500);

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
    const { classId, subjectId, title, description, dueDate, type, fileData, fileName } = req.body;

    if (!classId || !subjectId || !title) {
      throw new AppError('classId, subjectId et title sont requis', 400);
    }

    let fileUrl: string | null = null;
    if (fileData && fileName) {
      fileUrl = fileData;
    }

    const { data, error } = await supabaseAdmin
      .from('assignments')
      .insert({
        teacher_id:  teacherId,
        class_id:    classId,
        subject_id:  subjectId,
        title,
        description: description || null,
        due_date:    dueDate || null,
        type:        type || 'homework',
        file_url:    fileUrl,
        file_name:   fileName || null,
      })
      .select()
      .single();

    if (error) throw new AppError(`Failed to create assignment: ${error.message}`, 500);

    const studentProfileIds = await getClassStudentProfileIds(classId);
    if (studentProfileIds.length > 0) {
      await createBulkNotifications(studentProfileIds, {
        type:  'assignment',
        title: `Nouveau devoir : ${title}`,
        body:  dueDate ? `À rendre pour le ${new Date(dueDate).toLocaleDateString('fr-FR')}` : 'Nouveau devoir disponible',
        data:  { assignmentId: data.id },
      });
    }

    res.status(201).json(successResponse(data, 'Devoir créé avec succès'));
  } catch (err) { next(err); }
});

router.delete('/assignments/:assignmentId', async (req, res, next) => {
  try {
    const teacherId        = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;

    const { error } = await supabaseAdmin
      .from('assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('teacher_id', teacherId);

    if (error) throw new AppError('Failed to delete assignment', 500);

    res.json(successResponse(null, 'Devoir supprimé'));
  } catch (err) { next(err); }
});

router.get('/assignments/:assignmentId/submissions', async (req, res, next) => {
  try {
    const teacherId        = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;

    const { data: assignment } = await supabaseAdmin
      .from('assignments')
      .select('id')
      .eq('id', assignmentId)
      .eq('teacher_id', teacherId)
      .single();

    if (!assignment) throw new AppError('Assignment not found or not authorized', 404);

    const { data, error } = await supabaseAdmin
      .from('submissions')
      .select(`
        *,
        students:student_id(id, student_number, profiles:profile_id(first_name, last_name))
      `)
      .eq('assignment_id', assignmentId);

    if (error) throw new AppError('Failed to fetch submissions', 500);

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

    const updateData: any = { status: 'graded' };
    if (score !== undefined) updateData.score = Number(score);
    if (feedback !== undefined) updateData.feedback = feedback;

    const { data, error } = await supabaseAdmin
      .from('submissions')
      .update(updateData)
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw new AppError('Failed to grade submission', 500);

    res.json(successResponse(data, 'Soumission mise à jour'));
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
      teacher_id: teacherId,
      student_id: r.studentId,
      class_id:   r.classId,
      status:     r.status,
      date:       r.date,
      note:       r.note || null,
    }));

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .upsert(rows, { onConflict: 'student_id,class_id,date' })
      .select();

    if (error) throw new AppError(`Failed to save attendance: ${error.message}`, 500);

    res.status(201).json(successResponse(data, 'Présences enregistrées'));
  } catch (err) { next(err); }
});

// =============================================================================
// ANNONCES (ANNOUNCEMENTS)
// =============================================================================

router.get('/announcements', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .select(`
        *,
        classes:class_id(name)
      `)
      .eq('author_id', req.user!.id)
      .order('published_at', { ascending: false });

    if (error) throw new AppError('Failed to fetch announcements', 500);

    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

router.post('/announcements', async (req, res, next) => {
  try {
    const { title, content, classId } = req.body;

    if (!title || !content) throw new AppError('title et content sont requis', 400);

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .insert({
        author_id:    req.user!.id,
        title,
        content,
        class_id:     classId || null,
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new AppError(`Failed to create announcement: ${error.message}`, 500);

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

    const { error } = await supabaseAdmin
      .from('announcements')
      .delete()
      .eq('id', announcementId)
      .eq('author_id', req.user!.id);

    if (error) throw new AppError('Failed to delete announcement', 500);

    res.json(successResponse(null, 'Annonce supprimée'));
  } catch (err) { next(err); }
});

// =============================================================================
// MESSAGERIE
// =============================================================================

router.get('/messages/conversations', async (req, res, next) => {
  try {
    const myId = req.user!.id;

    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id, receiver_id, content, created_at, is_read')
      .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('messages/conversations Supabase error:', error);
      throw new AppError('Failed to fetch conversations', 500);
    }

    const partnerIds = [
      ...new Set(
        (messages || []).map((m: any) => (m.sender_id === myId ? m.receiver_id : m.sender_id))
      ),
    ];

    let profilesMap: Record<string, any> = {};
    if (partnerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', partnerIds);

      (profiles || []).forEach((p: any) => { profilesMap[p.id] = p; });
    }

    const enriched = (messages || []).map((m: any) => {
      const isMe      = m.sender_id === myId;
      const partnerId = isMe ? m.receiver_id : m.sender_id;
      const partner   = profilesMap[partnerId] || {};
      return {
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        partnerId,
        otherName: partner.first_name
          ? `${partner.first_name} ${partner.last_name || ''}`.trim()
          : 'Utilisateur',
      };
    });

    const unique = new Map();
    for (const conv of enriched) {
      if (!unique.has(conv.partnerId)) {
        unique.set(conv.partnerId, conv);
      }
    }

    res.json(successResponse(Array.from(unique.values())));
  } catch (err) { next(err); }
});

router.get('/messages/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const myId       = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${myId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${myId})`
      )
      .order('created_at', { ascending: true });

    if (error) throw new AppError('Failed to fetch messages', 500);

    await supabaseAdmin
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', myId)
      .eq('sender_id', userId)
      .eq('is_read', false);

    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

router.post('/messages', async (req, res, next) => {
  try {
    const { receiverId, content } = req.body;

    if (!receiverId || !content) throw new AppError('receiverId et content sont requis', 400);

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        sender_id:   req.user!.id,
        receiver_id: receiverId,
        content,
        is_read:     false,
      })
      .select()
      .single();

    if (error) throw new AppError(`Failed to send message: ${error.message}`, 500);

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

export default router;