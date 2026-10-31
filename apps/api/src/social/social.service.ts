import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  CreateCommentDto,
  CreatePostDto,
  UpdatePostDto,
  UpdateProfileDto,
} from './social.dto.js';

@Injectable()
export class SocialService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  async timeline(userId: string, limit: number, cursor?: string, feed: 'home' | 'following' = 'home') {
    const cursorParts = cursor?.split('|');
    if (cursor && (
      cursorParts?.length !== 2
      || Number.isNaN(Date.parse(cursorParts[0]!))
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursorParts[1]!)
    )) {
      throw new BadRequestException('Invalid feed cursor');
    }
    const result = await this.database.query(
      `SELECT p.id, p.author_id AS "authorId", u.username,
              pr.display_name AS "displayName", pr.avatar_url AS "avatarUrl",
              p.body, p.visibility, p.published_at AS "publishedAt",
              p.edited_at AS "editedAt",
              (SELECT count(*)::int FROM reactions r WHERE r.post_id = p.id) AS "likeCount",
              EXISTS (SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1) AS "liked",
              EXISTS (SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = $1) AS "bookmarked",
              (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id) AS "commentCount",
              (SELECT m.id FROM post_media pm JOIN media m ON m.id = pm.media_id
               WHERE pm.post_id = p.id ORDER BY pm.position LIMIT 1) AS "mediaId"
              ,(SELECT m.object_key FROM post_media pm JOIN media m ON m.id = pm.media_id
               WHERE pm.post_id = p.id ORDER BY pm.position LIMIT 1) AS "mediaKey"
       FROM posts p
       JOIN users u ON u.id = p.author_id
       JOIN profiles pr ON pr.user_id = u.id
       WHERE p.status = 'published' AND p.deleted_at IS NULL
         AND (p.author_id = $1
           OR (p.visibility = 'public' AND pr.is_private = false)
           OR (p.visibility IN ('public', 'followers') AND EXISTS (
             SELECT 1 FROM follows f WHERE f.follower_id = $1
               AND f.followed_id = p.author_id AND f.status = 'accepted'
           )))
         AND ($2::timestamptz IS NULL OR (p.published_at, p.id) < ($2::timestamptz, $3::uuid))
         AND ($4 = 'home' OR p.author_id = $1 OR EXISTS (
           SELECT 1 FROM follows f WHERE f.follower_id = $1
             AND f.followed_id = p.author_id AND f.status = 'accepted'
         ))
       ORDER BY p.published_at DESC, p.id DESC
       LIMIT $5`,
      [userId, cursorParts?.[0] ?? null, cursorParts?.[1] ?? null, feed, limit],
    );
    const items = await Promise.all(result.rows.map(async (post) => ({
      ...post,
      mediaUrl: post.mediaKey ? await this.storage.createDownloadUrl(post.mediaKey) : null,
      mediaKey: undefined,
    })));
    return {
      items,
      nextCursor: result.rows.length === limit
        ? `${new Date(result.rows[result.rows.length - 1]!.publishedAt).toISOString()}|${result.rows[result.rows.length - 1]!.id}`
        : null,
    };
  }

  async createPost(authorId: string, input: CreatePostDto) {
    if (input.mediaId) {
      const media = await this.database.query(
        `SELECT id FROM media WHERE id = $1 AND owner_id = $2 AND processing_status = 'ready'`,
        [input.mediaId, authorId],
      );
      if (!media.rowCount) throw new NotFoundException('Media not found');
    }
    return this.database.transaction(async (client) => {
      const post = await client.query(
        `INSERT INTO posts (author_id, body, visibility)
         VALUES ($1, $2, $3) RETURNING id, body, visibility, published_at AS "publishedAt"`,
        [authorId, input.body.trim(), input.visibility ?? 'public'],
      );
      if (input.mediaId) {
        await client.query(
          'INSERT INTO post_media (post_id, media_id, position) VALUES ($1, $2, 0)',
          [post.rows[0]!.id, input.mediaId],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id)
         VALUES ($1, 'post.created', 'post', $2)`,
        [authorId, post.rows[0]!.id],
      );
      const created = post.rows[0]!;
      if (input.mediaId) {
        const media = await client.query<{ object_key: string }>(
          'SELECT object_key FROM media WHERE id = $1',
          [input.mediaId],
        );
        return { ...created, mediaUrl: await this.storage.createDownloadUrl(media.rows[0]!.object_key) };
      }
      return created;
    });
  }

  async updatePost(userId: string, postId: string, input: UpdatePostDto) {
    const result = await this.database.query(
      `UPDATE posts SET body = COALESCE($3, body),
         visibility = COALESCE($4, visibility), edited_at = now(), updated_at = now()
       WHERE id = $1 AND author_id = $2 AND status = 'published' AND deleted_at IS NULL
       RETURNING id, body, visibility, edited_at AS "editedAt"`,
      [postId, userId, input.body?.trim() ?? null, input.visibility ?? null],
    );
    if (!result.rowCount) throw new NotFoundException('Post not found');
    await this.audit(userId, 'post.updated', 'post', postId);
    return result.rows[0];
  }

  async deletePost(userId: string, postId: string): Promise<void> {
    const result = await this.database.query(
      `UPDATE posts SET status = 'removed', deleted_at = now(), updated_at = now()
       WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL`,
      [postId, userId],
    );
    if (!result.rowCount) throw new NotFoundException('Post not found');
    await this.audit(userId, 'post.deleted', 'post', postId);
  }

  async toggleLike(userId: string, postId: string) {
    await this.requireVisiblePost(userId, postId);
    const deleted = await this.database.query(
      'DELETE FROM reactions WHERE user_id = $1 AND post_id = $2 RETURNING post_id',
      [userId, postId],
    );
    const liked = !deleted.rowCount;
    if (liked) {
      await this.database.query(
        `INSERT INTO reactions (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, postId],
      );
    }
    const count = await this.database.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM reactions WHERE post_id = $1',
      [postId],
    );
    await this.audit(userId, liked ? 'post.liked' : 'post.unliked', 'post', postId);
    return { liked, count: count.rows[0]!.count };
  }

  async listComments(userId: string, postId: string) {
    await this.requireVisiblePost(userId, postId);
    const result = await this.database.query(
      `SELECT c.id, c.body, c.created_at AS "createdAt",
              u.id AS "authorId", u.username, pr.display_name AS "displayName",
              pr.avatar_url AS "avatarUrl"
       FROM comments c JOIN users u ON u.id = c.author_id
       JOIN profiles pr ON pr.user_id = u.id
       WHERE c.post_id = $1 ORDER BY c.created_at ASC LIMIT 100`,
      [postId],
    );
    return result.rows;
  }

  async createComment(userId: string, postId: string, input: CreateCommentDto) {
    await this.requireVisiblePost(userId, postId);
    const result = await this.database.query(
      `INSERT INTO comments (post_id, author_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, post_id AS "postId", author_id AS "authorId", body, created_at AS "createdAt"`,
      [postId, userId, input.body.trim()],
    );
    await this.audit(userId, 'comment.created', 'comment', result.rows[0]!.id);
    return result.rows[0];
  }

  async toggleBookmark(userId: string, postId: string) {
    await this.requireVisiblePost(userId, postId);
    const removed = await this.database.query(
      'DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2 RETURNING post_id',
      [userId, postId],
    );
    if (!removed.rowCount) {
      await this.database.query(
        'INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, postId],
      );
    }
    await this.audit(userId, removed.rowCount ? 'post.unbookmarked' : 'post.bookmarked', 'post', postId);
    return { bookmarked: !removed.rowCount };
  }

  async bookmarks(userId: string) {
    const result = await this.database.query(
      `SELECT p.id, u.username, pr.display_name AS "displayName",
              p.body, p.published_at AS "publishedAt",
              (SELECT count(*)::int FROM reactions r WHERE r.post_id = p.id) AS "likeCount",
              (SELECT m.object_key FROM post_media pm JOIN media m ON m.id = pm.media_id
               WHERE pm.post_id = p.id ORDER BY pm.position LIMIT 1) AS "mediaKey"
       FROM bookmarks b JOIN posts p ON p.id = b.post_id
       JOIN users u ON u.id = p.author_id JOIN profiles pr ON pr.user_id = u.id
       WHERE b.user_id = $1 AND p.status = 'published' AND p.deleted_at IS NULL
         AND (p.author_id = $1
           OR (p.visibility = 'public' AND pr.is_private = false)
           OR (p.visibility IN ('public', 'followers') AND EXISTS (
             SELECT 1 FROM follows f WHERE f.follower_id = $1
               AND f.followed_id = p.author_id AND f.status = 'accepted'
           )))
       ORDER BY b.created_at DESC LIMIT 100`,
      [userId],
    );
    return Promise.all(result.rows.map(async (post) => ({
      ...post,
      mediaUrl: post.mediaKey ? await this.storage.createDownloadUrl(post.mediaKey) : null,
      mediaKey: undefined,
    })));
  }

  async follow(userId: string, username: string) {
    const target = await this.database.query<{ id: string; is_private: boolean }>(
      `SELECT u.id, p.is_private FROM users u JOIN profiles p ON p.user_id = u.id
       WHERE u.username = $1 AND u.deleted_at IS NULL AND u.status = 'active'`,
      [username.toLowerCase()],
    );
    const user = target.rows[0];
    if (!user) throw new NotFoundException('User not found');
    if (user.id === userId) throw new ForbiddenException('You cannot follow yourself');
    await this.database.query(
      `INSERT INTO follows (follower_id, followed_id, status)
       VALUES ($1, $2, $3) ON CONFLICT (follower_id, followed_id)
       DO UPDATE SET status = EXCLUDED.status`,
      [userId, user.id, user.is_private ? 'pending' : 'accepted'],
    );
    await this.audit(userId, 'user.followed', 'user', user.id);
    return { following: !user.is_private, requestPending: user.is_private };
  }

  async unfollow(userId: string, username: string): Promise<void> {
    const result = await this.database.query(
      `DELETE FROM follows f USING users u
       WHERE f.follower_id = $1 AND f.followed_id = u.id AND u.username = $2
       RETURNING f.followed_id`,
      [userId, username.toLowerCase()],
    );
    if (result.rowCount) await this.audit(userId, 'user.unfollowed', 'user', result.rows[0]!.followed_id);
  }

  async acceptFollow(ownerId: string, username: string, followerId: string) {
    const result = await this.database.query(
      `UPDATE follows f SET status = 'accepted'
       FROM users u WHERE f.followed_id = $1 AND f.follower_id = $2
         AND u.id = f.followed_id AND u.username = $3 AND f.status = 'pending'
       RETURNING f.follower_id`,
      [ownerId, followerId, username.toLowerCase()],
    );
    if (!result.rowCount) throw new NotFoundException('Follow request not found');
    await this.audit(ownerId, 'user.follow_request_accepted', 'user', followerId);
    return { accepted: true };
  }

  async myProfile(userId: string) {
    const result = await this.database.query<{ username: string }>(
      'SELECT username FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId],
    );
    const user = result.rows[0];
    if (!user) throw new NotFoundException('User not found');
    return this.profile(userId, user.username);
  }

  async profile(viewerId: string | null, username: string) {
    const result = await this.database.query(
      `SELECT u.id, u.username, p.display_name AS "displayName", p.bio,
              p.avatar_url AS "avatarUrl", p.banner_url AS "bannerUrl",
              p.website_url AS "websiteUrl", p.location, p.is_private AS "isPrivate",
              (SELECT count(*)::int FROM follows WHERE followed_id = u.id AND status = 'accepted') AS followers,
              (SELECT count(*)::int FROM follows WHERE follower_id = u.id AND status = 'accepted') AS following,
              (SELECT count(*)::int FROM posts WHERE author_id = u.id AND status = 'published' AND deleted_at IS NULL) AS posts,
              EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = u.id AND status = 'accepted') AS "viewerFollows"
       FROM users u JOIN profiles p ON p.user_id = u.id
       WHERE u.username = $2 AND u.deleted_at IS NULL AND u.status = 'active'`,
      [viewerId, username.toLowerCase()],
    );
    const profile = result.rows[0];
    if (!profile) throw new NotFoundException('User not found');
    if (profile.isPrivate && viewerId !== profile.id && !profile.viewerFollows) {
      return {
        ...profile,
        bio: null,
        avatarUrl: null,
        bannerUrl: null,
        websiteUrl: null,
        location: null,
        followers: null,
        following: null,
        posts: null,
        private: true,
      };
    }
    if (profile.avatarUrl && !profile.avatarUrl.startsWith('http')) {
      profile.avatarUrl = await this.storage.createDownloadUrl(profile.avatarUrl);
    }
    return profile;
  }

  async profilePosts(viewerId: string | null, username: string, limit = 20) {
    const result = await this.database.query(
      `SELECT p.id, u.username, pr.display_name AS "displayName",
              p.body, p.visibility, p.published_at AS "publishedAt",
              (SELECT count(*)::int FROM reactions r WHERE r.post_id = p.id) AS "likeCount",
              (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id) AS "commentCount",
              (SELECT m.object_key FROM post_media pm JOIN media m ON m.id = pm.media_id
               WHERE pm.post_id = p.id ORDER BY pm.position LIMIT 1) AS "mediaKey"
       FROM posts p JOIN users u ON u.id = p.author_id
       JOIN profiles pr ON pr.user_id = u.id
       WHERE u.username = $1 AND p.status = 'published' AND p.deleted_at IS NULL
         AND (u.id = $2
           OR (pr.is_private = false AND p.visibility = 'public')
           OR (p.visibility IN ('public', 'followers') AND EXISTS (
             SELECT 1 FROM follows f WHERE f.follower_id = $2
               AND f.followed_id = u.id AND f.status = 'accepted'
           )))
       ORDER BY p.published_at DESC, p.id DESC LIMIT $3`,
      [username.toLowerCase(), viewerId, limit],
    );
    return Promise.all(result.rows.map(async (post) => ({
      ...post,
      mediaUrl: post.mediaKey ? await this.storage.createDownloadUrl(post.mediaKey) : null,
      mediaKey: undefined,
    })));
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    if (input.avatarMediaId) {
      const media = await this.database.query<{ object_key: string }>(
        `SELECT object_key FROM media WHERE id = $1 AND owner_id = $2 AND processing_status = 'ready'`,
        [input.avatarMediaId, userId],
      );
      if (!media.rowCount) throw new NotFoundException('Avatar media not found');
      const result = await this.database.query(
        `UPDATE profiles SET display_name = COALESCE($2, display_name),
           bio = COALESCE($3, bio), location = COALESCE($4, location),
           website_url = COALESCE($5, website_url), is_private = COALESCE($6, is_private),
           avatar_url = $7, updated_at = now()
         WHERE user_id = $1
         RETURNING user_id AS id, display_name AS "displayName", bio,
           avatar_url AS "avatarUrl", website_url AS "websiteUrl", location, is_private AS "isPrivate"`,
        [userId, input.displayName?.trim() ?? null, input.bio ?? null, input.location ?? null,
          input.websiteUrl ?? null, input.isPrivate ?? null, media.rows[0]!.object_key],
      );
      await this.audit(userId, 'profile.updated', 'user', userId);
      const updated = result.rows[0]!;
      updated.avatarUrl = await this.storage.createDownloadUrl(media.rows[0]!.object_key);
      return updated;
    }
    const result = await this.database.query(
      `UPDATE profiles SET display_name = COALESCE($2, display_name),
         bio = COALESCE($3, bio), location = COALESCE($4, location),
         website_url = COALESCE($5, website_url), is_private = COALESCE($6, is_private),
         updated_at = now()
       WHERE user_id = $1
       RETURNING user_id AS id, display_name AS "displayName", bio,
         avatar_url AS "avatarUrl", website_url AS "websiteUrl", location, is_private AS "isPrivate"`,
      [userId, input.displayName?.trim() ?? null, input.bio ?? null, input.location ?? null,
        input.websiteUrl ?? null, input.isPrivate ?? null],
    );
    await this.audit(userId, 'profile.updated', 'user', userId);
    return result.rows[0];
  }

  private async requireVisiblePost(userId: string, postId: string): Promise<void> {
    const result = await this.database.query(
      `SELECT 1 FROM posts p JOIN profiles pr ON pr.user_id = p.author_id
       WHERE p.id = $1 AND p.status = 'published'
        AND p.deleted_at IS NULL AND (
          p.author_id = $2
          OR (p.visibility = 'public' AND pr.is_private = false)
          OR (p.visibility IN ('public', 'followers') AND EXISTS (
            SELECT 1 FROM follows f
            WHERE f.follower_id = $2 AND f.followed_id = p.author_id AND f.status = 'accepted'
          ))
        )`,
      [postId, userId],
    );
    if (!result.rowCount) throw new NotFoundException('Post not found');
  }

  private async audit(actorId: string, action: string, resourceType: string, resourceId: string) {
    await this.database.query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id)
       VALUES ($1, $2, $3, $4)`,
      [actorId, action, resourceType, resourceId],
    );
  }
}
