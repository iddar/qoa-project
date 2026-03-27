# Store Dashboard

Dashboard operativo para tienda (tenderos y soporte) construido con Next.js + React Query.

## Scripts

- `bun run dev` - Inicia la app en `http://localhost:3003`
- `bun run lint` - Ejecuta lint

La app ya escucha en `0.0.0.0`, así que también la puedes abrir desde otros dispositivos usando la IP LAN de tu máquina, por ejemplo `http://192.168.1.203:3003`.

Si quieres levantar todo el entorno de desarrollo listo para dispositivos en red local desde la raíz del monorepo, usa:

```sh
bun run dev:env:public
```

Ese comando expone API y frontends para LAN, y publica las URLs usando tu IP detectada o `PUBLIC_HOST` si la defines manualmente.

## Variables

- `NEXT_PUBLIC_API_URL` (opcional) - URL del backend, por defecto `http://localhost:3000`
- `MINIMAX_API_KEY` - API key de MiniMax para el asistente POS server-side
- `CHOUGH_URL` - URL del servidor de transcripción de voz, por ejemplo `http://127.0.0.1:8080`

Para probar desde otros dispositivos en tu red local, levanta el dashboard con la URL pública del API:

```sh
NEXT_PUBLIC_API_URL=http://192.168.1.203:3000 bun run dev
```

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

## Notas de voz para POS

El asistente POS puede recibir notas de voz y transcribirlas server-side antes de enviarlas al agente.

### Levantar Chough

En una terminal separada ejecuta:

```sh
chough --server --host 127.0.0.1 --port 8080
```

Para validar que esté listo:

```sh
curl http://127.0.0.1:8080/health
```

### Iniciar el dashboard con voz

Con el servidor arriba, inicia el dashboard apuntando a `CHOUGH_URL`:

```sh
CHOUGH_URL=http://127.0.0.1:8080 bun run dev
```

### Flujo esperado

1. Abre el asistente POS.
2. Pulsa el botón del micrófono para grabar una nota de voz.
3. Detén la grabación y decide si quieres enviarla o cancelarla.
4. El dashboard manda el audio a `chough`, recibe la transcripción y usa ese texto como mensaje del tendero.

`chough` usa `ffmpeg`, así que formatos comunes de navegador y móvil como `webm`, `mp4`, `m4a`, `mpeg`, `wav` y `ogg` pueden atravesar el flujo siempre que el navegador permita capturarlos o adjuntarlos.

Nota importante para iPhone/Safari: aunque uses HTTPS, Safari móvil puede ser inestable con grabación y scanner QR en vivo. El dashboard prioriza `Adjuntar audio` y captura de foto del QR como fallback más confiable en esos dispositivos.

## Escaneo de QR

- `Ligar tarjeta` abre la cámara trasera por defecto en móvil cuando el navegador lo permite.
- El dashboard intenta decodificar el QR del lado cliente con `html5-qrcode` antes de mandar el dato al backend.
- Si la lectura local falla, cae al flujo de imagen para que el servidor intente resolverlo como fallback.
- La wallet muestra un QR compacto basado en `card.code` para mejorar la lectura en cámara real.
