import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { ServerOptions } from 'socket.io';

/**
 * Prefer WebSocket so mobile clients are not stuck on Engine.IO HTTP long-polling
 * (more fragile with some networks / middleware). Matches Flutter client transport order.
 */
export class VisionArtIoAdapter extends IoAdapter {
  constructor(app: INestApplication) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      transports: ['websocket', 'polling'],
      cors: { origin: '*' },
    });
  }
}
