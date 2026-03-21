import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification } from '../../utils/notifications';
import multer from 'multer';
import { uploadFile, STORAGE_BUCKETS } from '../../utils/storage';

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

    let query = supabaseAdmin
      .from('payments')
      .select(`
        *,
        students(student_number, profiles(first_name, last_name))
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin
        .from('students').select('id').eq('profile_id', req.user!.id).single();
      query = query.eq('student_id', student?.id);
    } else if (req.user!.role === 'parent') {
      const { data: parent } = await supabaseAdmin
        .from('parents').select('id').eq('profile_id', req.user!.id).single();
      const { data: children } = await supabaseAdmin
        .from('parent_student').select('student_id').eq('parent_id', parent?.id);
      const childIds = (children || []).map((c: any) => c.student_id);
      if (childIds.length > 0) query = query.in('student_id', childIds);
    }

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);

    const { data, count, error } = await query;
    if (error) throw new AppError('Failed to fetch payments', 500);

    return res.json(paginate(data || [], count || 0, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

// GET /payments/stats - financial summary
router.get('/stats', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { academicYearId } = req.query;

    let query = supabaseAdmin.from('payments').select('amount, status, type');
    if (academicYearId) query = query.eq('academic_year_id', academicYearId);

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch stats', 500);

    const stats = {
      total: 0,
      paid: 0,
      pending: 0,
      overdue: 0,
      byType: {} as Record<string, number>,
    };

    (data || []).forEach((p: any) => {
      stats.total += parseFloat(p.amount);
      if (p.status === 'paid') stats.paid += parseFloat(p.amount);
      if (p.status === 'pending') stats.pending += parseFloat(p.amount);
      if (p.status === 'overdue') stats.overdue += parseFloat(p.amount);
      stats.byType[p.type] = (stats.byType[p.type] || 0) + parseFloat(p.amount);
    });

    return res.json(successResponse(stats));
  } catch (err) {
    return next(err);
  }
});

// POST /payments - admin creates
router.post('/', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = paymentSchema.parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('payments')
      .insert({
        student_id: body.studentId,
        type: body.type,
        amount: body.amount,
        description: body.description,
        due_date: body.dueDate,
        academic_year_id: body.academicYearId,
        status: 'pending',
      })
      .select('*, students(profile_id)')
      .single();

    if (error || !data) throw new AppError('Failed to create payment', 500);

    // Notify student and parents
    const studentProfileId = (data as any).students?.profile_id;
    if (studentProfileId) {
      await createNotification({
        recipientId: studentProfileId,
        type: 'payment',
        title: 'Nouveau paiement',
        body: `${body.description || body.type}: ${body.amount} TND${body.dueDate ? ` - Échéance: ${body.dueDate}` : ''}`,
        data: { paymentId: data.id },
      });
    }

    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /payments/:id/mark-paid - admin marks as paid + uploads receipt
router.patch('/:id/mark-paid', authorize('admin'), upload.single('receipt'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let receiptUrl: string | undefined;
    if (req.file) {
      receiptUrl = await uploadFile(STORAGE_BUCKETS.RECEIPTS, req.file, req.params.id);
    }

    const { data, error } = await supabaseAdmin
      .from('payments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        receipt_url: receiptUrl,
      })
      .eq('id', req.params.id)
      .select('*, students(profile_id)')
      .single();

    if (error || !data) throw new AppError('Payment not found', 404);

    // Notify student
    const studentProfileId = (data as any).students?.profile_id;
    if (studentProfileId) {
      await createNotification({
        recipientId: studentProfileId,
        type: 'payment',
        title: 'Paiement confirmé',
        body: 'Votre paiement a été confirmé. Le reçu est disponible.',
        data: { paymentId: data.id, receiptUrl },
      });
    }

    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// PATCH /payments/:id/status
router.patch('/:id/status', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({
      status: z.enum(['pending', 'paid', 'overdue', 'cancelled']),
    }).parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('payments').update({ status }).eq('id', req.params.id).select().single();

    if (error || !data) throw new AppError('Payment not found', 404);
    return res.json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// DELETE /payments/:id
router.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supabaseAdmin.from('payments').delete().eq('id', req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export default router;
