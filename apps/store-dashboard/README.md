# Store Dashboard

Dashboard operativo para tienda (tenderos y soporte) construido con Next.js + React Query.

## Scripts

- `bun run dev` - Inicia la app en `http://localhost:3003`
- `bun run lint` - Ejecuta lint

## Variables

- `NEXT_PUBLIC_API_URL` (opcional) - URL del backend, por defecto `http://localhost:3000`

## Usuarios sugeridos (segun seed)

- Seed `development`: `store.development@qoa.local` / `Password123!`
- Seed `development` (admin): `admin.development@qoa.local` / `Password123!`
- Seed `local`: `store.local@qoa.local` / `Password123!`

## Funcionalidades actuales

- Resumen diario con KPIs de tienda
- Escanear payload/cardId y registrar transacciones
- Ranking de clientes frecuentes por actividad
- Reportes de ventas/acumulaciones/canjes por día
