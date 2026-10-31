# Arquitectura de NEXA

## Principios

1. El contenido y las personas tienen prioridad visual sobre el producto.
2. La seguridad y la privacidad se aplican en el servidor, no se delegan a la interfaz.
3. Las fronteras de dominio y contratos estables preceden a la extracción de microservicios.
4. Los medios se almacenan fuera de PostgreSQL; la base conserva metadatos y claves de objetos.
5. Escalabilidad y disponibilidad son objetivos medibles mediante SLO, pruebas de carga y operación, no propiedades de una lista de tecnologías.

## Estado actual

```text
Navegador
  └── Next.js / React
        ├── UI de feed con fixture local (estado volátil)
        └── API client pendiente

NestJS /api/v1
  ├── Helmet y CORS por origen
  ├── Swagger /docs
  └── health

Entorno local Docker
  ├── PostgreSQL 17 — esquema inicial y cuentas de muestra
  ├── Redis 7 — aprovisionado, sin consumidores todavía
  └── MinIO — aprovisionado, sin cliente S3/pipeline todavía
```

El Compose ayuda a reproducir el entorno de desarrollo; **no** constituye una arquitectura HA ni el API actual escribe en PostgreSQL, Redis o MinIO.

## Dominios objetivo

| Dominio | Responsabilidad | Persistencia / eventos previstos |
|---|---|---|
| Identity & Access | registro, OAuth, MFA, sesiones y dispositivos | PostgreSQL, hash Argon2id, eventos de sesión |
| Profiles & Graph | perfiles, seguimiento, bloqueo, privacidad | PostgreSQL; proyecciones Redis |
| Publishing & Media | borradores, posts, metadata, pipeline de medios | PostgreSQL, S3/MinIO, BullMQ |
| Feed & Discovery | ranking por señales, recencia, grafo y preferencias | PostgreSQL como fuente; Redis/OpenSearch como índices |
| Conversation | chats, mensajes, presencia y WebRTC signaling | PostgreSQL, Socket.IO, Redis adapter |
| Trust & Safety | reportes, strikes, reglas y auditoría | PostgreSQL, cola de revisión, almacenamiento de evidencia |
| Notifications | preferencias y entrega in-app/push/email | PostgreSQL, BullMQ |
| Administration | RBAC, feature flags, operaciones auditables | PostgreSQL con políticas administrativas separadas |

Cada módulo debe definir sus comandos, consultas, eventos, invariantes y propietario de datos. No compartir escrituras directas entre servicios futuros.

## Modelo de datos inicial

La migración `001_initial_schema.sql` define usuarios, perfiles, follows, medios, posts, relación post-media, reacciones, comentarios, bookmarks, devices, sessions y audit logs. Incluye claves foráneas, restricciones e índices de lectura básicos.

Para crecimiento real:

- usar migraciones numeradas inmutables y ejecutar cambios expansivos/contractivos;
- diseñar feeds con cursor (`published_at`, `id`) en vez de `OFFSET`;
- no mantener contadores de likes en transacciones calientes sin estrategia de consistencia;
- particionar tablas de eventos/auditoría solo después de medir volumen y retención;
- aplicar políticas de retención, borrado y exportación con evidencia verificable;
- cifrar o tokenizar los datos sensibles según clasificación y amenaza.

La migración inicial es un modelo de arranque, no el esquema completo de pagos, roles, stories, streams ni mensajes.

## API y límites de confianza

- REST inicial en `/api/v1`; OpenAPI en `/docs`.
- Validar DTOs en la frontera con `class-validator`, rechazar campos desconocidos y convertir tipos solo de forma explícita.
- Autenticar y autorizar cada recurso antes de añadir mutaciones de usuario.
- Mantener cookies seguras `HttpOnly`, `Secure`, `SameSite` y protección CSRF si la sesión se basa en cookies.
- Los CORS/Helmet configurados son una capa básica, no sustituyen WAF, rate limiting, CSP, autorización ni hardening operativo.
- Versionar cambios de contrato y probar compatibilidad de clientes.

## Escala: transición condicionada por métricas

```text
Fase A: monolito modular + PostgreSQL
Fase B: Redis, outbox transaccional, BullMQ y S3 para operaciones asíncronas
Fase C: OpenSearch / proyecciones cuando las consultas y el volumen lo justifiquen
Fase D: extraer servicios con ownership de datos y contratos/eventos versionados
Fase E: múltiples regiones únicamente tras definir consistencia, residencia de datos y recuperación
```

El patrón outbox evita perder eventos entre una transacción SQL y una cola. El feed inicialmente puede combinar lecturas por seguidores y ranking; fan-out híbrido debe derivarse de benchmarks y evitar una copia descontrolada de publicaciones.

## Disponibilidad y observabilidad objetivo

- SLIs por ruta: latencia p50/p95/p99, tasa de errores, saturación, colas y disponibilidad.
- Trazas correlacionadas con IDs de solicitud; logs estructurados con redacción de datos sensibles.
- Prometheus/Grafana y Loki se incorporarán con métricas y alertas accionables, almacenamiento/retención definidos y runbooks.
- Backups cifrados, restauraciones ensayadas, objetivos RPO/RTO y plan de respuesta a incidentes.
- Escalado horizontal requiere estado externo, sesiones adecuadas, balanceo, readiness/liveness y límites de recursos.

Estos componentes aún no están configurados en este repositorio.

## Roadmap técnico y puertas de salida

### v1 — Base de producto segura

- Implementar flujos de registro, Argon2id, access/refresh tokens rotables, OAuth, MFA y revocación de sesiones.
- API persistente para perfiles, follow, publicaciones, reacciones y feed paginado.
- Carga directa de medios mediante URLs firmadas, límites por tipo/tamaño, antivirus/moderación y procesamiento asíncrono.
- Privacidad, reportes, RBAC, exportación/borrado y registro de auditoría.
- Gate: pruebas unitarias/integración/E2E, threat model, revisión externa y objetivos de disponibilidad.

### v2 — Comunidad y señales

- Mensajería y presencia Socket.IO horizontal con Redis adapter; retención, autorización y controles antiabuso.
- Notificaciones con preferencias, BullMQ, proveedores con reintentos idempotentes y DLQ.
- OpenSearch para búsquedas; feed basado en señales observables y experimentación controlada.
- Prometheus/Grafana/Loki, alertas, playbooks y pruebas de capacidad.
- Gate: p95, recuperación de fallos, backpressure y políticas de privacidad verificadas.

### v3 — Escala y ecosistema

- Streaming, comunidades avanzadas, pagos/suscripciones e integraciones de creadores.
- Separar servicios solo al demostrar límites de escalado u ownership; eventos con schema registry y outbox.
- Kubernetes, despliegues canary, autoscaling y estrategia multi-región según requisitos legales.
- Recomendaciones ML con evaluación de sesgo, controles de usuario y métricas de calidad.
- Gate: carga representativa, DR multi-región ensayado, auditoría de seguridad y cumplimiento independiente.
