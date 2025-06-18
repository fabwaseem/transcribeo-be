import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

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

  @ApiProperty({
    description: 'Min length of a segment in seconds',
    example: 10,
  })
  @IsNumber()
  @IsOptional()
  minLength?: number;
}
