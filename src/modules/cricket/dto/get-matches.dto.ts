import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetMatchesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ['live', 'completed', 'upcoming', 'cancelled'] })
  @IsOptional()
  @IsEnum(['live', 'completed', 'upcoming', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({ enum: ['test', 'odi', 't20i', 't20', 'first-class', 'list-a'] })
  @IsOptional()
  @IsEnum(['test', 'odi', 't20i', 't20', 'first-class', 'list-a'])
  format?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  series?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}





