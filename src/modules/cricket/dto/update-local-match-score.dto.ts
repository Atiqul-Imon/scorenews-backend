import { IsNumber, IsObject, IsOptional, ValidateNested, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class TeamScoreDto {
  @ApiProperty({ description: 'Runs scored', minimum: 0 })
  @IsNumber()
  @Min(0)
  runs: number;

  @ApiProperty({ description: 'Wickets fallen', minimum: 0, maximum: 10 })
  @IsNumber()
  @Min(0)
  @Max(10)
  wickets: number;

  @ApiProperty({ description: 'Overs bowled', minimum: 0 })
  @IsNumber()
  @Min(0)
  overs: number;

  @ApiPropertyOptional({ description: 'Balls in current over', minimum: 0, maximum: 5 })
  @IsNumber()
  @Min(0)
  @Max(5)
  @IsOptional()
  balls?: number;
}

export class UpdateLocalMatchScoreDto {
  @ApiProperty({ type: TeamScoreDto })
  @ValidateNested()
  @Type(() => TeamScoreDto)
  @IsObject()
  home: TeamScoreDto;

  @ApiProperty({ type: TeamScoreDto })
  @ValidateNested()
  @Type(() => TeamScoreDto)
  @IsObject()
  away: TeamScoreDto;

  @ApiPropertyOptional({ description: 'Match note or commentary' })
  @IsString()
  @IsOptional()
  matchNote?: string;

  @ApiPropertyOptional({ description: 'Current innings number', minimum: 1 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  innings?: number;
}

