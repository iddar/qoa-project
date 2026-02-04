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

-- Modo de captura de evidencia en campañas
CREATE TYPE capture_mode AS ENUM ('transaction', 'code', 'hybrid');

-- Scope de acumulación (legacy, mantener para compatibilidad)
CREATE TYPE accumulation_scope AS ENUM (
  'store_brand',   -- Por PDV + brands específicas
  'store_cpg',     -- Por PDV + cualquier brand del CPG
  'brand_only',    -- Brands específicas, cualquier PDV
  'cpg_only'       -- Cualquier brand, cualquier PDV
);

-- Vigencia de campaña
CREATE TYPE validity_type AS ENUM ('indefinite', 'date_range');

-- Tipo de threshold para tiers
CREATE TYPE threshold_type AS ENUM (
  'cumulative',      -- Subes de nivel y te quedas (permanente)
  'per_period',      -- Se evalúa por período, puede bajar
  'reset_on_redeem'  -- Al canjear vuelve a 0
);

-- Tipo de beneficio
CREATE TYPE benefit_type AS ENUM (
  'discount',      -- Descuento (porcentual o fijo)
  'reward',        -- Acceso a recompensa específica
  'multiplier',    -- Multiplicador de puntos
  'free_product'   -- Producto gratis
);

-- Tipo de policy
CREATE TYPE policy_type AS ENUM (
  'max_accumulations',  -- Límite de acumulaciones
  'min_amount',         -- Monto mínimo requerido
  'min_quantity',       -- Cantidad mínima de productos
  'cooldown'            -- Tiempo de espera entre acumulaciones
);

-- Scope de policy
CREATE TYPE policy_scope_type AS ENUM (
  'campaign',  -- Aplica a toda la campaña
  'brand',     -- Aplica a una marca específica
  'product'    -- Aplica a un producto específico
);

-- Período de policy
CREATE TYPE policy_period AS ENUM (
  'transaction',  -- Por transacción
  'day',          -- Por día
  'week',         -- Por semana
  'month',        -- Por mes
  'lifetime'      -- Lifetime del usuario en la campaña
);

-- Estado del código único
CREATE TYPE campaign_code_status AS ENUM ('available', 'assigned', 'redeemed', 'void');

-- Estado del intento de captura de código
CREATE TYPE code_capture_status AS ENUM ('pending', 'accepted', 'rejected');

-- Fuente de datos de una acumulación
CREATE TYPE accumulation_source_type AS ENUM ('transaction_item', 'code_capture');

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

### products

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| brand_id | uuid | NO | - | FK → brands(id) |
| sku | varchar(50) | NO | - | - |
| name | varchar(200) | NO | - | - |
| status | entity_status | NO | 'active' | - |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | YES | - | - |

**Índices:**
- `products_pkey` PRIMARY KEY (id)
- `products_brand_id_idx` INDEX (brand_id)
- `products_sku_idx` UNIQUE (sku)

**Foreign Keys:**
- `products_brand_id_fkey` REFERENCES brands(id) ON DELETE CASCADE

**Jerarquía:** CPG → Brand → Product

---

### stores

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| code | varchar(10) | NO | - | UNIQUE |
| name | varchar(200) | NO | - | - |
| type | varchar(50) | YES | - | - |
| address | text | YES | - | - |
| phone | varchar(20) | YES | - | - |
| status | entity_status | NO | 'active' | - |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | YES | - | - |

**Índices:**
- `stores_pkey` PRIMARY KEY (id)
- `stores_code_key` UNIQUE (code)
- `stores_type_idx` INDEX (type) WHERE type IS NOT NULL

**Reglas:**
- `code` se genera automáticamente (6-8 caracteres alfanuméricos)
- `type` es el tipo de tienda (tiendita, minisuper, cadena, etc.)

**Nota:** Los stores son entidades independientes, no dependen de CPGs.

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
| accumulation_scope | accumulation_scope | YES | NULL | Legacy, se mantiene para compatibilidad |
| capture_mode | capture_mode | NO | 'transaction' | Define la fuente (tickets/códigos) |
| ready_for_review | boolean | NO | false | Señal de que el owner pide revisión |
| reviewed | boolean | NO | false | Revisión aprobada por Qoa |
| confirmed | boolean | NO | false | Confirmación operativa para ir a producción |
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
- `status = 'active'` requiere `ready_for_review = reviewed = confirmed = true`
- Cambios en `scope`, `tiers`, `policies`, `capture_mode` o `accumulation_type` reinician `reviewed` y `confirmed` a `false`

**Nota:** El scope de productos y stores se define en tablas relacionadas.

---

### campaign_brands

Tabla de relación N:M para definir qué brands participan en una campaña.

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

### campaign_products

Tabla de relación N:M para definir qué productos específicos participan en una campaña.

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| product_id | uuid | NO | - | FK → products(id) |

**Índices:**
- `campaign_products_pkey` PRIMARY KEY (campaign_id, product_id)

