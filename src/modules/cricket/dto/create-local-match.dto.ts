import { IsString, IsEnum, IsDateString, IsObject, IsOptional, ValidateNested, IsNotEmpty, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class VenueDto {
  @ApiProperty({ description: 'Venue name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Venue city' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({ description: 'Venue address' })
  @IsString()
  @IsOptional()
  address?: string;
}

class TeamsDto {
  @ApiProperty({ description: 'Home team name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  home: string;

  @ApiProperty({ description: 'Away team name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  away: string;
}

class LeagueDto {
  @ApiProperty({ description: 'League ID' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'League name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['national', 'state', 'district', 'city', 'ward', 'club'] })
  @IsEnum(['national', 'state', 'district', 'city', 'ward', 'club'])
  level: 'national' | 'state' | 'district' | 'city' | 'ward' | 'club';

  @ApiProperty({ description: 'League season' })
  @IsString()
  @IsNotEmpty()
  season: string;

  @ApiProperty({ description: 'League year' })
  @IsString()
  @IsNotEmpty()
  year: number;
}

class LocationDto {
  @ApiProperty({ description: 'Country' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiPropertyOptional({ description: 'State/Province' })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ description: 'City' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({ description: 'District' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({ description: 'Area/Neighborhood' })
  @IsString()
  @IsOptional()
  area?: string;
}

export class CreateLocalMatchDto {
  @ApiProperty({ description: 'Series or league name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  series: string;

  @ApiProperty({ enum: ['test', 'odi', 't20i', 't20', 'first-class', 'list-a'] })
  @IsEnum(['test', 'odi', 't20i', 't20', 'first-class', 'list-a'])
  format: 'test' | 'odi' | 't20i' | 't20' | 'first-class' | 'list-a';

  @ApiProperty({ description: 'Match start time (ISO 8601)' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ type: VenueDto })
  @ValidateNested()
  @Type(() => VenueDto)
  @IsObject()
  venue: VenueDto;

  @ApiProperty({ type: TeamsDto })
  @ValidateNested()
  @Type(() => TeamsDto)
  @IsObject()
  teams: TeamsDto;

  @ApiPropertyOptional({ type: LeagueDto })
  @ValidateNested()
  @Type(() => LeagueDto)
  @IsObject()
  @IsOptional()
  league?: LeagueDto;

  @ApiProperty({ type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  @IsObject()
  location: LocationDto;
}







