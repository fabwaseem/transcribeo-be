import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import YouTube from 'youtube-sr';
import Innertube from 'youtubei.js';
import { PrismaService } from '../prisma/prisma.service';
import { TranscriptRequestDto } from './dto/transcript-request.dto';
import {
  ProcessedResult,
  TranscriptSegment,
} from './interfaces/transcript.interface';

const execFileAsync = promisify(execFile);

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private readonly BATCH_SIZE = 10;
  private readonly MAX_VIDEOS = 100;

  constructor(private prisma: PrismaService) {}

  async getPlaylistVideos(playlistId: string): Promise<string[]> {
    try {
      const url = `https://www.youtube.com/playlist?list=${playlistId}`;
      const response = await YouTube.getPlaylist(url, { fetchAll: true });
      return response.videos
        .map((video) => video.id)
        .filter((id): id is string => id !== undefined)
        .slice(0, this.MAX_VIDEOS);
    } catch (error) {
      this.logger.error(`Error fetching playlist videos: ${error.message}`);
      return [];
    }
  }

  async getChannelPlaylistId(channelIdentifier: string): Promise<string> {
    try {
      let channelUrl = channelIdentifier;
      if (!channelIdentifier.startsWith('http')) {
        if (channelIdentifier.startsWith('@')) {
          channelUrl = `https://www.youtube.com/${channelIdentifier}`;
        } else if (channelIdentifier.startsWith('UC')) {
          channelUrl = `https://www.youtube.com/channel/${channelIdentifier}`;
        } else {
          channelUrl = `https://www.youtube.com/c/${channelIdentifier}`;
        }
      }

      const channel = await YouTube.search(channelUrl, { type: 'channel' });
      if (!channel || channel.length === 0) return '';

      const channelId = channel[0].id;
      if (!channelId) return '';

      // Convert channel ID to playlist ID format
      return channelId.replace(channelId[1], 'U');
    } catch (error) {
      this.logger.error(`Error fetching channel playlist: ${error.message}`);
      return '';
    }
  }

  async getVideoInfo(videoId: string) {
    try {
      const youtube = await Innertube.create();
      const video = await youtube.getInfo(videoId);

      return {
        id: videoId,
        title: video.basic_info.title || '',
        author: video.basic_info.author || '',
        lengthSeconds: video.basic_info.duration || 0,
        thumbnail: video.basic_info?.thumbnail?.[0]?.url || '',
        description: video.basic_info?.short_description || '',
        channelId: video.basic_info?.channel?.id || '',
        channelName: video.basic_info?.channel?.name || '',
      };
    } catch (error) {
      this.logger.error(`Error fetching video info: ${error.message}`);
      return null;
    }
  }

  async getTranscript(videoId: string) {
    try {
      // Detect platform and use the correct Python path
      const isWin = process.platform === 'win32';
      const pythonPath = isWin
        ? 'py-get-transcript/venv/Scripts/python'
        : 'py-get-transcript/venv/bin/python';
      const { stdout } = await execFileAsync(pythonPath, [
        'py-get-transcript/get_transcript.py',
        videoId,
      ]);
      const result = JSON.parse(stdout);
      if (result.error) throw new Error(result.error);
      return result.transcript;
    } catch (error) {
      this.logger.error(`Error fetching transcript: ${error.message}`);
      return null;
    }
  }

  async processVideoBatch(
    videoIds: string[],
    custom: boolean = false,
  ): Promise<ProcessedResult[]> {
    const results = await Promise.all(
      videoIds.map(async (id) => {
        try {
          const [videoInfo, transcript] = await Promise.all([
            this.getVideoInfo(id),
            this.getTranscript(id),
          ]);
          if (!videoInfo || !transcript || transcript.length === 0) return null;

          // Save to database
          const video = await this.prisma.video.upsert({
            where: { id: videoInfo.id },
            update: {
              title: videoInfo.title,
              author: videoInfo.author,
              lengthSeconds: videoInfo.lengthSeconds,
              thumbnail: videoInfo.thumbnail,
              description: videoInfo.description,
              channelId: videoInfo.channelId,
              channelName: videoInfo.channelName,
            },
            create: {
              id: videoInfo.id,
              title: videoInfo.title,
              author: videoInfo.author,
              lengthSeconds: videoInfo.lengthSeconds,
              thumbnail: videoInfo.thumbnail,
              description: videoInfo.description,
              channelId: videoInfo.channelId,
              channelName: videoInfo.channelName,
            },
          });

          const processedTranscript = this.processTranscript(
            transcript,
            custom,
          );

          await this.prisma.transcript.create({
            data: {
              videoId: video.id,
              segments: processedTranscript as any, // Type assertion for Prisma JSON field
              isCustom: custom,
            },
          });

          return {
            info: videoInfo,
            transcript: {
              original: transcript,
              processed: processedTranscript,
            },
          };
        } catch (error) {
          this.logger.error(`Error processing video ${id}: ${error.message}`);
          return null;
        }
      }),
    );

    return results.filter(
      (result): result is ProcessedResult => result !== null,
    );
  }

  private processTranscript(
    transcript: any[],
    custom: boolean = false,
  ): TranscriptSegment[] {
    if (!custom) {
      return transcript.map((item, index) => ({
        id: index + 1,
        text: this.cleanText(item.text),
        start: item.offset,
        end: item.offset + item.duration,
        duration: item.duration,
      }));
    }

    const MIN_SEGMENT_DURATION = 30;
    const processedSegments: TranscriptSegment[] = [];
    let currentSegment: TranscriptSegment | null = null;

    transcript.forEach((item, index) => {
      const duration = item.duration;
      const offset = item.offset;
      const start = offset;
      const end = offset + duration;
      const text = this.cleanText(item.text);

      if (!currentSegment) {
        currentSegment = {
          id: index + 1,
          text,
          start,
          end,
          duration: end - start,
        };
      } else {
        currentSegment.text += ' ' + text;
        currentSegment.end = end;
        currentSegment.duration = currentSegment.end - currentSegment.start;
      }

      if (
        currentSegment &&
        (currentSegment.duration >= MIN_SEGMENT_DURATION ||
          index === transcript.length - 1)
      ) {
        processedSegments.push(currentSegment);
        currentSegment = null;
      }
    });

    return processedSegments;
  }

  private cleanText(text: string): string {
    if (text.startsWith('[') && text.endsWith(']')) {
      return '';
    }
    return text
      .replace(/\n/g, ' ')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  async processTranscriptRequest(
    dto: TranscriptRequestDto,
  ): Promise<ProcessedResult[]> {
    let videoIds: string[] = [];

    if (dto.videoId) {
      videoIds = [dto.videoId];
    } else if (dto.playlistId) {
      videoIds = await this.getPlaylistVideos(dto.playlistId);
    } else if (dto.channelId) {
      const channelPlaylistId = await this.getChannelPlaylistId(dto.channelId);
      videoIds = await this.getPlaylistVideos(channelPlaylistId);
    }

    if (videoIds.length === 0) {
      throw new Error('No videos found');
    }

    const results: ProcessedResult[] = [];
    for (let i = 0; i < videoIds.length; i += this.BATCH_SIZE) {
      const batch = videoIds.slice(i, i + this.BATCH_SIZE);
      const batchResults = await this.processVideoBatch(batch, dto.custom);
      results.push(...batchResults);
    }

    if (results.length === 0) {
      throw new Error('No transcripts found for any videos');
    }

    return results;
  }
}
