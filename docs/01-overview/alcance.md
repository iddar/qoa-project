# Alcance - MVP Conectados

> Scope detallado, límites y exclusiones del MVP.

---

## Cobertura Geográfica

| Nivel | Alcance |
|-------|---------|
| **Potencial** | Global |
| **Inicio** | Por país |
| **Segmentación** | País → Estado → Ciudad |

El sistema captura datos demográficos de los usuarios, permitiendo:
- Aplicar campañas por geografía (país, estado, ciudad)
- Segmentar promociones por marca + ubicación
- Escalar a nuevos países sin cambios arquitectónicos

---

## Tipos de PDV (Punto de Venta)

**En scope:** Cualquier formato de retail

| Tipo | Características |
|------|-----------------|
| **Tiendita / Abarrotes** | Canal tradicional, operador único |
| **Minisuper** | Formato mediano, puede tener empleados |
| **Cadenas** | Múltiples sucursales, estructura corporativa |

El perfil de PDV distingue entre tipos para:
- Reportes segmentados por formato
- Reglas de campaña diferenciadas
- UX adaptada al contexto

---

## Categorías de Producto

**Sin restricción de categoría.**

El sistema soporta cualquier PLI de CPG:
- Bebidas (refrescos, aguas, jugos, lácteos)
- Alimentos (snacks, galletas, pan)
- Cuidado personal
- Limpieza del hogar
- Otros bienes de consumo empaquetados

La categorización se define por campaña y CPG.

---

## Identidad de Usuarios

### Consumidor

| Campo | Requerido | Uso |
|-------|-----------|-----|
| **Teléfono** | Obligatorio | Identificador único (core) |
| **Nombre** | Obligatorio | Personalización |
| **Edad** | Obligatorio | Segmentación demográfica |
| **Sexo** | Obligatorio | Segmentación demográfica |
| **Email** | Opcional | Notificaciones adicionales |

### Tendero / PDV

| Campo | Requerido | Uso |
|-------|-----------|-----|
| **Datos del PDV** | Obligatorio | Nombre, dirección, tipo |
| **Datos del operador** | Obligatorio | Contacto del tendero |
| **Credenciales** | Obligatorio | Login para gestión |

---

## Flujo de Registro de Compras

El **cliente** es quien registra su propia compra:

1. Cliente escanea QR del producto (PLI)
2. Sistema valida campaña activa
3. Sistema acredita puntos/estampas
4. Cliente ve balance actualizado

El PDV tiene acceso a:
- Actualizar sus datos
- Generar/regenerar su QR de registro
- Ver reportes de su tienda

---

## Funcionalidad de Canje

**Canje completo en MVP.**

| Tipo de Recompensa | En Scope |
|--------------------|----------|
| Productos gratis | Sí |
| Descuentos | Sí |
| Beneficios especiales | Sí |
| Acceso a niveles | Sí (básico) |

Flujo de canje:
1. Consumidor alcanza threshold
2. Sistema notifica disponibilidad
3. Consumidor solicita canje
4. PDV/Sistema valida y entrega
5. Balance se actualiza

---

## Integraciones

### En Scope MVP

| Sistema | Prioridad | Función |
|---------|-----------|---------|
| **T-Conecta** | Alta | Registro de transacciones |
| **WhatsApp** | Media-baja | Notificaciones, onboarding |

### Fuera de Scope MVP

| Sistema | Razón |
|---------|-------|
| Pasarelas de pago | No procesa dinero |
| ERPs | Integración posterior |
| CRMs externos | No requerido inicialmente |

---

## Interfaces de Usuario

### En Scope MVP

| Interfaz | Usuario | Función Principal |
|----------|---------|-------------------|
| **Web Cliente** | Consumidor | Ver tarjeta, balance, canjear |
| **Web Comercio** | Tendero | Gestión de PDV, reportes |
| **Web Marca** | CPG | Campañas, analytics |
| **Backoffice** | Qoa | Administración general |

### Fuera de Scope MVP

| Interfaz | Razón |
|----------|-------|
| App iOS nativa | Solo PWA |
| App Android nativa | Solo PWA |
| Chatbot WhatsApp completo | Solo notificaciones básicas |

---

## Límites Técnicos del MVP

| Aspecto | Límite |
|---------|--------|
| **PDVs** | 500+ (sin límite superior definido) |
| **Consumidores por PDV** | Sin límite |
| **Campañas simultáneas** | Múltiples por CPG |
| **PLIs por campaña** | Sin límite |
| **Transacciones/día** | Diseñar para alta demanda |

---

## Exclusiones Explícitas

| Funcionalidad | Status | Fase Futura |
|---------------|--------|-------------|
| Procesamiento de pagos | Excluido | TBD |
| Apps nativas | Excluido | Post-MVP |
| Gamificación avanzada | Excluido | Fase 2 |
| Machine Learning / Predicciones | Excluido | Fase 2 |
| Integración con redes sociales | Excluido | TBD |
| Marketplace de recompensas | Excluido | Fase 2 |

---

## Supuestos

1. **T-Conecta disponible** - La integración con T-Conecta es funcional y documentada
2. **Conectividad** - PDVs tienen acceso a internet (móvil o fijo)
3. **Smartphones** - Consumidores tienen smartphone con cámara
4. **WhatsApp** - Alta penetración de WhatsApp en mercado objetivo

---

## Dependencias Externas

| Dependencia | Riesgo | Mitigación |
|-------------|--------|------------|
| API T-Conecta | Latencia, disponibilidad | Fallback manual, retry logic |
| Proveedor WhatsApp | Costos, límites | Múltiples proveedores evaluados |
| Infraestructura cloud | Disponibilidad | Multi-AZ, backups |
