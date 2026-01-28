# TODO - Proyecto Qoa

> Seguimiento de compromisos y avances del proyecto

---

## Fase 1: Especificación Fundacional

### Documentos de Overview
- [x] `docs/01-overview/glosario.md` - Términos del dominio
- [x] `docs/01-overview/vision.md` - Qué SI y NO hace el MVP
- [x] `docs/01-overview/alcance.md` - Scope de "Conectados"

### Arquitectura
- [ ] `docs/02-architecture/nfrs.md` - Requerimientos no funcionales

---

## Fase 2: Decisiones Arquitectónicas (ADRs)

- [ ] `docs/adr/0001-estilo-arquitectura.md` - Modular Monolith vs Microservicios
- [ ] `docs/adr/0002-base-de-datos.md` - PostgreSQL como BD principal
- [ ] `docs/adr/0003-autenticacion.md` - Magic link, JWT, API Keys
- [ ] `docs/adr/0004-mensajeria.md` - BullMQ/Redis para eventos
- [ ] `docs/adr/0005-integracion-whatsapp.md` - Proveedor WhatsApp
- [ ] `docs/adr/0006-generacion-qr.md` - Estrategia de códigos QR
- [ ] `docs/adr/0007-multi-tenancy.md` - Modelo multi-tenant

---

## Fase 3: Diseño de APIs

- [ ] `docs/03-apis/openapi.yaml` - REST API completa
- [ ] `docs/03-apis/asyncapi.yaml` - Eventos del sistema
- [ ] `docs/03-apis/autenticacion.md` - Flujos de auth
- [ ] `docs/03-apis/errores.md` - Catálogo de códigos de error

---

## Fase 4: Modelo de Datos

- [ ] `docs/04-data/modelo-datos.md` - Diagrama ER
- [ ] `docs/04-data/diccionario.md` - Descripción de tablas/columnas
- [ ] `docs/04-data/indices.md` - Índices para performance
- [ ] `docs/04-data/eventos.md` - Eventos de dominio

---

## Fase 5: Implementación Backend

### Sprint 1
- [ ] Setup proyecto (tsconfig, eslint, prettier)
- [ ] Configuración base de datos y migraciones
- [ ] Middleware logging con trace_id
- [ ] Middleware manejo de errores
- [ ] Health check endpoint
- [ ] Docker Compose para desarrollo

### Sprint 2
- [ ] Módulo Users
- [ ] Módulo Stores
- [ ] Módulo Cards
- [ ] Integración WhatsApp básica

### Sprint 3
- [ ] Módulo Campaigns
- [ ] Módulo Transactions
- [ ] Motor de reglas (puntos/estampas)
- [ ] Balance tracking

### Sprint 4
- [ ] Módulo Rewards
- [ ] Módulo Reports
- [ ] Jobs de recordatorios
- [ ] Webhook WhatsApp

---

## Fase 6: Implementación Frontend

- [ ] App Tarjeta Digital (PWA)
- [ ] Dashboard Tienda
- [ ] Admin Panel
- [ ] Tests E2E

---

## Fase 7: Operaciones

- [ ] `docs/06-ops/infraestructura.md`
- [ ] `docs/06-ops/slos.md`
- [ ] `docs/06-ops/runbooks/despliegue.md`
- [ ] Pipeline CI/CD
- [ ] Monitoring y alertas
- [ ] Ambiente staging

---

## Historial de Avances

| Fecha | Avance |
|-------|--------|
| 2026-01-28 | Creación del plan inicial y estructura de documentación |
| 2026-01-28 | Completado glosario de términos del dominio |
| 2026-01-28 | Completado documento de visión del MVP |
| 2026-01-28 | Completado documento de alcance del MVP |

---

## Notas

- Cada documento se trabajará colaborativamente antes de marcarlo como completado
- Los ADRs requieren decisión explícita antes de proceder con implementación
