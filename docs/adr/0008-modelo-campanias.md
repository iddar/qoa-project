# ADR-0008: Modelo de Campañas y Acumulación

> **Estado:** Aceptado
> **Fecha:** 2026-01-28
> **Última actualización:** 2026-02-04
> **Decisores:** Equipo Qoa

---

## Contexto

Las campañas de lealtad en Qoa deben soportar múltiples configuraciones de acumulación según las necesidades de cada CPG y sus marcas (brands). El sistema debe permitir:

1. Campañas flexibles con scope de productos y stores
2. Niveles de progresión (tiers) con beneficios diferenciados
3. Políticas de restricción granulares para control de acumulación
4. Múltiples mecánicas de lealtad (sellos, puntos, niveles)

---

## Decisión

**Modelo flexible de campañas con scope configurable, tiers y policies.**

### Jerarquía de entidades

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CPG                                            │
│                        (Empresa matriz)                                     │
│                                                                             │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐                             │
│    │  Brand   │    │  Brand   │    │  Brand   │                             │
│    │ (Fanta)  │    │ (Sprite) │    │  (Coke)  │                             │
│    └────┬─────┘    └────┬─────┘    └────┬─────┘                             │
│         │               │               │                                   │
│         ▼               ▼               ▼                                   │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐                             │
│    │ Products │    │ Products │    │ Products │                             │
│    │ (SKUs)   │    │ (SKUs)   │    │ (SKUs)   │                             │
│    └──────────┘    └──────────┘    └──────────┘                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Campaign                                          │
│                                                                             │
│    cpg_id              → Pertenece a UN CPG                                 │
│    campaign_brands[]   → Null = todo el CPG, [x,y] = brands específicas     │
│    campaign_products[] → Null = todos los productos, [a,b] = específicos    │
│    store_types[]       → Null = cualquier store, ["tienda","mini"] = filtro │
│    tiers[]             → Niveles de progresión con beneficios               │
│    policies[]          → Restricciones de acumulación                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Scope de Campañas

### Dimensión 1: Productos (jerárquico)

El scope de productos es jerárquico y funciona por exclusión:

```
SI campaign_brands está vacío:
    → Aplica a TODAS las brands del CPG
SINO:
    → Aplica solo a las brands listadas

SI campaign_products está vacío:
    → Aplica a TODOS los productos de las brands seleccionadas
SINO:
    → Aplica solo a los productos listados
```

**Ejemplos:**

| campaign_brands | campaign_products | Resultado |
|-----------------|-------------------|-----------|
| [] | [] | Todos los productos de todas las brands del CPG |
| [Fanta] | [] | Todos los productos de Fanta |
| [Fanta, Sprite] | [] | Todos los productos de Fanta y Sprite |
| [] | [SKU-A, SKU-B] | Solo SKU-A y SKU-B (cualquier brand) |
| [Fanta] | [Fanta-500ml] | Solo Fanta 500ml |

### Dimensión 2: Stores (independiente)

El scope de stores funciona por tipo de tienda:

```
SI campaign_store_types está vacío:
    → Aplica en CUALQUIER store
SINO:
    → Aplica solo en stores con type en la lista
```

**Ejemplos:**

| campaign_store_types | Resultado |
|----------------------|-----------|
| [] | Cualquier tienda |
| ["tiendita"] | Solo tienditas |
| ["minisuper", "cadena"] | Minisupers y cadenas |

---

## Sistema de Tiers (Niveles)

Los tiers permiten crear campañas con múltiples niveles de progresión.

### Tipos de mecánica

| threshold_type | Comportamiento | Ejemplo |
|----------------|----------------|---------|
| `cumulative` | Subes de nivel y te quedas permanentemente | Club VIP: 50 compras = nivel Oro permanente |
| `per_period` | Se evalúa por período, puede bajar | Top del mes: tus compras del mes definen nivel |
| `reset_on_redeem` | Al canjear vuelve a 0 | Tarjeta de sellos: 10 = café gratis, reset |

### Estructura de un tier

```
Campaign Tier {
  name             → "Bronce", "Plata", "Oro"
  threshold_value  → Valor para alcanzar (10, 25, 50)
  threshold_type   → cumulative | per_period | reset_on_redeem
  order            → Posición del nivel (1, 2, 3...)
  benefits[]       → Beneficios al estar en este nivel
}
```

### Tipos de beneficios

| benefit_type | config ejemplo | Descripción |
|--------------|----------------|-------------|
| `discount` | `{"percent": 10}` | 10% de descuento |
| `discount` | `{"fixed": 50}` | $50 de descuento |
| `reward` | `{"reward_id": "uuid"}` | Acceso a reward específico |
| `multiplier` | `{"factor": 2}` | 2x puntos |
| `free_product` | `{"product_id": "uuid", "quantity": 1}` | Producto gratis |

