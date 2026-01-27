import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ example: 'John Doe', description: 'User name', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', description: 'Avatar URL', required: false })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiProperty({ description: 'User preferences', required: false })
  @IsObject()
  @IsOptional()
  preferences?: {
    favoriteTeams?: string[];
    favoriteSports?: string[];
    notifications?: {
      email?: boolean;
      push?: boolean;
      matchUpdates?: boolean;
      contentUpdates?: boolean;
    };
  };
}



