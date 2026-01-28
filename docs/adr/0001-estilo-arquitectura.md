# ADR-0001: Estilo de Arquitectura

> **Estado:** Aceptado
> **Fecha:** 2026-01-28
> **Decisores:** Equipo Qoa

---

## Contexto

Qoa es un sistema de administración de programas de lealtad. El MVP "Conectados" requiere:

- API REST para múltiples clientes (web, integraciones)
- Soporte multi-tenant (múltiples CPGs y PDVs)
- Alta disponibilidad (99.9%)
- Latencia < 500ms p95
- Throughput de 50-200 TPS

**Restricciones:**
- Equipo pequeño (1-2 desarrolladores backend)
- Timeline agresivo (POC en Q1 2026)
- Necesidad de iterar rápido

---

## Decisión

**Adoptamos Modular Monolith para el Core del sistema.**

### Estructura

```
qoa/
├── apps/
│   ├── api/                 # Core API (Modular Monolith)
│   ├── web-client/          # Front consumidor
│   ├── web-store/           # Front tendero
│   ├── web-brand/           # Front CPG
│   └── web-admin/           # Backoffice
├── packages/
│   └── shared/              # Código compartido (types, utils)
└── docs/
```

### Módulos del Core API

```
api/src/
├── modules/
│   ├── users/               # Gestión de usuarios
│   ├── stores/              # PDVs
│   ├── cards/               # Tarjetas de lealtad
│   ├── campaigns/           # Campañas y reglas
│   ├── transactions/        # Registro de compras
│   ├── rewards/             # Recompensas y canje
│   └── reports/             # Reportes y analytics
├── integrations/
│   ├── whatsapp/            # Notificaciones
│   └── tconecta/            # POS externo
├── shared/
│   ├── db/                  # Conexión y migrations
│   ├── events/              # Event bus interno
│   ├── middleware/          # Auth, logging, errors
│   └── utils/               # Helpers comunes
└── jobs/
    ├── reminders/           # Jobs de recordatorios
    └── reports/             # Jobs de reportes
```

### Principios de diseño

1. **Boundaries claros**: Cada módulo tiene su propia carpeta con routes, services, repositories
2. **Dependencias explícitas**: Módulos se comunican via interfaces definidas
3. **Base de datos compartida**: Un solo schema, pero tablas agrupadas por módulo
4. **Event bus interno**: Para comunicación async entre módulos (BullMQ)
5. **Preparado para split**: Si un módulo crece mucho, puede extraerse a servicio

---

## Alternativas Consideradas

### Microservicios desde inicio

**Pros:**
- Escalado independiente por servicio
- Deployments aislados
- Tecnología heterogénea posible

**Contras:**
- Complejidad operacional alta para equipo de 1-2 devs
- Overhead de comunicación (latencia, serialización)
- Debugging distribuido complejo
- Más infraestructura (service mesh, API gateway)

**Razón de rechazo:** El equipo es muy pequeño y el timeline muy agresivo. La complejidad operacional no se justifica para el MVP.

### Serverless / Functions

**Pros:**
- Pay-per-use
- Escala automático
- Sin servidores que mantener

**Contras:**
- Cold starts afectan latencia
- Vendor lock-in
- Estado compartido complejo
- Debugging difícil
- Costos impredecibles a escala

**Razón de rechazo:** Los NFRs de latencia (< 500ms p95) son difíciles de garantizar con cold starts. El modelo de costos es impredecible con alto throughput.

---

## Consecuencias

### Positivas

- **Simplicidad operacional**: Un solo servicio para deploy, monitor, debug
- **Velocidad de desarrollo**: Refactoring fácil, sin overhead de coordinación
- **Latencia óptima**: Sin hops de red entre módulos
- **Transacciones ACID**: Consistencia fuerte dentro del monolito
- **Onboarding rápido**: Un solo codebase para entender

### Negativas

- **Escalado vertical primero**: Antes de poder escalar horizontalmente
- **Acoplamiento potencial**: Requiere disciplina para mantener boundaries
- **Single point of failure**: Un bug puede afectar todo el sistema
- **Deploy atómico**: Cambios en un módulo requieren deploy completo

### Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Acoplamiento | Code reviews enfocados en boundaries, linting de imports |
| SPOF | Health checks, auto-restart, réplicas |
| Escalabilidad | Diseño stateless, ready para horizontal scaling |
| Deploy completo | Feature flags, rollback rápido |

---

## Plan de evolución

Si el sistema crece significativamente:

1. **Fase 1 (actual)**: Modular Monolith
2. **Fase 2 (si se justifica)**: Extraer módulo de Reports a servicio separado (heavy queries)
3. **Fase 3 (si se justifica)**: Extraer integraciones (WhatsApp) a workers dedicados

**Criterios para split:**
- Módulo requiere escala independiente
- Equipo crece a 5+ devs
- Tiempos de deploy se vuelven problema

---

## Referencias

- [MonolithFirst - Martin Fowler](https://martinfowler.com/bliki/MonolithFirst.html)
- [Modular Monolith with DDD](https://github.com/kgrzybek/modular-monolith-with-ddd)
- [Majestic Modular Monoliths - Axel Fontaine](https://www.youtube.com/watch?v=BOvxJaklcr0)
