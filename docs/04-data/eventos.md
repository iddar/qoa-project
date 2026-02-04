# Eventos de Dominio

> Mapeo de eventos a tablas, triggers y handlers.

---

## Arquitectura de Eventos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUJO DE EVENTOS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐    INSERT     ┌──────────────┐    PUBLISH    ┌────────────┐  │
│   │ Comando  │──────────────▶│ outbox_events│──────────────▶│   Redis    │  │
│   │  (API)   │    (mismo tx) └──────────────┘  (Dispatcher) │  Streams   │  │
│   └──────────┘                                              └─────┬──────┘  │
│                                                                   │         │
│                                          XREADGROUP ┌─────────────┘         │
│                                                     ▼                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         Consumer Groups                             │   │
│   ├──────────────┬──────────────┬──────────────┬──────────────┬─────────┤   │
│   │  Notifier    │   Indexer    │   Webhooks   │   Analytics  │  Jobs   │   │
│   │  (WhatsApp)  │   (Search)   │   (External) │   (Metrics)  │ (Async) │   │
│   └──────────────┴──────────────┴──────────────┴──────────────┴─────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Nomenclatura de Eventos

**Patrón:** `{domain}.{entity}.{action}.v{version}`

| Parte | Descripción | Ejemplos |
|-------|-------------|----------|
| domain | Módulo de negocio | users, stores, campaigns, cards, transactions, rewards |
| entity | Entidad afectada | user, store, campaign, card, transaction, reward |
| action | Acción ocurrida | created, updated, activated, redeemed |
| version | Versión del schema | v1, v2 |

**Ejemplos:**
- `users.user.created.v1`
- `campaigns.threshold.reached.v1`
- `transactions.transaction.processed.v1`

---

## Catálogo de Eventos

### Dominio: Users

| Evento | Tabla Origen | Trigger | Descripción |
|--------|--------------|---------|-------------|
| `users.user.created.v1` | `users` | INSERT | Usuario registrado |
| `users.user.verified.v1` | `users` | UPDATE (verified_at) | Usuario verificó OTP |
| `users.user.updated.v1` | `users` | UPDATE | Perfil actualizado |

#### users.user.created.v1

**Emitido cuando:** Se registra un nuevo usuario

**Tabla origen:** `users`

