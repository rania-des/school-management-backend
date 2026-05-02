import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import PDFDocument from 'pdfkit';

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

    let url = `payments?select=*&order=created_at.desc&offset=${offset}&limit=${limit}`;

    if (req.user!.role === 'student') {
      const { data: students } = await sbGet(`students?profile_id=eq.${req.user!.id}&select=id`);
      const sid = Array.isArray(students) ? students[0]?.id : null;
      if (sid) url += `&student_id=eq.${sid}`;
      else return res.json(paginate([], 0, { page, limit, offset }));
    } else if (req.user!.role === 'parent') {
      const { data: parents } = await sbGet(`parents?profile_id=eq.${req.user!.id}&select=id`);
      const parentId = Array.isArray(parents) ? parents[0]?.id : null;
      if (parentId) {
        const { data: links } = await sbGet(`parent_student?parent_id=eq.${parentId}&select=student_id`);
        const childIds = (Array.isArray(links) ? links : []).map((c: any) => c.student_id).filter(Boolean);
        if (childIds.length > 0) url += `&student_id=in.(${childIds.join(',')})`;
        else return res.json(paginate([], 0, { page, limit, offset }));
      }
    }

    if (status) url += `&status=eq.${status}`;
    if (type) url += `&type=eq.${type}`;

    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];
    return res.json(paginate(arr, arr.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// GET /payments/stats
router.get('/stats', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { academicYearId } = req.query;
    let url = `payments?select=amount,status,type`;
    if (academicYearId) url += `&academic_year_id=eq.${academicYearId}`;
    const { data } = await sbGet(url);
    const arr = Array.isArray(data) ? data : [];
    const stats = { total: 0, paid: 0, pending: 0, overdue: 0, byType: {} as Record<string, number> };
    arr.forEach((p: any) => {
      const amt = parseFloat(p.amount) || 0;
      stats.total += amt;
      if (p.status === 'paid') stats.paid += amt;
      if (p.status === 'pending') stats.pending += amt;
      if (p.status === 'overdue') stats.overdue += amt;
      stats.byType[p.type] = (stats.byType[p.type] || 0) + amt;
    });
    return res.json(successResponse(stats));
  } catch (err) { return next(err); }
});

