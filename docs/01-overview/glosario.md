# Glosario - Proyecto Qoa

> Términos del dominio utilizados en la documentación y código del sistema.

---

## Actores

### Consumidor
Usuario final que participa en los programas de lealtad. Interactúa con el sistema principalmente vía WhatsApp y la tarjeta digital.

### Tendero
Operador del Punto de Venta (PDV). Responsable de registrar transacciones escaneando el QR del consumidor y el código de barras de los productos.

### CPG (Consumer Packaged Goods)
Marca o fabricante de bienes de consumo empaquetados. Patrocina campañas de lealtad y define los productos participantes.

---

## Entidades del Sistema

### Tarjeta Universal
Identificador único del usuario dentro de Qoa. Cada consumidor tiene una sola tarjeta universal que agrupa todas sus participaciones en diferentes programas.

### Wallet
Representación virtual que agrupa los puntos, estampas y actividad del consumidor. Contiene las tarjetas individuales asociadas a cada establecimiento y/o marca.

### PDV (Punto de Venta)
Establecimiento comercial (tienda) donde se realizan las transacciones. Cada PDV tiene un QR de registro único para que los consumidores se afilien.

### Store Type (Tipo de Tienda)
Clasificación del PDV según su formato comercial. Ejemplos: tiendita, minisuper, cadena. Permite segmentar campañas por tipo de canal.

### Brand (Marca)
Marca comercial que pertenece a un CPG. Ejemplo: Fanta, Sprite y Coca-Cola son brands del CPG Coca-Cola Company.

### Product (Producto)
SKU específico de una marca que participa en campañas de lealtad. Ejemplo: "Fanta 600ml" es un producto de la brand Fanta. Los productos son el nivel más granular del scope de campañas.

---

## Mecánicas de Lealtad

### Campaña
Configuración que define las reglas de un programa de lealtad:
- **Tipo de acumulación**: puntos (por valor) o estampas (por frecuencia)
- **Scope de productos**: qué brands/products participan
- **Scope de stores**: qué tipos de tienda participan
- **Duración**: permanente o temporal
- **Tiers**: niveles de progresión con beneficios
- **Policies**: restricciones de acumulación

### Estampa
Marcador de una visita o compra. Representa frecuencia de interacción.
- 1 compra de producto participante = 1 estampa
- No considera el monto, solo la acción

### Punto
Unidad de valor acumulable según las reglas de la campaña.
- Puede ser 1 visita = 1 punto
- O calculado: monto × multiplicador definido en campaña

### Recompensa (Reward)
Beneficio que el consumidor obtiene al alcanzar un threshold. Se configura por campaña y puede ser:
- **Premio físico**: producto gratis, merchandise
- **Beneficio**: descuento, promoción especial
- **Acceso a nivel**: desbloqueo de tier superior

### Threshold
Umbral de puntos o estampas requerido para canjear una recompensa o alcanzar un nivel. Ejemplo: "10 estampas = 1 café gratis".

### Nivel (Tier)
Escalón dentro de un programa de lealtad. Cada nivel puede otorgar beneficios diferenciados. Los tiers soportan tres tipos de mecánica:

| Tipo | Comportamiento | Ejemplo |
|------|----------------|---------|
| **Cumulative** | Subes y te quedas | Club Oro permanente |
| **Per Period** | Se evalúa por período | Top del mes |
| **Reset on Redeem** | Al canjear vuelve a 0 | Tarjeta de sellos |

### Policy (Política)
Restricción que controla cómo y cuándo se pueden acumular puntos/estampas. Las policies tienen:
- **Tipo**: límite de acumulaciones, monto mínimo, cooldown
- **Scope**: a nivel de campaña, brand o producto
- **Período**: por transacción, día, semana, mes o lifetime

Ejemplo: "Máximo 1 acumulación por día por producto".

### Benefit (Beneficio)
Ventaja que se otorga a usuarios en un tier específico. Tipos:
- **Discount**: descuento porcentual o fijo
- **Multiplier**: multiplicador de puntos (ej: 2x)
- **Free Product**: producto gratis
- **Reward**: acceso a recompensa específica

---

## Integraciones

### T-Conecta
Sistema externo de punto de venta utilizado para el registro de transacciones. Qoa se integra con T-Conecta pero no tiene control sobre su funcionamiento.

### QR de Registro
Código QR único asignado a cada PDV. Al escanearlo, el consumidor inicia el proceso de afiliación vía WhatsApp.

### QR de Tarjeta
Código QR único de cada consumidor. El tendero lo escanea junto con el código de barras del producto para registrar la transacción.

---

## Notas

- Este glosario se actualizará conforme evolucione el proyecto
- Los términos en inglés (CPG, tier, policy) se mantienen por ser estándar en la industria
