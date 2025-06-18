import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKey } from '@prisma/client';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKeyFromHeader(request);
    const origin = request.headers.origin || request.headers.referer || '*';

    if (!apiKey) {
      throw new UnauthorizedException({
        message: 'API key is missing',
        statusCode: HttpStatus.UNAUTHORIZED,
      });
    }

    const key: ApiKey | null = await this.prisma.apiKey.findUnique({
      where: { key: apiKey, isActive: true },
    });
    if (!key) {
      throw new UnauthorizedException({
        message: 'Invalid API key',
        statusCode: HttpStatus.UNAUTHORIZED,
      });
    }

    // Enforce allowed origins
    if (
      key.allowedOrigins !== '*' &&
      !key.allowedOrigins
        .split(',')
        .map((o) => o.trim())
        .includes(origin)
    ) {
      throw new ForbiddenException({
        message: 'Origin not allowed',
        statusCode: HttpStatus.FORBIDDEN,
      });
    }

    // --- Rate limiting and burst control using Usage table ---
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const burstWindowAgo = new Date(now.getTime() - key.rateLimitWindow * 1000);

    // Max calls (if set)
    if (key.maxCalls !== null && key.maxCalls !== undefined) {
      const totalCalls = await this.prisma.usage.count({
        where: { apiKeyId: key.id },
      });
      if (totalCalls >= key.maxCalls) {
        throw new HttpException(
          {
            message: 'Maximum number of calls reached for this API key',
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Daily limit (if set)
    if (key.dailyLimit !== null && key.dailyLimit !== undefined) {
      const requestsToday = await this.prisma.usage.count({
        where: {
          apiKeyId: key.id,
          timestamp: {
            gte: startOfDay,
          },
        },
      });
      if (requestsToday >= key.dailyLimit) {
        throw new HttpException(
          {
            message: 'Daily request limit reached',
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Monthly limit (if set)
    if (key.monthlyLimit !== null && key.monthlyLimit !== undefined) {
      const requestsThisMonth = await this.prisma.usage.count({
        where: {
          apiKeyId: key.id,
          timestamp: {
            gte: startOfMonth,
          },
        },
      });
      if (requestsThisMonth >= key.monthlyLimit) {
        throw new HttpException(
          {
            message: 'Monthly request limit reached',
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Burst (rate) limiting
    const requestsInBurstWindow = await this.prisma.usage.count({
      where: {
        apiKeyId: key.id,
        timestamp: {
          gte: burstWindowAgo,
        },
      },
    });
    if (requestsInBurstWindow >= key.rateLimitCount) {
      throw new HttpException(
        {
          message: 'Too many requests in a short period (rate limit)',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Attach ApiKey to request for downstream access
    request.apiKey = key;

    // Log API usage
    await this.logApiUsage(key.id, request);

    return true;
  }

  private extractApiKeyFromHeader(request: any): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;
    return authHeader; // Accepts the raw API key
  }

  private async logApiUsage(apiKeyId: string, request: any) {
    await this.prisma.usage.create({
      data: {
        apiKeyId,
        endpoint: request.path,
        status: 'success',
        details: {
          method: request.method,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }
}