**Payload:**
```json
{
  "metadata": {
    "eventId": "evt_abc123",
    "eventType": "users.user.created.v1",
    "version": "v1",
    "occurredAt": "2026-01-29T10:00:00Z",
    "traceId": "trace_xyz"
  },
  "data": {
    "userId": "usr_123",
    "phone": "+521234567890",
    "registeredVia": "qr_scan",
    "storeId": "sto_456"
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| notifier | Enviar mensaje de bienvenida vía WhatsApp | Alta |
| webhooks | Publicar a endpoints suscritos | Media |
| analytics | Incrementar contador de registros | Baja |

---

#### users.user.verified.v1

**Emitido cuando:** Usuario verifica OTP exitosamente

**Tabla origen:** `users`

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "userId": "usr_123",
    "channel": "whatsapp"
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| notifier | Enviar confirmación de verificación | Alta |
| webhooks | Publicar a endpoints suscritos | Media |

---

### Dominio: Stores

| Evento | Tabla Origen | Trigger | Descripción |
|--------|--------------|---------|-------------|
| `stores.store.created.v1` | `stores` | INSERT | Tienda creada |
| `stores.store.updated.v1` | `stores` | UPDATE | Tienda actualizada |

#### stores.store.created.v1

**Emitido cuando:** Se crea una nueva tienda

**Tabla origen:** `stores`

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "storeId": "sto_123",
    "name": "Abarrotes Don Pedro",
    "code": "DONPEDRO001"
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| jobs | Generar QR de la tienda | Alta |
| webhooks | Publicar a endpoints suscritos | Media |
| analytics | Registrar nueva tienda en métricas | Baja |

---

### Dominio: Campaigns

| Evento | Tabla Origen | Trigger | Descripción |
|--------|--------------|---------|-------------|
| `campaigns.campaign.created.v1` | `campaigns` | INSERT | Campaña creada |
| `campaigns.campaign.activated.v1` | `campaigns` | UPDATE (status → active) | Campaña activada |
| `campaigns.campaign.paused.v1` | `campaigns` | UPDATE (status → paused) | Campaña pausada |
| `campaigns.campaign.ended.v1` | `campaigns` | UPDATE (status → ended) | Campaña finalizada |
| `campaigns.threshold.reached.v1` | `balances` | UPDATE (current ≥ threshold) | Usuario alcanzó threshold (legacy) |
| `campaigns.tier.reached.v1` | `cards` | UPDATE (current_tier_id) | Usuario alcanzó nuevo tier |
| `campaigns.tier.reset.v1` | `cards` | Redemption con reset_on_redeem | Tier reseteado tras canje |

#### campaigns.campaign.created.v1

**Emitido cuando:** Se crea una nueva campaña

**Tabla origen:** `campaigns`

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "campaignId": "cmp_123",
    "cpgId": "cpg_456",
    "name": "Promo Verano 2026",
    "accumulationType": "stamps",
    "threshold": 10
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| webhooks | Publicar a endpoints suscritos | Media |
| analytics | Registrar nueva campaña | Baja |

---

#### campaigns.campaign.activated.v1

**Emitido cuando:** Una campaña pasa a estado activo

**Tabla origen:** `campaigns`

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "campaignId": "cmp_123",
    "previousStatus": "draft",
    "newStatus": "active",
    "reason": "manual_activation"
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| notifier | Notificar a tiendas participantes | Alta |
| webhooks | Publicar a endpoints suscritos | Media |
| jobs | Programar job de finalización si tiene ends_at | Media |

---

#### campaigns.threshold.reached.v1

**Emitido cuando:** El balance de una tarjeta alcanza o supera el threshold

**Tabla origen:** `balances` (derivado de evaluación post-transacción)

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "userId": "usr_123",
    "cardId": "crd_456",
    "campaignId": "cmp_789",
    "balance": 10,
    "threshold": 10,
    "canRedeem": true
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| notifier | Enviar notificación "¡Tienes una recompensa!" | Alta |
| webhooks | Publicar a endpoints suscritos | Media |

---

#### campaigns.tier.reached.v1

**Emitido cuando:** Un usuario alcanza un nuevo nivel (tier) en una campaña

**Tabla origen:** `cards` (actualización de current_tier_id)

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "userId": "usr_123",
    "cardId": "crd_456",
    "campaignId": "cmp_789",
    "previousTierId": "tier_001",
    "previousTierName": "Bronce",
    "newTierId": "tier_002",
    "newTierName": "Plata",
    "currentBalance": 500,
    "benefits": [
      {
        "type": "discount",
        "config": { "percent": 10 }
      },
      {
        "type": "multiplier",
        "config": { "factor": 1.5 }
      }
    ]
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| notifier | Enviar notificación "¡Subiste a nivel Plata!" | Alta |
| notifier | Informar sobre nuevos beneficios | Alta |
| webhooks | Publicar a endpoints suscritos | Media |
| analytics | Registrar progresión de tier | Baja |

---

#### campaigns.tier.reset.v1

**Emitido cuando:** El tier de un usuario se resetea tras un canje (mecánica reset_on_redeem)

**Tabla origen:** `cards` (post redemption con threshold_type = reset_on_redeem)

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "userId": "usr_123",
    "cardId": "crd_456",
    "campaignId": "cmp_789",
    "redemptionId": "rdm_012",
    "previousTierId": "tier_complete",
    "previousTierName": "Completa",
    "newTierId": "tier_progress",
    "newTierName": "En progreso",
    "previousBalance": 10,
    "newBalance": 0
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| notifier | Enviar mensaje "Tarjeta reiniciada, ¡sigue acumulando!" | Media |
| webhooks | Publicar a endpoints suscritos | Media |

---

### Dominio: Cards

| Evento | Tabla Origen | Trigger | Descripción |
|--------|--------------|---------|-------------|
| `cards.card.created.v1` | `cards` | INSERT | Tarjeta creada |
| `cards.card.balance_updated.v1` | `balances` | UPDATE | Balance cambió |

#### cards.card.created.v1

**Emitido cuando:** Se crea una nueva tarjeta de lealtad

**Tabla origen:** `cards`

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "cardId": "crd_123",
    "userId": "usr_456",
    "campaignId": "cmp_789",
    "storeId": "sto_012"
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| notifier | Enviar tarjeta digital vía WhatsApp | Alta |
| webhooks | Publicar a endpoints suscritos | Media |

---

#### cards.card.balance_updated.v1

**Emitido cuando:** El balance de una tarjeta cambia (acumulación o canje)

**Tabla origen:** `balances`

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "cardId": "crd_123",
    "userId": "usr_456",
    "previousBalance": 5,
    "newBalance": 8,
    "change": 3,
    "reason": "transaction",
    "transactionId": "txn_789"
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| notifier | Enviar notificación de acumulación | Media |
| webhooks | Publicar a endpoints suscritos | Media |
| analytics | Actualizar métricas de acumulación | Baja |

---

### Dominio: Transactions

| Evento | Tabla Origen | Trigger | Descripción |
|--------|--------------|---------|-------------|
| `transactions.transaction.created.v1` | `transactions` | INSERT | Transacción registrada |
| `transactions.transaction.processed.v1` | `accumulations` | Batch INSERT | Evaluación completada |

#### transactions.transaction.created.v1

**Emitido cuando:** Se registra una nueva transacción (compra)

**Tabla origen:** `transactions`

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "transactionId": "txn_123",
    "userId": "usr_456",
    "storeId": "sto_789",
    "storeType": "tiendita",
    "items": [
      {
        "productId": "prd_001",
        "sku": "FANTA-600ML",
        "brandId": "brd_001",
        "quantity": 2,
        "amount": 150.00
      }
    ],
    "totalAmount": 150.00
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| accumulator | Evaluar campañas, policies y calcular acumulaciones | **Crítica** |
| webhooks | Publicar a endpoints suscritos | Media |
| analytics | Registrar métricas de venta | Baja |

---

#### transactions.transaction.processed.v1

**Emitido cuando:** Se terminan de evaluar todas las campañas para una transacción

**Tabla origen:** `accumulations` (generado por handler de accumulator)

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "transactionId": "txn_123",
    "accumulations": [
      {
        "cardId": "crd_456",
        "campaignId": "cmp_789",
        "accumulated": 3,
        "newBalance": 8,
        "thresholdReached": false
      }
    ]
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| notifier | Enviar resumen de compra al usuario | Alta |
| webhooks | Publicar a endpoints suscritos | Media |

---

### Dominio: Rewards

| Evento | Tabla Origen | Trigger | Descripción |
|--------|--------------|---------|-------------|
| `rewards.reward.redeemed.v1` | `redemptions` | INSERT | Recompensa canjeada |

#### rewards.reward.redeemed.v1

**Emitido cuando:** Un usuario canjea una recompensa

**Tabla origen:** `redemptions`

**Payload:**
```json
{
  "metadata": { ... },
  "data": {
    "redemptionId": "rdm_123",
    "userId": "usr_456",
    "cardId": "crd_789",
    "campaignId": "cmp_012",
    "rewardId": "rwd_345",
    "rewardName": "Producto Gratis",
    "cost": 10,
    "previousBalance": 10,
    "newBalance": 0
  }
}
```

**Handlers:**

| Consumer Group | Acción | Prioridad |
|----------------|--------|-----------|
| notifier | Enviar código/voucher de canje | Alta |
| notifier | Notificar a tienda (si aplica) | Alta |
| webhooks | Publicar a endpoints suscritos | Media |
| analytics | Registrar métrica de canje | Baja |

---

## Flujos de Eventos

### Flujo: Registro de Usuario

```
Usuario escanea QR ─────────────────────────────────────────────────────────────
        │
        ▼
   ┌─────────────────┐
   │ POST /auth/otp  │
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐      ┌──────────────────────────────────────────────────┐
   │ INSERT users    │──────│ INSERT outbox_events (users.user.created.v1)     │
   └────────┬────────┘      └──────────────────────────────────────────────────┘
            │                                    │
            │                           Dispatcher publica
            │                                    │
            │                                    ▼
            │                            ┌─────────────┐
            │                            │ Redis Stream│
            │                            └──────┬──────┘
            │                                   │
            │                    ┌──────────────┼───────────┐
            │                    ▼              ▼           ▼
            │              ┌──────────┐  ┌──────────┐  ┌──────────┐
            │              │ notifier │  │ webhooks │  │ analytics│
            │              └────┬─────┘  └────┬─────┘  └────┬─────┘
            │                   │             │             │
            │                   ▼             ▼             ▼
            │              WhatsApp      External        Metrics
            │              welcome       endpoints       counter
            │
            ▼
   Usuario recibe OTP ──────────────────────────────────────────────────────────
