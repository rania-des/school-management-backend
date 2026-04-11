import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification } from '../../utils/notifications';
import multer from 'multer';
import { uploadFile, STORAGE_BUCKETS } from '../../utils/storage';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /messages/conversations
router.get('/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
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
            users(first_name, last_name, avatar_url, role)
          )
        )
      `)
      .eq('profile_id', req.user!.id)
      .order('created_at', { referencedTable: 'conversations', ascending: false });

    if (error) throw new AppError('Failed to fetch conversations', 500);

    // Enrich with last message and unread count
    const enriched = await Promise.all(
      (data || []).map(async (item: any) => {
        const { data: lastMsg } = await supabaseAdmin
          .from('messages')
          .select('content, created_at, sender_id, users(first_name, last_name)')
          .eq('conversation_id', item.conversation_id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const { count: unreadCount } = await supabaseAdmin
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', item.conversation_id)
          .eq('is_deleted', false)
          .gt('created_at', item.last_read_at || '1970-01-01')
          .neq('sender_id', req.user!.id);

        return {
          ...item.conversations,
          lastMessage: lastMsg,
          unreadCount: unreadCount || 0,
          participants: item.conversations?.conversation_participants?.filter(
            (p: any) => p.profile_id !== req.user!.id
          ),
        };
      })
    );

    return res.json(successResponse(enriched));
  } catch (err) {
    return next(err);
  }
});

// POST /messages/conversations - start a new conversation
router.post('/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { participantIds, subject, firstMessage } = z.object({
      participantIds: z.array(z.string().uuid()).min(1).max(10),
      subject: z.string().optional(),
      firstMessage: z.string().min(1),
    }).parse(req.body);

    // Create conversation
    const { data: conversation, error } = await supabaseAdmin
      .from('conversations')
      .insert({ subject, created_by: req.user!.id })
      .select()
      .single();

    if (error || !conversation) throw new AppError('Failed to create conversation', 500);

    // Add participants (including sender)
    const allParticipants = [...new Set([req.user!.id, ...participantIds])];
    await supabaseAdmin.from('conversation_participants').insert(
      allParticipants.map((id) => ({ conversation_id: conversation.id, profile_id: id }))
    );

    // Send first message
    await supabaseAdmin.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: req.user!.id,
      content: firstMessage,
    });

    // Notify other participants
    for (const participantId of participantIds) {
      if (participantId !== req.user!.id) {
        await createNotification({
          recipientId: participantId,
          type: 'message',
          title: 'Nouveau message',
          body: firstMessage.substring(0, 80),
          data: { conversationId: conversation.id },
        });
      }
    }

    return res.status(201).json(successResponse(conversation));
  } catch (err) {
    return next(err);
  }
});

// GET /messages/conversations/:id/messages
router.get('/conversations/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);

    // Verify participation
    const { data: participant } = await supabaseAdmin
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', req.params.id)
      .eq('profile_id', req.user!.id)
      .single();

    if (!participant) throw new AppError('Not a participant of this conversation', 403);

    const { data, count, error } = await supabaseAdmin
      .from('messages')
      .select(`
        *,
        users(first_name, last_name, avatar_url, role)
      `, { count: 'exact' })
      .eq('conversation_id', req.params.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new AppError('Failed to fetch messages', 500);

    // Mark as read
    await supabaseAdmin
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', req.params.id)
      .eq('profile_id', req.user!.id);

    return res.json(paginate((data || []).reverse(), count || 0, { page, limit, offset }));
  } catch (err) {
    return next(err);
  }
});

// POST /messages/conversations/:id/messages - send a message
router.post('/conversations/:id/messages', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify participation
    const { data: participant } = await supabaseAdmin
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', req.params.id)
      .eq('profile_id', req.user!.id)
      .single();

    if (!participant) throw new AppError('Not a participant', 403);

    const content = req.body.content;
    if (!content && !req.file) throw new AppError('Message content or file required', 400);

    let fileUrl: string | undefined;
    if (req.file) {
      fileUrl = await uploadFile(STORAGE_BUCKETS.DOCUMENTS, req.file, req.user!.id);
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: req.params.id,
        sender_id: req.user!.id,
        content: content || '',
        file_url: fileUrl,
      })
      .select('*, users(first_name, last_name, avatar_url)')
      .single();

    if (error) throw new AppError('Failed to send message', 500);

    // Notify other participants
    const { data: otherParticipants } = await supabaseAdmin
      .from('conversation_participants')
      .select('profile_id')
      .eq('conversation_id', req.params.id)
      .neq('profile_id', req.user!.id);

    for (const p of (otherParticipants || [])) {
      await createNotification({
        recipientId: p.profile_id,
        type: 'message',
        title: 'Nouveau message',
        body: content?.substring(0, 80) || 'Fichier partagé',
        data: { conversationId: req.params.id, messageId: data.id },
      });
    }

    return res.status(201).json(successResponse(data));
  } catch (err) {
    return next(err);
  }
});

// DELETE /messages/:messageId - soft delete
router.delete('/:messageId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error } = await supabaseAdmin
      .from('messages')
      .update({ is_deleted: true })
      .eq('id', req.params.messageId)
      .eq('sender_id', req.user!.id); // can only delete own messages

    if (error) throw new AppError('Failed to delete message', 500);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export default router;