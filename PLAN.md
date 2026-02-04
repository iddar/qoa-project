# Plan de Acción - Proyecto Qoa

## Resumen Ejecutivo

**Qoa** es un sistema centralizado de administración de programas de lealtad. El MVP "Conectados" se enfoca en loyalty para tenderos vía WhatsApp/QR.

**Estado Actual:** Fase de documentación/scaffolding - sin código implementado.

---

## Fases del Plan

### FASE 1: Especificación Fundacional (Semana 1-2)

**Objetivo:** Completar documentación base que guiará todas las decisiones

**Entregables:**

| Archivo | Descripción |
|---------|-------------|
| `docs/01-overview/vision.md` | Qué SI hace / qué NO hace el MVP |
| `docs/01-overview/alcance.md` | Scope de "Conectados", exclusiones |
| `docs/01-overview/glosario.md` | Términos: PLI, CPG, estampa, punto, wallet |
| `docs/02-architecture/nfrs.md` | Disponibilidad, latencia, volumen inicial |

---

### FASE 2: Decisiones Arquitectónicas (Semana 2-3)

**Objetivo:** Documentar decisiones técnicas clave via ADRs

**ADRs a crear:**

| ADR | Tema | Prioridad |
|-----|------|-----------|
| `0001-estilo-arquitectura.md` | Modular Monolith vs Microservicios | CRÍTICA |
| `0002-base-de-datos.md` | PostgreSQL como BD principal | CRÍTICA |
| `0003-autenticacion.md` | Magic link (usuarios), JWT (dashboard), API Keys (B2B) | CRÍTICA |
| `0004-mensajeria.md` | BullMQ/Redis para eventos | ALTA |
| `0005-integracion-whatsapp.md` | Proveedor (Twilio/360Dialog) | ALTA |
| `0006-generacion-qr.md` | Estrategia de códigos QR | MEDIA |
| `0007-multi-tenancy.md` | Modelo multi-tenant | ALTA |

---

### FASE 3: Diseño de APIs (Semana 3-5)

**Objetivo:** Definir contratos de API antes de implementar

**Entregables:**

| Archivo | Contenido |
|---------|-----------|
| `docs/03-apis/openapi.yaml` | REST API completa (users, cards, transactions, campaigns, rewards) |
| `docs/03-apis/asyncapi.yaml` | Eventos (user.created, transaction.completed, etc.) |
| `docs/03-apis/autenticacion.md` | Flujos de auth |
| `docs/03-apis/errores.md` | Catálogo de códigos de error |

**Endpoints principales:**
- `/users` - Registro vía WhatsApp
- `/cards` - Emisión y QR de tarjetas
- `/transactions` - Registro de compras
- `/campaigns` - Configuración de campañas
- `/rewards` - Catálogo y canje
- `/stores` - Gestión de tiendas
- `/reports` - Reportes para tienda y CPG

---

### FASE 4: Modelo de Datos (Semana 4-6)

**Objetivo:** Definir esquema de base de datos

**Entregables:**

| Archivo | Contenido |
|---------|-----------|
| `docs/04-data/modelo-datos.md` | Diagrama ER con entidades principales |
| `docs/04-data/diccionario.md` | Descripción de cada tabla/columna |
| `docs/04-data/indices.md` | Índices para performance |
| `docs/04-data/eventos.md` | Eventos de dominio |

**Entidades principales:**
- `users` - Usuarios con teléfono único
- `stores` - Tiendas con QR de registro
- `cards` - Tarjetas de lealtad por usuario/tienda
- `campaigns` - Configuración de programas (puntos/estampas)
- `transactions` - Historial de compras
- `rewards` - Catálogo de recompensas
- `balances` - Saldo de puntos/estampas

---

### FASE 5: Implementación Backend (Semana 5-12)

**Objetivo:** Construir API y lógica de negocio

**Stack Tecnológico:**
- **Runtime:** Node.js 20 / Bun
- **Framework:** Elysia
- **ORM:** Drizzle ORM
- **BD:** PostgreSQL 16
- **Cache/Queue:** Redis + BullMQ
- **WhatsApp:** Twilio o 360Dialog
- **Validación:** elysia incluye typeBox { t }  optional: Zod
- **Testing:** Bun test

