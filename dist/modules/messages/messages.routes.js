"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const notifications_1 = require("../../utils/notifications");
const multer_1 = __importDefault(require("multer"));
const storage_1 = require("../../utils/storage");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// GET /messages/conversations
router.get('/conversations', async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('conversation_participants')
            .select(`
        conversation_id,
        last_read_at,
        conversations(
          id,
          subject,
          created_at,
          conversation_participants(
            profile_id,
            profiles(first_name, last_name, avatar_url, role)
          )
        )
      `)
            .eq('profile_id', req.user.id)
            .order('created_at', { referencedTable: 'conversations', ascending: false });
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch conversations', 500);
        // Enrich with last message and unread count
        const enriched = await Promise.all((data || []).map(async (item) => {
            const { data: lastMsg } = await supabase_1.supabaseAdmin
                .from('messages')
                .select('content, created_at, sender_id, profiles(first_name, last_name)')
                .eq('conversation_id', item.conversation_id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            const { count: unreadCount } = await supabase_1.supabaseAdmin
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', item.conversation_id)
                .eq('is_deleted', false)
                .gt('created_at', item.last_read_at || '1970-01-01')
                .neq('sender_id', req.user.id);
            return {
                ...item.conversations,
                lastMessage: lastMsg,
                unreadCount: unreadCount || 0,
                participants: item.conversations?.conversation_participants?.filter((p) => p.profile_id !== req.user.id),
            };
        }));
        return res.json((0, pagination_1.successResponse)(enriched));
    }
    catch (err) {
        return next(err);
    }
});
// POST /messages/conversations - start a new conversation
router.post('/conversations', async (req, res, next) => {
    try {
        const { participantIds, subject, firstMessage } = zod_1.z.object({
            participantIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(10),
            subject: zod_1.z.string().optional(),
            firstMessage: zod_1.z.string().min(1),
        }).parse(req.body);
        // Create conversation
        const { data: conversation, error } = await supabase_1.supabaseAdmin
            .from('conversations')
            .insert({ subject, created_by: req.user.id })
            .select()
            .single();
        if (error || !conversation)
            throw new error_middleware_1.AppError('Failed to create conversation', 500);
        // Add participants (including sender)
        const allParticipants = [...new Set([req.user.id, ...participantIds])];
        await supabase_1.supabaseAdmin.from('conversation_participants').insert(allParticipants.map((id) => ({ conversation_id: conversation.id, profile_id: id })));
        // Send first message
        await supabase_1.supabaseAdmin.from('messages').insert({
            conversation_id: conversation.id,
            sender_id: req.user.id,
            content: firstMessage,
        });
        // Notify other participants
        for (const participantId of participantIds) {
            if (participantId !== req.user.id) {
                await (0, notifications_1.createNotification)({
                    recipientId: participantId,
                    type: 'message',
                    title: 'Nouveau message',
                    body: firstMessage.substring(0, 80),
                    data: { conversationId: conversation.id },
                });
            }
        }
        return res.status(201).json((0, pagination_1.successResponse)(conversation));
    }
    catch (err) {
        return next(err);
    }
});
// GET /messages/conversations/:id/messages
router.get('/conversations/:id/messages', async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, pagination_1.getPagination)(req);
        // Verify participation
        const { data: participant } = await supabase_1.supabaseAdmin
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', req.params.id)
            .eq('profile_id', req.user.id)
            .single();
        if (!participant)
            throw new error_middleware_1.AppError('Not a participant of this conversation', 403);
        const { data, count, error } = await supabase_1.supabaseAdmin
            .from('messages')
            .select(`
        *,
        profiles(first_name, last_name, avatar_url, role)
      `, { count: 'exact' })
            .eq('conversation_id', req.params.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch messages', 500);
        // Mark as read
        await supabase_1.supabaseAdmin
            .from('conversation_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', req.params.id)
            .eq('profile_id', req.user.id);
        return res.json((0, pagination_1.paginate)((data || []).reverse(), count || 0, { page, limit, offset }));
    }
    catch (err) {
        return next(err);
    }
});
// POST /messages/conversations/:id/messages - send a message
router.post('/conversations/:id/messages', upload.single('file'), async (req, res, next) => {
    try {
        // Verify participation
        const { data: participant } = await supabase_1.supabaseAdmin
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', req.params.id)
            .eq('profile_id', req.user.id)
            .single();
        if (!participant)
            throw new error_middleware_1.AppError('Not a participant', 403);
        const content = req.body.content;
        if (!content && !req.file)
            throw new error_middleware_1.AppError('Message content or file required', 400);
        let fileUrl;
        if (req.file) {
            fileUrl = await (0, storage_1.uploadFile)(storage_1.STORAGE_BUCKETS.DOCUMENTS, req.file, req.user.id);
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('messages')
            .insert({
            conversation_id: req.params.id,
            sender_id: req.user.id,
            content: content || '',
            file_url: fileUrl,
        })
            .select('*, profiles(first_name, last_name, avatar_url)')
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to send message', 500);
        // Notify other participants
        const { data: otherParticipants } = await supabase_1.supabaseAdmin
            .from('conversation_participants')
            .select('profile_id')
            .eq('conversation_id', req.params.id)
            .neq('profile_id', req.user.id);
        for (const p of (otherParticipants || [])) {
            await (0, notifications_1.createNotification)({
                recipientId: p.profile_id,
                type: 'message',
                title: 'Nouveau message',
                body: content?.substring(0, 80) || 'Fichier partagé',
                data: { conversationId: req.params.id, messageId: data.id },
            });
        }
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /messages/:messageId - soft delete
router.delete('/:messageId', async (req, res, next) => {
    try {
        const { error } = await supabase_1.supabaseAdmin
            .from('messages')
            .update({ is_deleted: true })
            .eq('id', req.params.messageId)
            .eq('sender_id', req.user.id); // can only delete own messages
        if (error)
            throw new error_middleware_1.AppError('Failed to delete message', 500);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=messages.routes.js.map