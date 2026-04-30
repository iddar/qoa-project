# Auditoria backend + DB - 2026-04-29

## Resumen ejecutivo

Auditoria estatica y con pruebas selectivas sobre el backend Elysia/Drizzle y PostgreSQL. No se modifico codigo funcional; el unico cambio de este trabajo es este reporte.

Resultado general: los flujos principales tienen buena cobertura y las pruebas selectivas pasan, pero hay riesgos importantes de concurrencia, atomicidad e indexacion. Los hallazgos mas relevantes estan en acumulacion de balances, canje de recompensas, creacion de wallet universal, uso mixto de transacciones DB y configuracion de secretos.

Base revisada para este reporte: `origin/main` en `377b3cd` (`Merge pull request #48 from iddar/codex/corrige-tests-lint-y-e2e`). Los ultimos cambios revisados incluyen `ca68cdc` (`Fix tests and e2e flow across platform apps`) y `fc89849` (`Fix wallet QR and POS purchase flow`).

## Experimentos ejecutados

| Experimento | Resultado |
| --- | --- |
| `bun run lint` en `src` antes de instalar dependencias | Fallo por binario faltante `oxlint-tsgolint` en este worktree. |
| `bun run typecheck` en `src` antes de instalar dependencias | Fallo por `tsc: command not found` en este worktree. |
| `bun install --frozen-lockfile` en raiz | Exitoso. Instalo dependencias locales sin cambiar `bun.lock` ni archivos versionados. |
| `bun run lint` en `src` | Exitoso: 0 warnings, 0 errors. |
| `bun run typecheck` en `src` | Exitoso. |
| `bun run lint` en apps | Exitoso con warnings: backoffice 1, cpg-portal 1, digital-wallet 0, store-dashboard 15. |
| `bun --env-file=.env.test test spec/auth.spec.ts spec/stores.spec.ts spec/transactions.spec.ts spec/rewards.spec.ts` | Exitoso: 28 pass, 0 fail. |
| `bun --env-file=.env.test test spec/store-checkin.spec.ts spec/whatsapp.spec.ts spec/jobs.spec.ts spec/users-me.spec.ts` | Exitoso: 23 pass, 0 fail. |

## Hallazgos priorizados

| ID | Severidad | Area | Hallazgo |
| --- | --- | --- | --- |
| H-001 | P1 | Transacciones / puntos | Riesgo de perdida de puntos por actualizaciones absolutas de balance sin lock ni incremento atomico. |
| H-002 | P1 | Rewards | Canje de recompensas no es atomico; puede duplicar canjes o sobrepasar stock bajo concurrencia. |
| H-003 | P1 | Wallet/cards | La unicidad de tarjeta universal no protege `store_id IS NULL`; llamadas concurrentes pueden crear multiples tarjetas universales. |
| H-004 | P1 | Seguridad | `JWT_SECRET` cae a `dev-secret` si falta env var; en produccion esto seria secreto predecible. |
| H-005 | P2 | DB transaccional | Servicios llamados dentro de transacciones usan `db` global y quedan fuera del `tx`. |
| H-006 | P2 | Auth | Rotacion de refresh token no es atomica; dos requests simultaneos pueden emitir dos refresh tokens. |
| H-007 | P2 | Notificaciones | Idempotencia de notificaciones usa `LIKE` sobre payload texto; es lenta y puede dar falsos positivos. |
| H-008 | P2 | API keys | Campo `rate_limit` existe, pero no se aplica rate limiting para API keys. |
| H-009 | P2 | DB performance | Faltan indices compuestos para filtros + ordenamientos frecuentes. |
| H-010 | P3 | Tipado / mantenibilidad | Tipos manuales de Elysia/Drizzle/Eden y casts `any` reducen seguridad de contrato. |
| H-011 | P3 | Mantenibilidad | Modulos grandes concentran demasiada logica y elevan riesgo de regresion. |
| H-012 | P3 | Front/back contracts | Apps tienen warnings de lint y casts Eden que pueden ocultar drift de API. |

## Detalle de hallazgos

### H-001 - P1 - Balance y acumulacion no son seguros bajo concurrencia

**Evidencia**
- `src/modules/transactions/index.ts:680-710` lee `balances` y `campaignBalances`.
- `src/modules/transactions/index.ts:963-1006` escribe `current` y `lifetime` con valores calculados en memoria.
- `src/modules/transactions/index.ts:744-1018` ejecuta multiples lecturas/escrituras por campana e item.

**Impacto**
Dos transacciones simultaneas sobre la misma tarjeta pueden leer el mismo saldo inicial y sobrescribir el resultado de la otra. El efecto probable es perdida de puntos o balances de campana inconsistentes aunque ambas compras hayan quedado registradas.