**Sprints:**

| Sprint | Semana | Entregables |
|--------|--------|-------------|
| 1 | 5-6 | Setup proyecto, DB, middleware logging/errors, Docker Compose |
| 2 | 7-8 | Módulos Users, Stores, Cards + WhatsApp básico |
| 3 | 9-10 | Módulos Campaigns, Transactions, motor de reglas |
| 4 | 11-12 | Módulos Rewards, Reports, Jobs recordatorios |

**Estructura del proyecto:**
```
/src
├── /modules (users, cards, campaigns, transactions, rewards, stores, reports)
├── /integrations (whatsapp, tconecta)
├── /shared (db, events, middleware, utils)
└── /jobs (reminder, reports)
```

---

### FASE 6: Implementación Frontend (Semana 9-14)

**Objetivo:** Construir interfaces de usuario

**Aplicaciones:**

| App | Usuarios | Tecnología |
|-----|----------|------------|
| Tarjeta Digital | Clientes finales | Next.js PWA (mobile-first) |
| Dashboard Tienda | Tenderos | Next.js |
| Admin Panel | Qoa interno | Next.js + shadcn/ui |

**Pantallas Tarjeta Digital:**
- Landing/Onboarding
- Mi Tarjeta (QR, puntos/estampas, progreso)
- Historial de transacciones
- Catálogo de recompensas

**Pantallas Dashboard Tienda:**
- Resumen del día
- Escanear (cámara QR + barcode)
- Lista de clientes
- Reportes

---

### FASE 7: Operaciones (Semana 5-14, paralelo)

**Objetivo:** Infraestructura, CI/CD, monitoring

**Entregables:**

| Archivo | Contenido |
|---------|-----------|
| `docs/06-ops/infraestructura.md` | Stack de cloud (ECS/Railway, RDS, Redis) |
| `docs/06-ops/slos.md` | Targets de disponibilidad, latencia, error rate |
| `docs/06-ops/runbooks/*.md` | Despliegue, rollback, escalado, incidentes |

**SLOs iniciales:**
- Disponibilidad API: 99.5%
- Latencia p95: < 500ms
- Error rate: < 1%
- Tiempo de escaneo: < 3s

**CI/CD Pipeline:**
- Lint + Tests
- Security scan
- Deploy staging
- Deploy producción (manual approval)

---

## Cronograma Visual

```
Semana:     1    2    3    4    5    6    7    8    9   10   11   12   13   14
FASE 1     ████████
FASE 2          ████████
FASE 3               ████████████████
FASE 4                    ████████████████
FASE 5                         ████████████████████████████████
FASE 6                                               ████████████████████████
FASE 7                         ████████████████████████████████████████████████
```

**Duración total:** 12-14 semanas hasta MVP funcional

---

## Archivos Críticos a Modificar/Crear

1. `docs/01-overview/vision.md` - Definir scope del MVP
2. `docs/adr/0001-estilo-arquitectura.md` - Decisión fundacional
3. `docs/03-apis/openapi.yaml` - Contrato de API
4. `docs/04-data/modelo-datos.md` - ERD y esquema
5. `docs/02-architecture/nfrs.md` - Requerimientos no funcionales

---

## Riesgos Identificados

| Riesgo | Mitigación |
|--------|------------|
| Integración WhatsApp compleja | POC temprano, proveedor alternativo |
| T-Conecta no responde | API de fallback manual |
| Escaneo lento en tienda | Workaround con código alfanumérico |
| Adopción de tenderos baja | UX ultra simple, onboarding guiado |

---

## Verificación

Para validar el plan:
1. Revisar que los NFRs sean realistas para el MVP
2. Validar stack tecnológico con el equipo
3. Confirmar disponibilidad de APIs de WhatsApp y T-Conecta
4. Definir métricas de éxito del piloto antes de implementar

---

## Próximos Pasos Inmediatos

1. **Completar Fase 1** - Escribir documentos de visión, alcance, glosario y NFRs
2. **Escribir ADR-0001** - Decidir estilo arquitectónico (recomendación: Modular Monolith)
3. **POC WhatsApp** - Validar integración con proveedor seleccionado
4. **Diseñar OpenAPI** - Definir contratos antes de código
