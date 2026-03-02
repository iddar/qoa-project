# Backoffice

Panel interno para operadores Qoa (`qoa_admin`, `qoa_support`) construido con Next.js + React Query.

## Scripts

- `bun run dev` - Inicia la app en `http://localhost:3001`
- `bun run lint` - Ejecuta lint

## Variables

Puedes usar `apps/backoffice/.env.example` como base y copiarlo a `.env.local`.

- `NEXT_PUBLIC_API_URL` (opcional) - URL del backend, por defecto `http://localhost:3000`
- `NEXT_PUBLIC_CPG_PORTAL_URL` (opcional) - URL del portal CPG para link en topbar, por defecto `http://localhost:3002`
- `NEXT_PUBLIC_STORE_DASHBOARD_URL` (opcional) - URL del dashboard de tiendas para link en topbar, por defecto `http://localhost:3003`
- `NEXT_PUBLIC_WALLET_URL` (opcional) - URL del wallet para link en topbar, por defecto `http://localhost:3004`
