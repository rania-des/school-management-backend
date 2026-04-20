import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification } from '../../utils/notifications';

const router = Router();
router.use(authenticate);

const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const H = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  return { data: await res.json(), ok: res.ok };
}
async function sbPost(path: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any[];
  return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
}
async function sbPatch(path: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any[];
  return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
}

// Helper : résoudre le teacher entity id depuis un profile_id
async function resolveTeacherId(profileId: string): Promise<string | null> {
  const { data } = await sbGet(`teachers?profile_id=eq.${profileId}&select=id`);
  return Array.isArray(data) ? data[0]?.id ?? null : null;
}

// Helper : résoudre le parent entity id depuis un profile_id
async function resolveParentId(profileId: string): Promise<string | null> {
  const { data } = await sbGet(`parents?profile_id=eq.${profileId}&select=id`);
  return Array.isArray(data) ? data[0]?.id ?? null : null;
}

// ─── GET /meetings ─────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status } = req.query;

    let url = `meetings?select=*,teachers(id,profile_id,profiles(first_name,last_name)),parents(id,profile_id,profiles(first_name,last_name)),students(id,profiles(first_name,last_name),classes(id,name))&order=created_at.desc&offset=${offset}&limit=${limit}`;

    if (req.user!.role === 'teacher') {
      const tid = await resolveTeacherId(req.user!.id);
      if (tid) {
        url += `&teacher_id=eq.${tid}`;
      }
      else return res.json(paginate([], 0, { page, limit, offset }));
    } 
    else if (req.user!.role === 'parent') {
      const pid = await resolveParentId(req.user!.id);
      if (pid) {
        // ✅ Le parent voit TOUTES ses réunions (individuelles ET de classe)
        url += `&parent_id=eq.${pid}`;
      }
      else return res.json(paginate([], 0, { page, limit, offset }));
    }
    // Pour admin, pas de filtre spécifique

    if (status) url += `&status=eq.${status}`;

    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];
    return res.json(paginate(arr, arr.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// ─── GET /meetings/class/:classId/parents ──────────────────────────────────────
router.get('/class/:classId/parents', authorize('admin', 'teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId } = req.params;

    const { data: students } = await sbGet(`students?class_id=eq.${classId}&select=id,profiles(first_name,last_name)`);
    const studentIds = Array.isArray(students) ? students.map((s: any) => s.id) : [];

    if (studentIds.length === 0) return res.json(successResponse({ students: [], parentLinks: [] }));

    const { data: parentLinks } = await sbGet(
      `parent_student?student_id=in.(${studentIds.join(',')})&select=parent_id,student_id,parents(id,profile_id,profiles(first_name,last_name,email))`
    );

    return res.json(successResponse({ students: students || [], parentLinks: parentLinks || [] }));
  } catch (err) { return next(err); }
});

// ─── GET /meetings/teacher/my-students ─────────────────────────────────────────
router.get('/teacher/my-students', authorize('teacher'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teacherId = await resolveTeacherId(req.user!.id);
    if (!teacherId) throw new AppError('Teacher not found', 404);

    const { data: assignments } = await sbGet(
      `teacher_assignments?teacher_id=eq.${teacherId}&select=class_id,classes(id,name)`
    );
    const classIds = Array.isArray(assignments) ? [...new Set(assignments.map((a: any) => a.class_id))] : [];

    if (classIds.length === 0) return res.json(successResponse([]));

    const { data: students } = await sbGet(
      `students?class_id=in.(${classIds.join(',')})&select=id,profile_id,class_id,profiles(first_name,last_name),classes(id,name)`
    );

    return res.json(successResponse(students || []));
  } catch (err) { return next(err); }
});

