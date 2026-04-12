import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification } from '../../utils/notifications';
import { uploadFile, STORAGE_BUCKETS } from '../../utils/storage';
import { sbGet, sbGetOne, sbInsert, sbUpdate, sbDelete } from '../../utils/sbClient';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const paymentSchema = z.object({
  studentId: z.string().uuid(),
  type: z.enum(['tuition', 'canteen', 'trip', 'activity', 'other']),
  amount: z.number().positive(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  academicYearId: z.string().uuid().optional(),
});

// GET /payments
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status, type } = req.query;
    let params = `select=*,students(student_number,profiles:profile_id(first_name,last_name))&order=created_at.desc&offset=${offset}&limit=${limit}`;

    if (req.user!.role === 'student') {
      const student = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=id`);
      if (student) params += `&student_id=eq.${student.id}`;
    } else if (req.user!.role === 'parent') {
      const parent = await sbGetOne('parents', `profile_id=eq.${req.user!.id}&select=id`);
      const children = await sbGet('parent_student', `parent_id=eq.${parent?.id}&select=student_id`);
      const childIds = children.map((c: any) => c.student_id).filter(Boolean);
      if (childIds.length > 0) params += `&student_id=in.(${childIds.join(',')})`;
    }

    if (status) params += `&status=eq.${status}`;
    if (type) params += `&type=eq.${type}`;

    const data = await sbGet('payments', params);
    return res.json(paginate(data, data.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// GET /payments/stats
router.get('/stats', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { academicYearId } = req.query;
    let params = 'select=amount,status,type';
    if (academicYearId) params += `&academic_year_id=eq.${academicYearId}`;
    const data = await sbGet('payments', params);

    const stats = { total: 0, paid: 0, pending: 0, overdue: 0, byType: {} as Record<string, number> };
    data.forEach((p: any) => {
      stats.total += parseFloat(p.amount);
      if (p.status === 'paid') stats.paid += parseFloat(p.amount);
      if (p.status === 'pending') stats.pending += parseFloat(p.amount);
      if (p.status === 'overdue') stats.overdue += parseFloat(p.amount);
      stats.byType[p.type] = (stats.byType[p.type] || 0) + parseFloat(p.amount);
    });
    return res.json(successResponse(stats));
  } catch (err) { return next(err); }
});

// POST /payments
router.post('/', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = paymentSchema.parse(req.body);
    const data = await sbInsert('payments', {
      student_id: body.studentId, type: body.type, amount: body.amount,
      description: body.description, due_date: body.dueDate,
      academic_year_id: body.academicYearId, status: 'pending',
    });

    const student = await sbGetOne('students', `id=eq.${body.studentId}&select=profile_id`);
    if (student?.profile_id) {
      await createNotification({ recipientId: student.profile_id, type: 'payment',
        title: 'Nouveau paiement',
        body: `${body.description || body.type}: ${body.amount} TND${body.dueDate ? ` - Échéance: ${body.dueDate}` : ''}`,
        data: { paymentId: data.id } });
    }
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /payments/:id/mark-paid
router.patch('/:id/mark-paid', authorize('admin'), upload.single('receipt'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let receiptUrl: string | undefined;
    if (req.file) receiptUrl = await uploadFile(STORAGE_BUCKETS.RECEIPTS, req.file, req.params.id);

    const data = await sbUpdate('payments', `id=eq.${req.params.id}`, {
      status: 'paid', paid_at: new Date().toISOString(), receipt_url: receiptUrl,
    });
    if (!data) throw new AppError('Payment not found', 404);

    const payment = await sbGetOne('payments', `id=eq.${req.params.id}&select=student_id,students(profile_id)`);
    const studentProfileId = payment?.students?.profile_id;
    if (studentProfileId) {
      await createNotification({ recipientId: studentProfileId, type: 'payment',
        title: 'Paiement confirmé', body: 'Votre paiement a été confirmé.',
        data: { paymentId: req.params.id, receiptUrl } });
    }
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /payments/:id/status
router.patch('/:id/status', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({ status: z.enum(['pending', 'paid', 'overdue', 'cancelled']) }).parse(req.body);
    const data = await sbUpdate('payments', `id=eq.${req.params.id}`, { status });
    if (!data) throw new AppError('Payment not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// DELETE /payments/:id
router.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbDelete('payments', `id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;