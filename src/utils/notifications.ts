// Toutes les requêtes Supabase passent par fetch REST directement
// pour éviter les problèmes de clés API avec supabaseAdmin

const SUPABASE_URL = () => process.env.SUPABASE_URL!;
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function sbFetch(table: string, params = '', options?: RequestInit): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${table}${params ? '?' + params : ''}`, {
    headers: {
      'apikey': SERVICE_KEY(),
      'Authorization': `Bearer ${SERVICE_KEY()}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Supabase fetch error:', data);
    return [];
  }
  return Array.isArray(data) ? data : data ? [data] : [];
}

export type NotificationType =
  | 'grade'
  | 'assignment'
  | 'absence'
  | 'message'
  | 'announcement'
  | 'payment'
  | 'meeting'
  | 'general';

export interface CreateNotificationParams {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export const createNotification = async (params: CreateNotificationParams) => {
  try {
    await sbFetch('notifications', '', {
      method: 'POST',
      body: JSON.stringify({
        user_id: params.recipientId,
        type: params.type,
        title: params.title,
        body: params.body || '',
        data: params.data || {},
        is_read: false,
        created_at: new Date().toISOString(),
      }),
    });
    return { success: true };
  } catch (error) {
    console.error('Notification error:', error);
    return null;
  }
};

export const createBulkNotifications = async (
  recipientIds: string[],
  params: Omit<CreateNotificationParams, 'recipientId'>
) => {
  if (!recipientIds.length) return { success: true, count: 0 };
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
    await sbFetch('notifications', '', {
      method: 'POST',
      body: JSON.stringify(notifications),
    });
    return { success: true, count: recipientIds.length };
  } catch (error) {
    console.error('Bulk notification error:', error);
    return { success: false, error, count: 0 };
  }
};

export const getClassStudentProfileIds = async (classId: string): Promise<string[]> => {
  try {
    const data = await sbFetch('students', `class_id=eq.${classId}&select=profile_id`);
    return (data || []).map((s: any) => s.profile_id).filter(Boolean);
  } catch (error) {
    console.error('Error getting class student profile IDs:', error);
    return [];
  }
};

export const getClassAllProfileIds = async (classId: string): Promise<string[]> => {
  try {
    const students = await sbFetch('students', `class_id=eq.${classId}&select=profile_id`);
    const studentIds = students.map((s: any) => s.profile_id).filter(Boolean);

    const slots = await sbFetch('schedule_slots', `class_id=eq.${classId}&is_active=eq.true&select=teacher_id`);
    const teacherIds: string[] = [];
    for (const slot of slots) {
      if (slot.teacher_id) {
        const teachers = await sbFetch('teachers', `id=eq.${slot.teacher_id}&select=profile_id`);
        if (teachers?.[0]?.profile_id) teacherIds.push(teachers[0].profile_id);
      }
    }
    return [...new Set([...studentIds, ...teacherIds])];
  } catch (error) {
    console.error('Error getting class all profile IDs:', error);
    return [];
  }
};

export const getStudentParentProfileIds = async (studentId: string): Promise<string[]> => {
  try {
    const data = await sbFetch('parent_student', `student_id=eq.${studentId}&select=parents:parent_id(profile_id)`);
    return (data || []).map((ps: any) => ps.parents?.profile_id).filter(Boolean);
  } catch (error) {
    console.error('Error getting student parent profile IDs:', error);
    return [];
  }
};

export const markNotificationAsRead = async (notificationId: string, userId: string) => {
  try {
    await sbFetch('notifications', `id=eq.${notificationId}&user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_read: true }),
    });
    return true;
  } catch (error) {
    console.error('Mark read error:', error);
    return false;
  }
};

export const markAllNotificationsAsRead = async (userId: string) => {
  try {
    await sbFetch('notifications', `user_id=eq.${userId}&is_read=eq.false`, {
      method: 'PATCH',
      body: JSON.stringify({ is_read: true }),
    });
    return true;
  } catch (error) {
    console.error('Mark all read error:', error);
    return false;
  }
};