# Línea de Tiempo — Proyecto Qoa

> Historia de cómo se construyó Qoa desde la idea hasta el estado actual.

---

## El Proyecto

**Qoa** es un sistema centralizado de administración de programas de lealtad. Su MVP, llamado **"Conectados"**, se enfoca en loyalty para tenderos vía WhatsApp y QR, con el objetivo de conectar a CPGs (fabricantes), tiendas de canal tradicional y clientes finales en un ecosistema de valor compartido.

---

## Cronología

### 📅 28 de enero de 2026 — El punto de partida

Todo comenzó con una premisa clara: los tenderos necesitan herramientas modernas de fidelización sin la complejidad que eso normalmente implica. El equipo de Qoa definió la visión del MVP en un README inicial y organizó el proyecto desde cero.

**Lo que se hizo:**

- Se estableció la estructura completa del proyecto con documentación organizada en `/docs`.
- Se redactó el `PLAN.md` con las 7 fases del proyecto, cronograma y riesgos identificados.
- Se completó la **Fase 1 — Especificación Fundacional**:
  - `docs/01-overview/glosario.md` — Vocabulario del dominio: PLI, CPG, estampa, punto, wallet.
  - `docs/01-overview/vision.md` — Qué sí y qué no hace el MVP.
  - `docs/01-overview/alcance.md` — Scope de "Conectados" y exclusiones explícitas.
  - `docs/02-architecture/nfrs.md` — Disponibilidad (99.5%), latencia p95 (<500ms), volumen inicial.
- Se aprobaron los primeros **7 ADRs** (Architecture Decision Records) de la **Fase 2**:
  - `ADR-0001`: Monolito modular vs microservicios → **Modular Monolith** elegido.
  - `ADR-0002`: Base de datos → **PostgreSQL** como fuente de verdad.
  - `ADR-0003`: Autenticación → **Magic link / OTP** para usuarios, **JWT** para dashboards, **API Keys** para integraciones B2B.
  - `ADR-0004`: Mensajería → **BullMQ + Redis** para eventos asíncronos.
  - `ADR-0005`: Integración WhatsApp → Proveedor con canal conversacional (Twilio / 360Dialog).
  - `ADR-0006`: Generación QR → Estrategia de códigos únicos por tienda y tarjeta.
  - `ADR-0007`: Multi-tenancy → Modelo con `tenantId` + `tenantType` (`cpg` | `store`).

---

### 📅 29 de enero de 2026 — Contrato técnico sellado

En apenas un día, el equipo cerró las decisiones técnicas restantes y diseñó por completo los contratos de la API y el modelo de datos.

**Lo que se hizo:**

- `ADR-0008`: Modelo de campañas y acumulación → Reglas configurables por tipo (puntos/estampas), período, producto y monto.
- `ADR-0009`: Stack de implementación confirmado:
  - **Runtime:** Bun
  - **Framework:** Elysia (type-safe, alta performance)
  - **ORM:** Drizzle ORM
  - **BD:** PostgreSQL con driver nativo de Bun
  - **Pattern:** Transactional Outbox para eventos
- **Fase 3 completada — Diseño de APIs:**
  - `docs/03-apis/openapi.yaml` — Especificación REST completa: users, cards, stores, campaigns, transactions, rewards, reports.
  - `docs/03-apis/asyncapi.yaml` — Contrato de eventos: `user.created`, `transaction.completed`, `reward.redeemed`, etc.
  - `docs/03-apis/autenticacion.md` — Flujos de OTP, refresh tokens y API Keys.
  - `docs/03-apis/errores.md` — Catálogo de códigos de error con contexto y solución.
- **Fase 4 completada — Modelo de Datos:**
  - `docs/04-data/modelo-datos.md` — Diagrama ER con entidades principales.
  - `docs/04-data/diccionario.md` — Descripción detallada de cada tabla y columna.
  - `docs/04-data/indices.md` — Estrategia de índices para performance.
  - `docs/04-data/eventos.md` — Catálogo de eventos de dominio.

