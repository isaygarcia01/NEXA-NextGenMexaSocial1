import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { DatabaseService } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly maxBytes: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.maxBytes = config.getOrThrow<number>('MAX_UPLOAD_BYTES');
  }

  async uploadImage(userId: string, file: Express.Multer.File) {
    if (!file || file.size === 0 || file.size > this.maxBytes) {
      throw new BadRequestException(`Image must be between 1 byte and ${this.maxBytes} bytes`);
    }
    if (!IMAGE_TYPES.has(file.mimetype)) throw new BadRequestException('Only JPEG, PNG and WebP images are accepted');
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !IMAGE_TYPES.has(detected.mime) || detected.mime !== file.mimetype) {
      throw new BadRequestException('File signature does not match an allowed image format');
    }

    const { bytes: optimized, width, height } = await this.optimizeImage(file.buffer);

    const stored = await this.storage.upload(userId, 'image/webp', optimized);
    try {
      const result = await this.database.query(
        `INSERT INTO media (owner_id, object_key, media_type, mime_type, byte_size, width, height, processing_status)
         VALUES ($1, $2, 'image', 'image/webp', $3, $4, $5, 'ready')
         RETURNING id, mime_type AS "mimeType", byte_size AS "byteSize",
                   width, height, created_at AS "createdAt"`,
        [userId, stored.key, optimized.length, width, height],
      );
      return result.rows[0];
    } catch (error) {
      try {
        await this.storage.delete(stored.key);
      } catch (cleanupError) {
        this.logger.error({
          message: 'Failed to remove an orphaned uploaded image',
          objectKey: stored.key,
          error: cleanupError instanceof Error ? cleanupError.message : 'Unknown storage failure',
        });
      }
      throw error;
    }
  }

  async createUploadUrl(userId: string, mimeType: string, size: number) {
    if (!IMAGE_TYPES.has(mimeType)) throw new BadRequestException('Unsupported image MIME type');
    if (!Number.isInteger(size) || size < 1 || size > this.maxBytes) {
      throw new BadRequestException(`Image must be between 1 byte and ${this.maxBytes} bytes`);
    }
    const upload = await this.storage.createUploadUrl(userId, mimeType);
    try {
      const media = await this.database.query<{ id: string }>(
        `INSERT INTO media (owner_id, object_key, media_type, mime_type, byte_size, processing_status)
         VALUES ($1, $2, 'image', $3, $4, 'pending')
         RETURNING id`,
        [userId, upload.key, mimeType, size],
      );
      return { mediaId: media.rows[0]!.id, ...upload };
    } catch (error) {
      await this.deleteOrphan(upload.key);
      throw error;
    }
  }

  async completeUpload(userId: string, mediaId: string) {
    const claimed = await this.database.query<{
      object_key: string;
      mime_type: string;
      byte_size: string;
    }>(
      `UPDATE media SET processing_status = 'processing'
       WHERE id = $1 AND owner_id = $2 AND processing_status = 'pending'
       RETURNING object_key, mime_type, byte_size`,
      [mediaId, userId],
    );
    const pending = claimed.rows[0];
    if (!pending) throw new ConflictException('Media is not awaiting upload completion');

    let optimizedKey: string | undefined;
    try {
      const actualSize = await this.storage.getObjectSize(pending.object_key);
      if (actualSize !== Number(pending.byte_size) || actualSize > this.maxBytes) {
        throw new BadRequestException('Uploaded image size does not match the declared size');
      }
      const original = await this.storage.download(pending.object_key);
      if (original.length !== Number(pending.byte_size) || original.length > this.maxBytes) {
        throw new BadRequestException('Uploaded image size does not match the declared size');
      }
      const detected = await fileTypeFromBuffer(original);
      if (!detected || detected.mime !== pending.mime_type || !IMAGE_TYPES.has(detected.mime)) {
        throw new BadRequestException('Uploaded image signature does not match the declared MIME type');
      }
      const { bytes, width, height } = await this.optimizeImage(original);
      const stored = await this.storage.upload(userId, 'image/webp', bytes);
      optimizedKey = stored.key;
      const result = await this.database.query(
        `UPDATE media SET object_key = $3, mime_type = 'image/webp', byte_size = $4,
             width = $5, height = $6, processing_status = 'ready'
         WHERE id = $1 AND owner_id = $2 AND processing_status = 'processing'
         RETURNING id, mime_type AS "mimeType", byte_size AS "byteSize",
                   width, height, created_at AS "createdAt"`,
        [mediaId, userId, stored.key, bytes.length, width, height],
      );
      if (!result.rowCount) throw new ConflictException('Media processing was already completed');
      await this.deleteOrphan(pending.object_key);
      return result.rows[0];
    } catch (error) {
      await this.database.query(
        `UPDATE media SET processing_status = $3
         WHERE id = $1 AND owner_id = $2 AND processing_status = 'processing'`,
        [mediaId, userId, error instanceof BadRequestException ? 'rejected' : 'pending'],
      );
      if (optimizedKey) await this.deleteOrphan(optimizedKey);
      if (error instanceof BadRequestException) await this.deleteOrphan(pending.object_key);
      throw error;
    }
  }

  async downloadUrl(userId: string, mediaId: string): Promise<{ url: string }> {
    const result = await this.database.query<{ object_key: string; owner_id: string }>(
      `SELECT m.object_key, m.owner_id
       FROM media m
       WHERE m.id = $1 AND m.processing_status = 'ready'
         AND (m.owner_id = $2 OR EXISTS (
           SELECT 1 FROM post_media pm JOIN posts p ON p.id = pm.post_id
           JOIN profiles pr ON pr.user_id = p.author_id
           WHERE pm.media_id = m.id AND p.status = 'published' AND p.deleted_at IS NULL
             AND (p.author_id = $2
               OR (p.visibility = 'public' AND pr.is_private = false)
               OR (p.visibility IN ('public', 'followers') AND EXISTS (
               SELECT 1 FROM follows f WHERE f.follower_id = $2
                 AND f.followed_id = p.author_id AND f.status = 'accepted'
             )))
         ))`,
      [mediaId, userId],
    );
    const media = result.rows[0];
    if (!media) throw new NotFoundException('Media not found');
    if (media.owner_id !== userId) {
      const access = await this.database.query(
        `SELECT 1 FROM post_media pm JOIN posts p ON p.id = pm.post_id
        JOIN profiles pr ON pr.user_id = p.author_id
        LEFT JOIN follows f ON f.followed_id = p.author_id
          AND f.follower_id = $2 AND f.status = 'accepted'
        WHERE pm.media_id = $1 AND p.status = 'published' AND p.deleted_at IS NULL
          AND (p.author_id = $2
            OR (p.visibility = 'public' AND pr.is_private = false)
            OR (p.visibility IN ('public', 'followers') AND f.follower_id IS NOT NULL))`,
        [mediaId, userId],
      );
      if (!access.rowCount) throw new ForbiddenException('Media is private');
    }
    return { url: await this.storage.createDownloadUrl(media.object_key) };
  }

  private async optimizeImage(input: Buffer): Promise<{ bytes: Buffer; width: number; height: number }> {
    try {
      const output = await sharp(input, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      return { bytes: output.data, width: output.info.width, height: output.info.height };
    } catch {
      throw new BadRequestException('The uploaded image could not be decoded');
    }
  }

  private async deleteOrphan(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.error({
        message: 'Failed to remove an orphaned image object',
        objectKey: key,
        error: error instanceof Error ? error.message : 'Unknown storage failure',
      });
    }
  }
}
