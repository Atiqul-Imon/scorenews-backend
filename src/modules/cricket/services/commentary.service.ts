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
    // Convert matchId to string to ensure type consistency
    const matchIdStr = String(matchId);
    const query: any = { matchId: matchIdStr, isActive: true };
    if (innings !== undefined) {
      query.innings = innings;
    }

    const commentary = await this.commentaryModel
      .find(query)
      .sort({ innings: 1, over: 1, ball: 1, commentaryType: 1, order: 1, createdAt: 1 })
      .lean();

    this.logger.log(`Retrieved ${commentary.length} in-house commentary entries for match ${matchIdStr}${innings ? `, innings ${innings}` : ''}`, 'CommentaryService');
    if (commentary.length > 0) {
      this.logger.debug(`Sample in-house commentary: over=${commentary[0].over}, ball=${commentary[0].ball}, type=${commentary[0].commentaryType}, matchId=${commentary[0].matchId}`, 'CommentaryService');
    } else {
      // Debug: Check if there are any commentary entries with different matchId format
      const allCommentary = await this.commentaryModel.find({ isActive: true }).limit(5).lean();
      if (allCommentary.length > 0) {
        this.logger.debug(`Sample matchId from DB: ${allCommentary[0].matchId} (type: ${typeof allCommentary[0].matchId}), Searching for: ${matchIdStr} (type: ${typeof matchIdStr})`, 'CommentaryService');
      }
    }

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
    this.logger.log(`Merging commentary for match ${matchId}: SportsMonk=${sportsMonkCommentary.all.length}, In-House=${inHouseCommentary.length}`, 'CommentaryService');

    // Merge commentary for each innings
    const firstInningsInHouse = inHouseCommentary.filter((c) => c.innings === 1);
    const secondInningsInHouse = inHouseCommentary.filter((c) => c.innings === 2);
    this.logger.log(`In-house commentary breakdown: First innings=${firstInningsInHouse.length}, Second innings=${secondInningsInHouse.length}`, 'CommentaryService');

    const mergedFirstInnings = this.mergeInningsCommentary(
      sportsMonkCommentary.firstInnings,
      firstInningsInHouse,
    );

    const mergedSecondInnings = this.mergeInningsCommentary(
      sportsMonkCommentary.secondInnings,
      secondInningsInHouse,
    );

    // Combine all commentary
    // IMPORTANT: Don't re-sort by timestamp alone - preserve the order from mergeInningsCommentary
    // which already sorts by over/ball (newest first) and within groups (pre-ball -> ball -> post-ball)
    const all = [...mergedFirstInnings, ...mergedSecondInnings];
    
    // Final sort: by over and ball (newest first), then by type within same over.ball
    all.sort((a, b) => {
      // First sort by over (newest first)
      if (a.over !== b.over) return b.over - a.over;
      
      // Then by ball (newest first)
      const ballA = a.ballNumber ?? a.ball ?? 0;
      const ballB = b.ballNumber ?? b.ball ?? 0;
      if (ballA !== ballB) return ballB - ballA;
      
      // Within same over.ball, sort by type: pre-ball -> ball -> post-ball
      const typeOrder: Record<string, number> = { 'pre-ball': 0, ball: 1, 'post-ball': 2 };
      const orderA = typeOrder[a.commentaryType || 'ball'] ?? 1;
      const orderB = typeOrder[b.commentaryType || 'ball'] ?? 1;
      if (orderA !== orderB) return orderA - orderB;
      
      // For same type, sort by timestamp (newest first)
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
    this.logger.log(`Adding ${inHouseEntries.length} in-house entries to merge`, 'CommentaryService');
    inHouseEntries.forEach((entry) => {
      // Create a unique key that groups pre-ball, ball, and post-ball together
      // Pre-ball commentary is for the NEXT ball (e.g., pre-ball for 18.6 should appear before 18.6 ball)
      // Post-ball commentary is for the CURRENT ball (e.g., post-ball for 18.5 should appear after 18.5 ball)
      // So we group by the ball number they're associated with
      const ballNum = entry.ball !== null && entry.ball !== undefined ? entry.ball : 0;
      const key = `${entry.over}-${ballNum}`;
      
      this.logger.debug(`Adding in-house entry: over=${entry.over}, ball=${entry.ball}, type=${entry.commentaryType}, key=${key}`, 'CommentaryService');
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push({
        id: entry._id.toString(),
        _id: entry._id.toString(),
        over: entry.over,
        ball: entry.ball,
        ballNumber: entry.ball !== null && entry.ball !== undefined ? entry.ball : null,
        runs: 0, // In-house commentary doesn't have runs
        commentary: entry.commentary,
        commentaryType: entry.commentaryType,
        source: 'in-house',
        authorName: entry.authorName,
        timestamp: entry.createdAt?.toISOString() || new Date().toISOString(),
        createdAt: entry.createdAt?.toISOString() || new Date().toISOString(),
        order: entry.order || 0,
        innings: entry.innings,
      });
    });
    
    this.logger.log(`Total groups after adding in-house: ${Object.keys(grouped).length}`, 'CommentaryService');

    // Sort each group and merge
    Object.keys(grouped)
      .sort((a, b) => {
        // Sort by over and ball
        const partsA = a.split('-');
        const partsB = b.split('-');
        const overA = Number(partsA[0]);
        const overB = Number(partsB[0]);
        const ballA = Number(partsA[1]);
        const ballB = Number(partsB[1]);
        
        if (overA !== overB) return overB - overA; // Higher over first
        if (isNaN(ballA) || isNaN(ballB)) return 0;
        return ballB - ballA; // Higher ball first
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

    this.logger.log(`Merged result: ${merged.length} total entries (SportsMonk: ${sportsMonkEntries.length}, In-House: ${inHouseEntries.length})`, 'CommentaryService');
    const inHouseInMerged = merged.filter((e) => e.source === 'in-house').length;
    this.logger.log(`In-house entries in merged result: ${inHouseInMerged}`, 'CommentaryService');

    return merged;
  }
}