// ─── GET /meetings/parent/teachers ─────────────────────────────────────────────
router.get('/parent/teachers', authorize('parent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parentId = await resolveParentId(req.user!.id);
    if (!parentId) throw new AppError('Parent not found', 404);

    const { data: links } = await sbGet(
      `parent_student?parent_id=eq.${parentId}&select=student_id,students(id,class_id,profiles(first_name,last_name))`
    );
    const classIds = Array.isArray(links)
      ? [...new Set(links.map((l: any) => l.students?.class_id).filter(Boolean))]
      : [];

    if (classIds.length === 0) return res.json(successResponse({ teachers: [], children: [], parentId }));

    const { data: assignments } = await sbGet(
      `teacher_assignments?class_id=in.(${classIds.join(',')})&select=teacher_id,teachers(id,profile_id,profiles(first_name,last_name))`
    );

    const teacherMap = new Map<string, any>();
    if (Array.isArray(assignments)) {
      assignments.forEach((a: any) => {
        if (a.teachers && !teacherMap.has(a.teacher_id)) {
          teacherMap.set(a.teacher_id, {
            id: a.teachers.id,
            profile_id: a.teachers.profile_id,
            first_name: a.teachers.profiles?.first_name || '',
            last_name: a.teachers.profiles?.last_name || '',
          });
        }
      });
    }

    const children = Array.isArray(links) ? links.map((l: any) => ({
      id: l.students?.id,
      name: `${l.students?.profiles?.first_name || ''} ${l.students?.profiles?.last_name || ''}`.trim(),
      class_id: l.students?.class_id,
    })).filter((c: any) => c.id) : [];

    return res.json(successResponse({
      teachers: Array.from(teacherMap.values()),
      children,
      parentId,
    }));
  } catch (err) { return next(err); }
});

// ─── POST /meetings ─────────────────────────────────────────────────────────────
router.post('/', authorize('parent', 'teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      teacherId: z.string().uuid().optional(),
      parentId:  z.string().uuid().optional(),
      studentId: z.string().uuid(),
      scheduledAt: z.string().optional(),
      durationMinutes: z.number().default(30),
      location: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    let teacherId = body.teacherId;
    let parentId  = body.parentId;

    if (req.user!.role === 'parent') {
      parentId = (await resolveParentId(req.user!.id)) ?? undefined;
      if (!parentId) throw new AppError('Parent profile not found', 404);
      if (!teacherId) throw new AppError('teacherId is required', 400);
    } else if (req.user!.role === 'teacher') {
      teacherId = (await resolveTeacherId(req.user!.id)) ?? undefined;
      if (!teacherId) throw new AppError('Teacher profile not found', 404);
      if (!parentId) throw new AppError('parentId is required', 400);
    } else {
      if (!teacherId) throw new AppError('teacherId is required', 400);
      if (!parentId)  throw new AppError('parentId is required', 400);
    }

    const { data, ok } = await sbPost('meetings', {
      teacher_id: teacherId,
      parent_id: parentId,
      student_id: body.studentId,
      requested_by: req.user!.id,
      scheduled_at: body.scheduledAt || null,
      duration_minutes: body.durationMinutes,
      location: body.location || null,
      notes: body.notes || null,
      status: 'requested',
    });
    if (!ok || !data) throw new AppError('Failed to create meeting request', 500);

    if (req.user!.role === 'parent') {
      const { data: tp } = await sbGet(`teachers?id=eq.${teacherId}&select=profile_id`);
      const tProfileId = Array.isArray(tp) ? tp[0]?.profile_id : null;
      if (tProfileId) {
        await createNotification({
          recipientId: tProfileId,
          type: 'meeting',
          title: 'Demande de réunion',
          body: 'Un parent souhaite vous rencontrer. Confirmez, refusez ou proposez un autre créneau.',
          data: { meetingId: data.id },
        });
      }
    } else {
      const { data: pp } = await sbGet(`parents?id=eq.${parentId}&select=profile_id`);
      const pProfileId = Array.isArray(pp) ? pp[0]?.profile_id : null;
      if (pProfileId) {
        await createNotification({
          recipientId: pProfileId,
          type: 'meeting',
          title: 'Invitation à une réunion',
          body: `Vous avez reçu une invitation à une réunion${body.scheduledAt ? ` le ${new Date(body.scheduledAt).toLocaleString('fr-FR')}` : ''}.`,
          data: { meetingId: data.id },
        });
      }
    }

    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// ─── POST /meetings/class ───────────────────────────────────────────────────────
router.post('/class', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      classId: z.string().uuid(),
      teacherId: z.string().uuid(),
      scheduledAt: z.string(),
      durationMinutes: z.number().default(30),
      location: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const { data: students } = await sbGet(`students?class_id=eq.${body.classId}&select=id`);
    if (!Array.isArray(students) || students.length === 0)
      throw new AppError('No students found in this class', 400);

    const studentIds = students.map((s: any) => s.id);
    const { data: parentLinks } = await sbGet(
      `parent_student?student_id=in.(${studentIds.join(',')})&select=parent_id,student_id`
    );
    if (!Array.isArray(parentLinks) || parentLinks.length === 0)
      throw new AppError('No parents found for students in this class', 400);

    const createdMeetings: any[] = [];
    const errors: string[] = [];

    for (const link of parentLinks) {
      try {
        const { data, ok } = await sbPost('meetings', {
          teacher_id: body.teacherId,
          parent_id: link.parent_id,
          student_id: link.student_id,
          requested_by: req.user!.id,
          scheduled_at: body.scheduledAt,
          duration_minutes: body.durationMinutes,
          location: body.location || null,
          notes: body.notes || null,
          status: 'requested',
        });
        if (ok && data) {
          createdMeetings.push(data);
          const { data: pp } = await sbGet(`parents?id=eq.${link.parent_id}&select=profile_id`);
          const pProfileId = Array.isArray(pp) ? pp[0]?.profile_id : null;
          if (pProfileId) {
            await createNotification({
              recipientId: pProfileId,
              type: 'meeting',
              title: 'Invitation à une réunion de classe',
              body: `L'administration vous invite à une réunion le ${new Date(body.scheduledAt).toLocaleString('fr-FR')}.`,
              data: { meetingId: data.id },
            });
          }
        }
      } catch (e) { errors.push(`Failed for parent ${link.parent_id}`); }
    }

    return res.status(201).json(successResponse({ created: createdMeetings.length, meetings: createdMeetings, errors }));
  } catch (err) { return next(err); }
});

