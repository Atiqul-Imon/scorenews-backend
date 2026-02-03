import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MatchCommentary, MatchCommentaryDocument } from '../schemas/match-commentary.schema';
import { AddCommentaryDto } from '../dto/add-commentary.dto';
import { SportsMonksService } from './sportsmonks.service';

@Injectable()
export class CommentaryService {
  private readonly logger = new Logger(CommentaryService.name);

  constructor(
    @InjectModel(MatchCommentary.name)
    private commentaryModel: Model<MatchCommentaryDocument>,
    private sportsMonksService: SportsMonksService,
  ) {}

  /**
   * Add in-house commentary
   */
  async addCommentary(
    matchId: string,
    addDto: AddCommentaryDto,
    authorId: string,
    authorName: string,
  ): Promise<MatchCommentary> {
    // Validate ball number based on commentary type
    if (addDto.commentaryType === 'ball' && addDto.ball === null) {
      throw new BadRequestException('Ball number is required for ball commentary');
    }

    if ((addDto.commentaryType === 'pre-ball' || addDto.commentaryType === 'post-ball') && addDto.ball !== null) {
      // Allow ball number for pre/post, but it's optional
      // If provided, validate it
      if (addDto.ball !== null && (addDto.ball < 0 || addDto.ball > 5)) {
        throw new BadRequestException('Ball number must be between 0 and 5');
      }
    }

    const commentary = new this.commentaryModel({
      matchId,
      innings: addDto.innings,
      over: addDto.over,
      ball: addDto.ball,
      commentaryType: addDto.commentaryType,
      commentary: addDto.commentary,
      authorId,
      authorName,
      order: addDto.order ?? 0,
      isActive: true,
    });

    const saved = await commentary.save();
    this.logger.log(`Added commentary for match ${matchId} by ${authorName}`, 'CommentaryService');
    return saved.toObject();
  }

  /**
   * Get in-house commentary for a match
   */
  async getInHouseCommentary(matchId: string, innings?: number): Promise<any[]> {
    const query: any = { matchId, isActive: true };
    if (innings !== undefined) {
      query.innings = innings;
    }

    const commentary = await this.commentaryModel
      .find(query)
      .sort({ innings: 1, over: 1, ball: 1, commentaryType: 1, order: 1, createdAt: 1 })
      .lean();

    return commentary;
  }

  /**
   * Update commentary
   */
  async updateCommentary(
    commentaryId: string,
    commentary: string,
    authorId: string,
  ): Promise<MatchCommentary> {
    const existing = await this.commentaryModel.findOne({ _id: commentaryId, isActive: true });
    if (!existing) {
      throw new NotFoundException('Commentary not found');
    }

    // Check if user is the author or admin
    if (existing.authorId !== authorId) {
      throw new BadRequestException('You can only update your own commentary');
    }

    existing.commentary = commentary;
    const updated = await existing.save();
    this.logger.log(`Updated commentary ${commentaryId} by ${authorId}`, 'CommentaryService');
    return updated.toObject();
  }

  /**
   * Delete commentary (soft delete)
   */
  async deleteCommentary(commentaryId: string, authorId: string, isAdmin: boolean = false): Promise<void> {
    const existing = await this.commentaryModel.findOne({ _id: commentaryId, isActive: true });
    if (!existing) {
      throw new NotFoundException('Commentary not found');
    }

    // Check if user is the author or admin
    if (!isAdmin && existing.authorId !== authorId) {
      throw new BadRequestException('You can only delete your own commentary');
    }

    existing.isActive = false;
    await existing.save();
    this.logger.log(`Deleted commentary ${commentaryId} by ${authorId}`, 'CommentaryService');
  }