---

### 📅 17 de febrero de 2026 — El backend toma vida

Después de la fase de diseño, el equipo implementó los primeros módulos del backend. El proyecto arrancó con una base sólida de infraestructura antes de construir la lógica de negocio.

**Sprint 1 — Infraestructura base:**
- Setup completo: `tsconfig`, `oxlint`, `oxfmt` para calidad de código.
- Configuración de base de datos con Drizzle ORM y migraciones versionadas.
- Middleware global de errores con `trace_id` end-to-end.
- Endpoint `GET /health` para verificación de estado.
- `docker-compose.yml` con PostgreSQL 16 + Redis 7 para desarrollo local.
- Configuración de GitHub Codespaces para onboarding rápido.

**Sprint 2 — Módulos core:**
- **Módulo Users** — Registro por teléfono, OTP, roles RBAC.
- **Módulo Stores** — Creación de tiendas con QR único, scope por tenant.
- **Módulo Cards** — Tarjetas de lealtad vinculadas a usuarios y tiendas.
- **Integración WhatsApp básica** — Soporte para mensajes salientes.
- Normalización de autenticación con `authGuard` como `beforeHandle` compartido.
- Todos los módulos cubiertos con tests de integración en `src/spec/`.

**Evolución de base de datos (Migraciones 0000–0004):**
```
0000 → tenants (base multi-tenant)
0001 → users, refresh_tokens, api_keys (auth y roles)
0002 → blocked_at, blocked_until (moderación de usuarios)
0003 → tenant_id, tenant_type en users + rol qoa_support
0004 → stores, cards (primer modelo de negocio)
```

---

### 📅 18 de febrero de 2026 — El sprint más productivo

En un solo día de trabajo intenso, el proyecto avanzó desde módulos básicos hasta una plataforma multi-portal operativa. Este fue el día de mayor velocidad de entrega del proyecto.

**Sprint 3 — Lógica de negocio central:**
- **Catálogo** — CPGs, Brands y Products con scope por `tenantId`/`tenantType`.
- **Módulo Campaigns** — Ciclo de vida completo: `draft → active → ended`. Políticas de acumulación configurables por período, monto mínimo, cooldown y scope de producto/marca.
- **Módulo Transactions** — Registro de compras con motor de reglas que calcula puntos/estampas automáticamente. Webhook idempotente con firma HMAC opcional y desduplicación por hash. Endpoints de observabilidad: `webhook-receipts` y `webhook-metrics`.
- **Balance tracking** — Sistema de acumulaciones y saldos por usuario/campaña.

**Sprint 4 — Completando la plataforma:**
- **Módulo Rewards** — Catálogo de recompensas y redemptions (canje) por campaña.
- **Módulo Reports** — Métricas globales de plataforma: KPIs, ventas, usuarios activos.
- **Jobs de recordatorios** — Procesamiento en background con BullMQ para re-engagement por WhatsApp.
- **Webhook WhatsApp** — Ingestión de mensajes entrantes con firma, idempotencia y métricas.
- **Panel de Alertas** — Sistema de alertas con severidad, notificación mock por email y persistencia.
- **Multi-tenant CPG reforzado** — Validación de sesión `cpg_owner` y scope estricto de catálogo.

**Evolución de base de datos (Migraciones 0005–0015):**
```
0005 → campaigns + campaign_audit_logs (ciclo de vida de campañas)
0006 → transaction_items (ítems detallados por transacción)
0007 → webhook_receipts (idempotencia de webhooks)
0008 → replay_count en webhook_receipts (métricas de reintentos)
0009 → catalog: cpgs, brands, products (catálogo CPG)
0010 → accumulations (motor de acumulación puntos/estampas)
0011 → campaign_policies (reglas de acumulación configurables)
0012 → rewards + redemptions (catálogo y canje de recompensas)
0013 → reminder_jobs + whatsapp_messages (mensajería asíncrona)
0014 → alerts + alert_notifications (sistema de alertas)
0015 → campaign_subscriptions (suscripciones y tarjeta universal)
```