// ─── POST /meetings/class-grouped - Réunion de classe groupée ───────────────────
router.post('/class-grouped', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      classId: z.string().uuid(),
      teacherId: z.string().uuid(),
      scheduledAt: z.string().datetime(),
      durationMinutes: z.number().int().min(5).max(180).default(30),
      location: z.string().optional(),
      notes: z.string().optional(),
    });
    
    const body = schema.parse(req.body);
    
    const { data: students } = await sbGet(`students?class_id=eq.${body.classId}&select=id`);
    if (!students || !Array.isArray(students) || students.length === 0) {
      throw new AppError('Aucun élève trouvé dans cette classe', 404);
    }
    
    const { data: classData } = await sbGet(`classes?id=eq.${body.classId}&select=name`);
    const className = Array.isArray(classData) && classData[0] ? classData[0].name : 'la classe';
    
    const parentIds = new Set<string>();
    for (const student of students) {
      const { data: parentLinks } = await sbGet(`parent_student?student_id=eq.${student.id}&select=parent_id`);
      if (parentLinks && Array.isArray(parentLinks)) {
        parentLinks.forEach((link: any) => parentIds.add(link.parent_id));
      }
    }
    
    const parentsList = Array.from(parentIds);
    if (parentsList.length === 0) {
      throw new AppError('Aucun parent trouvé pour cette classe', 404);
    }
    
    let createdParents = 0;
    
    for (const parentId of parentsList) {
      const firstStudent = students[0];
      
      const meetingData = {
        teacher_id: body.teacherId,
        parent_id: parentId,
        student_id: firstStudent.id,
        scheduled_at: body.scheduledAt,
        duration_minutes: body.durationMinutes,
        location: body.location || null,
        notes: `🏫 RÉUNION DE CLASSE - ${className}`,
        status: 'requested',
        requested_by: req.user!.id,
        is_class_meeting: true,
      };
      
      const insertRes = await sbPost('meetings', meetingData);
      if (insertRes.ok && insertRes.data) {
        createdParents++;
        
        const { data: pp } = await sbGet(`parents?id=eq.${parentId}&select=profile_id`);
        const pProfileId = Array.isArray(pp) ? pp[0]?.profile_id : null;
        if (pProfileId) {
          await createNotification({
            recipientId: pProfileId,
            type: 'meeting',
            title: '🏫 Réunion de classe',
            body: `L'administration vous invite à une réunion de classe "${className}" le ${new Date(body.scheduledAt).toLocaleString('fr-FR')}.`,
            data: { meetingId: insertRes.data.id },
          });
        }
      }
    }
    
    const teacherMeetingData = {
      teacher_id: body.teacherId,
      parent_id: null,
      student_id: null,
      scheduled_at: body.scheduledAt,
      duration_minutes: body.durationMinutes,
      location: body.location || null,
      notes: `🏫 RÉUNION DE CLASSE - ${className}\n\n👥 ${parentsList.length} parent(s) invité(s)`,
      status: 'requested',
      requested_by: req.user!.id,
      is_class_meeting: true,
    };
    
    await sbPost('meetings', teacherMeetingData);
    
    const { data: teacherData } = await sbGet(`teachers?id=eq.${body.teacherId}&select=profile_id`);
    const teacherProfileId = Array.isArray(teacherData) ? teacherData[0]?.profile_id : null;
    if (teacherProfileId) {
      await createNotification({
        recipientId: teacherProfileId,
        type: 'meeting',
        title: '🏫 Réunion de classe planifiée',
        body: `L'administration a planifié une réunion de classe "${className}" le ${new Date(body.scheduledAt).toLocaleString('fr-FR')} pour ${parentsList.length} parent(s).`,
        data: { meetingId: teacherMeetingData.id },
      });
    }
    
    console.log(`✅ Réunion de classe: ${createdParents} parents, 1 professeur`);
    
    return res.json(successResponse({ 
      created_parents: createdParents,
      parents_count: parentsList.length,
      students_count: students.length,
      className,
    }, `Réunion de classe "${className}" créée pour ${parentsList.length} parent(s)`));
    
  } catch (err) {
    console.error('❌ Erreur:', err);
    return next(err);
  }
});

