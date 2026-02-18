# SLOs y SLIs - Qoa MVP

## Alcance

Este documento define objetivos operativos iniciales para API, jobs y webhook de WhatsApp en fase MVP.

## Ventana y medicion

- Ventana de cumplimiento: mensual (30 dias moviles).
- Fuentes de datos: logs de API, metricas de endpoints operativos y base de datos de eventos.
- Ambito de SLO: `staging` y `production` (development no cuenta para cumplimiento).

## Objetivos

## `API availability`

- SLI: porcentaje de requests exitosas sobre total (2xx/3xx).
- SLO: >= 99.5% mensual.
- Error budget: 0.5% mensual.

## `API latency p95`

- SLI: latencia p95 de endpoints core (`/transactions`, `/campaigns`, `/rewards`, `/reports/*`).
- SLO: <= 500ms p95 mensual.
- Exclusion: ventanas de mantenimiento anunciadas.

## `Error rate`

- SLI: porcentaje de respuestas 5xx sobre requests totales.
- SLO: < 1% mensual.
- Nota: errores 4xx por validacion o auth no impactan este SLO.

## `Reminder jobs freshness`

- SLI: jobs de recordatorio procesados dentro de 15 minutos desde `scheduled_for`.
- SLO: >= 99% mensual.

## `Webhook reliability`

- SLI: eventos webhook validos ingeridos y persistidos sin perdida.
- SLO: >= 99.9% mensual.
- Seguimiento adicional: ratio de replays e invalid signatures.

## Politica de alertamiento

- SEV1: disponibilidad < 98% en 30 min o error rate > 5% por 10 min.
- SEV2: latencia p95 > 1s por 15 min o jobs freshness < 95% por 30 min.
- SEV3: degradacion parcial sin impacto mayor a conversion.

## Revision y gobernanza

- Revision semanal de tendencias de SLI.
- Revision mensual de cumplimiento y consumo de error budget.
- Si el error budget se agota: pausar features no criticas hasta recuperar estabilidad.
