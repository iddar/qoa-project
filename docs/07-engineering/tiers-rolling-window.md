# Rolling Window Tiers

Implementación inicial de tiers end-to-end con foco en constancia:

- El cálculo de nivel usa actividad dentro de una ventana móvil (`day`, `month`, `year`).
- Cada tier puede definir `minPurchaseCount`, `minPurchaseAmount`, o ambos.
- `qualificationMode` controla si se evalúa `any` (OR) o `all` (AND).
- El downgrade no es inmediato: se aplica `graceDays` y el card queda en estado `at_risk`.
- La reevaluación ocurre en transacciones, canjes y mediante job manual `POST /v1/jobs/tiers/run`.

## Modelo de datos

- `campaign_tiers`: configuración principal del nivel por campaña.
- `tier_benefits`: beneficios declarativos del tier (display-first en MVP).
- `cards.current_tier_id`: nivel actual aplicado a la tarjeta.
- `cards.tier_grace_until`: fecha límite para mantener nivel antes de bajar.
- `cards.tier_last_evaluated_at`: última reevaluación del motor.

## Estado MVP

- Beneficios de tier se exponen en API/Wallet para visualización.
- No se alteran reglas transaccionales por beneficio aún (fase siguiente).

## Extensiones implementadas

- `campaigns.accumulation_mode` soporta `count` y `amount`.
- Reglas finas opcionales por alcance (`campaign`, `brand`, `product`) con `multiplier`, `flatBonus`, `priority`.
- Recompensas pueden exigir un tier mínimo (`rewards.min_tier_id`).
- En canje, se valida tier actual de la tarjeta contra el tier mínimo requerido.

## Matriz de comportamiento por configuración

| Escenario | ¿Acumula? | Cómo acumula | ¿Puede canjear recompensa? | Tier resultante |
|---|---|---|---|---|
| Campaña sin reglas de acumulación, `accumulationMode=count` | Sí | `quantity` por item | Sí, si hay saldo/stock | Si no hay tiers: `unqualified` |
| Campaña sin reglas de acumulación, `accumulationMode=amount` | Sí | `amount * quantity` por item | Sí, si hay saldo/stock | Si no hay tiers: `unqualified` |
| Campaña con reglas de acumulación activas | Sí | Base (`count/amount`) + regla aplicada (`x multiplier + flatBonus`) | Sí, si hay saldo/stock | Se evalúa con rolling window si hay tiers |
| Campaña sin políticas (`min/cooldown/max`) | Sí | Sin restricciones extra | Sí | Igual que arriba |
| Campaña con políticas activas | Depende | Puede bloquear acumulación por item/periodo | Sí | Igual que arriba |
| Campaña sin tiers | Sí | Normal | Sí | Siempre `currentTierId = null`, `tierState = unqualified` |
| Campaña con tiers, usuario califica | Sí | Normal | Sí | `qualified` (o `at_risk` si entra en gracia) |
| Recompensa sin `minTierId` | N/A | N/A | Sí (si saldo/stock/validaciones) | N/A |
| Recompensa con `minTierId` y usuario por debajo | N/A | N/A | No (`REWARD_TIER_REQUIRED`) | Mantiene tier actual |
| Recompensa con `minTierId` y usuario cumple | N/A | N/A | Sí | N/A |

### Defaults del sistema

- `accumulationMode` por defecto al crear campaña: `count`.
- Si no hay accumulation-rules: se aplica acumulación base (`x1 + 0` implícito).
- Si no hay tiers: no hay bloqueo funcional por nivel (`currentTierId = null`).
- Si una recompensa no define `minTierId`: no exige tier mínimo.
