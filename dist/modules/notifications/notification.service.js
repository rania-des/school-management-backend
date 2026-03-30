"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const supabase_1 = require("../../config/supabase");
class NotificationService {
    static async create(payload) {
        const { error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .insert({
            recipient_id: payload.userId,
            title: payload.title,
            body: payload.body,
            type: payload.type || 'general',
            data: payload.data || {},
            is_read: false,
        });
        if (error)
            console.error('[Notification] Error:', error);
        return !error;
    }
    static async createMany(payloads) {
        if (payloads.length === 0)
            return;
        const { error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .insert(payloads.map(p => ({
            recipient_id: p.userId,
            title: p.title,
            body: p.body,
            type: p.type || 'general',
            data: p.data || {},
            is_read: false,
        })));
        if (error)
            console.error('[Notification] Error:', error);
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.service.js.map