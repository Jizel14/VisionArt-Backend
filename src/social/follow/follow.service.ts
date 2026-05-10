import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserFollower } from './entities/user-follower.entity';
import { User } from '../../users/user.entity';
import { UsersService } from '../../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FollowService {
  constructor(
    @InjectRepository(UserFollower)
    private followerRepository: Repository<UserFollower>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private usersService: UsersService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Follow a user
   */
  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('Cannot follow yourself');
    }

    const following = await this.usersService.findById(followingId);
    if (!following) {
      throw new NotFoundException('User not found');
    }

    const follower = await this.usersService.findById(followerId);
    if (!follower) {
      throw new NotFoundException('Current user not found');
    }

    // Check if already following
    const existing = await this.followerRepository.findOne({
      where: { followerId, followingId },
    });

    if (existing) {
      // Idempotent response
      return {
        success: true,
        message: 'Already following',
        follower: {
          id: follower.id,
          name: follower.name,
          email: follower.email,
        },
        following: {
          id: following.id,
          name: following.name,
          email: following.email,
        },
        followedAt: existing.followedAt,
      };
    }

    // Create follow relationship
    const userFollow = this.followerRepository.create({
      followerId,
      followingId,
    });

    const saved = await this.followerRepository.save(userFollow);

    // Update denormalized counts
    await this.userRepository.increment(
      { id: followerId },
      'followingCount',
      1,
    );
    await this.userRepository.increment(
      { id: followingId },
      'followersCount',
      1,
    );

    await this.notificationsService.notifyFollow({
      followerId,
      followerName: follower.name,
      followedUserId: followingId,
    });

    return {
      success: true,
      message: 'Followed successfully',
      follower: {
        id: follower.id,
        name: follower.name,
        email: follower.email,
      },
      following: {
        id: following.id,
        name: following.name,
        email: following.email,
      },
      followedAt: saved.followedAt,
    };
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(followerId: string, followingId: string) {
    const existing = await this.followerRepository.findOne({
      where: { followerId, followingId },
    });

    if (!existing) {
      // Idempotent response
      return { success: true, message: 'Unfollowed successfully' };
    }

    await this.followerRepository.remove(existing);

    // Update denormalized counts
    await this.userRepository.decrement(
      { id: followerId },
      'followingCount',
      1,
    );
    await this.userRepository.decrement(
      { id: followingId },
      'followersCount',
      1,
    );

    return { success: true, message: 'Unfollowed successfully' };
  }

  /**
   * Get followers of a user
   */
  async getFollowers(userId: string, page: number = 1, limit: number = 20) {
    const [followers, total] = await this.followerRepository.findAndCount({
      where: { followingId: userId },
      relations: ['follower'],
      skip: (page - 1) * limit,
      take: limit,
      order: { followedAt: 'DESC' },
    });

    const data = await Promise.all(
      followers.map(async (f) => {
        const isFollowingBack = await this.isFollowing(userId, f.followerId);
        return {
          id: f.id,
          follower: {
            id: f.follower.id,
            name: f.follower.name,
            email: f.follower.email,
            bio: f.follower.bio,
            avatarUrl: f.follower.avatarUrl,
            followersCount: f.follower.followersCount,
            followingCount: f.follower.followingCount,
            isVerified: f.follower.isVerified,
          },
          followedAt: f.followedAt,
          isFollowingBack,
        };
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
   * Get users that a user is following
   */
  async getFollowing(userId: string, page: number = 1, limit: number = 20) {
    const [following, total] = await this.followerRepository.findAndCount({
      where: { followerId: userId },
      relations: ['following'],
      skip: (page - 1) * limit,
      take: limit,
      order: { followedAt: 'DESC' },
    });

    const data = await Promise.all(
      following.map(async (f) => {
        const isFollowedBack = await this.isFollowing(f.followingId, userId);
        return {
          id: f.id,
          follower: {
            id: f.following.id,
            name: f.following.name,
            email: f.following.email,
            bio: f.following.bio,
            avatarUrl: f.following.avatarUrl,
            followersCount: f.following.followersCount,
            followingCount: f.following.followingCount,
            isVerified: f.following.isVerified,
          },
          followedAt: f.followedAt,
          isFollowingBack: isFollowedBack,
        };
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
   * Get follow status between two users
   */
  async getFollowStatus(userId: string, targetUserId: string) {
    const isFollowing = await this.isFollowing(userId, targetUserId);
    const isFollowedBy = await this.isFollowing(targetUserId, userId);

    // Get target user counts
    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId },
      select: ['followersCount', 'followingCount'],
    });

    return {
      isFollowing,
      isFollowedBy,
      isMutual: isFollowing && isFollowedBy,
      followerCount: targetUser?.followersCount || 0,
      followingCount: targetUser?.followingCount || 0,
    };
  }

  /**
   * Check if user A is following user B
   */
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const following = await this.followerRepository.findOne({
      where: { followerId, followingId },
    });
    return !!following;
  }

  /**
   * Get suggested users to follow
   */
  async getSuggestions(userId: string, limit: number = 10) {
    // Get users with most followers, excluding self and already following
    const following = await this.followerRepository.find({
      where: { followerId: userId },
      select: ['followingId'],
    });

    const followingIds = following.map((f) => f.followingId);
    followingIds.push(userId); // Exclude self

    const suggestions = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id NOT IN (:...ids)', { ids: followingIds })
      .orderBy('user.followersCount', 'DESC')
      .limit(limit)
      .getMany();

    const result = suggestions.map((user) => ({
      id: user.id,
      name: user.name,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      followersCount: user.followersCount,
      publicGenerationsCount: user.publicGenerationsCount,
      mutualFollowers: 0, // TODO: Calculate mutual followers if needed
      reason: `Followed by ${user.followersCount} people`,
    }));

    return { suggestions: result };
  }

  /**
   * Get follower count for a user
   */
  async getFollowerCount(userId: string): Promise<number> {
    return this.followerRepository.count({
      where: { followingId: userId },
    });
  }

  /**
   * Get following count for a user
   */
  async getFollowingCount(userId: string): Promise<number> {
    return this.followerRepository.count({
      where: { followerId: userId },
    });
  }

  /**
   * Get all user IDs that a user is following
   * Returns a Set for O(1) lookup
   */
  async getFollowingIds(userId: string): Promise<Set<string>> {
    const following = await this.followerRepository.find({
      where: { followerId: userId },
      select: ['followingId'],
    });
    return new Set(following.map((f) => f.followingId));
  }
}
