# 07-engineering

Esta carpeta contiene los estándares internos de ingeniería, incluyendo git, PRs, testing y otros procesos.

## Cómo rellenar

### Estándares de Desarrollo
- Crea `git-prs.md` con:
  - Convenciones de git (commits, branches).
  - Proceso de PRs (reviews obligatorios, checklists).

### Testing
- Crea `testing.md` con:
  - Tests mínimos (unit, contract para APIs).
  - CI/CD con gates (lint, test, security scan).

### Otros Estándares
- Crea archivos para:
  - `apis-estandares.md`: OpenAPI 3.0, errores, idempotencia, paginación.
  - `eventos-estandares.md`: AsyncAPI, naming (domain.entity.action.v1).
  - `logging-tracing.md`: Correlation ID, logs estructurados, métricas.
  - `decisiones.md`: ADR para elecciones clave (DB, arquitectura, etc.).