// ─── PATCH /meetings/:id/confirm ───────────────────────────────────────────────
router.patch('/:id/confirm', authorize('teacher', 'admin', 'parent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scheduledAt, location } = z.object({
      scheduledAt: z.string(),
      location: z.string().optional(),
    }).parse(req.body);

    const { data: existing } = await sbGet(`meetings?id=eq.${req.params.id}&select=*`);
    const meeting = Array.isArray(existing) ? existing[0] : null;
    if (!meeting) throw new AppError('Meeting not found', 404);
    if (!['requested', 'rescheduled'].includes(meeting.status))
      throw new AppError(`Cannot confirm meeting with status '${meeting.status}'`, 400);

    if (req.user!.role === 'teacher') {
      const tid = await resolveTeacherId(req.user!.id);
      if (!tid || meeting.teacher_id !== tid) throw new AppError('Forbidden', 403);
    }
    if (req.user!.role === 'parent') {
      const pid = await resolveParentId(req.user!.id);
      if (!pid || meeting.parent_id !== pid) throw new AppError('Forbidden', 403);
      if (meeting.status !== 'rescheduled') throw new AppError('Cannot confirm: waiting for rescheduling', 400);
    }

    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, {
      status: 'confirmed',
      scheduled_at: scheduledAt,
      location: location || null,
    });
    if (!ok || !data) throw new AppError('Failed to confirm meeting', 500);

    let recipientProfileId: string | null = null;
    if (req.user!.role === 'teacher' || req.user!.role === 'admin') {
      const { data: pp } = await sbGet(`parents?id=eq.${meeting.parent_id}&select=profile_id`);
      recipientProfileId = Array.isArray(pp) ? pp[0]?.profile_id : null;
    } else {
      const { data: tp } = await sbGet(`teachers?id=eq.${meeting.teacher_id}&select=profile_id`);
      recipientProfileId = Array.isArray(tp) ? tp[0]?.profile_id : null;
    }
    if (recipientProfileId) {
      await createNotification({
        recipientId: recipientProfileId,
        type: 'meeting',
        title: 'Réunion confirmée',
        body: `La réunion a été confirmée pour le ${new Date(scheduledAt).toLocaleString('fr-FR')}.`,
        data: { meetingId: req.params.id },
      });
    }

    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// ─── PATCH /meetings/:id/reject ────────────────────────────────────────────────
