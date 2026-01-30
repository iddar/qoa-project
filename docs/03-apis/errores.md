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
| `ACCOUNT_SUSPENDED` | 403 | Cuenta suspendida | Usuario/tienda deshabilitado |

### Validación (400)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `INVALID_ARGUMENT` | 400 | Datos de entrada inválidos | Validación fallida |
| `MISSING_FIELD` | 400 | Campo requerido faltante | Campo obligatorio no enviado |
| `INVALID_FORMAT` | 400 | Formato inválido | Email, teléfono, fecha mal formateados |
| `INVALID_PHONE` | 400 | Número de teléfono inválido | Teléfono no cumple formato E.164 |
| `INVALID_DATE_RANGE` | 400 | Rango de fechas inválido | start_date > end_date |
| `VALUE_OUT_OF_RANGE` | 400 | Valor fuera de rango | Cantidad negativa, porcentaje > 100 |

### Recursos (404)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `NOT_FOUND` | 404 | Recurso no encontrado | ID no existe |
| `USER_NOT_FOUND` | 404 | Usuario no encontrado | user_id inválido |
| `STORE_NOT_FOUND` | 404 | Tienda no encontrada | store_id inválido |
| `CAMPAIGN_NOT_FOUND` | 404 | Campaña no encontrada | campaign_id inválido |
| `CARD_NOT_FOUND` | 404 | Tarjeta no encontrada | card_id inválido |
| `REWARD_NOT_FOUND` | 404 | Recompensa no encontrada | reward_id inválido |

### Conflictos (409)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `CONFLICT` | 409 | Conflicto con estado actual | Operación no permitida |
| `ALREADY_EXISTS` | 409 | El recurso ya existe | Duplicado (teléfono, email) |
| `PHONE_ALREADY_REGISTERED` | 409 | Teléfono ya registrado | Usuario existente |
| `CARD_ALREADY_EXISTS` | 409 | Ya tienes una tarjeta activa | Card duplicada para campaña |
| `ALREADY_REDEEMED` | 409 | Recompensa ya canjeada | Intento de doble canje |

### Reglas de negocio (422)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `BUSINESS_RULE_VIOLATION` | 422 | Regla de negocio violada | Lógica de negocio fallida |
| `INSUFFICIENT_BALANCE` | 422 | Saldo insuficiente | Puntos/estampas < threshold |
| `CAMPAIGN_NOT_ACTIVE` | 422 | Campaña no activa | Campaña en draft/paused/ended |
| `CAMPAIGN_EXPIRED` | 422 | Campaña expirada | Fuera de vigencia |
| `STORE_NOT_PARTICIPATING` | 422 | Tienda no participa en campaña | PDV no asociado |
| `REWARD_NOT_AVAILABLE` | 422 | Recompensa no disponible | Stock agotado o inactiva |
| `DAILY_LIMIT_REACHED` | 422 | Límite diario alcanzado | Máximo de operaciones/día |

### Rate Limiting (429)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `RATE_LIMITED` | 429 | Demasiadas solicitudes | Límite de requests excedido |
| `OTP_RATE_LIMITED` | 429 | Demasiados intentos de OTP | Spam de OTP |
| `QUOTA_EXCEEDED` | 429 | Cuota excedida | Límite mensual de API key |

### Errores de servidor (500+)

| Código | HTTP | Mensaje | Cuándo ocurre |
|--------|------|---------|---------------|
| `INTERNAL` | 500 | Error interno del servidor | Error no manejado |
| `SERVICE_UNAVAILABLE` | 503 | Servicio temporalmente no disponible | Mantenimiento, sobrecarga |
| `EXTERNAL_SERVICE_ERROR` | 502 | Error en servicio externo | WhatsApp, T-Conecta fallaron |
| `TIMEOUT` | 504 | Tiempo de espera agotado | Operación tardó demasiado |

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
