import { IsArray, IsOptional, IsObject, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiProperty({ example: ['team1', 'team2'], description: 'Favorite teams', required: false })
  @IsArray()
  @IsOptional()
  favoriteTeams?: string[];

  @ApiProperty({ example: ['cricket', 'football'], description: 'Favorite sports', enum: ['cricket', 'football'], required: false })
  @IsArray()
  @IsEnum(['cricket', 'football'], { each: true })
  @IsOptional()
  favoriteSports?: string[];

  @ApiProperty({ description: 'Notification preferences', required: false })
  @IsObject()
  @IsOptional()
  notifications?: {
    email?: boolean;
    push?: boolean;
    matchUpdates?: boolean;
    contentUpdates?: boolean;
  };
}

