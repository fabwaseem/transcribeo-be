import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKeyFromHeader(request);

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    const isValid = await this.validateApiKey(apiKey);
    if (!isValid) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Log API usage
    await this.logApiUsage(apiKey, request);

    return true;
  }

  private extractApiKeyFromHeader(request: any): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;
    return authHeader; // Accepts the raw API key
  }

  private async validateApiKey(apiKey: string): Promise<boolean> {
    const key = await this.prisma.apiKey.findFirst({
      where: {
        key: apiKey,
        isActive: true,
      },
    });

    return !!key;
  }

  private async logApiUsage(apiKey: string, request: any) {
    const key = await this.prisma.apiKey.findFirst({
      where: { key: apiKey },
    });

    if (key) {
      await this.prisma.usage.create({
        data: {
          apiKeyId: key.id,
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
}
