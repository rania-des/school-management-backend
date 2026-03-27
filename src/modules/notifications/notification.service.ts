import { supabaseAdmin } from '../../config/supabase';

export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  type?: 'grade' | 'attendance' | 'payment' | 'meeting' | 'announcement' | 'assignment' | 'general';
  data?: Record<string, any>;
}

export class NotificationService {
  static async create(payload: NotificationPayload) {
    const { error } = await supabaseAdmin
      .from('notifications')
      .insert({
        recipient_id: payload.userId,
        title: payload.title,
        body: payload.body,
        type: payload.type || 'general',
        data: payload.data || {},
        is_read: false,
      });
    if (error) console.error('[Notification] Error:', error);
    return !error;
  }

  static async createMany(payloads: NotificationPayload[]) {
    if (payloads.length === 0) return;
    const { error } = await supabaseAdmin
      .from('notifications')
      .insert(payloads.map(p => ({
        recipient_id: p.userId,
        title: p.title,
        body: p.body,
        type: p.type || 'general',
        data: p.data || {},
        is_read: false,
      })));
    if (error) console.error('[Notification] Error:', error);
  }
}
