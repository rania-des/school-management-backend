"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// ─── Secret pour signer les tokens QR ────────────────────────────────────────
// Ajoutez QR_JWT_SECRET dans votre .env  (ex: QR_JWT_SECRET=un_secret_solide_ici)
const QR_SECRET = process.env.QR_JWT_SECRET || 'qr_fallback_secret_change_me';
const attendanceSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid(),
    classId: zod_1.z.string().uuid(),
    scheduleSlotId: zod_1.z.string().uuid().optional(),
    date: zod_1.z.string(),
    status: zod_1.z.enum(['present', 'absent', 'late']),
    reason: zod_1.z.string().optional(),
});
// ============================================
// ROUTES POUR ENSEIGNANTS
// ============================================
// GET /attendance/teacher/classes - Récupérer les classes de l'enseignant
router.get('/teacher/classes', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { data: teacher } = await supabase_1.supabaseAdmin
            .from('teachers')
            .select('id')
            .eq('profile_id', req.user.id)
            .single();
        if (!teacher)
            throw new error_middleware_1.AppError('Teacher not found', 404);
        const { data: slots, error } = await supabase_1.supabaseAdmin
            .from('schedule_slots')
            .select('*, classes(id, name), subjects(id, name)')
            .eq('teacher_id', teacher.id)
            .eq('is_active', true);
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch teacher classes', 500);
        const classMap = new Map();
        for (const slot of slots || []) {
            const key = `${slot.class_id}_${slot.subject_id}`;
            if (!classMap.has(key)) {
                classMap.set(key, {
                    classId: slot.class_id,
                    className: slot.classes?.name || `Classe ${slot.class_id}`,
                    subjectId: slot.subject_id,
                    subjectName: slot.subjects?.name || 'Matière',
                    slots: [],
                });
            }
            classMap.get(key).slots.push({
                day: slot.day_of_week,
                start: slot.start_time,
                end: slot.end_time,
                room: slot.room,
            });
        }
        return res.json((0, pagination_1.successResponse)(Array.from(classMap.values())));
    }
    catch (err) {
        return next(err);
    }
});
// GET /attendance/students/:classId - Récupérer les élèves d'une classe
router.get('/students/:classId', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { classId } = req.params;
        const { data: students, error } = await supabase_1.supabaseAdmin
            .from('students')
            .select(`
        id,
        profile_id,
        student_number,
        profiles:profile_id(first_name, last_name, email)
      `)
            .eq('class_id', classId);
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch students', 500);
        return res.json((0, pagination_1.successResponse)(students || []));
    }
    catch (err) {
        return next(err);
    }
});
// ============================================
// 🆕  QR CODE — GESTION DE PRÉSENCE
// ============================================
/**
 * POST /attendance/qr-session
 * Enseignant : génère un token JWT signé valable 5 min.
 * Body: { classId, subjectId, date }
 * Retourne: { token, qrPayload, expiresAt }
 */
router.post('/qr-session', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { classId, subjectId, date } = zod_1.z
            .object({
            classId: zod_1.z.string().uuid(),
            subjectId: zod_1.z.string().uuid().optional(),
            date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
        })
            .parse(req.body);
        // Récupérer l'id enseignant
        const { data: teacher } = await supabase_1.supabaseAdmin
            .from('teachers')
            .select('id')
            .eq('profile_id', req.user.id)
            .single();
        if (!teacher)
            throw new error_middleware_1.AppError('Teacher not found', 404);
        const expiresIn = 5 * 60; // 5 minutes en secondes
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        // Payload signé
        const payload = {
            type: 'qr_attendance',
            classId,
            subjectId: subjectId ?? null,
            teacherId: teacher.id,
            date,
            iat: Math.floor(Date.now() / 1000),
        };
        const token = jsonwebtoken_1.default.sign(payload, QR_SECRET, { expiresIn });
        return res.status(201).json((0, pagination_1.successResponse)({ token, expiresAt }, 'QR session créée — valide 5 minutes'));
    }
    catch (err) {
        return next(err);
    }
});
/**
 * POST /attendance/scan
 * Élève : valide le token QR et enregistre sa présence.
 * Body: { token }
 * Retourne: { attendance record }
 */
