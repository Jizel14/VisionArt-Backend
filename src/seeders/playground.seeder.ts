import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';

import { Artwork } from '../social/artworks/entities/artwork.entity';
import { UserFollower } from '../social/follow/entities/user-follower.entity';
import { ArtworkLike } from '../social/artworks/entities/artwork-like.entity';
import { ArtworkComment } from '../social/artworks/entities/artwork-comment.entity';
import { UserPreferences } from 'src/user-preferences/entities/user-preferences.entity';
import { MarketplaceWallet } from '../marketplace/entities/marketplace-wallet.entity';
import { MarketplaceWalletTransaction } from '../marketplace/entities/marketplace-wallet-transaction.entity';
import { MarketplaceListing } from '../marketplace/entities/marketplace-listing.entity';
import { Story } from '../social/stories/entities/story.entity';

@Injectable()
export class PlaygroundSeeder {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserPreferences)
    private preferencesRepository: Repository<UserPreferences>,
    @InjectRepository(Artwork)
    private artworkRepository: Repository<Artwork>,
    @InjectRepository(UserFollower)
    private followerRepository: Repository<UserFollower>,
    @InjectRepository(ArtworkLike)
    private likeRepository: Repository<ArtworkLike>,
    @InjectRepository(ArtworkComment)
    private commentRepository: Repository<ArtworkComment>,
    @InjectRepository(MarketplaceWallet)
    private walletRepository: Repository<MarketplaceWallet>,
    @InjectRepository(MarketplaceWalletTransaction)
    private walletTxRepository: Repository<MarketplaceWalletTransaction>,
    @InjectRepository(MarketplaceListing)
    private listingRepository: Repository<MarketplaceListing>,
    @InjectRepository(Story)
    private storyRepository: Repository<Story>,
  ) {}

  async seed(): Promise<void> {
    console.log('🌱 Starting playground seeder...');

    // Clear existing data
    await this.clearData();

    // Create 10 users with rich profiles
    const users = await this.createUsers();
    console.log(`✅ Created ${users.length} users`);

    // Create user preferences for each user
    await this.createPreferences(users);
    console.log(`✅ Created preferences for ${users.length} users`);

    // Create follow relationships
    await this.createFollowRelationships(users);
    console.log(`✅ Created follow relationships`);

    // Create stories
    const stories = await this.createStories(users);
    console.log(`✅ Created ${stories.length} stories`);

    // Create artworks
    const artworks = await this.createArtworks(users);
    console.log(`✅ Created ${artworks.length} artworks`);

    const totalArtworks = await this.artworkRepository.count();
    if (totalArtworks === 0) {
      throw new Error(
        'Playground seeder: 0 rows in `artworks` after insert. Check DB errors (FK, NOT NULL columns, URL length).',
      );
    }
    console.log(`✅ Verified ${totalArtworks} artwork row(s) in database`);

    // Create likes on artworks
    await this.createLikes(users, artworks);
    console.log(`✅ Created likes on artworks`);

    // Create comments on artworks
    await this.createComments(users, artworks);
    console.log(`✅ Created comments on artworks`);

    // Create marketplace demo data
    await this.createMarketplaceData(users, artworks);
    console.log(`✅ Created marketplace wallets and listings`);

    await this.ensureBackofficeAdmin();

    console.log('🎉 Playground seeder completed successfully!');
  }

  /** Ignore missing tables (older DBs). */
  private async safeQuery(sql: string): Promise<void> {
    try {
      await this.userRepository.query(sql);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const msg = String(err?.message ?? e);
      if (
        err?.code === 'ER_NO_SUCH_TABLE' ||
        msg.includes('doesn\'t exist') ||
        msg.includes("doesn't exist")
      ) {
        return;
      }
      throw e;
    }
  }

  private async clearData(): Promise<void> {
    console.log('🗑️ Clearing existing data...');

    // Retention / loyalty / subs / reports (often block user or artwork deletes)
    await this.safeQuery('DELETE FROM retention_events');
    await this.safeQuery('DELETE FROM retention_actions');
    await this.safeQuery('DELETE FROM retention_runs');
    await this.safeQuery('DELETE FROM loyalty_events');
    await this.safeQuery('DELETE FROM loyalty_points');
    await this.safeQuery('DELETE FROM promo_codes');
    await this.safeQuery('DELETE FROM subscriptions');
    await this.safeQuery('DELETE FROM reports');
    await this.safeQuery('DELETE FROM artwork_reports');
    await this.safeQuery('DELETE FROM user_notifications');
    await this.safeQuery('DELETE FROM artwork_comment_mentions');
    await this.safeQuery('DELETE FROM artwork_saves');

    // Marketplace (negotiations reference listings)
    await this.safeQuery('DELETE FROM marketplace_negotiation_messages');
    await this.safeQuery('DELETE FROM marketplace_negotiations');
    await this.walletTxRepository.query(
      'DELETE FROM marketplace_wallet_transactions',
    );
    await this.listingRepository.query('DELETE FROM marketplace_listings');
    await this.walletRepository.query('DELETE FROM marketplace_wallets');
    await this.storyRepository.query('DELETE FROM stories');
    await this.commentRepository.query('DELETE FROM artwork_comments');
    await this.likeRepository.query('DELETE FROM artwork_likes');
    await this.followerRepository.query('DELETE FROM user_followers');
    await this.artworkRepository.query('DELETE FROM artworks');
    await this.preferencesRepository.query('DELETE FROM user_preferences');
    await this.userRepository.query('DELETE FROM users');

    try {
      await this.userRepository.query('ALTER TABLE users AUTO_INCREMENT = 1');
    } catch {
      /* UUID PK: no auto_increment */
    }
  }

  /**
   * Backoffice login uses `users` with is_admin = 1 (see backoffice /api/auth/login).
   * Env: BACKOFFICE_ADMIN_EMAIL, BACKOFFICE_ADMIN_PASSWORD, BACKOFFICE_ADMIN_NAME
   */
  private async ensureBackofficeAdmin(): Promise<void> {
    const email = (
      process.env.BACKOFFICE_ADMIN_EMAIL || 'admin@visionart.app'
    ).toLowerCase();
    const password =
      process.env.BACKOFFICE_ADMIN_PASSWORD || 'Admin123!';
    const name =
      process.env.BACKOFFICE_ADMIN_NAME || 'Backoffice Admin';
    const passwordHash = await bcrypt.hash(password, 10);

    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      await this.userRepository.update(existing.id, {
        isAdmin: true,
        passwordHash,
        name,
      });
      console.log(`✅ Backoffice admin ready: ${email} (password updated)`);
      return;
    }

    const admin = this.userRepository.create({
      email,
      passwordHash,
      name,
      bio: null,
      avatarUrl: null,
      phoneNumber: null,
      website: null,
      isVerified: true,
      isPrivateAccount: false,
      isAdmin: true,
      followersCount: 0,
      followingCount: 0,
      publicGenerationsCount: 0,
    });
    await this.userRepository.save(admin);

    const preferences = this.preferencesRepository.create({
      userId: admin.id,
      theme: 'dark',
      preferredLanguage: 'fr',
      notificationsEnabled: true,
      emailNotificationsEnabled: false,
      enableNSFWFilter: true,
      generationQuality: 'balanced',
      artComplexity: 'moderate',
      enableLocationContext: false,
      enableWeatherContext: false,
      enableCalendarContext: false,
      enableMusicContext: false,
      enableTimeContext: true,
      defaultResolution: '1024x1024',
      defaultAspectRatio: 'square',
      dataRetentionPeriod: 365,
      allowDataForTraining: false,
      shareGenerationsPublicly: false,
    });
    await this.preferencesRepository.save(preferences);

    console.log(`✅ Backoffice admin created: ${email}`);
  }

  private async createUsers(): Promise<User[]> {
    const userData = [
      {
        email: 'user1@test.com',
        name: 'user1',
        password: 'TestPassword123!',
        bio: 'Demo account for feed preview',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=user1&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'alex.artist@test.com',
        name: 'Alex Artist',
        password: 'TestPassword123!',
        bio: 'Digital artist exploring AI-generated abstract art',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=alex&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'bella.creative@test.com',
        name: 'Bella Creative',
        password: 'TestPassword123!',
        bio: 'Creating surreal landscapes with AI assistance',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=bella&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'c',
        name: 'Carlos Designs',
        password: 'TestPassword123!',
        bio: 'UI/UX designer and digital artist',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=carlos&backgroundColor=b6e3f4',
        isVerified: false,
        isPrivateAccount: false,
      },
      {
        email: 'diana.vault@test.com',
        name: 'Diana Vault',
        password: 'TestPassword123!',
        bio: 'Collecting rare digital art 🎨',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=diana&backgroundColor=b6e3f4',
        isVerified: false,
        isPrivateAccount: true,
      },
      {
        email: 'ethan.vision@test.com',
        name: 'Ethan Vision',
        password: 'TestPassword123!',
        bio: 'Photographer + AI enthusiast experimenting with generative art',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=ethan&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'fiona.flux@test.com',
        name: 'Fiona Flux',
        password: 'TestPassword123!',
        bio: 'Exploring the intersection of technology and creativity',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=fiona&backgroundColor=b6e3f4',
        isVerified: false,
        isPrivateAccount: false,
      },
      {
        email: 'grace.gallery@test.com',
        name: 'Grace Gallery',
        password: 'TestPassword123!',
        bio: 'Art curator and community builder 🌟',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=grace&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'henry.hues@test.com',
        name: 'Henry Hues',
        password: 'TestPassword123!',
        bio: 'Color science and visual effects artist',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=henry&backgroundColor=b6e3f4',
        isVerified: false,
        isPrivateAccount: false,
      },
      {
        email: 'iris.infinity@test.com',
        name: 'Iris Infinity',
        password: 'TestPassword123!',
        bio: 'Pushing the boundaries of what AI art can be',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=iris&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'jack.journey@test.com',
        name: 'Jack Journey',
        password: 'TestPassword123!',
        bio: 'Travel photographer integrating AI for creative storytelling',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=jack&backgroundColor=b6e3f4',
        isVerified: false,
        isPrivateAccount: false,
      },
    ];

    const users: User[] = [];

    for (const data of userData) {
      const hashedPassword = await bcrypt.hash(data.password, 10);

      const user = this.userRepository.create({
        email: data.email,
        name: data.name,
        passwordHash: hashedPassword,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
        isVerified: data.isVerified,
        isPrivateAccount: data.isPrivateAccount,
        followersCount: 0,
        followingCount: 0,
        publicGenerationsCount: 0,
      });

      const saved = await this.userRepository.save(user);
      users.push(saved);
    }

    return users;
  }

  private async createPreferences(users: User[]): Promise<void> {
    const themes: Array<'light' | 'dark' | 'auto'> = ['light', 'dark', 'auto'];
    const languages: Array<'fr' | 'en' | 'ar'> = ['fr', 'en', 'ar'];
    const qualities: Array<'fast' | 'balanced' | 'quality'> = [
      'fast',
      'balanced',
      'quality',
    ];
    const complexities: Array<'minimal' | 'moderate' | 'detailed'> = [
      'minimal',
      'moderate',
      'detailed',
    ];

    for (const user of users) {
      const preferences = this.preferencesRepository.create({
        userId: user.id,
        theme: themes[Math.floor(Math.random() * themes.length)],
        preferredLanguage:
          languages[Math.floor(Math.random() * languages.length)],
        notificationsEnabled: true,
        emailNotificationsEnabled: false,
        enableNSFWFilter: true,
        generationQuality:
          qualities[Math.floor(Math.random() * qualities.length)],
        artComplexity:
          complexities[Math.floor(Math.random() * complexities.length)],
        enableLocationContext: false,
        enableWeatherContext: false,
        enableCalendarContext: false,
        enableMusicContext: false,
        enableTimeContext: true,
        defaultResolution: '1024x1024',
        defaultAspectRatio: 'square',
        dataRetentionPeriod: 365,
        allowDataForTraining: true,
        shareGenerationsPublicly: !user.isPrivateAccount,
      });

      await this.preferencesRepository.save(preferences);
    }
  }

  private async createStories(users: User[]): Promise<Story[]> {
    const now = Date.now();
    const expiresInMs = 24 * 60 * 60 * 1000;

    const stories: Story[] = [];

    for (const user of users) {
      const storiesCount = 1 + Math.floor(Math.random() * 3);

      for (let i = 0; i < storiesCount; i++) {
        const seed = `${user.id}-${i + 1}`;
        const mediaUrl = `https://picsum.photos/seed/visionart-${seed}/1080/1920`;
        const expiresAt = new Date(now + expiresInMs);

        const story = this.storyRepository.create({
          userId: user.id,
          mediaUrl,
          expiresAt,
        });

        stories.push(story);
      }
    }

    return this.storyRepository.save(stories);
  }

  private async createFollowRelationships(users: User[]): Promise<void> {
    // User 0 (demo user1) follows everyone else
    const demoUser = users[0];
    for (let i = 1; i < users.length; i++) {
      const follower = this.followerRepository.create({
        followerId: demoUser.id,
        followingId: users[i].id,
      });

      await this.followerRepository.save(follower);

      // Update counts
      await this.userRepository.increment(
        { id: demoUser.id },
        'followingCount',
        1,
      );
      await this.userRepository.increment(
        { id: users[i].id },
        'followersCount',
        1,
      );
    }

    // Create cross-follow patterns for other users
    const patterns = [
      [], // User 0 (demo) - already handled above
      [2, 3, 5, 7, 9], // User 1 follows
      [1, 3, 4, 8], // User 2 follows
      [1, 2, 5, 6], // User 3 follows
      [1, 2, 3, 7, 9], // User 4 follows
      [2, 4, 6, 8], // User 5 follows
      [1, 2, 3, 5, 9], // User 6 follows
      [3, 4, 6, 8], // User 7 follows
      [1, 2, 4, 7, 9], // User 8 follows
      [2, 3, 5, 7, 8], // User 9 follows
    ];

    for (let i = 1; i < users.length && i < patterns.length; i++) {
      const followingIndices = patterns[i] || [];

      for (const followingIndex of followingIndices) {
        if (followingIndex < users.length && followingIndex !== i) {
          const existing = await this.followerRepository.findOne({
            where: {
              followerId: users[i].id,
              followingId: users[followingIndex].id,
            },
          });

          if (!existing) {
            const follower = this.followerRepository.create({
              followerId: users[i].id,
              followingId: users[followingIndex].id,
            });

            await this.followerRepository.save(follower);

            // Update counts
            await this.userRepository.increment(
              { id: users[i].id },
              'followingCount',
              1,
            );
            await this.userRepository.increment(
              { id: users[followingIndex].id },
              'followersCount',
              1,
            );
          }
        }
      }
    }
  }

  private async createArtworks(users: User[]): Promise<Artwork[]> {
    const artworks: Artwork[] = [];
    const samples = [
      {
        title: 'Neon Dreams',
        description: 'A vibrant exploration of cyberpunk aesthetics',
        prompt: {
          text: 'neon cyberpunk city at night, glowing signs, rain reflections',
          style: 'digital art',
          mood: 'cyberpunk',
        },
        imageUrl: 'https://picsum.photos/id/10/400/400',
        thumbnailUrl: 'https://picsum.photos/id/10/200/200',
      },
      {
        title: 'Serene Mountain Lake',
        description: 'Peaceful landscape at sunrise',
        prompt: {
          text: 'misty mountain lake at dawn, golden light, calm water',
          style: 'landscape photography',
          mood: 'peaceful',
        },
        imageUrl: 'https://picsum.photos/id/20/400/400',
        thumbnailUrl: 'https://picsum.photos/id/20/200/200',
      },
      {
        title: 'Abstract Consciousness',
        description: 'Digital representation of thought and emotion',
        prompt: {
          text: 'abstract swirling colors, consciousness visualization, ethereal',
          style: 'abstract art',
          mood: 'philosophical',
        },
        imageUrl: 'https://picsum.photos/id/30/400/400',
        thumbnailUrl: 'https://picsum.photos/id/30/200/200',
      },
      {
        title: 'Retro Future',
        description: 'Blending vintage and futuristic elements',
        prompt: {
          text: '1980s retro car in futuristic neon city, synthwave',
          style: 'retro-future',
          mood: 'nostalgic',
        },
        imageUrl: 'https://picsum.photos/id/40/400/400',
        thumbnailUrl: 'https://picsum.photos/id/40/200/200',
      },
      {
        title: 'Deep Ocean',
        description: 'Exploration of underwater mysteries',
        prompt: {
          text: 'deep sea creatures, bioluminescence, dark water, mystery',
          style: 'fantasy illustration',
          mood: 'mysterious',
        },
        imageUrl: 'https://picsum.photos/id/50/400/400',
        thumbnailUrl: 'https://picsum.photos/id/50/200/200',
      },
      {
        title: 'Golden Wheat Fields',
        description: 'Rural serenity and natural beauty',
        prompt: {
          text: 'golden wheat field under blue sky, peaceful countryside',
          style: 'impressionist',
          mood: 'serene',
        },
        imageUrl: 'https://picsum.photos/id/60/400/400',
        thumbnailUrl: 'https://picsum.photos/id/60/200/200',
      },
      {
        title: 'Urban Jungle',
        description: 'Nature reclaiming the city',
        prompt: {
          text: 'overgrown city buildings covered in vines and plants',
          style: 'digital art',
          mood: 'dystopian',
        },
        imageUrl: 'https://picsum.photos/id/70/400/400',
        thumbnailUrl: 'https://picsum.photos/id/70/200/200',
      },
      {
        title: 'Crystalline Dreams',
        description: 'Geometric beauty and symmetry',
        prompt: {
          text: 'perfect geometric crystals, fractal patterns, vibrant colors',
          style: 'fractal art',
          mood: 'mesmerizing',
        },
        imageUrl: 'https://picsum.photos/id/80/400/400',
        thumbnailUrl: 'https://picsum.photos/id/80/200/200',
      },
    ];

    // Create 3 artworks per user so the feed is always populated
    for (let userIdx = 0; userIdx < users.length; userIdx++) {
      const count = 3;

      for (let j = 0; j < count; j++) {
        const sample = samples[(userIdx * 3 + j) % samples.length];
        const isPublic = true;

        const picId = ((userIdx * 3 + j) % 79) + 1;
        const artwork = this.artworkRepository.create({
          userId: users[userIdx].id,
          title: `${sample.title} #${j + 1}`,
          description: sample.description,
          prompt: sample.prompt,
          imageUrl: `https://picsum.photos/id/${picId}/400/400`,
          thumbnailUrl: `https://picsum.photos/id/${picId}/200/200`,
          isPublic,
          isNSFW: false,
          metadata: {
            model: 'stable-diffusion-3',
            steps: 50,
            cfgScale: 7.5,
          },
          likesCount: 0,
          commentsCount: 0,
          remixCount: 0,
        });

        const saved = await this.artworkRepository.save(artwork);
        artworks.push(saved);

        // Update user's public generations count
        if (isPublic) {
          await this.userRepository.increment(
            { id: users[userIdx].id },
            'publicGenerationsCount',
            1,
          );
        }
      }
    }

    return artworks;
  }

  private async createLikes(users: User[], artworks: Artwork[]): Promise<void> {
    // Each user likes 3-5 random artworks
    for (const user of users) {
      const likeCount = Math.floor(Math.random() * 3) + 3; // 3-5 likes

      for (let i = 0; i < likeCount; i++) {
        const randomArtwork =
          artworks[Math.floor(Math.random() * artworks.length)];

        // Check if already liked
        const existing = await this.likeRepository.findOne({
          where: {
            userId: user.id,
            artworkId: randomArtwork.id,
          },
        });

        if (!existing) {
          const like = this.likeRepository.create({
            userId: user.id,
            artworkId: randomArtwork.id,
          });

          await this.likeRepository.save(like);

          // Increment likes count
          await this.artworkRepository.increment(
            { id: randomArtwork.id },
            'likesCount',
            1,
          );
        }
      }
    }
  }

  private async createComments(
    users: User[],
    artworks: Artwork[],
  ): Promise<void> {
    const commentTexts = [
      'This is amazing! 🎨',
      'Love the colors and composition',
      'The prompt execution is perfect',
      'Really creative use of the style',
      'This inspired me to create something similar',
      'Beautiful work! The details are incredible',
      'How did you achieve this effect?',
      'This is what AI art should be',
      'Absolutely mind-blowing 🤯',
      'The lighting is just perfect',
    ];

    // Each artwork gets 1-3 comments
    for (const artwork of artworks) {
      if (!artwork.isPublic) continue; // Only comment on public artworks

      const commentCount = Math.floor(Math.random() * 3) + 1; // 1-3 comments

      for (let i = 0; i < commentCount; i++) {
        const randomUser = users[Math.floor(Math.random() * users.length)];
        const randomComment =
          commentTexts[Math.floor(Math.random() * commentTexts.length)];

        const comment = this.commentRepository.create({
          artworkId: artwork.id,
          userId: randomUser.id,
          content: randomComment,
          parentCommentId: null,
          isEdited: false,
        });

        await this.commentRepository.save(comment);

        // Increment comments count
        await this.artworkRepository.increment(
          { id: artwork.id },
          'commentsCount',
          1,
        );
      }
    }
  }

  private async createMarketplaceData(
    users: User[],
    artworks: Artwork[],
  ): Promise<void> {
    const walletsByUserId = new Map<string, MarketplaceWallet>();

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const openingBalance = i === 0 ? 600 : 120 + i * 17;

      const wallet = this.walletRepository.create({
        userId: user.id,
        availableBalance: openingBalance.toFixed(6),
        currency: 'USDC',
        walletAddress: `0x${(i + 1).toString(16).padStart(40, '0')}`,
      });

      const savedWallet = await this.walletRepository.save(wallet);
      walletsByUserId.set(user.id, savedWallet);

      const seedTopup = this.walletTxRepository.create({
        walletId: savedWallet.id,
        userId: user.id,
        type: 'topup',
        status: 'completed',
        amount: openingBalance.toFixed(6),
        currency: 'USDC',
        reference: 'seed-opening-balance',
        metadata: {
          source: 'playground-seed',
        },
      });
      await this.walletTxRepository.save(seedTopup);
    }

    const listingsToCreate = Math.min(10, artworks.length);
    for (let i = 0; i < listingsToCreate; i++) {
      const artwork = artworks[i];
      const price = 15 + i * 4;
      const negotiable = i % 3 === 0;

      const listing = this.listingRepository.create({
        artworkId: artwork.id,
        sellerId: artwork.userId,
        buyerId: null,
        price: price.toFixed(6),
        currency: 'USDC',
        paymentToken: null,
        negotiable,
        isActive: true,
        status: 'listed',
        txHash: null,
        soldAt: null,
      });

      await this.listingRepository.save(listing);
    }

    // Add one cancelled listing for status demo in tutor presentation.
    if (artworks.length > 10) {
      const cancelledArtwork = artworks[10];
      const cancelledListing = this.listingRepository.create({
        artworkId: cancelledArtwork.id,
        sellerId: cancelledArtwork.userId,
        buyerId: null,
        price: '29.000000',
        currency: 'USDC',
        paymentToken: null,
        negotiable: false,
        isActive: false,
        status: 'cancelled',
        txHash: null,
        soldAt: null,
      });
      await this.listingRepository.save(cancelledListing);
    }
  }
}
