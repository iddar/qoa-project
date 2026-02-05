# Flujos de Autenticación

> Guía de autenticación para la API de Qoa.

---

## Resumen de métodos

| Actor | Método | Endpoints | Token |
|-------|--------|-----------|-------|
| **Consumidor** | OTP vía WhatsApp | `/auth/otp/*` | JWT |
| **Tendero (PDV)** | OTP o Password | `/auth/otp/*`, `/auth/login` | JWT |
| **CPG Admin** | Password | `/auth/login` | JWT |
| **B2B/Integración** | API Key | - | API Key |

---

## 1. Autenticación por OTP (Consumidores y Tenderos)

### Paso 1: Solicitar OTP

```http
POST /v1/auth/otp/request
Content-Type: application/json

{
  "phone": "+521234567890",
  "channel": "whatsapp"
}
```

**Respuesta exitosa (200):**

```json
{
  "data": {
    "otpId": "otp_abc123",
    "expiresAt": "2026-01-29T10:05:00Z",
    "channel": "whatsapp"
  }
}
```

**Parámetros:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `phone` | string | Sí | Teléfono en formato E.164 |
| `channel` | string | No | `whatsapp` (default) o `sms` |

**Límites:**

- 1 OTP por minuto por teléfono
- OTP expira en 5 minutos
- Máximo 5 OTPs por hora por teléfono

### Paso 2: Verificar OTP

```http
POST /v1/auth/otp/verify
Content-Type: application/json

{
  "otpId": "otp_abc123",
  "code": "123456"
}
```

**Respuesta exitosa (200):**

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "ref_xyz789...",
    "expiresIn": 900,
    "user": {
      "id": "usr_123",
      "phone": "+521234567890",
      "isNew": false
    }
  }
}
```

**Si es usuario nuevo (`isNew: true`):**

El usuario fue creado automáticamente. El cliente debe:
1. Mostrar flujo de onboarding
2. Actualizar perfil con `PATCH /v1/users/me`

**Errores comunes:**

| Código | Causa | Acción |
|--------|-------|--------|
| `OTP_INVALID` | Código incorrecto | Mostrar error, permitir reintento |
| `OTP_EXPIRED` | Código expirado | Solicitar nuevo OTP |
| `OTP_RATE_LIMITED` | Muchos intentos | Esperar tiempo indicado |

---

## 2. Autenticación por Password (Tenderos y CPG)

### Login

```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "tienda@ejemplo.com",
  "password": "********"
}
```

**Respuesta exitosa (200):**

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "ref_xyz789...",
    "expiresIn": 900,
    "user": {
      "id": "usr_456",
      "email": "tienda@ejemplo.com",
      "role": "store_admin"
    }
  }
}
```

### Secuencia de login sin OTP (Etapa 1)

En la etapa inicial no se usa OTP real. El flujo esperado es:

1. Cliente envía `POST /v1/auth/login` con email/password.
2. API retorna `accessToken` + `refreshToken`.
3. Cliente consulta perfil con `GET /v1/users/me`.
4. Cuando expire el access token → `POST /v1/auth/refresh` para rotar.

### Recuperar contraseña

**Paso 1: Solicitar reset**

```http
POST /v1/auth/password/reset-request
Content-Type: application/json

{
  "email": "tienda@ejemplo.com"
}
```

**Respuesta (200):** Siempre éxito (no revela si email existe)

```json
{
  "data": {
    "message": "Si el email existe, recibirás instrucciones"
  }
}
```

**Paso 2: Confirmar reset (con token del email)**

```http
POST /v1/auth/password/reset
Content-Type: application/json

{
  "token": "rst_abc123...",
  "newPassword": "nuevaContraseña123"
}
```

---

## 3. API Keys (B2B/Integraciones)

### Formato

```
qoa_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx  (producción)
qoa_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx  (sandbox)
```

### Uso en requests

```http
GET /v1/transactions
X-API-Key: qoa_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

O alternativamente:

```http
GET /v1/transactions
Authorization: Bearer qoa_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Scopes

Las API Keys tienen scopes que limitan qué pueden hacer:

| Scope | Descripción |
|-------|-------------|
| `transactions:read` | Leer transacciones |
| `transactions:write` | Crear transacciones |
| `campaigns:read` | Leer campañas |
| `campaigns:write` | Crear/modificar campañas |
| `campaigns:codes:write` | Importar/capturar códigos |
| `campaigns:audit:read` | Leer auditoría de campañas |
| `reports:read` | Acceder a reportes |
| `webhooks:manage` | Configurar webhooks |

