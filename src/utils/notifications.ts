const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function sbHeaders() {
  return {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

async function sbGet(table: string, params: string = ''): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function sbInsert(table: string, body: object | object[]): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  return res.ok;
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
    const ok = await sbInsert('notifications', {
      user_id:    params.recipientId,
      type:       params.type,
      title:      params.title,
      body:       params.body || '',
      data:       params.data || {},
      is_read:    false,
      created_at: new Date().toISOString(),
    });
    if (!ok) console.error('Failed to create notification');
    return ok ? { success: true } : null;
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
      user_id:    id,
      type:       params.type,
      title:      params.title,
      body:       params.body || '',
      data:       params.data || {},
      is_read:    false,
      created_at: new Date().toISOString(),
    }));
    const ok = await sbInsert('notifications', notifications);
    return { success: ok, count: ok ? recipientIds.length : 0 };
  } catch (error) {
    console.error('Bulk notification error:', error);
    return { success: false, error, count: 0 };
  }
};

export const getClassStudentProfileIds = async (classId: string): Promise<string[]> => {
  try {
    const data = await sbGet('students', `class_id=eq.${classId}&select=profile_id`);
    return data.map((s: any) => s.profile_id).filter(Boolean);
  } catch (error) {
    console.error('Error getting class student profile IDs:', error);
    return [];
  }
};

export const getClassAllProfileIds = async (classId: string): Promise<string[]> => {
  try {
    const students = await sbGet('students', `class_id=eq.${classId}&select=profile_id`);
    const studentIds = students.map((s: any) => s.profile_id).filter(Boolean);

    const slots = await sbGet('schedule_slots', `class_id=eq.${classId}&is_active=eq.true&select=teacher_id`);
    const teacherIds: string[] = [];
    for (const slot of slots) {
      if (slot.teacher_id) {
        const teachers = await sbGet('teachers', `id=eq.${slot.teacher_id}&select=profile_id`);
        if (teachers[0]?.profile_id) teacherIds.push(teachers[0].profile_id);
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
    const data = await sbGet('parent_student', `student_id=eq.${studentId}&select=parents:parent_id(profile_id)`);
    return data.map((ps: any) => ps.parents?.profile_id).filter(Boolean);
  } catch (error) {
    console.error('Error getting student parent profile IDs:', error);
    return [];
  }
};

export const markNotificationAsRead = async (notificationId: string, userId: string) => {
  try {
    const url = `${SUPABASE_URL}/rest/v1/notifications?id=eq.${notificationId}&user_id=eq.${userId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ is_read: true }),
    });
    return res.ok;
  } catch (error) {
    console.error('Mark read error:', error);
    return false;
  }
};

export const markAllNotificationsAsRead = async (userId: string) => {
  try {
    const url = `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${userId}&is_read=eq.false`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ is_read: true }),
    });
    return res.ok;
  } catch (error) {
    console.error('Mark all read error:', error);
    return false;
  }
};