```

---

### Flujo: Registro de Compra

```
Tendero escanea QR usuario ─────────────────────────────────────────────────────
             │
             ▼
   ┌──────────────────────┐
   │ POST /transactions   │
   └───────────┬──────────┘
               │
               ▼
   ┌──────────────────────┐      ┌──────────────────────────────────────────────┐
   │ INSERT transactions  │──────│ INSERT outbox_events                         │
   │ INSERT trans_items   │      │   (transactions.transaction.created.v1)      │
   │  (con product_id)    │      └──────────────────────────────────────────────┘
   └───────────┬──────────┘                        │
               │                           Dispatcher publica
               │                                    │
               │                                    ▼
               │                             ┌─────────────┐
               │                             │ Redis Stream│
               │                             └──────┬──────┘
               │                                    │
               │                      ┌─────────────┼─────────────┐
               │                      ▼             │             ▼
               │               ┌─────────────┐      │      ┌──────────┐
               │               │ accumulator │      │      │ webhooks │
               │               └──────┬──────┘      │      └──────────┘
               │                      │             │
               │     1. Evalúa campañas por scope   │
               │        (products, brands, stores)  │
               │     2. Evalúa policies             │
               │        (límites, montos mínimos)   │
               │     3. Calcula acumulación         │
               │     4. Evalúa tiers                │
               │                      │             │
               │                      ▼             │
               │         ┌────────────────────┐     │
               │         │ INSERT accumulations│    │
               │         │ UPDATE balances     │    │
               │         │ UPDATE cards.tier   │    │
               │         │ INSERT outbox_events│    │
               │         │  - balance_updated  │    │
               │         │  - tier_reached     │    │
               │         │  - txn_processed    │    │
               │         └─────────┬──────────┘     │
               │                   │                │
               │                   ▼                ▼
               │            Más eventos publicados
               │                   │
               │         ┌─────────┼─────────┐
               │         ▼         ▼         ▼
               │   ┌──────────┐ ┌───────┐ ┌──────────┐
               │   │ notifier │ │notif. │ │ notifier │
               │   │ (balance)│ │(tier) │ │(resumen) │
               │   └────┬─────┘ └───┬───┘ └────┬─────┘
               │        │           │          │
               │        ▼           ▼          ▼
               │   "Acumulaste   "¡Subiste   "Resumen
               │    3 puntos"    a Plata!"   de compra"
               │
               ▼
   Compra completada ───────────────────────────────────────────────────────────
