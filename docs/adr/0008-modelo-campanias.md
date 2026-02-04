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

Las policies controlan cómo y cuándo se pueden acumular puntos/estampas. Son el mecanismo principal para prevenir abuso y modelar reglas de negocio específicas.

### Principios del Sistema

1. **Composición AND**: Todas las policies activas deben cumplirse para que una acumulación sea válida
2. **Especificidad**: Las policies más específicas (product) complementan a las generales (campaign)
3. **Independencia**: Cada policy se evalúa independientemente contra el histórico del usuario
4. **Por campaña**: Las policies pertenecen a una campaña, no son globales

### Estructura de una Policy

```
Campaign Policy {
  policy_type  → max_accumulations, min_amount, min_quantity, cooldown
  scope_type   → campaign, brand, product
  scope_id     → UUID de brand/product (null si scope=campaign)
  period       → transaction, day, week, month, lifetime
  value        → Valor de la restricción
  active       → boolean (permite desactivar sin borrar)
}
```

### Tipos de Policies

| policy_type | Descripción | Evaluación |
|-------------|-------------|------------|
| `max_accumulations` | Límite de acumulaciones | Cuenta acumulaciones en el período |
| `min_amount` | Monto mínimo requerido | Verifica monto de la transacción/item |
| `min_quantity` | Cantidad mínima de productos | Verifica cantidad en transacción |
| `cooldown` | Tiempo de espera entre acumulaciones | Verifica tiempo desde última acumulación |

### Scope de Policies

El `scope_type` define a qué nivel aplica la restricción:

| scope_type | scope_id | Aplica a |
|------------|----------|----------|
| `campaign` | null | Toda la campaña |
| `brand` | brand_id | Solo productos de esa marca |
| `product` | product_id | Solo ese producto específico |

### Períodos de Evaluación

| period | Ventana de tiempo | Uso típico |
|--------|-------------------|------------|
| `transaction` | La transacción actual | Límites por compra |
| `day` | Últimas 24 horas | Anti-abuso diario |
| `week` | Últimos 7 días | Control semanal |
| `month` | Últimos 30 días | Límites mensuales |
| `lifetime` | Todo el historial | Caps totales |

---

## Campañas basadas en códigos únicos

Algunas campañas no acumulan por SKU escaneado sino por **códigos únicos** impresos en empaques o distribuidos digitalmente. Para cubrir este caso agregamos una variante del modelo que sigue usando tiers y policies, pero cambia la fuente de datos de las acumulaciones.

### Extensiones al modelo

- **`campaigns.capture_mode`** define cómo se captura la evidencia: `transaction` (SKU/receipt), `code` (solo códigos) o `hybrid` (ambos). Esto permite que una campaña determine si espera items tradicionales, códigos únicos o los dos a la vez.
- **Catálogo de códigos:**
  - `campaign_code_sets` agrupa archivos/batches importados con metadatos (nombre, formato, origen, max_uses).
  - `campaign_codes` almacena cada código (`code_value`), su estado (`available`, `assigned`, `redeemed`, `void`), opcionalmente el `product_id` asociado y métricas como `uses_count`/`max_uses`. Cada registro pertenece a un `campaign_code_set` y a una campaña.
- **Capturas de código:** `campaign_code_captures` vincula `card_id`, `campaign_id`, `campaign_code_id` y la transacción (si existe). Registra `status` (`accepted`, `rejected`, `pending`) y la razón de rechazo cuando aplica.
- **Acumulaciones multi-fuente:** `accumulations` incorpora `source_type` (`transaction_item` | `code_capture`) y la FK opcional `code_capture_id`. Así, una acumulación puede provenir de un item tradicional o de un código capturado.

### Flujo de registro

1. **Ingesta del catálogo:** el CPG carga un batch (`campaign_code_sets`) y el sistema crea los `campaign_codes` correspondientes.
2. **Registro en app:** el usuario elige la campaña y captura uno o varios códigos. Si la campaña es `hybrid`, también puede subir tickets/SKUs en la misma transacción.
3. **Validación del código:**
   - Se busca el `campaign_codes.code_value` activo para la campaña.
   - Se marca el código como `assigned` y se crea un registro en `campaign_code_captures` con el `card_id` (o se rechaza con motivo si ya fue usado, está fuera de vigencia o no pertenece a la campaña).
