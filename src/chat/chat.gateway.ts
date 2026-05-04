import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // userId -> Set of socketIds
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  // ─── Connection lifecycle ───────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token);
      const userId = payload.sub as string;
      if (!userId) {
        client.disconnect();
        return;
      }

      client.data.userId = userId;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      client.emit('connected', { userId });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  // ─── Send message via WebSocket ─────────────────────────────────

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      conversationId: string;
      content?: string;
      imageUrl?: string;
      replyToId?: string;
    },
  ) {
    const userId = client.data.userId as string;
    if (!userId) return;

    try {
      const message = await this.chatService.sendMessage(
        userId,
        body.conversationId,
        {
          content: body.content,
          imageUrl: body.imageUrl,
          replyToId: body.replyToId,
        },
      );

      // Broadcast to all participants
      const participantIds =
        await this.chatService.getConversationParticipantIds(
          body.conversationId,
        );
      for (const pid of participantIds) {
        this.emitToUser(pid, 'new_message', message);
      }

      return message;
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : 'Failed to send message';
      client.emit('error', { message: errorMessage });
    }
  }

  // ─── Typing indicator ──────────────────────────────────────────

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; isTyping: boolean },
  ) {
    const userId = client.data.userId as string;
    if (!userId) return;

    const participantIds = await this.chatService.getConversationParticipantIds(
      body.conversationId,
    );
    for (const pid of participantIds) {
      if (pid !== userId) {
        this.emitToUser(pid, 'user_typing', {
          conversationId: body.conversationId,
          userId,
          isTyping: body.isTyping,
        });
      }
    }
  }

  // ─── Mark as read ──────────────────────────────────────────────

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    const userId = client.data.userId as string;
    if (!userId) return;

    await this.chatService.markAsRead(userId, body.conversationId);
    client.emit('marked_read', { conversationId: body.conversationId });
  }

  // ─── React to message ─────────────────────────────────────────

  @SubscribeMessage('react')
  async handleReact(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; emoji: string },
  ) {
    const userId = client.data.userId as string;
    if (!userId) return;

    try {
      const result = await this.chatService.toggleReaction(
        userId,
        body.messageId,
        body.emoji,
      );

      // Get the message to find conversation participants
      const message = await this.chatService.listMessages(
        userId,
        result.messageId,
        1,
        1,
      );
      if (message.data.length > 0) {
        const convId = message.data[0].conversationId;
        const participantIds =
          await this.chatService.getConversationParticipantIds(convId);
        for (const pid of participantIds) {
          this.emitToUser(pid, 'reaction_updated', result);
        }
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to react';
      client.emit('error', { message: errorMessage });
    }
  }

  // ─── Utility ───────────────────────────────────────────────────

  private emitToUser(userId: string, event: string, data: unknown) {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;
    for (const socketId of sockets) {
      this.server.to(socketId).emit(event, data);
    }
  }
}
