# Runbook de Despliegue

## Objetivo

Ejecutar despliegues seguros de API y aplicaciones web con validaciones previas y rollback rapido.

## Prerrequisitos

- Acceso al proveedor de infraestructura.
- Secretos y variables de entorno cargados para el ambiente objetivo.
- Migraciones de DB revisadas y versionadas.
- Estado de rama limpio y commit identificado para despliegue.

## Checklist previo

1. Confirmar que CI esta en verde:
   - `bun run lint` (backend y apps)
   - `bun test spec`
   - `bun run typecheck` en backend
2. Validar cambios de contrato API en `docs/03-apis/openapi.yaml`.
3. Revisar impacto en migraciones y orden de ejecucion.
4. Verificar plan de rollback para el release.

## Flujo de despliegue a staging

1. Publicar build desde commit objetivo.
2. Ejecutar migraciones en staging.
3. Correr smoke tests:
   - `GET /v1/health`
   - login de backoffice
   - create/list campaign basico
   - webhook de prueba (firma valida)
4. Revisar logs y metricas por 15 minutos.

## Flujo de despliegue a produccion

1. Confirmar aprobacion manual del release.
2. Activar modo de despliegue gradual (rolling/canary, segun proveedor).
3. Ejecutar migraciones compatibles hacia adelante.
4. Monitorear:
   - error rate
   - latencia p95
   - jobs de reminders
   - ingestion de webhook
5. Cerrar release al cumplir 30 minutos sin incidentes.

## Rollback

## Condiciones de rollback inmediato

- Error rate > 5% sostenido por 10 minutos.
- Fallo de auth generalizado.
- Fallo de migracion que comprometa operaciones core.

## Pasos

1. Revertir a la version previa estable del servicio.
2. Si aplica, ejecutar rollback de migraciones solo si son reversibles y seguras.
3. Validar `GET /v1/health` y flujo minimo transaccional.
4. Comunicar incidente y abrir postmortem.

## Post despliegue

- Registrar version desplegada, hora, owner y resultados.
- Crear tareas de seguimiento si hubo degradacion menor.
