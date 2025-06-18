import { ApiKey } from '@prisma/client';
import { Request } from 'express';

export interface AuthedRequest extends Request {
  apiKey?: ApiKey;
}
