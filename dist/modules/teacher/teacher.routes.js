"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const supabase_1 = require("../../config/supabase");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.authorize)('teacher', 'admin'));
// Helper pour extraire les données correctement
function extractFirstItem(data) {
    if (!data)
        return null;
    if (Array.isArray(data) && data.length > 0)
        return data[0];
    return data;
}
// GET /teacher/classes - Récupérer les classes de l'enseignant
router.get('/classes', async (req, res, next) => {
    try {
        const { data: teacher } = await supabase_1.supabaseAdmin
            .from('teachers')
            .select('id')
            .eq('profile_id', req.user.id)
            .single();
        if (!teacher) {
            throw new error_middleware_1.AppError('Teacher not found', 404);
        }
        const { data: slots, error } = await supabase_1.supabaseAdmin
            .from('schedule_slots')
            .select(`
        class_id,
        subject_id,
        classes:class_id(id, name),
        subjects:subject_id(id, name)
      `)
            .eq('teacher_id', teacher.id)
            .eq('is_active', true);
        if (error) {
            throw new error_middleware_1.AppError('Failed to fetch teacher classes', 500);
        }
        const classMap = new Map();
        for (const slot of slots || []) {
            const key = `${slot.class_id}_${slot.subject_id}`;
            if (!classMap.has(key)) {
                // Extraire correctement les données
                const classItem = extractFirstItem(slot.classes);
                const subjectItem = extractFirstItem(slot.subjects);
                classMap.set(key, {
                    classId: slot.class_id,
                    className: classItem?.name || `Classe ${slot.class_id}`,
                    subjectId: slot.subject_id,
                    subjectName: subjectItem?.name || 'Matière',
                });
            }
        }
        res.json((0, pagination_1.successResponse)(Array.from(classMap.values())));
    }
    catch (err) {
        next(err);
    }
});
// GET /teacher/students/:classId - Récupérer les élèves d'une classe
router.get('/students/:classId', async (req, res, next) => {
    try {
        const { classId } = req.params;
        const { data: students, error } = await supabase_1.supabaseAdmin
            .from('students')
            .select(`
        id,
        profile_id,
        student_number,
        users:profile_id(first_name, last_name, email)
      `)
            .eq('class_id', classId);
        if (error) {
            throw new error_middleware_1.AppError('Failed to fetch students', 500);
        }
        // Formater les étudiants
        const formattedStudents = (students || []).map((student) => ({
            id: student.id,
            profile_id: student.profile_id,
            student_number: student.student_number,
            users: extractFirstItem(student.users)
        }));
        res.json((0, pagination_1.successResponse)(formattedStudents || []));
    }
    catch (err) {
        next(err);
    }
});
// GET /teacher/schedule - Emploi du temps de l'enseignant
router.get('/schedule', async (req, res, next) => {
    try {
        const { data: teacher } = await supabase_1.supabaseAdmin
            .from('teachers')
            .select('id')
            .eq('profile_id', req.user.id)
            .single();
        if (!teacher) {
            throw new error_middleware_1.AppError('Teacher not found', 404);
        }
        const { data: slots, error } = await supabase_1.supabaseAdmin
            .from('schedule_slots')
            .select(`
        *,
        subjects:subject_id(name, color),
        classes:class_id(name)
      `)
            .eq('teacher_id', teacher.id)
            .eq('is_active', true)
            .order('day_of_week')
            .order('start_time');
        if (error) {
            throw new error_middleware_1.AppError('Failed to fetch schedule', 500);
        }
        // Formater les créneaux
        const formattedSlots = (slots || []).map((slot) => ({
            ...slot,
            subjects: extractFirstItem(slot.subjects),
            classes: extractFirstItem(slot.classes)
        }));
        res.json((0, pagination_1.successResponse)(formattedSlots || []));
    }
    catch (err) {
        next(err);
    }
});
// GET /teacher/stats - Statistiques de l'enseignant
router.get('/stats', async (req, res, next) => {
    try {
        const { data: teacher } = await supabase_1.supabaseAdmin
            .from('teachers')
            .select('id')
            .eq('profile_id', req.user.id)
            .single();
        if (!teacher) {
            throw new error_middleware_1.AppError('Teacher not found', 404);
        }
        const [classesRes, assignmentsRes] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('schedule_slots')
                .select('class_id', { count: 'exact', head: true })
                .eq('teacher_id', teacher.id)
                .eq('is_active', true),
            supabase_1.supabaseAdmin
                .from('assignments')
                .select('id', { count: 'exact', head: true })
                .eq('teacher_id', teacher.id)
        ]);
        res.json((0, pagination_1.successResponse)({
            totalClasses: classesRes.count || 0,
            totalAssignments: assignmentsRes.count || 0,
        }));
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=teacher.routes.js.map