// GET /payments/:id/receipt — PDF style bulletin (FIXED)
router.get('/:id/receipt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paymentId = req.params.id;

    const { data: paymentData, ok } = await sbGet(
      `payments?id=eq.${paymentId}&select=*,students(id,profiles(first_name,last_name,email))`
    );

    if (!ok || !paymentData || (Array.isArray(paymentData) && paymentData.length === 0)) {
      throw new AppError('Paiement non trouvé', 404);
    }

    const payment = Array.isArray(paymentData) ? paymentData[0] : paymentData;

    // Vérifier les droits d'accès
    if (req.user!.role === 'parent') {
      const { data: parents } = await sbGet(`parents?profile_id=eq.${req.user!.id}&select=id`);
      const parentId = Array.isArray(parents) ? parents[0]?.id : null;
      if (parentId) {
        const { data: links } = await sbGet(`parent_student?parent_id=eq.${parentId}&select=student_id`);
        const childIds = (Array.isArray(links) ? links : []).map((c: any) => c.student_id);
        if (!childIds.includes(payment.student_id)) {
          throw new AppError('Accès non autorisé', 403);
        }
      } else {
        throw new AppError('Accès non autorisé', 403);
      }
    } else if (req.user!.role !== 'admin') {
      throw new AppError('Accès non autorisé', 403);
    }

    // ── Générer le PDF style bulletin ──
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const pageW = doc.page.width - 80;
    const blueDark  = '#60A5FA';
    const blueLight = '#93C5FD';
    const textDark  = '#1E4078';
    const gray      = '#6B7280';
    const lightGray = '#F3F4F6';

    // ── HEADER bandeau bleu (identique bulletin) ──
    doc.rect(0, 0, doc.page.width, 65).fill(blueDark);
    doc.circle(57, 32, 18).fill('white');
    doc.fillColor(textDark).fontSize(7).font('Helvetica-Bold')
       .text('OMNIA', 39, 28, { width: 36, align: 'center' });
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
       .text('REÇU DE PAIEMENT', 80, 18, { width: doc.page.width - 120, align: 'center' });
    doc.fillColor('#A8C4E0').fontSize(9).font('Helvetica')
       .text(`Émis le ${new Date().toLocaleDateString('fr-FR')}`, 80, 38,
         { width: doc.page.width - 120, align: 'center' });
    doc.moveTo(0, 65).lineTo(doc.page.width, 65).strokeColor(blueLight).lineWidth(2).stroke();

    // ── Carte infos élève (identique bulletin) ──
    const infoY = 80;
    doc.roundedRect(40, infoY, pageW, 70, 8).fill(lightGray);
    const sp = payment.students?.profiles || {};
    doc.fillColor(textDark).fontSize(12).font('Helvetica-Bold')
       .text(`Élève : ${sp.first_name || ''} ${sp.last_name || ''}`, 55, infoY + 12);
    doc.fillColor(gray).fontSize(10).font('Helvetica')
       .text(`Email : ${sp.email || '—'}`, 55, infoY + 32)
       .text(`Réf. élève : ${payment.student_id?.substring(0, 8).toUpperCase() || '—'}`, 55, infoY + 48);

    // Badge N° Reçu (à droite, comme badge rang du bulletin)
    const badgeX = 40 + pageW - 95;
    doc.roundedRect(badgeX, infoY + 8, 85, 50, 6).fill(blueDark);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
       .text('N° REÇU', badgeX, infoY + 14, { width: 85, align: 'center' });
    doc.fontSize(11)
       .text(paymentId.substring(0, 8).toUpperCase(), badgeX, infoY + 27, { width: 85, align: 'center' });

    // ── Titre section détails ──
    const tableY = infoY + 90;
    doc.roundedRect(40, tableY, pageW, 28, 4).fill(blueDark);
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
       .text('CHAMP', 48, tableY + 8)
       .text('DÉTAIL', 300, tableY + 8);

    const typeLabels: Record<string, string> = {
      tuition: 'Scolarité', canteen: 'Cantine', trip: 'Sortie scolaire',
      activity: 'Activité', other: 'Autre',
    };
    const methodLabel = payment.payment_method === 'online' ? 'Paiement en ligne' : 'En espèces';

    const rows: [string, string][] = [
      ['Type de paiement',    typeLabels[payment.type] || payment.type],
      ['Description',         payment.description || '—'],
      ['Méthode de paiement', methodLabel],
      ['Date d\'échéance',    payment.due_date ? new Date(payment.due_date).toLocaleDateString('fr-FR') : '—'],
      ['Date de paiement',    payment.paid_at  ? new Date(payment.paid_at).toLocaleDateString('fr-FR')  : '—'],
      ['Statut',              payment.status === 'paid' ? 'PAYÉ' : payment.status.toUpperCase()],
    ];

    let currentY = tableY + 28;
    for (let i = 0; i < rows.length; i++) {
      const [label, value] = rows[i];
      const rowH = 28;
      if (i % 2 === 0) doc.rect(40, currentY, pageW, rowH).fill('#F9FAFB');
      doc.fillColor(gray).fontSize(9).font('Helvetica').text(label, 48, currentY + 8);
      const isStatut = label === 'Statut';
      const valColor = isStatut
        ? (payment.status === 'paid' ? '#059669' : '#D97706')
        : textDark;
      doc.fillColor(valColor).fontSize(9).font('Helvetica-Bold')
         .text(value, 300, currentY + 8, { width: pageW - 268, align: 'right' });
      doc.moveTo(40, currentY + rowH).lineTo(40 + pageW, currentY + rowH)
         .strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      currentY += rowH;
    }

    // ── Montant total (identique bandeau moyenne générale du bulletin) ──
    currentY += 10;
    doc.roundedRect(40, currentY, pageW, 44, 6).fill(blueDark);
    doc.fillColor('white').fontSize(12).font('Helvetica-Bold')
       .text('MONTANT TOTAL RÉGLÉ', 56, currentY + 13);
    const amtColor = '#4ADE80';
    doc.fillColor(amtColor).fontSize(17)
       .text(`${payment.amount} TND`, 56, currentY + 11,
         { align: 'right', width: pageW - 32 });

    // ── Footer (identique bulletin) ──
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(gray).fontSize(7).font('Helvetica')
         .text(`Reçu généré le ${new Date().toLocaleDateString('fr-FR')} — Page ${i + 1}/${pages.count}`,
           40, doc.page.height - 30, { align: 'center', width: pageW });
      doc.fillColor(blueLight).fontSize(6)
         .text('OMNIA — Plateforme éducative intelligente', 40, doc.page.height - 18,
           { align: 'center', width: pageW });
    }

    doc.end();
    const pdfBuffer = await pdfPromise;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="recu-paiement-${paymentId.substring(0, 8)}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);

  } catch (err) { return next(err); }
});

// POST /payments
router.post('/', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = paymentSchema.parse(req.body);
    const { data, ok } = await sbPost('payments', {
      student_id: body.studentId,
      type: body.type,
      amount: body.amount,
      description: body.description || null,
      due_date: body.dueDate || null,
      academic_year_id: body.academicYearId || null,
      status: 'pending',
    });
    if (!ok || !data) throw new AppError('Failed to create payment', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /payments/:id/mark-paid
router.patch('/:id/mark-paid', authorize('admin', 'parent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, ok } = await sbPatch(`payments?id=eq.${req.params.id}`, {
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: req.body.paymentMethod || 'cash',
      card_last4: req.body.cardLast4 || null,
    });
    if (!ok || !data) throw new AppError('Payment not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// PATCH /payments/:id/status
router.patch('/:id/status', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({
      status: z.enum(['pending', 'paid', 'overdue', 'cancelled']),
    }).parse(req.body);
    const { data, ok } = await sbPatch(`payments?id=eq.${req.params.id}`, { status });
    if (!ok || !data) throw new AppError('Payment not found', 404);
    return res.json(successResponse(data));
  } catch (err) { return next(err); }
});

// DELETE /payments/:id
router.delete('/:id', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbDelete(`payments?id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;