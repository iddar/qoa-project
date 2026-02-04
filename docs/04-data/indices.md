# Índices para Performance

> Estrategia de indexación para consultas frecuentes.

---

## Principios

1. **Índices para FKs**: Todas las foreign keys tienen índice
2. **Índices parciales**: Usar WHERE cuando aplique (ej: status = 'active')
3. **Índices compuestos**: Ordenar columnas de mayor a menor cardinalidad
4. **Evitar sobre-indexación**: Cada índice tiene costo en escrituras

---

## Consultas frecuentes y sus índices

### Autenticación

**Buscar usuario por teléfono**
```sql
SELECT * FROM users WHERE phone = $1;
```
- Índice: `users_phone_key` UNIQUE (phone) ✅ Ya existe

**Buscar API key por hash**
```sql
SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL;
```
```sql
CREATE INDEX api_keys_key_hash_active_idx
ON api_keys (key_hash)
WHERE revoked_at IS NULL;
```

---

### Productos (Jerarquía)

**Productos de una brand**
```sql
SELECT * FROM products
WHERE brand_id = $1 AND status = 'active';
```
```sql
CREATE INDEX products_brand_active_idx
ON products (brand_id)
WHERE status = 'active';
```

**Buscar producto por SKU**
```sql
SELECT * FROM products WHERE sku = $1;
```
- Índice: `products_sku_idx` UNIQUE (sku) ✅ Ya existe

**Obtener jerarquía completa (product → brand → cpg)**
```sql
SELECT p.*, b.name as brand_name, b.cpg_id, c.name as cpg_name
FROM products p
JOIN brands b ON b.id = p.brand_id
JOIN cpgs c ON c.id = b.cpg_id
WHERE p.id = $1;
```
- Índice: `products_pkey` PRIMARY KEY ✅ Ya existe

---

### Stores

**Stores por tipo**
```sql
SELECT * FROM stores
WHERE type = $1 AND status = 'active';
```
```sql
CREATE INDEX stores_type_active_idx
ON stores (type)
WHERE status = 'active' AND type IS NOT NULL;
```

---

### Tarjetas del usuario (Wallet)

**Listar tarjetas activas de un usuario**
```sql
SELECT c.*, b.current, camp.name, ct.name as tier_name
FROM cards c
JOIN balances b ON b.card_id = c.id
JOIN campaigns camp ON camp.id = c.campaign_id
LEFT JOIN campaign_tiers ct ON ct.id = c.current_tier_id
WHERE c.user_id = $1 AND c.status = 'active';
```
```sql
CREATE INDEX cards_user_active_idx
ON cards (user_id)
WHERE status = 'active';
```

---

### Transacciones

**Transacciones de un usuario (historial)**
```sql
SELECT * FROM transactions
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 20;
```
```sql
CREATE INDEX transactions_user_created_idx
ON transactions (user_id, created_at DESC);
```

**Transacciones de una tienda (dashboard)**
```sql
SELECT * FROM transactions
WHERE store_id = $1
AND created_at >= $2 AND created_at < $3
ORDER BY created_at DESC;
```
```sql
CREATE INDEX transactions_store_created_idx
ON transactions (store_id, created_at DESC);
```

**Items de una transacción con productos**
```sql
SELECT ti.*, p.name as product_name, p.sku, b.name as brand_name
FROM transaction_items ti
JOIN products p ON p.id = ti.product_id
JOIN brands b ON b.id = p.brand_id
WHERE ti.transaction_id = $1;
```
- Índice: `transaction_items_transaction_id_idx` ✅ Ya existe

---

### Campañas

**Campañas activas de un CPG**
```sql
SELECT * FROM campaigns
WHERE cpg_id = $1
AND status = 'active'
AND starts_at <= now()
AND (ends_at IS NULL OR ends_at >= now());
```
```sql
CREATE INDEX campaigns_cpg_active_idx
ON campaigns (cpg_id, starts_at)
WHERE status = 'active';
```

