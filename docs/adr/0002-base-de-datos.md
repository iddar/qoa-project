# ADR-0002: Base de Datos

> **Estado:** Aceptado
> **Fecha:** 2026-01-28
> **Decisores:** Equipo Qoa

---

## Contexto

El sistema Qoa requiere persistencia para:

- Usuarios, PDVs, tarjetas de lealtad
- Campañas con reglas configurables
- Transacciones de alta frecuencia (50-200 TPS)
- Balances y recompensas
- Reportes y analytics

**Requisitos:**
- Consistencia ACID para transacciones financieras
- Soporte para queries complejos (reportes)
- Flexibilidad para schemas que evolucionan
- Retención de datos 5+ años
- RPO < 15 minutos

---

## Decisión

**PostgreSQL como base de datos principal.**

### Características a utilizar

| Feature | Uso |
|---------|-----|
| **JSONB** | Configuración flexible de campañas, metadata |
| **Índices parciales** | Queries eficientes por tenant |
| **CTEs** | Queries de reportes complejos |
| **Triggers** | Auditoría automática (created_at, updated_at) |
| **Extensions** | uuid-ossp, pg_trgm (búsqueda fuzzy) |

---

## Colas y Eventos

**Diseño agnóstico al driver.**

```
                ┌─────────────────┐
                │  QueueService   │  ← Interface abstracta
                └────────┬────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌──────────┐
    │ BullMQ  │    │ Postgres │    │ InMemory │
    │ + Redis │    │  Queue   │    │ (tests)  │
    └─────────┘    └──────────┘    └──────────┘
```

**Driver inicial:** Por definir en fase de implementación

**Casos de uso:**
- Envío de notificaciones (WhatsApp)
- Generación de reportes
- Recordatorios programados
- Procesamiento batch

---

## Hosting

**Managed PostgreSQL** (proveedor por definir)

**Criterios de selección:**
- Backups automáticos (< 15 min RPO)
- Read replicas disponibles
- Escalado vertical/horizontal
- Connection pooling incluido
- Monitoreo integrado

*Decisión de proveedor se tomará al iniciar implementación.*

---

## Alternativas Consideradas

### MySQL / MariaDB

**Pros:**
- Más simple de operar
- Amplia adopción

**Contras:**
- JSONB menos potente que PostgreSQL
- Fewer advanced features

**Razón de rechazo:** PostgreSQL ofrece más flexibilidad para schemas evolutivos y mejores capacidades de JSONB.

### MongoDB

**Pros:**
- Schema flexible nativo
- Horizontal scaling built-in

**Contras:**
- Consistencia eventual por defecto
- Transacciones multi-documento más complejas
- Menos adecuado para reportes relacionales

**Razón de rechazo:** Necesitamos consistencia ACID para transacciones de lealtad. Los reportes requieren JOINs eficientes.

---

## Schema de Alto Nivel

```
    ┌─────────────┐
    │    users    │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │    cards    │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐          ┌─────────────┐
    │transactions │─────────▶│   stores    │
    └──────┬──────┘          └─────────────┘
           │
           ▼
    ┌─────────────┐          ┌─────────────┐
    │  campaigns  │─────────▶│   rewards   │
    └─────────────┘          └─────────────┘

    ┌─────────────┐
    │  balances   │  ← Trackea acumulación por card/campaign
    └─────────────┘
```

**Flujo:**
1. `user` tiene `cards`
2. `card` registra `transactions`
3. `transaction` conecta con `store` (PDV de entrada) y `campaign`
4. `campaign` define reglas y `rewards` disponibles
5. `balances` trackea acumulación por card/campaign

**Multi-tenancy:** Column-based (tenant_id en tablas relevantes)

---

## Consecuencias

### Positivas

- **Consistencia fuerte**: ACID garantizado
- **Flexibilidad**: JSONB para datos semi-estructurados
- **Ecosystem maduro**: Tooling, hosting, comunidad
- **Reportes potentes**: SQL nativo para analytics

### Negativas

- **Escalado horizontal complejo**: Sharding manual si se requiere
- **Conexiones limitadas**: Requiere connection pooling

### Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Conexiones | Pooler del proveedor managed |
| Escalado | Read replicas para reportes |
| Vendor lock-in | SQL estándar |

---

## Referencias

- [PostgreSQL JSONB](https://www.postgresql.org/docs/current/datatype-json.html)
- [Multi-tenancy patterns](https://docs.microsoft.com/en-us/azure/architecture/patterns/multitenancy)
