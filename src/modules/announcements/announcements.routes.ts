import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';

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
async function sbDelete(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'DELETE', headers: H });
  return { ok: res.ok };
}

const announcementSchema = z.object({
  classId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  isPinned: z.boolean().default(false),
  expiresAt: z.string().optional(),
});

// GET /announcements
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { classId, pinned } = req.query;
    const role = req.user!.role;

    // Récupère tout, filtre en JS (évite les OR imbriqués complexes en query string)
    const { data: allData } = await sbGet(`announcements?select=*&order=is_pinned.desc,published_at.desc`);
    let arr = Array.isArray(allData) ? allData : [];

    // Filtre expiration
    const now = new Date();
    arr = arr.filter((a: any) => !a.expires_at || new Date(a.expires_at) > now);

    // Filtre par rôle
    if (role === 'student') {
      const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=class_id`);
      const cid = Array.isArray(students) ? students[0]?.class_id : null;
      arr = arr.filter((a: any) => !a.class_id || a.class_id === cid);
    } else if (role === 'parent') {
      const { data: parents } = await sbGet(`parents?profile_id=eq.${req.user!.id}&select=id`);
      const parentId = Array.isArray(parents) ? parents[0]?.id : null;
      if (parentId) {
        const { data: links } = await sbGet(`parent_student?parent_id=eq.${parentId}&select=student_id`);
        const sIds = (Array.isArray(links) ? links : []).map((c: any) => c.student_id).filter(Boolean);
        if (sIds.length > 0) {
          const { data: sc } = await sbGet(`students?id=in.(${sIds.join(',')})&select=class_id`);
          const cIds = (Array.isArray(sc) ? sc : []).map((s: any) => s.class_id).filter(Boolean);
          arr = arr.filter((a: any) => !a.class_id || cIds.includes(a.class_id));
        } else {
          arr = arr.filter((a: any) => !a.class_id);
        }
      } else {
        arr = arr.filter((a: any) => !a.class_id);
      }
    }
    // admin et teacher → pas de filtre de classe

    if (classId === 'null') arr = arr.filter((a: any) => !a.class_id);
    else if (classId) arr = arr.filter((a: any) => a.class_id === classId);
    if (pinned === 'true') arr = arr.filter((a: any) => a.is_pinned === true);

    const total = arr.length;
    const paginated = arr.slice(offset, offset + limit);

    console.log('announcements:', { role, count: total, error: null });
    return res.json(paginate(paginated, total, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

// POST /announcements
router.post('/', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = announcementSchema.parse(req.body);
    if (req.user!.role === 'teacher' && !body.classId) throw new AppError('Teachers must specify a classId', 400);
    const { data, ok } = await sbPost('announcements', {
      author_id: req.user!.id,
      class_id: body.classId || null,
      title: body.title,
      content: body.content,
      is_pinned: body.isPinned,
      expires_at: body.expiresAt || null,
      published_at: new Date().toISOString(),
    });
    if (!ok || !data) throw new AppError('Failed to create announcement', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /announcements/:id
router.patch('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = announcementSchema.partial().parse(req.body);
    const mapped: Record<string, unknown> = {};
    if (updates.title !== undefined) mapped.title = updates.title;
    if (updates.content !== undefined) mapped.content = updates.content;
    if (updates.isPinned !== undefined) mapped.is_pinned = updates.isPinned;
    if (updates.expiresAt !== undefined) mapped.expires_at = updates.expiresAt;
    let url = `announcements?id=eq.${req.params.id}`;
    if (req.user!.role === 'teacher') url += `&author_id=eq.${req.user!.id}`;
    const { data, ok } = await sbPatch(url, mapped);
    if (!ok || !data) throw new AppError('Announcement not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// DELETE /announcements/:id
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let url = `announcements?id=eq.${req.params.id}`;
    if (req.user!.role === 'teacher') url += `&author_id=eq.${req.user!.id}`;
    await sbDelete(url);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;