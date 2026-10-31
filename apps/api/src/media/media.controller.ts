import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../common/current-user.decorator.js';
import { MediaService } from './media.service.js';

class UploadUrlQuery {
  @IsString()
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20_000_000)
  size!: number;
}

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('images')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sube, valida y optimiza una imagen en MinIO/S3' })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 20_000_000, files: 1 },
  }))
  uploadImage(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('An image file is required');
    return this.media.uploadImage(user.id, file);
  }

  @Post(':mediaId/complete')
  @ApiOperation({ summary: 'Valida y optimiza una carga directa firmada' })
  completeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    return this.media.completeUpload(user.id, mediaId);
  }

  @Get('upload-url')
  @ApiOperation({ summary: 'Crea una URL de carga firmada de un solo objeto' })
  createUploadUrl(@CurrentUser() user: AuthenticatedUser, @Query() query: UploadUrlQuery) {
    return this.media.createUploadUrl(user.id, query.mimeType, query.size);
  }

  @Get(':mediaId/url')
  @ApiOperation({ summary: 'Obtiene una URL temporal firmada para un medio visible' })
  downloadUrl(@CurrentUser() user: AuthenticatedUser, @Param('mediaId') mediaId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaId)) {
      throw new BadRequestException('Invalid media id');
    }
    return this.media.downloadUrl(user.id, mediaId);
  }
}
