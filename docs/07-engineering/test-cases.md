# Casos de Uso - Tests E2E

> Documentación de escenarios de prueba end-to-end cubiertos por Playwright.
> Este documento sirve como referencia para el equipo sobre qué flujos están automatizados
> y qué escenarios requieren cobertura adicional.

---

## Flujos Principales (Happy Path)

Los siguientes flujos representan el ciclo de vida principal de la plataforma y están cubiertos por tests E2E automatizados.

| ID           | Nombre                       | Descripción                                                         | Archivo                                                |     |
| ------------ | ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ | --- |
| E2E-FLOW-001 | Ciclo completo de plataforma | Backoffice → CPG Portal → Wallet → Store Dashboard                  | `global/e2e/specs/full-platform-flow.spec.ts`          |     |
| E2E-FLOW-002 | Propagación Store → Wallet   | Tienda registra transacción → Consumidor ve en historial            | `global/e2e/specs/store-to-wallet-propagation.spec.ts` |     |
| E2E-FLOW-003 | Compra manual desde Wallet   | Consumidor suscribe → Registra compra via payload → Ver acumulación | `global/e2e/specs/wallet-manual-purchase-flow.spec.ts` |     |

### E2E-FLOW-001: Ciclo Completo de Plataforma

#### Historia

> María es gerente de marca en una empresa de bebidas. Necesita lanzar una campaña de lealtad para promover sus productos en tiendas de conveniencia. Simultaneously, Juan es un consumidor que quiere participar y acumular puntos por sus compras.
>
> Este test verifica que todo el ecosistema funcione en harmony: desde que el admin crea la tienda en el backoffice, pasando por la configuración de campaña en el portal CPG, hasta que Juan puede ver sus transacciones reflejadas en su wallet digital.

**Actors:** Admin Qoa → CPG Manager → Consumidor

**Precondiciones:**
- Usuario admin autenticado en backoffice
- Usuario CPG autenticado en CPG Portal

**Pasos:**
1. Backoffice: Crear tienda (nombre, tipo)
2. CPG Portal: Crear marca, producto y campaña
3. CPG Portal: Configurar políticas de campaña
4. CPG Portal: Ejecutar lifecycle (draft → ready → review → confirm → active)
5. CPG Portal: Crear recompensa con stock
6. Wallet: Registro de consumidor con signup
7. Wallet: Suscribirse a campaña activa
8. Wallet: Ver recompensas disponibles
9. Store Dashboard: Registrar transacción (cardId, productId, cantidad, monto)
10. Wallet: Ver transacción en historial

**Validaciones:**
- Tienda creada correctamente
- Campaña alcanza estado `active`
- Recompensa visible en wallet
- Transacción propagada a historial del consumidor

---

### E2E-FLOW-002: Propagación Store → Wallet

#### Historia

> Ana es tendera en una tiendita de la esquina. Un cliente frecuentelega con sus productos y ella registra la compra usando el código de la tarjeta del cliente. El cliente, sin saberlo, recibe automáticamente la acumulación en su wallet y puede consultarlo después desde su celular.
>
> Este test valida que la información fluye correctamente desde el Store Dashboard hasta la Digital Wallet del consumidor, sin necesidad de intervención manual.

**Actors:** Store Dashboard → Digital Wallet

**Precondiciones:**
- Consumidor existente con wallet activa
- Producto seed disponible (SKU: SEED-DEVELOPMENT-001)

**Pasos:**
1. Obtener card del consumidor via API
2. Store Dashboard: Registrar transacción con cardId
3. Verificar aumento en contador de transacciones
4. Wallet: Acceder a historial de transacciones
5. Validar que la nueva transacción aparece

**Validaciones:**
- Transacción registrada exitosamente
- Contador de transacciones aumenta
- Transacción visible en wallet

---

### E2E-FLOW-003: Compra Manual desde Wallet

#### Historia

> Pedro es un consumidor que no siempre tiene su tarjeta física a la mano. Un día compra en una tienda que no tiene escáner, pero igual quiere acumular sus puntos. Abre su wallet, selecciona la opción de registro manual, ingresa los datos de su compra y listo: sus puntos se acumulan automáticamente.
>
> Este test cubre el flujo alternativo donde el propio consumidor registra su compra desde la app cuando el método QR no está disponible.

**Actors:** Consumidor

**Precondiciones:**
- Consumidor autenticado en wallet
- Tienda seed disponible (code: seed_store_development)
- Producto seed disponible
- Campaña "Reto Seed" activa

**Pasos:**
1. Wallet: Navegar a campañas
2. Suscribirse a campaña (si no está suscrito)
3. Wallet: Navegar a compra manual
4. Completar payload JSON con storeId, items, monto
5. Enviar registro de compra
6. Verificar acumulación en historial

