import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { OptionalAuthGuard } from '../auth/optional-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../common/current-user.decorator.js';
import {
  CreateCommentDto,
  CreatePostDto,
  FeedQueryDto,
  UpdatePostDto,
  UpdateProfileDto,
} from './social.dto.js';
import { SocialService } from './social.service.js';

@ApiTags('social')
@Controller()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('posts')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtiene el feed con cursor y controles de visibilidad' })
  timeline(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedQueryDto) {
    return this.social.timeline(user.id, query.limit, query.cursor, query.feed);
  }

  @Post('posts')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publica texto o una publicación con imagen' })
  createPost(@CurrentUser() user: AuthenticatedUser, @Body() body: CreatePostDto) {
    return this.social.createPost(user.id, body);
  }

  @Patch('posts/:postId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edita una publicación propia' })
  updatePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() body: UpdatePostDto,
  ) {
    return this.social.updatePost(user.id, postId, body);
  }

  @Delete('posts/:postId')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Elimina lógicamente una publicación propia' })
  deletePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.social.deletePost(user.id, postId);
  }

  @Post('posts/:postId/like')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alterna el me gusta y devuelve el contador' })
  like(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.social.toggleLike(user.id, postId);
  }

  @Get('posts/:postId/comments')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista comentarios de una publicación visible' })
  comments(@CurrentUser() user: AuthenticatedUser, @Param('postId', ParseUUIDPipe) postId: string) {
    return this.social.listComments(user.id, postId);
  }

  @Post('posts/:postId/comments')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Añade un comentario' })
  createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() body: CreateCommentDto,
  ) {
    return this.social.createComment(user.id, postId, body);
  }

  @Post('posts/:postId/bookmark')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alterna un marcador' })
  bookmark(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.social.toggleBookmark(user.id, postId);
  }

  @Get('bookmarks')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista las publicaciones guardadas del usuario' })
  bookmarks(@CurrentUser() user: AuthenticatedUser) {
    return this.social.bookmarks(user.id);
  }

  @Get('profiles/me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devuelve el perfil de la cuenta actual' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.social.myProfile(user.id);
  }

  @Patch('profiles/me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edita el perfil y la privacidad' })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateProfileDto) {
    return this.social.updateProfile(user.id, body);
  }

  @Get('users/:username')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Obtiene un perfil público o el resumen privado permitido' })
  profile(
    @Param('username') username: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.social.profile(user?.id ?? null, username);
  }

  @Get('users/:username/posts')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Lista publicaciones visibles del perfil' })
  profilePosts(
    @Param('username') username: string,
    @Query() query: FeedQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.social.profilePosts(user?.id ?? null, username, query.limit);
  }

  @Post('users/:username/follow')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sigue a una cuenta pública o solicita acceso a una privada' })
  follow(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.social.follow(user.id, username);
  }

  @Delete('users/:username/follow')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deja de seguir una cuenta' })
  unfollow(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.social.unfollow(user.id, username);
  }

  @Post('users/:username/follow-requests/:followerId/accept')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Acepta una solicitud de seguimiento' })
  acceptFollow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('username') username: string,
    @Param('followerId', ParseUUIDPipe) followerId: string,
  ) {
    return this.social.acceptFollow(user.id, username, followerId);
  }
}
