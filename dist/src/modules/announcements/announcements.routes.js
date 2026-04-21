"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
function extractFirstItem(data) {
    if (!data)
        return null;
    if (Array.isArray(data) && data.length > 0)
        return data[0];
    return data;
}
// Helper pour les requêtes Supabase
async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
    });
    const data = await res.json();
    return { data: Array.isArray(data) ? data : [], ok: res.ok };
}
async function sbPost(table, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    return { data: Array.isArray(data) ? data : [data], ok: res.ok };
}
async function sbPatch(table, id, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    return { data: Array.isArray(data) ? data : [data], ok: res.ok };
}
async function sbDelete(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
    });
    return { ok: res.ok };
}
router.use(auth_middleware_1.authenticate);
// Schéma de validation
const announcementSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid().optional().nullable(),
    title: zod_1.z.string().min(1).max(255),
    content: zod_1.z.string().min(1),
    isPinned: zod_1.z.boolean().default(false),
    expiresAt: zod_1.z.string().optional().nullable(),
    scheduledAt: zod_1.z.string().optional().nullable(),
});
// =============================================================================
// GET /announcements - Annonces actives (visibles maintenant)
// =============================================================================
router.get('/', async (req, res, next) => {
    try {
        const now = new Date();
        const { data: allData } = await sbGet(`announcements?select=*,profiles:author_id(first_name,last_name)&order=created_at.desc`);
        let arr = Array.isArray(allData) ? allData : [];
        // Filtrer par rôle
        if (req.user.role === 'student') {
            const userClassId = req.user.class_id;
            if (userClassId) {
                arr = arr.filter((a) => !a.class_id || a.class_id === userClassId);
            }
            else {
                arr = arr.filter((a) => !a.class_id);
            }
        }
        else if (req.user.role === 'teacher') {
            arr = arr.filter((a) => !a.author_id || a.author_id === req.user.id || !a.class_id);
        }
        else if (req.user.role === 'parent') {
            const { data: children } = await sbGet(`parent_student?parent_id=eq.${req.user.id}&select=students(class_id)`);
            const classIds = (children || []).map((c) => c.students?.class_id).filter(Boolean);
            const uniqueClassIds = [...new Set(classIds)];
            arr = arr.filter((a) => !a.class_id || uniqueClassIds.includes(a.class_id));
        }
        // Filtrer par expiration
        arr = arr.filter((a) => !a.expires_at || new Date(a.expires_at) > now);
        // Filtrer par publication différée (visible seulement si scheduled_at <= now)
        arr = arr.filter((a) => !a.scheduled_at || new Date(a.scheduled_at) <= now);
        // Trier : épinglés en premier, puis par date de publication
        arr.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned)
                return -1;
            if (!a.is_pinned && b.is_pinned)
                return 1;
            return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
        });
        return res.json((0, pagination_1.successResponse)(arr));
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// GET /announcements/history - Historique (annonces expirées + futures)
// =============================================================================
router.get('/history', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const now = new Date();
        const { data: allData } = await sbGet(`announcements?select=*,profiles:author_id(first_name,last_name)&order=created_at.desc`);
        let arr = Array.isArray(allData) ? allData : [];
        // Filtrer par auteur pour teacher
        if (req.user.role === 'teacher') {
            arr = arr.filter((a) => a.author_id === req.user.id);
        }
        // Catégoriser
        const history = arr.map((a) => ({
            ...a,
            _status: a.scheduled_at && new Date(a.scheduled_at) > now
                ? 'scheduled' // publication future
                : a.expires_at && new Date(a.expires_at) <= now
                    ? 'expired' // expirée
                    : 'active', // active
        }));
        return res.json((0, pagination_1.successResponse)(history));
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// POST /announcements - Créer une annonce
// =============================================================================
router.post('/', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const body = announcementSchema.parse(req.body);
        const now = new Date().toISOString();
        const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt).toISOString() : null;
        const { data, ok } = await sbPost('announcements', {
            author_id: req.user.id,
            class_id: body.classId || null,
            title: body.title,
            content: body.content,
            is_pinned: body.isPinned,
            expires_at: body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
            scheduled_at: scheduledAt,
            published_at: scheduledAt || now, // si différée, published_at = scheduled_at
            created_at: now,
            updated_at: now,
        });
        if (!ok)
            throw new error_middleware_1.AppError('Failed to create announcement', 500);
        // Envoyer des notifications si publication immédiate
        if (!scheduledAt && body.classId) {
            const { data: students } = await sbGet(`students?class_id=eq.${body.classId}&select=profile_id`);
            const profileIds = (students || []).map((s) => s.profile_id).filter(Boolean);
            for (const profileId of profileIds) {
                await sbPost('notifications', {
                    recipient_id: profileId,
                    type: 'announcement',
                    title: `Nouvelle annonce : ${body.title}`,
                    body: body.content.substring(0, 100),
                    data: { announcementId: data[0]?.id },
                    created_at: new Date().toISOString(),
                });
            }
        }
        return res.status(201).json((0, pagination_1.successResponse)(data?.[0], 'Annonce créée avec succès'));
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// PATCH /announcements/:id - Modifier une annonce
// =============================================================================
router.patch('/:id', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const mapped = {};
        if (updates.title !== undefined)
            mapped.title = updates.title;
        if (updates.content !== undefined)
            mapped.content = updates.content;
        if (updates.classId !== undefined)
            mapped.class_id = updates.classId;
        if (updates.isPinned !== undefined)
            mapped.is_pinned = updates.isPinned;
        if (updates.expiresAt !== undefined)
            mapped.expires_at = updates.expiresAt ? new Date(updates.expiresAt).toISOString() : null;
        if (updates.scheduledAt !== undefined)
            mapped.scheduled_at = updates.scheduledAt ? new Date(updates.scheduledAt).toISOString() : null;
        mapped.updated_at = new Date().toISOString();
        const { data, ok } = await sbPatch('announcements', id, mapped);
        if (!ok)
            throw new error_middleware_1.AppError('Failed to update announcement', 500);
        return res.json((0, pagination_1.successResponse)(data?.[0], 'Annonce modifiée'));
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// DELETE /announcements/:id - Supprimer une annonce
// =============================================================================
router.delete('/:id', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { ok } = await sbDelete('announcements', id);
        if (!ok)
            throw new error_middleware_1.AppError('Failed to delete announcement', 500);
        return res.json((0, pagination_1.successResponse)(null, 'Annonce supprimée'));
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=announcements.routes.js.map