```

---

### Flujo: Canje de Recompensa

```
Usuario solicita canje ─────────────────────────────────────────────────────────
        │
        ▼
   ┌──────────────────────┐
   │ POST /redemptions    │
   └───────────┬──────────┘
               │
               ▼
   ┌──────────────────────┐
   │ Validaciones:        │
   │ - Balance suficiente │
   │ - Reward disponible  │
   │ - Dentro de vigencia │
   └───────────┬──────────┘
               │
               ▼
   ┌──────────────────────┐      ┌──────────────────────────────────────────────┐
   │ INSERT redemptions   │──────│ INSERT outbox_events                         │
   │ UPDATE balances      │      │   (rewards.reward.redeemed.v1)               │
   │ UPDATE rewards.stock │      │   (cards.card.balance_updated.v1)            │
   └───────────┬──────────┘      └──────────────────────────────────────────────┘
               │                                    │
               │                           Dispatcher publica
               │                                    │
               │                                    ▼
               │                             ┌─────────────┐
               │                             │ Redis Stream│
               │                             └──────┬──────┘
               │                                    │
               │                      ┌─────────────┼─────────────┐
               │                      ▼             ▼             ▼
               │               ┌──────────┐  ┌──────────┐  ┌──────────┐
               │               │ notifier │  │ notifier │  │ webhooks │
               │               │ (usuario)│  │ (tienda) │  └──────────┘
               │               └────┬─────┘  └────┬─────┘
               │                    │             │
               │                    ▼             ▼
               │              "Tu código:   "Canje pendiente
               │               ABC123"       de cliente"
               │
               ▼
   Canje confirmado ────────────────────────────────────────────────────────────