**Validaciones:**
- Susripción a campaña exitosa
- Compra registrada exitosamente
- Acumulación reflejada en balance

---

## Escenarios de Error Cubiertos

Los siguientes escenarios de error están validados en los specs de integración (`src/spec/*.spec.ts`). Estos representan las situaciones donde el sistema debe responder de forma adecuada cuando las cosas no salen como se espera.

> Cuando un usuario intenta acceder sin token, o un CPG intenta ver datos de otro, el sistema debe rechazar la petición con el código de error apropiado.

| ID | Escenario | Código de Error | Archivo de Test |
|----|-----------|------------------|-----------------|
| E2E-ERR-001 | Acceso sin autenticación | `UNAUTHORIZED` | Múltiples spec files |
| E2E-ERR-002 | Recurso no encontrado | `NOT_FOUND` | campaigns.spec.ts |
| E2E-ERR-003 | Acceso a otro tenant | `FORBIDDEN` | reports.spec.ts |
| E2E-ERR-004 | Saldo insuficiente para canje | `INSUFFICIENT_BALANCE` | rewards.spec.ts |
| E2E-ERR-005 | Campaña inactiva | `CAMPAIGN_NOT_ACTIVE` | campaigns.spec.ts |
| E2E-ERR-006 | Transición de estado inválida | `INVALID_STATUS_TRANSITION` | campaigns.spec.ts |
| E2E-ERR-007 | Usuario duplicado | `USER_EXISTS` | auth.spec.ts |
| E2E-ERR-008 | Usuario bloqueado | `ACCOUNT_BLOCKED` | auth.spec.ts |

### Detalle de Errores de Integración

#### E2E-ERR-001: Acceso sin autenticación
```typescript
// src/spec/auth.spec.ts
test("expects 401 for missing token", async ({ request }) => {
  const response = await request.get("/v1/users/me");
  expect(response.status()).toBe(401);
});
```

#### E2E-ERR-003: Acceso a otro tenant (FORBIDDEN)
```typescript
// src/spec/reports.spec.ts
test("cpg summary rejects foreign cpg", async ({ request }) => {
  const token = await login(request, "other_cpg@qoa.local", "password");
  const response = await request.get("/v1/reports/cpgs/foreign-id/summary", {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(response.status()).toBe(403);
});
```

---

## Escenarios NO Cubiertos (Gap Analysis)

Los siguientes escenarios no tienen cobertura de tests automatizados y deben ser considerados para futuras iteraciones.

### Alta Prioridad

| ID | Escenario | Código de Error | Razón del Gap |
|----|-----------|------------------|---------------|
| GAP-001 | Doble canje de recompensa | `ALREADY_REDEEMED` | No se ha implementado test de retry |
| GAP-002 | Rate limiting | `RATE_LIMITED` | Requiere infraestructura de throttling |
| GAP-003 | Transacciones duplicadas | Idempotency | Webhook retry no validado E2E |
| GAP-004 | Firma de webhook inválida | `INVALID_WEBHOOK_SIGNATURE` | Solo path happy implementado |

### Media Prioridad

| ID | Escenario | Código de Error | Razón del Gap |
|----|-----------|------------------|---------------|
| GAP-005 | Código de campaña expirado | `CODE_EXPIRED` | Tests de vigencia no implementados |
| GAP-006 | Política de cooldown | `BUSINESS_RULE_VIOLATION` | Tests de timing no implementados |
| GAP-007 | Stock de recompensa agotado | `REWARD_OUT_OF_STOCK` | Tests de inventario no implementados |
| GAP-008 | Campaña expirada | `CAMPAIGN_EXPIRED` | Tests de vigencia no implementados |

### Baja Prioridad

| ID | Escenario | Código de Error | Razón del Gap |
|----|-----------|------------------|---------------|
| GAP-009 | Invalid cursor | `INVALID_CURSOR` | Paginación edge cases |
| GAP-010 | Sesión expirada | `SESSION_EXPIRED` | Tests de refresh token |
| GAP-011 | Cuota API excedida | `QUOTA_EXCEEDED` | Límites de API key |

---

## Matriz de Cobertura

| Módulo | Happy Path | Errores | Gap Principal |
|--------|------------|---------|---------------|
| Auth | ✅ | ✅ | Refresh token |
| Users | ✅ | ✅ | - |
| Stores | ✅ | ⚠️ Parcial | - |
| Cards | ✅ | ⚠️ Parcial | - |
| Campaigns | ✅ | ✅ | Vigencia/Expiry |
| Transactions | ✅ | ⚠️ Parcial | Webhook signature |
| Rewards | ✅ | ⚠️ Parcial | Double redeem |
| Reports | ✅ | ✅ | - |
| WhatsApp | ⚠️ Parcial | ❌ | Firma webhook |
| Alerts | ⚠️ Parcial | ❌ | - |

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
