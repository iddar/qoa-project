# Visión - MVP Conectados

> Qué SI hace y qué NO hace el MVP de Qoa.

---

## Propósito

**Qoa** es un sistema centralizado de administración de programas de lealtad.

El MVP **"Conectados"** tiene tres objetivos principales:

1. **Generar data del consumidor final** - Capturar información de compra y comportamiento del cliente en canal tradicional
2. **Impulsar productos de las marcas (CPGs)** - Incentivar la compra de PLIs mediante mecánicas de lealtad
3. **Obtener datos de consumo** - Visibilidad tanto del tendero como del cliente final para microsegmentación

---

## Modelo de Negocio

| Aspecto | Definición |
|---------|------------|
| **Cliente principal** | CPG / Marca (quien paga por acceso al sistema y data) |
| **Usuarios** | Consumidores finales, Tenderos, Equipos de marca |
| **Valor diferencial** | Conexión directa CPG → Cliente final a través del canal tradicional |

---

## Qué SI Hace el MVP

### Core del Sistema
- REST API estandarizada como núcleo de toda la funcionalidad
- Soporte multi-marca (múltiples CPGs) desde el inicio
- Soporte multi-tenant (múltiples PDVs por marca)

### Registro y Enrolamiento
- Registro de consumidores (alta de usuarios)
- Registro de PDVs (tiendas)
- Enrolamiento de consumidores en campañas

### Transacciones
- Registro de compras (escaneo QR + código de barras)
- Acumulación de puntos y/o estampas según reglas de campaña
- Tracking de balance por consumidor

### Campañas
- Configuración de campañas por CPG y/o PDV
- Definición de PLIs participantes
- Reglas de cuantificación (puntos por valor, estampas por frecuencia)
- Thresholds y recompensas configurables

### Interfaces Web
- **Front Cliente**: Tarjeta digital, balance, historial
- **Front Comercio**: Escaneo, registro de transacciones
- **Front Marca**: Gestión de campañas, visualización de data
- **Backoffice**: Administración general del sistema

### Reportes para CPGs
- Ventas por PLI
- PDVs activos y performance
- Consumidores alcanzados
- Segmentación de usuarios
- ROI de campañas
- Analítica avanzada

### Integraciones
- WhatsApp (prioridad media-baja) para notificaciones y onboarding
- T-Conecta para registro de transacciones

---

## Qué NO Hace el MVP

| Exclusión | Razón |
|-----------|-------|
| **Procesamiento de pagos** | Solo registra transacciones, no procesa dinero |
| **App nativa móvil** | Solo PWA, no publicación en App Store / Play Store |
| **Programa de niveles complejo** | Prioridad media-baja, puede incluirse básico |
| **Integración con ERPs** | Fuera de scope inicial |
| **E-commerce / Storefront** | El foco es lealtad, no venta directa |

---

## Escala del Piloto

| Métrica | Target |
|---------|--------|
| **PDVs** | 500+ |
| **CPGs** | Multi-marca |
| **Timeline POC** | Q1 2026 (primera-segunda semana de marzo) |

---

## Alcance del POC (Prueba de Concepto)

La POC se enfocará en el **happy path** del usuario:

1. Registro de usuarios (consumidor)
2. Registro de PDV (tienda)
3. Enrolamiento en una campaña
4. Registro de compras
5. Acumulación de puntos/estampas
6. Visualización de balance

---

## Stakeholders

| Rol | Interés |
|-----|---------|
| **CPG / Marca** | Data de consumo, impulso de PLIs, ROI |
| **Tendero** | Herramienta de fidelización, aumento de ventas |
| **Consumidor** | Beneficios y recompensas por compras |
| **Qoa (interno)** | Validar modelo, escalar a más marcas |

---

## Métricas de Éxito del Piloto

*Por definir con equipo comercial:*
- [ ] Tasa de registro de consumidores
- [ ] Tasa de conversión (registro → primera compra)
- [ ] Frecuencia de compra post-enrolamiento
- [ ] Incremento en ventas de PLIs
- [ ] NPS de tenderos
- [ ] Costo de adquisición por consumidor
