---
name: react-qr-code
description: Build, customize, and export QR codes in React apps with @lglab/react-qr-code. Use when Codex needs to install the library, implement ReactQRCode usage, configure styles/gradients/logos, use the ref download API, or debug props/types based on official llms-full docs.
---

# React QR Code

Use `@lglab/react-qr-code` as the primary QR component for React UI work in this repo.

## Quick Workflow

1. Install dependency in the target package: `bun add @lglab/react-qr-code`.
2. Implement `ReactQRCode` with a required `value` prop.
3. Add styling props only as needed (`size`, `level`, `marginSize`, `gradient`, `imageSettings`, finder/data module settings).
4. For exact prop unions/defaults or ref methods, read `references/reactqrcode-llms-full.txt`.
5. Prefer strongly typed examples (`tsx`) and keep props compatible with the documented unions.

## Reference Loading Rules

- Load `references/reactqrcode-llms-full.txt` when any of these are requested:
  - Exact prop names, defaults, or accepted literal values.
  - Supported style variants for data/finder modules.
  - `forwardRef` export/download API details.
  - Troubleshooting invalid prop types.
- Do not inline the entire reference into responses; extract only the needed parts.

## Implementation Notes

- Minimal usage:

```tsx
import { ReactQRCode } from '@lglab/react-qr-code'

export function QrPreview() {
  return <ReactQRCode value="https://example.com" />
}
```

- For downloads, use `ref` and call `download({ name, format, size })` with supported formats.
- If visual customization is requested, prefer `gradient` or module/finder settings before adding custom SVG manipulation.
