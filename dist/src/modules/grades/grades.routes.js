"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const notifications_1 = require("../../utils/notifications");
const PDFDocument = require('pdfkit');
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const gradeSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid(),
    subjectId: zod_1.z.string().uuid(),
    classId: zod_1.z.string().uuid(),
    academicYearId: zod_1.z.string().uuid(),
    period: zod_1.z.enum(['trimester_1', 'trimester_2', 'trimester_3', 'semester_1', 'semester_2', 'annual']),
    score: zod_1.z.number().min(0).max(20),
    maxScore: zod_1.z.number().default(20),
    coefficient: zod_1.z.number().positive().default(1),
    title: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().optional(),
    gradeDate: zod_1.z.string().optional(),
});
router.get('/', async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, pagination_1.getPagination)(req);
        const { studentId, classId, subjectId, period, academicYearId } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('grades')
            .select(`*, subjects(name, code, coefficient), students(student_number, profiles(first_name, last_name)), teachers(profiles(first_name, last_name)), classes(name)`, { count: 'exact' })
            .order('grade_date', { ascending: false })
            .range(offset, offset + limit - 1);
        const role = req.user.role;
        if (role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin.from('students').select('id').eq('profile_id', req.user.id).single();
            if (!student)
                return res.json((0, pagination_1.paginate)([], 0, { page, limit, offset }));
            query = query.eq('student_id', student.id);
        }
        else if (role === 'parent') {
            const { data: parent } = await supabase_1.supabaseAdmin.from('parents').select('id').eq('profile_id', req.user.id).single();
            if (!parent)
                throw new error_middleware_1.AppError('Parent not found', 404);
            const { data: children } = await supabase_1.supabaseAdmin.from('parent_student').select('student_id').eq('parent_id', parent.id);
            const childIds = (children || []).map((c) => c.student_id);
            query = query.in('student_id', childIds);
        }
        else if (role === 'teacher') {
            const { data: teacher } = await supabase_1.supabaseAdmin.from('teachers').select('id').eq('profile_id', req.user.id).single();
            if (!teacher)
                throw new error_middleware_1.AppError('Teacher not found', 404);
            query = query.eq('teacher_id', teacher.id);
        }
        if (studentId)
            query = query.eq('student_id', studentId);
        if (classId)
            query = query.eq('class_id', classId);
        if (subjectId)
            query = query.eq('subject_id', subjectId);
        if (period)
            query = query.eq('period', period);
        if (academicYearId)
            query = query.eq('academic_year_id', academicYearId);
        const { data, count, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch grades', 500);
        return res.json((0, pagination_1.paginate)(data || [], count || 0, { page, limit, offset }));
    }
    catch (err) {
        return next(err);
    }
});
router.post('/', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const body = gradeSchema.parse(req.body);
        let teacherId = body.studentId;
        if (req.user.role === 'teacher') {
            const { data: teacher } = await supabase_1.supabaseAdmin.from('teachers').select('id').eq('profile_id', req.user.id).single();
            if (!teacher)
                throw new error_middleware_1.AppError('Teacher not found', 404);
            teacherId = teacher.id;
        }
        const { data, error } = await supabase_1.supabaseAdmin.from('grades').insert({
            student_id: body.studentId, subject_id: body.subjectId,
            teacher_id: req.user.role === 'teacher' ? teacherId : null,
            class_id: body.classId, academic_year_id: body.academicYearId,
            period: body.period, score: body.score, max_score: body.maxScore,
            coefficient: body.coefficient, title: body.title,
            description: body.description,
            grade_date: body.gradeDate || new Date().toISOString().split('T')[0],
        }).select('*, subjects(name), students(profile_id, profiles(first_name, last_name))').single();
        if (error || !data)
            throw new error_middleware_1.AppError('Failed to create grade', 500);
        const studentProfileId = data.students?.profile_id;
        if (studentProfileId) {
            await (0, notifications_1.createNotification)({ recipientId: studentProfileId, type: 'grade', title: 'Nouvelle note', body: `Vous avez reçu ${body.score}/20 en ${data.subjects?.name} - ${body.title}`, data: { gradeId: data.id, score: body.score } });
            const parentProfileIds = await (0, notifications_1.getStudentParentProfileIds)(body.studentId);
            for (const parentId of parentProfileIds) {
                await (0, notifications_1.createNotification)({ recipientId: parentId, type: 'grade', title: 'Nouvelle note', body: `Note de ${data.students?.profiles?.first_name}: ${body.score}/20 en ${data.subjects?.name}`, data: { gradeId: data.id } });
            }
        }
        return res.status(201).json((0, pagination_1.successResponse)(data, 'Grade created'));
    }
    catch (err) {
        return next(err);
    }
});
router.get('/bulletin', async (req, res, next) => {
    try {
        const { studentId, period, academicYearId } = req.query;
        if (!studentId || !period || !academicYearId)
            throw new error_middleware_1.AppError('studentId, period, and academicYearId are required', 400);
        if (req.user.role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin.from('students').select('id').eq('profile_id', req.user.id).single();
            if (!student || student.id !== studentId)
                throw new error_middleware_1.AppError('Forbidden', 403);
        }
        const { data: grades, error } = await supabase_1.supabaseAdmin.from('grades')
            .select('*, subjects(name, code, coefficient), teachers(profiles(first_name, last_name))')
            .eq('student_id', studentId).eq('period', period)
            .eq('academic_year_id', academicYearId).order('subjects(name)', { ascending: true });
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch bulletin', 500);
        let totalWeightedScore = 0;
        let totalWeight = 0;
        const gradesWithAvg = (grades || []).map((g) => {
            const weight = g.coefficient * (g.subjects?.coefficient || 1);
            totalWeightedScore += g.score * weight;
            totalWeight += weight;
            return g;
        });
        const generalAverage = totalWeight > 0 ? (totalWeightedScore / totalWeight).toFixed(2) : null;
        const { data: comments } = await supabase_1.supabaseAdmin.from('teacher_comments')
            .select('*, subjects(name), teachers(profiles(first_name, last_name))')
            .eq('student_id', studentId).eq('period', period)
            .eq('academic_year_id', academicYearId);
        const { data: studentData } = await supabase_1.supabaseAdmin.from('students').select('class_id').eq('id', studentId).single();
        let rankNumber = null;
        let classSize = 0;
        if (studentData?.class_id) {
            const { data: allStudents } = await supabase_1.supabaseAdmin
                .from('students')
                .select('id')
                .eq('class_id', studentData.class_id);
            if (allStudents && allStudents.length > 0) {
                classSize = allStudents.length;
                const averages = [];
                for (const s of allStudents) {
                    const { data: studentGrades } = await supabase_1.supabaseAdmin
                        .from('grades')
                        .select('score, max_score, coefficient, subjects(coefficient)')
                        .eq('student_id', s.id)
                        .eq('period', period)
                        .eq('academic_year_id', academicYearId);
                    if (studentGrades && studentGrades.length > 0) {
                        let totalW = 0, totalC = 0;
                        for (const g of studentGrades) {
                            const norm = (g.score / (g.max_score || 20)) * 20;
                            const subCoeff = g.subjects?.coefficient || 1;
                            totalW += norm * (g.coefficient || 1) * subCoeff;
                            totalC += (g.coefficient || 1) * subCoeff;
                        }
                        averages.push({ studentId: s.id, avg: totalC > 0 ? totalW / totalC : 0 });
                    }
                    else {
                        averages.push({ studentId: s.id, avg: 0 });
                    }
                }
                averages.sort((a, b) => b.avg - a.avg);
                const rankIndex = averages.findIndex(a => a.studentId === studentId);
                if (rankIndex !== -1)
                    rankNumber = rankIndex + 1;
            }
        }
        const allPeriods = ['trimester_1', 'trimester_2', 'trimester_3'];
        const evolutionData = [];
        for (const p of allPeriods) {
            const { data: pGrades } = await supabase_1.supabaseAdmin
                .from('grades')
                .select('score, max_score, coefficient, subjects(coefficient)')
                .eq('student_id', studentId)
                .eq('period', p)
                .eq('academic_year_id', academicYearId);
            if (!pGrades || pGrades.length === 0) {
                evolutionData.push({ period: p, avg: null });
            }
            else {
                let tw = 0, tc = 0;
                for (const g of pGrades) {
                    const norm = (g.score / (g.max_score || 20)) * 20;
                    const subCoeff = g.subjects?.coefficient || 1;
                    tw += norm * (g.coefficient || 1) * subCoeff;
                    tc += (g.coefficient || 1) * subCoeff;
                }
                evolutionData.push({ period: p, avg: tc > 0 ? parseFloat((tw / tc).toFixed(2)) : null });
            }
        }
        return res.json((0, pagination_1.successResponse)({
            grades: gradesWithAvg,
            comments: comments || [],
            generalAverage,
            rank: rankNumber,
            classSize,
            evolutionData
        }));
    }
    catch (err) {
        return next(err);
    }
});
router.get('/bulletin/pdf', async (req, res, next) => {
    try {
        const { studentId, period } = req.query;
        if (!studentId || !period)
            throw new error_middleware_1.AppError('studentId and period are required', 400);
        // Verify access
        if (req.user.role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin.from('students').select('id').eq('profile_id', req.user.id).single();
            if (!student || student.id !== studentId)
                throw new error_middleware_1.AppError('Forbidden', 403);
        }
        else if (req.user.role === 'parent') {
            const { data: parent } = await supabase_1.supabaseAdmin.from('parents').select('id').eq('profile_id', req.user.id).single();
            if (!parent)
                throw new error_middleware_1.AppError('Forbidden', 403);
            const { data: children } = await supabase_1.supabaseAdmin.from('parent_student').select('student_id').eq('parent_id', parent.id);
            const childIds = (children || []).map((c) => c.student_id);
            if (!childIds.includes(studentId))
                throw new error_middleware_1.AppError('Forbidden', 403);
        }
        // Fetch student info
        const { data: student } = await supabase_1.supabaseAdmin.from('students')
            .select('*, profiles(first_name, last_name, date_of_birth, email), classes(name)')
            .eq('id', studentId).single();
        if (!student)
            throw new error_middleware_1.AppError('Student not found', 404);
        // Fetch grades
        const { data: grades } = await supabase_1.supabaseAdmin.from('grades')
            .select('*, subjects(name, coefficient)')
            .eq('student_id', studentId).eq('period', period)
            .order('created_at', { ascending: true });
        // Group by subject
        const subjectMap = new Map();
        for (const g of (grades || [])) {
            const subId = g.subject_id;
            const subName = g.subjects?.name || 'Matière';
            const subCoeff = g.subjects?.coefficient || 1;
            if (!subjectMap.has(subId))
                subjectMap.set(subId, { name: subName, coefficient: subCoeff, grades: [] });
            subjectMap.get(subId).grades.push(g);
        }
        // Calculate averages
        const subjects = [];
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
        const { data: comments } = await supabase_1.supabaseAdmin.from('teacher_comments')
            .select('*, subjects(name), teachers(profiles(first_name, last_name))')
            .eq('student_id', studentId).eq('period', period);
        // Fetch class ranking and evolution data
        const { data: studentInfo } = await supabase_1.supabaseAdmin
            .from('students').select('class_id, academic_year_id').eq('id', studentId).single();
        let rankNumber = null;
        let classSize = 0;
        let evolutionData = [];
        if (studentInfo?.class_id) {
            const { data: allStudents } = await supabase_1.supabaseAdmin
                .from('students')
                .select('id')
                .eq('class_id', studentInfo.class_id);
            if (allStudents && allStudents.length > 0) {
                classSize = allStudents.length;
                const averages = [];
                for (const s of allStudents) {
                    const { data: studentGrades } = await supabase_1.supabaseAdmin
                        .from('grades')
                        .select('score, max_score, coefficient, subjects(coefficient)')
                        .eq('student_id', s.id)
                        .eq('period', period);
                    if (studentGrades && studentGrades.length > 0) {
                        let tw = 0, tc = 0;
                        for (const g of studentGrades) {
                            const norm = (g.score / (g.max_score || 20)) * 20;
                            const subCoeff = g.subjects?.coefficient || 1;
                            tw += norm * (g.coefficient || 1) * subCoeff;
                            tc += (g.coefficient || 1) * subCoeff;
                        }
                        averages.push({ studentId: s.id, avg: tc > 0 ? tw / tc : 0 });
                    }
                    else {
                        averages.push({ studentId: s.id, avg: 0 });
                    }
                }
                averages.sort((a, b) => b.avg - a.avg);
                const rankIndex = averages.findIndex(a => a.studentId === studentId);
                if (rankIndex !== -1)
                    rankNumber = rankIndex + 1;
            }
            const allPeriods = ['trimester_1', 'trimester_2', 'trimester_3'];
            for (const p of allPeriods) {
                const { data: pGrades } = await supabase_1.supabaseAdmin
                    .from('grades')
                    .select('score, max_score, coefficient, subjects(coefficient)')
                    .eq('student_id', studentId)
                    .eq('period', p);
                if (!pGrades || pGrades.length === 0) {
                    evolutionData.push({ period: p, avg: null });
                }
                else {
                    let tw = 0, tc = 0;
                    for (const g of pGrades) {
                        const norm = (g.score / (g.max_score || 20)) * 20;
                        const subCoeff = g.subjects?.coefficient || 1;
                        tw += norm * (g.coefficient || 1) * subCoeff;
                        tc += (g.coefficient || 1) * subCoeff;
                    }
                    evolutionData.push({ period: p, avg: tc > 0 ? parseFloat((tw / tc).toFixed(2)) : null });
                }
            }
        }
        // Period label
        const periodLabels = {
            trimester_1: '1er Trimestre', trimester_2: '2ème Trimestre', trimester_3: '3ème Trimestre',
            semester_1: '1er Semestre', semester_2: '2ème Semestre', annual: 'Annuel',
        };
        const periodLabel = periodLabels[period] || period;
        // Generate PDF
        const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        const pdfPromise = new Promise((resolve) => {
            doc.on('end', () => resolve(Buffer.concat(chunks)));
        });
        const pageW = doc.page.width - 80;
        const blue = '#1E3A5F';
        const lightBlue = '#4A90D9';
        const gray = '#6B7280';
        const lightGray = '#F3F4F6';
        // Header
        doc.rect(0, 0, doc.page.width, 100).fill(blue);
        doc.fontSize(22).fillColor('white').text('BULLETIN SCOLAIRE', 40, 25, { align: 'center' });
        doc.fontSize(11).text(`${periodLabel} — ${new Date().getFullYear()}/${new Date().getFullYear() + 1}`, 40, 55, { align: 'center' });
        doc.fontSize(9).fillColor('#A8C4E0').text('Établissement — School Management Platform', 40, 72, { align: 'center' });
        doc.moveTo(0, 100).lineTo(doc.page.width, 100).strokeColor('#4A90D9').lineWidth(3).stroke();
        // Student info card
        const infoY = 120;
        doc.roundedRect(40, infoY, pageW, 70, 8).fill(lightGray);
        doc.fillColor(blue).fontSize(12);
        doc.text(`Élève : ${student.profiles?.first_name} ${student.profiles?.last_name}`, 55, infoY + 12);
        doc.fontSize(10).fillColor(gray);
        doc.text(`Classe : ${student.classes?.name || '-'}`, 55, infoY + 32);
        doc.text(`N° : ${student.student_number || '-'}`, 55, infoY + 48);
        const dateNaissance = student.profiles?.date_of_birth
            ? new Date(student.profiles.date_of_birth).toLocaleDateString('fr-FR')
            : '-';
        doc.text(`Né(e) le : ${dateNaissance}`, 300, infoY + 32);
        doc.text(`Période : ${periodLabel}`, 300, infoY + 48);
        // Rank badge
        if (rankNumber !== null) {
            doc.roundedRect(pageW - 60, infoY + 8, 90, 50, 6).fill(blue);
            doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text('RANG', pageW - 52, infoY + 14, { width: 74, align: 'center' });
            doc.fontSize(18).text(`${rankNumber}`, pageW - 52, infoY + 24, { width: 74, align: 'center' });
            doc.fontSize(7).fillColor('#A8C4E0').text(`/ ${classSize} élèves`, pageW - 52, infoY + 46, { width: 74, align: 'center' });
        }
        // Grades table
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
            if (currentY + rowH > doc.page.height - 100) {
                doc.addPage();
                currentY = 60;
            }
            if (i % 2 === 0) {
                doc.rect(40, currentY, pageW, rowH).fill('#F9FAFB');
            }
            doc.fillColor(blue).fontSize(9).font('Helvetica-Bold');
            doc.text(sub.name, colX[0] + 8, currentY + 10, { width: 170 });
            doc.fillColor(gray).fontSize(9).font('Helvetica');
            doc.text(String(sub.coefficient), colX[1] + 12, currentY + 10);
            const avg = sub.average;
            const avgColor = avg >= 14 ? '#059669' : avg >= 10 ? '#D97706' : '#DC2626';
            doc.fillColor(avgColor).fontSize(11).font('Helvetica-Bold');
            doc.text(avg.toFixed(2) + '/20', colX[2] + 4, currentY + 9);
            const subComment = (comments || []).find((c) => c.subjects?.name === sub.name);
            doc.fillColor(gray).fontSize(7).font('Helvetica');
            doc.text(subComment?.comment || '-', colX[3] + 4, currentY + 10, { width: 75 });
            const detail = sub.grades.map((g) => `${g.title}: ${g.score}/${g.max_score || 20}`).join(', ');
            doc.fillColor(gray).fontSize(7);
            doc.text(detail, colX[4] + 4, currentY + 10, { width: pageW - 396 });
            doc.moveTo(40, currentY + rowH).lineTo(40 + pageW, currentY + rowH).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
            currentY += rowH;
        }
        // General average + Rank card
        currentY += 10;
        if (currentY > doc.page.height - 160) {
            doc.addPage();
            currentY = 60;
        }
        doc.roundedRect(40, currentY, pageW * 0.58, 44, 6).fill(blue);
        doc.fillColor('white').fontSize(12).font('Helvetica-Bold');
        doc.text('MOYENNE GÉNÉRALE', 56, currentY + 13);
        const avgColorGeneral = generalAvg >= 14 ? '#4ADE80' : generalAvg >= 10 ? '#FCD34D' : '#F87171';
        doc.fillColor(avgColorGeneral).fontSize(17);
        doc.text(generalAvg.toFixed(2) + ' / 20', 56, currentY + 11, { align: 'right', width: pageW * 0.58 - 32 });
        if (rankNumber !== null) {
            doc.roundedRect(40 + pageW * 0.62, currentY, pageW * 0.38, 44, 6).fill('#1E3A5F');
            doc.fillColor('#A8C4E0').fontSize(8).font('Helvetica-Bold');
            doc.text('CLASSEMENT', 40 + pageW * 0.62 + 8, currentY + 8, { width: pageW * 0.38 - 16, align: 'center' });
            doc.fillColor('white').fontSize(16).font('Helvetica-Bold');
            doc.text(`${rankNumber}e / ${classSize}`, 40 + pageW * 0.62 + 8, currentY + 20, { width: pageW * 0.38 - 16, align: 'center' });
        }
        currentY += 60;
        // Evolution chart
        const chartPoints = evolutionData.filter(d => d.avg !== null);
        if (chartPoints.length > 0) {
            if (currentY > doc.page.height - 160) {
                doc.addPage();
                currentY = 60;
            }
            const chartW = pageW;
            const chartH = 100;
            const chartX = 40;
            doc.roundedRect(chartX, currentY, chartW, chartH + 30, 6).fill(lightGray);
            doc.fillColor(blue).fontSize(9).font('Helvetica-Bold');
            doc.text('ÉVOLUTION DES MOYENNES', chartX + 10, currentY + 8);
            const gridY0 = currentY + 28 + chartH;
            const gridY20 = currentY + 28;
            const gridY10 = (gridY0 + gridY20) / 2;
            doc.moveTo(chartX + 40, gridY20).lineTo(chartX + chartW - 20, gridY20).strokeColor('#D1D5DB').lineWidth(0.5).stroke();
            doc.moveTo(chartX + 40, gridY10).lineTo(chartX + chartW - 20, gridY10).strokeColor('#D1D5DB').lineWidth(0.5).stroke();
            doc.moveTo(chartX + 40, gridY0).lineTo(chartX + chartW - 20, gridY0).strokeColor('#D1D5DB').lineWidth(0.5).stroke();
            doc.fillColor(gray).fontSize(7).font('Helvetica');
            doc.text('20', chartX + 24, gridY20 - 4);
            doc.text('10', chartX + 24, gridY10 - 4);
            doc.text('0', chartX + 28, gridY0 - 4);
            const periods = ['trimester_1', 'trimester_2', 'trimester_3'];
            const periodShortLabels = { trimester_1: 'T1', trimester_2: 'T2', trimester_3: 'T3' };
            const slotW = (chartW - 60) / 3;
            const pointCoords = [];
            for (let i = 0; i < periods.length; i++) {
                const pd = evolutionData.find(d => d.period === periods[i]);
                if (pd && pd.avg !== null) {
                    const px = chartX + 40 + slotW * i + slotW / 2;
                    const py = gridY0 - ((pd.avg / 20) * chartH);
                    pointCoords.push({ x: px, y: py, avg: pd.avg, period: periods[i] });
                }
                doc.fillColor(gray).fontSize(7).font('Helvetica');
                doc.text(periodShortLabels[periods[i]], chartX + 40 + slotW * i + slotW / 2 - 6, gridY0 + 4);
            }
            for (let i = 0; i < pointCoords.length - 1; i++) {
                doc.moveTo(pointCoords[i].x, pointCoords[i].y)
                    .lineTo(pointCoords[i + 1].x, pointCoords[i + 1].y)
                    .strokeColor(lightBlue).lineWidth(2).stroke();
            }
            for (const pt of pointCoords) {
                const ptColor = pt.avg >= 14 ? '#059669' : pt.avg >= 10 ? '#D97706' : '#DC2626';
                doc.circle(pt.x, pt.y, 5).fill(ptColor);
                doc.fillColor(ptColor).fontSize(8).font('Helvetica-Bold');
                doc.text(pt.avg.toFixed(1), pt.x - 12, pt.y - 14, { width: 24, align: 'center' });
            }
            const currentPt = pointCoords.find(p => p.period === period);
            if (currentPt) {
                doc.circle(currentPt.x, currentPt.y, 8).strokeColor(blue).lineWidth(1.5).stroke();
            }
            currentY += chartH + 40;
        }
        // Teacher comments
        currentY += 10;
        if (currentY > doc.page.height - 80) {
            doc.addPage();
            currentY = 60;
        }
        const subjectComments = (comments || []).filter((c) => c.subject_id);
        const generalComments = (comments || []).filter((c) => !c.subject_id);
        const allComments = [...subjectComments, ...generalComments];
        if (allComments.length > 0) {
            doc.fillColor(blue).fontSize(11).font('Helvetica-Bold');
            doc.text('Appréciations des enseignants', 40, currentY);
            currentY += 18;
            for (const c of allComments) {
                if (currentY > doc.page.height - 60) {
                    doc.addPage();
                    currentY = 60;
                }
                const teacherName = c.teachers?.profiles
                    ? `${c.teachers.profiles.first_name} ${c.teachers.profiles.last_name}`
                    : 'Enseignant';
                const subjectName = c.subjects?.name || 'Général';
                const isPositive = c.is_positive !== false;
                const accentColor = isPositive ? '#059669' : '#D97706';
                doc.roundedRect(40, currentY, pageW, 36, 4).fill(lightGray);
                doc.rect(40, currentY, 4, 36).fill(accentColor);
                doc.fillColor(blue).fontSize(8).font('Helvetica-Bold');
                doc.text(`${teacherName} — ${subjectName}`, 52, currentY + 6, { width: pageW - 20 });
                doc.fillColor(gray).fontSize(8).font('Helvetica');
                doc.text(c.comment, 52, currentY + 19, { width: pageW - 24 });
                currentY += 42;
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
        const fileName = `bulletin_${student.profiles?.last_name}_${periodLabel.replace(/ /g, '_')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.send(pdfBuffer);
    }
    catch (err) {
        return next(err);
    }
});
router.patch('/:id', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const updates = zod_1.z.object({ score: zod_1.z.number().min(0).max(20).optional(), title: zod_1.z.string().optional(), description: zod_1.z.string().optional() }).parse(req.body);
        const updateData = {};
        if (updates.score !== undefined)
            updateData.score = updates.score;
        if (updates.title)
            updateData.title = updates.title;
        if (updates.description !== undefined)
            updateData.description = updates.description;
        const { data, error } = await supabase_1.supabaseAdmin.from('grades').update(updateData).eq('id', req.params.id).select().single();
        if (error || !data)
            throw new error_middleware_1.AppError('Grade not found or update failed', 404);
        return res.json((0, pagination_1.successResponse)(data, 'Grade updated'));
    }
    catch (err) {
        return next(err);
    }
});
router.delete('/:id', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { error } = await supabase_1.supabaseAdmin.from('grades').delete().eq('id', req.params.id);
        if (error)
            throw new error_middleware_1.AppError('Failed to delete grade', 500);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
router.post('/comments', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const body = zod_1.z.object({
            studentId: zod_1.z.string().uuid(), subjectId: zod_1.z.string().uuid().optional(),
            classId: zod_1.z.string().uuid(), academicYearId: zod_1.z.string().uuid(),
            period: zod_1.z.enum(['trimester_1', 'trimester_2', 'trimester_3', 'semester_1', 'semester_2', 'annual']),
            comment: zod_1.z.string().min(1), isPositive: zod_1.z.boolean().default(true),
        }).parse(req.body);
        const { data: teacher } = await supabase_1.supabaseAdmin.from('teachers').select('id').eq('profile_id', req.user.id).single();
        const { data, error } = await supabase_1.supabaseAdmin.from('teacher_comments').insert({
            teacher_id: teacher?.id, student_id: body.studentId, subject_id: body.subjectId,
            class_id: body.classId, academic_year_id: body.academicYearId,
            period: body.period, comment: body.comment, is_positive: body.isPositive,
        }).select().single();
        if (error)
            throw new error_middleware_1.AppError('Failed to save comment', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=grades.routes.js.map