---

## Sistema de Policies (Restricciones)

Las policies controlan cómo y cuándo se pueden acumular puntos/estampas.

### Dimensiones de una política

```
Campaign Policy {
  policy_type  → max_accumulations, min_amount, min_quantity, cooldown
  scope_type   → campaign, brand, product
  scope_id     → UUID de brand/product (null si scope=campaign)
  period       → transaction, day, week, month, lifetime
  value        → Valor de la restricción
}
```

### Tipos de políticas

| policy_type | Descripción |
|-------------|-------------|
| `max_accumulations` | Límite de acumulaciones |
| `min_amount` | Monto mínimo requerido |
| `min_quantity` | Cantidad mínima de productos |
| `cooldown` | Tiempo de espera entre acumulaciones |

### Ejemplos de restricciones

```
1. Solo 1 compra válida por día
   → policy_type: max_accumulations
   → scope_type: campaign
   → period: day
   → value: 1

2. Máximo 1 del producto X por día (anti-abuse)
   → policy_type: max_accumulations
   → scope_type: product
   → scope_id: product_123
   → period: day
   → value: 1

3. Compra mínima de $50 para acumular
   → policy_type: min_amount
   → scope_type: campaign
   → period: transaction
   → value: 50

4. Máximo 2 productos de marca Y por transacción
   → policy_type: max_accumulations
   → scope_type: brand
   → scope_id: brand_456
   → period: transaction
   → value: 2
```

---

## Modelo de Transacciones

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Transaction                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  user_id    ──────────────────────────────► Consumidor                      │
│  store_id   ──────────────────────────────► PDV                             │
│  created_at                                                                 │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    Transaction Items                                  │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │  product_id  │  quantity  │  amount  │  metadata                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Cada transacción pertenece a UN consumidor y UN PDV
- Los items detallan qué compró (product, cantidad, monto)
- El sistema evalúa qué campañas aplican según los items y policies

---

## Flujo de Acumulación

```
        Transacción registrada
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Validar transacción                                         │
│     - Usuario activo                                            │
│     - Store existe                                              │
└────────────────────────────────────────────────────────────────┬┘
                                                                 │
                                                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Por cada item de la transacción:                            │
│     a. Identificar product → brand → cpg                        │
│     b. Buscar campañas activas donde:                           │
│        - campaign.cpg_id = product.brand.cpg_id                 │
│        - product está en scope (brands + products)              │
│        - store.type está en scope (store_types)                 │
│        - campaña está dentro de vigencia                        │
└────────────────────────────────────────────────────────────────┬┘
                                                                 │
                                                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Evaluar policies por campaña:                               │
│     - Verificar límites (max_accumulations)                     │
│     - Verificar montos mínimos (min_amount)                     │
│     - Verificar cooldowns                                       │
│     → Si viola alguna policy: SKIP                              │
└────────────────────────────────────────────────────────────────┬┘
                                                                 │
                                                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Acumular en cards correspondientes                          │
│     - Obtener/crear card del usuario                            │
│     - Calcular acumulación según tipo (stamps, points, amount)  │
│     - Actualizar balance                                        │
└────────────────────────────────────────────────────────────────┬┘
                                                                 │
                                                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Evaluar tiers                                               │
│     - Calcular nivel actual según balance y threshold_type      │
│     - Si subió de nivel → aplicar beneficios                    │
│     - Si threshold_type = reset_on_redeem y llegó al max        │
│       → marcar como canjeable                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Use Cases de Campañas

### UC1: Tarjeta de Sellos Clásica

**Descripción:** Compra 10 cafés y el 11vo es gratis.

```yaml
Campaign:
  name: "Café Gratis"
  accumulation_type: stamps

Tiers:
  - name: "En progreso"
    threshold_value: 9
    threshold_type: reset_on_redeem
    order: 1
    benefits: []
  - name: "Completa"
    threshold_value: 10
    threshold_type: reset_on_redeem
    order: 2
    benefits:
      - type: free_product
        config: { product_id: "cafe-regular", quantity: 1 }

Scope:
  campaign_brands: [Nescafé]
  campaign_products: []  # Todos los cafés
  campaign_store_types: []  # Cualquier tienda

Policies:
  - policy_type: max_accumulations
    scope_type: campaign
    period: transaction
    value: 1  # Máximo 1 sello por compra
```

### UC2: Club de Compradores con Niveles

**Descripción:** Programa de lealtad con niveles permanentes y beneficios crecientes.

```yaml
Campaign:
  name: "Club Coca-Cola"
  accumulation_type: points

