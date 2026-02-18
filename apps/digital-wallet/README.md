# Digital Wallet

Wallet mobile-first para clientes finales con tarjeta digital, historial y recompensas.

## Scripts

- `bun run dev` - Inicia la app en `http://localhost:3004`
- `bun run lint` - Ejecuta lint

## Variables

- `NEXT_PUBLIC_API_URL` (opcional) - URL del backend, por defecto `http://localhost:3000`

## Usuario sugerido (seed local)

- `consumer.local@qoa.local` / `Password123!`

## Funcionalidades actuales

- Login y signup para consumidores
- Selección de tarjeta digital + visualización QR
- Historial de transacciones por tarjeta con agrupación por tienda/marca/campaña
- Registro de compra por payload manual (sin escaneo QR)
- Catálogo de recompensas disponibles por campaña
- Catálogo de campañas tipo reto con suscripción desde la wallet
- Provisionado automático de tarjeta universal al crear cuenta
- Relación Wallet x Rewards por campaña suscrita con saldos por campaña

## Payload de compra (manual)

Ejemplo mínimo:

```json
{
  "storeId": "STORE_UUID",
  "items": [
    {
      "productId": "PRODUCT_UUID",
      "quantity": 1,
      "amount": 85
    }
  ]
}
```

`cardId` es opcional: si no se envía, se utiliza la tarjeta universal del usuario.
