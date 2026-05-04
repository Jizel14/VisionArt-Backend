import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from 'src/users/user.entity';
import { UserPreferences } from 'src/user-preferences/entities/user-preferences.entity';
import { UserFollower } from 'src/social/follow/entities/user-follower.entity';
import { Artwork } from 'src/social/artworks/entities/artwork.entity';
import { ArtworkLike } from 'src/social/artworks/entities/artwork-like.entity';
import { ArtworkComment } from 'src/social/artworks/entities/artwork-comment.entity';
import { ArtworkCommentMention } from 'src/social/artworks/entities/artwork-comment-mention.entity';
import { ArtworkReport } from 'src/social/moderation/entities/artwork-report.entity';
import { ArtworkSave } from 'src/social/collections/entities/artwork-save.entity';
import { UserNotification } from 'src/social/notifications/entities/user-notification.entity';
import { Story } from 'src/social/stories/entities/story.entity';
import { MarketplaceWallet } from 'src/marketplace/entities/marketplace-wallet.entity';
import { MarketplaceWalletTransaction } from 'src/marketplace/entities/marketplace-wallet-transaction.entity';
import { MarketplaceListing } from 'src/marketplace/entities/marketplace-listing.entity';
import { MarketplaceNegotiation } from 'src/marketplace/entities/marketplace-negotiation.entity';
import { MarketplaceNegotiationMessage } from 'src/marketplace/entities/marketplace-negotiation-message.entity';
import { Conversation } from 'src/chat/entities/conversation.entity';
import { ConversationParticipant } from 'src/chat/entities/conversation-participant.entity';
import { Message } from 'src/chat/entities/message.entity';
import { MessageReaction } from 'src/chat/entities/message-reaction.entity';

export const getDatabaseConfig = (): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10) || 3306,
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'visionart',
  entities: [
    User,
    UserPreferences,
    UserFollower,
    Artwork,
    ArtworkLike,
    ArtworkComment,
    ArtworkCommentMention,
    ArtworkReport,
    ArtworkSave,
    UserNotification,
    Story,
    MarketplaceWallet,
    MarketplaceWalletTransaction,
    MarketplaceListing,
    MarketplaceNegotiation,
    MarketplaceNegotiationMessage,
    Conversation,
    ConversationParticipant,
    Message,
    MessageReaction,
  ],
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  logging: process.env.DB_LOGGING === 'true',
  charset: 'utf8mb4',
});
