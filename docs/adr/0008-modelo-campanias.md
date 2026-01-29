# ADR-0008: Modelo de Campañas y Acumulación

> **Estado:** Aceptado
> **Fecha:** 2026-01-28
> **Decisores:** Equipo Qoa

---

## Contexto

Las campañas de lealtad en Qoa deben soportar múltiples configuraciones de acumulación según las necesidades de cada CPG y sus marcas (brands).

---

## Decisión

**Modelo flexible de campañas con scope de acumulación configurable.**

### Jerarquía de entidades

```
┌─────────────────────────────────────────────────────────────┐
│                         CPG                                 │
│                   (Empresa matriz)                          │
│                                                             │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│    │  Brand   │    │  Brand   │    │  Brand   │             │
│    │ (Fanta)  │    │ (Sprite) │    │  (Coke)  │             │
│    └──────────┘    └──────────┘    └──────────┘             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Campaign                              │
│                                                             │
│    cpg_id           → Pertenece a UN CPG                    │
│    brand_ids[]      → Null = todo CPG, [x,y] = específicas  │
│    accumulation_scope → Cómo se agrupan las compras         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Scopes de acumulación

| Scope | Descripción | Ejemplo |
|-------|-------------|---------|
| `store_brand` | Por PDV + brands específicas | "10 Fantas en esta tienda" |
| `store_cpg` | Por PDV + cualquier brand del CPG | "10 productos Coca-Cola aquí" |
| `brand_only` | Brands específicas, cualquier PDV | "10 Fantas donde sea" |
| `cpg_only` | Cualquier brand del CPG, cualquier PDV | "10 productos Coca-Cola donde sea" |

### Modelo de transacciones

```
┌─────────────────────────────────────────────────────────────┐
│                     Transaction                             │
├─────────────────────────────────────────────────────────────┤ 
│  user_id    ──────────────────────────► Consumidor          │ 
│  store_id   ──────────────────────────► PDV                 │ 
│  created_at                                                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Transaction Items                        │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  brand_id    │  quantity  │  amount  │  metadata      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

- Cada transacción pertenece a UN consumidor y UN PDV
- Los items detallan qué compró (brand, cantidad, monto)
- El sistema evalúa qué campañas aplican según los items

### Flujo de acumulación

```
        Transacción registrada
                │
                ▼
┌─────────────────────────────────────────┐
│  Por cada item de la transacción:       │
│  1. Identificar brand del item          │
│  2. Buscar campañas activas donde:      │
│     - campaign.cpg_id = brand.cpg_id    │
│     - brand está en campaign.brand_ids  │
│       (o brand_ids es null)             │
│     - scope permite este PDV            │
│  3. Acumular en cards correspondientes  │
└─────────────────────────────────────────┘
```

### Vigencia de campañas

```
Campaign {
  status           → "draft" | "active" | "paused" | "ended"

  validity_type    → "indefinite" | "date_range"
  starts_at        → Fecha inicio (requerido)
  ends_at          → Fecha fin (null si indefinite)
}
```

| Tipo | starts_at | ends_at | Ejemplo |
|------|-----------|---------|---------|
| **Indefinida** | 2026-02-01 | null | "Programa permanente" |
| **Rango fijo** | 2026-02-01 | 2026-02-28 | "Febrero de premios" |

### Reglas de vigencia

```
┌─────────────────────────────────────────────────────────────┐
│              Transacción registrada                         │
│                   (siempre se guarda)                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  ¿Campaña activa Y dentro de vigencia?                      │
│                                                             │
│  - status = "active"                                        │
│  - starts_at <= fecha_transacción                           │
│  - ends_at es null O ends_at >= fecha_transacción           │
└─────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
      ┌───────────┐              ┌─────────────┐
      │    SÍ     │              │     NO      │
      │  Acumula  │              │  Solo queda │
      │  en card  │              │  registro   │
      └───────────┘              │  histórico  │
                                 └─────────────┘
```

**Decisión:** No hay retroactividad. Las transacciones solo acumulan si ocurren dentro de la vigencia activa de la campaña.

### Configuración por campaña

Cada campaña define:

| Aspecto | Descripción |
|---------|-------------|
| **Tipo de acumulación** | Estampas, puntos, o monto |
| **Threshold** | Cuánto se necesita para canjear (ej: 10 estampas) |
| **Recompensas** | Catálogo de premios disponibles |
| **Límite de premios** | Opcional - máximo de canjes (poco común) |

*Detalle de configuración se definirá en Fase 4: Modelo de Datos.*

---

## Preguntas abiertas

### Mecanismo de registro de compras

**Pendiente de definir:** ¿Cómo se captura qué compró el consumidor?

| Opción | Descripción |
|--------|-------------|
| Escaneo de código de barras | Consumidor escanea productos |
| Selección de brand | Consumidor indica marca comprada |
| Foto del ticket | Procesamiento de imagen (OCR/AI) |
| Integración POS | Datos directos del punto de venta |

*Esta decisión se tomará en fase de implementación.*

---

## Decisiones explícitas para MVP

| Tema | Decisión MVP |
|------|--------------|
| Transacciones multi-CPG | **NO** - Una transacción puede tener items de múltiples CPGs, cada uno acumula por separado |
| Campañas multi-CPG | **NO** - Una campaña pertenece a un solo CPG |
| Sub-marcas (brands) | **SÍ** - Soportado desde el inicio |
| Scope configurable | **SÍ** - Los 4 scopes disponibles |
| Retroactividad | **NO** - Solo acumulan transacciones dentro de la vigencia |
| Vigencia configurable | **SÍ** - Indefinida o por rango de fechas |

---

## Consecuencias

### Positivas

- **Flexible**: Soporta desde campañas simples hasta complejas
- **Extensible**: Fácil agregar nuevos scopes si se necesitan
- **Independiente del input**: El modelo funciona sin importar cómo se capturen los datos

### Negativas

- **Complejidad en evaluación**: Lógica de matching campaign ↔ items
- **Múltiples cards por usuario**: Un consumidor puede tener varias cards activas

---

## Referencias

- ADR-0007: Multi-tenancy (relaciones CPG ↔ PDV ↔ Consumidor)
