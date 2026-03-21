# Iteracion 1 - Cierre de Gaps de Alta Prioridad

Objetivo: cerrar los gaps `GAP-002`, `GAP-003` y `GAP-004` con cobertura automatizada reproducible.

## Alcance

- In scope:
  - `GAP-002` Rate limiting (`RATE_LIMITED`).
  - `GAP-003` Retries duplicados en webhook de transacciones (idempotencia E2E).
  - `GAP-004` Firma invalida en webhook de transacciones (negativo E2E).
- Out of scope en esta iteracion:
  - MFA.
  - Pruebas de carga.

## Estado actual

- `GAP-002` ya tiene throttling configurable en backend y test de integracion para `RATE_LIMITED`.
- `GAP-003` y `GAP-004` ya tienen validacion de integracion API en `src/spec/transactions.spec.ts`.
- Pendiente: cerrar cobertura E2E para los tres escenarios de alta prioridad.

## Plan de ejecucion

### 1) GAP-002 - Rate limiting

- [x] Implementar throttling configurable para `/v1/transactions/webhook`.
- [x] Parametrizar limite/ventana por variables de entorno para entorno de test.
- [x] Agregar pruebas de integracion para:
  - Respuesta `429` con `RATE_LIMITED` al exceder limite.
  - Permitir nuevas solicitudes al expirar la ventana.
- [ ] Agregar cobertura E2E de punta a punta.

### 2) GAP-003 - Retries duplicados (idempotencia E2E)

- Extender flujo E2E para reenviar el mismo webhook y validar:
  - Primera solicitud: `201`.
  - Reintento: `200` con `meta.replayed=true`.
  - Sin duplicados en transacciones/recibos.

### 3) GAP-004 - Firma invalida de webhook (E2E)

- Agregar caso E2E negativo para firma incorrecta y validar:
  - `401` con `INVALID_WEBHOOK_SIGNATURE`.
  - No se persiste transaccion.

## Criterios de salida

- `bun test` en verde para specs de transacciones.
- Suite E2E de Iteracion 1 en verde.
- `docs/07-engineering/test-cases.md` actualizado con estatus de cada gap de alta prioridad.
- `docs/03-apis/openapi.yaml` alineado si se agregan respuestas o headers nuevos.

## Entregables

- Codigo y tests para throttling de webhook.
- Specs de E2E para retries y firma invalida.
- Actualizacion de documentacion de cobertura.