  /**
   * Merge SportsMonk and in-house commentary
   */
  async mergeCommentary(matchId: string): Promise<{
    firstInnings: any[];
    secondInnings: any[];
    all: any[];
    sources: { sportsMonk: number; inHouse: number };
  }> {
    // Fetch SportsMonk commentary
    let sportsMonkCommentary: { firstInnings: any[]; secondInnings: any[]; all: any[] };
    try {
      sportsMonkCommentary = await this.sportsMonksService.getCommentary(matchId, 'cricket');
    } catch (error) {
      this.logger.warn(`Failed to fetch SportsMonk commentary for ${matchId}`, 'CommentaryService');
      sportsMonkCommentary = { firstInnings: [], secondInnings: [], all: [] };
    }

    // Fetch in-house commentary
    const inHouseCommentary = await this.getInHouseCommentary(matchId);

    // Merge commentary for each innings
    const mergedFirstInnings = this.mergeInningsCommentary(
      sportsMonkCommentary.firstInnings,
      inHouseCommentary.filter((c) => c.innings === 1),
    );

    const mergedSecondInnings = this.mergeInningsCommentary(
      sportsMonkCommentary.secondInnings,
      inHouseCommentary.filter((c) => c.innings === 2),
    );

    // Combine all commentary
    const all = [...mergedFirstInnings, ...mergedSecondInnings].sort((a, b) => {
      // Sort by timestamp (newest first)
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    return {
      firstInnings: mergedFirstInnings,
      secondInnings: mergedSecondInnings,
      all,
      sources: {
        sportsMonk: sportsMonkCommentary.all.length,
        inHouse: inHouseCommentary.length,
      },
    };
  }

  /**
   * Merge commentary for a single innings
   */
  private mergeInningsCommentary(
    sportsMonkEntries: any[],
    inHouseEntries: any[],
  ): any[] {
    const merged: any[] = [];

    // Group by over and ball
    const grouped: { [key: string]: any[] } = {};

    // Add SportsMonk entries
    sportsMonkEntries.forEach((entry) => {
      const key = `${entry.over}-${entry.ball || entry.ballNumber || 0}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push({
        ...entry,
        source: 'sportsmonk',
        commentaryType: 'ball',
        order: 0,
      });
    });

    // Add in-house entries
    inHouseEntries.forEach((entry) => {
      const key = entry.ball !== null ? `${entry.over}-${entry.ball}` : `${entry.over}-pre`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push({
        id: entry._id.toString(),
        over: entry.over,
        ball: entry.ball,
        ballNumber: entry.ball !== null ? entry.over * 6 + entry.ball + 1 : null,
        runs: 0, // In-house commentary doesn't have runs
        commentary: entry.commentary,
        commentaryType: entry.commentaryType,
        source: 'in-house',
        authorName: entry.authorName,
        timestamp: entry.createdAt?.toISOString() || new Date().toISOString(),
        order: entry.order,
      });
    });

    // Sort each group and merge
    Object.keys(grouped)
      .sort((a, b) => {
        // Sort by over and ball
        const partsA = a.split('-');
        const partsB = b.split('-');
        const overA = Number(partsA[0]);
        const overB = Number(partsB[0]);
        const ballA = partsA[1];
        const ballB = partsB[1];
        
        if (overA !== overB) return overB - overA; // Higher over first
        if (ballA === 'pre') return 1; // Pre-ball goes after
        if (ballB === 'pre') return -1;
        const ballANum = Number(ballA);
        const ballBNum = Number(ballB);
        if (isNaN(ballANum) || isNaN(ballBNum)) return 0;
        return ballBNum - ballANum; // Higher ball first
      })
      .forEach((key) => {
        const entries = grouped[key];
        // Sort within group: pre-ball -> ball -> post-ball
        entries.sort((a: any, b: any) => {
          const typeOrder: Record<string, number> = { 'pre-ball': 0, ball: 1, 'post-ball': 2 };
          const orderA = typeOrder[a.commentaryType] ?? 1;
          const orderB = typeOrder[b.commentaryType] ?? 1;
          if (orderA !== orderB) return orderA - orderB;

          // For same type, sort by order (for post-ball) or timestamp
          if (a.commentaryType === 'post-ball' && b.commentaryType === 'post-ball') {
            if (a.order !== b.order) return a.order - b.order;
          }

          const timeA = new Date(a.timestamp || 0).getTime();
          const timeB = new Date(b.timestamp || 0).getTime();
          return timeA - timeB; // Older first within same type
        });

        merged.push(...entries);
      });

    return merged;
  }
}