**Recomendacion**
Mover la creacion de transaccion, items, acumulaciones, balances y tier evaluation a una transaccion DB unica. Actualizar balances con operaciones atomicas tipo `current = current + delta`, `lifetime = lifetime + delta`, usando `insert ... on conflict do update` o `select ... for update` sobre la fila de balance.

**Verificacion sugerida**
Agregar prueba de concurrencia que dispare dos `POST /v1/transactions` simultaneos para la misma tarjeta y verifique que `balances.current` y `campaign_balances.current` suman ambas acumulaciones.

### H-002 - P1 - Canje de rewards no es atomico

**Evidencia**
- `src/modules/rewards/index.ts:509-523` revisa si ya existe redencion.
- `src/modules/rewards/index.ts:525-590` revisa stock, descuenta balances y decrementa stock con valores leidos previamente.
- `src/modules/rewards/index.ts:592-601` inserta la redencion despues de haber mutado balances/stock.
- `src/db/schema/rewards.ts:67-70` no define unicidad `(card_id, reward_id)`.

**Impacto**
Bajo dos requests simultaneos, ambos pueden pasar el check de no redimido y saldo suficiente. Esto puede duplicar redenciones, dejar stock negativo o descontar saldo dos veces de forma no controlada.

**Recomendacion**
Ejecutar todo el canje en `db.transaction`, agregar unique index en `redemptions(card_id, reward_id)`, y cambiar decrementos a updates condicionales: `stock is null or stock > 0`, `current >= cost`. La respuesta debe mapear conflicto de unique/stock/saldo a 409/422.

**Verificacion sugerida**
Prueba con `Promise.allSettled` de dos canjes simultaneos sobre la misma tarjeta/reward con stock 1; esperar 1 exito y 1 conflicto, saldo descontado una sola vez.

### H-003 - P1 - Tarjeta universal puede duplicarse por `NULL` en unique index

**Evidencia**
- `src/db/schema/cards.ts:37` define `uniqueIndex('cards_user_campaign_key').on(userId, campaignId, storeId)`.
- `src/services/wallet-onboarding.ts:73-97` busca tarjeta universal con `storeId IS NULL` y si no existe inserta una nueva.

**Impacto**
En PostgreSQL, un unique compuesto permite multiples filas donde una columna es `NULL`. Por tanto, `(user_id, campaign_id, NULL)` no garantiza unicidad. Llamadas concurrentes a login, wallet, WhatsApp o POS pueden crear multiples tarjetas universales para el mismo usuario/campana.

**Recomendacion**
Agregar indice parcial unico para universal wallet: `(user_id, campaign_id) WHERE store_id IS NULL`, y otro para tarjetas por tienda si aplica: `(user_id, campaign_id, store_id) WHERE store_id IS NOT NULL`. Cambiar `ensureUserUniversalWalletCard` a `insert ... on conflict ... returning`.

**Verificacion sugerida**
Prueba de concurrencia llamando `ensureUserUniversalWalletCard(userId)` 5-10 veces en paralelo y verificando una sola tarjeta universal.

### H-004 - P1 - Secreto JWT con fallback inseguro

**Evidencia**
- `src/app/plugins/auth.ts:86-89` usa `secret: process.env.JWT_SECRET ?? 'dev-secret'`.

**Impacto**
Si produccion arranca sin `JWT_SECRET`, todos los tokens quedan firmados con un secreto conocido. Esto permite falsificacion de JWT si el fallback llega a ambientes reales.

**Recomendacion**
Fail-fast en `NODE_ENV === 'production'` cuando falte `JWT_SECRET`. Mantener fallback solo para desarrollo/test, documentado en runbook/env example.

**Verificacion sugerida**
Test unitario o smoke de arranque con `NODE_ENV=production` y sin `JWT_SECRET` que espere error de configuracion.

### H-005 - P2 - Transacciones DB mezclan `tx` con `db` global

**Evidencia**
- `src/modules/stores/index.ts:2035-2094` envuelve POS transaction + stock en `db.transaction`.
- Dentro del flujo, `createStorePosTransaction` llama `createOrReplayTransaction` con `database` (`src/modules/transactions/index.ts:1029-1070`).
- Pero `createOrReplayTransaction` llama servicios que usan `db` global: `touchStoreCpgRelations` en `src/modules/transactions/index.ts:653-658`, `isStoreParticipatingInCampaign` en `src/modules/transactions/index.ts:751-754`, y `evaluateCardTier` en `src/modules/transactions/index.ts:1014-1018`.
- `src/services/campaign-store-access.ts:76-127`, `src/services/store-cpg-relations.ts:45-99` y `src/services/tier-engine.ts:146-310` no aceptan `database`.

