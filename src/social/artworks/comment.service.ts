import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ArtworkComment } from './entities/artwork-comment.entity';
import { Artwork } from './entities/artwork.entity';
import { User } from '../../users/user.entity';
import { CreateCommentDto, UpdateCommentDto } from './dto/engagement.dto';

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(ArtworkComment)
    private commentRepository: Repository<ArtworkComment>,
    @InjectRepository(Artwork)
    private artworkRepository: Repository<Artwork>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
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
    }

    const comment = this.commentRepository.create({
      userId,
      artworkId,
      content: dto.content,
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

    comment.content = dto.content;
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

    // Delete comment (and cascade delete replies)
    await this.commentRepository.remove(comment);

    // Decrement comments count (only for top-level comments)
    if (!comment.parentCommentId) {
      await this.artworkRepository.decrement(
        { id: artworkId },
        'commentsCount',
        1,
      );
    }

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
      isEdited: comment.isEdited,
      createdAt: comment.createdAt,
    };
  }
}
