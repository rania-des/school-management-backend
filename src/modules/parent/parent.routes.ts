import { supabaseAdmin } from '../../config/supabase';
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import { createNotification, createBulkNotifications, getClassStudentProfileIds } from '../../utils/notifications';
import multer from 'multer';
import { uploadFile, STORAGE_BUCKETS } from '../../utils/storage';
import type { Request, Response, NextFunction } from 'express';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// Toutes les routes parent nécessitent d'être authentifié + rôle parent
router.use(authenticate);
router.use(authorize('parent'));

// ── Helper ────────────────────────────────────────────────────────────────────

function extractFirstItem(data: any): any {
  if (!data) return null;
  if (Array.isArray(data) && data.length > 0) return data[0];
  return data;
}

// Helper pour récupérer les enfants d'un parent
async function getParentChildren(profileId: string): Promise<any[]> {
  const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
  
  console.log('🔍 getParentChildren called with profileId:', profileId);
  
  // 1. D'abord, trouver le parent_id à partir du profile_id
  const parentRes = await fetch(`${SUPABASE_URL}/rest/v1/parents?profile_id=eq.${profileId}&select=id`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  const parents = await parentRes.json() as any[];
  
  if (!parents || parents.length === 0) {
    console.log('⚠️ No parent found for profile_id:', profileId);
    return [];
  }
  
  const parentId = parents[0].id;
  console.log('👨‍👩 Parent ID found:', parentId);
  
  // 2. Récupérer les liens parent_student
  const psRes = await fetch(`${SUPABASE_URL}/rest/v1/parent_student?parent_id=eq.${parentId}&select=student_id`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  const links = await psRes.json() as any[];
  
  if (!links || links.length === 0) {
    console.log('⚠️ No parent_student links found for parent_id:', parentId);
    return [];
  }
  
  console.log('🔗 Found links:', links.length);
  
  // 3. Récupérer les détails des étudiants
  const studentIds = links.map((link: any) => link.student_id).join(',');
  const studentsRes = await fetch(`${SUPABASE_URL}/rest/v1/students?id=in.(${studentIds})&select=*,profiles:profile_id(first_name,last_name)`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  const students = await studentsRes.json() as any[];
  
  console.log('👶 Students found:', students.length);
  
  // 4. Formater le résultat comme attendu par le frontend
  return links.map((link: any) => {
    const student = students.find((s: any) => s.id === link.student_id);
    return {
      student_id: student?.id,
      students: student,
    };
  }).filter((item: any) => item.student_id);
}

// Helper pour récupérer les classes d'un étudiant
async function getStudentClasses(studentId: string): Promise<any[]> {
  const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}&select=id,class_id,classes:class_id(id,name,academic_year_id)`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );

  const data = await res.json() as any[];
  if (!res.ok) throw new AppError('Failed to fetch student classes', 500);

  return (data || [])
    .filter((s: any) => s.class_id)
    .map((s: any) => ({
      class_id: s.class_id,
      class: extractFirstItem(s.classes),
    }));
}

// =============================================================================
// PROFESSEURS (pour les parents)
// =============================================================================

// GET /api/v1/parent/teachers — liste des professeurs pour les parents
router.get('/teachers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

    // Récupérer tous les professeurs avec leurs profils
    const { data: teachers } = await supabaseAdmin
      .from('teachers')
      .select(`
        id,
        profile_id,
        profiles:profile_id (
          id,
          first_name,
          last_name,
          email
        )
      `);

    if (!teachers) return res.json(successResponse([]));

    // Formater les données
    const formatted = teachers.map((teacher: any) => ({
      id: teacher.id,
      profile_id: teacher.profile_id,
      first_name: teacher.profiles?.first_name || '',
      last_name: teacher.profiles?.last_name || '',
      email: teacher.profiles?.email || '',
    }));

    return res.json(successResponse(formatted));
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// ENFANTS (CHILDREN)
// =============================================================================

// GET /api/v1/parent/children — liste des enfants du parent
router.get('/children', async (req, res, next) => {
  try {
    const children = await getParentChildren(req.user!.id);
    res.json(successResponse(children));
  } catch (err) { next(err); }
});

// GET /api/v1/parent/children/:childId/classes — classes d'un enfant
router.get('/children/:childId/classes', async (req, res, next) => {
  try {
    const { childId } = req.params;
    const classes = await getStudentClasses(childId);
    res.json(successResponse(classes));
  } catch (err) { next(err); }
});

// GET /api/v1/parent/children/:childId/schedule — emploi du temps d'un enfant
router.get('/children/:childId/schedule', async (req, res, next) => {
  try {
    const { childId } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

    // Vérifier que l'enfant appartient au parent
    const children = await getParentChildren(req.user!.id);
    const hasChild = children.some((c: any) => c.student_id === childId);
    if (!hasChild) throw new AppError('Accès non autorisé à cet enfant', 403);

    // Récupérer la classe de l'enfant
    const studentClasses = await getStudentClasses(childId);
    if (studentClasses.length === 0) {
      return res.json(successResponse([]));
    }
    const targetClassId = studentClasses[0].class_id;

    const url = `${SUPABASE_URL}/rest/v1/schedule_slots?class_id=eq.${targetClassId}&is_active=eq.true&select=*,subjects:subject_id(name,color),teachers:teacher_id(profiles:profile_id(first_name,last_name))&order=day_of_week,start_time`;

    const resData = await fetch(url, { headers: H });
    const data = (await resData.json()) as any[];

    if (!resData.ok) throw new AppError('Failed to fetch schedule', 500);

    const formatted = (data || []).map((slot: any) => ({
      ...slot,
      subject_name: extractFirstItem(slot.subjects)?.name || slot.subject_name || 'Matière',
      subject: extractFirstItem(slot.subjects),
      teacher: extractFirstItem(slot.teachers)?.profiles,
    }));

    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// =============================================================================
// NOTES (GRADES)
// =============================================================================

// GET /api/v1/parent/grades?childId=&classId=&subjectId=&period=
router.get('/grades', async (req, res, next) => {
  try {
    const { childId, classId, subjectId, period } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    
    // Vérifier que l'enfant appartient bien au parent
    if (!childId) throw new AppError('childId est requis', 400);
    const children = await getParentChildren(req.user!.id);
    const hasChild = children.some((c: any) => c.student_id === childId);
    if (!hasChild) throw new AppError('Accès non autorisé à cet enfant', 403);
    
    let url = `${SUPABASE_URL}/rest/v1/grades?student_id=eq.${childId}&select=*,subjects:subject_id(name),teachers:teacher_id(profiles:profile_id(first_name,last_name))&order=grade_date.desc`;
    if (classId) url += `&class_id=eq.${classId}`;
    if (subjectId) url += `&subject_id=eq.${subjectId}`;
    if (period) url += `&period=eq.${period}`;
    
    const resData = await fetch(url, { headers: H });
    const data = (await resData.json()) as any[];
    
    if (!resData.ok) throw new AppError('Failed to fetch grades', 500);
    
    const formatted = (data || []).map((g: any) => ({
      ...g,
      subject: extractFirstItem(g.subjects),
      teacher: extractFirstItem(g.teachers)?.profiles,
    }));
    
    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// =============================================================================
// PRÉSENCES (ATTENDANCE)
// =============================================================================

// GET /api/v1/parent/attendance?childId=
router.get('/attendance', async (req, res, next) => {
  try {
    const { childId } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    
    if (!childId) throw new AppError('childId est requis', 400);
    
    // Vérifier que l'enfant appartient au parent
    const children = await getParentChildren(req.user!.id);
    const hasChild = children.some((c: any) => c.student_id === childId);
    if (!hasChild) throw new AppError('Accès non autorisé à cet enfant', 403);
    
    const url = `${SUPABASE_URL}/rest/v1/attendance?student_id=eq.${childId}&select=*&order=date.desc`;
    
    const resData = await fetch(url, { headers: H });
    const data = (await resData.json()) as any[];
    
    if (!resData.ok) throw new AppError('Failed to fetch attendance', 500);
    
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// POST /api/v1/parent/attendance/:attendanceId/justify
router.post('/attendance/:attendanceId/justify', upload.single('justification_pdf'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attendanceId } = req.params;
    const { reason } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };

    if (!reason || !reason.trim()) throw new AppError('La raison de justification est requise', 400);

    // Vérifier que le fichier est bien un PDF si fourni
    if (req.file && req.file.mimetype !== 'application/pdf') {
      throw new AppError('Seuls les fichiers PDF sont acceptés', 400);
    }

    // 1. Récupérer l'enregistrement d'absence
    const resAtt = await fetch(
      `${SUPABASE_URL}/rest/v1/attendance?id=eq.${attendanceId}&select=id,student_id,status`,
      { headers: H }
    );
    const attArr = (await resAtt.json()) as any[];
    if (!resAtt.ok || !attArr.length) throw new AppError('Absence introuvable', 404);

    const att = attArr[0];
    if (att.status !== 'absent' && att.status !== 'late') {
      throw new AppError('Seules les absences ou retards peuvent être justifiés', 400);
    }

    // 2. Vérifier accès parent
    const children = await getParentChildren(req.user!.id);
    const hasChild = children.some((c: any) => c.student_id === att.student_id);
    if (!hasChild) throw new AppError('Accès non autorisé', 403);

    // 3. Upload PDF si fourni
    let justificationUrl: string | null = null;
    if (req.file) {
      justificationUrl = await uploadFile(
        STORAGE_BUCKETS.DOCUMENTS,
        req.file,
        `justifications/${att.student_id}`
      );
    }

    // 4. Mettre à jour l'enregistrement
    const updatePayload: any = {
      status: 'excused',
      reason: reason.trim(),
      updated_at: new Date().toISOString(),
    };
    if (justificationUrl) {
      updatePayload.justification_url = justificationUrl;
    }

    const resUpdate = await fetch(
      `${SUPABASE_URL}/rest/v1/attendance?id=eq.${attendanceId}`,
      { method: 'PATCH', headers: H, body: JSON.stringify(updatePayload) }
    );
    const updated = (await resUpdate.json()) as any[];
    if (!resUpdate.ok) throw new AppError('Échec de la mise à jour', 500);

    res.json(successResponse(updated[0] || { id: attendanceId }, 'Absence justifiée avec succès'));
  } catch (err) { next(err); }
});

// =============================================================================
// DEVOIRS (ASSIGNMENTS)
// =============================================================================

// GET /api/v1/parent/assignments?childId=
router.get('/assignments', async (req, res, next) => {
  try {
    const { childId } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    
    if (!childId) throw new AppError('childId est requis', 400);
    
    // Vérifier que l'enfant appartient au parent
    const children = await getParentChildren(req.user!.id);
    const hasChild = children.some((c: any) => c.student_id === childId);
    if (!hasChild) throw new AppError('Accès non autorisé à cet enfant', 403);
    
    // Récupérer les classes de l'enfant
    const studentClasses = await getStudentClasses(childId as string);
    const classIds = studentClasses.map((sc: any) => sc.class_id).join(',');
    
    if (!classIds) {
      return res.json(successResponse([]));
    }
    
    let url = `${SUPABASE_URL}/rest/v1/assignments?class_id=in.(${classIds})&select=*,subjects:subject_id(name),classes:class_id(name)&order=due_date.asc`;
    
    const resData = await fetch(url, { headers: H });
    const data = (await resData.json()) as any[];
    
    if (!resData.ok) throw new AppError('Failed to fetch assignments', 500);
    
    const formatted = (data || []).map((a: any) => ({
      ...a,
      subject: extractFirstItem(a.subjects),
      class: extractFirstItem(a.classes),
    }));
    
    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// ✅ NOUVELLE ROUTE: GET /api/v1/parent/children/:childId/submissions
router.get('/children/:childId/submissions', async (req, res, next) => {
  try {
    const { childId } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

    // Vérifier accès parent
    const children = await getParentChildren(req.user!.id);
    const hasChild = children.some((c: any) => c.student_id === childId);
    if (!hasChild) throw new AppError('Accès non autorisé à cet enfant', 403);

    // 1. Récupérer les soumissions de l'enfant
    const subsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/submissions?student_id=eq.${childId}&select=*&order=submitted_at.desc`,
      { headers: H }
    );
    const submissions = (await subsRes.json()) as any[];
    if (!subsRes.ok) throw new AppError('Failed to fetch submissions', 500);

    if (!submissions || submissions.length === 0) {
      return res.json(successResponse([]));
    }

    // 2. Récupérer les commentaires pour toutes ces soumissions
    const submissionIds = submissions.map((s: any) => s.id).join(',');
    const commentsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/teacher_comments?submission_id=in.(${submissionIds})&select=*&order=created_at.asc`,
      { headers: H }
    );
    const comments = (await commentsRes.json()) as any[];

    // 3. Enrichir chaque soumission avec ses commentaires
    const commentsMap = new Map<string, any[]>();
    for (const c of (comments || [])) {
      if (!commentsMap.has(c.submission_id)) commentsMap.set(c.submission_id, []);
      commentsMap.get(c.submission_id)!.push(c);
    }

    const enriched = submissions.map((sub: any) => {
      const subComments = commentsMap.get(sub.id) || [];
      const teacherComment = subComments.find((c: any) => c.comment_type === 'teacher_feedback');
      const studentReply   = subComments.find((c: any) => c.comment_type === 'student_reply');
      return {
        ...sub,
        teacher_comment:  teacherComment?.comment   || null,
        comment_added_at: teacherComment?.created_at || null,
        student_reply:    studentReply?.comment      || null,
        student_reply_at: studentReply?.created_at   || null,
      };
    });

    res.json(successResponse(enriched));
  } catch (err) { next(err); }
});

// =============================================================================
// ANNONCES (ANNOUNCEMENTS)
// =============================================================================

// GET /api/v1/parent/announcements?childId=&classId=
router.get('/announcements', async (req, res, next) => {
  try {
    const { childId, classId } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    
    let classFilter = '';
    if (classId) {
      classFilter = `&class_id=eq.${classId}`;
    } else if (childId) {
      // Vérifier que l'enfant appartient au parent
      const children = await getParentChildren(req.user!.id);
      const hasChild = children.some((c: any) => c.student_id === childId);
      if (!hasChild) throw new AppError('Accès non autorisé à cet enfant', 403);
      
      const studentClasses = await getStudentClasses(childId as string);
      const classIds = studentClasses.map((sc: any) => sc.class_id).join(',');
      if (classIds) {
        classFilter = `&class_id=in.(${classIds})`;
      }
    }
    
    const url = `${SUPABASE_URL}/rest/v1/announcements?or=(class_id.is.null${classFilter})&order=created_at.desc`;
    
    const resData = await fetch(url, { headers: H });
    const data = (await resData.json()) as any[];
    
    if (!resData.ok) throw new AppError('Failed to fetch announcements', 500);
    
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// =============================================================================
// EMPLOI DU TEMPS (SCHEDULE)
// =============================================================================

// GET /api/v1/parent/schedule?childId=&classId=
router.get('/schedule', async (req, res, next) => {
  try {
    const { childId, classId } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    
    let targetClassId = classId as string;
    
    if (!targetClassId && childId) {
      // Vérifier que l'enfant appartient au parent
      const children = await getParentChildren(req.user!.id);
      const hasChild = children.some((c: any) => c.student_id === childId);
      if (!hasChild) throw new AppError('Accès non autorisé à cet enfant', 403);
      
      const studentClasses = await getStudentClasses(childId as string);
      if (studentClasses.length === 0) {
        return res.json(successResponse([]));
      }
      targetClassId = studentClasses[0].class_id;
    }
    
    if (!targetClassId) {
      throw new AppError('classId ou childId est requis', 400);
    }
    
    const url = `${SUPABASE_URL}/rest/v1/schedule_slots?class_id=eq.${targetClassId}&is_active=eq.true&select=*,subjects:subject_id(name,color),teachers:teacher_id(profiles:profile_id(first_name,last_name))&order=day_of_week,start_time`;
    
    const resData = await fetch(url, { headers: H });
    const data = (await resData.json()) as any[];
    
    if (!resData.ok) throw new AppError('Failed to fetch schedule', 500);
    
    const formatted = (data || []).map((slot: any) => ({
      ...slot,
      subject: extractFirstItem(slot.subjects),
      teacher: extractFirstItem(slot.teachers)?.profiles,
    }));
    
    res.json(successResponse(formatted));
  } catch (err) { next(err); }
});

// =============================================================================
// STATISTIQUES
// =============================================================================

// GET /api/v1/parent/stats?childId=
router.get('/stats', async (req, res, next) => {
  try {
    const { childId } = req.query;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    
    if (!childId) throw new AppError('childId est requis', 400);
    
    // Vérifier que l'enfant appartient au parent
    const children = await getParentChildren(req.user!.id);
    const hasChild = children.some((c: any) => c.student_id === childId);
    if (!hasChild) throw new AppError('Accès non autorisé à cet enfant', 403);
    
    // Récupérer les classes de l'enfant
    const studentClasses = await getStudentClasses(childId as string);
    const classIds = studentClasses.map((sc: any) => sc.class_id).join(',');
    
    const [gradesRes, assignmentsRes, attendanceRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/grades?student_id=eq.${childId}&select=id`, { headers: H }),
      classIds ? fetch(`${SUPABASE_URL}/rest/v1/assignments?class_id=in.(${classIds})&select=id`, { headers: H }) : Promise.resolve({ ok: true, json: async () => [] }),
      fetch(`${SUPABASE_URL}/rest/v1/attendance?student_id=eq.${childId}&select=id,status`, { headers: H }),
    ]);
    
    const gradesData = (await gradesRes.json()) as any[];
    const assignmentsData = classIds ? (await assignmentsRes.json()) as any[] : [];
    const attendanceData = (await attendanceRes.json()) as any[];
    
    const presentCount = (attendanceData || []).filter((a: any) => a.status === 'present').length;
    const absentCount = (attendanceData || []).filter((a: any) => a.status === 'absent').length;
    const lateCount = (attendanceData || []).filter((a: any) => a.status === 'late').length;
    
    // Calcul de la moyenne des notes
    const scores = (gradesData || [])
      .filter((g: any) => g.score !== null && g.max_score)
      .map((g: any) => (g.score / g.max_score) * 20);
    const average = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : null;
    
    res.json(successResponse({
      totalGrades: gradesData?.length || 0,
      totalAssignments: assignmentsData?.length || 0,
      totalAttendance: attendanceData?.length || 0,
      presentCount,
      absentCount,
      lateCount,
      averageGrade: average,
    }));
  } catch (err) { next(err); }
});