**Foreign Keys:**
- `campaign_products_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE
- `campaign_products_product_id_fkey` REFERENCES products(id) ON DELETE CASCADE

**Regla de negocio:**
- Si `campaign_products` está vacío, aplica a TODOS los productos de las brands seleccionadas

---

### campaign_store_types

Tabla para definir en qué tipos de stores aplica una campaña.

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| store_type | varchar(50) | NO | - | - |

**Índices:**
- `campaign_store_types_pkey` PRIMARY KEY (campaign_id, store_type)

**Foreign Keys:**
- `campaign_store_types_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE

**Regla de negocio:**
- Si `campaign_store_types` está vacío, aplica en CUALQUIER tipo de store

---

### campaign_code_sets

Lotes importados de códigos únicos vinculados a una campaña.

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| name | varchar(100) | NO | - | - |
| source | varchar(50) | YES | - | - |
| max_uses_per_code | integer | NO | 1 | CHECK (max_uses_per_code > 0) |
| metadata | jsonb | YES | '{}' | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `campaign_code_sets_pkey` PRIMARY KEY (id)
- `campaign_code_sets_campaign_id_idx` INDEX (campaign_id)

**Foreign Keys:**
- `campaign_code_sets_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE

---

### campaign_codes

Catálogo de códigos disponibles para captura.

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| code_set_id | uuid | NO | - | FK → campaign_code_sets(id) |
| code_value | varchar(120) | NO | - | UNIQUE por campaña |
| status | campaign_code_status | NO | 'available' | - |
| product_id | uuid | YES | - | FK → products(id) |
| max_uses | integer | NO | 1 | CHECK (max_uses > 0) |
| uses_count | integer | NO | 0 | CHECK (uses_count >= 0) |
| expires_at | timestamptz | YES | - | - |
| metadata | jsonb | YES | '{}' | - |
| created_at | timestamptz | NO | now() | - |
| updated_at | timestamptz | YES | - | - |

**Índices:**
- `campaign_codes_pkey` PRIMARY KEY (id)
- `campaign_codes_code_value_idx` UNIQUE (campaign_id, code_value)
- `campaign_codes_status_idx` INDEX (campaign_id, status, uses_count) WHERE status IN ('available','assigned')

**Foreign Keys:**
- `campaign_codes_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE
- `campaign_codes_code_set_id_fkey` REFERENCES campaign_code_sets(id) ON DELETE CASCADE
- `campaign_codes_product_id_fkey` REFERENCES products(id) ON DELETE SET NULL

**Reglas:**
- `uses_count <= max_uses`
- Al cambiar `status` a `redeemed` forzar `uses_count = max_uses`

---

### campaign_code_captures

Intentos de registro enviados por los usuarios (una fila por código capturado).

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| card_id | uuid | NO | - | FK → cards(id) |
| campaign_code_id | uuid | NO | - | FK → campaign_codes(id) |
| transaction_id | uuid | YES | - | FK → transactions(id) |
| status | code_capture_status | NO | 'pending' | - |
| rejection_reason | text | YES | - | - |
| metadata | jsonb | YES | '{}' | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `campaign_code_captures_pkey` PRIMARY KEY (id)
- `campaign_code_captures_campaign_code_id_idx` INDEX (campaign_code_id)
- `campaign_code_captures_card_id_idx` INDEX (card_id)

**Foreign Keys:**
- `campaign_code_captures_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE
- `campaign_code_captures_card_id_fkey` REFERENCES cards(id) ON DELETE CASCADE
- `campaign_code_captures_campaign_code_id_fkey` REFERENCES campaign_codes(id) ON DELETE CASCADE
- `campaign_code_captures_transaction_id_fkey` REFERENCES transactions(id) ON DELETE SET NULL

---

### campaign_tiers

Niveles de progresión dentro de una campaña (ej: Normal, Bronce, Plata, Oro).

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| name | varchar(100) | NO | - | - |
| threshold_value | integer | NO | - | CHECK (threshold_value >= 0) |
| threshold_type | threshold_type | NO | - | - |
| order | integer | NO | - | CHECK (order > 0) |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `campaign_tiers_pkey` PRIMARY KEY (id)
- `campaign_tiers_campaign_id_idx` INDEX (campaign_id)
- `campaign_tiers_campaign_order_key` UNIQUE (campaign_id, order)

**Foreign Keys:**
- `campaign_tiers_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE

**threshold_type:**
- `cumulative`: Acumulas y te quedas en el nivel (tiers permanentes)
- `per_period`: Se evalúa por período (ej: compras este mes)
- `reset_on_redeem`: Al canjear vuelve a 0 (tarjeta de sellos clásica)

---

### tier_benefits

Beneficios asociados a cada nivel. Un tier puede tener múltiples beneficios.

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| tier_id | uuid | NO | - | FK → campaign_tiers(id) |
| benefit_type | benefit_type | NO | - | - |
| config | jsonb | NO | '{}' | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `tier_benefits_pkey` PRIMARY KEY (id)
- `tier_benefits_tier_id_idx` INDEX (tier_id)