Tiers:
  - name: "Normal"
    threshold_value: 0
    threshold_type: cumulative
    order: 1
    benefits: []
  - name: "Bronce"
    threshold_value: 100
    threshold_type: cumulative
    order: 2
    benefits:
      - type: discount
        config: { percent: 5 }
  - name: "Plata"
    threshold_value: 500
    threshold_type: cumulative
    order: 3
    benefits:
      - type: discount
        config: { percent: 10 }
      - type: multiplier
        config: { factor: 1.5 }
  - name: "Oro"
    threshold_value: 1000
    threshold_type: cumulative
    order: 4
    benefits:
      - type: discount
        config: { percent: 15 }
      - type: multiplier
        config: { factor: 2 }

Scope:
  campaign_brands: []  # Todo el CPG Coca-Cola
  campaign_products: []
  campaign_store_types: []

Policies:
  - policy_type: max_accumulations
    scope_type: campaign
    period: day
    value: 3  # Máximo 3 compras válidas por día
```

### UC3: Promoción Temporal con Producto Específico

**Descripción:** Promoción de verano solo para Fanta 600ml en tienditas.

```yaml
Campaign:
  name: "Verano Fanta"
  validity_type: date_range
  starts_at: 2026-06-01
  ends_at: 2026-08-31
  accumulation_type: stamps

Tiers:
  - name: "En progreso"
    threshold_value: 4
    threshold_type: reset_on_redeem
    order: 1
  - name: "Completa"
    threshold_value: 5
    threshold_type: reset_on_redeem
    order: 2
    benefits:
      - type: reward
        config: { reward_id: "playera-fanta" }

Scope:
  campaign_brands: [Fanta]
  campaign_products: [fanta-600ml]  # Solo este producto
  campaign_store_types: [tiendita]  # Solo tienditas

Policies:
  - policy_type: max_accumulations
    scope_type: product
    scope_id: fanta-600ml
    period: day
    value: 1  # Máximo 1 por día de este producto
```

### UC4: Top del Mes

**Descripción:** Los usuarios con más compras del mes ganan premios.

```yaml
Campaign:
  name: "Top Sabritas"
  accumulation_type: points

Tiers:
  - name: "Participante"
    threshold_value: 0
    threshold_type: per_period  # Se evalúa mensualmente
    order: 1
  - name: "Top 100"
    threshold_value: 10
    threshold_type: per_period
    order: 2
    benefits:
      - type: reward
        config: { reward_id: "gift-card-100" }
  - name: "Top 10"
    threshold_value: 50
    threshold_type: per_period
    order: 3
    benefits:
      - type: reward
        config: { reward_id: "gift-card-500" }

Scope:
  campaign_brands: []  # Todo Sabritas
  campaign_products: []
  campaign_store_types: []

Policies:
  - policy_type: min_amount
    scope_type: campaign
    period: transaction
    value: 30  # Compra mínima de $30
```

---

## Vigencia de Campañas

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

**Decisión:** No hay retroactividad. Las transacciones solo acumulan si ocurren dentro de la vigencia activa de la campaña.

---

## Decisiones Explícitas para MVP

| Tema | Decisión MVP |
|------|--------------|
| Campañas multi-CPG | **NO** - Una campaña pertenece a un solo CPG |
| Scope de productos | **SÍ** - Jerárquico (CPG → Brands → Products) |
| Scope de stores | **SÍ** - Por tipo de store |
| Sistema de tiers | **SÍ** - Con 3 tipos de mecánica |
| Sistema de policies | **SÍ** - Granular por scope y período |
| Retroactividad | **NO** - Solo acumulan dentro de vigencia |
| Vigencia configurable | **SÍ** - Indefinida o por rango de fechas |

---

## Consecuencias

### Positivas

- **Flexible**: Soporta desde campañas simples hasta complejas
- **Extensible**: Fácil agregar nuevos tipos de beneficios o policies
- **Granular**: Control preciso sobre acumulación y restricciones
- **Independiente del input**: El modelo funciona sin importar cómo se capturen los datos

### Negativas

- **Complejidad en evaluación**: Lógica de matching campaign ↔ items ↔ policies
- **Múltiples cards por usuario**: Un consumidor puede tener varias cards activas
- **Evaluación de tiers**: Puede ser costoso recalcular niveles en mecánicas per_period

---

## Referencias

- [Modelo de Datos](../04-data/modelo-datos.md)
- [Diccionario de Datos](../04-data/diccionario.md)
- [ADR-0007: Multi-tenancy](./0007-multi-tenancy.md)
