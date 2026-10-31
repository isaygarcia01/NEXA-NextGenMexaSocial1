# NEXA

NEXA es el punto de partida de una plataforma social visual-first: un espacio sobrio para compartir trabajo creativo, intereses y comunidades, sin competir con el contenido de las personas.

> **Estado del proyecto:** prototipo funcional y base de arquitectura, no producto listo para producción. La interfaz incluye datos de demostración en memoria; la API ofrece salud y documentación; PostgreSQL, Redis y MinIO se provisionan localmente, pero todavía no están conectados a los casos de uso de la aplicación.

## Qué está implementado

- Feed adaptable en español con círculos, sugerencias y temas.
- Interacciones locales para me gusta, guardar, seguir y crear una publicación de demostración.
- Tokens CSS, tema oscuro, estados accesibles y navegación móvil.
- Next.js + React + TypeScript; Framer Motion, Zustand y React Query instalados.
- API NestJS con prefijo `/api/v1`, Helmet, CORS configurable y Swagger.
- Endpoint `GET /api/v1/health`.
- Esquema inicial PostgreSQL para cuentas, perfiles, relaciones, publicaciones, medios, reacciones, comentarios, sesiones y auditoría.
- Docker Compose de desarrollo para web, API, PostgreSQL, Redis y MinIO.
- Workflow de CI con lint, pruebas del API y builds.

Las interacciones del navegador se reinician al recargar la página. No hay autenticación, escritura de datos, OAuth, cargas multimedia, mensajería, moderación ni controles de administración implementados todavía.

## Requisitos

- Node.js 24.15 o superior y npm.
- Docker Desktop y Docker Compose v2 para ejecutar el entorno completo.

## Inicio rápido: entorno completo

En PowerShell, desde la raíz:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

- Web: <http://localhost:3000>
- API: <http://localhost:3001/api/v1>
- Swagger: <http://localhost:3001/docs>
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO API / consola: <http://localhost:9000> / <http://localhost:9001>

La primera inicialización de PostgreSQL aplica los SQL de `infra/postgres/migrations` en orden y añade las cuentas de ejemplo sin credenciales.

## Desarrollo sin Docker

Instala dependencias en cada aplicación:

```powershell
Set-Location apps\web
npm ci
npm run dev
```

En otra terminal, desde la raíz:

```powershell
Set-Location apps\api
npm ci
npm run start:dev
```

El API inicia en el puerto `3001`. La web puede abrirse sin el API; el feed actual usa datos de demostración locales.

## Comandos

Desde la raíz del proyecto:

```powershell
npm run dev:web
npm run dev:api
npm run lint:web
npm run lint:api
npm run test:api
npm run build:web
npm run build:api
```

## Estructura

```text
apps/
  api/                 NestJS; entrada HTTP y documentación OpenAPI
  web/                 Next.js App Router; feed y sistema visual
infra/
  postgres/migrations/ Esquema SQL y datos de demostración
.github/workflows/     CI de frontend y API
docker-compose.yml     Servicios locales
docs/                  Arquitectura, límites y roadmap
```

## Decisiones de arquitectura

Se comienza con un **monolito modular** y contratos HTTP versionados. Es una elección deliberada: antes de distribuir servicios conviene validar producto, límites de dominio, privacidad y volumen real. La arquitectura objetivo y las condiciones para separar servicios están en [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Seguridad y puesta en producción

Los valores de `.env.example` son exclusivamente locales. No publicar este Compose como entorno productivo ni exponer sus puertos directamente a Internet. Antes de un despliegue real hacen falta, como mínimo:

- identidad implementada y probada (Argon2id, sesiones revocables, rotación de refresh tokens, MFA y OAuth);
- autorización por recurso, límites de tráfico y protección antiabuso;
- migraciones versionadas con herramienta de migraciones y política de backup/restore;
- almacenamiento privado con URLs firmadas, análisis y límites de archivos;
- gestión de secretos, TLS, políticas de red, observabilidad, alertas y respuesta a incidentes;
- pruebas de integración, E2E, seguridad, accesibilidad y carga; revisión de privacidad y asesoría legal para GDPR/CCPA/LGPD.

La tabla de entidades de sesiones no implica que la autenticación esté activa: el backend aún no crea ni valida sesiones. Las imágenes de muestra cargan directamente desde Unsplash, no se guardan en S3 y requieren Internet; deben sustituirse por un pipeline de medios propio antes de producción.

## Roadmap

- **v1 — Fundamentos sociales:** cuentas y sesiones seguras, perfiles, publicaciones persistentes, follows, feed paginado, medios privados, reportes y panel básico de moderación.
- **v2 — Comunidad y tiempo real:** mensajes y presencia con Socket.IO, notificaciones, búsqueda, colas BullMQ, pipeline multimedia, Redis y métricas de producto.
- **v3 — Escala y monetización:** feed híbrido por eventos, servicios separados según métricas, recomendaciones, directos, pagos, Kubernetes, SLOs y expansión multi-región.

Cada fase requiere criterios de aceptación, pruebas y revisión de seguridad propios. No se garantiza una capacidad de millones de usuarios hasta medir cargas representativas y probar la arquitectura desplegada.
