# 02-architecture

Esta carpeta contiene la documentación de arquitectura, incluyendo el modelo C4, requerimientos no funcionales (NFRs) y diagramas.

## Cómo rellenar

### Modelo C4
- Crea archivos para cada nivel:
  - `c4-contexto.md`: Diagrama de contexto (sistemas externos, terceros).
  - `c4-contenedores.md`: Diagrama de contenedores (frontend, backend, APIs, DB, etc.).
  - `c4-componentes.md`: Diagrama de componentes (servicios internos).
  - `c4-codigo.md`: Diagrama de código (opcional, para módulos críticos).

Usa Mermaid o PlantUML para los diagramas.

### NFRs (Requerimientos No Funcionales)
- Crea un archivo `nfrs.md` con:
  - Disponibilidad objetivo (ej. 99.9%).
  - Latencia esperada (p95/p99).
  - Volumen: usuarios, requests/seg, throughput.
  - Escalabilidad (horizontal).
  - Durabilidad de datos.
  - Seguridad y cumplimiento.

### Diagramas
- Crea una carpeta `diagramas/` y agrega diagramas adicionales en formato de código (Mermaid/PlantUML) o imágenes.