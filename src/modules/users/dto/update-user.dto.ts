import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ example: 'John Doe', description: 'User name', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', description: 'Avatar URL', required: false })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiProperty({ example: 'user', description: 'User role', enum: ['user', 'admin', 'moderator'], required: false })
  @IsEnum(['user', 'admin', 'moderator'])
  @IsOptional()
  role?: string;

  @ApiProperty({ example: true, description: 'Email verification status', required: false })
  @IsBoolean()
  @IsOptional()
  isVerified?: boolean;
}

