# Runbook de Escalado

## Objetivo

Definir como escalar capacidad y atencion operativa cuando la demanda o la degradacion superan los limites normales.

## Tipos de escalado

- Escalado tecnico: aumentar replicas/recursos de servicios.
- Escalado operativo: involucrar mas personas por severidad.

## Triggers tecnicos

- CPU > 75% sostenido por 10 minutos.
- Memoria > 80% sostenida por 10 minutos.
- Cola de reminders creciendo sin drenaje por 15 minutos.
- p95 > 1s en endpoints core por 15 minutos.

## Acciones de escalado tecnico

1. Incrementar replicas de API (x2 como primer paso).
2. Revisar conexiones activas y saturacion de PostgreSQL.
3. Verificar uso de Redis (memoria, latencia, eviction).
4. Reducir carga no critica (jobs batch o tareas internas).
5. Validar recuperacion de SLI en 10-15 minutos.

## Escalado operativo por severidad

- `SEV1`: convocar on-call backend + owner de plataforma + liderazgo tecnico inmediato.
- `SEV2`: on-call backend + soporte plataforma en < 15 minutos.
- `SEV3`: owner de modulo durante horario laboral.

## Comunicacion

- Canal unico del incidente (chat/thread dedicado).
- Actualizacion cada 15 minutos en SEV1/SEV2.
- Registrar decisiones, tiempos y responsables.

## Cierre

- Cuando SLIs vuelven a rango y riesgo residual es bajo.
- Documentar acciones permanentes (hardening) en backlog.
