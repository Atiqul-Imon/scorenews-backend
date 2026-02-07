import { IsString, IsNumber, IsEnum, IsOptional, Min, Max, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddCommentaryDto {
  @ApiProperty({ description: 'Innings number (1 or 2)', minimum: 1, maximum: 2 })
  @IsNumber()
  @Min(1)
  @Max(2)
  innings: number;

  @ApiProperty({ description: 'Over number', minimum: 0 })
  @IsNumber()
  @Min(0)
  over: number;

  @ApiPropertyOptional({ description: 'Ball number in over (0-5), null for pre/post commentary', minimum: 0, maximum: 5 })
  @IsNumber()
  @Min(0)
  @Max(5)
  @IsOptional()
  ball: number | null;

  @ApiProperty({ description: 'Type of commentary', enum: ['pre-ball', 'ball', 'post-ball'] })
  @IsEnum(['pre-ball', 'ball', 'post-ball'])
  commentaryType: 'pre-ball' | 'ball' | 'post-ball';

  @ApiProperty({ description: 'Commentary text', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  commentary: string;

  @ApiPropertyOptional({ description: 'Order for post-ball commentary (default: 0)', minimum: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  order?: number;
}








