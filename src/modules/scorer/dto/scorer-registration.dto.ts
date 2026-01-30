import { IsString, IsEmail, IsOptional, IsObject, IsEnum, IsBoolean, ValidateNested, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class LocationDto {
  @ApiProperty({ description: 'City name', example: 'Dhaka' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  city: string;

  @ApiPropertyOptional({ description: 'District name', example: 'Dhaka' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  district?: string;

  @ApiPropertyOptional({ description: 'Area/Neighborhood name', example: 'Gulshan' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  area?: string;
}

export class ScorerRegistrationDto {
  @ApiProperty({ description: 'Full name', example: 'John Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({ description: 'Phone number', example: '+8801712345678' })
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Location details', type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  @IsObject()
  location: LocationDto;

  @ApiProperty({
    description: 'Type of scorer',
    enum: ['official', 'volunteer', 'community'],
    example: 'volunteer',
  })
  @IsEnum(['official', 'volunteer', 'community'])
  scorerType: 'official' | 'volunteer' | 'community';

  @ApiProperty({ description: 'Terms and conditions accepted', example: true })
  @IsBoolean()
  termsAccepted: boolean;
}

