# Diccionario de Datos

> Descripción detallada de tablas, columnas y restricciones.

---

## Tipos Enumerados

```sql
-- Estados comunes
CREATE TYPE entity_status AS ENUM ('active', 'inactive');

-- Roles de usuario
CREATE TYPE user_role AS ENUM (
  'consumer',
  'store_staff',
  'store_admin',
  'cpg_admin',
  'qoa_admin'
);

-- Estado de usuario
CREATE TYPE user_status AS ENUM ('active', 'suspended');

-- Estado de campaña
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'ended');

-- Tipo de acumulación
CREATE TYPE accumulation_type AS ENUM ('stamps', 'points', 'amount');

-- Scope de acumulación
CREATE TYPE accumulation_scope AS ENUM (
  'store_brand',   -- Por PDV + brands específicas
  'store_cpg',     -- Por PDV + cualquier brand del CPG
  'brand_only',    -- Brands específicas, cualquier PDV
  'cpg_only'       -- Cualquier brand, cualquier PDV
);

-- Vigencia de campaña
CREATE TYPE validity_type AS ENUM ('indefinite', 'date_range');

-- Estado de canje
CREATE TYPE redemption_status AS ENUM ('pending', 'completed', 'cancelled');

-- Estado de job
CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'dead');

-- Estado de evento outbox
CREATE TYPE outbox_status AS ENUM ('pending', 'published', 'failed');

-- Estado de webhook delivery
CREATE TYPE delivery_status AS ENUM ('pending', 'delivered', 'failed');

-- Tipo de tenant
CREATE TYPE tenant_type AS ENUM ('cpg', 'store');
```

---

## Tablas de Negocio

### cpgs

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| name | varchar(200) | NO | - | - |
| status | entity_status | NO | 'active' | - |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | YES | - | - |

**Índices:**
- `cpgs_pkey` PRIMARY KEY (id)

---

### brands

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| cpg_id | uuid | NO | - | FK → cpgs(id) |
| name | varchar(200) | NO | - | - |
| logo_url | text | YES | - | - |
| status | entity_status | NO | 'active' | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `brands_pkey` PRIMARY KEY (id)
- `brands_cpg_id_idx` INDEX (cpg_id)

**Foreign Keys:**
- `brands_cpg_id_fkey` REFERENCES cpgs(id) ON DELETE CASCADE

---

### stores

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| code | varchar(10) | NO | - | UNIQUE |
| name | varchar(200) | NO | - | - |
| address | text | YES | - | - |
| phone | varchar(20) | YES | - | - |
| status | entity_status | NO | 'active' | - |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | YES | - | - |

**Índices:**
- `stores_pkey` PRIMARY KEY (id)
- `stores_code_key` UNIQUE (code)

**Reglas:**
- `code` se genera automáticamente (6-8 caracteres alfanuméricos)

---

### store_brands

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| store_id | uuid | NO | - | FK → stores(id) |
| cpg_id | uuid | NO | - | FK → cpgs(id) |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `store_brands_pkey` PRIMARY KEY (store_id, cpg_id)
- `store_brands_cpg_id_idx` INDEX (cpg_id)

**Foreign Keys:**
- `store_brands_store_id_fkey` REFERENCES stores(id) ON DELETE CASCADE
- `store_brands_cpg_id_fkey` REFERENCES cpgs(id) ON DELETE CASCADE

---

### users

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| phone | varchar(20) | NO | - | UNIQUE |
| email | varchar(255) | YES | - | UNIQUE |
| name | varchar(100) | YES | - | - |
| password_hash | varchar(255) | YES | - | - |
| role | user_role | NO | 'consumer' | - |
| status | user_status | NO | 'active' | - |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | YES | - | - |

**Índices:**
- `users_pkey` PRIMARY KEY (id)
- `users_phone_key` UNIQUE (phone)
- `users_email_key` UNIQUE (email) WHERE email IS NOT NULL

**Validaciones:**
- `phone` debe ser formato E.164 (CHECK)
- `email` validado por formato (CHECK)

---

### campaigns

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| cpg_id | uuid | NO | - | FK → cpgs(id) |
| name | varchar(200) | NO | - | - |
| description | text | YES | - | - |
| accumulation_type | accumulation_type | NO | - | - |
| accumulation_scope | accumulation_scope | NO | - | - |
| threshold | integer | NO | - | CHECK (threshold > 0) |
| validity_type | validity_type | NO | 'indefinite' | - |
| starts_at | timestamptz | NO | - | - |
| ends_at | timestamptz | YES | - | - |
| status | campaign_status | NO | 'draft' | - |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | YES | - | - |

**Índices:**
- `campaigns_pkey` PRIMARY KEY (id)
- `campaigns_cpg_id_idx` INDEX (cpg_id)
- `campaigns_status_idx` INDEX (status) WHERE status = 'active'

**Foreign Keys:**
- `campaigns_cpg_id_fkey` REFERENCES cpgs(id) ON DELETE CASCADE

**Validaciones:**
- Si `validity_type = 'date_range'` entonces `ends_at` NO puede ser NULL
- `ends_at > starts_at` cuando ambos están presentes

