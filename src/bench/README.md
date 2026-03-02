# QOA Core – Performance Benchmarks

Benchmarks de carga HTTP usando [`hey`](https://github.com/rakyll/hey).

## Prerequisitos

```sh
brew install hey
```

## Flujo rápido

### 1. Levantar el servidor

```sh
# desde la raíz del repo
bun run --cwd src dev
```

El servidor escucha en `http://localhost:3000`.

### 2. Correr el seed local (primera vez o cuando necesites datos frescos)

```sh
# desde la raíz del repo
bun run --cwd src db:seed:local
```

El seed imprime los IDs que necesitarás para los benchmarks de escritura:

```
[seed:local] CPG seed: <cpg-id>
[seed:local] Store seed: <store-id>   ← BENCH_STORE_ID
[seed:local] Product seed: <prod-id>  ← BENCH_PRODUCT_ID
- consumer -> consumer.local@qoa.local / Password123!
```

Para obtener el `userId` y `cardId` del consumer, haz login o consulta la DB:

```sh
# Ejemplo rápido via curl (el servidor debe estar corriendo)
curl -s -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"consumer.local@qoa.local","password":"Password123!"}' \
  | jq '.data.user.id'
```

### 3. Configurar variables de entorno

```sh
export BENCH_USER_ID="<consumer-user-id>"
export BENCH_STORE_ID="<store-id-del-seed>"
export BENCH_PRODUCT_ID="<product-id-del-seed>"
export BENCH_CARD_ID="<card-id-del-consumer>"  # opcional
```

### 4. Correr el benchmark

```sh
# Todas las suites
./bench/run.sh

# O desde el package.json de /src
bun run bench

# Una sola suite
./bench/run.sh health
./bench/run.sh post_transaction
```

---

## Opciones

| Flag | Descripción |
|------|-------------|
| `--save-baseline` | Guarda el run actual como referencia en `bench/results/baseline-<timestamp>.txt` |
| `--compare` | Corre el benchmark y compara p50/p99/RPS vs el baseline más reciente |

```sh
# Primer run → guardar como baseline
./bench/run.sh --save-baseline

# Después de un cambio → comparar
./bench/run.sh --compare
```

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | URL base del servidor |
| `CONCURRENCY` | `10` | Número de workers paralelos |
| `REQUESTS` | `200` | Total de requests por suite |
| `HEY_EXTRA_FLAGS` | `` | Flags extra para `hey` (ej. `-disable-keepalive`) |
| `BENCH_USER_ID` | — | UUID del usuario consumer del seed |
| `BENCH_STORE_ID` | — | UUID de la tienda del seed |
| `BENCH_PRODUCT_ID` | — | UUID del producto del seed |
| `BENCH_CARD_ID` | — | UUID de la tarjeta universal del consumer (opcional) |

## Suites disponibles

| Suite | Endpoint | Qué mide |
|-------|----------|----------|
| `health` | `GET /v1/health` | Overhead puro del framework, sin DB |
| `stores` | `GET /v1/stores?limit=20` | Query simple con auth + paginación |
| `transactions` | `GET /v1/transactions?limit=20` | Query con filtros + cursor-pagination |
| `campaigns` | `GET /v1/campaigns?limit=20` | List con tenant-scope |
| `reports` | `GET /v1/reports/overview` | Query agregada (posibles N+1) |
| `post_transaction` | `POST /v1/transactions` | Path crítico: escritura en DB + acumulaciones |

## Interpretar resultados de hey

```
Summary:
  Total:        2.5432 secs
  Slowest:      0.4821 secs
  Fastest:      0.0041 secs
  Average:      0.1132 secs
  Requests/sec: 78.64      ← RPS – más alto es mejor

Latency distribution:
  10% in 0.0312 secs
  25% in 0.0521 secs
  50% in 0.0923 secs   ← p50 (mediana)
  75% in 0.1441 secs
  90% in 0.2312 secs
  95% in 0.2891 secs
  99% in 0.4102 secs   ← p99 (cola)

Status code distribution:
  [200] 200 responses  ← todos 200 = sin errores
```

**Métricas clave a monitorear:**
- **p50 (mediana):** comportamiento típico
- **p99 (cola):** worst-case que verá ~1% de usuarios
- **Requests/sec:** throughput total
- **Status codes:** cualquier 4xx/5xx es un problema

## Workflow de iteración

```
1. ./bench/run.sh --save-baseline   # capturar estado actual
2. Hacer mejora en el código
3. Reiniciar el servidor
4. ./bench/run.sh --compare         # ver si mejoró
5. Repetir desde el paso 2
```

Los archivos de resultados se guardan en `bench/results/` (gitignored).