**Impacto**
Parte del trabajo ocurre fuera de la transaccion que protege venta/inventario. Si algo falla despues, pueden quedar relaciones CPG-store o tier evaluation aplicadas de forma parcial. Tambien puede haber lecturas inconsistentes porque los servicios globales no ven escrituras no confirmadas del `tx`.

**Recomendacion**
Estandarizar servicios internos para aceptar `database: Database = db` y pasar el `tx` durante flujos atomicos. Definir una regla: todo efecto derivado de una venta confirmada debe ocurrir dentro de la misma transaccion o en outbox posterior.

**Verificacion sugerida**
Prueba que fuerce fallo despues de `touchStoreCpgRelations` dentro de una venta POS y confirme rollback completo o outbox consistente.

### H-006 - P2 - Rotacion de refresh token permite carrera

**Evidencia**
- `src/app/plugins/auth.ts:325-345` selecciona refresh token activo, luego lo revoca, luego persiste uno nuevo.

**Impacto**
Dos requests simultaneos con el mismo refresh token pueden leer la sesion antes de la revocacion y emitir dos refresh tokens nuevos. Esto debilita deteccion de replay y control de sesion.

**Recomendacion**
Usar transaccion con update condicional atomico: `update refresh_tokens set revoked_at = now() where token_hash = ? and revoked_at is null and expires_at > now() returning user_id`. Solo si retorna fila se emite nuevo token.

**Verificacion sugerida**
Prueba concurrente con dos `POST /auth/refresh` usando el mismo refresh token; esperar un exito y un rechazo.

### H-007 - P2 - Idempotencia de notificaciones por `LIKE` sobre payload

**Evidencia**
- `src/services/customer-notifications.ts:21-31` busca `notificationKey` con `payload like '%key%'`.
- `src/db/schema/operations.ts:45-69` guarda `payload` como `text` y no tiene indice por metadata/notification key.

**Impacto**
El lookup escala mal conforme crece `whatsapp_messages`, y un match accidental en JSON/texto puede saltarse una notificacion legitima. Tambien mezcla auditoria de mensajes con control de idempotencia.

**Recomendacion**
Crear tabla `notification_deliveries` o columnas estructuradas (`notification_key`, `channel`, `recipient`) con unique index. Alternativa intermedia: migrar `payload` a `jsonb` y crear indice funcional, pero una tabla dedicada es mas clara.

**Verificacion sugerida**
Prueba de idempotencia por campana/tienda/usuario que no dependa de buscar texto en payload.

### H-008 - P2 - API key `rate_limit` no se aplica

**Evidencia**
- `src/db/schema/api-keys.ts:27` define `rateLimit`.
- `src/app/plugins/auth.ts:130-155` valida API key y actualiza `lastUsedAt`, pero no consume ni aplica limite.
- Busqueda `rateLimit` solo encontro rate limit para webhooks en `src/modules/transactions/index.ts:1137-1145`.

**Impacto**
Integraciones con API key pueden exceder el limite esperado. El campo en DB da una falsa senal de control operativo.

**Recomendacion**
Implementar rate limiting por API key/tenant en middleware o documentar que el campo aun no esta activo. Para produccion, usar store compartido (Redis/Postgres) y devolver `429` con `Retry-After`.

**Verificacion sugerida**
Test con API key `rateLimit=1` y dos requests dentro de la ventana.

### H-009 - P2 - Indices compuestos faltantes para consultas frecuentes

**Evidencia**
- `src/modules/transactions/index.ts:1629-1637` lista transacciones con filtros y `orderBy(createdAt, id)`.
- `src/services/store-checkin.ts:64-75` y `src/services/store-checkin.ts:95-100` filtran por usuario/tienda/status/expiracion y ordenan por `checkedInAt`.
- `src/modules/whatsapp/index.ts:430-437` lista mensajes por filtros y `orderBy(receivedAt, id)`.
- `src/modules/jobs/index.ts:289-296` lista jobs por status/cursor y ordena por `createdAt, id`.
- Esquemas actuales tienen indices simples: `src/db/schema/transactions.ts:43-47`, `src/db/schema/store-checkins.ts:36-41`, `src/db/schema/operations.ts:66-68`, `src/db/schema/operations.ts:95-101`.

**Impacto**
Con volumen, Postgres puede combinar bitmap indexes o hacer sort/scan innecesario en rutas de dashboard, wallet, WhatsApp ops y jobs. Los targets NFR documentados (<500ms en transacciones y <2s reportes) dependen de estos caminos.

**Recomendacion inicial de indices**
- `transactions(store_id, created_at desc, id desc)` y `transactions(user_id, created_at desc, id desc)`.
- `store_checkins(store_id, status, expires_at, checked_in_at)` y `store_checkins(user_id, store_id, status, expires_at, checked_in_at)`.
- `whatsapp_messages(status, received_at desc, id desc)` y/o `whatsapp_messages(received_at desc, id desc)`.
- `reminder_jobs(status, scheduled_for)` para cola y `reminder_jobs(status, created_at desc, id desc)` para listado.
- `accumulations(campaign_id, created_at)` y `redemptions(reward_id, created_at)` para reportes por CPG/campana.

