import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Artwork } from './artwork.entity';
import { Like } from './like.entity';
import { Comment } from './comment.entity';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class ArtworksService {
  private readonly logger = new Logger(ArtworksService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    @InjectRepository(Artwork)
    private readonly artworkRepo: Repository<Artwork>,
    @InjectRepository(Like)
    private readonly likeRepo: Repository<Like>,
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * Save a newly generated artwork for a user.
   */
  async create(data: {
    userId: string;
    prompt: string;
    style?: string;
    aspectRatio?: string;
    imageData: string;
    mimeType: string;
  }): Promise<Artwork> {
    const artwork = this.artworkRepo.create({
      userId: data.userId,
      prompt: data.prompt,
      style: data.style || null,
      aspectRatio: data.aspectRatio || null,
      imageData: data.imageData,
      mimeType: data.mimeType,
    });
    return this.artworkRepo.save(artwork);
  }

  /**
   * Get all artworks for a user, newest first, with pagination.
   */
  async findByUser(
    userId: string,
    page: number = 1,
    limit: number = 20,
    search?: string,
    filter?: string,
  ): Promise<{ data: Artwork[]; total: number; page: number; limit: number; totalPages: number }> {
    const skip = (page - 1) * limit;

    let qb = this.artworkRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'user')
      .where('a.userId = :userId', { userId });

    // 1. Apply Categorical Filters
    if (filter) {
      switch (filter.toLowerCase()) {
        case 'popular':
          // Sort by likes count (assuming we join or have a column, but here we'll just sort by createdAt as fallback or specific logic)
          // For true popular, we would need to join likes or have a likesCount column.
          // Since we don't have a likesCount column in the entity (it's calculated), 
          // let's assume we want artworks with at least one like or just sort.
          // Optimization: Normally you'd want a count column.
          qb = qb.addSelect(subQuery => {
            return subQuery.select('COUNT(l.id)', 'lCount')
              .from(Like, 'l')
              .where('l.artworkId = a.id');
          }, 'likesCount')
          .orderBy('likesCount', 'DESC');
          break;
        case 'remixed':
          qb = qb.andWhere('a.isRemix = :isRemix', { isRemix: true });
          break;
        case 'videos':
          qb = qb.andWhere('a.videoUrl IS NOT NULL');
          break;
        case 'liked':
          // Subquery to find artworks liked by this user
          qb = qb.andWhere(subQuery => {
            const innerQuery = subQuery.subQuery()
              .select('l.artworkId')
              .from(Like, 'l')
              .where('l.userId = :userId', { userId })
              .getQuery();
            return 'a.id IN ' + innerQuery;
          });
          break;
        case 'recent':
          qb = qb.orderBy('a.createdAt', 'DESC');
          break;
      }
    } else {
      qb = qb.orderBy('a.createdAt', 'DESC');
    }

    // 2. Apply Dynamic Search (Gemini-powered)
    if (search && search.trim().length > 0) {
      const concepts = await this.extractSearchConcepts(search);
      if (concepts.length > 0) {
        concepts.forEach((synonyms, i) => {
          const conceptConditions = synonyms.map((_, j) => 
            `(a.prompt LIKE :syn${i}_${j} OR a.style LIKE :syn${i}_${j} OR user.name LIKE :syn${i}_${j})`
          );
          const conceptParams = synonyms.reduce((acc, syn, j) => ({ 
            ...acc, 
            [`syn${i}_${j}`]: `%${syn}%` 
          }), {});
          
          qb = qb.andWhere(`(${conceptConditions.join(' OR ')})`, conceptParams);
        });
      }
    }

    // 3. Pagination & Final Execution
    // Note: We only add global order if no specific order was added by filters
    if (!filter || filter.toLowerCase() !== 'popular') {
      qb = qb.addOrderBy('a.createdAt', 'DESC');
    }

    const [data, total] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get global artworks (from all users) with search and filters.
   */
  async findGlobal(
    page: number = 1,
    limit: number = 20,
    search?: string,
    filter?: string,
  ): Promise<{ data: Artwork[]; total: number; page: number; limit: number; totalPages: number }> {
    const skip = (page - 1) * limit;

    let qb = this.artworkRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'user');

    // 1. Apply Categorical Filters
    if (filter) {
      switch (filter.toLowerCase()) {
        case 'trending':
        case 'popular':
          qb = qb.addSelect(subQuery => {
            return subQuery.select('COUNT(l.id)', 'lCount')
              .from(Like, 'l')
              .where('l.artworkId = a.id');
          }, 'likesCount')
          .orderBy('likesCount', 'DESC');
          break;
        case 'recent':
          qb = qb.orderBy('a.createdAt', 'DESC');
          break;
        case 'videos':
          qb = qb.andWhere('a.videoUrl IS NOT NULL');
          break;
      }
    }

    // 2. Apply Dynamic Search (Gemini-powered)
    if (search && search.trim().length > 0) {
      const concepts = await this.extractSearchConcepts(search);
      if (concepts.length > 0) {
        concepts.forEach((synonyms, i) => {
          const conceptConditions = synonyms.map((_, j) => 
            `(a.prompt LIKE :syn${i}_${j} OR a.style LIKE :syn${i}_${j} OR user.name LIKE :syn${i}_${j})`
          );
          const conceptParams = synonyms.reduce((acc, syn, j) => ({ 
            ...acc, 
            [`syn${i}_${j}`]: `%${syn}%` 
          }), {});
          
          qb = qb.andWhere(`(${conceptConditions.join(' OR ')})`, conceptParams);
        });
      }
    }

    // Default order if none specified
    if (!filter || (filter !== 'popular' && filter !== 'trending')) {
      qb = qb.addOrderBy('a.createdAt', 'DESC');
    }

    const [data, total] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single artwork by ID (only if owned by the user).
   */
  async findOne(artworkId: string, userId: string): Promise<Artwork | null> {
    return this.artworkRepo.findOne({
      where: { id: artworkId, userId },
    });
  }

  /**
   * Delete an artwork (only if owned by the user).
   */
  async delete(artworkId: string, userId: string): Promise<boolean> {
    const result = await this.artworkRepo.delete({ id: artworkId, userId });
    return (result.affected ?? 0) > 0;
  }

  /**
   * Count total artworks for a user.
   */
  async countByUser(userId: string): Promise<number> {
    return this.artworkRepo.count({ where: { userId } });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIKES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Toggle like on an artwork. Returns new like count.
   */
  async likeArtwork(artworkId: string, userId: string): Promise<{ likesCount: number; isLikedByMe: boolean }> {
    const existing = await this.likeRepo.findOne({ where: { artworkId, userId } });
    if (!existing) {
      await this.likeRepo.save(this.likeRepo.create({ artworkId, userId }));
    }
    const likesCount = await this.likeRepo.count({ where: { artworkId } });
    return { likesCount, isLikedByMe: true };
  }

  /**
   * Remove like from an artwork. Returns new like count.
   */
  async unlikeArtwork(artworkId: string, userId: string): Promise<{ likesCount: number; isLikedByMe: boolean }> {
    await this.likeRepo.delete({ artworkId, userId });
    const likesCount = await this.likeRepo.count({ where: { artworkId } });
    return { likesCount, isLikedByMe: false };
  }

  /**
   * Get the like count for an artwork and whether the current user liked it.
   */
  async getLikeInfo(artworkId: string, userId?: string): Promise<{ likesCount: number; isLikedByMe: boolean }> {
    const likesCount = await this.likeRepo.count({ where: { artworkId } });
    let isLikedByMe = false;
    if (userId) {
      const existing = await this.likeRepo.findOne({ where: { artworkId, userId } });
      isLikedByMe = !!existing;
    }
    return { likesCount, isLikedByMe };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a comment on an artwork.
   */
  async createComment(
    artworkId: string,
    userId: string,
    content: string,
    parentCommentId?: string,
  ): Promise<Comment> {
    const comment = this.commentRepo.create({
      artworkId,
      userId,
      content,
      parentCommentId: parentCommentId || null,
    });
    const saved = await this.commentRepo.save(comment);
    // Reload with user relation
    const reloaded = await this.commentRepo.findOne({
      where: { id: saved.id },
      relations: ['user'],
    });
    return reloaded ?? saved;
  }

  /**
   * Get comments for an artwork, newest first, with pagination.
   */
  async getComments(
    artworkId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Comment[]; total: number; page: number; limit: number; totalPages: number }> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.commentRepo.findAndCount({
      where: { artworkId, parentCommentId: null as any },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Count comments for an artwork.
   */
  async countComments(artworkId: string): Promise<number> {
    return this.commentRepo.count({ where: { artworkId } });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIMILAR ARTWORKS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find similar artworks from the database.
   * Strategy:
   *   1. Match by same style (broad category match)
   *   2. Keyword-level prompt similarity — extract key nouns/adjectives and use LIKE
   *   3. Exclude the source artwork itself
   *   4. Search across ALL users (public gallery behaviour)
   */
  async findSimilar(
    excludeArtworkId: string,
    prompt: string | null | undefined,
    style: string | null,
    limit: number = 3,
  ): Promise<Artwork[]> {
    const results = new Map<string, Artwork>();
    if (!prompt) {
      // If there's no prompt at all, just fall back to style matching if possible
      if (style) {
         const byStyle = await this.artworkRepo.find({
           where: { style, id: Not(excludeArtworkId) },
           relations: ['user'],
           order: { createdAt: 'DESC' },
           take: limit,
         });
         return byStyle;
      }
      return [];
    }

    let keywords: string[] = [];

    // --- Intelligent AI Content Extraction ---
    if (this.genAI) {
      try {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const aiResult = await model.generateContent(`
        Extract the primary visual subjects (nouns) from the following art prompt.
        Return ONLY 1 to 3 core keywords separated by commas, no other words. 
        Example prompt: "A majestic glowing fox in a magical neon forest, hyper detailed"
        Example output: "fox, forest"

        Prompt: "${prompt}"
        `);
        const text = aiResult.response.text();
        keywords = text.split(',').map(s => s.trim().toLowerCase()).filter(w => w.length > 2);
        this.logger.log(`Gemini extracted keywords: ${keywords.join(', ')}`);
      } catch(e) {
        this.logger.error(`Gemini keyword extraction failed: ${e.message}`);
      }
    }

    // --- Fallback if Gemini fails or isn't configured ---
    if (keywords.length === 0) {
      const stopWords = new Set([
        'a','an','the','of','in','on','at','to','for','and','or','with','is','are',
        'style','high','quality','detailed','resolution','ultra','best','masterpiece',
        'cinematic','artistic','vivid','sharp','soft','8k','4k','beautiful','stunning'
      ]);
      keywords = prompt
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w))
        .slice(0, 3);
    }

    if (keywords.length > 0) {
      // Build a strict query: must not be the source artwork, must have at least one matching keyword
      let qb = this.artworkRepo.createQueryBuilder('a')
        .leftJoinAndSelect('a.user', 'user')
        .where('a.id != :excludeId', { excludeId: excludeArtworkId });

      // If style is provided, enforce it to maintain aesthetic consistency
      if (style) {
        qb = qb.andWhere('a.style = :style', { style });
      }

      // Must have at least ONE of the significant keywords
      const kwConditions = keywords.map((_, i) => `a.prompt LIKE :kw${i}`);
      const kwParams = keywords.reduce((acc, kw, i) => ({ ...acc, [`kw${i}`]: `%${kw}%` }), {});
      
      qb = qb.andWhere(`(${kwConditions.join(' OR ')})`, kwParams)
        .orderBy('a.createdAt', 'DESC')
        .take(limit);

      const matches = await qb.getMany();
      matches.forEach(a => results.set(a.id, a));
    }

    return Array.from(results.values());
  }

  /**
   * Find artwork by ID
   */
  async findById(id: string): Promise<Artwork | null> {
    return this.artworkRepo.findOne({ where: { id }, relations: ['user'] });
  }

  /**
   * Update video URL for an artwork
   */
  async updateVideoUrl(id: string, videoUrl: string): Promise<Artwork | null> {
    const artwork = await this.artworkRepo.findOne({ where: { id } });
    if (!artwork) return null;
    artwork.videoUrl = videoUrl;
    return this.artworkRepo.save(artwork);
  }

  /**
   * Internal helper to extract keywords from a search query using Gemini, grouped by concepts.
   */
  private async extractSearchConcepts(query: string): Promise<string[][]> {
    if (!this.genAI || query.trim().length < 2) {
      return query.toLowerCase().split(/\s+/).filter(w => w.length > 2).map(w => [w]);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `
        Analyze this gallery search query: "${query}".
        Break it down into its core visual concepts (subjects, styles, colors, moods).
        For each concept, provide the original word and 2-3 highly relevant synonyms or related terms.
        
        Return ONLY a JSON array of arrays of strings. 
        Each inner array represents one concept and its synonyms.
        
        Examples:
        "majestic glowing fox" -> [["fox", "canine", "animal"], ["glowing", "neon", "fluorescent"], ["majestic", "noble", "royal"]]
        "cyberpunk city" -> [["city", "metropolis", "urban"], ["cyberpunk", "futuristic", "neon"]]
        
        Output:
      `;

      const aiResult = await model.generateContent(prompt);
      const text = aiResult.response.text().trim();
      
      // Improved JSON extraction
      const startIdx = text.indexOf('[[');
      const endIdx = text.lastIndexOf(']]');
      
      if (startIdx !== -1 && endIdx !== -1) {
        const jsonStr = text.substring(startIdx, endIdx + 2);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed.every(Array.isArray)) {
          this.logger.log(`Extracted concepts for "${query}": ${JSON.stringify(parsed)}`);
          return parsed;
        }
      }
    } catch (e) {
      this.logger.error(`Gemini search expansion failed for "${query}": ${e.message}`);
    }

    // Fallback: simple word splitting
    return query.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2)
      .map(w => [w]);
  }
}