---

### campaign_brands

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| brand_id | uuid | NO | - | FK → brands(id) |

**Índices:**
- `campaign_brands_pkey` PRIMARY KEY (campaign_id, brand_id)

**Foreign Keys:**
- `campaign_brands_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE
- `campaign_brands_brand_id_fkey` REFERENCES brands(id) ON DELETE CASCADE

**Regla de negocio:**
- Si `campaign_brands` está vacío para una campaña, aplica a TODAS las brands del CPG

---

### cards

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| user_id | uuid | NO | - | FK → users(id) |
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| store_id | uuid | YES | - | FK → stores(id) |
| code | varchar(20) | NO | - | UNIQUE |
| status | entity_status | NO | 'active' | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `cards_pkey` PRIMARY KEY (id)
- `cards_code_key` UNIQUE (code)
- `cards_user_campaign_store_key` UNIQUE (user_id, campaign_id, store_id)
- `cards_user_id_idx` INDEX (user_id)
- `cards_campaign_id_idx` INDEX (campaign_id)

**Foreign Keys:**
- `cards_user_id_fkey` REFERENCES users(id) ON DELETE CASCADE
- `cards_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE
- `cards_store_id_fkey` REFERENCES stores(id) ON DELETE SET NULL

**Regla de negocio:**
- `store_id` es requerido si `campaign.accumulation_scope` es `store_brand` o `store_cpg`
- `store_id` es NULL si el scope es `brand_only` o `cpg_only`

---

### balances

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| card_id | uuid | NO | - | FK → cards(id), UNIQUE |
| current | integer | NO | 0 | CHECK (current >= 0) |
| lifetime | integer | NO | 0 | CHECK (lifetime >= 0) |
| updated_at | timestamptz | NO | now() | - |

**Índices:**
- `balances_pkey` PRIMARY KEY (id)
- `balances_card_id_key` UNIQUE (card_id)

**Foreign Keys:**
- `balances_card_id_fkey` REFERENCES cards(id) ON DELETE CASCADE

---

### rewards

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| name | varchar(200) | NO | - | - |
| description | text | YES | - | - |
| image_url | text | YES | - | - |
| cost | integer | NO | - | CHECK (cost > 0) |
| stock | integer | YES | - | CHECK (stock >= 0) |
| status | entity_status | NO | 'active' | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `rewards_pkey` PRIMARY KEY (id)
- `rewards_campaign_id_idx` INDEX (campaign_id)

**Foreign Keys:**
- `rewards_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE

**Regla:**
- `stock = NULL` significa stock ilimitado

---

### redemptions

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| card_id | uuid | NO | - | FK → cards(id) |
| reward_id | uuid | NO | - | FK → rewards(id) |
| cost | integer | NO | - | CHECK (cost > 0) |
| status | redemption_status | NO | 'pending' | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `redemptions_pkey` PRIMARY KEY (id)
- `redemptions_card_id_idx` INDEX (card_id)
- `redemptions_reward_id_idx` INDEX (reward_id)

**Foreign Keys:**
- `redemptions_card_id_fkey` REFERENCES cards(id) ON DELETE CASCADE
- `redemptions_reward_id_fkey` REFERENCES rewards(id) ON DELETE CASCADE

---

### transactions

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| user_id | uuid | NO | - | FK → users(id) |
| store_id | uuid | NO | - | FK → stores(id) |
| total_amount | decimal(12,2) | YES | - | CHECK (total_amount >= 0) |
| metadata | jsonb | YES | '{}' | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `transactions_pkey` PRIMARY KEY (id)
- `transactions_user_id_idx` INDEX (user_id)
- `transactions_store_id_idx` INDEX (store_id)
- `transactions_created_at_idx` INDEX (created_at DESC)

**Foreign Keys:**
- `transactions_user_id_fkey` REFERENCES users(id) ON DELETE CASCADE
- `transactions_store_id_fkey` REFERENCES stores(id) ON DELETE CASCADE

---

### transaction_items

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| transaction_id | uuid | NO | - | FK → transactions(id) |
| brand_id | uuid | NO | - | FK → brands(id) |
| quantity | integer | NO | 1 | CHECK (quantity > 0) |
| amount | decimal(12,2) | YES | - | CHECK (amount >= 0) |
| metadata | jsonb | YES | '{}' | - |

**Índices:**
- `transaction_items_pkey` PRIMARY KEY (id)
- `transaction_items_transaction_id_idx` INDEX (transaction_id)
- `transaction_items_brand_id_idx` INDEX (brand_id)

**Foreign Keys:**
- `transaction_items_transaction_id_fkey` REFERENCES transactions(id) ON DELETE CASCADE
- `transaction_items_brand_id_fkey` REFERENCES brands(id) ON DELETE CASCADE

---

### accumulations

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| transaction_item_id | uuid | NO | - | FK → transaction_items(id) |
| card_id | uuid | NO | - | FK → cards(id) |
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| amount | integer | NO | - | CHECK (amount > 0) |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `accumulations_pkey` PRIMARY KEY (id)
- `accumulations_card_id_idx` INDEX (card_id)
- `accumulations_transaction_item_id_idx` INDEX (transaction_item_id)

**Foreign Keys:**
- `accumulations_transaction_item_id_fkey` REFERENCES transaction_items(id) ON DELETE CASCADE
- `accumulations_card_id_fkey` REFERENCES cards(id) ON DELETE CASCADE
- `accumulations_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE

