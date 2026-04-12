import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification, getStudentParentProfileIds } from '../../utils/notifications';
import { sbGet, sbGetOne, sbInsert, sbUpdate, sbDelete } from '../../utils/sbClient';

const PDFDocument = require('pdfkit');
const router = Router();
router.use(authenticate);

const gradeSchema = z.object({
  studentId: z.string().uuid(), subjectId: z.string().uuid(),
  classId: z.string().uuid(), academicYearId: z.string().uuid(),
  period: z.enum(['trimester_1', 'trimester_2', 'trimester_3', 'semester_1', 'semester_2', 'annual']),
  score: z.number().min(0).max(20), maxScore: z.number().default(20),
  coefficient: z.number().positive().default(1), title: z.string().min(1).max(255),
  description: z.string().optional(), gradeDate: z.string().optional(),
});

// GET /grades
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { studentId, classId, subjectId, period, academicYearId } = req.query;
    let params = `select=*,subjects(name,code,coefficient),students(student_number,profiles:profile_id(first_name,last_name)),teachers(profiles:profile_id(first_name,last_name)),classes(name)&order=grade_date.desc&offset=${offset}&limit=${limit}`;

    const role = req.user!.role;
    if (role === 'student') {
      const s = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=id`);
      if (!s) throw new AppError('Student not found', 404);
      params += `&student_id=eq.${s.id}`;
    } else if (role === 'parent') {
      const p = await sbGetOne('parents', `profile_id=eq.${req.user!.id}&select=id`);
      if (!p) throw new AppError('Parent not found', 404);
      const children = await sbGet('parent_student', `parent_id=eq.${p.id}&select=student_id`);
      const childIds = children.map((c: any) => c.student_id).filter(Boolean);
      if (childIds.length > 0) params += `&student_id=in.(${childIds.join(',')})`;
    } else if (role === 'teacher') {
      const t = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=id`);
      if (!t) throw new AppError('Teacher not found', 404);
      params += `&teacher_id=eq.${t.id}`;
    }

    if (studentId) params += `&student_id=eq.${studentId}`;
    if (classId) params += `&class_id=eq.${classId}`;
    if (subjectId) params += `&subject_id=eq.${subjectId}`;
    if (period) params += `&period=eq.${period}`;
    if (academicYearId) params += `&academic_year_id=eq.${academicYearId}`;

    const data = await sbGet('grades', params);
    return res.json(paginate(data, data.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// POST /grades
router.post('/', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = gradeSchema.parse(req.body);
    let teacherId = null;
    if (req.user!.role === 'teacher') {
      const t = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=id`);
      if (!t) throw new AppError('Teacher not found', 404);
      teacherId = t.id;
    }

    const data = await sbInsert('grades', {
      student_id: body.studentId, subject_id: body.subjectId,
      teacher_id: teacherId, class_id: body.classId,
      academic_year_id: body.academicYearId, period: body.period,
      score: body.score, max_score: body.maxScore, coefficient: body.coefficient,
      title: body.title, description: body.description,
      grade_date: body.gradeDate || new Date().toISOString().split('T')[0],
    });

    const student = await sbGetOne('students', `id=eq.${body.studentId}&select=profile_id`);
    const subject = await sbGetOne('subjects', `id=eq.${body.subjectId}&select=name`);
    if (student?.profile_id) {
      await createNotification({ recipientId: student.profile_id, type: 'grade',
        title: 'Nouvelle note',
        body: `Vous avez reçu ${body.score}/20 en ${subject?.name} - ${body.title}`,
        data: { gradeId: data.id, score: body.score } });
      const parentProfileIds = await getStudentParentProfileIds(body.studentId);
      for (const parentId of parentProfileIds) {
        await createNotification({ recipientId: parentId, type: 'grade',
          title: 'Nouvelle note',
          body: `Note: ${body.score}/20 en ${subject?.name}`,
          data: { gradeId: data.id } });
      }
    }
    return res.status(201).json(successResponse(data, 'Grade created'));
  } catch (err) { return next(err); }
});

// GET /grades/bulletin
router.get('/bulletin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, period, academicYearId } = req.query;
    if (!studentId || !period || !academicYearId) throw new AppError('studentId, period, and academicYearId are required', 400);

    if (req.user!.role === 'student') {
      const s = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=id`);
      if (!s || s.id !== studentId) throw new AppError('Forbidden', 403);
    }

    const grades = await sbGet('grades', `student_id=eq.${studentId}&period=eq.${period}&academic_year_id=eq.${academicYearId}&select=*,subjects(name,code,coefficient),teachers(profiles:profile_id(first_name,last_name))&order=subjects(name)`);

    let totalWeightedScore = 0, totalWeight = 0;
    grades.forEach((g: any) => {
      const weight = g.coefficient * (g.subjects?.coefficient || 1);
      totalWeightedScore += g.score * weight; totalWeight += weight;
    });
    const generalAverage = totalWeight > 0 ? (totalWeightedScore / totalWeight).toFixed(2) : null;

    const comments = await sbGet('teacher_comments', `student_id=eq.${studentId}&period=eq.${period}&academic_year_id=eq.${academicYearId}&select=*,subjects(name),teachers(profiles:profile_id(first_name,last_name))`).catch(() => []);

    return res.json(successResponse({ grades, comments, generalAverage }));
  } catch (err) { return next(err); }
});

