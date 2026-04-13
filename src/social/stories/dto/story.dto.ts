import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateStoryDto {
  @ApiProperty({
    description: 'Publicly accessible URL to the story media (image for MVP)',
    example: 'https://images.example.com/story.jpg',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  mediaUrl: string;
}