4. **Acumulación:** se genera una entrada en `accumulations` con `source_type = 'code_capture'` que referencia la captura aceptada. Los tiers y balances se actualizan igual que con un SKU.

### Evaluación y policies

- **Scope jerárquico:** si el código tiene `product_id`, se usa para mapear brand/cpg y evaluar policies específicas. Si no tiene SKU asociado, la acumulación solo queda sujeta a policies de scope `campaign`.
- **Límites de uso:** los campos `max_uses` y `uses_count` permiten campañas de múltiples usos por código (ej. un código válido 5 veces) sin duplicar registros.
- **Auditabilidad:** `campaign_code_captures` conserva `transaction_id` (opcional) y `metadata` (ej. canal de captura, fotos) para auditorías o antifraude.

### Ejemplo

```yaml
Campaign:
  name: "Colecciona Códigos"
  capture_mode: code
  accumulation_type: stamps
  tiers:
    - name: "Completa"
      threshold_value: 10
      threshold_type: reset_on_redeem

Code Catalog:
  campaign_code_sets:
    - name: "Batch Enero"
      max_uses_per_code: 1

  campaign_codes:
    - code_value: "FANTA-XYZ-001"
      product_id: fanta-600ml
      status: available

Policies:
  - policy_type: max_accumulations
    scope_type: campaign
    period: day
    value: 5
```

En este esquema el usuario ingresa diez códigos válidos para completar la tarjeta, sin subir tickets ni registrar SKUs. El catálogo adicional es responsabilidad de la campaña y queda enlazado explícitamente a ella.

---

## Workflow de validación de campañas

Para garantizar que ninguna campaña se active sin revisión formal, toda campaña tiene tres flags binarios directamente en la entidad `campaigns`:

| Flag | Responsable | Descripción |
|------|-------------|-------------|
| `ready_for_review` | Owner de la campaña (CPG/Brand) | Se marca cuando la configuración está completa y lista para evaluación. |
| `reviewed` | Equipo Qoa (Producto/Tecnología) | Confirma que scope, tiers, policies y assets cumplen lineamientos. |
| `confirmed` | Operaciones/QC | Autorización final para habilitar la campaña al público. |

### Reglas de negocio

1. No se puede marcar `reviewed = true` si `ready_for_review` es `false`.
2. `reviewed` vuelve a `false` automáticamente cuando se modifican campos sensibles (scope, tiers, policies, capture_mode) mientras la campaña esté en `draft` o `paused`.
3. `confirmed` requiere que los otros dos flags estén en `true`. Si cambia algo validado, el flag vuelve a `false`.
4. `status = 'active'` solo es posible cuando los tres flags están en `true`. Transicionar a `paused` o `ended` no altera los flags, pero volver a `active` obliga a revalidarlos si alguno fue reiniciado.
5. Una campaña en `draft` o `paused` puede ser editada libremente, pero cualquier cambio crítico reinicia el proceso de revisión. Si la campana está `active`, solo cambios menores son permitidos (ej. descripción).

Este workflow deja un rastro auditable de la revisión (sin nuevas tablas) y evita que campañas incompletas lleguen a producción.

---

## Coexistencia de Múltiples Policies

### Regla Fundamental: AND

Cuando hay múltiples policies, **TODAS deben cumplirse**. No es OR.

```
Resultado = Policy_1 AND Policy_2 AND Policy_3 AND ... Policy_N

Si cualquier policy falla → la acumulación NO procede
```

### Cómo Interactúan los Scopes

Los scopes son **aditivos, no excluyentes**. Cada policy se evalúa contra su scope correspondiente:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CAMPAIGN SCOPE                                    │
│                                                                             │
│    Policy: max 3 acumulaciones/día (cualquier producto)                     │
│    ┌─────────────────────────────────────────────────────────────────────┐  │
│    │                         BRAND SCOPE                                 │  │
│    │                                                                     │  │
│    │    Policy: max 2 de Coca-Cola/día                                   │  │
│    │    ┌─────────────────────────────────────────────────────────────┐  │  │
│    │    │                      PRODUCT SCOPE                          │  │  │
│    │    │                                                             │  │  │
│    │    │    Policy: max 1 de Coca-Cola 600ml/día                     │  │  │
│    │    │                                                             │  │  │
│    │    └─────────────────────────────────────────────────────────────┘  │  │
│    └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ejemplo de Coexistencia

