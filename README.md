# NEXA

NEXA es una plataforma social visual-first con una interfaz oscura, acceso seguro, perfiles, publicaciones, interacciones y almacenamiento multimedia. El repositorio está organizado como monolito modular para mantener transacciones y autorización consistentes; los servicios externos se pueden escalar horizontalmente.

## Arquitectura

```text
apps/
  web/                 Next.js App Router, React, TypeScript, Tailwind, Framer Motion
    src/app/           Feed, autenticación, perfil y estilos
    src/components/    Formularios y provider de React Query
    src/lib/            Cliente HTTP con refresh automático
    src/store/          Sesión en memoria y navegación con Zustand
  api/                 NestJS REST versionado /api/v1
    src/auth/           Argon2id, access JWT, refresh rotatorio, sesiones, correo
    src/social/         Feed cursor, posts, perfiles, follows, likes, comentarios, bookmarks
    src/media/          Validación, optimización WebP y URLs firmadas
    src/database/       Pool PostgreSQL y migraciones con lock distribuido
    src/cache/          Redis y límites de tráfico
    src/storage/        S3/MinIO
    migrations/         Migraciones 001–005 y seed inicial
infra/                 Recursos auxiliares de PostgreSQL
docs/                  Diseño y decisiones de arquitectura
.github/workflows/     Lint, tests, builds y build de contenedores
docker-compose.yml     Web, API, PostgreSQL, Redis y MinIO
```

La API aplica validación estricta de DTO, Helmet, CORS configurable, Swagger (`/docs`), logs Pino con redacción de credenciales, filtro global de errores y health checks de PostgreSQL, Redis y S3. Las mutaciones sociales y de cuenta escriben eventos de auditoría. El feed usa cursor estable por fecha e ID; los datos multimedia se guardan en S3 compatible, no en la base.

## Requisitos

- Node.js 24.15+ y npm.
- Docker Desktop con Docker Compose v2 para el stack local integrado.

## Inicio local con Docker

En PowerShell, desde la raíz:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

URLs:

- Web: <http://localhost:3000>
- API: <http://localhost:3001/api/v1>
- Swagger: <http://localhost:3001/docs>
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO API / consola: <http://localhost:9000> / <http://localhost:9001>

La API aplica las migraciones incluidas en `apps/api/migrations` al iniciar y espera a que PostgreSQL, Redis y MinIO estén disponibles. La migración `002_seed_demo.sql` crea publicaciones de muestra; las cuentas de seed no tienen credenciales.

## Desarrollo sin Docker

Instala dependencias en cada app y configura `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `JWT_ACCESS_SECRET` y `FRONTEND_URL` para servicios locales accesibles:

```powershell
npm --prefix apps\api ci
npm --prefix apps\web ci
npm run dev:api
```

En otra terminal, desde la raíz:

```powershell
npm run dev:web
```

`NEXT_PUBLIC_API_URL` permite definir el endpoint HTTP de la API. El valor predeterminado es `http://localhost:3001/api/v1`.

## Comandos de validación

Desde la raíz:

```powershell
npm run lint
npm run build
npm test
npm run test:e2e
npm run test:coverage
```

Las pruebas E2E ejecutan PostgreSQL embebido PGlite y S3 compatible S3rver; Redis se reemplaza por un fake aislado en esa suite. Para probar Redis de producción, usa el servicio de Docker Compose. Las pruebas cubren registro/verificación, login, refresh rotation, revocación por cambio de contraseña, feed, posts, comentarios, reacciones, follows, perfil privado, sesiones y carga/descarga de imágenes.

## Variables de entorno

| Variable | Propósito | Local |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Base PostgreSQL | valores de `.env.example` |
| `REDIS_PASSWORD` | Autenticación Redis | valor de `.env.example` |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | Credenciales MinIO | valores de `.env.example` |
| `DATABASE_URL` | Conexión PostgreSQL de la API | lo genera Compose |
| `REDIS_URL` | Conexión Redis de la API | lo genera Compose |
| `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_PUBLIC_URL` | Conexiones privada/pública S3 | API MinIO local |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Bucket y credenciales S3 | valores de `.env.example` |
| `JWT_ACCESS_SECRET` | Firma de access JWT (mínimo 32 caracteres) | secreto local del ejemplo |
| `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS` | Duración de tokens | 900 s / 30 días |
| `FRONTEND_URL`, `PORT`, `TRUST_PROXY` | CORS, puerto y proxy confiable | defaults locales |
| `MAX_UPLOAD_BYTES` | Límite de imagen | 10 MB |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Envío de verificación y recuperación | opcional en desarrollo, obligatorio en producción |
| `NEXT_PUBLIC_API_URL` | URL del API visible desde navegador | `http://localhost:3001/api/v1` |

En producción reemplaza las credenciales locales, configura TLS/gestión de secretos y SMTP real. No publiques los defaults de desarrollo.

## Endpoints disponibles

- Auth: `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `GET /auth/sessions`, `DELETE /auth/sessions/:sessionId`.
- Social: `GET/POST /posts`, `PATCH/DELETE /posts/:postId`, `POST /posts/:postId/like`, `GET/POST /posts/:postId/comments`, `POST /posts/:postId/bookmark`, `GET /bookmarks`, `GET/PATCH /profiles/me`, `GET /users/:username`, `GET /users/:username/posts`, `POST/DELETE /users/:username/follow`.
- Media: `POST /media/images`, `GET /media/upload-url`, `POST /media/:mediaId/complete`, `GET /media/:mediaId/url`.
- Plataforma: `GET /health`, `GET /health/live`, OpenAPI en `/docs`.

Todos los endpoints de negocio se prefijan con `/api/v1`. La documentación OpenAPI generada en runtime es la fuente contractual vigente.

## Seguridad operativa

Los access tokens JWT duran 15 minutos por defecto; el refresh token se almacena como hash en PostgreSQL, se rota en cada uso y se entrega en cookie `HttpOnly`, `SameSite=Strict`, `Secure` en producción. Las sesiones revocadas invalidan el guard y su caché Redis. Las imágenes aceptadas son JPEG, PNG y WebP, se verifican por firma y se convierten a WebP con Sharp. Las URLs de lectura y carga son temporales.

La suite de integración no sustituye pruebas de carga, pentest ni restauración de backups. La capacidad real depende de sizing, CDN, proveedores y operación del entorno desplegado; no se afirma un límite de millones de usuarios sin medirlo.
