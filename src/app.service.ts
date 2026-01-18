import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { HealthCheckService, HealthCheck, MongooseHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';
import { RedisService } from './redis/redis.service';

@Injectable()
export class AppService {
  constructor(
    private readonly healthCheck: HealthCheckService,
    private readonly mongooseHealth: MongooseHealthIndicator,
    private readonly memoryHealth: MemoryHealthIndicator,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async getHealth() {
    const healthStatus: any = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get<string>('NODE_ENV'),
      version: '1.0.0',
      services: {},
    };

    try {
      // MongoDB health
      const mongoStatus = this.connection.readyState;
      healthStatus.services.mongodb = {
        status: mongoStatus === 1 ? 'connected' : mongoStatus === 2 ? 'connecting' : 'disconnected',
        readyState: mongoStatus,
      };

      // Redis health
      const redisStatus = await this.redisService.isHealthy();
      healthStatus.services.redis = {
        status: redisStatus ? 'connected' : 'disconnected',
      };

      // Memory health
      const memoryStatus = await this.memoryHealth.checkHeap('memory_heap', 150 * 1024 * 1024);
      healthStatus.services.memory = memoryStatus;

      // Determine overall health
      const criticalServices = ['mongodb', 'redis'];
      const allCriticalHealthy = criticalServices.every(
        (service) => healthStatus.services[service]?.status === 'connected',
      );

      if (!allCriticalHealthy) {
        healthStatus.status = 'DEGRADED';
        return {
          ...healthStatus,
          statusCode: 503,
        };
      }

      return {
        ...healthStatus,
        statusCode: 200,
      };
    } catch (error) {
      return {
        ...healthStatus,
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 503,
      };
    }
  }
}

