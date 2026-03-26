# Staging Dockerizado

## Objetivo

Operar staging de QOA en un droplet con `caddy` en host y toda la aplicacion QOA dentro de Docker.

## Componentes

- `caddy` en host para TLS y reverse proxy.
- `postgres` en Docker.
- `api` en Docker.
- `backoffice` en Docker.
- `cpg-portal` en Docker.
- `store-dashboard` en Docker.
- `digital-wallet` en Docker.

## Scripts

- `scripts/staging/backup-legacy.sh`: respalda Caddy, systemd y archivos legacy.
- `scripts/staging/remove-legacy.sh`: remueve QOA viejo y opcionalmente PostgreSQL nativo.
- `scripts/staging/setup-host.sh`: instala Docker/Git y prepara `/srv/qoa`.
- `scripts/staging/deploy-staging.sh`: despliega un ref con rebuild completo de DB staging.
- `scripts/staging/rollback-staging.sh`: vuelve al ref previo registrado.
- `scripts/staging/smoke-test.sh`: valida salud de API y frontends.
- `scripts/staging/render-caddy.sh`: genera el bloque Caddy usando `staging.env`.

## Flujo sugerido

1. Ejecutar backup legacy.
2. Ejecutar limpieza legacy.
3. Preparar deploy key de GitHub y acceso SSH desde CI.
4. Ejecutar setup del host.
5. Editar `/srv/qoa/env/staging.env`.
6. Integrar el Caddy renderizado en `/etc/caddy/Caddyfile`.
7. Ejecutar deploy inicial.

## Notas

- El deploy rehace `staging` desde cero con `bun run db:rebuild:staging`.
- `staging` no usa Redis por ahora.
- El smoke test valida `GET /v1/health` y la carga base de las apps web.
- Los puertos host sugeridos para evitar choques con servicios legacy son `3100-3104`.