### Gestión de API Keys

**Crear API Key (desde dashboard):**

```http
POST /v1/api-keys
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "Integración ERP",
  "scopes": ["transactions:write", "transactions:read"],
  "expiresAt": null
}
```

**Respuesta (201):**

```json
{
  "data": {
    "id": "key_123",
    "key": "qoa_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "name": "Integración ERP",
    "scopes": ["transactions:write", "transactions:read"],
    "createdAt": "2026-01-29T10:00:00Z"
  }
}
```

> **IMPORTANTE:** La key completa solo se muestra una vez. Guardarla de forma segura.

**Revocar API Key:**

```http
DELETE /v1/api-keys/key_123
Authorization: Bearer <jwt>
```

---

## 4. Manejo de Tokens JWT

### Estructura del Access Token

```json
{
  "sub": "usr_123",
  "iat": 1706526000,
  "exp": 1706526900,
  "iss": "qoa",
  "aud": "qoa-api",
  "role": "consumer",
  "tenant": "cpg_456"
}
```

| Campo | Descripción |
|-------|-------------|
| `sub` | ID del usuario |
| `exp` | Expiración (15 min desde emisión) |
| `role` | Rol del usuario |
| `tenant` | Contexto de tenant (CPG o Store) |

### Refresh Token

Cuando el access token expira, usar el refresh token para obtener uno nuevo:

```http
POST /v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "ref_xyz789..."
}
```

**Respuesta (200):**

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "ref_new123...",
    "expiresIn": 900
  }
}
```

> **Nota:** El refresh token rota en cada uso. El anterior queda invalidado.

### Logout

```http
POST /v1/auth/logout
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "refreshToken": "ref_xyz789..."
}
```

Esto invalida el refresh token y todas las sesiones asociadas.

---

## 5. Uso de tokens en requests

### Con JWT

```http
GET /v1/users/me
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

### Con API Key

```http
GET /v1/campaigns
X-API-Key: qoa_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Modo desarrollo / tests locales

Para pruebas locales se puede activar un bypass controlado con:

```
AUTH_DEV_MODE=true
NODE_ENV=development
```

Headers soportados:

- `x-dev-user-id`: ID del usuario simulado (obligatorio).
- `x-dev-user-role`: rol simulado (`consumer`, `store_admin`, etc.).
- `x-dev-user-scopes`: scopes separados por coma.
- `x-dev-auth-type: api_key`: habilita modo API key.
- `x-dev-api-key-id`, `x-dev-tenant-id`, `x-dev-tenant-type`, `x-dev-api-key-scopes`: datos para simular API key.

---

## 6. Flujos por tipo de cliente

### App Consumidor (PWA)

```
1. Usuario abre app
2. Si no tiene token → Solicitar teléfono
3. POST /auth/otp/request
4. Usuario recibe OTP en WhatsApp
5. POST /auth/otp/verify
6. Guardar tokens en localStorage/secure storage
7. Usar access token en cada request
8. Cuando expire → POST /auth/refresh
```

### Dashboard Tienda

```
1. Tendero abre dashboard
2. Opción A: Login con OTP (igual que consumidor)
3. Opción B: Login con email/password
4. POST /auth/login
5. Guardar tokens (httpOnly cookies recomendado)
6. Usar access token en cada request
```

### Integración B2B

```
1. Admin crea API Key en dashboard
2. Integrador guarda key de forma segura
3. Incluir X-API-Key en cada request
4. Manejar errores 401 (key revocada/expirada)
```

---

## 7. Seguridad

### Requisitos de password

- Mínimo 8 caracteres
- Al menos 1 número
- Al menos 1 letra

### Protecciones activas

| Protección | Descripción |
|------------|-------------|
| Rate limiting | Límite de intentos por IP/usuario |
| Bloqueo temporal | 5 intentos fallidos = bloqueo 15 min |
| HTTPS obligatorio | Tokens solo en conexiones seguras |
| Token rotation | Refresh tokens rotan en cada uso |

### Buenas prácticas para clientes

1. **Nunca guardar tokens en código** - Usar variables de entorno
2. **HTTPS siempre** - Nunca enviar credenciales por HTTP
3. **Rotar API Keys** - Periódicamente y ante cualquier exposición
4. **Manejar 401** - Implementar lógica de re-autenticación
5. **Logout en dispositivos** - Permitir cerrar sesiones remotas

---

## Referencias

- [ADR-0003: Autenticación](../adr/0003-autenticacion.md)
- [Catálogo de Errores](./errores.md)
