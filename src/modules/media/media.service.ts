import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonLoggerService } from '../../common/logger/winston-logger.service';
import ImageKit from 'imagekit';
import { v2 as cloudinary } from 'cloudinary';
import * as sharp from 'sharp';
import { randomUUID } from 'crypto';

@Injectable()
export class MediaService {
  private imagekit: ImageKit | null = null;
  private useCloudinary: boolean = false;

  constructor(
    private configService: ConfigService,
    private logger: WinstonLoggerService,
  ) {
    // Initialize ImageKit
    const imagekitPublicKey = this.configService.get<string>('IMAGEKIT_PUBLIC_KEY');
    const imagekitPrivateKey = this.configService.get<string>('IMAGEKIT_PRIVATE_KEY');
    const imagekitUrlEndpoint = this.configService.get<string>('IMAGEKIT_URL_ENDPOINT');

    if (imagekitPublicKey && imagekitPrivateKey && imagekitUrlEndpoint) {
      this.imagekit = new ImageKit({
        publicKey: imagekitPublicKey,
        privateKey: imagekitPrivateKey,
        urlEndpoint: imagekitUrlEndpoint,
      });
      this.logger.log('ImageKit initialized', 'MediaService');
    }

    // Initialize Cloudinary as fallback
    const cloudinaryCloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const cloudinaryApiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const cloudinaryApiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret) {
      cloudinary.config({
        cloud_name: cloudinaryCloudName,
        api_key: cloudinaryApiKey,
        api_secret: cloudinaryApiSecret,
      });
      this.useCloudinary = true;
      this.logger.log('Cloudinary initialized', 'MediaService');
    }
  }

  async uploadImage(file: Express.Multer.File): Promise<{ url: string; thumbnailUrl?: string }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only images are allowed.');
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    try {
      // Compress and optimize image
      const optimizedBuffer = await sharp(file.buffer)
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Generate thumbnail
      const thumbnailBuffer = await sharp(file.buffer)
        .resize(400, 400, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Upload to ImageKit or Cloudinary
      if (this.imagekit) {
        const fileName = `${randomUUID()}-${Date.now()}`;
        
        const [mainUpload, thumbnailUpload] = await Promise.all([
          this.imagekit.upload({
            file: optimizedBuffer.toString('base64'),
            fileName: `${fileName}.jpg`,
            useUniqueFileName: true,
          }),
          this.imagekit.upload({
            file: thumbnailBuffer.toString('base64'),
            fileName: `${fileName}-thumb.jpg`,
            useUniqueFileName: true,
          }),
        ]);

        return {
          url: mainUpload.url,
          thumbnailUrl: thumbnailUpload.url,
        };
      } else if (this.useCloudinary) {
        const fileName = `${randomUUID()}-${Date.now()}`;
        
        const [mainUpload, thumbnailUpload] = await Promise.all([
          cloudinary.uploader.upload(`data:${file.mimetype};base64,${optimizedBuffer.toString('base64')}`, {
            public_id: fileName,
            folder: 'sports-platform',
          }),
          cloudinary.uploader.upload(`data:${file.mimetype};base64,${thumbnailBuffer.toString('base64')}`, {
            public_id: `${fileName}-thumb`,
            folder: 'sports-platform',
            width: 400,
            height: 400,
            crop: 'fill',
          }),
        ]);

        return {
          url: mainUpload.secure_url,
          thumbnailUrl: thumbnailUpload.secure_url,
        };
      } else {
        throw new BadRequestException('No media storage configured');
      }
    } catch (error: any) {
      this.logger.error('Error uploading image', error.stack, 'MediaService');
      throw new BadRequestException('Failed to upload image');
    }
  }

  async uploadVideo(file: Express.Multer.File): Promise<{ url: string; thumbnailUrl?: string }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only videos are allowed.');
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 100MB limit');
    }

    try {
      if (this.imagekit) {
        const fileName = `${randomUUID()}-${Date.now()}`;
        
        const upload = await this.imagekit.upload({
          file: file.buffer.toString('base64'),
          fileName: `${fileName}.mp4`,
          useUniqueFileName: true,
        });

        return {
          url: upload.url,
        };
      } else if (this.useCloudinary) {
        const fileName = `${randomUUID()}-${Date.now()}`;
        
        const upload = await cloudinary.uploader.upload(
          `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
          {
            resource_type: 'video',
            public_id: fileName,
            folder: 'sports-platform/videos',
          },
        );

        return {
          url: upload.secure_url,
          thumbnailUrl: upload.secure_url.replace('.mp4', '.jpg'), // Cloudinary auto-generates thumbnails
        };
      } else {
        throw new BadRequestException('No media storage configured');
      }
    } catch (error: any) {
      this.logger.error('Error uploading video', error.stack, 'MediaService');
      throw new BadRequestException('Failed to upload video');
    }
  }

  async deleteMedia(url: string): Promise<void> {
    try {
      if (this.imagekit) {
        // Extract file ID from ImageKit URL
        const fileId = url.split('/').pop()?.split('?')[0];
        if (fileId) {
          await this.imagekit.deleteFile(fileId);
        }
      } else if (this.useCloudinary) {
        // Extract public_id from Cloudinary URL
        const publicId = url.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (error: any) {
      this.logger.error('Error deleting media', error.stack, 'MediaService');
      // Don't throw - deletion failures shouldn't break the flow
    }
  }
}
