import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { memoryStorage } from 'multer';

const upload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Invalid file type'), false);
    }
  },
});

@ApiTags('media')
@Controller('media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @ApiOperation({ summary: 'List media files (placeholder - returns empty array)' })
  @ApiQuery({ name: 'type', required: false, enum: ['image', 'video', 'audio', 'document'] })
  @ApiResponse({ status: 200, description: 'Media list retrieved successfully' })
  async listMedia(@Query('type') type?: string) {
    // TODO: Implement proper media library with database storage
    // For now, return empty array as the frontend expects this endpoint
    return {
      success: true,
      data: [],
    };
  }

  @Post()
  @UseInterceptors(upload)
  @ApiOperation({ summary: 'Upload media file (auto-detects type)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Media uploaded successfully' })
  async uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Auto-detect file type and route to appropriate handler
    const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
    const isVideo = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.mimetype);

    if (isImage) {
      const result = await this.mediaService.uploadImage(file);
      return {
        success: true,
        data: {
          url: result.url,
          path: result.url, // For backward compatibility
          thumbnailUrl: result.thumbnailUrl,
        },
      };
    } else if (isVideo) {
      const result = await this.mediaService.uploadVideo(file);
      return {
        success: true,
        data: {
          url: result.url,
          path: result.url, // For backward compatibility
          thumbnailUrl: result.thumbnailUrl,
        },
      };
    } else {
      throw new BadRequestException('Invalid file type. Only images and videos are allowed.');
    }
  }

  @Post('upload/image')
  @UseInterceptors(upload)
  @ApiOperation({ summary: 'Upload an image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    const result = await this.mediaService.uploadImage(file);
    return {
      success: true,
      data: {
        url: result.url,
        path: result.url,
        thumbnailUrl: result.thumbnailUrl,
      },
    };
  }

  @Post('upload/video')
  @UseInterceptors(upload)
  @ApiOperation({ summary: 'Upload a video' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Video uploaded successfully' })
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    const result = await this.mediaService.uploadVideo(file);
    return {
      success: true,
      data: {
        url: result.url,
        path: result.url,
        thumbnailUrl: result.thumbnailUrl,
      },
    };
  }

  @Delete()
  @ApiOperation({ summary: 'Delete media by URL' })
  @ApiResponse({ status: 200, description: 'Media deleted successfully' })
  async deleteMedia(@Body('url') url: string) {
    await this.mediaService.deleteMedia(url);
    return { message: 'Media deleted successfully' };
  }
}
