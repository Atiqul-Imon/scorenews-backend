import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLiveStateDto {
  @ApiPropertyOptional({ description: 'Current striker ID' })
  @IsString()
  @IsOptional()
  strikerId?: string;

  @ApiPropertyOptional({ description: 'Current non-striker ID' })
  @IsString()
  @IsOptional()
  nonStrikerId?: string;

  @ApiPropertyOptional({ description: 'Current bowler ID' })
  @IsString()
  @IsOptional()
  bowlerId?: string;

  @ApiPropertyOptional({ description: 'Current over number', minimum: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  currentOver?: number;

  @ApiPropertyOptional({ description: 'Current ball number (0-5)', minimum: 0, maximum: 5 })
  @IsNumber()
  @Min(0)
  @Max(5)
  @IsOptional()
  currentBall?: number;
}