// =============================================================================
// MESSAGERIE
// =============================================================================

// GET /api/v1/parent/messages/conversations
router.get('/messages/conversations', async (req, res, next) => {
  try {
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    const userId = req.user!.id;

    // 1. Récupère les conversation_ids où le parent participe
    const partRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversation_participants?profile_id=eq.${userId}&select=conversation_id`,
      { headers: H }
    );
    const parts = await partRes.json() as any[];
    if (!parts?.length) return res.json(successResponse([]));

    const convIds = parts.map((p: any) => p.conversation_id).join(',');

    // 2. Récupère les conversations
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?id=in.(${convIds})&select=id,subject,created_at,created_by&order=created_at.desc`,
      { headers: H }
    );
    const conversations = await convRes.json() as any[];

    // 3. Pour chaque conversation, récupère le dernier message
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

// GET /api/v1/parent/messages/:userId — conversation avec un utilisateur
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

    // Marquer les messages reçus comme lus
    await fetch(`${SUPABASE_URL}/rest/v1/messages?receiver_id=eq.${myId}&sender_id=eq.${userId}&is_read=eq.false`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: true })
    }).catch(() => {});

    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// POST /api/v1/parent/messages — envoyer un message
router.post('/messages', async (req, res, next) => {
  try {
    const { receiverId, content } = req.body;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    if (!receiverId || !content) throw new AppError('receiverId et content sont requis', 400);

    const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: H,
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
// NOTIFICATIONS
// =============================================================================

// GET /api/v1/parent/notifications
router.get('/notifications', async (req, res, next) => {
  try {
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    
    const url = `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${req.user!.id}&order=created_at.desc`;
    const resData = await fetch(url, { headers: H });
    const data = (await resData.json()) as any[];
    
    if (!resData.ok) throw new AppError('Failed to fetch notifications', 500);
    
    res.json(successResponse(data || []));
  } catch (err) { next(err); }
});

// PATCH /api/v1/parent/notifications/:id/read — marquer une notification comme lue
router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
    
    const resUpdate = await fetch(`${SUPABASE_URL}/rest/v1/notifications?id=eq.${id}&user_id=eq.${req.user!.id}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ is_read: true })
    });
    const dataArr = (await resUpdate.json()) as any[];
    const data = dataArr[0];
    
    if (!resUpdate.ok) throw new AppError('Failed to mark notification as read', 500);
    
    res.json(successResponse(data, 'Notification marquée comme lue'));
  } catch (err) { next(err); }
});

// =============================================================================
// PROFIL PARENT
// =============================================================================

// GET /api/v1/parent/profile
router.get('/profile', async (req, res, next) => {
  try {
    const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
    const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    
    const resProfile = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user!.id}&select=*`, { headers: H });
    const profileArr = (await resProfile.json()) as any[];
    const profile = profileArr[0];
    
    if (!resProfile.ok || !profile) throw new AppError('Profile not found', 404);
    
    res.json(successResponse(profile));
  } catch (err) { next(err); }
});

