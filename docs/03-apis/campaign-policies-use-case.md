# Caso de Uso - Políticas de Campaña

## Objetivo

Definir cómo configurar políticas de acumulación para controlar fraude y gobernar la entrega de puntos/estampas durante el registro de transacciones.

## Flujo operativo

1. Crear campaña en `draft`.
2. Crear políticas con `POST /campaigns/{campaignId}/policies`.
3. Validar políticas en backoffice (`/campaigns`) y revisar auditoría.
4. Mover campaña por ciclo de vida (`ready_for_review` -> `in_review` -> `confirmed` -> `active`).
5. Registrar transacciones y verificar acumulaciones aplicadas sobre balance.

## Tipos de políticas soportadas

- `max_accumulations`: límite de acumulaciones en `transaction`, `day`, `week`, `month` o `lifetime`.
- `min_amount`: monto mínimo de compra para acumular.
- `min_quantity`: cantidad mínima para acumular por alcance.
- `cooldown`: ventana mínima entre acumulaciones en horas (sobre periodos temporales).

## Alcances soportados

- `campaign`: aplica a toda la campaña.
- `brand`: aplica a productos de una marca (`scopeId` = `brand.id`).
- `product`: aplica a un producto específico (`scopeId` = `product.id`).

## Endpoints

- `GET /campaigns/{campaignId}/policies`: lista políticas.
- `POST /campaigns/{campaignId}/policies`: crea política.
- `PATCH /campaigns/{campaignId}/policies/{policyId}`: actualiza política.

## Notas de implementación actual

- Solo se permite crear/editar políticas cuando campaña está en `draft` o `rejected`.
- Cambios de políticas generan trazas en `campaign_audit_logs`.
- En transacciones, las acumulaciones se filtran según políticas activas; los items rechazados no incrementan balance.
