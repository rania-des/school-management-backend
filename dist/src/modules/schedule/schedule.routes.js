"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const H = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
};
async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
    return { data: await res.json(), ok: res.ok };
}
async function sbPost(path, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
}
async function sbPatch(path, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'PATCH',
        headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
}
const slotSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid(),
    subjectId: zod_1.z.string().uuid(),
    teacherId: zod_1.z.string().uuid().optional().nullable(),
    academicYearId: zod_1.z.string().uuid(),
    dayOfWeek: zod_1.z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
    startTime: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
    endTime: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
    room: zod_1.z.string().optional().nullable(),
});
// GET /schedule
router.get('/', async (req, res, next) => {
    try {
        let classId = req.query.classId;
        const { academicYearId } = req.query;
        if (!classId) {
            if (req.user.role === 'student') {
                const { data } = await sbGet(`students?profile_id=eq.${req.user.id}&select=class_id`);
                classId = Array.isArray(data) ? data[0]?.class_id : null;
            }
            else if (req.user.role === 'parent') {
                const { data: parents } = await sbGet(`parents?profile_id=eq.${req.user.id}&select=id`);
                const parentId = Array.isArray(parents) ? parents[0]?.id : null;
                if (parentId) {
                    const { data: links } = await sbGet(`parent_student?parent_id=eq.${parentId}&select=student_id&limit=1`);
                    const sid = Array.isArray(links) ? links[0]?.student_id : null;
                    if (sid) {
                        const { data: st } = await sbGet(`students?id=eq.${sid}&select=class_id`);
                        classId = Array.isArray(st) ? st[0]?.class_id : null;
                    }
                }
            }
        }
        if (!classId)
            throw new error_middleware_1.AppError('classId is required', 400);
        // Table : schedule_slots (confirmé dans la liste des tables)
        let url = `schedule_slots?select=*&class_id=eq.${classId}&is_active=eq.true&order=day_of_week,start_time`;
        if (academicYearId)
            url += `&academic_year_id=eq.${academicYearId}`;
        const { data } = await sbGet(url);
        const arr = Array.isArray(data) ? data : [];
        // Enrichir avec subjects et classes séparément
        const subjectIds = [...new Set(arr.map((s) => s.subject_id).filter(Boolean))];
        const teacherIds = [...new Set(arr.map((s) => s.teacher_id).filter(Boolean))];
        let subjectsMap = {};
        let teachersMap = {};
        if (subjectIds.length > 0) {
            const { data: subs } = await sbGet(`subjects?id=in.(${subjectIds.join(',')})&select=id,name,code,color`);
            (Array.isArray(subs) ? subs : []).forEach((s) => { subjectsMap[s.id] = s; });
        }
        if (teacherIds.length > 0) {
            // teachers → profile_id → profiles
            const { data: teachs } = await sbGet(`teachers?id=in.(${teacherIds.join(',')})&select=id,profile_id`);
            const profileIds = (Array.isArray(teachs) ? teachs : []).map((t) => t.profile_id).filter(Boolean);
            if (profileIds.length > 0) {
                const { data: profs } = await sbGet(`profiles?id=in.(${profileIds.join(',')})&select=id,first_name,last_name`);
                const profsMap = {};
                (Array.isArray(profs) ? profs : []).forEach((p) => { profsMap[p.id] = p; });
                (Array.isArray(teachs) ? teachs : []).forEach((t) => {
                    teachersMap[t.id] = { ...t, profile: profsMap[t.profile_id] || null };
                });
            }
        }
        const enriched = arr.map((slot) => ({
            ...slot,
            subject: subjectsMap[slot.subject_id] || null,
            teacher: teachersMap[slot.teacher_id] || null,
        }));
        const grouped = {};
        enriched.forEach((slot) => {
            if (!grouped[slot.day_of_week])
                grouped[slot.day_of_week] = [];
            grouped[slot.day_of_week].push(slot);
        });
        return res.json((0, pagination_1.successResponse)({ schedule: grouped, slots: enriched }));
    }
    catch (err) {
        return next(err);
    }
});
// GET /schedule/teacher
router.get('/teacher', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { academicYearId } = req.query;
        let teacherId;
        if (req.user.role === 'teacher') {
            const { data } = await sbGet(`teachers?profile_id=eq.${req.user.id}&select=id`);
            const t = Array.isArray(data) ? data[0] : null;
            if (!t)
                throw new error_middleware_1.AppError('Teacher not found', 404);
            teacherId = t.id;
        }
        else {
            teacherId = req.query.teacherId;
            if (!teacherId)
                throw new error_middleware_1.AppError('teacherId required', 400);
        }
        let url = `schedule_slots?select=*&teacher_id=eq.${teacherId}&is_active=eq.true&order=day_of_week,start_time`;
        if (academicYearId)
            url += `&academic_year_id=eq.${academicYearId}`;
        const { data } = await sbGet(url);
        return res.json((0, pagination_1.successResponse)(Array.isArray(data) ? data : []));
    }
    catch (err) {
        return next(err);
    }
});
// POST /schedule
router.post('/', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const body = slotSchema.parse(req.body);
        let finalTeacherId = null;
        if (body.teacherId) {
            const { data: td } = await sbGet(`teachers?id=eq.${body.teacherId}&select=id`);
            if (Array.isArray(td) && td[0]) {
                finalTeacherId = td[0].id;
            }
            else {
                const { data: tp } = await sbGet(`teachers?profile_id=eq.${body.teacherId}&select=id`);
                if (Array.isArray(tp) && tp[0])
                    finalTeacherId = tp[0].id;
            }
        }
        // Conflict check
        const { data: existing } = await sbGet(`schedule_slots?class_id=eq.${body.classId}&day_of_week=eq.${body.dayOfWeek}&is_active=eq.true&start_time=lt.${body.endTime}&end_time=gt.${body.startTime}&select=id`);
        if (Array.isArray(existing) && existing.length > 0) {
            throw new error_middleware_1.AppError('Schedule conflict detected for this class', 409);
        }
        const { data, ok } = await sbPost('schedule_slots', {
            class_id: body.classId,
            subject_id: body.subjectId,
            teacher_id: finalTeacherId,
            academic_year_id: body.academicYearId,
            day_of_week: body.dayOfWeek,
            start_time: body.startTime,
            end_time: body.endTime,
            room: body.room || null,
        });
        if (!ok)
            throw new error_middleware_1.AppError('Failed to create schedule slot', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /schedule/:id
router.delete('/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        await sbPatch(`schedule_slots?id=eq.${req.params.id}`, { is_active: false });
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=schedule.routes.js.map