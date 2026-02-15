import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Artwork } from './entities/artwork.entity';
import { User } from '../../users/user.entity';
import { CreateArtworkDto, UpdateArtworkDto } from './dto/artwork.dto';
import { FollowService } from '../follow/follow.service';

@Injectable()
export class ArtworkService {
  constructor(
    @InjectRepository(Artwork)
    private artworkRepository: Repository<Artwork>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private followService: FollowService,
  ) {}

  /**
   * Create a new artwork
   */
  async create(userId: string, dto: CreateArtworkDto) {
    if (!dto.imageUrl) {
      throw new BadRequestException('Image URL is required');
    }

    // Validate remix target if provided
    if (dto.remixedFromId) {
      const original = await this.artworkRepository.findOne({
        where: { id: dto.remixedFromId },
      });

      if (!original) {
        throw new NotFoundException('Original artwork not found');
      }

      if (!original.isPublic) {
        throw new BadRequestException('Cannot remix a private artwork');
      }

      // Increment remix count on original
      await this.artworkRepository.increment(
        { id: original.id },
        'remixCount',
        1,
      );
    }

    const artwork = this.artworkRepository.create({
      userId,
      ...dto,
    });

    const saved = await this.artworkRepository.save(artwork);

    // Update user's public generations count if public
    if (dto.isPublic) {
      await this.userRepository.increment(
        { id: userId },
        'publicGenerationsCount',
        1,
      );
    }

    return this.formatArtworkResponse(saved, userId);
  }

