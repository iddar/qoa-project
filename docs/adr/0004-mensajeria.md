# ADR-0004: Mensajería y Eventos

> **Estado:** Aceptado
> **Fecha:** 2026-01-28
> **Decisores:** Equipo Qoa

---

## Contexto

El sistema requiere procesamiento asíncrono para:

- Envío de notificaciones (OTP, recordatorios)
- Generación de reportes
- Procesamiento de webhooks
- Comunicación entre módulos (eventos de dominio)

---

## Decisión

**Event bus interno con abstracción de driver.**

### Principios

1. **Agnóstico al driver**: Interface común, implementación intercambiable
2. **Eventos de dominio**: Comunicación desacoplada entre módulos
3. **Jobs programados**: Tareas diferidas y recurrentes
4. **Retry automático**: Reintentos con backoff exponencial

### Interface

```
┌─────────────────────────────────────────────────┐
│                  EventBus                       │
├─────────────────────────────────────────────────┤
│  publish(event: DomainEvent): Promise<void>     │
│  subscribe(type: string, handler): void         │
│  enqueue(job: Job): Promise<void>               │
│  schedule(job: Job, cron: string): void         │
└─────────────────────────────────────────────────┘
```

### Implementaciones disponibles

| Driver | Uso | Características |
|--------|-----|-----------------|
| **InMemory** | Tests, desarrollo | Sin persistencia, síncrono |
| **PostgreSQL** | MVP simple | SKIP LOCKED, sin infraestructura extra |
| **BullMQ + Redis** | Producción escalable | Dashboard, prioridades, rate limiting |

*Driver de producción se decide en fase de implementación.*

---

## Eventos de Dominio

### Nomenclatura

```
{domain}.{entity}.{action}.v{version}

Ejemplos:
- users.user.created.v1
- transactions.transaction.completed.v1
- campaigns.campaign.activated.v1
```

### Eventos principales

| Evento | Trigger | Consumidores |
|--------|---------|--------------|
| `users.user.created` | Registro exitoso | Notificaciones, Analytics |
| `transactions.transaction.completed` | Compra registrada | Balances, Notificaciones |
| `campaigns.threshold.reached` | Usuario alcanza meta | Rewards, Notificaciones |
| `rewards.reward.redeemed` | Canje de recompensa | Balances, Analytics |

---

## Jobs

### Tipos de jobs

| Tipo | Ejemplo | Prioridad |
|------|---------|-----------|
| **Inmediato** | Enviar OTP | Alta |
| **Diferido** | Generar reporte | Media |
| **Programado** | Recordatorio semanal | Baja |

### Retry policy

```
Intento 1: inmediato
Intento 2: +1 minuto
Intento 3: +5 minutos
Intento 4: +30 minutos
Intento 5: +2 horas
Dead letter: después de 5 intentos
```

---

## Consecuencias

### Positivas

- **Flexibilidad**: Cambiar driver sin modificar lógica de negocio
- **Testeable**: InMemory para tests rápidos
- **Escalable**: Redis cuando se necesite

### Negativas

- **Abstracción**: Overhead inicial de diseño
- **Debugging**: Más complejo que llamadas síncronas

---

## Referencias

- [Domain Events - Martin Fowler](https://martinfowler.com/eaaDev/DomainEvent.html)
- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
