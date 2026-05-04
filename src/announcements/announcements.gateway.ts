import { Logger, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Namespace, Socket } from 'socket.io';

export type AnnouncementPushPayload = { message: string | null };

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/announcements',
})
export class AnnouncementsGateway
  implements
    OnModuleInit,
    OnGatewayConnection,
    OnGatewayDisconnect
{
  private readonly logger = new Logger(AnnouncementsGateway.name);

  @WebSocketServer()
  server: Namespace;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    this.logger.log('WebSocket gateway: /announcements (admin bandeau)');
  }

  handleConnection(client: Socket) {
    void this.emitCurrentToClient(client);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Disconnected: ${client.id}`);
  }

  private async fetchPayload(): Promise<AnnouncementPushPayload> {
    try {
      const rows = await this.dataSource.query(
        `SELECT message FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1`,
      );
      const raw = rows[0]?.message;
      return {
        message: raw != null && raw !== '' ? String(raw) : null,
      };
    } catch {
      return { message: null };
    }
  }

  private async emitCurrentToClient(client: Socket): Promise<void> {
    const payload = await this.fetchPayload();
    client.emit('announcement_update', payload);
  }

  /** Broadcast current DB state to all connected mobile clients. */
  async emitActiveFromDatabase(): Promise<void> {
    const payload = await this.fetchPayload();
    this.server.emit('announcement_update', payload);
  }
}
