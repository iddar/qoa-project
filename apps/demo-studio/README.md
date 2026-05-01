# QOA Demo Studio

Genera assets, capturas, videos Remotion y mini decks PPTX para tres demos comerciales:

- `pos-wallet`: POS móvil + wallet móvil.
- `inventory-intake`: foto de inventario + corrección por voz.
- `geo-campaigns`: creación de campaña con cobertura geográfica.

## Requisitos

Levanta el ambiente local antes de grabar:

- Core API: `http://localhost:3000`
- CPG Portal: `http://localhost:3002`
- Store Dashboard: `http://localhost:3003`
- Digital Wallet: `http://localhost:3004`

Para el modo fixture del agente no necesitas OpenRouter. El recorder activa `demoAgentMode=fixture` desde el navegador y las rutas solo aceptan ese header fuera de producción.

## Comandos

```bash
bun run demo:prepare
bun run demo:record --scenario all
bun run demo:render --scenario all
bun run demo:deck --scenario all
```

También puedes pasar un escenario específico:

```bash
bun run demo:record --scenario pos-wallet
bun run demo:render --scenario inventory-intake
bun run demo:deck --scenario geo-campaigns
```

## Salidas

- Assets deterministas: `apps/demo-studio/public/generated/`
- Capturas: `apps/demo-studio/public/recordings/<scenario>/`
- Videos: `apps/demo-studio/out/<scenario>.mp4`
- Decks: `apps/demo-studio/out/<scenario>.pptx`

Antes de usar Remotion con fines comerciales, valida la licencia aplicable para la organización.
