# Plan: Store Check-in

## Contexto

Cuando un usuario escanea el QR de una tienda (el mismo QR que inicia el onboarding por WhatsApp), se envía un mensaje automático tipo `alta CODIGO_TIENDA`. Hoy, ese mensaje solo sirve para enrolar usuarios nuevos. Los usuarios existentes no reciben nada más que repetir su QR.

**Objetivo:** Transformar ese escaneo en un **check-in** que registra la visita del usuario a la tienda y espera ser emparejado con una compra.

## Requerimientos

### 1. Check-in automático por escaneo WhatsApp

Cuando un usuario completo escanea el QR de una tienda:
- Registrar un check-in con estado `pending`.
- Responder: *"¡Gracias por tu visita a TIENDA! Te enviamos tu QR de lealtad."*
- Reenviar su QR de lealtad.

Cuando un usuario nuevo escanea:
- Flujo de onboarding existente + check-in al completar.

### 2. Tabla `store_checkins`

```ts
export const storeCheckinStatus = pgEnum('store_checkin_status', ['pending', 'matched', 'expired']);

export const storeCheckins = pgTable('store_checkins', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  status: storeCheckinStatus('status').notNull().default('pending'),
  matchedTransactionId: uuid('matched_transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull().defaultNow(),
  matchedAt: timestamp('matched_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => [
  index('store_checkins_user_idx').on(table.userId),
  index('store_checkins_store_idx').on(table.storeId),
  index('store_checkins_status_idx').on(table.status),
  index('store_checkins_expires_idx').on(table.expiresAt),
  index('store_checkins_checked_in_idx').on(table.checkedInAt),
]);
```

### 3. Endpoints nuevos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/v1/stores/:storeId/checkins?status=pending` | Listar check-ins de una tienda (staff/admin) |
| `POST` | `/v1/stores/:storeId/checkins/:checkinId/match` | Emparejar check-in con transacción |

### 4. Posibles fuentes de match

El check-in puede emparejarse con una transacción de dos maneras:
1. **QR escaneado:** El tendero escanea el QR del cliente en POS.
2. **Teléfono registrado:** El tendero busca al cliente por teléfono en POS.

Para ambos casos, al crear la transacción se busca un check-in `pending` del mismo usuario en la misma tienda dentro de las últimas ~24 horas.

## Implementación

### Commit 1: Schema DB
- Crear `src/db/schema/store-checkins.ts`
- Exportar desde `src/db/schema/index.ts`
- Crear migración

### Commit 2: Servicio de check-in
- Crear `src/services/store-checkin.ts`
- Funciones: `createStoreCheckin`, `findPendingCheckinsForUserStore`, `matchCheckinWithTransaction`

### Commit 3: Integración con WhatsApp
- Modificar `processWhatsappOnboardingMessage` para registrar check-in al completar onboarding.
- Agregar `processStoreCheckin` para usuarios existentes que escanean QR.

### Commit 4: Endpoints API
- Agregar endpoints al módulo de stores.

### Commit 5: Emparejo automático en transacciones
- Modificar `createOrReplayTransaction` para buscar check-ins pendientes y emparejar.

### Commit 6: Tests
- Tests de servicio y espec.

## Notas

- No se necesita un nuevo QR específico de check-in. Se reutiliza el QR de enroll.
- Los check-ins `pending` deben expirar (ej. después de 24h) para no emparejar compras viejas.
- Backward compatible: los usuarios que escanean QR hoy siguen funcionando igual, solo se agrega el registro de check-in.
