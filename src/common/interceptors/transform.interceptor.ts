import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T;
  message?: string;
  requestId?: string;
  timestamp?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-request-id'] || 'unknown';

    return next.handle().pipe(
      map((data) => {
        // If response is already formatted, return as is
        if (data && typeof data === 'object' && 'success' in data) {
          return {
            ...data,
            requestId,
            timestamp: new Date().toISOString(),
          };
        }

        // Format response
        return {
          success: true,
          data,
          requestId,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}





