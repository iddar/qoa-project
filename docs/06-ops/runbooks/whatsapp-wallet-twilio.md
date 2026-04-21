# Setup WhatsApp Wallet con Twilio

Este documento resume lo que falta configurar fuera del código para dejar operativo el onboarding de wallet por WhatsApp en QOA y qué pruebas manuales conviene ejecutar antes de abrirlo a usuarios reales.

## URLs productivas

- API pública: `https://qoacore-production.up.railway.app`
- Webhook Twilio inbound: `https://qoacore-production.up.railway.app/v1/whatsapp/twilio/webhook`
- Sender WhatsApp: `whatsapp:+12182204117`

## Variables de entorno requeridas

Configurar en Railway para `@qoa/core`:

- `PUBLIC_BASE_URL=https://qoacore-production.up.railway.app`
- `TWILIO_ACCOUNT=<Account SID>`
- `TWILIO_AUTH=<Auth Token>`
- `TWILIO_WHATSAPP_FROM=whatsapp:+12182204117`
- `TWILIO_MEDIA_SIGNING_SECRET=<secret aleatorio largo>`

Recomendaciones:

- Usar un secret exclusivo para `TWILIO_MEDIA_SIGNING_SECRET`.
- Verificar que `PUBLIC_BASE_URL` coincida exactamente con la URL configurada en Twilio; la validación de firma depende de eso.

## Configuración en Twilio Console

En el WhatsApp Sender `+12182204117`:

1. Ir a `Messaging > Senders > WhatsApp senders`.
2. Abrir el sender `Sistema de lealtad Qoa`.
3. Configurar `Webhook URL for incoming messages` con:
   - `https://qoacore-production.up.railway.app/v1/whatsapp/twilio/webhook`
4. Configurar `Webhook method for incoming messages URL` como:
   - `HTTP POST`
5. Dejar vacío por ahora:
   - `Fallback URL for incoming messages`
   - `Status callback URL`

## Contrato del QR de tienda

El QR que se entrega a cada tienda debe abrir WhatsApp con el código de la tienda en el texto precargado.

Formato recomendado:

```text
https://wa.me/12182204117?text=sto_xxxxxxxxxxxxxxxxxxxx
```

Reglas:

- El número en `wa.me` va sin `+`.
- El texto precargado debe ser el `stores.code` real de la tienda.
- No incluir nombre de tienda como fuente de verdad.
- No incluir JSON ni UUIDs manuales en el QR.

## Flujo esperado en producción

1. El cliente escanea el QR de la tienda.
2. Se abre WhatsApp con el mensaje precargado `sto_xxx`.
3. QOA registra o recupera al usuario por teléfono.
4. QOA registra la relación entre usuario y tienda.
5. Si el usuario no tiene nombre, se le pide.
6. Si el usuario no tiene fecha de nacimiento, se le pide en formato `DD/MM/YYYY`.
7. QOA asegura la tarjeta universal de wallet.
8. QOA responde con el mismo QR universal como imagen PNG.

## Checklist de despliegue

1. Aplicar la migración nueva en producción.
2. Confirmar que las variables `TWILIO_*` y `PUBLIC_BASE_URL` ya están en Railway.
3. Redeploy del servicio `@qoa/core`.
4. Configurar el webhook en Twilio Console.
5. Probar con un número real o de QA que tenga sesión de WhatsApp activa.

## Pruebas manuales recomendadas

### 1. Alta nueva completa

1. Escanear QR de una tienda válida.
2. Verificar que llega el mensaje precargado `sto_xxx`.
3. Enviar el mensaje.
4. Confirmar que el bot pide nombre.
5. Responder con un nombre.
6. Confirmar que el bot pide fecha en `DD/MM/YYYY`.
7. Responder con una fecha válida.
8. Confirmar que llega una imagen PNG con el QR.

Esperado:

- Se crea el usuario con el teléfono.
- Se guarda nombre.
- Se guarda fecha de nacimiento.
- Se crea una sola tarjeta universal.
- Se crea la relación usuario-tiendita.

### 2. Usuario existente, nueva tienda

1. Repetir el flujo desde otra tienda con otro `stores.code`.
2. Enviar solo el código de la nueva tienda.

Esperado:

- No se crea otro usuario.
- No se crea otra tarjeta universal.
- Se crea una segunda relación usuario-tienda.
- Llega el mismo QR que en el alta original.

### 3. Código de tienda inválido

1. Enviar un texto con `sto_` inexistente.

Esperado:

- El bot responde que no reconoce el código.
- No debe crear usuario ni relación nueva.

### 4. Fecha inválida

1. Avanzar hasta el paso de fecha.
2. Enviar algo como `1994-11-07` o `31/02/2020`.

Esperado:

- El bot rechaza la fecha.
- Sigue esperando `DD/MM/YYYY`.

### 5. Reenvío del QR firmado

1. Completar el alta.
2. Revisar que el mensaje recibido incluya la imagen del QR.
3. Abrir la imagen y validar que el lector/POS resuelve la tarjeta.

Esperado:

- Twilio descarga la imagen correctamente.
- El QR codifica el mismo `card.code` que ya usa la wallet.

## Validaciones de datos recomendadas en DB

Después de la prueba manual, revisar:

- `users`
  - teléfono correcto
  - `name`
  - `birth_date`
- `user_store_enrollments`
  - una fila por cada tienda enrolada
  - `enrollment_count` incrementa si repite la misma tienda
- `whatsapp_onboarding_sessions`
  - estado final `completed`
- `cards`
  - una sola tarjeta universal por usuario
- `whatsapp_messages`
  - inbound Twilio registrado
  - outbound Twilio registrado

## Riesgos operativos a revisar

- Si cambia el dominio público, hay que actualizar `PUBLIC_BASE_URL` y Twilio Console.
- Si cambia el sender, hay que actualizar `TWILIO_WHATSAPP_FROM`.
- El QR firmado expira rápido; no debe usarse como URL persistente. La persistencia real sigue siendo `card.code`.
- El flujo depende de que el usuario haya iniciado la conversación dentro de la ventana activa de WhatsApp.

## Pendientes opcionales para una siguiente iteración

- `Status callback URL` de Twilio para tracking de entregado/fallido.
- Templates de WhatsApp para mensajes fuera de ventana.
- Dashboard/observabilidad específica del onboarding por WhatsApp.
- Herramienta administrativa para regenerar o reenviar el QR manualmente.
