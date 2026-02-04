# Fase 3: Diseño de APIs

> Contratos de API REST y eventos para la plataforma Qoa.

---

## Documentos de esta fase

| Documento | Descripción | Estado |
|-----------|-------------|--------|
| [openapi.yaml](./openapi.yaml) | Especificación OpenAPI 3.1 - REST API completa | Completado |
| [asyncapi.yaml](./asyncapi.yaml) | Especificación AsyncAPI - Eventos de dominio | Completado |
| [autenticacion.md](./autenticacion.md) | Flujos de autenticación por tipo de usuario | Completado |
| [errores.md](./errores.md) | Catálogo de códigos de error estándar | Completado |

---

## Resumen de la API

### Base URL

```
Producción: https://api.qoa.app/v1
Staging:    https://api.staging.qoa.app/v1
```

### Versionado

- Por ruta: `/v1`, `/v2`
- Compatibilidad hacia atrás dentro de la misma versión
- Deprecación con aviso de 90 días mínimo

---

## Módulos de la API

Basado en los ADRs y el modelo de negocio:

| Módulo | Endpoints | Descripción |
|--------|-----------|-------------|
| **Auth** | `/auth/*` | OTP, verificación, tokens |
| **Users** | `/users/*` | Consumidores (identificados por teléfono) |
| **Stores** | `/stores/*` | PDVs y su relación con CPGs |
| **Brands** | `/brands/*` | Marcas/sub-marcas de CPGs |
| **Products** | `/products/*` | Catálogo de productos (SKUs) |
| **Campaigns** | `/campaigns/*` | Programas de lealtad, códigos y auditoría |
| **Cards** | `/cards/*` | Tarjetas de consumidores |
| **Transactions** | `/transactions/*` | Registro de compras |
| **Rewards** | `/rewards/*` | Catálogo y canje de premios |
| **Reports** | `/reports/*` | Reportes para PDV y CPG |
| **Webhooks** | `/webhooks/*` | Configuración de webhooks |

---

## Autenticación

Definido en [ADR-0003](../adr/0003-autenticacion.md) y [ADR-0009](../adr/0009-stack-implementacion.md):

| Actor | Método | Header |
|-------|--------|--------|
| **Consumidor** | OTP + JWT | `Authorization: Bearer <token>` |
| **Tendero (PDV)** | OTP/Password + JWT | `Authorization: Bearer <token>` |
| **CPG Admin** | Password + JWT | `Authorization: Bearer <token>` |
| **B2B/Integración** | API Key | `X-API-Key: <key>` |

---

## Formato de respuestas

### Éxito

```json
{
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-01-29T10:00:00Z"
  }
}
```

### Error

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "El campo 'phone' es requerido",
    "details": [
      { "field": "phone", "reason": "required" }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "traceId": "trace_xyz789"
  }
}
```

---

## Rate Limiting

| Plan | Límite | Ventana |
|------|--------|---------|
| **Consumidor** | 60 req | 1 minuto |
| **PDV** | 120 req | 1 minuto |
| **B2B** | Configurable por API Key | - |

Headers de respuesta:
- `X-RateLimit-Limit`: Límite total
- `X-RateLimit-Remaining`: Requests restantes
- `X-RateLimit-Reset`: Timestamp de reset

---

## Eventos de dominio

Definido en [ADR-0004](../adr/0004-mensajeria.md) y [ADR-0009](../adr/0009-stack-implementacion.md):

### Nomenclatura

```
{domain}.{entity}.{action}.v{version}

Ejemplos:
- users.user.created.v1
- transactions.transaction.completed.v1
- campaigns.threshold.reached.v1
- rewards.reward.redeemed.v1
```

### Eventos principales

| Evento | Trigger | Consumidores |
|--------|---------|--------------|
| `users.user.created` | Registro exitoso | Notificaciones, Analytics |
| `users.user.verified` | OTP verificado | Cards, Onboarding |
| `transactions.transaction.created` | Compra registrada | Motor de reglas |
| `transactions.transaction.processed` | Items evaluados | Balances, Notificaciones |
| `campaigns.threshold.reached` | Usuario alcanza meta | Rewards, Notificaciones |
| `campaigns.campaign.updated` | Cambios en configuración | Auditoría, QA |
| `campaigns.code.captured` | Código capturado | Motor de reglas, antifraude |
| `rewards.reward.redeemed` | Canje de recompensa | Balances, Analytics |
| `cards.card.created` | Nueva tarjeta emitida | Notificaciones |

---

## Webhooks

Para integraciones externas:

| Aspecto | Detalle |
|---------|---------|
| **Firma** | HMAC-SHA256 del payload |
| **Headers** | `X-Qoa-Signature`, `X-Qoa-Timestamp` |
| **Reintentos** | 5 intentos con backoff exponencial |
| **Timeout** | 30 segundos |

---

## Referencias

- [ADR-0003: Autenticación](../adr/0003-autenticacion.md)
- [ADR-0004: Mensajería](../adr/0004-mensajeria.md)
- [ADR-0007: Multi-tenancy](../adr/0007-multi-tenancy.md)
- [ADR-0008: Modelo de Campañas](../adr/0008-modelo-campanias.md)
- [ADR-0009: Stack de Implementación](../adr/0009-stack-implementacion.md)
