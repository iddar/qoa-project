# Runbook de Incidentes Tipicos

## 1) Aumento de errores 5xx en API

### Senales

- Error rate > 1% sostenido.
- Endpoint dominante identificado en logs.

### Respuesta

1. Confirmar alcance (todas las rutas o una ruta especifica).
2. Correlacionar con ultimo deploy o cambio de infraestructura.
3. Revisar logs con `trace_id` para causa raiz.
4. Aplicar rollback si impacta flujo critico.

## 2) Fallo de conexion a PostgreSQL

### Senales

- Timeouts generalizados en operaciones de lectura/escritura.
- Errores de pool/conexion en logs.

### Respuesta

1. Validar disponibilidad del proveedor DB.
2. Revisar limites de conexiones y saturacion.
3. Reducir carga concurrente temporalmente.
4. Si no recupera en 10 minutos, escalar a SEV1.

## 3) Cola de reminders creciendo sin procesar

### Senales

- `queued` sube y `completed` se estanca.
- Atraso promedio > 15 minutos.

### Respuesta

1. Revisar workers y errores de ejecucion.
2. Reiniciar worker/servicio afectado si aplica.
3. Incrementar capacidad temporal.
4. Reprocesar lote pendiente controladamente.

## 4) Alta tasa de firmas invalidas en webhooks

### Senales

- picos de `INVALID_WHATSAPP_SIGNATURE` o webhook signature invalida.

### Respuesta

1. Verificar secreto configurado por ambiente.
2. Confirmar formato exacto de payload firmado.
3. Coordinar con proveedor externo.
4. Mantener rechazo estricto para preservar seguridad.

## 5) Degradacion de frontend portal/backoffice

### Senales

- Aumento de errores en login o llamadas a API.
- LCP/TTFB degradados en monitoreo de UX.

### Respuesta

1. Confirmar salud de API.
2. Revisar errores en consola/build reciente.
3. Rollback de frontend si el problema es de release UI.
