# Checklist Servicio Caido

## Objetivo

Tener una lista corta y ejecutable para restaurar servicio ante caida total o casi total.

## Checklist rapido (primeros 10 minutos)

1. Confirmar incidente y alcance real (API, frontend, jobs, webhook).
2. Declarar severidad inicial (SEV1 si impacto mayor).
3. Abrir canal de incidente y asignar incident commander.
4. Verificar salud de dependencias criticas: PostgreSQL, Redis, DNS, TLS.
5. Revisar ultimo deploy y cambios de configuracion.
6. Ejecutar rollback si hay alta probabilidad de regresion.
7. Validar recuperacion con:
   - `GET /v1/health`
   - login
   - transaccion simple

## Checklist de estabilizacion

1. Confirmar que error rate vuelve a rango.
2. Confirmar que latencia p95 vuelve a rango.
3. Confirmar drenaje de jobs pendientes.
4. Monitorear 30 minutos sin recaidas.

## Checklist post incidente

1. Registrar timeline y decisiones.
2. Publicar resumen para stakeholders.
3. Crear postmortem sin culpa y acciones de prevencion.
4. Priorizar fixes permanentes en backlog.