**Configuración:**
```yaml
Policies:
  - name: "Límite diario general"
    policy_type: max_accumulations
    scope_type: campaign
    period: day
    value: 3

  - name: "Límite por marca Coca-Cola"
    policy_type: max_accumulations
    scope_type: brand
    scope_id: coca-cola
    period: day
    value: 2

  - name: "Límite producto específico"
    policy_type: max_accumulations
    scope_type: product
    scope_id: coca-600ml
    period: day
    value: 1
```

**Escenarios:**

| Compra | Previo hoy | ¿Pasa campaign? | ¿Pasa brand? | ¿Pasa product? | Resultado |
|--------|------------|-----------------|--------------|----------------|-----------|
| 1 Coca 600ml | Nada | ✅ (1/3) | ✅ (1/2) | ✅ (1/1) | **ACUMULA** |
| 1 Coca 600ml | 1 Coca 600ml | ✅ (2/3) | ✅ (2/2) | ❌ (2/1) | **RECHAZA** |
| 1 Coca 2L | 1 Coca 600ml | ✅ (2/3) | ✅ (2/2) | N/A | **ACUMULA** |
| 1 Fanta | 2 Coca (600ml + 2L) | ✅ (3/3) | N/A | N/A | **ACUMULA** |
| 1 Sprite | 3 productos previos | ❌ (4/3) | N/A | N/A | **RECHAZA** |

---

## Algoritmo de Evaluación

### Pseudocódigo

```
función evaluarPolicies(campaña, usuario, transacción, item):

    policies = obtenerPoliciesActivas(campaña)

    para cada policy en policies:

        # Determinar si esta policy aplica al item
        si policy.scope_type == "campaign":
            aplica = true
        si policy.scope_type == "brand":
            aplica = (item.product.brand_id == policy.scope_id)
        si policy.scope_type == "product":
            aplica = (item.product_id == policy.scope_id)

        si NO aplica:
            continuar  # Esta policy no afecta este item

        # Evaluar según tipo de policy
        pasa = evaluarPolicy(policy, usuario, transacción, item)

        si NO pasa:
            retornar {
                valido: false,
                razon: "Viola policy: " + policy.nombre,
                policy: policy
            }

    retornar { valido: true }


función evaluarPolicy(policy, usuario, transacción, item):

    según policy.policy_type:

        caso "max_accumulations":
            conteo = contarAcumulaciones(
                usuario,
                policy.scope_type,
                policy.scope_id,
                policy.period
            )
            retornar conteo < policy.value

        caso "min_amount":
            si policy.scope_type == "campaign":
                monto = transacción.total_amount
            sino:
                monto = item.amount
            retornar monto >= policy.value

        caso "min_quantity":
            si policy.scope_type == "campaign":
                cantidad = transacción.items.length
            sino:
                cantidad = item.quantity
            retornar cantidad >= policy.value

        caso "cooldown":
            ultimaAcum = obtenerUltimaAcumulacion(
                usuario,
                policy.scope_type,
                policy.scope_id
            )
            si ultimaAcum == null:
                retornar true
            horasTranscurridas = (ahora - ultimaAcum.created_at).horas
            retornar horasTranscurridas >= policy.value


función contarAcumulaciones(usuario, scopeType, scopeId, periodo):

    fechaInicio = calcularInicioPeríodo(periodo)

    query = """
        SELECT COUNT(*) FROM accumulations a
        JOIN transaction_items ti ON ti.id = a.transaction_item_id
        JOIN products p ON p.id = ti.product_id
        WHERE a.user_id = :usuario
        AND a.created_at >= :fechaInicio
    """

    si scopeType == "brand":
        query += " AND p.brand_id = :scopeId"
    si scopeType == "product":
        query += " AND ti.product_id = :scopeId"

    retornar ejecutar(query)
```

### Orden de Evaluación

El orden de evaluación de policies NO afecta el resultado (es AND), pero por eficiencia:

```
1. Evaluar policies de scope "campaign" primero
   → Son las más generales, si fallan evitamos consultas

2. Evaluar policies de scope "brand"
   → Filtro intermedio

3. Evaluar policies de scope "product"
   → Más específicas, solo si las anteriores pasan
```

---

## Escenarios Complejos

### Escenario 1: Anti-Abuso Multi-Nivel

**Objetivo:** Prevenir que un usuario abuse comprando el mismo producto múltiples veces.

