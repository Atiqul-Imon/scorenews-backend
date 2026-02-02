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

  @ApiProperty({ type: [PlayerDto], description: 'Home team playing XI', minItems: 11, maxItems: 11 })
  @IsArray()
  @ArrayMinSize(11)
  @ArrayMaxSize(11)
  @ValidateNested({ each: true })
  @Type(() => PlayerDto)
  homePlayingXI: PlayerDto[];

  @ApiProperty({ type: [PlayerDto], description: 'Away team playing XI', minItems: 11, maxItems: 11 })
  @IsArray()
  @ArrayMinSize(11)
  @ArrayMaxSize(11)
  @ValidateNested({ each: true })
  @Type(() => PlayerDto)
  awayPlayingXI: PlayerDto[];

  @ApiProperty({ type: TossDto, description: 'Toss result' })
  @ValidateNested()
  @Type(() => TossDto)
  toss: TossDto;

  @ApiProperty({ description: 'Opening batter 1 ID (striker)' })
  @IsString()
  openingBatter1Id: string;

  @ApiProperty({ description: 'Opening batter 2 ID (non-striker)' })
  @IsString()
  openingBatter2Id: string;

  @ApiProperty({ description: 'First bowler ID' })
  @IsString()
  firstBowlerId: string;
}



