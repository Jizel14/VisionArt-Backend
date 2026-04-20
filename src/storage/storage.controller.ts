import {
  Body,
  Controller,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { PresignedUpload, StorageService } from './storage.service';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('presign')
  @UseGuards(JwtAuthGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  async presignUpload(
    @CurrentUser() userId: string,
    @Body() dto: PresignUploadDto,
  ): Promise<PresignedUpload> {
    return this.storageService.createPresignedUpload({
      userId,
      contentType: dto.contentType,
      prefix: dto.prefix,
      fileExt: dto.fileExt,
    });
  }
}
