# TODO - Proyecto Qoa

> Seguimiento de compromisos y avances del proyecto

---

## Fase 1: Especificación Fundacional

### Documentos de Overview
- [x] `docs/01-overview/glosario.md` - Términos del dominio
- [x] `docs/01-overview/vision.md` - Qué SI y NO hace el MVP
- [x] `docs/01-overview/alcance.md` - Scope de "Conectados"

### Arquitectura
- [x] `docs/02-architecture/nfrs.md` - Requerimientos no funcionales

---

## Fase 2: Decisiones Arquitectónicas (ADRs)

- [x] `docs/adr/0001-estilo-arquitectura.md` - Modular Monolith vs Microservicios
- [x] `docs/adr/0002-base-de-datos.md` - PostgreSQL como BD principal
- [x] `docs/adr/0003-autenticacion.md` - Magic link, JWT, API Keys
- [x] `docs/adr/0004-mensajeria.md` - BullMQ/Redis para eventos
- [x] `docs/adr/0005-integracion-whatsapp.md` - Proveedor WhatsApp
- [x] `docs/adr/0006-generacion-qr.md` - Estrategia de códigos QR
- [x] `docs/adr/0007-multi-tenancy.md` - Modelo multi-tenant
- [x] `docs/adr/0008-modelo-campanias.md` - Campañas y acumulación
- [x] `docs/adr/0009-stack-implementacion.md` - Stack técnico y patrones

---

## Fase 3: Diseño de APIs

- [x] `docs/03-apis/openapi.yaml` - REST API completa
- [x] `docs/03-apis/asyncapi.yaml` - Eventos del sistema
- [x] `docs/03-apis/autenticacion.md` - Flujos de auth
- [x] `docs/03-apis/errores.md` - Catálogo de códigos de error

---

## Fase 4: Modelo de Datos

- [x] `docs/04-data/modelo-datos.md` - Diagrama ER
- [x] `docs/04-data/diccionario.md` - Descripción de tablas/columnas
- [x] `docs/04-data/indices.md` - Índices para performance
- [x] `docs/04-data/eventos.md` - Eventos de dominio

---

## Fase 5: Implementación Backend

### Sprint 1
- [x] Setup proyecto (tsconfig, oxlint, oxfmt)
- [x] Configuración base de datos y migraciones
- [x] Middleware logging con trace_id end-to-end
- [x] Middleware manejo de errores global
- [x] Health check endpoint
- [x] Docker Compose para desarrollo

### Sprint 2
- [x] Módulo Users
- [x] Módulo Stores
- [x] Módulo Cards
- [x] Integración WhatsApp básica

### Sprint 3
- [x] Catálogo base (CPGs, Brands, Products)
- [x] Módulo Campaigns
- [x] Módulo Transactions
- [x] Motor de reglas (puntos/estampas)
- [x] Balance tracking

### Sprint 4
- [x] Módulo Rewards
- [x] Módulo Reports (overview de plataforma)
- [x] Jobs de recordatorios
- [x] Webhook WhatsApp
- [x] Panel de errores y alertas (mock email)
- [x] Scope multi-tenant CPG en catálogo + validación de sesión CPG owner en portal

---

## Fase 6: Implementación Frontend

- [ ] App Tarjeta Digital (PWA)
- [ ] Dashboard Tienda
- [x] Admin Panel (parcial: backoffice base en `apps/backoffice`)
- [x] CPG Portal v2 (campañas + performance en `apps/cpg-portal`)
- [x] Tests E2E (journeys críticos backend)

---

## Fase 7: Operaciones

- [x] `docs/06-ops/infraestructura.md`
- [x] `docs/06-ops/slos.md`
- [x] `docs/06-ops/runbooks/despliegue.md`
- [x] Pipeline CI/CD
- [ ] Monitoring y alertas
- [ ] Ambiente staging

---

## Historial de Avances

| Fecha | Avance |
|-------|--------|
| 2026-01-28 | Creación del plan inicial y estructura de documentación |
| 2026-01-28 | Completado glosario de términos del dominio |
| 2026-01-28 | Completado documento de visión del MVP |
| 2026-01-28 | Completado documento de alcance del MVP |
| 2026-01-28 | Completado NFRs (requerimientos no funcionales) |
| 2026-01-28 | ADR-0001: Modular Monolith aprobado |
| 2026-01-28 | ADR-0002: PostgreSQL aprobado |
| 2026-01-28 | ADR-0003: Autenticación (OTP, JWT, API Keys) aprobado |
| 2026-01-28 | ADR-0004: Mensajería y eventos aprobado |
| 2026-01-28 | ADR-0005: Integración WhatsApp aprobado |
| 2026-01-28 | ADR-0006: Generación QR aprobado |
| 2026-01-28 | ADR-0007: Multi-tenancy aprobado |
| 2026-01-28 | ADR-0008: Modelo de campañas y acumulación aprobado |
| 2026-01-29 | ADR-0009: Stack de implementación (Bun, Elysia, Transactional Outbox) aprobado |
| 2026-01-29 | Fase 3 completada: OpenAPI, AsyncAPI, flujos de auth, catálogo de errores |
| 2026-01-29 | Fase 4 completada: Modelo ER, diccionario de datos, índices, eventos de dominio |
| 2026-02-17 | Sprint 2 actualizado: módulos Users, Stores y Cards implementados y cubiertos por tests |
| 2026-02-17 | Normalización de auth con `beforeHandle: authGuard(...)` en Users/Stores/Cards |
| 2026-02-18 | Sprint 3 parcial: Campaigns + Transactions implementados, incluyendo webhook idempotente con receipts y métricas |
| 2026-02-18 | Catálogo CPG/Brands/Products implementado en backend + backoffice |
| 2026-02-18 | Políticas de campaña implementadas (API + backoffice) y aplicación de reglas de acumulación en transacciones |
| 2026-02-18 | Sprint 4 iniciado: módulo Rewards + redemptions, módulo Reports con métricas globales y dashboard de inicio enriquecido |
| 2026-02-18 | Sprint 4 completado: jobs de reminders + webhook WhatsApp con métricas y pruebas de idempotencia/firma |
| 2026-02-18 | Panel de errores/alertas implementado en backoffice y notificación mock email con persistencia |
| 2026-02-18 | Portal CPG validado con sesión de cpg_owner y backend de catálogo reforzado con scope por tenant |
| 2026-02-18 | CPG Portal sube de nivel: gestión de campañas, reglas de acumulación y performance por campaña/CPG |
| 2026-02-18 | Cobertura E2E backend agregada para journeys críticos (campaign lifecycle, redeem, reminders, webhook WhatsApp y alertas) |
| 2026-02-18 | Documentación base de operaciones agregada: infraestructura, SLOs y runbook de despliegue |
| 2026-02-18 | Pipeline CI ampliado para backend + lint de frontends en PR/push a main |

---

## Notas

- Cada documento se trabajará colaborativamente antes de marcarlo como completado
- Los ADRs requieren decisión explícita antes de proceder con implementación
