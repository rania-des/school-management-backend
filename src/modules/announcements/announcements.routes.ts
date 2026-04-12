import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createBulkNotifications, getClassStudentProfileIds } from '../../utils/notifications';
import { sbGet, sbGetOne, sbInsert, sbUpdate, sbDelete } from '../../utils/sbClient';

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

    let params = `select=*,profiles:author_id(first_name,last_name,role),classes(name)&order=is_pinned.desc,published_at.desc&offset=${offset}&limit=${limit}&or=(expires_at.is.null,expires_at.gt.${now})`;

    if (role === 'student') {
      const student = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=class_id`);
      if (student?.class_id) params += `&or=(class_id.is.null,class_id.eq.${student.class_id})`;
      else params += `&class_id=is.null`;
    } else if (role === 'parent') {
      const parent = await sbGetOne('parents', `profile_id=eq.${req.user!.id}&select=id`);
      const children = await sbGet('parent_student', `parent_id=eq.${parent?.id}&select=students(class_id)`);
      const classIds = children.map((c: any) => c.students?.class_id).filter(Boolean);
      if (classIds.length > 0) params += `&or=(class_id.is.null,class_id.in.(${classIds.join(',')}))`;
      else params += `&class_id=is.null`;
    }

    if (classId === 'null') params += `&class_id=is.null`;
    else if (classId) params += `&class_id=eq.${classId}`;
    if (pinned === 'true') params += `&is_pinned=eq.true`;

    const data = await sbGet('announcements', params);
    return res.json(paginate(data, data.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// POST /announcements
router.post('/', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = announcementSchema.parse(req.body);
    if (req.user!.role === 'teacher' && !body.classId) throw new AppError('Teachers must specify a classId', 400);

    const data = await sbInsert('announcements', {
      author_id: req.user!.id, class_id: body.classId || null, title: body.title,
      content: body.content, is_pinned: body.isPinned,
      expires_at: body.expiresAt || null, published_at: new Date().toISOString(),
    });

    if (body.classId) {
      const profileIds = await getClassStudentProfileIds(body.classId);
      await createBulkNotifications(profileIds, {
        type: 'announcement', title: body.title,
        body: body.content.substring(0, 100), data: { announcementId: data.id },
      });
    }
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /announcements/:id
router.patch('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = announcementSchema.partial().parse(req.body);
    const mapped: any = {};
    if (updates.title) mapped.title = updates.title;
    if (updates.content) mapped.content = updates.content;
    if (updates.isPinned !== undefined) mapped.is_pinned = updates.isPinned;
    if (updates.expiresAt !== undefined) mapped.expires_at = updates.expiresAt;
    let params = `id=eq.${req.params.id}`;
    if (req.user!.role === 'teacher') params += `&author_id=eq.${req.user!.id}`;
    const data = await sbUpdate('announcements', params, mapped);
    if (!data) throw new AppError('Announcement not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// DELETE /announcements/:id
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let params = `id=eq.${req.params.id}`;
    if (req.user!.role === 'teacher') params += `&author_id=eq.${req.user!.id}`;
    await sbDelete('announcements', params);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;