// PATCH /api/v1/parent/profile — mettre à jour le profil
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

// =============================================================================
// RÉCUPÉRATION ID PARENT
// =============================================================================

// GET /api/v1/parent/my-id — récupère l'ID de la table parents
router.get('/my-id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: parent, error } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('profile_id', req.user!.id)
      .single();
    
    if (error || !parent) throw new AppError('Parent not found', 404);
    return res.json(successResponse(parent));
  } catch (err) {
    return next(err);
  }
})
// GET /parent/student-parent/:studentId - récupère le parent d'un étudiant
router.get('/student-parent/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    
    const { data: link } = await supabaseAdmin
      .from('parent_student')
      .select('parent_id')
      .eq('student_id', studentId)
      .single();
    
    if (!link) throw new AppError('Aucun parent trouvé pour cet étudiant', 404);
    
    return res.json(successResponse({ parent_id: link.parent_id }));
  } catch (err) {
    return next(err);
  }
});

// GET /parent/profile-by-id/:parentId - récupère le profil d'un parent par son ID
router.get('/profile-by-id/:parentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { parentId } = req.params;
    
    const { data: parent } = await supabaseAdmin
      .from('parents')
      .select('profile_id')
      .eq('id', parentId)
      .single();
    
    if (!parent) throw new AppError('Parent not found', 404);
    
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', parent.profile_id)
      .single();
    
    return res.json(successResponse(profile));
  } catch (err) {
    return next(err);
  }
});

export default router;