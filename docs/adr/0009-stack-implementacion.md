# ADR-0009: Stack de Implementación

> **Estado:** Aceptado
> **Fecha:** 2026-01-29
> **Decisores:** Equipo Qoa

---

## Contexto

Con los ADRs arquitectónicos definidos (modular monolith, PostgreSQL, eventos, multi-tenancy), se requiere definir el stack tecnológico concreto y los patrones de implementación.

---

## Decisión

**Stack JavaScript/TypeScript con arquitectura event-driven sobre PaaS.**

### Stack tecnológico

| Capa | Tecnología | Justificación |
|------|------------|---------------|
| **Runtime** | Bun | Performance, TypeScript nativo, compatibilidad Node |
| **Framework API** | Elysia | Tipado end-to-end, validación, OpenAPI automático |
| **Base de datos** | PostgreSQL | Source of truth (ADR-0002) |
| **Cola/Cache** | Redis | Baja latencia, Redis Streams para jobs |
| **Operación** | PaaS | Simplifica despliegue, escalado, health checks |
| **Observabilidad** | OpenTelemetry | Estándar abierto, trazas end-to-end |

### Componentes del sistema

```
┌─────────────────────────────────────────────────────────┐
│                        PaaS Platform                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ API Service │    │   Worker    │    │  Scheduler  │  │
│  │    (JS)     │    │   (JS)      │    │   (Cron)    │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │         │
│         └────────┬─────────┴─────────┬────────┘         │
│                  │                   │                  │
│                  ▼                   ▼                  │
│         ┌─────────────┐      ┌─────────────┐            │
│         │  PostgreSQL │      │    Redis    │            │
│         │  (managed)  │      │  (managed)  │            │
│         └─────────────┘      └─────────────┘            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

| Componente | Responsabilidad |
|------------|-----------------|
| **API Service** | REST API, validación, auth, rate limiting, registra eventos |
| **Worker** | Consume colas, ejecuta handlers, procesa webhooks |
| **Scheduler** | Dispara tareas recurrentes (cron), encola jobs |

---

## Patrón: Transactional Outbox

**Principio:** PostgreSQL es la fuente de verdad. Evitar "dual write" inseguro.

```
┌──────────────────────────────────────────────────────┐
│                    Transacción Postgres              │
├──────────────────────────────────────────────────────┤
│  1. Persistir cambio de negocio                      │
│  2. Insertar evento en tabla outbox                  │
│  3. COMMIT                                           │
└──────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────┐
│                      Dispatcher                      │
├──────────────────────────────────────────────────────┤
│  1. Lee eventos pendientes de outbox                 │
│  2. Publica a Redis Stream                           │
│  3. Marca como publicado en outbox                   │
└──────────────────────────────────────────────────────┘
```

### Tabla outbox (estructura conceptual)

```
outbox_events {
  event_id        → Identificador único
  type            → Tipo de evento (ej: "transaction.created")
  version         → Versión del schema (ej: "v1")
  payload         → Datos del evento (JSON)
  created_at      → Timestamp de creación
  available_at    → Cuándo puede procesarse
  status          → "pending" | "published" | "failed"
  attempts        → Número de intentos
  last_error      → Último error si falló
  trace_id        → Correlación con trazas
}
```

### Beneficio

Si Redis falla o el proceso cae, los eventos permanecen en PostgreSQL y se reintentan automáticamente.

---

## Patrón: Redis Streams + Consumer Groups

```
┌───────────────────────────────────────────────────────────────┐
│                     Redis Stream                              │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Producer (API/Dispatcher)                                    │
│         │                                                     │
│         ▼                                                     │
│  ┌────────────────────────────────────────────┐               │
│  │              Stream: "jobs"                │               │
│  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │               │
│  │  │ E1 │ │ E2 │ │ E3 │ │ E4 │ │ E5 │  ...   │               │
│  │  └────┘ └────┘ └────┘ └────┘ └────┘        │               │
│  └────────────────────────────────────────────┘               │
│                        │                                      │
│         Consumer Group: "workers"                             │
│                        │                                      │
│         ┌──────────────┼──────────────┐                       │
│         ▼              ▼              ▼                       │
│    ┌─────────┐   ┌─────────┐   ┌─────────┐                    │
│    │Worker 1 │   │Worker 2 │   │Worker 3 │                    │
│    └─────────┘   └─────────┘   └─────────┘                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

| Característica | Implementación |
|----------------|----------------|
| **Consumo** | XREADGROUP (workers compiten sin duplicarse) |
| **ACK** | XACK al completar procesamiento |
| **Reintentos** | XAUTOCLAIM para mensajes huérfanos |
| **Concurrencia** | Pool de promesas interno por worker |

---

## Patrón: Idempotencia (obligatorio)

**Modelo:** At-least-once delivery → handlers deben ser idempotentes.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Worker Handler                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Recibir evento con event_id                                 │
│                                                                 │
│  2. INSERT INTO processed_events (event_id)                     │
│     ON CONFLICT DO NOTHING                                      │
│     RETURNING event_id                                          │
│                                                                 │
│  3. Si retornó null → ya procesado → SKIP                       │
│     Si retornó event_id → procesar → COMMIT                     │
│                                                                 │
│  4. XACK en Redis                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Reintentos y DLQ

