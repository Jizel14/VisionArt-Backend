import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ArtworkComment } from './entities/artwork-comment.entity';
import { Artwork } from './entities/artwork.entity';
import { User } from '../../users/user.entity';
import { CreateCommentDto, UpdateCommentDto } from './dto/engagement.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ArtworkCommentMention } from './entities/artwork-comment-mention.entity';

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(ArtworkComment)
    private commentRepository: Repository<ArtworkComment>,
    @InjectRepository(Artwork)
    private artworkRepository: Repository<Artwork>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(ArtworkCommentMention)
    private mentionsRepository: Repository<ArtworkCommentMention>,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Create a comment on an artwork
   */
  async create(userId: string, artworkId: string, dto: CreateCommentDto) {
    const artwork = await this.artworkRepository.findOne({
      where: { id: artworkId },
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    const content = dto.content?.trim() || '';
    if (!content) {
      throw new BadRequestException('Comment content cannot be empty');
    }

    // Validate parent comment if provided
    if (dto.parentCommentId) {
      const parentComment = await this.commentRepository.findOne({
        where: { id: dto.parentCommentId },
      });

      if (!parentComment) {
        throw new NotFoundException('Parent comment not found');
      }

      if (parentComment.artworkId !== artworkId) {
        throw new BadRequestException(
          'Parent comment does not belong to this artwork',
        );
      }

      if (parentComment.parentCommentId) {
        throw new BadRequestException('Only one level of replies is supported');
      }
    }

    const comment = this.commentRepository.create({
      userId,
      artworkId,
      content,
      parentCommentId: dto.parentCommentId || null,
    });

    const saved = await this.commentRepository.save(comment);

    // Increment comments count
    await this.artworkRepository.increment(
      { id: artworkId },
      'commentsCount',
      1,
    );

    const user = await this.userRepository.findOne({ where: { id: userId } });

    const mentionIds = await this.resolveMentionedUserIds(
      dto.mentionedUserIds,
      userId,
    );

    if (mentionIds.length > 0) {
      const mentionRows = mentionIds.map((mentionedUserId) =>
        this.mentionsRepository.create({
          commentId: saved.id,
          mentionedUserId,
        }),
      );
      await this.mentionsRepository.save(mentionRows);

      await Promise.all(
        mentionIds
          .filter((mentionedUserId) => mentionedUserId !== artwork.userId)
          .map((mentionedUserId) =>
            this.notificationsService.notifyMention({
              mentionedUserId,
              actorUserId: userId,
              actorName: user?.name || 'Someone',
              artworkId,
              artworkTitle: artwork.title,
            }),
          ),
      );
    }

    await this.notificationsService.notifyComment({
      commenterId: userId,
      commenterName: user?.name || 'Someone',
      artworkOwnerId: artwork.userId,
      artworkId,
      artworkTitle: artwork.title,
    });

    return this.formatCommentResponse(saved, user!);
  }

  /**
   * Get comments for an artwork
   */
  async findByArtwork(
    artworkId: string,
    page: number = 1,
    limit: number = 20,
    sort: string = 'newest',
  ) {
    const artwork = await this.artworkRepository.findOne({
      where: { id: artworkId },
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    // Get top-level comments
    const [comments, total] = await this.commentRepository.findAndCount({
      where: {
        artworkId,
        parentCommentId: IsNull(),
      },
      relations: ['user'],
      skip: (page - 1) * limit,
      take: limit,
      order: {
        createdAt: sort === 'newest' ? 'DESC' : 'ASC',
      },
    });

    const data = await Promise.all(
      comments.map(async (comment) => {
        const formatted = this.formatCommentResponse(comment, comment.user);

        // Get replies for this comment
        const replies = await this.commentRepository.find({
          where: { parentCommentId: comment.id },
          relations: ['user'],
          order: { createdAt: 'ASC' },
        });

        if (replies.length > 0) {
          formatted.replies = replies.map((reply) =>
            this.formatCommentResponse(reply, reply.user),
          );
        }

        return formatted;
      }),
    );

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update a comment
   */
  async update(commentId: string, userId: string, dto: UpdateCommentDto) {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
      relations: ['user'],
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const content = dto.content?.trim() || '';
    if (!content) {
      throw new BadRequestException('Comment content cannot be empty');
    }

    comment.content = content;
    comment.isEdited = true;

    const updated = await this.commentRepository.save(comment);

    return this.formatCommentResponse(updated, comment.user);
  }

  /**
   * Delete a comment
   */
  async delete(commentId: string, userId: string) {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    const artworkId = comment.artworkId;

    let deletedCount = 1;
    if (!comment.parentCommentId) {
      const repliesCount = await this.commentRepository.count({
        where: { parentCommentId: comment.id },
      });
      deletedCount += repliesCount;
    }

    // Delete comment (and cascade delete replies)
    await this.commentRepository.remove(comment);

    await this.artworkRepository.decrement(
      { id: artworkId },
      'commentsCount',
      deletedCount,
    );

    return { success: true, message: 'Comment deleted successfully' };
  }

  /**
   * Get count of comments for an artwork
   */
  async getCommentsCount(artworkId: string): Promise<number> {
    return this.commentRepository.count({
      where: { artworkId },
    });
  }

  async searchMentionUsers(query: string, limit: number = 8) {
    if (!query || query.trim().length < 1) {
      return { data: [] };
    }

    const keyword = query.trim().toLowerCase();

    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.name) LIKE :q', { q: `%${keyword}%` })
      .orderBy('user.name', 'ASC')
      .take(limit)
      .getMany();

    return {
      data: users.map((user) => ({
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
      })),
    };
  }

  private async resolveMentionedUserIds(
    rawMentionedUserIds: string[] | undefined,
    actorUserId: string,
  ): Promise<string[]> {
    const uniqueRequested = Array.from(
      new Set((rawMentionedUserIds ?? []).filter(Boolean)),
    );

    if (uniqueRequested.length === 0) {
      return [];
    }

    const existingUsers = await this.userRepository.find({
      where: { id: In(uniqueRequested) },
      select: ['id'],
    });

    return existingUsers
      .map((user) => user.id)
      .filter((id) => id !== actorUserId);
  }

  /**
   * Format comment response
   */
  private formatCommentResponse(
    comment: ArtworkComment,
    user: User,
  ): Record<string, any> {
    return {
      id: comment.id,
      user: {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      content: comment.content,
      parentCommentId: comment.parentCommentId,
      isEdited: comment.isEdited,
      createdAt: comment.createdAt,
    };
  }
}
