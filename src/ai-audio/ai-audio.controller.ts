import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller('audio')
export class AiAudioController {
  @Get(':filename')
  getAudio(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.resolve(process.cwd(), 'temp', filename);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    throw new NotFoundException('Audio file not found.');
  }
}
