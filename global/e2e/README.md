# Global E2E (Playwright)

Suite end-to-end multi-app para validar el flujo completo de negocio:

- Backoffice: crear tienda
- CPG Portal: crear marca, producto, campana y recompensa
- Digital Wallet: signup consumidor + suscripcion a campana + validacion de recompensa
- Store Dashboard: registrar transaccion y confirmar reflejo en wallet

## Requisitos

- Core API y apps levantadas en local:
  - `http://localhost:3000` (core)
  - `http://localhost:3001` (backoffice)
  - `http://localhost:3002` (cpg-portal)
  - `http://localhost:3003` (store-dashboard)
  - `http://localhost:3004` (digital-wallet)
- Seed cargado para credenciales de prueba (`admin/cpg/store`).

## Variables de entorno

Usa `global/e2e/.env.example` como base.

## Ejecucion

```bash
bun run e2e
```

Opciones:

```bash
bun run e2e:headed
bun run e2e:ui
bun run e2e:video
```

`e2e:video` graba video para toda la suite (uso local para evidencia).

## Ubicacion de specs

- `global/e2e/specs/**/*.spec.ts`
- helpers en `global/e2e/support/`

## Flujos cubiertos

- Journey full multi-app (`full-platform-flow.spec.ts`)
- Compra manual desde Wallet por payload (`wallet-manual-purchase-flow.spec.ts`)
- Propagacion Store Dashboard -> Wallet (`store-to-wallet-propagation.spec.ts`)
