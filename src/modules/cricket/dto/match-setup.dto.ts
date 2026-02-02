import { IsString, IsArray, IsEnum, IsOptional, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PlayerDto {
  @ApiProperty({ description: 'Player ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Player name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Player role (batter, bowler, all-rounder)' })
  @IsString()
  @IsOptional()
  role?: string;
}

class TossDto {
  @ApiProperty({ enum: ['home', 'away'], description: 'Team that won the toss' })
  @IsEnum(['home', 'away'])
  winner: 'home' | 'away';

  @ApiProperty({ enum: ['bat', 'bowl'], description: 'Decision made by toss winner' })
  @IsEnum(['bat', 'bowl'])
  decision: 'bat' | 'bowl';
}

export class MatchSetupDto {
  @ApiProperty({ description: 'Match ID' })
  @IsString()
  matchId: string;

  @ApiPropertyOptional({ type: [PlayerDto], description: 'Home team playing XI (optional, can be updated later)' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PlayerDto)
  homePlayingXI?: PlayerDto[];

  @ApiPropertyOptional({ type: [PlayerDto], description: 'Away team playing XI (optional, can be updated later)' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PlayerDto)
  awayPlayingXI?: PlayerDto[];

  @ApiPropertyOptional({ type: TossDto, description: 'Toss result (optional, can be updated later)' })
  @ValidateNested()
  @Type(() => TossDto)
  @IsOptional()
  toss?: TossDto;

  @ApiPropertyOptional({ description: 'Opening batter 1 ID (striker, optional, can be set later)' })
  @IsString()
  @IsOptional()
  openingBatter1Id?: string;

  @ApiPropertyOptional({ description: 'Opening batter 2 ID (non-striker, optional, can be set later)' })
  @IsString()
  @IsOptional()
  openingBatter2Id?: string;

  @ApiPropertyOptional({ description: 'First bowler ID (optional, can be set later)' })
  @IsString()
  @IsOptional()
  firstBowlerId?: string;
}