  /**
   * Get artwork by ID
   */
  async findById(id: string, requesterId?: string) {
    const artwork = await this.artworkRepository.findOne({
      where: { id },
      relations: ['user', 'remixedFrom', 'remixedFrom.user'],
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    // Check access permissions
    if (!artwork.isPublic && artwork.userId !== requesterId) {
      throw new ForbiddenException(
        'You do not have permission to view this artwork',
      );
    }

    return this.formatArtworkResponse(artwork, requesterId);
  }

  /**
   * Get artworks by user ID
   */
  async findByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20,
    requesterId?: string,
    includePrivate: boolean = false,
  ) {
    const query = this.artworkRepository
      .createQueryBuilder('artwork')
      .where('artwork.userId = :userId', { userId })
      .leftJoinAndSelect('artwork.user', 'user')
      .orderBy('artwork.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Show private artworks only to owner
    if (!includePrivate && requesterId !== userId) {
      query.andWhere('artwork.isPublic = true');
    }

    const [artworks, total] = await query.getManyAndCount();

    const data = artworks.map((a) =>
      this.formatArtworkResponse(a, requesterId),
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
   * Update artwork (title, description, visibility)
   */
  async update(id: string, userId: string, dto: UpdateArtworkDto) {
    const artwork = await this.artworkRepository.findOne({
      where: { id },
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    if (artwork.userId !== userId) {
      throw new ForbiddenException('You can only edit your own artworks');
    }

    // Track visibility change
    const wasPublic = artwork.isPublic;
    if (dto.isPublic !== undefined && dto.isPublic !== wasPublic) {
      if (dto.isPublic) {
        // Made public
        await this.userRepository.increment(
          { id: userId },
          'publicGenerationsCount',
          1,
        );
      } else {
        // Made private
        await this.userRepository.decrement(
          { id: userId },
          'publicGenerationsCount',
          1,
        );
      }
    }

    Object.assign(artwork, dto);
    const updated = await this.artworkRepository.save(artwork);

    return this.formatArtworkResponse(updated, userId);
  }

  /**
   * Delete artwork
   */
  async delete(id: string, userId: string) {
    const artwork = await this.artworkRepository.findOne({
      where: { id },
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    if (artwork.userId !== userId) {
      throw new ForbiddenException('You can only delete your own artworks');
    }

    await this.artworkRepository.remove(artwork);

    // Update counts
    if (artwork.isPublic) {
      await this.userRepository.decrement(
        { id: userId },
        'publicGenerationsCount',
        1,
      );
    }

    return { success: true, message: 'Artwork deleted successfully' };
  }

  /**
   * Get personalized feed (followed users' public artworks)
   */
  async getFeed(
    userId: string,
    page: number = 1,
    limit: number = 20,
    sort: string = 'recent',
  ) {
    // Get users that current user is following
    const following = await this.artworkRepository.query(
      `SELECT following_id FROM user_followers WHERE follower_id = ?`,
      [userId],
    );

    const followingIds = [userId, ...following.map((f: any) => f.following_id)]; // Include self

    let query = this.artworkRepository
      .createQueryBuilder('artwork')
      .where('artwork.userId IN (:...ids)', { ids: followingIds })
      .andWhere('artwork.isPublic = true')
      .leftJoinAndSelect('artwork.user', 'user')
      .leftJoinAndSelect('artwork.remixedFrom', 'remixedFrom')
      .leftJoinAndSelect('remixedFrom.user', 'remixedFromUser');

    // Apply sorting
    switch (sort) {
      case 'popular':
        query = query.orderBy('artwork.likesCount', 'DESC');
        break;
      case 'trending':
        // Trending: recent + popular
        query = query
          .orderBy('artwork.likesCount', 'DESC')
          .addOrderBy('artwork.createdAt', 'DESC');
        break;
      default:
        query = query.orderBy('artwork.createdAt', 'DESC');
    }

    const [artworks, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = artworks.map((a) => this.formatArtworkResponse(a, userId));

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
   * Get public feed (all users' public artworks)
   */
  async getPublicFeed(
    userId: string,
    page: number = 1,
    limit: number = 20,
    sort: string = 'recent',
  ) {
    let query = this.artworkRepository
      .createQueryBuilder('artwork')
      .where('artwork.isPublic = true')
      .leftJoinAndSelect('artwork.user', 'user')
      .leftJoinAndSelect('artwork.remixedFrom', 'remixedFrom')
      .leftJoinAndSelect('remixedFrom.user', 'remixedFromUser');

    switch (sort) {
      case 'popular':
        query = query.orderBy('artwork.likesCount', 'DESC');
        break;
      case 'trending':
        query = query
          .orderBy('artwork.likesCount', 'DESC')
          .addOrderBy('artwork.createdAt', 'DESC');
        break;
      default:
        query = query.orderBy('artwork.createdAt', 'DESC');
    }

    const [artworks, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = artworks.map((a) => this.formatArtworkResponse(a, userId));

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
   * Get explore page (trending/popular artworks from all users)
   */
  async getExplore(
    page: number = 1,
    limit: number = 20,
    filter: string = 'trending',
  ) {
    let query = this.artworkRepository
      .createQueryBuilder('artwork')
      .where('artwork.isPublic = true')
      .andWhere('artwork.isNSFW = false')
      .leftJoinAndSelect('artwork.user', 'user')
      .leftJoinAndSelect('artwork.remixedFrom', 'remixedFrom')
      .leftJoinAndSelect('remixedFrom.user', 'remixedFromUser');

    // Apply filter
    switch (filter) {
      case 'popular':
        query = query.orderBy('artwork.likesCount', 'DESC');
        break;
      case 'trending':
        // Trending: recent artworks with decent likes
        query = query
          .orderBy('artwork.likesCount', 'DESC')
          .addOrderBy('artwork.createdAt', 'DESC');
        break;
      case 'featured':
        // Featured: from verified users
        query = query
          .leftJoinAndSelect('artwork.user', 'user')
          .where('user.isVerified = true')
          .orderBy('artwork.createdAt', 'DESC');
        break;
      default:
        query = query.orderBy('artwork.createdAt', 'DESC');
    }

    const [artworks, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = artworks.map((a) => this.formatArtworkResponse(a));

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
   * Get remixes of an artwork
   */
  async getRemixes(artworkId: string, page: number = 1, limit: number = 20) {
    const [remixes, total] = await this.artworkRepository.findAndCount({
      where: { remixedFromId: artworkId, isPublic: true },
      relations: ['user'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const data = remixes.map((a) => this.formatArtworkResponse(a));

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
   * Get artwork with prompt for remix purposes (internal use)
   */
  async getArtworkForRemix(id: string) {
    const artwork = await this.artworkRepository.findOne({
      where: { id, isPublic: true },
      select: ['id', 'imageUrl', 'prompt'],
    });

    if (!artwork) {
      throw new NotFoundException(
        'Artwork not found or is not public for remixing',
      );
    }

    return artwork;
  }

  /**
   * Format artwork response with like status
   */
  private formatArtworkResponse(artwork: Artwork, requesterId?: string) {
    if (!artwork.user) {
      console.error('Artwork found without user:', artwork.id);
      // Return a dummy user to prevent crash, or skip invalid data in caller (but map expects return)
      // Throwing might cause 500 for the whole feed.
      // Better to return dummy structure that flags it visually?
      // For now, assume user exists or use defaults.
    }

    return {
      id: artwork.id,
      user: {
        id: artwork.user?.id || 'unknown',
        name: artwork.user?.name || 'Unknown User',
        email: artwork.user?.email || '', // Required by frontend UserModel
        avatarUrl: artwork.user?.avatarUrl || null,
        bio: artwork.user?.bio || null,
        followersCount: artwork.user?.followersCount || 0,
        followingCount: artwork.user?.followingCount || 0, // Required by frontend UserModel
        publicGenerationsCount: artwork.user?.publicGenerationsCount || 0, // Required by frontend UserModel
        isVerified: artwork.user?.isVerified || false,
        isPrivateAccount: artwork.user?.isPrivateAccount || false, // Required by frontend UserModel
        createdAt: artwork.user?.createdAt || new Date(),
        updatedAt:
          artwork.user?.updatedAt || artwork.user?.createdAt || new Date(), // Required by frontend UserModel
      },
      title: artwork.title,
      description: artwork.description,
      imageUrl: artwork.imageUrl || '',
      thumbnailUrl: artwork.thumbnailUrl,
      likesCount: artwork.likesCount || 0,
      commentsCount: artwork.commentsCount || 0,
      remixCount: artwork.remixCount || 0,
      isLikedByMe: false, // Will be populated by LikeService if needed
      isPublic: artwork.isPublic,
      isNSFW: artwork.isNSFW,
      remixedFrom: artwork.remixedFrom
        ? {
            id: artwork.remixedFrom.id,
            user: { name: artwork.remixedFrom.user?.name || 'Unknown' },
          }
        : null,
      createdAt: artwork.createdAt,
    };
  }
}