### Política de reintentos

```
Intento 1: inmediato
Intento 2: +1 minuto
Intento 3: +5 minutos
Intento 4: +30 minutos
Intento 5: +2 horas
─────────────────────
Después: Dead Letter Queue (DLQ)
```

### DLQ

- Stream separado o tabla en Postgres
- Permite inspección manual
- Capacidad de replay

---

## Fallback si Redis falla

```
┌─────────────────────────────────────────────────────────────────┐
│                   Redis disponible                              │
├─────────────────────────────────────────────────────────────────┤
│  Dispatcher → Redis Stream → Workers                            │
└─────────────────────────────────────────────────────────────────┘

                    Redis cae
                        │
                        ▼

┌─────────────────────────────────────────────────────────────────┐
│                    Fallback Postgres                            │
├─────────────────────────────────────────────────────────────────┤
│  Workers hacen polling de outbox/jobs en Postgres               │
│  usando FOR UPDATE SKIP LOCKED                                  │
│  (reparte trabajo sin colisiones)                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Observabilidad

### OpenTelemetry

| Span | Descripción |
|------|-------------|
| `http.server` | Request entrante a API |
| `db.query` | Queries a PostgreSQL |
| `job.run` | Ejecución de job en worker |
| `webhook.delivery` | Envío de webhook |
| `http.client` | Llamadas a servicios externos |

### Propagación de contexto

```
traceId/requestId → eventId/jobId → deliveryId
```

### Logs

- Formato JSON a stdout/stderr (12-factor)
- Recolectados por PaaS
- Backend centralizado con correlación por traceId
- Retención: 7-30 días logs, auditoría en Postgres con mayor retención

---

## Diseño de API

### Versionado

```
/v1/users
/v1/transactions
/v1/campaigns
```

### Autenticación

| Método | Header | Uso |
|--------|--------|-----|
| API Key | `Authorization: Bearer <key>` o `X-API-Key` | B2B, integraciones |
| JWT | `Authorization: Bearer <token>` | Dashboard, apps |

### Manejo de errores (estándar)

```
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "El campo 'phone' es requerido",
    "details": [
      { "field": "phone", "reason": "required" }
    ]
  },
  "traceId": "abc123..."
}
```

| Código | Descripción |
|--------|-------------|
| `INVALID_ARGUMENT` | Validación fallida |
| `UNAUTHORIZED` | Auth requerida/inválida |
| `FORBIDDEN` | Sin permisos |
| `NOT_FOUND` | Recurso no existe |
| `RATE_LIMITED` | Límite excedido |
| `INTERNAL` | Error interno |

### Headers importantes

| Header | Uso |
|--------|-----|
| `X-Request-Id` | Correlación de request |
| `X-Idempotency-Key` | Idempotencia en endpoints críticos |
| `X-RateLimit-*` | Info de rate limiting |

---

## Ambientes

| Ambiente | Infraestructura |
|----------|-----------------|
| **dev** | Docker Compose (PG + Redis local) |
| **staging** | PaaS con recursos reducidos |
| **prod** | PaaS con HA, managed PG y Redis |

### Configuración

- Variables de entorno (12-factor)
- Secrets en secret manager del PaaS
- Mismas migraciones en todos los ambientes

---

## Entidades de infraestructura (sugerencia)

```
api_keys {
  id, hash, scopes, rate_plan,
  created_at, revoked_at, last_used_at
}

outbox_events {
  event_id, type, version, payload,
  occurred_at, trace_id, tenant_id,
  status, attempts, last_error
}

jobs {
  job_id, type, payload, status,
  attempts, max_attempts, run_at,
  trace_id, event_id, tenant_id
}

job_runs {
  job_id, attempt, started_at, finished_at,
  worker_id, error_code, error_message, duration_ms
}

processed_events {
  event_id, processed_at
}

webhook_endpoints {
  endpoint_id, url, secret_hash, status, created_at
}

webhook_deliveries {
  delivery_id, event_id, endpoint_id,
  attempt, status, response_code, next_retry_at
}
```

---

## Consecuencias

### Positivas

- **Consistencia**: Postgres como source of truth garantiza durabilidad
- **Resiliencia**: Sistema funciona aunque Redis falle
- **Observabilidad**: Trazas end-to-end con OpenTelemetry
- **Mantenibilidad**: Un solo lenguaje (JS/TS) para todo el backend
- **Operación simple**: PaaS elimina complejidad de Kubernetes

### Negativas

- **Complejidad inicial**: Transactional outbox requiere setup cuidadoso
- **Latencia vs durabilidad**: Trade-off consciente (priorizamos durabilidad)
- **Dependencia de PaaS**: Vendor lock-in parcial

### Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Sobrecarga en Postgres | Particionado/archiving de tablas de auditoría |
| Redis como punto crítico | Fallback a Postgres, monitoreo de backlog |
| Idempotencia incompleta | Tests de reintentos obligatorios |
| Crecimiento de eventos | Versionado (type+version), compatibilidad hacia atrás |

---

## Referencias

- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [Redis Streams](https://redis.io/docs/data-types/streams/)
- [OpenTelemetry](https://opentelemetry.io/)
- [Elysia](https://elysiajs.com/)
- [Bun](https://bun.sh/)
