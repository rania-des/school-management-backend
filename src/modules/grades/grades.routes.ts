import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification, createBulkNotifications, getStudentParentProfileIds } from '../../utils/notifications';

// Utilisation de require pour pdfkit (évite les problèmes de types)
const PDFDocument = require('pdfkit');

const router = Router();
router.use(authenticate);

const gradeSchema = z.object({
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  period: z.enum(['trimester_1', 'trimester_2', 'trimester_3', 'semester_1', 'semester_2', 'annual']),
  score: z.number().min(0).max(20),
  maxScore: z.number().default(20),
  coefficient: z.number().positive().default(1),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  gradeDate: z.string().optional(),
});

// GET /grades
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { studentId, classId, subjectId, period, academicYearId } = req.query;

    let query = supabaseAdmin
      .from('grades')
      .select(`*, subjects(name, code, coefficient), students(student_number, profiles:profile_id(first_name, last_name)), teacher_id, classes(name)`, { count: 'exact' })
      .order('grade_date', { ascending: false })
      .range(offset, offset + limit - 1);

    const role = req.user!.role;

    if (role === 'student') {
      const { data: student } = await supabaseAdmin.from('students').select('id').eq('profile_id', req.user!.id).single();
      if (!student) throw new AppError('Student not found', 404);
      query = query.eq('student_id', student.id);
    } else if (role === 'parent') {
      const { data: parent } = await supabaseAdmin.from('parents').select('id').eq('profile_id', req.user!.id).single();
      if (!parent) throw new AppError('Parent not found', 404);
      const { data: children } = await supabaseAdmin.from('parent_student').select('student_id').eq('parent_id', parent.id);
      const childIds = (children || []).map((c: any) => c.student_id);
      query = query.in('student_id', childIds);
    } else if (role === 'teacher') {
      const { data: teacher } = await supabaseAdmin.from('teachers').select('id').eq('profile_id', req.user!.id).single();
      if (!teacher) throw new AppError('Teacher not found', 404);
      query = query.eq('teacher_id', teacher.id);
    }

    if (studentId) query = query.eq('student_id', studentId);
    if (classId) query = query.eq('class_id', classId);
    if (subjectId) query = query.eq('subject_id', subjectId);
    if (period) query = query.eq('period', period);
    if (academicYearId) query = query.eq('academic_year_id', academicYearId);

    const { data, count, error } = await query;
    if (error) throw new AppError('Failed to fetch grades', 500);
    return res.json(paginate(data || [], count || 0, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// POST /grades
router.post('/', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = gradeSchema.parse(req.body);
    let teacherId = body.studentId;
    if (req.user!.role === 'teacher') {
      const { data: teacher } = await supabaseAdmin.from('teachers').select('id').eq('profile_id', req.user!.id).single();
      if (!teacher) throw new AppError('Teacher not found', 404);
      teacherId = teacher.id;
    }

    const { data, error } = await supabaseAdmin.from('grades').insert({
      student_id: body.studentId, subject_id: body.subjectId,
      teacher_id: req.user!.role === 'teacher' ? teacherId : null,
      class_id: body.classId, academic_year_id: body.academicYearId,
      period: body.period, score: body.score, max_score: body.maxScore,
      coefficient: body.coefficient, title: body.title,
      description: body.description,
      grade_date: body.gradeDate || new Date().toISOString().split('T')[0],
    }).select('*, subjects(name), students(profile_id, users(first_name, last_name))').single();

    if (error || !data) throw new AppError('Failed to create grade', 500);

    const studentProfileId = (data as any).students?.profile_id;
    if (studentProfileId) {
      await createNotification({ recipientId: studentProfileId, type: 'grade', title: 'Nouvelle note', body: `Vous avez reçu ${body.score}/20 en ${(data as any).subjects?.name} - ${body.title}`, data: { gradeId: data.id, score: body.score } });
      const parentProfileIds = await getStudentParentProfileIds(body.studentId);
      for (const parentId of parentProfileIds) {
        await createNotification({ recipientId: parentId, type: 'grade', title: 'Nouvelle note', body: `Note de ${(data as any).students?.users?.first_name}: ${body.score}/20 en ${(data as any).subjects?.name}`, data: { gradeId: data.id } });
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
      const { data: student } = await supabaseAdmin.from('students').select('id').eq('profile_id', req.user!.id).single();
      if (!student || student.id !== studentId) throw new AppError('Forbidden', 403);
    }

    const { data: grades, error } = await supabaseAdmin.from('grades')
      .select('*, subjects(name, code, coefficient), teacher_id')
      .eq('student_id', studentId as string).eq('period', period as string)
      .eq('academic_year_id', academicYearId as string).order('subjects(name)', { ascending: true });

    if (error) throw new AppError('Failed to fetch bulletin', 500);

    let totalWeightedScore = 0; let totalWeight = 0;
    const gradesWithAvg = (grades || []).map((g: any) => {
      const weight = g.coefficient * (g.subjects?.coefficient || 1);
      totalWeightedScore += g.score * weight; totalWeight += weight;
      return g;
    });
    const generalAverage = totalWeight > 0 ? (totalWeightedScore / totalWeight).toFixed(2) : null;

    const { data: comments } = await supabaseAdmin.from('teacher_comments')
      .select('*, subjects(name), teacher_id')
      .eq('student_id', studentId as string).eq('period', period as string)
      .eq('academic_year_id', academicYearId as string);

    const { data: studentData } = await supabaseAdmin.from('students').select('class_id').eq('id', studentId as string).single();
    const { data: ranking } = await supabaseAdmin.rpc('get_class_ranking', { p_class_id: studentData?.class_id, p_period: period, p_academic_year_id: academicYearId });
    const studentRank = (ranking || []).find((r: any) => r.student_id === studentId);

    return res.json(successResponse({ grades: gradesWithAvg, comments: comments || [], generalAverage, rank: studentRank?.rank, classSize: (ranking || []).length }));
  } catch (err) { return next(err); }
});

// GET /grades/bulletin/pdf — Generate PDF bulletin
router.get('/bulletin/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, period } = req.query;
    if (!studentId || !period) throw new AppError('studentId and period are required', 400);

    // Verify access
    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin.from('students').select('id').eq('profile_id', req.user!.id).single();
      if (!student || student.id !== studentId) throw new AppError('Forbidden', 403);
    } else if (req.user!.role === 'parent') {
      const { data: parent } = await supabaseAdmin.from('parents').select('id').eq('profile_id', req.user!.id).single();
      if (!parent) throw new AppError('Forbidden', 403);
      const { data: children } = await supabaseAdmin.from('parent_student').select('student_id').eq('parent_id', parent.id);
      const childIds = (children || []).map((c: any) => c.student_id);
      if (!childIds.includes(studentId as string)) throw new AppError('Forbidden', 403);
    }

    // Fetch student info
    const { data: student } = await supabaseAdmin.from('students')
      .select('*, users(first_name, last_name, date_of_birth, email), classes(name)')
      .eq('id', studentId as string).single();
    if (!student) throw new AppError('Student not found', 404);

    // Fetch grades
    const { data: grades } = await supabaseAdmin.from('grades')
      .select('*, subjects(name, coefficient)')
      .eq('student_id', studentId as string).eq('period', period as string)
      .order('created_at', { ascending: true });

    // Group by subject
    const subjectMap = new Map<string, { name: string; coefficient: number; grades: any[] }>();
    for (const g of (grades || [])) {
      const subId = g.subject_id;
      const subName = g.subjects?.name || 'Matière';
      const subCoeff = g.subjects?.coefficient || 1;
      if (!subjectMap.has(subId)) subjectMap.set(subId, { name: subName, coefficient: subCoeff, grades: [] });
      subjectMap.get(subId)!.grades.push(g);
    }

    // Calculate averages
    const subjects: { name: string; coefficient: number; average: number; grades: any[] }[] = [];
    let totalWeighted = 0, totalCoeff = 0;

    for (const [, sub] of subjectMap) {
      let sumScore = 0, sumCoeff = 0;
      for (const g of sub.grades) {
        const normalized = (g.score / (g.max_score || 20)) * 20;
        sumScore += normalized * (g.coefficient || 1);
        sumCoeff += (g.coefficient || 1);
      }
      const avg = sumCoeff > 0 ? sumScore / sumCoeff : 0;
      subjects.push({ name: sub.name, coefficient: sub.coefficient, average: avg, grades: sub.grades });
      totalWeighted += avg * sub.coefficient;
      totalCoeff += sub.coefficient;
    }

    const generalAvg = totalCoeff > 0 ? totalWeighted / totalCoeff : 0;

    // Fetch comments
    const { data: comments } = await supabaseAdmin.from('teacher_comments')
      .select('*, subjects(name), teacher_id')
      .eq('student_id', studentId as string).eq('period', period as string);

    // Period label
    const periodLabels: Record<string, string> = {
      trimester_1: '1er Trimestre', trimester_2: '2ème Trimestre', trimester_3: '3ème Trimestre',
      semester_1: '1er Semestre', semester_2: '2ème Semestre', annual: 'Annuel',
    };
    const periodLabel = periodLabels[period as string] || (period as string);

    // ── Generate PDF ──
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const pageW = doc.page.width - 80;
    const blue = '#1E3A5F';
    const lightBlue = '#4A90D9';
    const gray = '#6B7280';
    const lightGray = '#F3F4F6';

    // ── Header ──
    doc.rect(0, 0, doc.page.width, 100).fill(blue);
    doc.fontSize(22).fillColor('white').text('BULLETIN SCOLAIRE', 40, 25, { align: 'center' });
    doc.fontSize(11).text(`${periodLabel} — ${new Date().getFullYear()}/${new Date().getFullYear() + 1}`, 40, 55, { align: 'center' });
    doc.fontSize(9).text('School Management Platform', 40, 75, { align: 'center' });

    // ── Student info card ──
    const infoY = 120;
    doc.roundedRect(40, infoY, pageW, 70, 8).fill(lightGray);
    doc.fillColor(blue).fontSize(12);
    doc.text(`Élève : ${(student as any).users?.first_name} ${(student as any).users?.last_name}`, 55, infoY + 12);
    doc.fontSize(10).fillColor(gray);
    doc.text(`Classe : ${(student as any).classes?.name || '-'}`, 55, infoY + 32);
    doc.text(`N° : ${student.student_number || '-'}`, 55, infoY + 48);

    const dateNaissance = (student as any).users?.date_of_birth
      ? new Date((student as any).users.date_of_birth).toLocaleDateString('fr-FR')
      : '-';
    doc.text(`Né(e) le : ${dateNaissance}`, 300, infoY + 32);
    doc.text(`Période : ${periodLabel}`, 300, infoY + 48);

    // ── Grades table ──
    const tableY = infoY + 90;
    const colWidths = [180, 50, 80, 80, pageW - 390];
    const colX = [40, 220, 270, 350, 430];

    // Table header
    doc.roundedRect(40, tableY, pageW, 28, 4).fill(blue);
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
    doc.text('Matière', colX[0] + 8, tableY + 8);
    doc.text('Coeff.', colX[1] + 4, tableY + 8);
    doc.text('Moyenne', colX[2] + 4, tableY + 8);
    doc.text('Appréciation', colX[3] + 4, tableY + 8);
    doc.text('Détail', colX[4] + 4, tableY + 8);

    // Table rows
    let currentY = tableY + 28;
    doc.font('Helvetica');

    subjects.sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < subjects.length; i++) {
      const sub = subjects[i];
      const rowH = 32;

      if (currentY + rowH > doc.page.height - 100) {
        doc.addPage();
        currentY = 60;
      }

      // Alternate row bg
      if (i % 2 === 0) {
        doc.rect(40, currentY, pageW, rowH).fill('#F9FAFB');
      }

      // Subject name
      doc.fillColor(blue).fontSize(9).font('Helvetica-Bold');
      doc.text(sub.name, colX[0] + 8, currentY + 10, { width: 170 });

      // Coefficient
      doc.fillColor(gray).fontSize(9).font('Helvetica');
      doc.text(String(sub.coefficient), colX[1] + 12, currentY + 10);

      // Average — color coded
      const avg = sub.average;
      const avgColor = avg >= 14 ? '#059669' : avg >= 10 ? '#D97706' : '#DC2626';
      doc.fillColor(avgColor).fontSize(11).font('Helvetica-Bold');
      doc.text(avg.toFixed(2) + '/20', colX[2] + 4, currentY + 9);

      // Comment for this subject
      const subComment = (comments || []).find((c: any) => c.subjects?.name === sub.name);
      doc.fillColor(gray).fontSize(7).font('Helvetica');
      doc.text(subComment?.comment || '-', colX[3] + 4, currentY + 10, { width: 75 });

      // Grades detail
      const detail = sub.grades.map((g: any) => `${g.title}: ${g.score}/${g.max_score || 20}`).join(', ');
      doc.fillColor(gray).fontSize(7);
      doc.text(detail, colX[4] + 4, currentY + 10, { width: pageW - 396 });

      // Row border
      doc.moveTo(40, currentY + rowH).lineTo(40 + pageW, currentY + rowH).strokeColor('#E5E7EB').lineWidth(0.5).stroke();

      currentY += rowH;
    }

    // ── General average bar ──
    currentY += 10;
    if (currentY > doc.page.height - 120) { doc.addPage(); currentY = 60; }

    doc.roundedRect(40, currentY, pageW, 40, 6).fill(blue);
    doc.fillColor('white').fontSize(13).font('Helvetica-Bold');
    doc.text('MOYENNE GÉNÉRALE', 60, currentY + 12);
    const avgColorGeneral = generalAvg >= 14 ? '#4ADE80' : generalAvg >= 10 ? '#FCD34D' : '#F87171';
    doc.fillColor(avgColorGeneral).fontSize(16);
    doc.text(generalAvg.toFixed(2) + ' / 20', 380, currentY + 10, { align: 'right', width: 130 });

    // ── General comments ──
    currentY += 60;
    if (currentY > doc.page.height - 100) { doc.addPage(); currentY = 60; }

    const generalComments = (comments || []).filter((c: any) => !c.subject_id);
    if (generalComments.length > 0) {
      doc.fillColor(blue).fontSize(11).font('Helvetica-Bold');
      doc.text('Appréciations générales', 40, currentY);
      currentY += 20;

      for (const c of generalComments) {
        const teacherName = c.teachers?.users ? `${c.teachers.users.first_name} ${c.teachers.users.last_name}` : 'Enseignant';
        doc.roundedRect(40, currentY, pageW, 35, 4).fill(lightGray);
        doc.fillColor(blue).fontSize(8).font('Helvetica-Bold');
        doc.text(teacherName, 50, currentY + 6);
        doc.fillColor(gray).fontSize(8).font('Helvetica');
        doc.text(c.comment, 50, currentY + 18, { width: pageW - 20 });
        currentY += 40;
      }
    }

    // ── Footer ──
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(gray).fontSize(7).font('Helvetica');
      doc.text(`Bulletin généré le ${new Date().toLocaleDateString('fr-FR')} — Page ${i + 1}/${pages.count}`, 40, doc.page.height - 30, { align: 'center', width: pageW });
    }

    doc.end();

    const pdfBuffer = await pdfPromise;
    const fileName = `bulletin_${(student as any).users?.last_name}_${periodLabel.replace(/ /g, '_')}.pdf`;

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

    const { data, error } = await supabaseAdmin.from('grades').update(updateData).eq('id', req.params.id).select().single();
    if (error || !data) throw new AppError('Grade not found or update failed', 404);
    return res.json(successResponse(data, 'Grade updated'));
  } catch (err) { return next(err); }
});

// DELETE /grades/:id
router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error } = await supabaseAdmin.from('grades').delete().eq('id', req.params.id);
    if (error) throw new AppError('Failed to delete grade', 500);
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

    const { data: teacher } = await supabaseAdmin.from('teachers').select('id').eq('profile_id', req.user!.id).single();
    const { data, error } = await supabaseAdmin.from('teacher_comments').insert({
      teacher_id: teacher?.id, student_id: body.studentId, subject_id: body.subjectId,
      class_id: body.classId, academic_year_id: body.academicYearId,
      period: body.period, comment: body.comment, is_positive: body.isPositive,
    }).select().single();

    if (error) throw new AppError('Failed to save comment', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

export default router;