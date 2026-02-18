# Ambiente Staging - Qoa MVP

## Objetivo

Contar con un ambiente pre-produccion estable para validar cambios funcionales, regresiones y readiness operativa antes de promover a `production`.

## Alcance del ambiente

- API backend completa (Bun + Elysia).
- Base PostgreSQL y Redis dedicadas de staging.
- Frontends `apps/backoffice` y `apps/cpg-portal` desplegados.
- Semillas de datos sinteticos representativos.

## Reglas de configuracion

- Misma configuracion de features que produccion, salvo integraciones externas de alto impacto (usar sandbox cuando exista).
- Variables de entorno separadas por completo de produccion.
- Secretos de staging con rotacion periodica.
- Logging y metricas habilitadas con retencion menor que produccion.

## Flujo de promotion

1. Merge a `main`.
2. CI en verde (backend + frontends).
3. Deploy automatico a staging.
4. Smoke tests funcionales y operativos.
5. Aprobacion manual para promocion a production.

## Smoke tests minimos

- `GET /v1/health` responde 200.
- Login de backoffice y cpg-portal.
- Crear campana y agregar politica.
- Crear recompensa y listar recompensas.
- Registrar transaccion y verificar summary de campana.
- Ingerir webhook WhatsApp firmado.
- Ejecutar `/v1/jobs/reminders/run` y validar cola.

## Datos y mantenimiento

- Reset semanal de DB staging con snapshot semilla.
- No usar datos reales sensibles.
- Conservar trazas de los ultimos deploys para debugging.

## Criterios para considerar staging "saludable"

- Error rate < 1% en pruebas de smoke.
- p95 < 500ms en endpoints core bajo carga ligera.
- Sin migraciones pendientes.
- Sin alertas SEV1/SEV2 abiertas.
