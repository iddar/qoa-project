# Infraestructura - Qoa MVP

## Objetivo

Definir una base operativa simple y confiable para ejecutar el backend (`src`) y los frontends (`apps/backoffice`, `apps/cpg-portal`) en ambientes `staging` y `production`.

## Arquitectura objetivo

- Runtime de servicios: Bun + Elysia para API principal.
- Base de datos: PostgreSQL administrado.
- Cache y colas: Redis administrado.
- Frontends: despliegue de aplicaciones Next.js en plataforma managed.
- Artefactos y CI: GitHub Actions con checks de lint/test/typecheck.
- Observabilidad: logs estructurados + métricas de API + panel operativo de alertas.

## Topologia por ambiente

## `development`

- Ejecucion local con Bun.
- Base local por Docker Compose.
- Seeds de desarrollo con `bun run db:seed:development`.

## `staging`

- API en un solo servicio con auto-scale minimo 1 instancia.
- PostgreSQL y Redis separados de produccion.
- Datos anonimizados o sinteticos para pruebas de regresion.
- Deploy automatico al merge de `main` (cuando pipeline CI/CD este activo).

## `production`

- API con al menos 2 instancias para tolerancia a fallos.
- PostgreSQL con backups automatizados + PITR.
- Redis con persistencia y politica de eviction definida.
- Deploy controlado por aprobacion manual.

## Configuracion y secretos

- Variables de entorno por ambiente (sin commitear secretos).
- Secretos manejados por el proveedor del runtime o vault.
- Rotacion trimestral para claves de webhook/API keys.
- Validacion de variables requeridas al iniciar el servicio.

## Datos y continuidad

- Migraciones versionadas con Drizzle (`src/drizzle/**`).
- Estrategia de backup DB diaria + pruebas de restauracion mensuales.
- Politica de retencion de logs y eventos de alertas (90 dias minimo).

## Seguridad operativa minima

- Acceso por menor privilegio en infraestructura y base de datos.
- HTTPS obligatorio en trafico publico.
- Firma de webhooks habilitada en integraciones externas.
- Auditoria de acciones criticas en lifecycle de campanas.

## Pendientes para siguiente iteracion

- Definir proveedor final (Railway/Fly/AWS/GCP) por costo y latencia.
- Provisionar ambiente `staging` formal con dominio propio.
- Instrumentar trazas distribuidas y dashboard SLO en herramienta central.