---

## Tablas de Infraestructura

### api_keys

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| name | varchar(100) | NO | - | - |
| key_hash | varchar(255) | NO | - | - |
| key_prefix | varchar(20) | NO | - | - |
| scopes | text[] | NO | '{}' | - |
| tenant_id | uuid | NO | - | - |
| tenant_type | tenant_type | NO | - | - |
| rate_limit | integer | NO | 60 | CHECK (rate_limit > 0) |
| last_used_at | timestamptz | YES | - | - |
| expires_at | timestamptz | YES | - | - |
| revoked_at | timestamptz | YES | - | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `api_keys_pkey` PRIMARY KEY (id)
- `api_keys_key_hash_idx` INDEX (key_hash)
- `api_keys_tenant_idx` INDEX (tenant_id, tenant_type)

---

### outbox_events

Ver [ADR-0009](../adr/0009-stack-implementacion.md) para detalles del patrón.

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| event_id | uuid | NO | uuid_generate_v7() | PK |
| event_type | varchar(100) | NO | - | - |
| event_version | varchar(10) | NO | 'v1' | - |
| payload | jsonb | NO | - | - |
| tenant_id | uuid | YES | - | - |
| trace_id | varchar(50) | YES | - | - |
| status | outbox_status | NO | 'pending' | - |
| attempts | integer | NO | 0 | - |
| available_at | timestamptz | NO | now() | - |
| published_at | timestamptz | YES | - | - |
| last_error | text | YES | - | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `outbox_events_pkey` PRIMARY KEY (event_id)
- `outbox_events_pending_idx` INDEX (available_at) WHERE status = 'pending'

---

### processed_events

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| event_id | uuid | NO | - | PK |
| processed_at | timestamptz | NO | now() | - |

**Índices:**
- `processed_events_pkey` PRIMARY KEY (event_id)

---

### jobs

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| job_id | uuid | NO | uuid_generate_v7() | PK |
| job_type | varchar(100) | NO | - | - |
| payload | jsonb | NO | - | - |
| status | job_status | NO | 'pending' | - |
| attempts | integer | NO | 0 | - |
| max_attempts | integer | NO | 5 | - |
| run_at | timestamptz | NO | now() | - |
| trace_id | varchar(50) | YES | - | - |
| event_id | uuid | YES | - | - |
| tenant_id | uuid | YES | - | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `jobs_pkey` PRIMARY KEY (job_id)
- `jobs_pending_idx` INDEX (run_at) WHERE status = 'pending'
- `jobs_type_status_idx` INDEX (job_type, status)

---

### job_runs

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| job_id | uuid | NO | - | FK → jobs(job_id) |
| attempt | integer | NO | - | - |
| worker_id | varchar(100) | NO | - | - |
| started_at | timestamptz | NO | now() | - |
| finished_at | timestamptz | YES | - | - |
| error_code | varchar(50) | YES | - | - |
| error_message | text | YES | - | - |
| duration_ms | integer | YES | - | - |

**Índices:**
- `job_runs_pkey` PRIMARY KEY (id)
- `job_runs_job_id_idx` INDEX (job_id)

**Foreign Keys:**
- `job_runs_job_id_fkey` REFERENCES jobs(job_id) ON DELETE CASCADE

---

### webhook_endpoints

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| tenant_id | uuid | NO | - | - |
| tenant_type | tenant_type | NO | - | - |
| url | text | NO | - | - |
| secret_hash | varchar(255) | NO | - | - |
| events | text[] | NO | '{}' | - |
| status | entity_status | NO | 'active' | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `webhook_endpoints_pkey` PRIMARY KEY (id)
- `webhook_endpoints_tenant_idx` INDEX (tenant_id, tenant_type)

---

### webhook_deliveries

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| endpoint_id | uuid | NO | - | FK → webhook_endpoints(id) |
| event_id | uuid | NO | - | - |
| event_type | varchar(100) | NO | - | - |
| payload | jsonb | NO | - | - |
| attempt | integer | NO | 1 | - |
| status | delivery_status | NO | 'pending' | - |
| response_code | integer | YES | - | - |
| response_body | text | YES | - | - |
| next_retry_at | timestamptz | YES | - | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `webhook_deliveries_pkey` PRIMARY KEY (id)
- `webhook_deliveries_endpoint_id_idx` INDEX (endpoint_id)
- `webhook_deliveries_pending_idx` INDEX (next_retry_at) WHERE status = 'pending'

**Foreign Keys:**
- `webhook_deliveries_endpoint_id_fkey` REFERENCES webhook_endpoints(id) ON DELETE CASCADE
