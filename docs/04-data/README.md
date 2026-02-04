# Fase 4: Modelo de Datos

> Esquema de base de datos para la plataforma Qoa.

---

## Documentos de esta fase

| Documento | Descripción | Estado |
|-----------|-------------|--------|
| [modelo-datos.md](./modelo-datos.md) | Diagrama ER y relaciones | ✅ Completo |
| [diccionario.md](./diccionario.md) | Descripción detallada de tablas y columnas | ✅ Completo |
| [indices.md](./indices.md) | Índices para performance | ✅ Completo |
| [eventos.md](./eventos.md) | Mapeo de eventos de dominio a tablas | ✅ Completo |

---

## Resumen del modelo

### Entidades de negocio

```
┌────────────────────────────────────────────────────────────────┐
│                      ENTIDADES CORE                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌─────────┐         ┌─────────┐         ┌─────────┐          │
│   │  CPGs   │────────▶│ Brands  │◀────────│Campaigns│          │
│   └─────────┘   1:N   └────┬────┘   N:M   └────┬────┘          │
│                            │ 1:N               │               │
│                            ▼           ┌───────┼───────┐       │
│   ┌─────────┐         ┌─────────┐      │       │       │       │
│   │ Stores  │         │Products │◀─────┘  1:N  │  1:N  │       │
│   │ (type)  │         └─────────┘              ▼       ▼       │
│   └────┬────┘                           ┌───────┐ ┌────────┐   │
│        │                                │ Tiers │ │Policies│   │
│        │  relación operacional          │(nivel)│ │(reglas)│   │
│        │  (vía transactions/cards)      └───┬───┘ └────────┘   │
│        │                                    │                  │
│        │                               1:N  ▼                  │
│        │                              ┌──────────┐             │
│        │                              │ Benefits │             │
│        │                              └──────────┘             │
│        │                                 ┌─────────┐           │
│        │                                 │ Rewards │           │
│        ▼                                 └─────────┘           │
│   ┌─────────┐         ┌─────────┐              ▲               │
│   │  Users  │────────▶│  Cards  │──────────────┘               │
│   └─────────┘   1:N   └─────────┘   redemptions                │
│        │                   │                                   │
│        ▼                   ▼                                   │
│   ┌─────────────────────────────┐                              │
│   │       Transactions          │                              │
│   │  ┌───────────────────────┐  │                              │
│   │  │ Items (product_id)    │  │                              │
│   │  └───────────────────────┘  │                              │
│   └─────────────────────────────┘                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Entidades de infraestructura

```
┌────────────────────────────────────────────────────────────────┐
│                   INFRAESTRUCTURA                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│   │ api_keys    │     │outbox_events│     │    jobs     │      │
│   └─────────────┘     └─────────────┘     └──────┬──────┘      │
│                                                  │             │
│                                                  ▼             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│   │ processed_  │     │  webhook_   │     │  job_runs   │      │
│   │   events    │     │  endpoints  │     └─────────────┘      │
│   └─────────────┘     └──────┬──────┘                          │
│                              │                                 │
│                              ▼                                 │
│                       ┌─────────────┐                          │
│                       │  webhook_   │                          │
│                       │ deliveries  │                          │
│                       └─────────────┘                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Principios de diseño

| Principio | Implementación |
|-----------|----------------|
| **Multi-tenancy** | Columnas `cpg_id`, `store_id` en tablas relevantes |
| **Soft delete** | Columna `deleted_at` donde aplique |
| **Auditoría** | Columnas `created_at`, `updated_at` en todas las tablas |
| **UUIDs** | IDs tipo UUID v7 (ordenables por tiempo) |
| **Eventos** | Tabla `outbox_events` para Transactional Outbox |

---

## Referencias

- [ADR-0002: Base de datos](../adr/0002-base-de-datos.md)
- [ADR-0007: Multi-tenancy](../adr/0007-multi-tenancy.md)
- [ADR-0008: Modelo de Campañas](../adr/0008-modelo-campanias.md)
- [ADR-0009: Stack de Implementación](../adr/0009-stack-implementacion.md)
- [OpenAPI](../03-apis/openapi.yaml)
- [AsyncAPI](../03-apis/asyncapi.yaml)
