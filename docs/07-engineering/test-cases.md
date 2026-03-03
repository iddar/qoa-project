# Casos de Uso - Tests E2E

> Documentación de los escenarios end-to-end cubiertos por Playwright.
> Este documento ayuda al equipo a entender qué flujos ya están automatizados,
> qué errores se validan y qué escenarios siguen pendientes.

---

## Flujos Principales (Happy Path)

Los siguientes flujos representan el ciclo de vida principal de la plataforma y cuentan con cobertura automatizada.

| ID           | Nombre                       | Descripción                                                              | Archivo                                                |
| ------------ | ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| E2E-FLOW-001 | Ciclo completo de plataforma | Backoffice -> CPG Portal -> Wallet -> Store Dashboard                    | `global/e2e/specs/full-platform-flow.spec.ts`          |
| E2E-FLOW-002 | Propagación Store -> Wallet  | La tienda registra una transacción y el consumidor la ve en su historial | `global/e2e/specs/store-to-wallet-propagation.spec.ts` |
| E2E-FLOW-003 | Compra manual desde Wallet   | El consumidor se suscribe y registra una compra mediante payload         | `global/e2e/specs/wallet-manual-purchase-flow.spec.ts` |

### E2E-FLOW-001: Ciclo Completo de Plataforma

#### Historia

María, gerente de marca en un CPG, necesita lanzar una campaña de lealtad para impulsar ventas en tiendas de conveniencia. Primero, el equipo de Qoa habilita la tienda desde Backoffice. Después, el equipo CPG crea la marca, el producto, la campaña y la recompensa, y avanza la campaña por todo el ciclo de estados hasta dejarla activa.

Cuando la campaña ya está publicada, Juan (consumidor) se registra en la wallet, se suscribe y compra en tienda. El objetivo de este test es validar de punta a punta que todas las piezas del ecosistema funcionen juntas: configuración, suscripción, transacción y visibilidad en el historial del usuario.

**Actores:** Admin Qoa -> CPG Manager -> Consumidor

**Precondiciones:**
- Usuario admin autenticado en Backoffice
- Usuario CPG autenticado en CPG Portal

**Pasos:**
1. Backoffice: crear tienda (nombre y tipo)
2. CPG Portal: crear marca, producto y campaña
3. CPG Portal: configurar políticas de campaña
4. CPG Portal: ejecutar lifecycle (draft -> ready -> review -> confirm -> active)
5. CPG Portal: crear recompensa con stock
6. Wallet: registrar consumidor con signup
7. Wallet: suscribirse a campaña activa
8. Wallet: validar visibilidad de recompensas
9. Store Dashboard: registrar transacción (cardId, productId, cantidad, monto)
10. Wallet: validar transacción en historial

**Validaciones:**
- Tienda creada correctamente
- Campaña en estado `active`
- Recompensa visible en wallet
- Transacción reflejada en historial del consumidor

---

### E2E-FLOW-002: Propagación Store -> Wallet

#### Historia

Ana atiende una tienda de barrio y registra una compra con los datos de la tarjeta del cliente. El consumidor no necesita hacer ningún paso adicional: la transacción debe viajar desde el sistema de tienda hasta su wallet de forma automática.

Este test confirma que la sincronización entre Store Dashboard y Wallet es confiable. Si este flujo falla, el usuario pierde confianza porque su compra no aparece, aunque haya sido registrada correctamente en el punto de venta.

**Actores:** Store Dashboard -> Digital Wallet

**Precondiciones:**
- Consumidor existente con wallet activa
- Producto seed disponible (`SEED-DEVELOPMENT-001`)

**Pasos:**
1. Obtener card del consumidor vía API
2. Store Dashboard: registrar transacción con `cardId`
3. Verificar incremento en contador de transacciones
4. Wallet: abrir historial de transacciones
5. Confirmar que la nueva transacción aparece

**Validaciones:**
- Transacción registrada exitosamente
- El total de transacciones incrementa
- La transacción es visible en wallet

---

### E2E-FLOW-003: Compra Manual desde Wallet

#### Historia

Pedro compra en una tienda que no tiene escáner disponible en ese momento, pero no quiere perder su acumulación. Desde la wallet, registra la compra manualmente con el payload de la transacción y espera ver su movimiento reflejado en el historial.

Este test cubre un camino alternativo clave para operación real: incluso cuando no hay lectura directa en tienda, el consumidor puede registrar su compra y mantener continuidad en su programa de lealtad.

**Actores:** Consumidor

**Precondiciones:**
- Consumidor autenticado en Wallet
- Tienda seed disponible (`seed_store_development`)
- Producto seed disponible
- Campaña "Reto Seed" activa

**Pasos:**
1. Wallet: navegar a campañas
2. Suscribirse a campaña (si aún no está suscrito)
3. Wallet: navegar a compra manual
4. Completar payload JSON con `storeId`, `items`, `amount`
5. Enviar registro de compra
6. Verificar acumulación en historial

