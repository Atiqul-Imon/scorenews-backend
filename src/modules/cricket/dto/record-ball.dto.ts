import { IsNumber, IsString, IsOptional, IsEnum, IsBoolean, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BallType {
  NORMAL = 'normal',
  WIDE = 'wide',
  NO_BALL = 'no_ball',
  BYE = 'bye',
  LEG_BYE = 'leg_bye',
}

export enum DismissalType {
  BOWLED = 'bowled',
  CAUGHT = 'caught',
  LBW = 'lbw',
  RUN_OUT = 'run_out',
  STUMPED = 'stumped',
  HIT_WICKET = 'hit_wicket',
  RETIRED_HURT = 'retired_hurt',
  RETIRED_OUT = 'retired_out',
  HANDLED_BALL = 'handled_ball',
  OBSTRUCTING_FIELD = 'obstructing_field',
  TIMED_OUT = 'timed_out',
}

class DeliveryDto {
  @ApiProperty({ description: 'Runs scored from this ball', minimum: 0, maximum: 6 })
  @IsNumber()
  @Min(0)
  @Max(6)
  runs: number;

  @ApiProperty({ enum: BallType, description: 'Type of delivery' })
  @IsEnum(BallType)
  ballType: BallType;

  @ApiPropertyOptional({ description: 'Is this a wicket ball?' })
  @IsBoolean()
  @IsOptional()
  isWicket?: boolean;

  @ApiPropertyOptional({ enum: DismissalType, description: 'Dismissal type if wicket' })
  @IsEnum(DismissalType)
  @IsOptional()
  dismissalType?: DismissalType;

  @ApiPropertyOptional({ description: 'Batter ID who got out' })
  @IsString()
  @IsOptional()
  dismissedBatterId?: string;

  @ApiPropertyOptional({ description: 'Bowler ID who took the wicket' })
  @IsString()
  @IsOptional()
  bowlerId?: string;

  @ApiPropertyOptional({ description: 'Fielder ID who took the catch/runout' })
  @IsString()
  @IsOptional()
  fielderId?: string;

  @ApiPropertyOptional({ description: 'Incoming batter ID (if wicket)' })
  @IsString()
  @IsOptional()
  incomingBatterId?: string;

  @ApiPropertyOptional({ description: 'Is this ball a boundary (4 or 6)?' })
  @IsBoolean()
  @IsOptional()
  isBoundary?: boolean;

  @ApiPropertyOptional({ description: 'Is this ball a six?' })
  @IsBoolean()
  @IsOptional()
  isSix?: boolean;

  @ApiPropertyOptional({ description: 'Is this a free hit delivery?' })
  @IsBoolean()
  @IsOptional()
  isFreeHit?: boolean;
}

export class RecordBallDto {
  @ApiProperty({ description: 'Match ID' })
  @IsString()
  matchId: string;

  @ApiProperty({ description: 'Innings number (1 or 2)', minimum: 1, maximum: 2 })
  @IsNumber()
  @Min(1)
  @Max(2)
  innings: number;

  @ApiProperty({ description: 'Team batting (home or away)' })
  @IsString()
  battingTeam: 'home' | 'away';

  @ApiProperty({ description: 'Current over number', minimum: 0 })
  @IsNumber()
  @Min(0)
  over: number;

  @ApiProperty({ description: 'Ball number in current over (0-5)', minimum: 0, maximum: 5 })
  @IsNumber()
  @Min(0)
  @Max(5)
  ball: number;

  @ApiProperty({ description: 'Batter on strike ID' })
  @IsString()
  strikerId: string;

  @ApiProperty({ description: 'Batter off strike ID' })
  @IsString()
  nonStrikerId: string;

  @ApiProperty({ description: 'Bowler ID' })
  @IsString()
  bowlerId: string;

  @ApiProperty({ type: DeliveryDto, description: 'Delivery details' })
  @ValidateNested()
  @Type(() => DeliveryDto)
  delivery: DeliveryDto;

  @ApiPropertyOptional({ description: 'Timestamp of the ball' })
  @IsString()
  @IsOptional()
  timestamp?: string;
}

