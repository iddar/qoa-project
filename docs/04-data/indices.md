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

### Tarjetas del usuario (Wallet)

**Listar tarjetas activas de un usuario**
```sql
SELECT c.*, b.current, camp.name
FROM cards c
JOIN balances b ON b.card_id = c.id
JOIN campaigns camp ON camp.id = c.campaign_id
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
SELECT c.* FROM campaigns c
WHERE c.status = 'active'
AND c.starts_at <= $1
AND (c.ends_at IS NULL OR c.ends_at >= $1)
AND c.cpg_id IN (SELECT cpg_id FROM brands WHERE id = $2);
```
```sql
-- El índice campaigns_cpg_active_idx ayuda aquí
-- Además, índice en brands:
CREATE INDEX brands_cpg_status_idx
ON brands (cpg_id)
WHERE status = 'active';
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
SELECT a.*, ti.brand_id, t.created_at
FROM accumulations a
JOIN transaction_items ti ON ti.id = a.transaction_item_id
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
| cards | cards_user_active_idx | user_id | WHERE status = 'active' |
| cards | cards_code_key | code | UNIQUE |
| transactions | transactions_user_created_idx | user_id, created_at DESC | - |
| transactions | transactions_store_created_idx | store_id, created_at DESC | - |
| campaigns | campaigns_cpg_active_idx | cpg_id, starts_at | WHERE status = 'active' |
| brands | brands_cpg_status_idx | cpg_id | WHERE status = 'active' |
| accumulations | accumulations_card_created_idx | card_id, created_at DESC | - |
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
