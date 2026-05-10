import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message } from './entities/message.entity';
import { MessageReaction } from './entities/message-reaction.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(MessageReaction)
    private readonly reactionRepo: Repository<MessageReaction>,
  ) {}

  // ─── Conversations ──────────────────────────────────────────────

  async createOrGetConversation(
    userId: string,
    participantIds: string[],
    groupName?: string,
  ) {
    const allIds = [...new Set([userId, ...participantIds])];
    if (allIds.length < 2) {
      throw new BadRequestException(
        'A conversation requires at least 2 participants',
      );
    }

    const isGroup = allIds.length > 2 || !!groupName;

    // For 1-on-1, check if conversation already exists
    if (!isGroup) {
      const existing = await this.findExistingDm(allIds[0], allIds[1]);
      if (existing) return this.formatConversation(existing, userId);
    }

    const conversation = this.conversationRepo.create({
      isGroup,
      groupName: groupName || null,
      createdBy: userId,
    });
    const saved = await this.conversationRepo.save(conversation);

    const participants = allIds.map((id) =>
      this.participantRepo.create({
        conversationId: saved.id,
        userId: id,
      }),
    );
    await this.participantRepo.save(participants);

    const full = await this.conversationRepo.findOne({
      where: { id: saved.id },
      relations: ['participants', 'participants.user'],
    });
    return this.formatConversation(full!, userId);
  }

  private async findExistingDm(
    userA: string,
    userB: string,
  ): Promise<Conversation | null> {
    const result = await this.conversationRepo
      .createQueryBuilder('c')
      .innerJoin('c.participants', 'pA', 'pA.userId = :userA', { userA })
      .innerJoin('c.participants', 'pB', 'pB.userId = :userB', { userB })
      .where('c.isGroup = false')
      .leftJoinAndSelect('c.participants', 'p')
      .leftJoinAndSelect('p.user', 'u')
      .getOne();
    return result;
  }

  async listConversations(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const myConvIds = await this.participantRepo.find({
      where: { userId },
      select: ['conversationId'],
    });
    const convIds = myConvIds.map((p) => p.conversationId);
    if (!convIds.length) {
      return { data: [], pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 0 } };
    }

    const [rows, total] = await this.conversationRepo.findAndCount({
      where: { id: In(convIds) },
      relations: ['participants', 'participants.user'],
      order: { lastMessageAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      data: rows.map((c) => this.formatConversation(c, userId)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  private formatConversation(c: Conversation, currentUserId: string) {
    const myParticipant = c.participants?.find(
      (p) => p.userId === currentUserId,
    );
    const otherParticipants =
      c.participants?.filter((p) => p.userId !== currentUserId) || [];

    return {
      id: c.id,
      isGroup: c.isGroup,
      groupName: c.groupName,
      groupAvatarUrl: c.groupAvatarUrl,
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview,
      unreadCount: myParticipant?.unreadCount || 0,
      isMuted: myParticipant?.isMuted || false,
      participants: otherParticipants.map((p) => ({
        id: p.userId,
        name: p.user?.name || 'Unknown',
        avatarUrl: p.user?.avatarUrl || null,
      })),
      createdAt: c.createdAt,
    };
  }

  // ─── Messages ───────────────────────────────────────────────────

  async sendMessage(
    userId: string,
    conversationId: string,
    payload: {
      content?: string;
      imageUrl?: string;
      replyToId?: string;
      type?: string;
    },
  ) {
    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });
    if (!participant) {
      throw new BadRequestException('You are not in this conversation');
    }

    if (!payload.content?.trim() && !payload.imageUrl) {
      throw new BadRequestException('Message content or image is required');
    }

    const msgType = payload.imageUrl
      ? 'image'
      : payload.replyToId
        ? 'reply'
        : payload.type || 'text';

    const message = this.messageRepo.create({
      conversationId,
      senderId: userId,
      type: msgType,
      content: payload.content?.trim() || null,
      imageUrl: payload.imageUrl || null,
      replyToId: payload.replyToId || null,
    });
    const saved = await this.messageRepo.save(message);

    // Update conversation preview
    await this.conversationRepo.update(conversationId, {
      lastMessageAt: new Date(),
      lastMessagePreview:
        saved.content?.substring(0, 100) ||
        (saved.imageUrl ? '📷 Image' : ''),
    });

    // Increment unread count for other participants
    await this.participantRepo
      .createQueryBuilder()
      .update(ConversationParticipant)
      .set({ unreadCount: () => 'unread_count + 1' })
      .where('conversation_id = :conversationId AND user_id != :userId', {
        conversationId,
        userId,
      })
      .execute();

    // Fetch full message with sender and reply
    const full = await this.messageRepo.findOne({
      where: { id: saved.id },
      relations: ['sender', 'replyTo', 'replyTo.sender', 'reactions', 'reactions.user'],
    });
    return this.formatMessage(full!, userId);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    page = 1,
    limit = 50,
  ) {
    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });
    if (!participant) {
      throw new BadRequestException('You are not in this conversation');
    }

    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const [rows, total] = await this.messageRepo.findAndCount({
      where: { conversationId },
      relations: ['sender', 'replyTo', 'replyTo.sender', 'reactions', 'reactions.user'],
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      data: rows.reverse().map((m) => this.formatMessage(m, userId)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async editMessage(userId: string, messageId: string, content: string) {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) {
      throw new BadRequestException('Can only edit your own messages');
    }

    message.content = content.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    const saved = await this.messageRepo.save(message);

    const full = await this.messageRepo.findOne({
      where: { id: saved.id },
      relations: ['sender', 'replyTo', 'replyTo.sender', 'reactions', 'reactions.user'],
    });
    return this.formatMessage(full!, userId);
  }

  async deleteMessage(userId: string, messageId: string) {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) {
      throw new BadRequestException('Can only delete your own messages');
    }

    message.isDeleted = true;
    message.content = null;
    message.imageUrl = null;
    await this.messageRepo.save(message);

    return { success: true, messageId };
  }

  // ─── Reactions ──────────────────────────────────────────────────

  async toggleReaction(userId: string, messageId: string, emoji: string) {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
      relations: ['conversation'],
    });
    if (!message) throw new NotFoundException('Message not found');

    const participant = await this.participantRepo.findOne({
      where: { conversationId: message.conversationId, userId },
    });
    if (!participant) {
      throw new BadRequestException('You are not in this conversation');
    }

    const existing = await this.reactionRepo.findOne({
      where: { messageId, userId, emoji },
    });

    if (existing) {
      await this.reactionRepo.remove(existing);
      return { action: 'removed', messageId, emoji };
    }

    const reaction = this.reactionRepo.create({ messageId, userId, emoji });
    await this.reactionRepo.save(reaction);
    return { action: 'added', messageId, emoji, userId };
  }

  // ─── Read Receipts ─────────────────────────────────────────────

  async markAsRead(userId: string, conversationId: string) {
    await this.participantRepo.update(
      { conversationId, userId },
      { unreadCount: 0, lastReadAt: new Date() },
    );
    return { success: true };
  }

  // ─── Typing Indicators (stateless, handled by gateway) ─────────

  async getConversationParticipantIds(
    conversationId: string,
  ): Promise<string[]> {
    const participants = await this.participantRepo.find({
      where: { conversationId },
      select: ['userId'],
    });
    return participants.map((p) => p.userId);
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private formatMessage(m: Message, currentUserId: string) {
    const reactionMap: Record<string, string[]> = {};
    for (const r of m.reactions || []) {
      if (!reactionMap[r.emoji]) reactionMap[r.emoji] = [];
      reactionMap[r.emoji].push(r.userId);
    }

    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      sender: m.sender
        ? {
            id: m.sender.id,
            name: m.sender.name,
            avatarUrl: m.sender.avatarUrl,
          }
        : null,
      type: m.isDeleted ? 'deleted' : m.type,
      content: m.isDeleted ? null : m.content,
      imageUrl: m.isDeleted ? null : m.imageUrl,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            content: m.replyTo.isDeleted
              ? null
              : m.replyTo.content?.substring(0, 100),
            senderId: m.replyTo.senderId,
            senderName: m.replyTo.sender?.name || 'Unknown',
          }
        : null,
      reactions: reactionMap,
      isEdited: m.isEdited,
      isDeleted: m.isDeleted,
      isMine: m.senderId === currentUserId,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
    };
  }
}
