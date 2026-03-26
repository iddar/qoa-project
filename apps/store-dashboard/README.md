# Store Dashboard

Dashboard operativo para tienda (tenderos y soporte) construido con Next.js + React Query.

## Scripts

- `bun run dev` - Inicia la app en `http://localhost:3003`
- `bun run lint` - Ejecuta lint

## Variables

- `NEXT_PUBLIC_API_URL` (opcional) - URL del backend, por defecto `http://localhost:3000`
- `MINIMAX_API_KEY` - API key de MiniMax para el asistente POS server-side

## Usuarios sugeridos (segun seed)

- Seed `development`: `store.development@qoa.local` / `Password123!`
- Seed `development` (admin): `admin.development@qoa.local` / `Password123!`
- Seed `local`: `store.local@qoa.local` / `Password123!`

## Funcionalidades actuales

- Resumen diario con KPIs de tienda
- POS con borrador compartido: tendero o IA pueden armar el pedido antes de confirmar
- Resolución de cliente por QR JSON, `cardId` o `card code`
- Asistente lateral con MiniMax + AI SDK para buscar productos, ligar tarjetas y confirmar ventas
- Escanear payload/cardId y registrar transacciones
- Ranking de clientes frecuentes por actividad
- Reportes de ventas/acumulaciones/canjes por día

## Flujo POS actual

1. El tendero arma el pedido en `POS` o desde el panel IA.
2. Puede ligar al cliente en cualquier momento con el QR de su tarjeta.
3. Nada se registra en backend hasta confirmar la venta.
4. Al confirmar, el portal usa el flujo canónico de transacciones para registrar compra, acumulaciones y balances.
