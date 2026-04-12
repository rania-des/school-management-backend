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
// FIX: si la ligne n'existe pas encore dans la table teachers, on la crée automatiquement
async function getTeacherId(profileId: string): Promise<string> {
  const { data: teacher } = await supabaseAdmin
    .from('teachers')
    .select('id')
    .eq('profile_id', profileId)
    .single();

  if (teacher) return teacher.id;

  // Ligne manquante → on la crée à la volée
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

// GET /api/v1/teacher/classes — classes assignées à l'enseignant
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

// GET /api/v1/teacher/students/:classId — élèves d'une classe
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

// GET /api/v1/teacher/schedule — emploi du temps de l'enseignant
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
// STATISTIQUES
// =============================================================================

// GET /api/v1/teacher/stats — stats résumées
router.get('/stats', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);

    const [classesRes, assignmentsRes, gradesRes] = await Promise.all([
      supabaseAdmin
        .from('schedule_slots')
        .select('class_id', { count: 'exact', head: true })
        .eq('teacher_id', teacherId)
        .eq('is_active', true),
      supabaseAdmin
        .from('assignments')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', teacherId),
      supabaseAdmin
        .from('grades')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', teacherId),
    ]);

    res.json(successResponse({
      totalClasses:     classesRes.count     || 0,
      totalAssignments: assignmentsRes.count || 0,
      totalGrades:      gradesRes.count      || 0,
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

// POST /api/v1/teacher/grades — ajouter une note
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

    // Notification à l'élève
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

// PUT /api/v1/teacher/grades/:gradeId — modifier une note
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

// DELETE /api/v1/teacher/grades/:gradeId
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

// GET /api/v1/teacher/assignments?classId=&subjectId=
router.get('/assignments', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, subjectId } = req.query;

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

// POST /api/v1/teacher/assignments — créer un devoir
router.post('/assignments', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, subjectId, title, description, dueDate, type, maxScore } = req.body;

    if (!classId || !subjectId || !title || !dueDate) {
      throw new AppError('classId, subjectId, title et dueDate sont requis', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('assignments')
      .insert({
        teacher_id:  teacherId,
        class_id:    classId,
        subject_id:  subjectId,
        title,
        description: description || null,
        due_date:    dueDate,
        type:        type || 'homework',
        max_score:   maxScore ? Number(maxScore) : null,
      })
      .select()
      .single();

    if (error) throw new AppError(`Failed to create assignment: ${error.message}`, 500);

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
    const teacherId           = await getTeacherId(req.user!.id);
    const { assignmentId }    = req.params;
    const { title, description, dueDate, type, maxScore } = req.body;

    const { data, error } = await supabaseAdmin
      .from('assignments')
      .update({ title, description, due_date: dueDate, type, max_score: maxScore ? Number(maxScore) : undefined })
      .eq('id', assignmentId)
      .eq('teacher_id', teacherId)
      .select()
      .single();

    if (error) throw new AppError('Failed to update assignment', 500);
    if (!data)  throw new AppError('Assignment not found or not authorized', 404);

    res.json(successResponse(data, 'Devoir modifié'));
  } catch (err) { next(err); }
});

// DELETE /api/v1/teacher/assignments/:assignmentId
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

// GET /api/v1/teacher/assignments/:assignmentId/submissions — soumissions d'un devoir
router.get('/assignments/:assignmentId/submissions', async (req, res, next) => {
  try {
    const teacherId        = await getTeacherId(req.user!.id);
    const { assignmentId } = req.params;

    // Vérifier que le devoir appartient à l'enseignant
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

// PATCH /api/v1/teacher/submissions/:submissionId/grade — noter une soumission
router.patch('/submissions/:submissionId/grade', async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;

    if (score === undefined) throw new AppError('score est requis', 400);

    const { data, error } = await supabaseAdmin
      .from('submissions')
      .update({ score: Number(score), feedback: feedback || null, status: 'graded' })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw new AppError('Failed to grade submission', 500);

    res.json(successResponse(data, 'Soumission notée'));
  } catch (err) { next(err); }
});

// =============================================================================
// PRÉSENCES (ATTENDANCE)
// =============================================================================

// GET /api/v1/teacher/attendance?classId=&date=
router.get('/attendance', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    const { classId, date, startDate, endDate } = req.query;

    let query = supabaseAdmin
      .from('attendance')
      .select(`
        *,
        students:student_id(id, student_number, profiles:profile_id(first_name, last_name))
      `)
      .eq('teacher_id', teacherId);

    if (classId)   query = query.eq('class_id', classId as string);
    if (date)      query = query.eq('date', date as string);
    if (startDate) query = query.gte('date', startDate as string);
    if (endDate)   query = query.lte('date', endDate as string);

    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw new AppError('Failed to fetch attendance', 500);

    const formatted = (data || []).map((a: any) => ({
      ...a,
      student: extractFirstItem(a.students),
    }));

    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// POST /api/v1/teacher/attendance — enregistrer les présences (tableau)
router.post('/attendance', async (req, res, next) => {
  try {
    const teacherId = await getTeacherId(req.user!.id);
    // records = [{ studentId, classId, status, date, note? }]
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      throw new AppError('records[] est requis', 400);
    }

    const rows = records.map((r: any) => ({
      teacher_id: teacherId,
      student_id: r.studentId,
      class_id:   r.classId,
      status:     r.status,   // 'present' | 'absent' | 'late'
      date:       r.date,
      note:       r.note || null,
    }));

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .upsert(rows, { onConflict: 'student_id,class_id,date' })
      .select();

    if (error) throw new AppError(`Failed to save attendance: ${error.message}`, 500);

    // Notifications aux parents pour les absences
    const absents = records.filter((r: any) => r.status === 'absent');
    for (const absent of absents) {
      const { data: student } = await supabaseAdmin
        .from('students')
        .select('id, profile_id')
        .eq('id', absent.studentId)
        .single();

      if (student) {
        const { data: parentLinks } = await supabaseAdmin
          .from('parent_student')
          .select('parents(profile_id)')
          .eq('student_id', student.id);

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

    let query = supabaseAdmin
      .from('announcements')
      .select('*')
      .or(`author_id.eq.${req.user!.id},target_role.eq.teacher,target_role.is.null`);

    if (classId) query = query.eq('class_id', classId as string);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new AppError('Failed to fetch announcements', 500);

    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// POST /api/v1/teacher/announcements
router.post('/announcements', async (req, res, next) => {
  try {
    const { title, content, classId, targetRole } = req.body;

    if (!title || !content) throw new AppError('title et content sont requis', 400);

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .insert({
        author_id:   req.user!.id,
        title,
        content,
        class_id:    classId    || null,
        target_role: targetRole || null,
      })
      .select()
      .single();

    if (error) throw new AppError(`Failed to create announcement: ${error.message}`, 500);

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

// GET /api/v1/teacher/messages/conversations
// FIX: suppression des joins relationnels Supabase sur sender/receiver qui causaient le 500.
// On récupère les messages bruts puis on déduplique côté serveur.
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

    // Récupérer les profils des interlocuteurs uniques
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

    // Enrichir chaque message avec les infos de l'interlocuteur
    const enriched = (messages || []).map((m: any) => {
      const isMe      = m.sender_id === myId;
      const partnerId = isMe ? m.receiver_id : m.sender_id;
      const partner   = profilesMap[partnerId] || {};
      return {
        ...m,
        sender:   profilesMap[m.sender_id]   || null,
        receiver: profilesMap[m.receiver_id] || null,
        partnerId,
        otherName: partner.first_name
          ? `${partner.first_name} ${partner.last_name || ''}`.trim()
          : 'Utilisateur',
      };
    });

    res.json(successResponse(enriched));
  } catch (err) { next(err); }
});

// GET /api/v1/teacher/messages/:userId — conversation avec un utilisateur
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

    // Marquer les messages reçus comme lus
    await supabaseAdmin
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', myId)
      .eq('sender_id', userId)
      .eq('is_read', false);

    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// POST /api/v1/teacher/messages — envoyer un message
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

    // Notification au destinataire
    await createNotification({
      recipientId: receiverId,
      type:        'message',
      title:       `Message de ${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim(),
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
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user!.id)
      .single();

    if (profileError || !profile) throw new AppError('Profile not found', 404);

    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('*')
      .eq('profile_id', req.user!.id)
      .single();

    res.json(successResponse({ ...profile, teacherData: teacher || null }));
  } catch (err) { next(err); }
});

// PATCH /api/v1/teacher/profile — mettre à jour le profil
router.patch('/profile', async (req, res, next) => {
  try {
    const { firstName, lastName, phone, address, gender, avatarUrl } = req.body;

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

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', req.user!.id)
      .select()
      .single();

    if (error) throw new AppError('Failed to update profile', 500);

    res.json(successResponse(data, 'Profil mis à jour'));
  } catch (err) { next(err); }
});

export default router;