```

---

## Consumer Groups

### notifier

**Propósito:** Enviar notificaciones a usuarios vía WhatsApp/SMS

**Eventos que consume:**
- `users.user.created.v1` → Mensaje de bienvenida
- `users.user.verified.v1` → Confirmación de verificación
- `cards.card.created.v1` → Enviar tarjeta digital
- `cards.card.balance_updated.v1` → Notificar acumulación
- `campaigns.threshold.reached.v1` → "¡Tienes una recompensa!" (legacy)
- `campaigns.tier.reached.v1` → "¡Subiste a nivel X!" + beneficios
- `campaigns.tier.reset.v1` → "Tarjeta reiniciada, ¡sigue acumulando!"
- `transactions.transaction.processed.v1` → Resumen de compra
- `rewards.reward.redeemed.v1` → Código de canje

**Configuración:**
- Reintentos: 3
- Backoff: Exponencial (1s, 5s, 30s)
- Dead letter: `notifier.dlq`

---

### accumulator

**Propósito:** Evaluar campañas, policies y calcular acumulaciones para transacciones

**Eventos que consume:**
- `transactions.transaction.created.v1` → Procesar acumulación

**Lógica:**
1. Obtener items de la transacción (con product → brand → cpg)
2. Identificar campañas activas por scope:
   - Verificar CPG del producto
   - Verificar scope de brands (campaign_brands)
   - Verificar scope de products (campaign_products)
   - Verificar scope de store types (campaign_store_types)
3. Por cada campaña aplicable, evaluar policies:
   - Verificar max_accumulations por período
   - Verificar min_amount, min_quantity
   - Verificar cooldowns
   - Si viola alguna policy → SKIP campaña
4. Calcular puntos/estampas según tipo de acumulación
5. Insertar accumulations, actualizar balances
6. Evaluar tiers:
   - Calcular tier actual según balance y threshold_type
   - Si subió de tier → emitir `campaigns.tier.reached.v1`
7. Emitir eventos derivados (balance_updated, threshold_reached)

**Configuración:**
- Reintentos: 5 (crítico)
- Backoff: Lineal (1s, 2s, 3s, 4s, 5s)
- Dead letter: `accumulator.dlq` (requiere intervención manual)

---

### webhooks

**Propósito:** Publicar eventos a endpoints externos registrados

**Eventos que consume:** Todos los eventos configurados por cada webhook endpoint

**Lógica:**
1. Filtrar endpoints por event_types
2. Crear webhook_deliveries para cada endpoint
3. Firmar payload con HMAC-SHA256
4. Enviar HTTP POST
5. Registrar respuesta/error

**Configuración:**
- Reintentos: 5
- Backoff: Exponencial (30s, 2m, 10m, 1h, 4h)
- Timeout por request: 30s

---

### analytics

**Propósito:** Actualizar contadores y métricas en tiempo real

**Eventos que consume:**
- `users.user.created.v1` → Contador de registros
- `stores.store.created.v1` → Contador de tiendas
- `transactions.transaction.created.v1` → Volumen de transacciones
- `cards.card.balance_updated.v1` → Métricas de acumulación
- `rewards.reward.redeemed.v1` → Métricas de canje

**Configuración:**
- Reintentos: 1 (no crítico)
- Puede perder eventos sin afectar negocio

---

### jobs

**Propósito:** Programar tareas asíncronas derivadas de eventos

**Eventos que consume:**
- `stores.store.created.v1` → Generar QR
- `campaigns.campaign.activated.v1` → Programar finalización
- `campaigns.campaign.ended.v1` → Limpiar recursos

**Configuración:**
- Reintentos: 3
- Backoff: Exponencial

---

## Idempotencia

### Tabla processed_events

Todos los handlers verifican idempotencia antes de procesar:

```sql
INSERT INTO processed_events (event_id, consumer_group, processed_at)
VALUES ($1, $2, now())
ON CONFLICT (event_id, consumer_group) DO NOTHING
RETURNING event_id;
```

- Si retorna el event_id → Procesar
- Si no retorna nada → Evento ya procesado, ACK y continuar

---

## Monitoreo de Eventos

### Métricas clave

| Métrica | Descripción | Alerta si |
|---------|-------------|-----------|
| `events.published` | Eventos publicados por tipo | - |
| `events.consumed` | Eventos consumidos por consumer | - |
| `events.lag` | Pendientes por consumer group | > 1000 |
| `events.retries` | Reintentos por consumer | > 100/min |
| `events.dlq` | Eventos en dead letter | > 0 |

### Queries de diagnóstico

```sql
-- Eventos pendientes en outbox
SELECT event_type, COUNT(*), MIN(created_at)
FROM outbox_events
WHERE status = 'pending'
GROUP BY event_type;

