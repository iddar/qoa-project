# Catálogo de Errores

> Códigos y mensajes de error estándar para la API de Qoa.

---

## Formato de error

Todas las respuestas de error siguen este formato:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensaje legible para humanos",
    "details": [
      {
        "field": "campo_afectado",
        "reason": "razón_del_error",
        "value": "valor_recibido"
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "traceId": "trace_xyz789",
    "timestamp": "2026-01-29T10:00:00Z"
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `error.code` | string | Código único del error (SCREAMING_SNAKE_CASE) |
| `error.message` | string | Mensaje seguro para mostrar al usuario |
| `error.details` | array | Detalles adicionales (opcional) |
| `meta.requestId` | string | ID único del request |
| `meta.traceId` | string | ID para correlación de trazas |

---

## Códigos de error por categoría

### Autenticación (401)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `UNAUTHORIZED` | 401 | Autenticación requerida | No se envió token/API key |
| `INVALID_TOKEN` | 401 | Token inválido o expirado | JWT malformado o expirado |
| `INVALID_API_KEY` | 401 | API key inválida | Key no existe o fue revocada |
| `OTP_EXPIRED` | 401 | Código OTP expirado | OTP venció (5 min default) |
| `OTP_INVALID` | 401 | Código OTP incorrecto | OTP no coincide |
| `SESSION_EXPIRED` | 401 | Sesión expirada | Refresh token expirado |

### Autorización (403)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `FORBIDDEN` | 403 | No tienes permiso para esta acción | Sin permisos suficientes |
| `INSUFFICIENT_SCOPE` | 403 | Scope insuficiente | API key sin scope requerido |
| `RESOURCE_ACCESS_DENIED` | 403 | Acceso denegado al recurso | Recurso de otro tenant |
| `ACCOUNT_BLOCKED` | 403 | Cuenta bloqueada | Usuario bloqueado (temporal o permanente) |
| `TENANT_REQUIRED` | 403 | Tenant requerido | Se requiere tenant para el rol |
| `TENANT_NOT_ALLOWED` | 403 | Tenant no permitido | Tenant no permitido para el rol |
| `INVALID_TENANT_TYPE` | 403 | Tipo de tenant inválido | Tipo de tenant no reconocido |

### Validación (400)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `INVALID_ARGUMENT` | 400 | Datos de entrada inválidos | Validación fallida |
| `MISSING_FIELD` | 400 | Campo requerido faltante | Campo obligatorio no enviado |
| `INVALID_FORMAT` | 400 | Formato inválido | Email, teléfono, fecha mal formateados |
| `INVALID_PHONE` | 400 | Número de teléfono inválido | Teléfono no cumple formato E.164 |
| `INVALID_DATE_RANGE` | 400 | Rango de fechas inválido | start_date > end_date |
| `VALUE_OUT_OF_RANGE` | 400 | Valor fuera de rango | Cantidad negativa, porcentaje > 100 |
| `INVALID_CURSOR` | 400 | Cursor de paginación inválido | Cursor malformado o expirado |
| `INVALID_ROLE` | 400 | Rol inválido | Rol no reconocido |

### Recursos (404)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `NOT_FOUND` | 404 | Recurso no encontrado | ID no existe |
| `USER_NOT_FOUND` | 404 | Usuario no encontrado | user_id inválido |
| `STORE_NOT_FOUND` | 404 | Tienda no encontrada | store_id inválido |
| `CAMPAIGN_NOT_FOUND` | 404 | Campaña no encontrada | campaign_id inválido |
| `CARD_NOT_FOUND` | 404 | Tarjeta no encontrada | card_id inválido |
| `REWARD_NOT_FOUND` | 404 | Recompensa no encontrada | reward_id inválido |
| `CODE_SET_NOT_FOUND` | 404 | Batch de códigos no encontrado | code_set_id inválido |
| `CODE_NOT_FOUND` | 404 | Código no encontrado | code_value inválido |
| `CPG_NOT_FOUND` | 404 | CPG no encontrado | cpg_id inválido |
| `BRAND_NOT_FOUND` | 404 | Marca no encontrada | brand_id inválido |
| `PRODUCT_NOT_FOUND` | 404 | Producto no encontrado | product_id inválido |
| `TRANSACTION_NOT_FOUND` | 404 | Transacción no encontrada | transaction_id inválido |

### Conflictos (409)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `CONFLICT` | 409 | Conflicto con estado actual | Operación no permitida |
| `ALREADY_EXISTS` | 409 | El recurso ya existe | Duplicado (teléfono, email) |
| `USER_EXISTS` | 409 | El usuario ya existe | Duplicado de email o teléfono |
| `PHONE_ALREADY_REGISTERED` | 409 | Teléfono ya registrado | Usuario existente |
| `CARD_ALREADY_EXISTS` | 409 | Ya tienes una tarjeta activa | Card duplicada para campaña |
| `CARD_EXISTS` | 409 | La tarjeta ya existe | Intento de crear duplicado |
| `ALREADY_REDEEMED` | 409 | Recompensa ya canjeada | Intento de doble canje |
| `CODE_ALREADY_USED` | 409 | Código ya utilizado | Reuso de código único |

### Reglas de negocio (422)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `BUSINESS_RULE_VIOLATION` | 422 | Regla de negocio violada | Lógica de negocio fallida |
| `INSUFFICIENT_BALANCE` | 422 | Saldo insuficiente | Puntos/estampas < threshold |
| `CAMPAIGN_NOT_ACTIVE` | 422 | Campaña no activa | Campaña en draft/paused/ended |
| `CAMPAIGN_EXPIRED` | 422 | Campaña expirada | Fuera de vigencia |
| `CAMPAIGN_NOT_READY` | 422 | Campaña no lista para revisión | ready_for_review=false |
| `CAMPAIGN_NOT_REVIEWED` | 422 | Campaña no revisada | reviewed=false |
| `CAMPAIGN_NOT_CONFIRMED` | 422 | Campaña no confirmada | confirmed=false |
| `CAMPAIGN_LOCKED` | 422 | Campaña bloqueada | Campaña en revisión/confirmación |
| `STORE_NOT_PARTICIPATING` | 422 | Tienda no participa en campaña | PDV no asociado |
| `REWARD_NOT_AVAILABLE` | 422 | Recompensa no disponible | Stock agotado o inactiva |
| `REWARD_INACTIVE` | 422 | Recompensa inactiva | Recompensa deshabilitada |
| `REWARD_OUT_OF_STOCK` | 422 | Recompensa sin stock | Inventario agotado |
| `REWARD_CARD_MISMATCH` | 422 | Tarjeta no corresponde a campaña | La tarjeta no es de esta campaña |
| `DAILY_LIMIT_REACHED` | 422 | Límite diario alcanzado | Máximo de operaciones/día |
| `CODE_EXPIRED` | 422 | Código expirado | Fuera de vigencia del código |
| `CODE_INVALID` | 422 | Código inválido | No pertenece a la campaña |
| `INVALID_STATUS_TRANSITION` | 422 | Transición de estado inválida | No se puede mover al estado solicitado |

### Rate Limiting (429)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `RATE_LIMITED` | 429 | Demasiadas solicitudes | Límite de requests excedido |
| `OTP_RATE_LIMITED` | 429 | Demasiados intentos de OTP | Spam de OTP |
| `QUOTA_EXCEEDED` | 429 | Cuota excedida | Límite mensual de API key |

### Webhooks

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `INVALID_WEBHOOK_SIGNATURE` | 401 | Firma de webhook inválida | HMAC no coincide |
| `INVALID_WHATSAPP_SIGNATURE` | 401 | Firma de WhatsApp inválida | HMAC no coincide |
| `WEBHOOK_ALREADY_REJECTED` | 409 | Webhook ya rechazado | Reintento de evento procesado |

### Transacciones

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `CARD_USER_MISMATCH` | 422 | La tarjeta no pertenece al usuario | Intento de usar tarjeta ajena |

### Errores de servidor (500+)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `INTERNAL` | 500 | Error interno del servidor | Error no manejado |
| `SERVICE_UNAVAILABLE` | 503 | Servicio temporalmente no disponible | Mantenimiento, sobrecarga |
| `EXTERNAL_SERVICE_ERROR` | 502 | Error en servicio externo | WhatsApp, T-Conecta fallaron |
| `TIMEOUT` | 504 | Tiempo de espera agotado | Operación tardó demasiado |
| `USER_CREATE_FAILED` | 500 | Error al crear usuario | Fallo en la creación |
| `STORE_CREATE_FAILED` | 500 | Error al crear tienda | Fallo en la creación |
| `CARD_CREATE_FAILED` | 500 | Error al crear tarjeta | Fallo en la creación |
| `CAMPAIGN_CREATE_FAILED` | 500 | Error al crear campaña | Fallo en la creación |
| `CAMPAIGN_UPDATE_FAILED` | 500 | Error al actualizar campaña | Fallo en la actualización |
| `CAMPAIGN_POLICY_CREATE_FAILED` | 500 | Error al crear política | Fallo en la creación |
| `CAMPAIGN_POLICY_UPDATE_FAILED` | 500 | Error al actualizar política | Fallo en la actualización |
| `CAMPAIGN_POLICY_NOT_FOUND` | 404 | Política no encontrada | policy_id inválido |
| `REWARD_CREATE_FAILED` | 500 | Error al crear recompensa | Fallo en la creación |
| `CPG_CREATE_FAILED` | 500 | Error al crear CPG | Fallo en la creación |
| `BRAND_CREATE_FAILED` | 500 | Error al crear marca | Fallo en la creación |
| `PRODUCT_CREATE_FAILED` | 500 | Error al crear producto | Fallo en la creación |
| `TRANSACTION_CREATE_FAILED` | 500 | Error al crear transacción | Fallo en la creación |

---

## Ejemplos por escenario

### Validación de campos

```json
// POST /v1/users { "phone": "invalid" }

{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "Datos de entrada inválidos",
    "details": [
      {
        "field": "phone",
        "reason": "invalid_format",
        "value": "invalid",
        "expected": "E.164 format (+521234567890)"
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "traceId": "trace_xyz789"
  }
}
```

### Saldo insuficiente

```json
// POST /v1/rewards/rew_123/redeem

{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "No tienes suficientes puntos para canjear esta recompensa",
    "details": [
      {
        "required": 100,
        "current": 75,
        "unit": "points"
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "traceId": "trace_xyz789"
  }
}
```

### Rate limiting

```json
// Cualquier endpoint cuando se excede el límite

{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Demasiadas solicitudes, intenta de nuevo en 60 segundos",
    "details": [
      {
        "retryAfter": 60,
        "limit": 60,
        "window": "1m"
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "traceId": "trace_xyz789"
  }
}
```

---

## Headers de respuesta

| Header | Descripción | Ejemplo |
|--------|-------------|---------|
| `X-Request-Id` | ID único del request | `req_abc123` |
| `X-Trace-Id` | ID para correlación | `trace_xyz789` |
| `Retry-After` | Segundos para reintentar (429, 503) | `60` |

---

## Buenas prácticas para clientes

1. **Siempre verificar `error.code`** para lógica programática
2. **Mostrar `error.message`** al usuario (es seguro)
3. **Usar `error.details`** para errores de validación
4. **Guardar `requestId` y `traceId`** para debugging
5. **Implementar retry con backoff** para errores 429 y 5xx
6. **No reintentar** errores 4xx (excepto 429)

---

## Mapeo a HTTP Status

| Rango | Significado | Acción del cliente |
|-------|-------------|-------------------|
| `2xx` | Éxito | Procesar respuesta |
| `400` | Error del cliente (validación) | Corregir request |
| `401` | No autenticado | Re-autenticar |
| `403` | Sin permisos | Verificar permisos |
| `404` | No encontrado | Verificar ID |
| `409` | Conflicto | Verificar estado |
| `422` | Regla de negocio | Mostrar mensaje |
| `429` | Rate limit | Esperar y reintentar |
| `5xx` | Error de servidor | Reintentar con backoff |
