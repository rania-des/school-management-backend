import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createBulkNotifications, getClassStudentProfileIds } from '../../utils/notifications';

const router = Router();
router.use(authenticate);

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

    let query = supabaseAdmin
      .from('announcements')
      .select(`*, profiles(first_name, last_name, role), classes(name)`, { count: 'exact' })
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // ✅ Filtre expiration — utilise deux filtres séparés au lieu de .or()
    query = query.or(`expires_at.is.null,expires_at.gt.${now}`);
    

    // ✅ Filtre par rôle
    if (role === 'student') {
      const { data: student } = await supabaseAdmin
        .from('students').select('class_id').eq('profile_id', req.user!.id).maybeSingle();
      if (student?.class_id) {
        query = query.or(`class_id.is.null,class_id.eq.${student.class_id}`);
      } else {
        query = query.is('class_id', null);
      }
    } else if (role === 'parent') {
      const { data: parent } = await supabaseAdmin
        .from('parents').select('id').eq('profile_id', req.user!.id).maybeSingle();
      const { data: children } = await supabaseAdmin
        .from('parent_student').select('students(class_id)').eq('parent_id', parent?.id || '');
      const classIds = (children || []).map((c: any) => c.students?.class_id).filter(Boolean);
      if (classIds.length > 0) {
        query = query.or(`class_id.is.null,class_id.in.(${classIds.join(',')})`);
      } else {
        query = query.is('class_id', null);
      }
    } 
    // admin voit tout — pas de filtre supplémentaire

    if (classId === 'null') {
      query = query.is('class_id', null);
    } else if (classId) {
      query = query.eq('class_id', classId as string);
    }

    if (pinned === 'true') query = query.eq('is_pinned', true);

    const { data, count, error } = await query;
    console.log('announcements:', { role, count, error: error?.message });
    if (error) throw new AppError(`Failed to fetch announcements: ${error.message}`, 500);

    return res.json(paginate(data || [], count || 0, { page, limit, offset }));
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

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .insert({
        author_id: req.user!.id,
        class_id: body.classId || null,
        title: body.title,
        content: body.content,
        is_pinned: body.isPinned,
        expires_at: body.expiresAt || null,
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !data) throw new AppError(`Failed to create announcement: ${error?.message}`, 500);

    if (body.classId) {
      const profileIds = await getClassStudentProfileIds(body.classId);
      await createBulkNotifications(profileIds, {
        type: 'announcement',
        title: body.title,
        body: body.content.substring(0, 100),
        data: { announcementId: data.id },
      });
    }

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

    let query = supabaseAdmin.from('announcements').update(mapped).eq('id', req.params.id);
    if (req.user!.role === 'teacher') query = query.eq('author_id', req.user!.id);

    const { data, error } = await query.select().single();
    if (error || !data) throw new AppError('Announcement not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// DELETE /announcements/:id
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let query = supabaseAdmin.from('announcements').delete().eq('id', req.params.id);
    if (req.user!.role === 'teacher') query = query.eq('author_id', req.user!.id);
    await query;
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export default router;
