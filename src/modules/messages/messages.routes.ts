import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse, getPagination, paginate } from '../../utils/pagination';
import { createNotification } from '../../utils/notifications';
import { uploadFile, STORAGE_BUCKETS } from '../../utils/storage';
import { sbGet, sbGetOne, sbInsert, sbInsertMany, sbUpdate, sbDelete } from '../../utils/sbClient';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /messages/conversations
router.get('/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const participations = await sbGet('conversation_participants',
      `profile_id=eq.${req.user!.id}&select=conversation_id,last_read_at,conversations(id,subject,created_at,conversation_participants(profile_id,profiles:profile_id(first_name,last_name,avatar_url,role)))&order=created_at.desc`
    );

    const enriched = await Promise.all(participations.map(async (item: any) => {
      const conv = Array.isArray(item.conversations) ? item.conversations[0] : item.conversations;
      const lastMsgs = await sbGet('messages',
        `conversation_id=eq.${item.conversation_id}&is_deleted=eq.false&select=content,created_at,sender_id,profiles:sender_id(first_name,last_name)&order=created_at.desc&limit=1`
      ).catch(() => []);
      const lastMsg = lastMsgs[0] || null;

      const allMsgs = await sbGet('messages',
        `conversation_id=eq.${item.conversation_id}&is_deleted=eq.false&created_at=gt.${item.last_read_at || '1970-01-01'}&select=id`
      ).catch(() => []);
      const unreadCount = allMsgs.filter((m: any) => m.sender_id !== req.user!.id).length;

      const participants = (conv?.conversation_participants || []).filter((p: any) => p.profile_id !== req.user!.id);

      return { ...conv, lastMessage: lastMsg, unreadCount, participants };
    }));

    return res.json(successResponse(enriched));
  } catch (err) { return next(err); }
});

// POST /messages/conversations
router.post('/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { participantIds, subject, firstMessage } = z.object({
      participantIds: z.array(z.string().uuid()).min(1).max(10),
      subject: z.string().optional(),
      firstMessage: z.string().min(1),
    }).parse(req.body);

    const conversation = await sbInsert('conversations', { subject, created_by: req.user!.id });

    const allParticipants = [...new Set([req.user!.id, ...participantIds])];
    await sbInsertMany('conversation_participants',
      allParticipants.map((id) => ({ conversation_id: conversation.id, profile_id: id }))
    );

    await sbInsert('messages', { conversation_id: conversation.id, sender_id: req.user!.id, content: firstMessage });

    for (const participantId of participantIds) {
      if (participantId !== req.user!.id) {
        await createNotification({ recipientId: participantId, type: 'message',
          title: 'Nouveau message', body: firstMessage.substring(0, 80),
          data: { conversationId: conversation.id } });
      }
    }
    return res.status(201).json(successResponse(conversation));
  } catch (err) { return next(err); }
});

// GET /messages/conversations/:id/messages
router.get('/conversations/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const participant = await sbGetOne('conversation_participants',
      `conversation_id=eq.${req.params.id}&profile_id=eq.${req.user!.id}&select=id`);
    if (!participant) throw new AppError('Not a participant of this conversation', 403);

    const data = await sbGet('messages',
      `conversation_id=eq.${req.params.id}&is_deleted=eq.false&select=*,profiles:sender_id(first_name,last_name,avatar_url,role)&order=created_at.desc&offset=${offset}&limit=${limit}`
    );

    await sbUpdate('conversation_participants',
      `conversation_id=eq.${req.params.id}&profile_id=eq.${req.user!.id}`,
      { last_read_at: new Date().toISOString() }).catch(() => {});

    return res.json(paginate(data.reverse(), data.length, { page, limit, offset }));
  } catch (err) { return next(err); }
});

// POST /messages/conversations/:id/messages
router.post('/conversations/:id/messages', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const participant = await sbGetOne('conversation_participants',
      `conversation_id=eq.${req.params.id}&profile_id=eq.${req.user!.id}&select=id`);
    if (!participant) throw new AppError('Not a participant', 403);

    const content = req.body.content;
    if (!content && !req.file) throw new AppError('Message content or file required', 400);

    let fileUrl: string | undefined;
    if (req.file) fileUrl = await uploadFile(STORAGE_BUCKETS.DOCUMENTS, req.file, req.user!.id);

    const data = await sbInsert('messages', {
      conversation_id: req.params.id, sender_id: req.user!.id,
      content: content || '', file_url: fileUrl,
    });

    const otherParticipants = await sbGet('conversation_participants',
      `conversation_id=eq.${req.params.id}&profile_id=neq.${req.user!.id}&select=profile_id`);
    for (const p of otherParticipants) {
      await createNotification({ recipientId: p.profile_id, type: 'message',
        title: 'Nouveau message', body: content?.substring(0, 80) || 'Fichier partagé',
        data: { conversationId: req.params.id, messageId: data.id } });
    }
    return res.status(201).json(successResponse(data));
  } catch (err) { return next(err); }
});

// DELETE /messages/:messageId
router.delete('/:messageId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sbUpdate('messages', `id=eq.${req.params.messageId}&sender_id=eq.${req.user!.id}`, { is_deleted: true });
    return res.status(204).send();
  } catch (err) { return next(err); }
});

export default router;