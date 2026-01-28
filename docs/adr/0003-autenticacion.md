# ADR-0003: Autenticación

> **Estado:** Aceptado
> **Fecha:** 2026-01-28
> **Decisores:** Equipo Qoa

---

## Contexto

Qoa tiene múltiples tipos de usuarios con diferentes necesidades de autenticación:

| Actor | Contexto | Prioridad UX |
|-------|----------|--------------|
| Consumidor | Mobile, WhatsApp | Fricción mínima |
| Tendero/PDV | Dashboard web | Balance seguridad/facilidad |
| CPG/Marca | Portal web | Seguridad media |
| Integraciones B2B | API | Seguridad alta |
| Admin (Qoa) | Backoffice | Seguridad alta |

---

## Decisión

### Estrategia por tipo de usuario

| Actor | Método Primario | Método Secundario |
|-------|-----------------|-------------------|
| **Consumidor** | OTP (6 dígitos) | - |
| **Tendero/PDV** | OTP (6 dígitos) | Email + Password |
| **CPG/Marca** | Email + Password | OTP |
| **Admin** | Email + Password + MFA | - |
| **B2B/API** | API Keys | - |

---

## Flujos de Autenticación

### 1. Consumidor (OTP)

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Usuario │     │   API    │     │ WhatsApp │     │  Usuario │
│  ingresa │────▶│ genera   │────▶│  envía   │────▶│  ingresa │
│ teléfono │     │   OTP    │     │   OTP    │     │   OTP    │
└──────────┘     └──────────┘     └──────────┘     └────┬─────┘
                                                        │
                                                        ▼
                                                  ┌──────────┐
                                                  │   JWT    │
                                                  │ emitido  │
                                                  └──────────┘
```

**Especificaciones:**
- OTP de 6 dígitos numéricos
- Expiración: 5 minutos
- Máximo 3 intentos antes de bloqueo temporal
- Rate limit: 1 OTP por minuto por teléfono

### 2. Tendero/PDV

**Opción A - OTP (default):**
- Mismo flujo que consumidor
- Vinculado al teléfono del tendero

**Opción B - Email + Password:**
- Password con requisitos mínimos (8 chars, 1 número)
- Recuperación vía email
- Sesión persistente (remember me)

### 3. B2B / Integraciones (API Keys)

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Admin   │     │ Sistema  │     │  Cliente │
│  genera  │────▶│ almacena │────▶│   usa    │
│ API Key  │     │   hash   │     │ en header│
└──────────┘     └──────────┘     └──────────┘
```

**Especificaciones:**
- Formato: `qoa_live_xxxxxxxxxxxxxxxxxxxx` / `qoa_test_xxxxxxxxxxxxxxxxxxxx`
- Header: `X-API-Key: qoa_live_xxx`
- Rotación manual desde dashboard
- Scopes por key (read, write, admin)
- Rate limiting por key

---

## Tokens y Sesiones

### JWT para usuarios autenticados

| Campo | Valor |
|-------|-------|
| **Algoritmo** | RS256 |
| **Expiración access** | 15 minutos |
| **Expiración refresh** | 7 días |
| **Payload** | user_id, tenant_id, role, permissions |

### Refresh Token Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Access  │     │  Refresh │     │   New    │
│  expired │────▶│  válido  │────▶│  Access  │
└──────────┘     └──────────┘     └──────────┘
```

- Refresh tokens almacenados en BD (revocables)
- Rotación de refresh token en cada uso

---

## Seguridad

### Almacenamiento de credenciales

| Tipo | Almacenamiento |
|------|----------------|
| Passwords | bcrypt (cost 12) |
| API Keys | SHA-256 hash |
| OTP | Temporal en cache (5 min TTL) |
| Refresh tokens | BD con hash |

### Protecciones

| Ataque | Mitigación |
|--------|------------|
| Brute force | Rate limiting, bloqueo temporal |
| Token theft | Expiración corta, HTTPS only |
| Session fixation | Regenerar token en login |
| CSRF | SameSite cookies, CSRF token |

---

## Alternativas Consideradas

### Magic Link para consumidor

**Pros:**
- UX muy simple (un click)

**Contras:**
- Requiere acceso al link (problema en WhatsApp → browser)
- Más fricción que OTP en móvil

**Razón de rechazo:** OTP es más natural en contexto móvil/WhatsApp.

### OAuth2 para B2B

**Pros:**
- Más seguro (tokens con expiración)
- Estándar de industria

**Contras:**
- Más complejo de implementar
- Overhead para integraciones simples

**Razón de rechazo:** API Keys son suficientes para el MVP. OAuth2 puede agregarse después si se requiere.

---

## Consecuencias

### Positivas

- **UX optimizada**: Cada actor tiene el método más conveniente
- **Seguridad adecuada**: Nivel de seguridad proporcional al riesgo
- **Simplicidad**: Sin dependencias externas de auth (Auth0, etc.)

### Negativas

- **Múltiples flujos**: Más código para mantener
- **OTP requiere proveedor**: Dependencia de SMS/WhatsApp

### Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Complejidad | Módulo de auth bien encapsulado |
| Costo OTP | WhatsApp preferido sobre SMS |
| Vendor lock-in | Abstracción de proveedor de mensajes |

---

## Referencias

- [OWASP Authentication Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [JWT Best Practices](https://auth0.com/blog/jwt-security-best-practices/)
