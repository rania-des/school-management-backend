import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification, getStudentParentProfileIds } from '../../utils/notifications';

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

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { studentId, classId, subjectId, period, academicYearId } = req.query;

    let query = supabaseAdmin
      .from('grades')
      .select(`*, subjects(name, code, coefficient), students(student_number, profiles(first_name, last_name)), teachers(profiles(first_name, last_name)), classes(name)`, { count: 'exact' })
      .order('grade_date', { ascending: false })
      .range(offset, offset + limit - 1);

    const role = req.user!.role;

    if (role === 'student') {
      const { data: student } = await supabaseAdmin.from('students').select('id').eq('profile_id', req.user!.id).single();
      if (!student) return res.json(paginate([], 0, { page, limit, offset }));
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
    }).select('*, subjects(name), students(profile_id, profiles(first_name, last_name))').single();

    if (error || !data) throw new AppError('Failed to create grade', 500);

    const studentProfileId = (data as any).students?.profile_id;
    if (studentProfileId) {
      await createNotification({ recipientId: studentProfileId, type: 'grade', title: 'Nouvelle note', body: `Vous avez reçu ${body.score}/20 en ${(data as any).subjects?.name} - ${body.title}`, data: { gradeId: data.id, score: body.score } });
      const parentProfileIds = await getStudentParentProfileIds(body.studentId);
      for (const parentId of parentProfileIds) {
        await createNotification({ recipientId: parentId, type: 'grade', title: 'Nouvelle note', body: `Note de ${(data as any).students?.profiles?.first_name}: ${body.score}/20 en ${(data as any).subjects?.name}`, data: { gradeId: data.id } });
      }
    }
    return res.status(201).json(successResponse(data, 'Grade created'));
  } catch (err) { return next(err); }
});

router.get('/bulletin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, period, academicYearId } = req.query;
    if (!studentId || !period || !academicYearId) throw new AppError('studentId, period, and academicYearId are required', 400);

    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin.from('students').select('id').eq('profile_id', req.user!.id).single();
      if (!student || student.id !== studentId) throw new AppError('Forbidden', 403);
    }

    const { data: grades, error } = await supabaseAdmin.from('grades')
      .select('*, subjects(name, code, coefficient), teachers(profiles(first_name, last_name))')
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
      .select('*, subjects(name), teachers(profiles(first_name, last_name))')
      .eq('student_id', studentId as string).eq('period', period as string)
      .eq('academic_year_id', academicYearId as string);

    const { data: studentData } = await supabaseAdmin.from('students').select('class_id').eq('id', studentId as string).single();
    
    let rankNumber: number | null = null;
    let classSize: number = 0;
    
    if (studentData?.class_id) {
      const { data: allStudents } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('class_id', studentData.class_id);
      
      if (allStudents && allStudents.length > 0) {
        classSize = allStudents.length;
        const averages: { studentId: string; avg: number }[] = [];
        
        for (const s of allStudents) {
          const { data: studentGrades } = await supabaseAdmin
            .from('grades')
            .select('score, max_score, coefficient, subjects(coefficient)')
            .eq('student_id', s.id)
            .eq('period', period as string)
            .eq('academic_year_id', academicYearId as string);
          
          if (studentGrades && studentGrades.length > 0) {
            let totalW = 0, totalC = 0;
            for (const g of studentGrades) {
              const norm = (g.score / (g.max_score || 20)) * 20;
              const subCoeff = (g as any).subjects?.coefficient || 1;
              totalW += norm * (g.coefficient || 1) * subCoeff;
              totalC += (g.coefficient || 1) * subCoeff;
            }
            averages.push({ studentId: s.id, avg: totalC > 0 ? totalW / totalC : 0 });
          } else {
            averages.push({ studentId: s.id, avg: 0 });
          }
        }
        
        averages.sort((a, b) => b.avg - a.avg);
        const rankIndex = averages.findIndex(a => a.studentId === studentId);
        if (rankIndex !== -1) rankNumber = rankIndex + 1;
      }
    }

    const allPeriods = ['trimester_1', 'trimester_2', 'trimester_3'];
    const evolutionData: { period: string; avg: number | null }[] = [];
    
    for (const p of allPeriods) {
      const { data: pGrades } = await supabaseAdmin
        .from('grades')
        .select('score, max_score, coefficient, subjects(coefficient)')
        .eq('student_id', studentId as string)
        .eq('period', p)
        .eq('academic_year_id', academicYearId as string);
      
      if (!pGrades || pGrades.length === 0) {
        evolutionData.push({ period: p, avg: null });
      } else {
        let tw = 0, tc = 0;
        for (const g of pGrades) {
          const norm = (g.score / (g.max_score || 20)) * 20;
          const subCoeff = (g as any).subjects?.coefficient || 1;
          tw += norm * (g.coefficient || 1) * subCoeff;
          tc += (g.coefficient || 1) * subCoeff;
        }
        evolutionData.push({ period: p, avg: tc > 0 ? parseFloat((tw / tc).toFixed(2)) : null });
      }
    }

    return res.json(successResponse({ 
      grades: gradesWithAvg, 
      comments: comments || [], 
      generalAverage, 
      rank: rankNumber, 
      classSize,
      evolutionData 
    }));
  } catch (err) { return next(err); }
});

