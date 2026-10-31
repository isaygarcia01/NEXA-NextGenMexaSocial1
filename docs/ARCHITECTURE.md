# Arquitectura de NEXA

## Contexto de ejecución

NEXA se ejecuta como monolito modular NestJS para conservar operaciones transaccionales entre identidad, publicaciones y grafo social. La interfaz Next.js consume contratos REST con prefijo `/api/v1`; PostgreSQL es fuente de verdad, Redis mantiene contadores de rate limit y sesiones autorizadas, y S3/MinIO almacena objetos multimedia.

```text
Browser ── HTTPS ── Next.js
                       │ REST + access JWT / refresh cookie
                       ▼
                 NestJS /api/v1
                 ├── auth + sesiones + mail
                 ├── perfiles + posts + interacciones
                 ├── validación / autorización / auditoría
                 ├── Redis (rate limit y caché de sesión)
                 ├── PostgreSQL (datos transaccionales)
                 └── S3-compatible (imágenes y URLs firmadas)
```

Docker Compose define el entorno de desarrollo y sus health checks. CI ejecuta lint, compilación, tests de unidad e integración y build de contenedores.

## Límites de módulos

| Módulo | Responsabilidad actual | Dependencias |
|---|---|---|
| Auth | Registro, verificación de correo, login, reset/cambio de contraseña, JWT, refresh rotation, sesiones y revocación | PostgreSQL, Redis, SMTP |
| Social | Feed con cursor, publicación y edición, borrado lógico, perfiles, privacidad, follows, reacciones, comentarios, bookmarks | PostgreSQL, S3 |
| Media | Verificación de MIME y firma, optimización WebP, metadatos y URL temporal | PostgreSQL, Sharp, S3 |
| Database | Pool, transacciones y migraciones con advisory lock | PostgreSQL |
| Cache | Ping, caché de sesión y rate limit incremental | Redis |
| Storage | Gestión de bucket, objeto y URL firmada | S3/MinIO |

Cada escritura se valida en DTOs, aplica ownership/visibilidad en servidor y genera auditoría para operaciones sensibles. No se confía en flags de interfaz para privacidad.

## Persistencia

Migraciones en orden numérico:

1. Identidad, perfiles, follows, publicaciones, medios, reacciones, comentarios, bookmarks, devices, sessions y auditoría.
2. Contenido de seed sin credenciales de acceso.
3. Tokens de verificación/reset, metadatos de sesión, soft delete y outbox de correo.
4. Email normalizado a `VARCHAR` con unicidad case-insensitive para correo entre PostgreSQL y el adaptador PGlite de tests.
5. Estado de procesamiento exclusivo para concluir una carga multimedia firmada de forma idempotente.

Las relaciones usan claves foráneas, restricciones de dominio e índices de lectura. Los posts conservan `deleted_at`; las consultas sociales excluyen contenido borrado y aplican privacidad del perfil y de publicación. Las migraciones se serializan con advisory lock para que réplicas simultáneas no las ejecuten a la vez.

## Identidad y seguridad

- Argon2id para contraseñas; JWT HS256 de vida corta para acceso.
- Refresh aleatorio almacenado como hash, rotación atómica y cookie `HttpOnly`, `SameSite=Strict`, `Secure` en producción.
- El guard comprueba estado de sesión/usuario en PostgreSQL y guarda autorización por 15 segundos en Redis; logout, reset y revocación eliminan la clave de caché.
- Validación de entrada con `class-validator`; DTOs desconocidos rechazados.
- Helmet, CORS limitado a `FRONTEND_URL`, rate limit Redis (más estricto en rutas de credenciales), logging estructurado con headers sensibles redactados y respuesta global normalizada.
- Imágenes se limitan, validan por firma y se re-encodean a WebP; los metadatos se guardan en PostgreSQL y el contenido en almacenamiento S3.

Los secretos de producción deben provenir de un secret manager. TLS, WAF, CDN, backups cifrados, alertas y respuesta a incidentes pertenecen a la configuración del proveedor/deployment.

## API y frontend

OpenAPI/Swagger se expone en `/docs`. El frontend mantiene access token en memoria, usa refresh cookie en reload y renueva access tokens ante 401. React Query gestiona sincronización e invalidación; Zustand mantiene el estado de sesión y navegación. Las URL de API y storage visibles al navegador deben ser accesibles desde el cliente.

## Escala y capacidades

PostgreSQL, Redis y S3 se externalizan y pueden operar detrás de balanceadores; la API no mantiene estado de sesión local. El feed actual usa consultas relacionales indexadas con paginación por cursor. Su capacidad debe medirse con datos, hardware, CDN y patrones de distribución representativos antes de fijar objetivos de usuarios o disponibilidad.

Mensajería Socket.IO, streaming WebRTC, stories, búsqueda OpenSearch, colas BullMQ, moderación automatizada, administración RBAC, analítica y despliegue Kubernetes no forman parte del camino HTTP implementado en este repositorio. Requerirán ownership de dominio, políticas de privacidad, eventos idempotentes, métricas y sus propias pruebas cuando se incorporen.

## Verificación

La suite de integración utiliza PGlite con protocolo PostgreSQL y S3rver para probar migraciones, autenticación, persistencia social y medios sin servicios remotos. Redis se sustituye por un fake dentro de E2E; el stack real de Redis y la disponibilidad de todos los contenedores se validan en Docker Compose/CI. Las pruebas locales no sustituyen pruebas de carga ni auditorías externas.
