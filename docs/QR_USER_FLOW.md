## Summary

Implementa **Store Check-in**: cuando un usuario escanea el QR de una tienda, se registra su visita como un check-in con estado `pending`. Esto permite:

1. Registrar la visita del usuario a la tienda.
2. Emparejar automáticamente con una transacción cuando el tendero registra una compra.
3. Mostrar al usuario un mensaje de agradecimiento + su QR de lealtad.

## Cambios

### Schema
- Nueva tabla `store_checkins` con estados `pending`, `matched`, `expired`.
- FK a `users`, `stores`, `transactions`.
- Índices por usuario, tienda, estado y expiración.

### Servicio
- `createStoreCheckin`: Crea un check-in pendiente con expiración (default 24h).
- `findPendingCheckinsForUserAndStore`: Busca check-ins pendientes no expirados.
- `matchCheckinWithTransaction`: Empareja un check-in con una transacción.
- `autoMatchCheckinWithTransaction`: Busca y empareja automáticamente.

### WhatsApp
- Usuario nuevo que escanea QR: onboarding completo + check-in al final.
- Usuario existente que escanea QR: check-in + "Gracias por tu visita a TIENDA" + QR.

### Transacciones
- Al crear una transacción, se busca un check-in `pending` del mismo usuario/tienda y se empareja automáticamente.

### API
- `GET /v1/stores/:storeId/checkins?status=pending`: Listar check-ins de tienda (staff).
- `POST /v1/stores/:storeId/checkins/:checkinId/match`: Emparejar check-in con transacción.

### Tests
- 2 tests: crear y listar check-ins, emparejar con transacción.

## Migración

```bash
cd src
bun run db:migrate
```

## Testing

```bash
DATABASE_URL=postgres://qoa:supersecret@127.0.0.1:5434/qoa_test \
  bun test src/spec/store-checkin.spec.ts --timeout 30000
```

## Backward Compatibility

- El flujo de onboarding existente sigue funcionando igual.
- Los usuarios que escanean QR hoy reciben el mensaje de check-in adicional.
- No se rompen endpoints existentes.