**Foreign Keys:**
- `tier_benefits_tier_id_fkey` REFERENCES campaign_tiers(id) ON DELETE CASCADE

**Ejemplos de config por tipo:**
- `discount`: `{"percent": 10}` o `{"fixed": 50}`
- `reward`: `{"reward_id": "uuid"}`
- `multiplier`: `{"factor": 2}` (2x puntos)
- `free_product`: `{"product_id": "uuid", "quantity": 1}`

---

### campaign_policies

Restricciones y reglas de acumulación con scope granular.

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| policy_type | policy_type | NO | - | - |
| scope_type | policy_scope_type | NO | 'campaign' | - |
| scope_id | uuid | YES | - | - |
| period | policy_period | NO | - | - |
| value | integer | NO | - | CHECK (value > 0) |
| config | jsonb | YES | - | - |
| active | boolean | NO | true | - |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `campaign_policies_pkey` PRIMARY KEY (id)
- `campaign_policies_campaign_id_idx` INDEX (campaign_id)
- `campaign_policies_active_idx` INDEX (campaign_id) WHERE active = true

**Foreign Keys:**
- `campaign_policies_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE

**Validaciones:**
- Si `scope_type = 'campaign'` entonces `scope_id` DEBE ser NULL
- Si `scope_type = 'brand'` entonces `scope_id` es FK a brands(id)
- Si `scope_type = 'product'` entonces `scope_id` es FK a products(id)

**Ejemplos de policies:**

| policy_type | scope_type | scope_id | period | value | Descripción |
|-------------|------------|----------|--------|-------|-------------|
| max_accumulations | campaign | null | day | 1 | Máx 1 acumulación/día |
| max_accumulations | product | prod_123 | day | 1 | Máx 1 del producto X/día |
| max_accumulations | brand | brand_456 | transaction | 2 | Máx 2 de marca Y/txn |
| min_amount | campaign | null | transaction | 50 | Compra mínima $50 |
| cooldown | campaign | null | day | 24 | Esperar 24h entre acumulaciones |

---

### cards

Tarjetas de lealtad de usuarios.

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| user_id | uuid | NO | - | FK → users(id) |
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| store_id | uuid | YES | - | FK → stores(id) |
| code | varchar(20) | NO | - | UNIQUE |
| current_tier_id | uuid | YES | - | FK → campaign_tiers(id) |
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
- `cards_current_tier_id_fkey` REFERENCES campaign_tiers(id) ON DELETE SET NULL

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
| product_id | uuid | NO | - | FK → products(id) |
| quantity | integer | NO | 1 | CHECK (quantity > 0) |
| amount | decimal(12,2) | YES | - | CHECK (amount >= 0) |
| metadata | jsonb | YES | '{}' | - |

**Índices:**
- `transaction_items_pkey` PRIMARY KEY (id)
- `transaction_items_transaction_id_idx` INDEX (transaction_id)
- `transaction_items_product_id_idx` INDEX (product_id)

**Foreign Keys:**
- `transaction_items_transaction_id_fkey` REFERENCES transactions(id) ON DELETE CASCADE
- `transaction_items_product_id_fkey` REFERENCES products(id) ON DELETE CASCADE

**Nota:** Referencia a `product_id` (no brand_id) para granularidad a nivel de SKU.

---

### accumulations

| Columna | Tipo | Nullable | Default | Constraints |
|---------|------|----------|---------|-------------|
| id | uuid | NO | uuid_generate_v7() | PK |
| transaction_item_id | uuid | YES | - | FK → transaction_items(id) |
| card_id | uuid | NO | - | FK → cards(id) |
| campaign_id | uuid | NO | - | FK → campaigns(id) |
| amount | integer | NO | - | CHECK (amount > 0) |
| source_type | accumulation_source_type | NO | - | - |
| code_capture_id | uuid | YES | - | FK → campaign_code_captures(id) |
| created_at | timestamptz | NO | now() | - |

**Índices:**
- `accumulations_pkey` PRIMARY KEY (id)
- `accumulations_card_id_idx` INDEX (card_id)
- `accumulations_transaction_item_id_idx` INDEX (transaction_item_id)

**Foreign Keys:**
- `accumulations_transaction_item_id_fkey` REFERENCES transaction_items(id) ON DELETE CASCADE
- `accumulations_card_id_fkey` REFERENCES cards(id) ON DELETE CASCADE
- `accumulations_campaign_id_fkey` REFERENCES campaigns(id) ON DELETE CASCADE
- `accumulations_code_capture_id_fkey` REFERENCES campaign_code_captures(id) ON DELETE SET NULL

**Reglas:**
- `transaction_item_id` es obligatorio cuando `source_type = 'transaction_item'`
- `code_capture_id` es obligatorio cuando `source_type = 'code_capture'`

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
