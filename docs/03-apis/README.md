# 03-apis

Esta carpeta contiene la documentación de APIs, incluyendo contratos OpenAPI/AsyncAPI y guías para integraciones.

## Cómo rellenar

### Contratos de API
- Crea archivos de especificación:
  - `openapi.yaml` o `openapi.json`: Especificación OpenAPI 3.0 para APIs REST.
  - `asyncapi.yaml`: Especificación AsyncAPI para eventos.
  - Incluye versionado (v1, v2) y reglas de deprecación.
  - Agrega ejemplos de requests/responses.

### Guías para Desarrolladores
- Crea archivos de guía:
  - `autenticacion.md`: Cómo obtener credenciales/llaves, OAuth2/JWT/API keys.
  - `rate-limits.md`: Límites de tasa y cuotas.
  - `idempotencia.md`: Uso de idempotency keys en endpoints críticos.
  - `webhooks.md`: Reintentos, firma, verificación.
  - `errores.md`: Códigos y mensajes estandarizados de error.
  - `sandbox.md`: Entorno de pruebas.

### Políticas de Compatibilidad
- Crea `compatibilidad.md` con:
  - Cambios breaking.
  - Ventana de deprecación (ej. 90 días).
  - Changelog.