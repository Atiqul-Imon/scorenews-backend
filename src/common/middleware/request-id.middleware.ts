import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Use existing request ID from header or generate new one
    const requestId = req.headers['x-request-id'] || randomUUID();
    
    // Set request ID in request object
    req.headers['x-request-id'] = requestId as string;
    
    // Add request ID to response headers
    res.setHeader('X-Request-ID', requestId as string);
    
    next();
  }
}





