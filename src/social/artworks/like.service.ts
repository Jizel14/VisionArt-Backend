import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArtworkLike } from './entities/artwork-like.entity';
import { Artwork } from './entities/artwork.entity';
import { User } from '../../users/user.entity';

@Injectable()
export class LikeService {
  constructor(
    @InjectRepository(ArtworkLike)
    private likeRepository: Repository<ArtworkLike>,
    @InjectRepository(Artwork)
    private artworkRepository: Repository<Artwork>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Like an artwork
   */
  async likeArtwork(userId: string, artworkId: string) {
    const artwork = await this.artworkRepository.findOne({
      where: { id: artworkId },
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    // Check if already liked
    const existing = await this.likeRepository.findOne({
      where: { userId, artworkId },
    });

    if (existing) {
      // Idempotent response
      return {
        success: true,
        likesCount: artwork.likesCount,
      };
    }

    // Create like
    const like = this.likeRepository.create({
      userId,
      artworkId,
    });

    await this.likeRepository.save(like);

    // Increment likes count
    await this.artworkRepository.increment({ id: artworkId }, 'likesCount', 1);

    // Fetch updated artwork to return count
    const updated = await this.artworkRepository.findOne({
      where: { id: artworkId },
    });

    return {
      success: true,
      likesCount: updated!.likesCount,
    };
  }

  /**
   * Unlike an artwork
   */
  async unlikeArtwork(userId: string, artworkId: string) {
    const like = await this.likeRepository.findOne({
      where: { userId, artworkId },
    });

    const artwork = await this.artworkRepository.findOne({
      where: { id: artworkId },
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    if (!like) {
      // Idempotent response
      return {
        success: true,
        likesCount: artwork.likesCount,
      };
    }

    await this.likeRepository.remove(like);

    // Decrement likes count
    await this.artworkRepository.decrement({ id: artworkId }, 'likesCount', 1);

    // Fetch updated artwork
    const updated = await this.artworkRepository.findOne({
      where: { id: artworkId },
    });

    return {
      success: true,
      likesCount: updated!.likesCount,
    };
  }

  /**
   * Get likes for an artwork
   */
  async getArtworkLikes(
    artworkId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const artwork = await this.artworkRepository.findOne({
      where: { id: artworkId },
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    const [likes, total] = await this.likeRepository.findAndCount({
      where: { artworkId },
      relations: ['user'],
      skip: (page - 1) * limit,
      take: limit,
      order: { likedAt: 'DESC' },
    });

    const data = likes.map((like) => ({
      user: {
        id: like.user.id,
        name: like.user.name,
        avatarUrl: like.user.avatarUrl,
      },
      likedAt: like.likedAt,
    }));

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
   * Check if user has liked an artwork
   */
  async hasLiked(userId: string, artworkId: string): Promise<boolean> {
    const like = await this.likeRepository.findOne({
      where: { userId, artworkId },
    });

    return !!like;
  }

  /**
   * Get count of likes for an artwork
   */
  async getLikesCount(artworkId: string): Promise<number> {
    return this.likeRepository.count({
      where: { artworkId },
    });
  }
}
