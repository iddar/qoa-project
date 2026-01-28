# Requerimientos No Funcionales (NFRs)

> Targets técnicos y de calidad para el MVP Conectados.

---

## Disponibilidad

| Métrica | Target | Notas |
|---------|--------|-------|
| **Uptime API** | 99.9% | ~8.7 horas downtime/año máximo |
| **Uptime Web** | 99.9% | Frontends alineados con API |
| **Ventana de mantenimiento** | Fuera de horario pico | Preferir madrugada (2-5 AM) |

### Implicaciones
- Requiere infraestructura redundante (multi-AZ)
- Despliegues sin downtime (rolling deployments)
- Health checks y failover automático

---

## Latencia

| Operación | Target p95 | Target p99 |
|-----------|------------|------------|
| **Registro de transacción** | < 500ms | < 1s |
| **Consulta de balance** | < 200ms | < 500ms |
| **Login/Auth** | < 500ms | < 1s |
| **Generación de QR** | < 300ms | < 500ms |
| **Carga de reportes** | < 2s | < 5s |

### Implicaciones
- Índices optimizados en BD
- Caching agresivo (Redis)
- CDN para assets estáticos
- Queries eficientes, evitar N+1

---

## Throughput

| Métrica | Target |
|---------|--------|
| **Transacciones pico** | 50-200 TPS |
| **Usuarios concurrentes** | 5,000+ |
| **Requests/segundo API** | 500+ RPS |

### Consideraciones de escala
- Diseño stateless para escalado horizontal
- Connection pooling a base de datos
- Rate limiting por tenant/API key
- Queue para operaciones async (notificaciones, reportes)

---

## Recuperación ante Desastres

| Métrica | Target | Descripción |
|---------|--------|-------------|
| **RPO** | < 15 minutos | Pérdida máxima de datos |
| **RTO** | < 15 minutos | Tiempo máximo para restaurar servicio |

### Estrategia
- Backups automáticos cada 15 minutos
- Replicación de BD (read replicas)
- Failover automático
- Runbooks documentados
- Pruebas de DR periódicas

---

## Seguridad

### Nivel: Básico (OWASP Top 10)

| Control | Implementación |
|---------|----------------|
| **Injection** | Queries parametrizadas, ORM |
| **Broken Auth** | JWT con expiración, refresh tokens |
| **Sensitive Data** | HTTPS obligatorio, cifrado en reposo |
| **XXE** | Parsers seguros, validación de input |
| **Broken Access Control** | RBAC, validación por tenant |
| **Security Misconfiguration** | Headers seguros, configs auditadas |
| **XSS** | Sanitización de output, CSP |
| **Insecure Deserialization** | Validación de schemas (Zod) |
| **Vulnerable Components** | Auditoría de dependencias |
| **Logging** | Logs estructurados, sin datos sensibles |

### Pendiente para fases posteriores
- Penetration testing
- SOC 2 / ISO 27001
- WAF avanzado

---

## Retención de Datos

| Tipo de Dato | Retención | Razón |
|--------------|-----------|-------|
| **Transacciones** | 5+ años | Análisis histórico, cumplimiento |
| **Usuarios** | Indefinida (con política de borrado) | GDPR/LFPDPPP |
| **Logs operativos** | 90 días | Troubleshooting |
| **Logs de auditoría** | 5+ años | Compliance |
| **Backups** | 30 días rolling | Recuperación |

### Política de borrado
- Derecho al olvido (soft delete → hard delete después de periodo)
- Anonimización de datos históricos si se requiere

---

## Internacionalización (i18n)

| Componente | Idioma | Notas |
|------------|--------|-------|
| **Código fuente** | Inglés | Variables, funciones, comentarios |
| **OpenAPI spec** | Inglés | Puede localizarse después |
| **Documentación técnica** | Inglés | ADRs, arquitectura |
| **Frontends** | i18n desde inicio | Español default, expandible |
| **Mensajes de error (usuario)** | Localizados | Español para LATAM |
| **Logs del sistema** | Inglés | Para consistencia técnica |

### Arquitectura i18n
- Archivos de traducción separados (JSON/YAML)
- Formato de fechas/números por locale
- Preparado para RTL (futuro)

---

## Observabilidad

### Logging

| Aspecto | Estándar |
|---------|----------|
| **Formato** | JSON estructurado |
| **Correlation ID** | En cada request (trace_id) |
| **Niveles** | ERROR, WARN, INFO, DEBUG |
| **PII** | Nunca en logs |

### Métricas

| Métrica | Tipo |
|---------|------|
| Request count | Counter |
| Request duration | Histogram |
| Error rate | Gauge |
| Active connections | Gauge |
| Queue depth | Gauge |

### Alertas

| Condición | Severidad | Acción |
|-----------|-----------|--------|
| Error rate > 1% | Warning | Notificación |
| Error rate > 5% | Critical | PagerDuty |
| Latency p95 > 1s | Warning | Notificación |
| Disponibilidad < 99.9% | Critical | PagerDuty |

---

## Performance del Frontend

| Métrica | Target |
|---------|--------|
| **LCP (Largest Contentful Paint)** | < 2.5s |
| **FID (First Input Delay)** | < 100ms |
| **CLS (Cumulative Layout Shift)** | < 0.1 |
| **Time to Interactive** | < 3s (3G) |

### Estrategias
- Code splitting
- Lazy loading de imágenes
- Service worker para PWA
- Compresión de assets

---

## Compatibilidad

### Navegadores (Frontends)

| Navegador | Versión Mínima |
|-----------|----------------|
| Chrome | Últimas 2 versiones |
| Safari | Últimas 2 versiones |
| Firefox | Últimas 2 versiones |
| Edge | Últimas 2 versiones |
| Samsung Internet | Últimas 2 versiones |

### Dispositivos

| Tipo | Soporte |
|------|---------|
| **Mobile** | Prioritario (mobile-first) |
| **Tablet** | Soportado |
| **Desktop** | Soportado |

---

## Rate Limiting

| Endpoint | Límite | Ventana |
|----------|--------|---------|
| **API pública** | 100 req | 1 minuto |
| **API autenticada** | 1000 req | 1 minuto |
| **Login** | 5 intentos | 15 minutos |
| **Registro** | 10 req | 1 hora |

---

## Resumen de SLOs

| SLO | Target | Medición |
|-----|--------|----------|
| Disponibilidad | 99.9% | Uptime mensual |
| Latencia transacciones | p95 < 500ms | Percentil 95 |
| Error rate | < 1% | Errores 5xx / total requests |
| RPO | < 15 min | Tiempo entre backups |
| RTO | < 15 min | Tiempo de recuperación |
