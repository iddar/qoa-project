# Modelo de Datos

> Diagrama entidad-relación y estructura de tablas para Qoa.

---

## Diagrama ER Principal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            JERARQUÍA DE NEGOCIO                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │    cpgs     │
                              │─────────────│
                              │ id          │
                              │ name        │
                              │ status      │
                              └──────┬──────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │ 1:N            │ N:M            │ 1:N
                    ▼                ▼                ▼
             ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
             │   brands    │  │store_brands │  │  campaigns  │
             │─────────────│  │─────────────│  │─────────────│
             │ id          │  │ store_id    │  │ id          │
             │ cpg_id (FK) │  │ cpg_id      │  │ cpg_id (FK) │
             │ name        │  │ created_at  │  │ name        │
             └─────────────┘  └──────┬──────┘  │ scope       │
                    ▲                │         │ threshold   │
                    │                │         │ status      │
                    │                ▼         └──────┬──────┘
                    │         ┌─────────────┐         │
                    │         │   stores    │         │
                    │         │─────────────│         │
                    │         │ id          │         │
                    │         │ code        │         │
                    │         │ name        │         │
                    │         │ status      │         │
                    │         └──────┬──────┘         │
                    │                │                │
                    │                │                ▼
                    │                │         ┌─────────────┐
                    │                │         │campaign_    │
                    │                │         │  brands     │
                    │                │         │─────────────│
                    │                │         │ campaign_id │
                    │                │         │ brand_id    │
                    │                │         └─────────────┘
                    │                │                │
                    │                │                │
┌───────────────────┴────────────────┴────────────────┴───────────────────────┐
│                            USUARIOS Y TARJETAS                              │
└─────────────────────────────────────────────────────────────────────────────┘

             ┌─────────────┐                   ┌─────────────┐
             │    users    │                   │   rewards   │
             │─────────────│                   │─────────────│
             │ id          │                   │ id          │
             │ phone       │◀──────────────────│ campaign_id │
             │ email       │                   │ name        │
             │ name        │                   │ cost        │
             │ role        │                   │ stock       │
             └──────┬──────┘                   └──────┬──────┘
                    │                                 │
                    │ 1:N                             │
                    ▼                                 │
             ┌─────────────┐                          │
             │    cards    │                          │
             │─────────────│                          │
             │ id          │                          │
             │ user_id(FK) │                          │
             │ campaign_id │                          │
             │ store_id    │                          │
             │ code        │                          │
             │ status      │                          │
             └──────┬──────┘                          │
                    │                                 │
                    │ 1:N                             │
                    ▼                                 ▼
             ┌─────────────┐                   ┌─────────────┐
             │   balances  │                   │ redemptions │
             │─────────────│                   │─────────────│
             │ id          │                   │ id          │
             │ card_id(FK) │                   │ card_id(FK) │
             │ current     │                   │ reward_id   │
             │ lifetime    │                   │ cost        │
             │ updated_at  │                   │ created_at  │
             └─────────────┘                   └─────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                             TRANSACCIONES                                   │
└─────────────────────────────────────────────────────────────────────────────┘

             ┌─────────────┐
             │transactions │
             │─────────────│
             │ id          │
             │ user_id(FK) │
             │ store_id(FK)│
             │ total_amount│
             │ created_at  │
             └──────┬──────┘
                    │
                    │ 1:N
                    ▼
             ┌─────────────┐                   ┌─────────────┐
             │transaction_ │                   │accumulations│
             │   items     │                   │─────────────│
             │─────────────│                   │ id          │
             │ id          │──────────────────▶│ txn_item_id │
             │ txn_id (FK) │                   │ card_id     │
             │ brand_id    │                   │ campaign_id │
             │ quantity    │                   │ amount      │
             │ amount      │                   │ created_at  │
             └─────────────┘                   └─────────────┘
