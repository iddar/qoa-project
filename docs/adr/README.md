# adr

Esta carpeta contiene las Architectural Decision Records (ADRs) numeradas.

## Cómo rellenar

Crea archivos numerados como `0001-decision-title.md`, `0002-another-decision.md`, etc.

Cada ADR debe seguir el formato:

- **Título**: Breve descripción de la decisión.
- **Contexto**: Situación que llevó a la decisión.
- **Decisión**: Qué se decidió hacer.
- **Alternativas consideradas**: Otras opciones evaluadas.
- **Consecuencias**: Impactos positivos y negativos.

Ejemplo:
```
# ADR 0001: Elección de Base de Datos

## Contexto
Necesitamos almacenar datos de usuarios...

## Decisión
Usar PostgreSQL...

## Alternativas consideradas
- MySQL: ...
- MongoDB: ...

## Consecuencias
- Pros: ...
- Cons: ...
```