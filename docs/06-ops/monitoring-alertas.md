# Monitoring y Alertas - Qoa MVP

## Objetivo

Tener visibilidad operativa de API, jobs y webhooks para detectar regresiones rapido y escalar incidentes con criterios claros.

## Senales minimas

## `API`

- Requests por endpoint y por codigo HTTP.
- Error rate 5xx por minuto y por ruta.
- Latencia p95/p99 para rutas criticas:
  - `/v1/transactions`
  - `/v1/campaigns/*`
  - `/v1/rewards/*`
  - `/v1/reports/*`

## `Jobs`

- Jobs `reminder_jobs` en estado `queued`, `processing`, `failed`.
- Edad maxima de jobs en cola (`now - scheduled_for`).
- Tasa de reintento/fallo por ventana de 15 minutos.

## `Webhook WhatsApp`

- Total recibido, replayed, error.
- Ratio de firmas invalidas.
- Tiempo de procesamiento de ingestiones.

## `Alertas de dominio`

- Eventos persistidos en `alert_notifications`.
- Volumen de notificaciones por severidad.
- Alertas no enviadas (estado `failed`, cuando aplique proveedor real).

## Dashboard operativo recomendado

- Panel 1: Salud global API (availability, error rate, p95).
- Panel 2: Funnel transaccional (transactions -> accumulations -> redemptions).
- Panel 3: Operacion reminders + WhatsApp webhook.
- Panel 4: Alertas activas y tendencia por severidad.

## Umbrales de alerta (iniciales)

- `SEV1`
  - availability < 98% por 30 minutos, o
  - error rate > 5% por 10 minutos.
- `SEV2`
  - p95 > 1s por 15 minutos, o
  - jobs con atraso > 15 minutos por 30 minutos.
- `SEV3`
  - incremento sostenido de replays/signature failures sin caida total.

## Integraciones y ownership

- Canal principal: email (mock actual, proveedor real pendiente).
- Canal recomendado siguiente: Slack/PagerDuty para SEV1-SEV2.
- Owner primario: On-call backend.
- Owner secundario: soporte de plataforma.

## Practicas operativas

- Revisar dashboard al inicio de cada deploy.
- Ejecutar prueba de alerta sintetica semanal.
- Registrar incidentes y acciones correctivas en runbook/postmortem.
