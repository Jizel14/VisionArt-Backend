import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateConversationDto,
  EditMessageDto,
  ReactMessageDto,
  SendMessageDto,
} from './dto/chat.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations')
  async createConversation(
    @CurrentUser() userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createOrGetConversation(
      userId,
      dto.participantIds,
      dto.groupName,
    );
  }

  @Get('conversations')
  async listConversations(
    @CurrentUser() userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.listConversations(
      userId,
      Number(page || 1),
      Number(limit || 20),
    );
  }

  @Get('conversations/:conversationId/messages')
  async listMessages(
    @CurrentUser() userId: string,
    @Param('conversationId') conversationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.listMessages(
      userId,
      conversationId,
      Number(page || 1),
      Number(limit || 50),
    );
  }

  @Post('conversations/:conversationId/messages')
  async sendMessage(
    @CurrentUser() userId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(userId, conversationId, dto);
  }

  @Patch('messages/:messageId')
  async editMessage(
    @CurrentUser() userId: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.chatService.editMessage(userId, messageId, dto.content);
  }

  @Delete('messages/:messageId')
  async deleteMessage(
    @CurrentUser() userId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chatService.deleteMessage(userId, messageId);
  }

  @Post('messages/:messageId/reactions')
  async toggleReaction(
    @CurrentUser() userId: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReactMessageDto,
  ) {
    return this.chatService.toggleReaction(userId, messageId, dto.emoji);
  }

  @Post('conversations/:conversationId/read')
  async markAsRead(
    @CurrentUser() userId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.chatService.markAsRead(userId, conversationId);
  }
}
