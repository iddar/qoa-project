# ADR-0007: Multi-tenancy

> **Estado:** Aceptado
> **Fecha:** 2026-01-28
> **Decisores:** Equipo Qoa

---

## Contexto

Qoa es un sistema multi-tenant que sirve a:

- Múltiples **CPGs** (marcas)
- Múltiples **PDVs** (tiendas) que pueden trabajar con varias marcas
- Múltiples **Consumidores** que se relacionan con CPGs siempre a través de un PDV

---

## Decisión

**Multi-tenancy basado en columnas (shared database, shared schema).**

### Modelo de relaciones

```
┌─────────────────────────────────────────────────────────────────┐
│                         Qoa Platform                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐                 │
│   │  CPG A  │      │  CPG B  │      │  CPG C  │   ← Marcas      │
│   └────┬────┘      └────┬────┘      └────┬────┘                 │
│        │                │                │                      │
│        └───────┬────────┴────────┬───────┘                      │
│                │                 │                              │
│                ▼                 ▼                              │
│          ┌──────────┐      ┌──────────┐                         │
│          │  PDV 1   │      │  PDV 2   │   ← PDVs (many-to-many) │
│          └────┬─────┘      └────┬─────┘                         │
│               │                 │                               │
│               └────────┬────────┘                               │
│                        │                                        │
│                        ▼                                        │
│               ┌─────────────────┐                               │
│               │   Consumidores  │   ← Siempre vía PDV           │
│               └─────────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Relaciones clave

| Relación | Tipo | Descripción |
|----------|------|-------------|
| CPG ↔ PDV | Many-to-many | Un PDV puede vender productos de múltiples marcas |
| PDV ↔ Consumidor | Many-to-many | Un consumidor puede comprar en múltiples PDVs |
| CPG ↔ Consumidor | Indirecta | Siempre a través de un PDV (vía cards/transactions) |

---

## Implementación

### Identificación de contexto

| Nivel | Identificador | Uso |
|-------|---------------|-----|
| **CPG** | `brand_id` | Campañas, reportes por marca |
| **PDV** | `store_id` | Transacciones, reportes por tienda |
| **Card** | `card_id` | Vincula consumidor + PDV + campaña |

### Tablas con aislamiento

```
users           → Globales (identificados por teléfono)
stores          → Globales (pueden asociarse a múltiples CPGs)
store_brands    → Relación PDV ↔ CPG (many-to-many)
cards           → Por consumidor + store + campaign
campaigns       → Por CPG (brand_id)
transactions    → Por card (hereda contexto)
rewards         → Por campaign (hereda brand_id)
```

### Flujo de aislamiento

```
┌──────────────────────────────────────────────┐
│                   Request                    │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│         Middleware: Extract Context          │
│    (brand, store, user from JWT/API Key)     │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│         Validate: Verify Relationships       │
│   (user belongs to store? store has brand?)  │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│      Repository: Filter by Context           │
└──────────────────────────────────────────────┘
```

---

## Consumidores y sus cards

Los consumidores pueden participar en múltiples programas a través de diferentes PDVs:

```
┌──────────────┐
│  Consumidor  │  ← Identificado por teléfono (global)
└──────┬───────┘
       │
       ├──────────────────┬──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Card 1    │    │   Card 2    │    │   Card 3    │
│ PDV A + CPG │    │ PDV A + CPG │    │ PDV B + CPG │
│     X       │    │     Y       │    │     X       │
└─────────────┘    └─────────────┘    └─────────────┘
```

- El consumidor ve todas sus cards en su wallet
- Cada card está vinculada a un PDV específico y una campaña
- La campaña pertenece a un CPG

---

## Seguridad

### Prevención de data leaks

| Control | Implementación |
|---------|----------------|
| Query filtering | Middleware automático por contexto |
| API validation | Verificar relaciones en cada request |
| JWT claims | user_id, roles, permisos incluidos |
| Logs | Incluir contexto completo para auditoría |

### Acceso por rol

| Actor | Acceso |
|-------|--------|
| Consumidor | Solo sus propias cards y transacciones |
| Tendero (PDV) | Datos de su tienda, todas las marcas asociadas |
| CPG Admin | Datos de su marca en todos los PDVs asociados |
| Qoa Admin | Acceso global (backoffice) |

---

## Alternativas Consideradas

### Database per tenant

**Pros:**
- Aislamiento completo
- Fácil backup/restore por tenant

**Contras:**
- Overhead operacional alto
- Migrations complejas
- No soporta bien relaciones many-to-many entre tenants

**Razón de rechazo:** El modelo de negocio requiere relaciones cruzadas (PDV con múltiples CPGs).

### Schema per tenant

**Pros:**
- Buen aislamiento
- Un solo servidor de BD

**Contras:**
- Migrations por schema
- Complejidad en queries cross-tenant

**Razón de rechazo:** Queries de reportes y relaciones many-to-many serían muy complejas.

---

## Consecuencias

### Positivas

- **Flexible**: Soporta relaciones many-to-many naturalmente
- **Simple**: Un schema, fácil de mantener
- **Eficiente**: Índices compartidos, connection pooling
- **Reportes**: Agregaciones cross-brand/cross-store fáciles

### Negativas

- **Riesgo de leak**: Requiere disciplina en queries
- **Complejidad de permisos**: Múltiples niveles de acceso
- **Noisy neighbor**: Un tenant puede afectar performance

### Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Data leak | Middleware obligatorio, tests de aislamiento |
| Permisos | Sistema de roles bien definido |
| Noisy neighbor | Rate limiting, monitoring por contexto |

---

## Referencias

- [Multi-tenancy Patterns - Microsoft](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/overview)
- [Multi-tenant Database Architecture Patterns Explained](https://www.bytebase.com/blog/multi-tenant-database-architecture-patterns-explained/)
- [Multi-tenant Architecture: A Complete Guide (Basic to Advanced)](https://dev.to/tak089/multi-tenant-architecture-a-complete-guide-basic-to-advanced-119o)
- [Row Level Security - PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
