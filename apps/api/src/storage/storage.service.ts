import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.publicUrl = config.getOrThrow<string>('S3_PUBLIC_URL').replace(/\/$/, '');
    const clientOptions = {
      region: config.getOrThrow<string>('S3_REGION'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
      },
    };
    this.client = new S3Client({
      ...clientOptions,
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
    });
    this.signingClient = new S3Client({
      ...clientOptions,
      endpoint: config.getOrThrow<string>('S3_PUBLIC_ENDPOINT'),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) {
        const code = (error as { name?: string }).name;
        if (code !== 'NotFound' && code !== 'NoSuchBucket') throw error;
      }
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created object storage bucket ${this.bucket}`);
    }
  }

  async upload(ownerId: string, mimeType: string, bytes: Buffer): Promise<{ key: string; url: string }> {
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const key = `${ownerId}/${randomUUID()}.${extension}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: bytes,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return { key, url: `${this.publicUrl}/${key}` };
  }

  async createUploadUrl(ownerId: string, mimeType: string): Promise<{ key: string; uploadUrl: string; url: string }> {
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const key = `${ownerId}/${randomUUID()}.${extension}`;
    const uploadUrl = await getSignedUrl(
      this.signingClient,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType }),
      { expiresIn: 300 },
    );
    return { key, uploadUrl, url: `${this.publicUrl}/${key}` };
  }

  async createDownloadUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 300 },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async download(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error('Object storage returned an empty image body');
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async getObjectSize(key: string): Promise<number> {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return result.ContentLength ?? 0;
  }

  async checkHealth(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
