import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../../users/user.entity';
import { Artwork } from '../../artworks/entities/artwork.entity';

@Entity('artwork_saves')
@Index(['userId'])
@Index(['artworkId'])
@Index(['userId', 'artworkId'], { unique: true })
@Index(['userId', 'collectionName'])
export class ArtworkSave {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('uuid', { name: 'artwork_id' })
  artworkId: string;

  @Column({
    name: 'collection_name',
    type: 'varchar',
    length: 100,
    default: 'Favorites',
  })
  collectionName: string;

  @CreateDateColumn({ name: 'saved_at' })
  savedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Artwork, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'artwork_id' })
  artwork: Artwork;
}