```

---

## Relaciones clave

### CPG → Brands (1:N)

Un CPG tiene múltiples marcas (brands).

```
cpgs.id ──────────▶ brands.cpg_id
```

### CPG ↔ Stores (N:M)

Un PDV puede vender productos de múltiples CPGs. Se resuelve con tabla intermedia.

```
cpgs.id ◀──────────▶ store_brands ◀──────────▶ stores.id
```

### Campaign → Brands (N:M)

Una campaña puede aplicar a múltiples brands (o null = todas del CPG).

```
campaigns.id ◀──────────▶ campaign_brands ◀──────────▶ brands.id
```

### User → Cards (1:N)

Un usuario puede tener múltiples tarjetas (una por campaña/contexto).

```
users.id ──────────▶ cards.user_id
```

### Card → Campaign (N:1)

Cada tarjeta pertenece a una campaña.

```
cards.campaign_id ──────────▶ campaigns.id
```

### Transaction → Items (1:N)

Una transacción tiene múltiples items (productos/brands comprados).

```
transactions.id ──────────▶ transaction_items.transaction_id
```

### Item → Accumulations (1:N)

Un item puede generar acumulaciones en múltiples cards (si aplica a varias campañas).

```
transaction_items.id ──────────▶ accumulations.transaction_item_id
```

---

## Tablas de negocio

### cpgs

Empresas/marcas matriz (Consumer Packaged Goods).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| name | varchar(200) | Nombre del CPG |
| status | enum | active, inactive |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### brands

Sub-marcas de un CPG.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| cpg_id | uuid | FK → cpgs |
| name | varchar(200) | Nombre de la marca |
| logo_url | text | URL del logo (nullable) |
| status | enum | active, inactive |
| created_at | timestamptz | |

### stores

Puntos de venta (PDVs).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| code | varchar(10) | Código único para QR |
| name | varchar(200) | Nombre de la tienda |
| address | text | Dirección (nullable) |
| phone | varchar(20) | Teléfono (nullable) |
| status | enum | active, inactive |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### store_brands

Relación N:M entre stores y CPGs.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| store_id | uuid | FK → stores |
| cpg_id | uuid | FK → cpgs |
| created_at | timestamptz | |

PK: (store_id, cpg_id)

### users

Usuarios del sistema (consumidores, tenderos, admins).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| phone | varchar(20) | Teléfono (único) |
| email | varchar(255) | Email (nullable, único) |
| name | varchar(100) | Nombre (nullable) |
| password_hash | varchar(255) | Hash bcrypt (nullable) |
| role | enum | consumer, store_staff, store_admin, cpg_admin, qoa_admin |
| status | enum | active, suspended |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### campaigns

Campañas de lealtad.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| cpg_id | uuid | FK → cpgs |
| name | varchar(200) | Nombre de la campaña |
| description | text | Descripción (nullable) |
| accumulation_type | enum | stamps, points, amount |
| accumulation_scope | enum | store_brand, store_cpg, brand_only, cpg_only |
| threshold | integer | Cantidad para canjear |
| validity_type | enum | indefinite, date_range |
| starts_at | timestamptz | Fecha de inicio |
| ends_at | timestamptz | Fecha de fin (nullable) |
| status | enum | draft, active, paused, ended |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### campaign_brands

Brands específicas de una campaña (si brand_ids no es null).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| campaign_id | uuid | FK → campaigns |
| brand_id | uuid | FK → brands |

PK: (campaign_id, brand_id)

### cards

Tarjetas de lealtad de usuarios.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK → users |
| campaign_id | uuid | FK → campaigns |
| store_id | uuid | FK → stores (nullable según scope) |
| code | varchar(20) | Código único de tarjeta |
| status | enum | active, inactive |
| created_at | timestamptz | |

Unique: (user_id, campaign_id, store_id)

### balances

Balance actual de puntos/estampas por tarjeta.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| card_id | uuid | FK → cards (unique) |
| current | integer | Balance actual |
| lifetime | integer | Total acumulado histórico |
| updated_at | timestamptz | |

### rewards

Catálogo de recompensas por campaña.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns |
| name | varchar(200) | Nombre del premio |
| description | text | Descripción (nullable) |
| image_url | text | URL de imagen (nullable) |
| cost | integer | Costo en puntos/estampas |
| stock | integer | Stock disponible (nullable = ilimitado) |
| status | enum | active, inactive |
| created_at | timestamptz | |

### redemptions

Canjes realizados.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| card_id | uuid | FK → cards |
| reward_id | uuid | FK → rewards |
| cost | integer | Puntos/estampas usados |
| status | enum | pending, completed, cancelled |
| created_at | timestamptz | |

### transactions

Compras registradas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK → users |
| store_id | uuid | FK → stores |
| total_amount | decimal(12,2) | Monto total (nullable) |
| metadata | jsonb | Datos adicionales |
| created_at | timestamptz | |

### transaction_items

Items de una transacción.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| transaction_id | uuid | FK → transactions |
| brand_id | uuid | FK → brands |
| quantity | integer | Cantidad |
| amount | decimal(12,2) | Monto (nullable) |
| metadata | jsonb | Datos adicionales |

### accumulations

Acumulaciones generadas por items.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| transaction_item_id | uuid | FK → transaction_items |
| card_id | uuid | FK → cards |
| campaign_id | uuid | FK → campaigns |
| amount | integer | Cantidad acumulada |
| created_at | timestamptz | |

---

## Tablas de infraestructura

### api_keys

Llaves de API para integraciones B2B.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| name | varchar(100) | Nombre descriptivo |
| key_hash | varchar(255) | Hash SHA-256 de la key |
| key_prefix | varchar(20) | Prefijo visible (qoa_live_xxx) |
| scopes | text[] | Array de scopes |
| tenant_id | uuid | CPG o Store asociado |
| tenant_type | enum | cpg, store |
| rate_limit | integer | Requests por minuto |
| last_used_at | timestamptz | Último uso |
| expires_at | timestamptz | Expiración (nullable) |
| revoked_at | timestamptz | Si fue revocada |
| created_at | timestamptz | |

### outbox_events

Eventos pendientes de publicar (Transactional Outbox).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| event_id | uuid | PK |
| event_type | varchar(100) | Tipo de evento |
| event_version | varchar(10) | Versión del schema |
| payload | jsonb | Datos del evento |
| tenant_id | uuid | Contexto de tenant |
| trace_id | varchar(50) | ID de traza |
| status | enum | pending, published, failed |
| attempts | integer | Intentos de publicación |
| available_at | timestamptz | Cuándo puede procesarse |
| published_at | timestamptz | Cuándo se publicó |
| last_error | text | Último error |
| created_at | timestamptz | |

### processed_events

Eventos ya procesados (para idempotencia).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| event_id | uuid | PK |
| processed_at | timestamptz | |

### jobs

Trabajos en cola.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| job_id | uuid | PK |
| job_type | varchar(100) | Tipo de job |
| payload | jsonb | Datos del job |
| status | enum | pending, running, completed, failed, dead |
| attempts | integer | Intentos |
| max_attempts | integer | Máximo de intentos |
| run_at | timestamptz | Cuándo ejecutar |
| trace_id | varchar(50) | ID de traza |
| event_id | uuid | Evento que lo generó (nullable) |
| tenant_id | uuid | Contexto de tenant |
| created_at | timestamptz | |

### job_runs

Historial de ejecución de jobs.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| job_id | uuid | FK → jobs |
| attempt | integer | Número de intento |
| worker_id | varchar(100) | ID del worker |
| started_at | timestamptz | |
| finished_at | timestamptz | |
| error_code | varchar(50) | Código de error (nullable) |
| error_message | text | Mensaje de error (nullable) |
| duration_ms | integer | Duración en ms |

### webhook_endpoints

Endpoints de webhook configurados.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| tenant_id | uuid | CPG o Store |
| tenant_type | enum | cpg, store |
| url | text | URL del endpoint |
| secret_hash | varchar(255) | Hash del secret |
| events | text[] | Eventos suscritos |
| status | enum | active, inactive |
| created_at | timestamptz | |

### webhook_deliveries

Intentos de entrega de webhooks.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| endpoint_id | uuid | FK → webhook_endpoints |
| event_id | uuid | ID del evento |
| event_type | varchar(100) | Tipo de evento |
| payload | jsonb | Payload enviado |
| attempt | integer | Número de intento |
| status | enum | pending, delivered, failed |
| response_code | integer | HTTP status (nullable) |
| response_body | text | Respuesta (nullable) |
| next_retry_at | timestamptz | Próximo intento |
| created_at | timestamptz | |

---

## Convenciones

### Nombres

- Tablas: plural, snake_case (`users`, `transaction_items`)
- Columnas: singular, snake_case (`user_id`, `created_at`)
- PKs: `id` (uuid)
- FKs: `{tabla_singular}_id` (`user_id`, `campaign_id`)
- Timestamps: `created_at`, `updated_at`, `deleted_at`

### Tipos

- IDs: UUID v7 (ordenables por tiempo)
- Timestamps: `timestamptz` (con timezone)
- Montos: `decimal(12,2)`
- Enums: tipos PostgreSQL
- JSON: `jsonb`

### Auditoría

Todas las tablas de negocio tienen:
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz` (actualizado por trigger)
