import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import YouTube from 'youtube-sr';
import Innertube, { UniversalCache } from 'youtubei.js';
import { PrismaService } from '../prisma/prisma.service';
import { TranscriptRequestDto } from './dto/transcript-request.dto';
import {
  GeneratedTranscript,
  ProcessedResult,
  ProcessedTranscript,
  VideoInfo,
} from './interfaces/transcript.interface';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private readonly BATCH_SIZE = 10;

  constructor(private prisma: PrismaService) {}

  async getPlaylistVideos(playlistId: string): Promise<string[]> {
    try {
      const url = `https://www.youtube.com/playlist?list=${playlistId}`;
      const response = await YouTube.getPlaylist(url, { fetchAll: true });
      return response.videos
        .map((video) => video.id)
        .filter((id): id is string => id !== undefined);
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

  async getVideoInfo(videoId: string): Promise<VideoInfo | null> {
    try {
      const existingVideo = await this.prisma.video.findUnique({
        where: { id: videoId },
      });
      if (existingVideo) {
        return {
          id: existingVideo.id,
          title: existingVideo.title,
          author: existingVideo.author,
          duration: existingVideo.duration,
          thumbnail: existingVideo.thumbnail || '',
          description: existingVideo.description || '',
          tags: existingVideo.tags,
          likes: existingVideo.likes,
          category: existingVideo.category,
          views: existingVideo.views,
          channel: {
            id: existingVideo.channelId,
            name: existingVideo.channelName,
          },
        };
      }

      const innertube = await Innertube.create({
        cache: new UniversalCache(true),
      });
      const video = await innertube.getInfo(videoId);
      const videoInfo: VideoInfo = {
        id: videoId,
        title: video.basic_info.title || '',
        author: video.basic_info.author || '',
        duration: video.basic_info.duration || 0,
        thumbnail: video.basic_info?.thumbnail?.[0]?.url || '',
        description: video.basic_info?.short_description || '',
        channel: {
          id: video.basic_info?.channel?.id || '',
          name: video.basic_info?.channel?.name || '',
        },
        tags: video.basic_info?.tags || video.basic_info?.keywords || [],
        likes: video.basic_info?.like_count || 0,
        category: video.basic_info?.category || '',
        views: video.basic_info?.view_count || 0,
      };
      await this.prisma.video.upsert({
        where: { id: videoId },
        update: {
          title: videoInfo.title,
          author: videoInfo.author,
          duration: videoInfo.duration,
          thumbnail: videoInfo.thumbnail,
          description: videoInfo.description,
          channelId: videoInfo.channel.id,
          channelName: videoInfo.channel.name,
          tags: videoInfo.tags,
          likes: videoInfo.likes,
          category: videoInfo.category,
          views: videoInfo.views,
        },
        create: {
          id: videoId,
          title: videoInfo.title,
          author: videoInfo.author,
          duration: videoInfo.duration,
          thumbnail: videoInfo.thumbnail,
          description: videoInfo.description,
          channelId: videoInfo.channel.id,
          channelName: videoInfo.channel.name,
          tags: videoInfo.tags,
          likes: videoInfo.likes,
          category: videoInfo.category,
          views: videoInfo.views,
        },
      });
      return videoInfo;
    } catch (error) {
      this.logger.error(`Error fetching video info: ${error.message}`);
      return null;
    }
  }

  async getTranscript(videoId: string): Promise<GeneratedTranscript[] | null> {
    try {
      const existingTranscript = await this.prisma.transcript.findUnique({
        where: { videoId: videoId },
      });
      if (existingTranscript && existingTranscript.segments) {
        return existingTranscript.segments as unknown as GeneratedTranscript[];
      }

      // Detect platform and use the correct Python path
      const isWin = process.platform === 'win32';
      const pythonPath = isWin
        ? 'py-get-transcript/venv/Scripts/python'
        : 'py-get-transcript/venv/bin/python';
      const { stdout } = await execFileAsync(
        pythonPath,
        ['py-get-transcript/get_transcript.py', videoId],
        { maxBuffer: 10 * 1024 * 1024 }, // 10MB buffer
      );
      const result = JSON.parse(stdout);
      if (result.error) throw new Error(result.error);
      await this.prisma.transcript.upsert({
        where: { videoId: videoId },
        update: {
          videoId: videoId,
          segments: result.transcript as any,
        },
        create: {
          videoId: videoId,
          segments: result.transcript as any,
        },
      });
      return result.transcript as GeneratedTranscript[];
    } catch (error) {
      this.logger.error(`Error fetching transcript: ${error.message}`);
      return null;
    }
  }

  async processVideoBatch(
    videoIds: string[],
    custom: boolean = false,
    minLength: number = 10,
  ): Promise<ProcessedResult[]> {
    const results = await Promise.all(
      videoIds.map(async (id) => {
        try {
          const [videoInfo, transcript] = await Promise.all([
            this.getVideoInfo(id),
            this.getTranscript(id),
          ]);
          if (!videoInfo || !transcript || transcript.length === 0) return null;

          if (custom && transcript.length > 0) {
            const processedTranscript = this.processTranscript(
              transcript,
              custom,
              minLength,
            );
            return {
              info: videoInfo,
              transcript: {
                original: transcript,
                custom: processedTranscript,
              },
            };
          }

          return {
            info: videoInfo,
            transcript: {
              original: transcript,
            },
          };
        } catch (error) {
          this.logger.error(`Error processing video ${id}: ${error.message}`);
          return null;
        }
      }),
    );

    return results.filter((result) => result !== null) as ProcessedResult[];
  }

  private processTranscript(
    transcript: GeneratedTranscript[],
    custom: boolean = false,
    minLength: number = 10,
  ): ProcessedTranscript[] {
    if (!custom) {
      return transcript.map((item, index) => ({
        id: index + 1,
        text: this.cleanText(item.text),
        start: item.start,
        end: item.start + item.duration,
        duration: item.duration,
      }));
    }

    const processedSegments: ProcessedTranscript[] = [];
    let currentSegment: ProcessedTranscript | null = null;

    transcript.forEach((item, index) => {
      const start = item.start;
      const end = item.start + item.duration;
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
        (currentSegment.duration >= minLength ||
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
    maxVideosPerCall: number = 1,
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

    // Enforce maxVideosPerCall
    videoIds = videoIds.slice(0, maxVideosPerCall);

    const results: ProcessedResult[] = [];
    for (let i = 0; i < videoIds.length; i += this.BATCH_SIZE) {
      const batch = videoIds.slice(i, i + this.BATCH_SIZE);
      const batchResults = await this.processVideoBatch(
        batch,
        dto.custom,
        dto.minLength,
      );
      results.push(...batchResults);
    }

    if (results.length === 0) {
      throw new Error('No transcripts found for any videos');
    }

    return results;
  }
}
