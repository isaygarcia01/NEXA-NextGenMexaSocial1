import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePostDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  body!: string;

  @ApiPropertyOptional({ enum: ['public', 'followers', 'private'], default: 'public' })
  @IsOptional()
  @IsIn(['public', 'followers', 'private'])
  visibility?: 'public' | 'followers' | 'private';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  mediaId?: string;
}

export class UpdatePostDto {
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  body?: string;

  @ApiPropertyOptional({ enum: ['public', 'followers', 'private'] })
  @IsOptional()
  @IsIn(['public', 'followers', 'private'])
  visibility?: 'public' | 'followers' | 'private';
}

export class CreateCommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  body!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(0, 120)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  websiteUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  avatarMediaId?: string;
}

export class FeedQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @ApiPropertyOptional({ description: 'Cursor del último elemento, ISO8601|UUID' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: ['home', 'following'], default: 'home' })
  @IsOptional()
  @IsIn(['home', 'following'])
  feed: 'home' | 'following' = 'home';
}

export class UsernameParamDto {
  @ApiProperty()
  @IsString()
  @Length(3, 30)
  username!: string;
}
