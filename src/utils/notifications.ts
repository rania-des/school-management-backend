const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const HEADERS = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

export type NotificationType = 'grade' | 'assignment' | 'absence' | 'message' | 'announcement' | 'payment' | 'meeting' | 'general';

export interface CreateNotificationParams {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export const createNotification = async (params: CreateNotificationParams) => {
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
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(notifications)
    });
    return { success: true, count: recipientIds.length };
  } catch (error) {
    console.error('Bulk notification error:', error);
    return { success: false, error, count: 0 };
  }
};

export const getClassStudentProfileIds = async (classId: string): Promise<string[]> => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${classId}&select=profile_id`, { headers: HEADERS });
    const data = await res.json() as any[];
    return (data || []).map((s: any) => s.profile_id).filter(Boolean);
  } catch (error) {
    console.error('Error getting class student profile IDs:', error);
    return [];
  }
};

export const getClassAllProfileIds = async (classId: string): Promise<string[]> => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${classId}&select=profile_id`, { headers: HEADERS });
    const data = await res.json() as any[];
    return (data || []).map((s: any) => s.profile_id).filter(Boolean);
  } catch (error) {
    return [];
  }
};

export const getStudentParentProfileIds = async (studentId: string): Promise<string[]> => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/parent_student?student_id=eq.${studentId}&select=parent_id`, { headers: HEADERS });
    const data = await res.json() as any[];
    return (data || []).map((ps: any) => ps.parent_id).filter(Boolean);
  } catch (error) {
    return [];
  }
};

export const markNotificationAsRead = async (notificationId: string, userId: string) => {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications?id=eq.${notificationId}&user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ is_read: true })
    });
    return true;
  } catch (error) {
    return false;
  }
};

export const markAllNotificationsAsRead = async (userId: string) => {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${userId}&is_read=eq.false`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ is_read: true })
    });
    return true;
  } catch (error) {
    return false;
  }
};