**Frontend — Fase 6 iniciada:**
- **`apps/backoffice`** — Panel interno para operadores Qoa (`qoa_admin`, `qoa_support`). Módulos: users, stores, campaigns, cards, catalog, rewards, transactions, alerts, reports.
- **`apps/cpg-portal`** — Portal para fabricantes CPG. Módulos: brands, products, campaigns (lifecycle + políticas + performance), rewards. KPI de efectividad de canje.
- **`apps/store-dashboard`** — Dashboard para tenderos: escaneo de QR/barcode, lista de clientes, reportes del día.
- **`apps/digital-wallet`** — Wallet digital mobile-first para clientes finales. Tarjeta QR destacada, progreso de campaña, historial de transacciones, catálogo de recompensas.

**V2 Wallet — Loyalty completo:**
- Tarjeta universal auto-provisionada al registrarse.
- Suscripciones a campañas tipo reto (`opt_in`).
- Acumulación simultánea: campaña universal + campañas suscritas + campañas abiertas.
- Endpoint `/users/me/wallet` con saldo por campaña suscrita.
- Catálogo de recompensas filtrado por campaña activa suscrita.

**Operaciones:**
- Pipeline CI/CD en GitHub Actions: tests backend + lint de frontends en PR/push.
- `docs/06-ops/infraestructura.md` — Stack de cloud (ECS/Railway, RDS, Redis).
- `docs/06-ops/slos.md` — SLO de disponibilidad (99.5%), latencia y error rate.
- `docs/06-ops/runbooks/` — Despliegue, rollback, escalado, incidentes típicos.
- `docs/06-ops/monitoring-alertas.md` — Estrategia de observabilidad.
- `docs/06-ops/staging.md` — Ambiente de staging.

**Seeds de QA:**
- Usuario `store.<entorno>@qoa.local` con tenant store asociado.
- Fixtures completos: store/brand/product/campaña/recompensa por entorno.
- Credenciales con password compartido para QA manual de todos los flujos.

**Tests E2E backend:**
- `src/spec/e2e-journeys.spec.ts` — Journeys críticos cubiertos: campaign lifecycle, acumulación/canje, reminders, webhook WhatsApp, alertas.

---

### 📅 19 de febrero de 2026 — Ajuste de UX

**Commit:** `fix: constrain store QR widget width on home`  
**Autor:** Iddar Olivares

Un ajuste preciso de interfaz de usuario: restricción del ancho del widget QR de la tienda en la pantalla de inicio del store-dashboard, garantizando que el código QR se muestre correctamente en distintos tamaños de pantalla.

---

### 📅 21 de febrero de 2026 — Plan del siguiente paso

**Commit:** `Initial plan`  
**Autor:** copilot-swe-agent[bot]

El agente de Copilot registró el plan inicial para continuar el desarrollo del proyecto, trazando las siguientes iteraciones.

---

## Estado Actual del Proyecto

### Arquitectura