router.patch('/:id/reject', authorize('teacher', 'parent', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);

    const { data: existing } = await sbGet(`meetings?id=eq.${req.params.id}&select=*`);
    const meeting = Array.isArray(existing) ? existing[0] : null;
    if (!meeting) throw new AppError('Meeting not found', 404);
    if (!['requested', 'rescheduled'].includes(meeting.status))
      throw new AppError(`Cannot reject meeting with status '${meeting.status}'`, 400);

    if (req.user!.role !== 'admin') {
      const tid = await resolveTeacherId(req.user!.id);
      const pid = await resolveParentId(req.user!.id);
      if (!(tid && meeting.teacher_id === tid) && !(pid && meeting.parent_id === pid))
        throw new AppError('Forbidden', 403);
    }

    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, {
      status: 'cancelled',
      cancellation_reason: reason || 'Refusé',
    });
    if (!ok || !data) throw new AppError('Failed to reject meeting', 500);

    const { data: tp } = await sbGet(`teachers?id=eq.${meeting.teacher_id}&select=profile_id`);
    const { data: pp } = await sbGet(`parents?id=eq.${meeting.parent_id}&select=profile_id`);
    const teacherProfileId = Array.isArray(tp) ? tp[0]?.profile_id : null;
    const parentProfileId  = Array.isArray(pp) ? pp[0]?.profile_id : null;
    const recipientId = req.user!.role === 'parent' ? teacherProfileId : parentProfileId;
    if (recipientId) {
      await createNotification({
        recipientId,
        type: 'meeting',
        title: 'Réunion refusée',
        body: reason ? `La réunion a été refusée. Raison : ${reason}` : 'La demande de réunion a été refusée.',
        data: { meetingId: req.params.id },
      });
    }

    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// ─── PATCH /meetings/:id/reschedule ────────────────────────────────────────────