router.post('/scan', (0, auth_middleware_1.authorize)('student'), async (req, res, next) => {
    try {
        const { token } = zod_1.z
            .object({ token: zod_1.z.string().min(10, 'Token invalide') })
            .parse(req.body);
        // Vérifier et décoder le token QR
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, QR_SECRET);
        }
        catch (e) {
            if (e.name === 'TokenExpiredError') {
                throw new error_middleware_1.AppError('QR code expiré. Demandez à l\'enseignant d\'en générer un nouveau.', 410);
            }
            throw new error_middleware_1.AppError('QR code invalide.', 400);
        }
        if (decoded.type !== 'qr_attendance') {
            throw new error_middleware_1.AppError('QR code invalide.', 400);
        }
        const { classId, teacherId, date } = decoded;
        // Récupérer l'id étudiant
        const { data: student } = await supabase_1.supabaseAdmin
            .from('students')
            .select('id, class_id')
            .eq('profile_id', req.user.id)
            .single();
        if (!student)
            throw new error_middleware_1.AppError('Élève introuvable', 404);
        // Vérifier que l'élève appartient bien à la classe
        if (student.class_id !== classId) {
            throw new error_middleware_1.AppError('Vous n\'appartenez pas à cette classe.', 403);
        }
        // Upsert présence (évite les doublons) - Version manuelle sans onConflict
        // Vérifier si une entrée existe déjà
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('attendance')
            .select('id')
            .eq('student_id', student.id)
            .eq('class_id', classId)
            .eq('date', date)
            .maybeSingle();
        let data;
        let error;
        if (existing) {
            // Mettre à jour
            const res = await supabase_1.supabaseAdmin
                .from('attendance')
                .update({ status: 'present', reason: 'QR scan', updated_at: new Date().toISOString() })
                .eq('id', existing.id)
                .select()
                .single();
            data = res.data;
            error = res.error;
        }
        else {
            // Insérer
            const record = {
                student_id: student.id,
                class_id: classId,
                teacher_id: teacherId,
                date,
                status: 'present',
                reason: 'QR scan',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const res = await supabase_1.supabaseAdmin
                .from('attendance')
                .insert(record)
                .select()
                .single();
            data = res.data;
            error = res.error;
        }
        if (error) {
            console.error('QR SCAN ERROR:', error);
            throw new error_middleware_1.AppError('Erreur lors de l\'enregistrement de la présence.', 500);
        }
        return res.status(201).json((0, pagination_1.successResponse)(data, 'Présence enregistrée ✅'));
    }
    catch (err) {
        return next(err);
    }
});
// ============================================
// ROUTES GÉNÉRALES
// ============================================
// GET /attendance - Liste des présences avec filtres
router.get('/', async (req, res, next) => {
    try {
        const { classId, studentId, date, startDate, endDate, limit = 100 } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('attendance')
            .select('*, students(id, student_number, profile_id, profiles(first_name, last_name)), classes(*), teachers(*)')
            .order('date', { ascending: false })
            .limit(Number(limit));
        if (classId)
            query = query.eq('class_id', classId);
        if (studentId)
            query = query.eq('student_id', studentId);
        if (date)
            query = query.eq('date', date);
        if (startDate)
            query = query.gte('date', startDate);
        if (endDate)
            query = query.lte('date', endDate);
        // Filtrer par rôle
        if (req.user.role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin
                .from('students')
                .select('id')
                .eq('profile_id', req.user.id)
                .single();
            if (student)
                query = query.eq('student_id', student.id);
        }
        else if (req.user.role === 'parent') {
            const { data: parent } = await supabase_1.supabaseAdmin
                .from('parents')
                .select('id')
                .eq('profile_id', req.user.id)
                .single();
            if (parent) {
                const { data: children } = await supabase_1.supabaseAdmin
                    .from('parent_student')
                    .select('student_id')
                    .eq('parent_id', parent.id);
                const childIds = (children || []).map((c) => c.student_id);
                if (childIds.length > 0)
                    query = query.in('student_id', childIds);
            }
        }
        const { data, error } = await query;
        if (error) {
            console.error('ATTENDANCE ERROR:', JSON.stringify(error, null, 2));
            throw new error_middleware_1.AppError(`Failed to fetch attendance: ${error.message}`, 500);
        }
        return res.json((0, pagination_1.successResponse)(data || []));
    }
    catch (err) {
        return next(err);
    }
});
// POST /attendance/bulk - Enregistrement multiple des présences
router.post('/bulk', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { attendances } = zod_1.z.object({
            attendances: zod_1.z.array(attendanceSchema),
        }).parse(req.body);
        const { data: teacher } = await supabase_1.supabaseAdmin
            .from('teachers')
            .select('id')
            .eq('profile_id', req.user.id)
            .single();
        const records = attendances.map((a) => ({
            student_id: a.studentId,
            class_id: a.classId,
            schedule_slot_id: a.scheduleSlotId || null,
            teacher_id: teacher?.id || null,
            date: a.date,
            status: a.status,
            reason: a.reason || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }));
        const { data, error } = await supabase_1.supabaseAdmin
            .from('attendance')
            .upsert(records, { onConflict: 'student_id,class_id,date' })
            .select();
        if (error) {
            console.error('ATTENDANCE UPSERT ERROR:', JSON.stringify(error, null, 2));
            throw new error_middleware_1.AppError(`Failed to save attendance: ${error.message}`, 500);
        }
        return res.status(201).json((0, pagination_1.successResponse)(data, `${data?.length} attendance records saved`));
    }
    catch (err) {
        return next(err);
    }
});
// GET /attendance/stats/:studentId - Statistiques d'absence pour un élève
router.get('/stats/:studentId', (0, auth_middleware_1.authorize)('teacher', 'admin', 'parent'), async (req, res, next) => {
    try {
        const { studentId } = req.params;
        const { period } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('attendance')
            .select('status, date')
            .eq('student_id', studentId);
        if (period) {
            const startDate = new Date();
            if (period === 'week')
                startDate.setDate(startDate.getDate() - 7);
            else if (period === 'month')
                startDate.setMonth(startDate.getMonth() - 1);
            else if (period === 'year')
                startDate.setFullYear(startDate.getFullYear() - 1);
            query = query.gte('date', startDate.toISOString().split('T')[0]);
        }
        const { data, error } = await query;
        if (error) {
            console.error('ATTENDANCE STATS ERROR:', JSON.stringify(error, null, 2));
            throw new error_middleware_1.AppError('Failed to fetch attendance stats', 500);
        }
        const stats = {
            present: (data || []).filter((a) => a.status === 'present').length,
            absent: (data || []).filter((a) => a.status === 'absent').length,
            late: (data || []).filter((a) => a.status === 'late').length,
            total: (data || []).length,
        };
        return res.json((0, pagination_1.successResponse)(stats));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /attendance/:id - Supprimer une entrée de présence
router.delete('/:id', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error } = await supabase_1.supabaseAdmin
            .from('attendance')
            .delete()
            .eq('id', id);
        if (error) {
            console.error('ATTENDANCE DELETE ERROR:', JSON.stringify(error, null, 2));
            throw new error_middleware_1.AppError('Failed to delete attendance record', 500);
        }
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=attendance.routes.js.map