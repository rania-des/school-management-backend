import { supabaseAdmin } from '../config/supabase';

export async function createNotification(params: {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  data?: any;
}) {
  const { recipientId, type, title, body, data } = params;
  
  const { error } = await supabaseAdmin
    .from('notifications')
    .insert({
      recipient_id: recipientId,
      type,
      title,
      body,
      data: data || {},
      created_at: new Date().toISOString(),
      is_read: false,
    });

  if (error) {
    console.error('Failed to create notification:', error);
  }
}

export async function createBulkNotifications(
  recipientIds: string[],
  params: { type: string; title: string; body: string; data?: any }
) {
  if (recipientIds.length === 0) return;

  const notifications = recipientIds.map(recipientId => ({
    recipient_id: recipientId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
    created_at: new Date().toISOString(),
    is_read: false,
  }));

  const { error } = await supabaseAdmin
    .from('notifications')
    .insert(notifications);

  if (error) {
    console.error('Failed to create bulk notifications:', error);
  }
}

export async function getClassStudentProfileIds(classId: string): Promise<string[]> {
  const { data: students, error } = await supabaseAdmin
    .from('students')
    .select('profile_id')
    .eq('class_id', classId);

  if (error) {
    console.error('Failed to get class students:', error);
    return [];
  }

  return (students || []).map(s => s.profile_id).filter(Boolean);
}

export async function getStudentParentProfileIds(studentId: string): Promise<string[]> {
  const { data: parentLinks, error } = await supabaseAdmin
    .from('parent_student')
    .select('parents(profile_id)')
    .eq('student_id', studentId);

  if (error) {
    console.error('Failed to get student parents:', error);
    return [];
  }

  return (parentLinks || [])
    .map((pl: any) => pl.parents?.profile_id)
    .filter(Boolean);
}