router.patch('/:id/reschedule', authorize('teacher', 'parent', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scheduledAt, location, notes } = z.object({
      scheduledAt: z.string(),
      location: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const { data: existing } = await sbGet(`meetings?id=eq.${req.params.id}&select=*`);
    const meeting = Array.isArray(existing) ? existing[0] : null;
    if (!meeting) throw new AppError('Meeting not found', 404);
    if (!['requested', 'rescheduled'].includes(meeting.status))
      throw new AppError(`Cannot reschedule meeting with status '${meeting.status}'`, 400);

    if (req.user!.role !== 'admin') {
      const tid = await resolveTeacherId(req.user!.id);
      const pid = await resolveParentId(req.user!.id);
      if (!(tid && meeting.teacher_id === tid) && !(pid && meeting.parent_id === pid))
        throw new AppError('Forbidden', 403);
    }

    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, {
      status: 'rescheduled',
      scheduled_at: scheduledAt,
      location: location || null,
      notes: notes || meeting.notes,
    });
    if (!ok || !data) throw new AppError('Failed to reschedule meeting', 500);

    const { data: tp } = await sbGet(`teachers?id=eq.${meeting.teacher_id}&select=profile_id`);
    const { data: pp } = await sbGet(`parents?id=eq.${meeting.parent_id}&select=profile_id`);
    const teacherProfileId = Array.isArray(tp) ? tp[0]?.profile_id : null;
    const parentProfileId  = Array.isArray(pp) ? pp[0]?.profile_id : null;
    const recipientId = req.user!.role === 'parent' ? teacherProfileId : parentProfileId;
    if (recipientId) {
      await createNotification({
        recipientId,
        type: 'meeting',
        title: 'Nouveau créneau proposé',
        body: `Un nouveau créneau vous a été proposé : ${new Date(scheduledAt).toLocaleString('fr-FR')}. Veuillez confirmer ou refuser.`,
        data: { meetingId: req.params.id },
      });
    }

    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// ─── PATCH /meetings/:id/cancel ────────────────────────────────────────────────
router.patch('/:id/cancel', authorize('teacher', 'parent', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);

    const { data: existing } = await sbGet(`meetings?id=eq.${req.params.id}&select=*`);
    const meeting = Array.isArray(existing) ? existing[0] : null;
    if (!meeting) throw new AppError('Meeting not found', 404);
    if (meeting.status === 'cancelled') throw new AppError('Meeting is already cancelled', 400);
    if (meeting.status === 'completed') throw new AppError('Cannot cancel a completed meeting', 400);

    if (req.user!.role !== 'admin') {
      const tid = await resolveTeacherId(req.user!.id);
      const pid = await resolveParentId(req.user!.id);
      if (!(tid && meeting.teacher_id === tid) && !(pid && meeting.parent_id === pid))
        throw new AppError('Forbidden', 403);
    }

    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, {
      status: 'cancelled',
      cancellation_reason: reason || null,
    });
    if (!ok || !data) throw new AppError('Failed to cancel meeting', 500);

    const { data: tp } = await sbGet(`teachers?id=eq.${meeting.teacher_id}&select=profile_id`);
    const { data: pp } = await sbGet(`parents?id=eq.${meeting.parent_id}&select=profile_id`);
    const teacherProfileId = Array.isArray(tp) ? tp[0]?.profile_id : null;
    const parentProfileId  = Array.isArray(pp) ? pp[0]?.profile_id : null;
    const recipientId = req.user!.role === 'parent' ? teacherProfileId : parentProfileId;
    if (recipientId) {
      await createNotification({
        recipientId,
        type: 'meeting',
        title: 'Réunion annulée',
        body: reason ? `La réunion a été annulée. Raison : ${reason}` : 'Une réunion a été annulée.',
        data: { meetingId: req.params.id },
      });
    }

    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// ─── PATCH /meetings/:id/complete ──────────────────────────────────────────────
router.patch('/:id/complete', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: existing } = await sbGet(`meetings?id=eq.${req.params.id}&select=*`);
    const meeting = Array.isArray(existing) ? existing[0] : null;
    if (!meeting) throw new AppError('Meeting not found', 404);
    if (meeting.status !== 'confirmed')
      throw new AppError(`Cannot complete meeting with status '${meeting.status}'`, 400);

    const { data, ok } = await sbPatch(`meetings?id=eq.${req.params.id}`, { status: 'completed' });
    if (!ok || !data) throw new AppError('Failed to complete meeting', 500);

    const { data: pp } = await sbGet(`parents?id=eq.${meeting.parent_id}&select=profile_id`);
    const parentProfileId = Array.isArray(pp) ? pp[0]?.profile_id : null;
    if (parentProfileId) {
      await createNotification({
        recipientId: parentProfileId,
        type: 'meeting',
        title: 'Réunion terminée',
        body: 'La réunion a été marquée comme terminée.',
        data: { meetingId: req.params.id },
      });
    }

    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

export default router;