**Campañas activas para evaluación de transacción**
```sql
-- Obtener campañas que aplican para un producto específico
SELECT c.* FROM campaigns c
WHERE c.status = 'active'
AND c.starts_at <= $1
AND (c.ends_at IS NULL OR c.ends_at >= $1)
AND c.cpg_id = (SELECT cpg_id FROM brands WHERE id = (SELECT brand_id FROM products WHERE id = $2))
AND (
  -- Sin restricción de brands (aplica a todo el CPG)
  NOT EXISTS (SELECT 1 FROM campaign_brands cb WHERE cb.campaign_id = c.id)
  OR
  -- O la brand del producto está en el scope
  EXISTS (SELECT 1 FROM campaign_brands cb
          WHERE cb.campaign_id = c.id
          AND cb.brand_id = (SELECT brand_id FROM products WHERE id = $2))
)
AND (
  -- Sin restricción de productos (aplica a todos)
  NOT EXISTS (SELECT 1 FROM campaign_products cp WHERE cp.campaign_id = c.id)
  OR
  -- O el producto está en el scope
  EXISTS (SELECT 1 FROM campaign_products cp
          WHERE cp.campaign_id = c.id AND cp.product_id = $2)
);
```
```sql
-- Índices de soporte para scope de campañas
CREATE INDEX campaign_brands_brand_id_idx ON campaign_brands (brand_id);
CREATE INDEX campaign_products_product_id_idx ON campaign_products (product_id);
CREATE INDEX campaign_store_types_store_type_idx ON campaign_store_types (store_type);
```

**Verificar si store type aplica a campaña**
```sql
SELECT EXISTS (
  SELECT 1 FROM campaign_store_types
  WHERE campaign_id = $1 AND store_type = $2
) OR NOT EXISTS (
  SELECT 1 FROM campaign_store_types WHERE campaign_id = $1
);
```
- Índice: `campaign_store_types_pkey` PRIMARY KEY ✅ Ya existe

---

### Campaign Tiers

**Tiers de una campaña (ordenados)**
```sql
SELECT ct.*,
  (SELECT json_agg(tb.*) FROM tier_benefits tb WHERE tb.tier_id = ct.id) as benefits
FROM campaign_tiers ct
WHERE ct.campaign_id = $1
ORDER BY ct.order;
```
```sql
CREATE INDEX campaign_tiers_campaign_order_idx
ON campaign_tiers (campaign_id, "order");
```

**Calcular tier actual según balance**
```sql
SELECT * FROM campaign_tiers
WHERE campaign_id = $1 AND threshold_value <= $2
ORDER BY threshold_value DESC
LIMIT 1;
```
```sql
CREATE INDEX campaign_tiers_campaign_threshold_idx
ON campaign_tiers (campaign_id, threshold_value DESC);
```

---

### Campaign Policies

**Policies activas de una campaña**
```sql
SELECT * FROM campaign_policies
WHERE campaign_id = $1 AND active = true;
```
```sql
CREATE INDEX campaign_policies_campaign_active_idx
ON campaign_policies (campaign_id)
WHERE active = true;
```

**Evaluar policy por scope**
```sql
-- Verificar si una acumulación viola alguna policy
SELECT * FROM campaign_policies
WHERE campaign_id = $1
AND active = true
AND (
  -- Policies a nivel campaña
  (scope_type = 'campaign')
  OR
  -- Policies a nivel brand
  (scope_type = 'brand' AND scope_id = $2)
  OR
  -- Policies a nivel product
  (scope_type = 'product' AND scope_id = $3)
);
```
```sql
CREATE INDEX campaign_policies_scope_idx
ON campaign_policies (campaign_id, scope_type, scope_id)
WHERE active = true;
```

**Contar acumulaciones para verificar límites**
```sql
-- Acumulaciones de un usuario para una campaña en un período
SELECT COUNT(*) FROM accumulations a
JOIN transaction_items ti ON ti.id = a.transaction_item_id
JOIN transactions t ON t.id = ti.transaction_id
WHERE a.card_id = $1
AND a.campaign_id = $2
AND t.created_at >= $3 AND t.created_at < $4;
```
```sql
CREATE INDEX accumulations_card_campaign_idx
ON accumulations (card_id, campaign_id);
```

---

### Acumulaciones

**Balance de una tarjeta**
```sql
SELECT * FROM balances WHERE card_id = $1;
```
- Índice: `balances_card_id_key` UNIQUE (card_id) ✅ Ya existe

**Historial de acumulaciones de una tarjeta**
```sql
SELECT a.*, ti.product_id, p.name as product_name, t.created_at
FROM accumulations a
JOIN transaction_items ti ON ti.id = a.transaction_item_id
JOIN products p ON p.id = ti.product_id
JOIN transactions t ON t.id = ti.transaction_id
WHERE a.card_id = $1
ORDER BY a.created_at DESC;
```
```sql
CREATE INDEX accumulations_card_created_idx
ON accumulations (card_id, created_at DESC);
```

---

### Rewards y Canjes

**Rewards disponibles de una campaña**
```sql
SELECT * FROM rewards
WHERE campaign_id = $1
AND status = 'active'
AND (stock IS NULL OR stock > 0);
```
```sql
CREATE INDEX rewards_campaign_available_idx
ON rewards (campaign_id)
WHERE status = 'active';
```

