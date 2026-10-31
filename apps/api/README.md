# NEXA API

Servicio NestJS/TypeScript con rutas REST `/api/v1`, PostgreSQL, Redis, S3/MinIO, Swagger `/docs`, validación global, Helmet, Pino y límites distribuidos de tráfico.

Las migraciones numeradas están en `migrations/`; el servicio las ejecuta bajo advisory lock de PostgreSQL. Arranque desde la raíz con `npm run dev:api`, o `npm run build:api` para producción.

La configuración se valida con Zod. Consulta la tabla de variables y los endpoints en la [guía del monorepo](../../README.md). En producción se requieren credenciales externas gestionadas y un servidor SMTP.
