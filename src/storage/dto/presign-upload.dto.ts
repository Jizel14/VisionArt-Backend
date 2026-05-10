import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PresignUploadDto {
  @ApiProperty({
    description: 'MIME type of the uploaded content',
    example: 'image/jpeg',
  })
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty({
    required: false,
    description: 'Optional prefix (folder) for the object key',
    example: 'stories',
  })
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiProperty({
    required: false,
    description: 'Optional file extension (without the leading dot)',
    example: 'jpg',
  })
  @IsOptional()
  @IsString()
  fileExt?: string;
}
