# 06-ops

Esta carpeta contiene la documentación operativa, incluyendo runbooks, SLOs, incidentes y disaster recovery.

## Estado actual

- `infraestructura.md`: base de arquitectura y ambientes.
- `slos.md`: objetivos operativos iniciales y politica de alertamiento.
- `runbooks/despliegue.md`: procedimiento de despliegue y rollback.
- `monitoring-alertas.md`: senales, dashboards y umbrales de alerta.
- `staging.md`: alcance, reglas y smoke tests del ambiente de pre-produccion.
- `runbooks/escalado.md`: escalado tecnico/operativo por trigger y severidad.
- `runbooks/incidentes-tipicos.md`: respuestas rapidas para incidentes recurrentes.
- `runbooks/checklist-caido.md`: checklist ejecutable para caidas de servicio.
- `incidentes.md`: severidades y plantilla de postmortem.

## Cómo rellenar

### SLOs / SLIs
- Crea `slos.md` con:
  - Disponibilidad API.
  - Latencia (p95).
  - Error rate.
  - Consistencia de colas/eventos.

### Runbooks
- Crea archivos de runbooks:
  - `despliegue.md`: Cómo desplegar.
  - `escalado.md`: Cómo escalar.
  - `incidentes-tipicos.md`: Respuesta a incidentes comunes.
  - `checklist-caido.md`: Checklist para servicio caído.

### Incidentes
- Crea `incidentes.md` con:
  - Plantilla de postmortem (sin culpas).
  - Severidades (SEV1-SEV4).
  - Proceso de comunicación interna.

### DR / Backups
- Crea `dr-backups.md` con:
  - RPO / RTO.
  - Procedimientos de restauración probados.