```
qoa-project/
├── src/                    # Backend (Bun + Elysia + Drizzle ORM)
│   ├── app/                # App principal, plugins, middleware
│   ├── modules/            # Módulos de negocio
│   │   ├── auth/           # Autenticación: OTP, JWT, API Keys
│   │   ├── users/          # Usuarios y roles RBAC
│   │   ├── stores/         # Tiendas y QR
│   │   ├── cards/          # Tarjetas de lealtad
│   │   ├── campaigns/      # Campañas (puntos/estampas + políticas)
│   │   ├── transactions/   # Compras y acumulación automática
│   │   ├── rewards/        # Catálogo y canje de recompensas
│   │   ├── catalog/        # CPGs, marcas y productos
│   │   ├── reports/        # Métricas y reportes
│   │   ├── jobs/           # Jobs de recordatorio (BullMQ)
│   │   ├── whatsapp/       # Webhook WhatsApp
│   │   └── alerts/         # Sistema de alertas
│   ├── db/                 # Schema Drizzle + seeds + migraciones
│   └── spec/               # Tests de integración y E2E
│
├── apps/
│   ├── backoffice/         # Panel admin Qoa (Next.js)
│   ├── cpg-portal/         # Portal para fabricantes CPG (Next.js)
│   ├── store-dashboard/    # Dashboard para tenderos (Next.js)
│   └── digital-wallet/     # Wallet digital cliente (Next.js PWA)
│
└── docs/
    ├── 01-overview/        # Visión, alcance, glosario
    ├── 02-architecture/    # NFRs
    ├── 03-apis/            # OpenAPI, AsyncAPI, auth, errores
    ├── 04-data/            # Modelo ER, diccionario, índices, eventos
    ├── 05-security/        # Seguridad
    ├── 06-ops/             # Infraestructura, SLOs, runbooks
    ├── 07-engineering/     # Plan de desarrollo
    └── adr/                # 9 Architecture Decision Records
```

### Cifras clave

| Dimensión | Valor |
|-----------|-------|
| Migraciones de BD | 16 (0000–0015) |
| Módulos backend | 13 |
| Apps frontend | 4 |
| ADRs documentados | 9 |
| Archivos de tests | 17 |
| Fases completadas | 7/7 |
| Líneas de código (aprox.) | 74,763+ |

### Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Runtime | Bun |
| Framework API | Elysia |
| ORM | Drizzle ORM |
| Base de datos | PostgreSQL 16 |
| Cache / Queue | Redis 7 + BullMQ |
| Frontend | Next.js 15 + Tailwind CSS |
| Mensajería | WhatsApp (Twilio / 360Dialog) |
| Contenedores | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Codespaces | GitHub Codespaces |

---

## Narrativa: Cómo se construyó Qoa

La historia de Qoa es la historia de un equipo que decidió construir un producto complejo de manera ordenada: primero el "qué" y el "por qué", luego el "cómo".

**Semana 1 (28–29 ene):** En solo dos días se establecieron los cimientos. No hubo una sola línea de código de producto — todo fue documentación, decisiones de arquitectura y contratos de API. Esto puede parecer lento, pero fue la inversión más importante del proyecto: 9 ADRs aprobados, OpenAPI y AsyncAPI especificados, modelo de datos definido. El equipo no iba a descubrir el camino construyendo; iba a construir siguiendo un mapa bien trazado.

**Semana 3 (17 feb):** Con el blueprint listo, el backend se materializó. El Sprint 1 levantó la infraestructura — Docker, migraciones, middleware, health check. El Sprint 2 construyó los módulos más simples pero fundamentales: usuarios, tiendas y tarjetas. Cada uno cubierto con tests de integración desde el primer día.

**Semana 4 (18 feb):** El sprint más ambicioso. En un solo día de trabajo intensivo se completaron los módulos de mayor complejidad — campañas con motor de reglas, transacciones con idempotencia de webhooks, rewards con sistema de canje — y simultáneamente se levantaron las 4 aplicaciones frontend. Backoffice, portal CPG, dashboard de tienda y wallet digital: cuatro interfaces de usuario que cubren todos los actores del ecosistema. La wallet alcanzó versión 2 con tarjeta universal, suscripciones a campañas y acumulación multi-campaña en el mismo día.

**19 feb:** Un fix quirúrgico de UX — el ancho del widget QR — que recuerda que los detalles importan tanto como la arquitectura.

**21 feb:** El agente de Copilot toma el relevo para continuar el trabajo.

---

*Última actualización: 21 de febrero de 2026*