**Canjes de una tarjeta**
```sql
SELECT * FROM redemptions
WHERE card_id = $1
ORDER BY created_at DESC;
```
```sql
CREATE INDEX redemptions_card_created_idx
ON redemptions (card_id, created_at DESC);
```

---

### Jobs y Eventos (Infraestructura)

**Eventos pendientes de publicar**
```sql
SELECT * FROM outbox_events
WHERE status = 'pending'
AND available_at <= now()
ORDER BY available_at
LIMIT 100
FOR UPDATE SKIP LOCKED;
```
```sql
CREATE INDEX outbox_events_pending_available_idx
ON outbox_events (available_at)
WHERE status = 'pending';
```

**Jobs pendientes de ejecutar**
```sql
SELECT * FROM jobs
WHERE status = 'pending'
AND run_at <= now()
ORDER BY run_at
LIMIT 50
FOR UPDATE SKIP LOCKED;
```
```sql
CREATE INDEX jobs_pending_run_idx
ON jobs (run_at)
WHERE status = 'pending';
```

**Webhook deliveries pendientes**
```sql
SELECT * FROM webhook_deliveries
WHERE status = 'pending'
AND next_retry_at <= now()
ORDER BY next_retry_at
LIMIT 100;
```
```sql
CREATE INDEX webhook_deliveries_pending_retry_idx
ON webhook_deliveries (next_retry_at)
WHERE status = 'pending';
```

---

## Resumen de índices

### Tablas de negocio

| Tabla | Índice | Columnas | Condición |
|-------|--------|----------|-----------|
| users | users_phone_key | phone | UNIQUE |
| users | users_email_key | email | UNIQUE, WHERE NOT NULL |
| products | products_sku_idx | sku | UNIQUE |
| products | products_brand_active_idx | brand_id | WHERE status = 'active' |
| stores | stores_type_active_idx | type | WHERE status = 'active' |
| cards | cards_user_active_idx | user_id | WHERE status = 'active' |
| cards | cards_code_key | code | UNIQUE |
| transactions | transactions_user_created_idx | user_id, created_at DESC | - |
| transactions | transactions_store_created_idx | store_id, created_at DESC | - |
| campaigns | campaigns_cpg_active_idx | cpg_id, starts_at | WHERE status = 'active' |
| campaign_brands | campaign_brands_brand_id_idx | brand_id | - |
| campaign_products | campaign_products_product_id_idx | product_id | - |
| campaign_store_types | campaign_store_types_store_type_idx | store_type | - |
| campaign_tiers | campaign_tiers_campaign_order_idx | campaign_id, order | - |
| campaign_tiers | campaign_tiers_campaign_threshold_idx | campaign_id, threshold_value DESC | - |
| campaign_policies | campaign_policies_campaign_active_idx | campaign_id | WHERE active = true |
| campaign_policies | campaign_policies_scope_idx | campaign_id, scope_type, scope_id | WHERE active = true |
| accumulations | accumulations_card_created_idx | card_id, created_at DESC | - |
| accumulations | accumulations_card_campaign_idx | card_id, campaign_id | - |
| rewards | rewards_campaign_available_idx | campaign_id | WHERE status = 'active' |
| redemptions | redemptions_card_created_idx | card_id, created_at DESC | - |

### Tablas de infraestructura

| Tabla | Índice | Columnas | Condición |
|-------|--------|----------|-----------|
| api_keys | api_keys_key_hash_active_idx | key_hash | WHERE revoked_at IS NULL |
| outbox_events | outbox_events_pending_available_idx | available_at | WHERE status = 'pending' |
| jobs | jobs_pending_run_idx | run_at | WHERE status = 'pending' |
| webhook_deliveries | webhook_deliveries_pending_retry_idx | next_retry_at | WHERE status = 'pending' |

---

## Consideraciones

### Para tablas con alto volumen de escritura

- `transactions`: Considerar particionamiento por fecha si crece mucho
- `accumulations`: Particionamiento por fecha
- `outbox_events`: Limpieza periódica de eventos publicados

### Monitoreo

Queries para identificar índices faltantes:

```sql
-- Índices no utilizados
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0;

-- Tablas con muchos seq scans
SELECT schemaname, relname, seq_scan, idx_scan
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan * 10;
```

### Mantenimiento

```sql
-- Reindex periódico para tablas con muchas actualizaciones
REINDEX TABLE outbox_events;
REINDEX TABLE jobs;

-- Vacuum para recuperar espacio
VACUUM ANALYZE transactions;
```
