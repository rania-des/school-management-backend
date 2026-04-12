import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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
async function sbGetOne(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...H, 'Accept': 'application/vnd.pgrst.object+json' },
  });
  return { data: await res.json(), ok: res.ok };
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
    const now = new Date().toISOString();
    const role = req.user!.role;

    let url = `announcements?select=*&order=is_pinned.desc,published_at.desc&offset=${offset}&limit=${limit}`;
    url += `&or=(expires_at.is.null,expires_at.gt.${now})`;

    // Filtre par rôle
    if (role === 'student') {
      const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=class_id`);
      const classId2 = Array.isArray(students) && students[0]?.class_id;
      if (classId2) {
        url += `&or=(class_id.is.null,class_id.eq.${classId2})`;
      } else {
        url += `&class_id=is.null`;
      }
    } else if (role === 'parent') {
      const { data: parents } = await sbGet(`parents?profile_id=eq.${req.user!.id}&select=id`);
      const parentId = Array.isArray(parents) && parents[0]?.id;
      const { data: children } = await sbGet(`parent_student?parent_id=eq.${parentId}&select=student_id`);
      const studentIds = (Array.isArray(children) ? children : []).map((c: any) => c.student_id).filter(Boolean);
      if (studentIds.length > 0) {
        const { data: studentClasses } = await sbGet(`students?id=in.(${studentIds.join(',')})&select=class_id`);
        const classIds = (Array.isArray(studentClasses) ? studentClasses : []).map((s: any) => s.class_id).filter(Boolean);
        if (classIds.length > 0) {
          url += `&or=(class_id.is.null,class_id.in.(${classIds.join(',')}))`;
        } else {
          url += `&class_id=is.null`;
        }
      } else {
        url += `&class_id=is.null`;
      }
    }

    if (classId === 'null') {
      url += `&class_id=is.null`;
    } else if (classId) {
      url += `&class_id=eq.${classId}`;
    }

    if (pinned === 'true') url += `&is_pinned=eq.true`;

    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];
    console.log('announcements:', { role, count: arr.length, error: null });

    return res.json(paginate(arr, arr.length, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

// POST /announcements
router.post('/', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = announcementSchema.parse(req.body);

    if (req.user!.role === 'teacher' && !body.classId) {
      throw new AppError('Teachers must specify a classId', 400);
    }

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
  } catch (err) {
    return next(err);
  }
});

// PATCH /announcements/:id
router.patch('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = announcementSchema.partial().parse(req.body);
    const mapped: Record<string, unknown> = {};
    if (updates.title) mapped.title = updates.title;
    if (updates.content) mapped.content = updates.content;
    if (updates.isPinned !== undefined) mapped.is_pinned = updates.isPinned;
    if (updates.expiresAt !== undefined) mapped.expires_at = updates.expiresAt;

    let patchUrl = `announcements?id=eq.${req.params.id}`;
    if (req.user!.role === 'teacher') patchUrl += `&author_id=eq.${req.user!.id}`;

    const { data, ok } = await sbPatch(patchUrl, mapped);
    if (!ok || !data) throw new AppError('Announcement not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// DELETE /announcements/:id
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let deleteUrl = `announcements?id=eq.${req.params.id}`;
    if (req.user!.role === 'teacher') deleteUrl += `&author_id=eq.${req.user!.id}`;
    await sbDelete(deleteUrl);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export default router;