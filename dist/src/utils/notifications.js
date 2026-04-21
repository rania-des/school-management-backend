"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.getStudentParentProfileIds = exports.getClassAllProfileIds = exports.getClassStudentProfileIds = exports.createBulkNotifications = exports.createNotification = void 0;
const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const HEADERS = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
const createNotification = async (params) => {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({
                user_id: params.recipientId,
                type: params.type,
                title: params.title,
                body: params.body || '',
                data: params.data || {},
                is_read: false,
                created_at: new Date().toISOString(),
            })
        });
        return { success: true };
    }
    catch (error) {
        console.error('Notification error:', error);
        return null;
    }
};
exports.createNotification = createNotification;
const createBulkNotifications = async (recipientIds, params) => {
    if (!recipientIds.length)
        return { success: true, count: 0 };
    try {
        const notifications = recipientIds.map((id) => ({
            user_id: id,
            type: params.type,
            title: params.title,
            body: params.body || '',
            data: params.data || {},
            is_read: false,
            created_at: new Date().toISOString(),
        }));
        await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(notifications)
        });
        return { success: true, count: recipientIds.length };
    }
    catch (error) {
        console.error('Bulk notification error:', error);
        return { success: false, error, count: 0 };
    }
};
exports.createBulkNotifications = createBulkNotifications;
const getClassStudentProfileIds = async (classId) => {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${classId}&select=profile_id`, { headers: HEADERS });
        const data = await res.json();
        return (data || []).map((s) => s.profile_id).filter(Boolean);
    }
    catch (error) {
        console.error('Error getting class student profile IDs:', error);
        return [];
    }
};
exports.getClassStudentProfileIds = getClassStudentProfileIds;
const getClassAllProfileIds = async (classId) => {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${classId}&select=profile_id`, { headers: HEADERS });
        const data = await res.json();
        return (data || []).map((s) => s.profile_id).filter(Boolean);
    }
    catch (error) {
        return [];
    }
};
exports.getClassAllProfileIds = getClassAllProfileIds;
const getStudentParentProfileIds = async (studentId) => {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/parent_student?student_id=eq.${studentId}&select=parent_id`, { headers: HEADERS });
        const data = await res.json();
        return (data || []).map((ps) => ps.parent_id).filter(Boolean);
    }
    catch (error) {
        return [];
    }
};
exports.getStudentParentProfileIds = getStudentParentProfileIds;
const markNotificationAsRead = async (notificationId, userId) => {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/notifications?id=eq.${notificationId}&user_id=eq.${userId}`, {
            method: 'PATCH',
            headers: HEADERS,
            body: JSON.stringify({ is_read: true })
        });
        return true;
    }
    catch (error) {
        return false;
    }
};
exports.markNotificationAsRead = markNotificationAsRead;
const markAllNotificationsAsRead = async (userId) => {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${userId}&is_read=eq.false`, {
            method: 'PATCH',
            headers: HEADERS,
            body: JSON.stringify({ is_read: true })
        });
        return true;
    }
    catch (error) {
        return false;
    }
};
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
//# sourceMappingURL=notifications.js.map