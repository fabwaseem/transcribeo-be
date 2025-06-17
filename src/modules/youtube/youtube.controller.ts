import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { YoutubeService } from './youtube.service';
import { TranscriptRequestDto } from './dto/transcript-request.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { TranscriptResponse } from './interfaces/transcript.interface';

@ApiTags('YouTube')
@Controller('youtube')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Post('transcript')
  @ApiOperation({ summary: 'Get YouTube video transcript(s)' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved transcript(s)',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid API key',
  })
  @ApiResponse({
    status: 404,
    description: 'No videos or transcripts found',
  })
  async getTranscript(
    @Body() dto: TranscriptRequestDto,
  ): Promise<TranscriptResponse> {
    try {
      const result = await this.youtubeService.processTranscriptRequest(dto);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Failed to process transcript request',
        },
        error.message === 'No videos found' ||
        error.message === 'No transcripts found for any videos'
          ? HttpStatus.NOT_FOUND
          : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
