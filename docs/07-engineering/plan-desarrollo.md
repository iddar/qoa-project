# Plan de Desarrollo Iterativo

Este plan divide la construcción del sistema en etapas consecutivas. Cada etapa tiene objetivos claros para **código**, **tests** y **documentación de APIs**, más una lista de TODOs para seguimiento.

---

## Etapa 0 · Preparación (Semana 0-1)

**Objetivo:** tener cimientos listos para desarrollar y validar.

- **Código:** scaffolding del repo, `bun` + `tsconfig`, estructura `/src/modules`, orquestador Docker para Postgres/Redis.
- **Tests:** configurar Bun test + integración en CI, definir helpers de factories/mocks.
- **API docs:** baseline de `openapi.yaml` con componentes comunes (auth, error responses).

**TODOs**
- [x] Crear template de módulo (controller, service, repo, schema).
- [x] Configurar lint (Oxclint y Oxfmt) + format en CI.
- [x] Inicializar `docs/03-apis/openapi.yaml` con info general y esquemas `Error`, `Pagination`.
- [x] Auditar `docs/03-apis/*` contra el modelo de datos antes de iniciar desarrollo.

---

## Etapa 1 · Autenticación y Usuarios (Semana 1-2)

- **Código:** módulos `auth` y `users` (registro WhatsApp, login magic link, dashboard admins).
- **Tests:** unit tests para servicios de OTP/magic link, contract tests para `/auth/*` endpoints.
- **API docs:** describir endpoints `/auth/login`, `/users/me`, flujos de tokens y errores.

**TODOs**
- [ ] Implementar servicio OTP (`sendLoginCode`, `verifyLoginCode`) con expiración configurable.
- [ ] Agregar unit tests cubriendo casos de OTP inválido/expirado.
- [ ] Documentar secuencia de login en `docs/03-apis/autenticacion.md` con diagramas.

---

## Etapa 2 · Stores y Cards (Semana 2-4)

- **Código:** CRUD de stores, emisión de cards, generación/rotación de QR codes.
- **Tests:** pruebas unitarias de generador de QR + integración para `/stores` y `/cards`.
- **API docs:** endpoints `/stores`, `/cards`, guidelines de idempotencia para emisión.

**TODOs**
- [ ] Implementar `stores.service` con validaciones (geografía, tipo).
- [ ] Crear job de rotación de QR y cubrirlo con tests de reloj simulado.
- [ ] Actualizar OpenAPI con esquemas `Store`, `Card`, `QrPayload`.

---

## Etapa 3 · Campañas y Motor de Reglas (Semana 3-6)

- **Código:** módulo `campaigns` completo (tiers, policies, scopes, capture modes, auditoría).
- **Tests:** unit tests del evaluador de policies y del motor de acumulaciones, pruebas de snapshot para auditoría (`campaign_audit_logs`).
- **API docs:** endpoints `/campaigns` (CRUD), `/campaigns/{id}/ready-for-review`, `/review`, `/confirm`, `/activate`, y documentación del workflow de flags.

**TODOs**
- [ ] Implementar `campaigns.version` y trigger para insertar en `campaign_audit_logs`.
- [ ] Escribir tests de regresión para combinaciones policy scope/product/brand.
- [ ] Mantener OpenAPI/AsyncAPI alineados a cambios en campañas y auditoría.

---

## Etapa 4 · Transacciones y Integraciones (Semana 5-7)

- **Código:** módulo `transactions` (registro manual + ingestión T-Conecta), `accumulations`, jobs antifraude.
- **Tests:** contract tests con fixtures JSON de transacciones, pruebas de integraciones simuladas (webhooks).
- **API docs:** `/transactions`, `/accumulations`, eventos AsyncAPI `transaction.created`, `accumulation.approved`.

**TODOs**
- [ ] Implementar consumos idempotentes de webhooks (store de hashes).
- [ ] Añadir pruebas end-to-end con transacciones híbridas (SKU + código).
- [ ] Documentar payloads de eventos en `docs/04-data/eventos.md` y AsyncAPI.

---

## Etapa 5 · Rewards y Canjes (Semana 6-8)

- **Código:** módulo `rewards`, `redemptions`, stock y workflows de aprobación.
- **Tests:** unit tests de reservas de stock, integración para `/rewards` y `/redemptions`.
- **API docs:** endpoints de catálogo de recompensas, canje y políticas de expiración.

**TODOs**
- [ ] Implementar lock optimista para `rewards.stock`.
- [ ] Cubrir canje parcial/retry en tests.
- [ ] Añadir secciones de “Reward Availability” en OpenAPI con ejemplos.

---

## Etapa 6 · Reportes y Observabilidad (Semana 7-9)

- **Código:** endpoints de reportes (tienda, CPG), export jobs, métricas.
- **Tests:** pruebas de performance para queries (mock DB), validación de agregaciones.
- **API docs:** `/reports/stores/*`, `/reports/cpg/*`, notas sobre paginación y filtros.

**TODOs**
- [ ] Implementar vistas materializadas/queries optimizadas documentadas en `docs/04-data/indices.md`.
- [ ] Añadir métricas (Prometheus) para tiempos de respuesta de reportes.
- [ ] Actualizar OpenAPI con parámetros de filtrado y ejemplos csv/json.

---

## Etapa 7 · Endgame y Hardening (Semana 9-10)

- **Código:** refactor final, limpieza de feature toggles, scripts de migración finales.
- **Tests:** cobertura >85%, pruebas de resiliencia (chaos) y seguridad básica (fuzz auth).
- **API docs:** freeze de OpenAPI/AsyncAPI, changelog, ejemplos finales.

**TODOs**
- [ ] Ejecutar pentest checklist de `docs/05-security`.
- [ ] Generar reportes de cobertura y adjuntarlos en CI.
- [ ] Publicar release notes y snapshot final de documentación (PDF/HTML).
