# Qoa

> Nota: este documento es un punto de partida (borrador). La intención es capturar el contexto actual, decisiones tentativas y preguntas abiertas para iterar después.

## Premisa

El objetivo es establecer un sistema centralizado para la administración de múltiples tipos de programas de lealtad, con el usuario como eje principal. Cada usuario dispondrá de un identificador único (su tarjeta universal). Adicionalmente, contará billetera digital (wallet), que contendrá las tarjetas individuales asociadas a cada establecimiento comercial (y/o marca).

Las campañas pueden ser permanentes o temporales, todo debe ser totalmente configurable, tanto a nivel de CPG como de Comercio.

## Tipos de programas de lealtad

- **Programas basados en puntos**: Los clientes acumulan unidades de valor (puntos) con cada adquisición, las cuales son canjeables por descuentos, productos sin costo o servicios privilegiados. La sencillez de este modelo motiva la continuidad de compra para la obtención de mayores recompensas.
- **Programas de estructura jerárquica (niveles)**: La progresión del cliente a través de distintos escalones se determina por el volumen de compras o el logro de metas específicas (como el monto total gastado). Cada nivel superior confiere beneficios adicionales y exclusivos, incentivando un mayor gasto para acceder a retribuciones de categoría superior.
- **Programas de beneficios exclusivos y personalizados**: Este esquema, a diferencia de los puntos o niveles, se enfoca en ofrecer ventajas únicas y adaptadas a los clientes con mayor fidelidad, tales como acceso prioritario a eventos, lanzamientos de productos especiales o atención personalizada. Dicha estrategia fomenta la percepción de valor y aprecio por parte del cliente.

Los programas de lealtad se pueden cuantificar de dos maneras:

- **Por interacciones o frecuencia**: Se mide mediante el número de acciones o participaciones (por ejemplo, sellos).
- **Por tamaño de la operación o valor**: Se mide a través de la cantidad o valor de la transacción (por ejemplo, puntos).

## POC / MVP (borrador): Conectados

Sistema de lealtad para el tendero, facilitado por T-Conecta (Qoa).

### Flujo propuesto (end-to-end)

1. Qoa entrega un QR a la tienda (vía T-Conecta).
2. La tienda imprime el QR y lo coloca en mostrador.
3. El cliente escanea el QR y se abre WhatsApp con un mensaje tipo: “Quiero crear mi tarjeta de puntos de [Tienda]”.
4. Qoa responde por WhatsApp y entrega un link a una página donde el cliente ve su tarjeta (puntos/estampas) + un CTA para comprar cierto producto (PLI) y ganar su primera estampa.
5. El cliente compra; la tienda escanea el QR de la tarjeta del cliente y el código de barras del producto.
6. Qoa envía recordatorios con cierta periodicidad para completar estampas.
7. Qoa retroalimenta a la tienda con ventas generadas + CTA para incrementar orden de productos (PLI).
8. Qoa retroalimenta a comercial/marketing con el ROI del programa.

### Beneficios esperados (hipótesis)

- Aumentar ventas del tendero (alta adopción en canal tradicional).
- Generar data no solo del tendero, sino del cliente final (habilitar microsegmentación a futuro).
- “Tarjeta de estampas/puntos” como semilla de un producto más complejo (storefront digital / conversacional).
- Reducir dependencia operativa de T-Conecta (idealmente solo el escaneo); definir workarounds si el escaneo es lento (p. ej. evidencias con códigos alfanuméricos por WhatsApp).
- Diferenciación vs intermediarios (Beez, Arca, etc.): ellos intermedian entre CPGs y canal tradicional; nosotros entre CPGs y cliente final a través del canal tradicional.

## Preguntas abiertas (para completar después)

- ¿Esquema de puntos, estampas o combinación?
El sistema debe ser capas de operar ambos, al crear una campaña se define el esquema. 
- ¿Qué ofrecemos como premio al cliente final? (alinear con Comercial).
Esto debe ser configurable por campaña.
- ¿Qué tan “automático” es el escaneo en tienda (UX y tiempos reales)? ¿Qué hacemos si falla?
Este es un punto crítico a validar en la POC, debemos de brindar toda la tecnología para que nos puean integrar fácilmente, debemos tener un buen control de errores y tiempos de respuesta.
esto debe ir directo a la documentación técnica.
- ¿Cuáles son los “PLI” iniciales (productos), cuántos CPGs y bajo qué reglas de campaña?
Todo esto son parametros configurables en la creación de campañas, aun no tengo claro la estructura final de las campañas, como se introducen los PLI, sobretodo 
- ¿Qué métricas mínimas definen éxito del piloto (retención, conversión, repetición, incremento de venta, etc.)?

## Documentación

La documentación vive en /docs. Los READMEs de cada carpeta explican qué llenar:

- [docs/01-overview/README.md](docs/01-overview/README.md)
- [docs/02-architecture/README.md](docs/02-architecture/README.md)
- [docs/03-apis/README.md](docs/03-apis/README.md)
- [docs/04-data/README.md](docs/04-data/README.md)
- [docs/05-security/README.md](docs/05-security/README.md)
- [docs/06-ops/README.md](docs/06-ops/README.md)
- [docs/07-engineering/README.md](docs/07-engineering/README.md)
- [docs/adr/README.md](docs/adr/README.md)

## Entorno de ejecución con Bun + Docker

### Variables de entorno

El runtime carga las variables definidas en `src/.env.local` automáticamente (Bun soporta `.env*` sin dependencias adicionales). El archivo incluido en el repo trae valores de ejemplo para:

- `PORT`, `NODE_ENV` para la app HTTP.
- `POSTGRES_*` y `DATABASE_URL` para la base de datos interna.
- `REDIS_*` y `REDIS_URL` para la caché/eventos.

Actualiza esos valores antes de desplegar en otros entornos; no compartas secretos reales en control de versiones.

### Dockerfile + docker-compose

1. Construye e inicia toda la pila (API Bun + Postgres + Redis):

   ```bash
   docker compose up --build
   ```

2. La app expone `http://localhost:3000/health` y la UI de OpenAPI en `/openapi`.
3. Para apagar los servicios y conservar los datos de Postgres/Redis en volúmenes locales:

   ```bash
   docker compose down
   ```

Los servicios usan las credenciales definidas en `src/.env.local`. Ajusta puertos/volúmenes editando `docker-compose.yml`.

### Solo dependencias en Docker (Bun corriendo en tu máquina)

Cuando quieras aprovechar hot-reload de `bun run dev` pero mantener la misma base de datos/caché de Docker:

1. Levanta únicamente las dependencias:

   ```bash
   docker compose up -d postgres redis
   ```

2. Usa las variables de `src/.env.development` (Bun ya carga `.env.development` cuando `bun run dev` establece `BUN_ENV=development`). Asegúrate de que `POSTGRES_HOST` y `REDIS_HOST` apunten a `127.0.0.1`, tal como viene en ese archivo.
3. Ejecuta la app local:

   ```bash
   cd src
   bun install
   bun run dev
   ```

4. Cuando termines, detén los contenedores (los volúmenes persisten):

   ```bash
   docker compose stop postgres redis
   ```

### Flujo de desarrollo local (sin contenedores)

Desde `src/`:

```bash
bun install
bun run dev   # recarga en caliente para desarrollo
bun test spec # ejecuta las pruebas existentes
```

Los comandos anteriores respetan el principio de “Bun-first” (sin npm, node, ni ts-node).