-- Eventos con más reintentos
SELECT event_type, COUNT(*)
FROM outbox_events
WHERE attempts > 1
GROUP BY event_type
ORDER BY COUNT(*) DESC;

-- Consumer lag (eventos no procesados)
SELECT consumer_group, COUNT(*)
FROM outbox_events oe
WHERE NOT EXISTS (
  SELECT 1 FROM processed_events pe
  WHERE pe.event_id = oe.id
)
GROUP BY consumer_group;
```

---

## Versionado de Eventos

### Estrategia

1. **Backward compatible:** Agregar campos opcionales al payload
2. **Breaking change:** Crear nueva versión (v2)
3. **Deprecation:** Mantener ambas versiones por 3 meses

### Ejemplo de migración

```
v1: { userId, phone }
v2: { userId, phone, email, preferences }

-- Durante migración, publicar ambos:
INSERT INTO outbox_events (event_type, payload)
VALUES
  ('users.user.created.v1', $v1_payload),
  ('users.user.created.v2', $v2_payload);
```

---

## Referencias

- [ADR-0004: Mensajería](../adr/0004-mensajeria.md)
- [ADR-0009: Stack de Implementación](../adr/0009-stack-implementacion.md)
- [AsyncAPI](../03-apis/asyncapi.yaml)
- [Diccionario de Datos](./diccionario.md)
