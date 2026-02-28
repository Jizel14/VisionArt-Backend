import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ArtworkSave } from './entities/artwork-save.entity';
import { Artwork } from '../artworks/entities/artwork.entity';
import { ArtworkLike } from '../artworks/entities/artwork-like.entity';
import { UserFollower } from '../follow/entities/user-follower.entity';
import { SaveArtworkDto } from './dto/collections.dto';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(ArtworkSave)
    private savesRepository: Repository<ArtworkSave>,
    @InjectRepository(Artwork)
    private artworksRepository: Repository<Artwork>,
    @InjectRepository(ArtworkLike)
    private likesRepository: Repository<ArtworkLike>,
    @InjectRepository(UserFollower)
    private followersRepository: Repository<UserFollower>,
  ) {}

  async saveArtwork(userId: string, artworkId: string, dto: SaveArtworkDto) {
    const artwork = await this.artworksRepository.findOne({
      where: { id: artworkId },
    });
    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    const collectionName = dto.collectionName?.trim() || 'Favorites';

    const existing = await this.savesRepository.findOne({
      where: { userId, artworkId },
    });

    if (existing) {
      if (existing.collectionName !== collectionName) {
        existing.collectionName = collectionName;
        await this.savesRepository.save(existing);
      }

      return {
        success: true,
        isSaved: true,
        collectionName,
      };
    }

    const created = this.savesRepository.create({
      userId,
      artworkId,
      collectionName,
    });

    await this.savesRepository.save(created);

    return {
      success: true,
      isSaved: true,
      collectionName,
    };
  }

  async unsaveArtwork(userId: string, artworkId: string) {
    const existing = await this.savesRepository.findOne({
      where: { userId, artworkId },
    });

    if (!existing) {
      return {
        success: true,
        isSaved: false,
      };
    }

    await this.savesRepository.remove(existing);

    return {
      success: true,
      isSaved: false,
    };
  }

  async getCollections(userId: string) {
    const rows = await this.savesRepository
      .createQueryBuilder('save')
      .select('save.collection_name', 'name')
      .addSelect('COUNT(*)', 'itemsCount')
      .where('save.user_id = :userId', { userId })
      .groupBy('save.collection_name')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('save.collection_name', 'ASC')
      .getRawMany<{ name: string; itemsCount: string }>();

    return {
      data: rows.map((row) => ({
        name: row.name,
        itemsCount: parseInt(row.itemsCount, 10) || 0,
      })),
    };
  }

  async getSavedArtworks(
    userId: string,
    page: number = 1,
    limit: number = 20,
    collectionName?: string,
  ) {
    const query = this.savesRepository
      .createQueryBuilder('save')
      .leftJoinAndSelect('save.artwork', 'artwork')
      .leftJoinAndSelect('artwork.user', 'user')
      .leftJoinAndSelect('artwork.remixedFrom', 'remixedFrom')
      .leftJoinAndSelect('remixedFrom.user', 'remixedFromUser')
      .where('save.userId = :userId', { userId })
      .andWhere('artwork.isPublic = true');

    if (collectionName && collectionName.trim().length > 0) {
      query.andWhere('save.collectionName = :collectionName', {
        collectionName: collectionName.trim(),
      });
    }

    const [saves, total] = await query
      .orderBy('save.savedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const artworkIds = saves.map((save) => save.artworkId);
    const authorIds = saves
      .map((save) => save.artwork?.userId)
      .filter((id): id is string => !!id);

    const likedIds = await this.getLikedArtworkIds(userId, artworkIds);
    const followingIds = await this.getFollowingIds(userId, authorIds);

    const data = saves
      .filter((save) => !!save.artwork)
      .map((save) => {
        const artwork = save.artwork;

        return {
          id: artwork.id,
          user: {
            id: artwork.user?.id || 'unknown',
            name: artwork.user?.name || 'Unknown User',
            email: artwork.user?.email || '',
            avatarUrl: artwork.user?.avatarUrl || null,
            bio: artwork.user?.bio || null,
            followersCount: artwork.user?.followersCount || 0,
            followingCount: artwork.user?.followingCount || 0,
            publicGenerationsCount: artwork.user?.publicGenerationsCount || 0,
            isVerified: artwork.user?.isVerified || false,
            isPrivateAccount: artwork.user?.isPrivateAccount || false,
            createdAt: artwork.user?.createdAt || new Date(),
            updatedAt:
              artwork.user?.updatedAt || artwork.user?.createdAt || new Date(),
          },
          title: artwork.title,
          description: artwork.description,
          imageUrl: artwork.imageUrl,
          thumbnailUrl: artwork.thumbnailUrl,
          likesCount: artwork.likesCount || 0,
          commentsCount: artwork.commentsCount || 0,
          remixCount: artwork.remixCount || 0,
          isLikedByMe: likedIds.has(artwork.id),
          isFollowedByMe: followingIds.has(artwork.userId),
          isSavedByMe: true,
          isPublic: artwork.isPublic,
          isNSFW: artwork.isNSFW,
          remixedFrom: artwork.remixedFrom
            ? {
                id: artwork.remixedFrom.id,
                user: {
                  name: artwork.remixedFrom.user?.name || 'Unknown',
                },
              }
            : null,
          createdAt: artwork.createdAt,
          savedAt: save.savedAt,
          collectionName: save.collectionName,
        };
      });

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

  async getSavedArtworkIds(
    userId: string | undefined,
    artworkIds: string[],
  ): Promise<Set<string>> {
    if (!userId || artworkIds.length === 0) {
      return new Set<string>();
    }

    const rows = await this.savesRepository.find({
      where: {
        userId,
        artworkId: In(artworkIds),
      },
      select: ['artworkId'],
    });

    return new Set(rows.map((row) => row.artworkId));
  }

  private async getLikedArtworkIds(
    userId: string,
    artworkIds: string[],
  ): Promise<Set<string>> {
    if (artworkIds.length === 0) return new Set<string>();

    const rows = await this.likesRepository.find({
      where: {
        userId,
        artworkId: In(artworkIds),
      },
      select: ['artworkId'],
    });

    return new Set(rows.map((row) => row.artworkId));
  }

  private async getFollowingIds(
    userId: string,
    authorIds: string[],
  ): Promise<Set<string>> {
    if (authorIds.length === 0) return new Set<string>();

    const rows = await this.followersRepository.find({
      where: {
        followerId: userId,
        followingId: In(authorIds),
      },
      select: ['followingId'],
    });

    return new Set(rows.map((row) => row.followingId));
  }
}
