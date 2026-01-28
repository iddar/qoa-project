# Glosario - Proyecto Qoa

> Términos del dominio utilizados en la documentación y código del sistema.

---

## Actores

### Consumidor
Usuario final que participa en los programas de lealtad. Interactúa con el sistema principalmente vía WhatsApp y la tarjeta digital.

### Tendero
Operador del Punto de Venta (PDV). Responsable de registrar transacciones escaneando el QR del consumidor y el código de barras de los productos.

### CPG (Consumer Packaged Goods)
Marca o fabricante de bienes de consumo empaquetados. Patrocina campañas de lealtad y define los PLIs participantes.

---

## Entidades del Sistema

### Tarjeta Universal
Identificador único del usuario dentro de Qoa. Cada consumidor tiene una sola tarjeta universal que agrupa todas sus participaciones en diferentes programas.

### Wallet
Representación virtual que agrupa los puntos, estampas y actividad del consumidor. Contiene las tarjetas individuales asociadas a cada establecimiento y/o marca.

### PDV (Punto de Venta)
Establecimiento comercial (tienda) donde se realizan las transacciones. Cada PDV tiene un QR de registro único para que los consumidores se afilien.

### PLI (Promoción, Lanzamiento, Impulso)
SKU de producto que participa en una campaña de lealtad. Define qué productos generan puntos o estampas al ser comprados.

---

## Mecánicas de Lealtad

### Campaña
Configuración que define las reglas de un programa de lealtad:
- **Tipo de cuantificación**: puntos (por valor) o estampas (por frecuencia)
- **Agrupación**: por marca (CPG), por PDV, o ambos
- **Duración**: permanente o temporal
- **PLIs participantes**: productos que generan acumulación
- **Recompensas**: premios disponibles y sus thresholds

### Estampa
Marcador de una visita o compra. Representa frecuencia de interacción.
- 1 compra de PLI = 1 estampa
- No considera el monto, solo la acción

### Punto
Unidad de valor acumulable según las reglas de la campaña.
- Puede ser 1 visita = 1 punto
- O calculado: monto × multiplicador definido en campaña

### Recompensa
Beneficio que el consumidor obtiene al alcanzar un threshold. Se configura por campaña y puede ser:
- **Premio físico**: producto gratis, merchandise
- **Beneficio**: descuento, promoción especial
- **Acceso a nivel**: desbloqueo de tier superior

### Threshold
Umbral de puntos o estampas requerido para canjear una recompensa. Ejemplo: "10 estampas = 1 café gratis".

### Nivel (Tier)
Escalón dentro de un programa jerárquico. Cada nivel puede otorgar beneficios diferenciados. *Prioridad media-baja para MVP.*

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
- Los términos en inglés (CPG, PLI) se mantienen por ser estándar en la industria
