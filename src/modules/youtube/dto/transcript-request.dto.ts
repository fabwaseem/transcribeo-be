import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class TranscriptRequestDto {
  @ApiProperty({ description: 'YouTube video ID', example: 'dQw4w9WgXcQ' })
  @IsString()
  @IsOptional()
  videoId?: string;

  @ApiProperty({ description: 'YouTube playlist ID', example: 'PLxxxxxxxx' })
  @IsString()
  @IsOptional()
  playlistId?: string;

  @ApiProperty({
    description: 'YouTube channel ID or handle',
    example: '@channel',
  })
  @IsString()
  @IsOptional()
  channelId?: string;

  @ApiProperty({
    description: 'Whether to use custom transcript processing',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  custom?: boolean;
}