// GET /grades/bulletin/pdf
router.get('/bulletin/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, period } = req.query;
    if (!studentId || !period) throw new AppError('studentId and period are required', 400);

    if (req.user!.role === 'student') {
      const s = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=id`);
      if (!s || s.id !== studentId) throw new AppError('Forbidden', 403);
    } else if (req.user!.role === 'parent') {
      const p = await sbGetOne('parents', `profile_id=eq.${req.user!.id}&select=id`);
      if (!p) throw new AppError('Forbidden', 403);
      const children = await sbGet('parent_student', `parent_id=eq.${p.id}&select=student_id`);
      const childIds = children.map((c: any) => c.student_id);
      if (!childIds.includes(studentId as string)) throw new AppError('Forbidden', 403);
    }

    const student = await sbGetOne('students', `id=eq.${studentId}&select=*,classes(name),profiles:profile_id(first_name,last_name,date_of_birth,email)`);
    if (!student) throw new AppError('Student not found', 404);

    const grades = await sbGet('grades', `student_id=eq.${studentId}&period=eq.${period}&select=*,subjects(name,coefficient)&order=created_at`);
    const comments = await sbGet('teacher_comments', `student_id=eq.${studentId}&period=eq.${period}&select=*,subjects(name),teachers(profiles:profile_id(first_name,last_name))`).catch(() => []);

    // Group by subject
    const subjectMap = new Map<string, any>();
    for (const g of grades) {
      const key = g.subject_id;
      if (!subjectMap.has(key)) subjectMap.set(key, { name: g.subjects?.name || 'Matière', coefficient: g.subjects?.coefficient || 1, grades: [] });
      subjectMap.get(key).grades.push(g);
    }

    const subjects: any[] = [];
    let totalWeighted = 0, totalCoeff = 0;
    for (const [, sub] of subjectMap) {
      let sumScore = 0, sumCoeff = 0;
      for (const g of sub.grades) {
        const normalized = (g.score / (g.max_score || 20)) * 20;
        sumScore += normalized * (g.coefficient || 1); sumCoeff += (g.coefficient || 1);
      }
      const avg = sumCoeff > 0 ? sumScore / sumCoeff : 0;
      subjects.push({ name: sub.name, coefficient: sub.coefficient, average: avg, grades: sub.grades });
      totalWeighted += avg * sub.coefficient; totalCoeff += sub.coefficient;
    }
    const generalAvg = totalCoeff > 0 ? totalWeighted / totalCoeff : 0;

    const periodLabels: Record<string, string> = {
      trimester_1: '1er Trimestre', trimester_2: '2ème Trimestre', trimester_3: '3ème Trimestre',
      semester_1: '1er Semestre', semester_2: '2ème Semestre', annual: 'Annuel',
    };
    const periodLabel = periodLabels[period as string] || (period as string);

    // ── Generate PDF ──
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve) => { doc.on('end', () => resolve(Buffer.concat(chunks))); });

    const pageW = doc.page.width - 80;
    const blue = '#1E3A5F', gray = '#6B7280', lightGray = '#F3F4F6';

    doc.rect(0, 0, doc.page.width, 100).fill(blue);
    doc.fontSize(22).fillColor('white').text('BULLETIN SCOLAIRE', 40, 25, { align: 'center' });
    doc.fontSize(11).text(`${periodLabel} — ${new Date().getFullYear()}/${new Date().getFullYear() + 1}`, 40, 55, { align: 'center' });
    doc.fontSize(9).text('School Management Platform', 40, 75, { align: 'center' });

    const infoY = 120;
    doc.roundedRect(40, infoY, pageW, 70, 8).fill(lightGray);
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
    const cls = Array.isArray(student.classes) ? student.classes[0] : student.classes;
    doc.fillColor(blue).fontSize(12).text(`Élève : ${profile?.first_name} ${profile?.last_name}`, 55, infoY + 12);
    doc.fontSize(10).fillColor(gray).text(`Classe : ${cls?.name || '-'}`, 55, infoY + 32);
    doc.text(`N° : ${student.student_number || '-'}`, 55, infoY + 48);
    doc.text(`Période : ${periodLabel}`, 300, infoY + 48);

    const tableY = infoY + 90;
    const colX = [40, 220, 270, 350, 430];
    doc.roundedRect(40, tableY, pageW, 28, 4).fill(blue);
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
    doc.text('Matière', colX[0] + 8, tableY + 8);
    doc.text('Coeff.', colX[1] + 4, tableY + 8);
    doc.text('Moyenne', colX[2] + 4, tableY + 8);
    doc.text('Appréciation', colX[3] + 4, tableY + 8);
    doc.text('Détail', colX[4] + 4, tableY + 8);

    let currentY = tableY + 28;
    doc.font('Helvetica');
    subjects.sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < subjects.length; i++) {
      const sub = subjects[i];
      const rowH = 32;
      if (currentY + rowH > doc.page.height - 100) { doc.addPage(); currentY = 60; }
      if (i % 2 === 0) doc.rect(40, currentY, pageW, rowH).fill('#F9FAFB');
      doc.fillColor(blue).fontSize(9).font('Helvetica-Bold').text(sub.name, colX[0] + 8, currentY + 10, { width: 170 });
      doc.fillColor(gray).fontSize(9).font('Helvetica').text(String(sub.coefficient), colX[1] + 12, currentY + 10);
      const avgColor = sub.average >= 14 ? '#059669' : sub.average >= 10 ? '#D97706' : '#DC2626';
      doc.fillColor(avgColor).fontSize(11).font('Helvetica-Bold').text(sub.average.toFixed(2) + '/20', colX[2] + 4, currentY + 9);
      const subComment = comments.find((c: any) => c.subjects?.name === sub.name);
      doc.fillColor(gray).fontSize(7).font('Helvetica').text(subComment?.comment || '-', colX[3] + 4, currentY + 10, { width: 75 });
      const detail = sub.grades.map((g: any) => `${g.title}: ${g.score}/${g.max_score || 20}`).join(', ');
      doc.text(detail, colX[4] + 4, currentY + 10, { width: pageW - 396 });
      doc.moveTo(40, currentY + rowH).lineTo(40 + pageW, currentY + rowH).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      currentY += rowH;
    }

    currentY += 10;
    if (currentY > doc.page.height - 120) { doc.addPage(); currentY = 60; }
    doc.roundedRect(40, currentY, pageW, 40, 6).fill(blue);
    doc.fillColor('white').fontSize(13).font('Helvetica-Bold').text('MOYENNE GÉNÉRALE', 60, currentY + 12);
    const avgColorG = generalAvg >= 14 ? '#4ADE80' : generalAvg >= 10 ? '#FCD34D' : '#F87171';
    doc.fillColor(avgColorG).fontSize(16).text(generalAvg.toFixed(2) + ' / 20', 380, currentY + 10, { align: 'right', width: 130 });

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(gray).fontSize(7).font('Helvetica').text(`Bulletin généré le ${new Date().toLocaleDateString('fr-FR')} — Page ${i + 1}/${pages.count}`, 40, doc.page.height - 30, { align: 'center', width: pageW });
    }

    doc.end();
    const pdfBuffer = await pdfPromise;
    const lastName = Array.isArray(student.profiles) ? student.profiles[0]?.last_name : student.profiles?.last_name;
    const fileName = `bulletin_${lastName}_${periodLabel.replace(/ /g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) { return next(err); }
});

// PATCH /grades/:id
router.patch('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = z.object({ score: z.number().min(0).max(20).optional(), title: z.string().optional(), description: z.string().optional() }).parse(req.body);
    const updateData: Record<string, unknown> = {};
    if (updates.score !== undefined) updateData.score = updates.score;
    if (updates.title) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    const data = await sbUpdate('grades', `id=eq.${req.params.id}`, updateData);
    if (!data) throw new AppError('Grade not found or update failed', 404);
    return res.json(successResponse(data, 'Grade updated'));
  } catch (err) { return next(err); }
});

// DELETE /grades/:id
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbDelete('grades', `id=eq.${req.params.id}`);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// POST /grades/comments
router.post('/comments', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      studentId: z.string().uuid(), subjectId: z.string().uuid().optional(),
      classId: z.string().uuid(), academicYearId: z.string().uuid(),
      period: z.enum(['trimester_1', 'trimester_2', 'trimester_3', 'semester_1', 'semester_2', 'annual']),
      comment: z.string().min(1), isPositive: z.boolean().default(true),
    }).parse(req.body);
    const teacher = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=id`);
    const data = await sbInsert('teacher_comments', {
      teacher_id: teacher?.id, student_id: body.studentId, subject_id: body.subjectId,
      class_id: body.classId, academic_year_id: body.academicYearId,
      period: body.period, comment: body.comment, is_positive: body.isPositive,
    });
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

export default router;