```yaml
Policies:
  # Nivel 1: Límite general de campaña
  - policy_type: max_accumulations
    scope_type: campaign
    period: day
    value: 5

  # Nivel 2: Límite por marca (previene concentrar en una marca)
  - policy_type: max_accumulations
    scope_type: brand
    scope_id: [cada-brand]  # Se crea una policy por brand
    period: day
    value: 2

  # Nivel 3: Límite por producto (1 acumulación por SKU por día)
  - policy_type: max_accumulations
    scope_type: product
    scope_id: [cada-product]  # Se crea una policy por producto
    period: day
    value: 1
```

**Resultado:** Usuario puede acumular máximo 5 veces/día, máximo 2 de cada marca, máximo 1 de cada producto.

### Escenario 2: Compra Mínima con Variación por Producto

**Objetivo:** Compra mínima general, pero ciertos productos premium tienen mínimo mayor.

```yaml
Policies:
  # Mínimo general de $30
  - policy_type: min_amount
    scope_type: campaign
    period: transaction
    value: 30

  # Productos premium requieren $50 de ese producto
  - policy_type: min_amount
    scope_type: product
    scope_id: producto-premium-x
    period: transaction
    value: 50
```

**Resultado:** Transacción debe ser ≥$30, y si incluye producto premium, el monto de ese item debe ser ≥$50.

### Escenario 3: Cooldown con Excepciones

**Objetivo:** 24h entre compras, pero ciertos productos no tienen cooldown.

```yaml
Policies:
  # Cooldown general de 24h
  - policy_type: cooldown
    scope_type: campaign
    period: day  # No aplica para cooldown pero requerido
    value: 24  # horas

  # Producto promocional sin cooldown (policy inactiva)
  - policy_type: cooldown
    scope_type: product
    scope_id: producto-promo
    value: 0
    active: false  # Al estar inactiva, no hay restricción adicional
```

**Nota:** Para "exceptuar" un producto del cooldown general, la lógica debe verificar el scope. Alternativa: usar `min_quantity: 0` con `active: false` para el producto específico.

### Escenario 4: Límites por Período Diferenciado

**Objetivo:** Límites diferentes para día, semana y mes.

```yaml
Policies:
  # Máximo 2 por día
  - policy_type: max_accumulations
    scope_type: campaign
    period: day
    value: 2

  # Máximo 10 por semana
  - policy_type: max_accumulations
    scope_type: campaign
    period: week
    value: 10

  # Máximo 30 por mes
  - policy_type: max_accumulations
    scope_type: campaign
    period: month
    value: 30
```

**Resultado:** Todas las restricciones aplican. Usuario puede acumular 2/día, pero si llega a 10 en una semana, no puede más esa semana aunque no haya llegado a 2 ese día.

---

## Queries SQL de Soporte

### Obtener Policies Activas de una Campaña

```sql
SELECT * FROM campaign_policies
WHERE campaign_id = $1
AND active = true
ORDER BY
  CASE scope_type
    WHEN 'campaign' THEN 1
    WHEN 'brand' THEN 2
    WHEN 'product' THEN 3
  END;
```

### Contar Acumulaciones por Scope y Período

```sql
-- Acumulaciones de campaña en período
SELECT COUNT(*)
FROM accumulations a
JOIN cards c ON c.id = a.card_id
WHERE c.user_id = $1
AND a.campaign_id = $2
AND a.created_at >= $3;  -- fecha inicio período

-- Acumulaciones de brand en período
SELECT COUNT(*)
FROM accumulations a
JOIN cards c ON c.id = a.card_id
JOIN transaction_items ti ON ti.id = a.transaction_item_id
JOIN products p ON p.id = ti.product_id
WHERE c.user_id = $1
AND a.campaign_id = $2
AND p.brand_id = $3  -- brand de la policy
AND a.created_at >= $4;

-- Acumulaciones de producto en período
SELECT COUNT(*)
FROM accumulations a
JOIN cards c ON c.id = a.card_id
JOIN transaction_items ti ON ti.id = a.transaction_item_id
WHERE c.user_id = $1
AND a.campaign_id = $2
AND ti.product_id = $3  -- product de la policy
AND a.created_at >= $4;
```

### Verificar Cooldown

```sql
SELECT created_at
FROM accumulations a
JOIN cards c ON c.id = a.card_id
WHERE c.user_id = $1
AND a.campaign_id = $2
ORDER BY created_at DESC
LIMIT 1;
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
