# ADR-0005: Integración WhatsApp

> **Estado:** Aceptado
> **Fecha:** 2026-01-28
> **Decisores:** Equipo Qoa

---

## Contexto

WhatsApp es canal de comunicación para:

- Envío de OTP (autenticación)
- Notificaciones de transacciones
- Recordatorios de campañas
- Onboarding de usuarios

**Prioridad:** Media-baja para MVP (el core es la API REST)

---

## Decisión

**Abstracción de proveedor con interface común.**

### Interface

```
┌─────────────────────────────────────────────────┐
│              WhatsAppService                    │
├─────────────────────────────────────────────────┤
│  sendTemplate(to, template, params): Promise    │
│  sendText(to, message): Promise                 │
│  handleWebhook(payload): Promise                │
└─────────────────────────────────────────────────┘
```

### Proveedores evaluados

| Proveedor | Pros | Contras |
|-----------|------|---------|
| **Twilio** | Documentación, soporte, estabilidad | Costo alto |
| **360Dialog** | Económico, enfocado en WhatsApp | Menor ecosistema |
| **Meta Cloud API** | Sin intermediario, control total | Más complejo, sin soporte |

*Proveedor se decide en fase de implementación.*

---

## Casos de Uso

| Caso | Tipo | Template |
|------|------|----------|
| **OTP** | Transaccional | `otp_verification` |
| **Bienvenida** | Transaccional | `welcome_user` |
| **Transacción registrada** | Notificación | `transaction_confirmed` |
| **Threshold alcanzado** | Marketing | `reward_available` |
| **Recordatorio** | Marketing | `campaign_reminder` |

---

## Webhook

```
POST /webhooks/whatsapp

┌──────────┐     ┌──────────┐     ┌──────────┐
│ WhatsApp │     │   API    │     │  Event   │
│ Provider │────▶│ Webhook  │────▶│   Bus    │
└──────────┘     └──────────┘     └──────────┘
```

**Eventos manejados:**
- `message.received` - Respuestas de usuarios
- `message.delivered` - Confirmación de entrega
- `message.read` - Confirmación de lectura
- `message.failed` - Fallo de envío

---

## Fallback

Si WhatsApp falla:

1. Retry con backoff (3 intentos)
2. Log del error
3. SMS como fallback (opcional, costoso)
4. Notificación en app como último recurso

---

## Consecuencias

### Positivas

- **Flexibilidad**: Cambiar proveedor sin modificar lógica
- **Testeable**: Mock en desarrollo/tests
- **Costos controlados**: Templates pre-aprobados

### Negativas

- **Dependencia externa**: Disponibilidad del proveedor
- **Costos por mensaje**: Escala con uso
- **Aprobación de templates**: Proceso con Meta

---

## Referencias

- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Twilio WhatsApp](https://www.twilio.com/whatsapp)
- [360Dialog](https://www.360dialog.com/)
