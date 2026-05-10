import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Story } from './entities/story.entity';
import { CreateStoryDto } from './dto/story.dto';

@Injectable()
export class StoriesService {
  constructor(
    @InjectRepository(Story)
    private storyRepository: Repository<Story>,
  ) {}

  async create(userId: string, dto: CreateStoryDto) {
    const mediaUrl = dto.mediaUrl?.trim();
    if (!mediaUrl) {
      throw new BadRequestException('mediaUrl is required');
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const story = this.storyRepository.create({
      userId,
      mediaUrl,
      expiresAt,
    });

    const saved = await this.storyRepository.save(story);

    const hydrated = await this.storyRepository.findOne({
      where: { id: saved.id },
      relations: ['user'],
    });

    return this.formatStory(hydrated ?? saved);
  }

  async getFeed(userId: string, limit: number = 50) {
    const safeLimit = Math.min(
      Math.max(parseInt(limit as any, 10) || 50, 1),
      200,
    );

    const followingRaw: Array<{ following_id: string }> =
      await this.storyRepository.query(
        `SELECT following_id FROM user_followers WHERE follower_id = ?`,
        [userId],
      );

    const followingIds = followingRaw
      .map((row) => row.following_id)
      .filter((id) => !!id);

    const userIds = Array.from(new Set([userId, ...followingIds]));

    const now = new Date();

    const stories = await this.storyRepository
      .createQueryBuilder('story')
      .leftJoinAndSelect('story.user', 'user')
      .where('story.userId IN (:...userIds)', { userIds })
      .andWhere('story.expiresAt > :now', { now })
      .orderBy('story.createdAt', 'DESC')
      .take(safeLimit)
      .getMany();

    return {
      data: stories.map((s) => this.formatStory(s)),
    };
  }

  private formatStory(story: Story) {
    return {
      id: story.id,
      mediaUrl: story.mediaUrl,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      user: story.user
        ? {
            id: story.user.id,
            name: story.user.name,
            avatarUrl: story.user.avatarUrl,
            isVerified: story.user.isVerified,
          }
        : {
            id: story.userId,
            name: 'Unknown User',
            avatarUrl: null,
            isVerified: false,
          },
    };
  }
}
