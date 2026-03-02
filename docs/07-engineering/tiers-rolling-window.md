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