**Verificacion sugerida**
Antes de migrar, correr `EXPLAIN (ANALYZE, BUFFERS)` en staging con datos reales o seed volumetrico. Medir p95 de listados y reportes antes/despues.

### H-010 - P3 - Tipado manual reduce seguridad end-to-end

**Evidencia**
- `src/types/external.d.ts:1-129` declara tipos manuales para Elysia, Drizzle y Eden.
- `src/types/external.d.ts:72-74` declara `treaty` como `any`.
- `src/db/client.ts:14-49` define `DbClient` manual con `unknown[]`.
- Casts/casos: `src/index.ts:7`, `src/modules/campaigns/index.ts:1864`, `src/modules/stores/index.ts:927`, `src/modules/stores/index.ts:2255`.

**Impacto**
Parte del contrato Elysia/Eden/Drizzle puede compilar aunque cambie la API real. Esto reduce el valor del typecheck que hoy pasa.

**Recomendacion**
Eliminar o reducir `external.d.ts` cuando dependencias reales esten instaladas, tipar `db` con schema Drizzle, y reemplazar casts de Eden con rutas compatibles o helpers typed.

**Verificacion sugerida**
CI que ejecute `bun install --frozen-lockfile`, `bun run typecheck` y falle si aparecen nuevos `as any`/`ts-ignore` fuera de una allowlist.

### H-011 - P3 - Modulos muy grandes elevan riesgo de regresion

**Evidencia**
- Conteo de lineas: `src/modules/campaigns/index.ts` 3137, `src/modules/stores/index.ts` 2408, `src/modules/transactions/index.ts` 1736, `src/modules/users/index.ts` 992.

**Impacto**
Los cambios de negocio en venta/campanas/reportes obligan a tocar archivos enormes y mezclan rutas HTTP, validacion, queries, reglas de dominio y serializacion.

**Recomendacion**
Extraer por dominios estrechos y probados: `transaction-ledger`, `reward-redemption`, `campaign-eligibility`, `store-inventory-sale`, `notification-delivery`. No hacer refactor masivo sin tests de regresion.

**Verificacion sugerida**
Antes de extraer, congelar pruebas de contrato para POS transaction, webhook transaction, reward redeem, campaign enrollment y wallet summary.

### H-012 - P3 - Warnings frontend y casts Eden ocultan drift de contrato

**Evidencia**
- `bun run lint` en apps encontro 17 warnings totales.
- `apps/cpg-portal/.../campaigns/[campaignId]/page.tsx` y `apps/cpg-portal/.../stores/page.tsx` usan `(api.v1... as any)` en varias rutas.

**Impacto**
Aunque esta auditoria prioriza backend/DB, estos casts pueden ocultar cambios de forma de respuesta o rutas que rompan flujos CPG/store sin fallar en build.

**Recomendacion**
Crear backlog separado para eliminar casts Eden de CPG portal y limpiar warnings de hooks/unused. Mantenerlo P3 salvo que afecte ventas o auth.

## Backlog recomendado

### Fase 1 - Criticos de consistencia

1. Hacer atomicas las actualizaciones de balances/acumulaciones/tier evaluation.
2. Hacer atomico el canje de rewards con unique index y updates condicionales.
3. Corregir unicidad de tarjetas universales con indices parciales y upsert.
4. Fail-fast de `JWT_SECRET` en produccion.

### Fase 2 - Hardening operacional

1. Pasar `tx` a servicios internos o mover efectos derivados a outbox.
2. Hacer rotacion de refresh token atomica.
3. Implementar idempotencia estructurada para notificaciones.
4. Aplicar rate limit real a API keys.

### Fase 3 - Performance DB

1. Validar indices compuestos con `EXPLAIN` en staging.
2. Crear migraciones de indices en grupos pequenos y medir escrituras.
3. Reemplazar patrones `or(...ids.map())` por `inArray` o `= any($1)` en consultas con listas.

### Fase 4 - Deuda tecnica

1. Reducir `external.d.ts` y casts `any`.
2. Extraer servicios de modulos grandes con pruebas de contrato.
3. Limpiar warnings frontend y casts Eden en CPG portal.

## Notas de alcance

- No se modifico codigo funcional durante esta auditoria.
- Las pruebas existentes validan flujos felices y algunos errores, pero no cubren carreras concurrentes; los principales P1 requieren pruebas nuevas de concurrencia.
- Se consulto la referencia oficial de Elysia `https://elysiajs.com/llms.txt` para confirmar el contexto de Elysia/Eden, pero los hallazgos se basan en el codigo local.
