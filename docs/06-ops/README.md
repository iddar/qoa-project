# 06-ops

Esta carpeta contiene la documentación operativa, incluyendo runbooks, SLOs, incidentes y disaster recovery.

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