router.get('/bulletin/pdf', async (req: Request, res: Response, next: NextFunction) => {
  console.log('🔴🔴🔴 PDF GENERATION STARTED - CORRECTED VERSION 🔴🔴🔴');
  console.log('Query params:', req.query);
  
  try {
    const { studentId, period, academicYearId: academicYearIdParam } = req.query;
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
      .select('*, profiles(first_name, last_name, date_of_birth, email), classes(name)')
      .eq('id', studentId as string).single();
    if (!student) throw new AppError('Student not found', 404);

    // Fetch grades
    const { data: grades } = await supabaseAdmin.from('grades')
      .select('*, academic_year_id, subjects(name, coefficient)')
      .eq('student_id', studentId as string).eq('period', period as string)
      .order('created_at', { ascending: true });

    // Récupérer academic_year_id depuis le paramètre ou depuis les grades
    const academicYearId: string | null = 
      (academicYearIdParam as string) ||
      ((grades && grades.length > 0) ? (grades[0] as any).academic_year_id ?? null : null);

    console.log('📅 academicYearId:', academicYearId);
    console.log('🎓 grades count:', grades?.length || 0);

    // Group by subject - with subjectId
    const subjectMap = new Map<string, { name: string; subjectId: string; coefficient: number; grades: any[] }>();
    for (const g of (grades || [])) {
      const subId = g.subject_id;
      const subName = g.subjects?.name || 'Matière';
      const subCoeff = g.subjects?.coefficient || 1;
      if (!subjectMap.has(subId)) subjectMap.set(subId, { name: subName, subjectId: subId, coefficient: subCoeff, grades: [] });
      subjectMap.get(subId)!.grades.push(g);
    }

    // Calculate averages
    const subjects: { name: string; subjectId: string; coefficient: number; average: number; grades: any[] }[] = [];
    let totalWeighted = 0, totalCoeff = 0;

    for (const [, sub] of subjectMap) {
      let sumScore = 0, sumCoeff = 0;
      for (const g of sub.grades) {
        const normalized = (g.score / (g.max_score || 20)) * 20;
        sumScore += normalized * (g.coefficient || 1);
        sumCoeff += (g.coefficient || 1);
      }
      const avg = sumCoeff > 0 ? sumScore / sumCoeff : 0;
      subjects.push({ name: sub.name, subjectId: sub.subjectId, coefficient: sub.coefficient, average: avg, grades: sub.grades });
      totalWeighted += avg * sub.coefficient;
      totalCoeff += sub.coefficient;
    }

    const generalAvg = totalCoeff > 0 ? totalWeighted / totalCoeff : 0;

    // Fetch comments - avec fallback pour les commentaires sans period (NULL)
    const { data: comments } = await supabaseAdmin.from('teacher_comments')
      .select('*, subjects(name), teachers(profiles(first_name, last_name))')
      .eq('student_id', studentId as string)
      .or(`period.eq.${period},period.is.null`);

    console.log('💬 COMMENTS:', JSON.stringify(comments?.map((c: any) => ({
      id: c.id, 
      subject_id: c.subject_id, 
      period: c.period,
      subjects: c.subjects, 
      comment: c.comment
    }))));

    // Fetch class ranking and evolution data
    const { data: studentInfo } = await supabaseAdmin
      .from('students').select('class_id').eq('id', studentId as string).single();

    let rankNumber: number | null = null;
    let classSize: number = 0;
    let evolutionData: { period: string; avg: number | null }[] = [];

    if (studentInfo?.class_id && academicYearId && grades && grades.length > 0) {
      const { data: allStudents } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('class_id', studentInfo.class_id);
      
      if (allStudents && allStudents.length > 0) {
        classSize = allStudents.length;
        const averages: { studentId: string; avg: number }[] = [];
        
        for (const s of allStudents) {
          const { data: studentGrades } = await supabaseAdmin
            .from('grades')
            .select('score, max_score, coefficient, subjects(coefficient)')
            .eq('student_id', s.id)
            .eq('period', period as string)
            .eq('academic_year_id', academicYearId);
          
          if (studentGrades && studentGrades.length > 0) {
            let tw = 0, tc = 0;
            for (const g of studentGrades) {
              const norm = (g.score / (g.max_score || 20)) * 20;
              const subCoeff = (g as any).subjects?.coefficient || 1;
              tw += norm * (g.coefficient || 1) * subCoeff;
              tc += (g.coefficient || 1) * subCoeff;
            }
            averages.push({ studentId: s.id, avg: tc > 0 ? tw / tc : 0 });
          } else {
            averages.push({ studentId: s.id, avg: 0 });
          }
        }
        
        averages.sort((a, b) => b.avg - a.avg);
        const rankIndex = averages.findIndex(a => a.studentId === studentId);
        if (rankIndex !== -1) rankNumber = rankIndex + 1;
      }

      const allPeriods = ['trimester_1', 'trimester_2', 'trimester_3'];
      for (const p of allPeriods) {
        const { data: pGrades } = await supabaseAdmin
          .from('grades')
          .select('score, max_score, coefficient, subjects(coefficient)')
          .eq('student_id', studentId as string)
          .eq('period', p)
          .eq('academic_year_id', academicYearId);
        
        if (!pGrades || pGrades.length === 0) {
          evolutionData.push({ period: p, avg: null });
        } else {
          let tw = 0, tc = 0;
          for (const g of pGrades) {
            const norm = (g.score / (g.max_score || 20)) * 20;
            const subCoeff = (g as any).subjects?.coefficient || 1;
            tw += norm * (g.coefficient || 1) * subCoeff;
            tc += (g.coefficient || 1) * subCoeff;
          }
          evolutionData.push({ period: p, avg: tc > 0 ? parseFloat((tw / tc).toFixed(2)) : null });
        }
      }
    }

    console.log('🔥 RANK CALCULATED:', { rankNumber, classSize });
    console.log('📊 EVOLUTION DATA:', evolutionData);

    // Period label
    const periodLabels: Record<string, string> = {
      trimester_1: '1er Trimestre', trimester_2: '2ème Trimestre', trimester_3: '3ème Trimestre',
      semester_1: '1er Semestre', semester_2: '2ème Semestre', annual: 'Annuel',
    };
    const periodLabel = periodLabels[period as string] || (period as string);

    // Generate PDF
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const pageW = doc.page.width - 80;
    const blue = '#2563EB';
    const titleBlue = '#2563EB';
    const dark = '#1F2937';
    const gray = '#6B7280';
    const lightGray = '#F9FAFB';
    const border = '#E5E7EB';
    const softBlue = '#EFF6FF';

    const formatScore = (value: number) => Number(value || 0).toFixed(2);
    const averageColor = (value: number) => value >= 14 ? '#16A34A' : value >= 10 ? '#F97316' : '#DC2626';
    const getGradeText = (g: any) => `${g.title || 'Évaluation'}: ${g.score}/${g.max_score || 20}`;

    // En-tête identique au formulaire: logo/plateforme à gauche, période/année à droite
    const headerY = 38;
    doc.fillColor(dark).font('Helvetica-Bold').fontSize(18).text('OMNIA', 40, headerY);
    doc.fillColor('#9CA3AF').font('Helvetica').fontSize(8).text('Plateforme éducative', 40, headerY + 22);

    doc.fillColor(dark).font('Helvetica-Bold').fontSize(10)
      .text(periodLabel, 40, headerY, { width: pageW, align: 'right' });
    doc.fillColor('#9CA3AF').font('Helvetica').fontSize(8)
      .text('Année scolaire 2024/2025', 40, headerY + 18, { width: pageW, align: 'right' });

    doc.moveTo(40, 92).lineTo(40 + pageW, 92).strokeColor('#F3F4F6').lineWidth(1).stroke();

    // Titre bleu comme dans le formulaire
    doc.fillColor(titleBlue).font('Helvetica-Bold').fontSize(16)
      .text('BULLETIN SCOLAIRE', 40, 112, { width: pageW, align: 'center' });

    // Informations rapides de l'élève, en style léger pour ne pas casser le visuel
    const studentName = `${(student as any).profiles?.first_name || ''} ${(student as any).profiles?.last_name || ''}`.trim();
    doc.fillColor(gray).font('Helvetica').fontSize(9)
      .text(`Élève : ${studentName || '-'}`, 40, 144)
      .text(`Classe : ${(student as any).classes?.name || '-'}`, 40, 160)
      .text(`Période : ${periodLabel}`, 300, 144)
      .text(`N° : ${student.student_number || '-'}`, 300, 160);

    // Tableau bulletin: même structure que le modal
    let currentY = 195;
    const tableX = 40;
    const col = {
      matiere: tableX,
      coef: tableX + 150,
      detail: tableX + 205,
      moyenne: tableX + pageW - 85,
    };
    const width = {
      matiere: 142,
      coef: 45,
      detail: pageW - 300,
      moyenne: 80,
    };

    const drawTableHeader = () => {
      doc.rect(tableX, currentY, pageW, 28).fill('white');
      doc.moveTo(tableX, currentY + 28).lineTo(tableX + pageW, currentY + 28)
        .strokeColor('#BFDBFE').lineWidth(1.5).stroke();
      doc.fillColor(blue).font('Helvetica-Bold').fontSize(8);
      doc.text('MATIÈRE', col.matiere, currentY + 10, { width: width.matiere });
      doc.text('COEF', col.coef, currentY + 10, { width: width.coef, align: 'center' });
      doc.text('DÉTAIL ÉVALUATION', col.detail, currentY + 10, { width: width.detail });
      doc.text('MOYENNE', col.moyenne, currentY + 10, { width: width.moyenne, align: 'center' });
      currentY += 28;
    };

    const ensureSpace = (needed: number) => {
      if (currentY + needed > doc.page.height - 70) {
        doc.addPage();
        currentY = 50;
        drawTableHeader();
      }
    };

    drawTableHeader();
    subjects.sort((a, b) => a.name.localeCompare(b.name));

    for (const sub of subjects) {
      const gradesLines = sub.grades && sub.grades.length > 0 ? sub.grades : [null];
      const rowH = 24;
      const subjectH = gradesLines.length * rowH;
      ensureSpace(subjectH);

      const subjectStartY = currentY;
      doc.rect(tableX, subjectStartY, pageW, subjectH).fill('white');

      doc.fillColor(dark).font('Helvetica-Bold').fontSize(9)
        .text(sub.name, col.matiere, subjectStartY + 8, { width: width.matiere });
      doc.fillColor(gray).font('Helvetica').fontSize(9)
        .text(String(sub.coefficient || 1), col.coef, subjectStartY + 8, { width: width.coef, align: 'center' });
      doc.fillColor(averageColor(sub.average)).font('Helvetica-Bold').fontSize(9)
        .text(`${formatScore(sub.average)}/20`, col.moyenne, subjectStartY + 8, { width: width.moyenne, align: 'center' });

      gradesLines.forEach((g: any, index: number) => {
        const y = subjectStartY + index * rowH;
        doc.fillColor(gray).font('Helvetica').fontSize(8)
          .text(g ? getGradeText(g) : '—', col.detail, y + 8, { width: width.detail });
        if (index < gradesLines.length - 1) {
          doc.moveTo(col.detail, y + rowH).lineTo(tableX + pageW, y + rowH)
            .strokeColor('#F3F4F6').lineWidth(0.5).stroke();
        }
      });

      doc.moveTo(tableX, subjectStartY + subjectH).lineTo(tableX + pageW, subjectStartY + subjectH)
        .strokeColor(border).lineWidth(0.6).stroke();
      currentY += subjectH;
    }

    // Moyenne générale identique au pied de tableau du formulaire
    ensureSpace(42);
    doc.rect(tableX, currentY, pageW, 36).fill(softBlue);
    doc.moveTo(tableX, currentY).lineTo(tableX + pageW, currentY).strokeColor('#BFDBFE').lineWidth(1.5).stroke();
    doc.fillColor(dark).font('Helvetica-Bold').fontSize(10)
      .text('Moyenne générale', tableX + 10, currentY + 12, { width: pageW - 120 });
    doc.fillColor(averageColor(generalAvg)).font('Helvetica-Bold').fontSize(13)
      .text(`${formatScore(generalAvg)}/20`, tableX, currentY + 10, { width: pageW - 10, align: 'right' });
    currentY += 54;

    // Appréciations en bas, comme demandé
    const subjectComments = (comments || []).filter((c: any) => c.subject_id);
    const generalComments = (comments || []).filter((c: any) => !c.subject_id);
    const allComments = [...subjectComments, ...generalComments];

    if (allComments.length > 0) {
      ensureSpace(45);
      doc.fillColor(titleBlue).font('Helvetica-Bold').fontSize(11)
        .text('Appréciations', tableX, currentY);
      currentY += 18;

      for (const c of allComments) {
        ensureSpace(38);
        const teacherName = c.teachers?.profiles
          ? `${c.teachers.profiles.first_name} ${c.teachers.profiles.last_name}`
          : 'Enseignant';
        const subjectName = c.subjects?.name || 'Général';

        doc.roundedRect(tableX, currentY, pageW, 32, 6).fill(lightGray);
        doc.fillColor(dark).font('Helvetica-Bold').fontSize(8)
          .text(`${teacherName} — ${subjectName}`, tableX + 10, currentY + 7, { width: pageW - 20 });
        doc.fillColor(gray).font('Helvetica').fontSize(8)
          .text(c.comment || '-', tableX + 10, currentY + 19, { width: pageW - 20 });
        currentY += 38;
      }
    }

    // Footer
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(gray).fontSize(7).font('Helvetica');
      doc.text(`Bulletin généré le ${new Date().toLocaleDateString('fr-FR')} — Page ${i + 1}/${pages.count}`, 40, doc.page.height - 30, { align: 'center', width: pageW });
    }

    doc.end();

    const pdfBuffer = await pdfPromise;
    const fileName = `bulletin_${(student as any).profiles?.last_name}_${periodLabel.replace(/ /g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);

  } catch (err) { return next(err); }
});

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

router.delete('/:id', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error } = await supabaseAdmin.from('grades').delete().eq('id', req.params.id);
    if (error) throw new AppError('Failed to delete grade', 500);
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// POST /grades/comments - avec academicYearId optionnel
router.post('/comments', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      studentId: z.string().uuid(), 
      subjectId: z.string().uuid().optional(),
      classId: z.string().uuid(), 
      academicYearId: z.string().uuid().optional(),
      period: z.enum(['trimester_1', 'trimester_2', 'trimester_3', 'semester_1', 'semester_2', 'annual']),
      comment: z.string().min(1), 
      isPositive: z.boolean().default(true),
    }).parse(req.body);

    const { data: teacher } = await supabaseAdmin.from('teachers').select('id').eq('profile_id', req.user!.id).single();
    const { data, error } = await supabaseAdmin.from('teacher_comments').insert({
      teacher_id: teacher?.id, 
      student_id: body.studentId, 
      subject_id: body.subjectId,
      class_id: body.classId, 
      academic_year_id: body.academicYearId || null,
      period: body.period, 
      comment: body.comment, 
      is_positive: body.isPositive,
    }).select().single();

    if (error) throw new AppError('Failed to save comment', 500);
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

export default router;