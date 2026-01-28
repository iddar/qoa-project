# ADR-0006: Generación de Códigos QR

> **Estado:** Aceptado
> **Fecha:** 2026-01-28
> **Decisores:** Equipo Qoa

---

## Contexto

El sistema utiliza códigos QR para:

1. **QR de Registro (PDV)**: El consumidor lo escanea para afiliarse
2. **QR de Tarjeta (Usuario)**: El PDV/sistema lo escanea para registrar transacciones

---

## Decisión

**Generación server-side con URLs firmadas.**

### Tipos de QR

| Tipo | Contenido | Generación | Validez |
|------|-----------|------------|---------|
| **QR Registro PDV** | URL con store_id | Al crear PDV | Permanente |
| **QR Tarjeta Usuario** | URL con card_id + signature | On-demand | Configurable |

---

## Estructura de URLs

### QR de Registro (PDV)

```
https://qoa.app/r/{store_code}

Ejemplo: https://qoa.app/r/ABC123
```

- `store_code`: Código único del PDV (6-8 caracteres)
- Redirige a flujo de registro vía WhatsApp o web

### QR de Tarjeta (Usuario)

```
https://qoa.app/c/{card_code}?s={signature}

Ejemplo: https://qoa.app/c/USR456XYZ?s=a1b2c3
```

- `card_code`: Código único de la tarjeta
- `signature`: HMAC para prevenir falsificación
- Opcionalmente puede incluir timestamp para expiración

---

## Generación

### Librería

Generación server-side (agnóstico a librería específica):

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Request │────▶│ Generate │────▶│  PNG/SVG │
│  QR Code │     │   URL    │     │  Output  │
└──────────┘     └──────────┘     └──────────┘
```

### Formatos de salida

| Formato | Uso |
|---------|-----|
| **SVG** | Web, escalable |
| **PNG** | Impresión, compartir |
| **Base64** | Embebido en respuesta |

---

## Seguridad

### Prevención de falsificación

```
signature = HMAC-SHA256(card_id + timestamp, secret_key)
```

- Signature verificada en cada escaneo
- Timestamp opcional para QRs temporales
- Secret key rotable

### Rate limiting

| Acción | Límite |
|--------|--------|
| Generar QR | 10/minuto por usuario |
| Escanear QR | 60/minuto por PDV |
| QR inválido | Bloqueo temporal después de 5 intentos |

---

## Fallback

Si el escaneo QR falla:

1. **Código alfanumérico**: Usuario dicta código de 6 caracteres
2. **Búsqueda por teléfono**: PDV busca al usuario por número

```
QR Code: [████████]
Código manual: ABC-123
```

---

## Almacenamiento

| Dato | Almacenamiento |
|------|----------------|
| QR de PDV | Generado on-demand, cacheado |
| QR de Tarjeta | Generado on-demand, no persistido |
| Códigos usados | Log para auditoría |

---

## Consecuencias

### Positivas

- **Simple**: URLs estándar, cualquier lector QR funciona
- **Seguro**: Signatures previenen falsificación
- **Fallback**: Código manual si QR falla

### Negativas

- **Dependencia de internet**: Requiere conexión para validar
- **Tamaño de QR**: URLs largas = QR más denso

---

## Referencias

- [QR Code Best Practices](https://www.qrcode.com/en/howto/)
- [HMAC Security](https://datatracker.ietf.org/doc/html/rfc2104)
