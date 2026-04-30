# Plan tecnico backend + DB - mejoras de auditoria

## Resumen

Plan para aplicar los hallazgos de `backend-db-audit-2026-04-29.md` sobre una rama nueva basada en `origin/main`. La implementacion debe priorizar consistencia transaccional, seguridad de auth y performance DB sin cambiar contratos publicos salvo donde se indique.

Base revisada:
- `origin/main`: `377b3cd` - merge PR #48.
- Commits recientes relevantes: `ca68cdc` arreglo de tests/e2e, `fc89849` wallet QR/POS purchase flow, `8414314` perfil de wallet.

## Fase 1 - Consistencia critica

1. **Balances y acumulaciones atomicas**
   - Envolver creacion de transaccion, items, acumulaciones, balances, check-in matching y tier evaluation en una transaccion DB unica.
   - Cambiar escrituras de `balances` y `campaign_balances` a incrementos atomicos o upsert con `on conflict`.
   - Hacer que `evaluateCardTier`, `touchStoreCpgRelations` e `isStoreParticipatingInCampaign` acepten `database: Database = db` para recibir `tx`.
   - Mantener la respuesta actual de `POST /transactions` y `POST /stores/:storeId/transactions`.

2. **Rewards redeem atomico**
   - Ejecutar validacion, descuento de balance, decremento de stock e insercion de redencion dentro de `db.transaction`.
   - Agregar unique index para evitar doble redencion por `(card_id, reward_id)`.
   - Usar updates condicionales para stock y saldo (`stock > 0`, `current >= cost`) y mapear conflictos a errores existentes.

3. **Wallet universal sin duplicados**
   - Agregar indice parcial unico para `cards(user_id, campaign_id) where store_id is null`.
   - Separar unicidad de tarjetas por tienda con indice parcial para `store_id is not null` si se requiere mantener ese caso.
   - Cambiar `ensureUserUniversalWalletCard` a upsert/idempotencia DB.

4. **JWT secret production-safe**
   - Requerir `JWT_SECRET` cuando `NODE_ENV=production`.
   - Mantener fallback `dev-secret` solo en dev/test.
   - Actualizar env examples y runbook de despliegue.

## Fase 2 - Hardening operativo

1. **Refresh token rotation**
   - Reemplazar select + update + insert por revocacion atomica con `update ... returning`.
   - Agregar prueba concurrente para dos refresh simultaneos.

2. **Notificaciones idempotentes**
   - Crear tabla `notification_deliveries` con `notification_key`, `channel`, `recipient`, `provider_message_id`, `status`, timestamps y unique index en `notification_key`.
   - Cambiar `customer-notifications` para consultar/crear esa tabla en lugar de `payload LIKE`.
   - Mantener `whatsapp_messages` como auditoria del proveedor.

3. **Rate limit de API keys**
   - Implementar enforcement de `api_keys.rate_limit` por API key y ventana configurable.
   - Para MVP puede ser in-memory por instancia; para produccion debe quedar preparado para Redis/Postgres.
   - Responder `429` con `Retry-After`.

## Fase 3 - Indices y queries

1. **Migraciones de indices compuestos**
   - `transactions(store_id, created_at desc, id desc)`.
   - `transactions(user_id, created_at desc, id desc)`.
   - `store_checkins(store_id, status, expires_at, checked_in_at)`.
   - `store_checkins(user_id, store_id, status, expires_at, checked_in_at)`.
   - `whatsapp_messages(status, received_at desc, id desc)` y revisar si tambien conviene `received_at desc, id desc`.
   - `reminder_jobs(status, scheduled_for)` y `reminder_jobs(status, created_at desc, id desc)`.
   - `accumulations(campaign_id, created_at)` y `redemptions(reward_id, created_at)`.

2. **List queries**
   - Reemplazar `or(...ids.map())` por `inArray` o SQL `= any(...)` en listas de ids.
   - Validar con `EXPLAIN (ANALYZE, BUFFERS)` en staging antes/despues si hay datos suficientes.

## Fase 4 - Deuda tecnica controlada

1. **Tipado**
   - Reducir `src/types/external.d.ts` y usar tipos reales de Elysia/Drizzle/Eden.
   - Eliminar `as any` y `ts-ignore` con helpers typed o division de cadenas Elysia grandes.

2. **Modulos grandes**
   - Extraer logica de dominio en servicios chicos: `transaction-ledger`, `reward-redemption`, `campaign-eligibility`, `store-inventory-sale`, `notification-delivery`.
   - No mover rutas HTTP sin tests de contrato.

3. **Frontend contract cleanup**
   - Eliminar casts Eden en CPG portal.
   - Limpiar warnings de hooks/unused en apps sin cambiar UX.

## Pruebas requeridas

- Backend:
  - `bun run lint`
  - `bun run typecheck`
  - `bun --env-file=.env.test test spec/auth.spec.ts spec/stores.spec.ts spec/transactions.spec.ts spec/rewards.spec.ts`
  - `bun --env-file=.env.test test spec/store-checkin.spec.ts spec/whatsapp.spec.ts spec/jobs.spec.ts spec/users-me.spec.ts`
- Nuevas pruebas:
  - Concurrencia de transacciones: dos compras simultaneas suman ambos balances.
  - Concurrencia de rewards: un solo canje gana con stock 1.
  - Concurrencia wallet: multiples ensures crean una sola tarjeta universal.
  - Refresh token replay: una de dos rotaciones simultaneas falla.
  - API key rate limit: segunda request dentro de ventana devuelve `429`.
  - Notificacion: `notification_key` evita duplicado sin usar `LIKE`.

## Criterios de aceptacion

- No hay cambios regresivos en contratos de respuesta actuales.
- No hay perdida de puntos bajo concurrencia de transacciones.
- No hay doble canje ni stock negativo en rewards.
- No se puede arrancar produccion sin `JWT_SECRET`.
- Indices nuevos se agregan via migracion Drizzle y quedan reflejados en snapshots.
- El PR de implementacion incluye medicion o `EXPLAIN` para indices si staging tiene volumen util.