**Validaciones:**
- Suscripción a campaña exitosa
- Compra registrada exitosamente
- Acumulación reflejada en balance/historial

---

## Escenarios de Error Cubiertos

Los siguientes errores están validados en los specs de integración (`src/spec/*.spec.ts`).
La meta es asegurar que, cuando una acción no es válida, la API responda con el código correcto y un comportamiento consistente.

> En términos de negocio: el sistema no solo debe funcionar cuando todo sale bien; también debe fallar de forma clara, segura y predecible.

| ID | Escenario | Código de error | Archivo de test |
|----|-----------|-----------------|-----------------|
| E2E-ERR-001 | Acceso sin autenticación | `UNAUTHORIZED` | `src/spec/auth.spec.ts` |
| E2E-ERR-002 | Recurso no encontrado | `NOT_FOUND` | `src/spec/campaigns.spec.ts` |
| E2E-ERR-003 | Acceso a otro tenant | `FORBIDDEN` | `src/spec/reports.spec.ts` |
| E2E-ERR-004 | Saldo insuficiente para canje | `INSUFFICIENT_BALANCE` | `src/spec/rewards.spec.ts` |
| E2E-ERR-005 | Campaña inactiva | `CAMPAIGN_NOT_ACTIVE` | `src/spec/campaigns.spec.ts` |
| E2E-ERR-006 | Transición de estado inválida | `INVALID_STATUS_TRANSITION` | `src/spec/campaigns.spec.ts` |
| E2E-ERR-007 | Usuario duplicado | `USER_EXISTS` | `src/spec/auth.spec.ts` |
| E2E-ERR-008 | Usuario bloqueado | `ACCOUNT_BLOCKED` | `src/spec/auth.spec.ts` |
| E2E-ERR-009 | Doble canje de recompensa | `ALREADY_REDEEMED` | `src/spec/rewards.spec.ts` |

---

## Escenarios No Cubiertos (Gap Analysis)

Estos escenarios aún no tienen cobertura automatizada y se mantienen como pendientes del roadmap de calidad.

### Alta prioridad

| ID | Escenario | Código esperado | Razón del gap |
|----|-----------|-----------------|---------------|
| GAP-002 | Rate limiting | `RATE_LIMITED` | Requiere infraestructura de throttling para pruebas deterministas |
| GAP-003 | Transacciones duplicadas | Idempotency | Falta validar comportamiento ante retries de webhook |
| GAP-004 | Firma de webhook inválida | `INVALID_WEBHOOK_SIGNATURE` | Falta escenario E2E negativo completo |

### Media prioridad

| ID | Escenario | Código esperado | Razón del gap |
|----|-----------|-----------------|---------------|
| GAP-005 | Código de campaña expirado | `CODE_EXPIRED` | Falta fixture con control de vigencia |
| GAP-006 | Política de cooldown | `BUSINESS_RULE_VIOLATION` | Falta simulación de ventanas de tiempo |
| GAP-007 | Stock de recompensa agotado | `REWARD_OUT_OF_STOCK` | Falta escenario de agotamiento concurrente |
| GAP-008 | Campaña expirada | `CAMPAIGN_EXPIRED` | Falta prueba basada en fechas de cierre |

### Baja prioridad

| ID | Escenario | Código esperado | Razón del gap |
|----|-----------|-----------------|---------------|
| GAP-009 | Cursor inválido | `INVALID_CURSOR` | Cobertura de edge cases de paginación pendiente |
| GAP-010 | Sesión expirada | `SESSION_EXPIRED` | Falta ciclo completo de refresh token expirado |
| GAP-011 | Cuota API excedida | `QUOTA_EXCEEDED` | Requiere entorno con límites configurados |

---

## Matriz de Cobertura

| Módulo | Happy path | Errores | Gap principal |
|--------|------------|---------|---------------|
| Auth | Sí | Sí | Refresh token expirado |
| Users | Sí | Sí | - |
| Stores | Sí | Parcial | Casos de borde de paginación |
| Cards | Sí | Parcial | Casos de pertenencia cruzada |
| Campaigns | Sí | Sí | Vigencia/expiración |
| Transactions | Sí | Parcial | Firma e idempotencia de webhook |
| Rewards | Sí | Sí | Agotamiento concurrente de stock |
| Reports | Sí | Sí | - |
| WhatsApp | Parcial | Parcial | Firma webhook E2E negativa |
| Alerts | Parcial | No | Cobertura de errores por canal |

---

## Ejecutar Tests E2E

```bash
# Todos los tests E2E
bun test:e2e

# Tests específicos
bun test:e2e --grep "full platform"
bun test:e2e --grep "store to wallet"

# Con video
bun test:e2e:video

# Ambiente específico
E2E_ENV=staging bun test:e2e
```

---

## Referencias

- Configuración: `global/e2e/playwright.config.ts`
- Helpers de API: `global/e2e/support/api.ts`
- Autenticación: `global/e2e/support/auth.ts`
- Datos de prueba: `global/e2e/support/data.ts`
- Variables de ambiente: `global/e2e/.env.example`
