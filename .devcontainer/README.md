# GitHub Codespaces Configuration

This directory contains the configuration for GitHub Codespaces, which allows you to develop the Qoa project in a fully configured cloud-based development environment.

## What's Included

The Codespaces environment includes:

- **Bun runtime** (v1+) - High-performance JavaScript/TypeScript runtime
- **PostgreSQL 16** - Database for the application
- **Redis 7** - Caching and session storage
- **Pre-configured VS Code extensions**:
  - Bun support
  - ESLint & Prettier
  - Docker support
  - Git tools
  - GitHub Copilot
  - TypeScript error formatting

## Quick Start

### Using GitHub Codespaces

1. **Create a new Codespace**:
   - Go to the repository on GitHub
   - Click the "Code" button
   - Select "Codespaces" tab
   - Click "Create codespace on main" (or your branch)

2. **Wait for setup**:
   - The environment will automatically build and start all services
   - Dependencies will be installed via `bun install`
   - This may take 2-3 minutes on first launch

3. **Start development**:
   ```bash
   bun run dev
   ```
   
4. **Access the application**:
   - VS Code will notify you when port 3000 is forwarded
   - Click the notification or go to the "Ports" tab
   - The app will be accessible at the forwarded URL

## Architecture

The Codespaces environment mirrors the production architecture using docker-compose:

```
┌─────────────────────────────────────────┐
│  GitHub Codespaces Container            │
│                                          │
│  ┌──────────────────────────────────┐  │
│  │  App Service (Bun)               │  │
│  │  Port: 3000                      │  │
│  │  Workspace: /app                 │  │
│  └──────────────────────────────────┘  │
│                                          │
│  ┌──────────────────────────────────┐  │
│  │  PostgreSQL                      │  │
│  │  Port: 5432                      │  │
│  │  User: qoa                       │  │
│  │  Database: qoa_local             │  │
│  └──────────────────────────────────┘  │
│                                          │
│  ┌──────────────────────────────────┐  │
│  │  Redis                           │  │
│  │  Port: 6379                      │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Available Commands

Inside the Codespace, you can run:

```bash
# Install dependencies
bun install

# Start development server with hot reload
bun run dev

# Start production server
bun run start

# Run tests
bun test spec
```

## Environment Variables

The environment variables are automatically loaded from `src/.env.local` by the docker-compose configuration:

- `PORT=3000` - Application port
- `NODE_ENV=development` - Environment mode
- `POSTGRES_*` - PostgreSQL connection settings
- `REDIS_*` - Redis connection settings

The services are configured to use hostnames defined in docker-compose:
- PostgreSQL: `postgres:5432`
- Redis: `redis:6379`

## Ports

The following ports are forwarded automatically:

- **3000** - Application (HTTP API + OpenAPI UI)
- **5432** - PostgreSQL database
- **6379** - Redis cache

## Health Checks

You can verify services are running:

```bash
# Check app health
curl http://localhost:3000/health

# Check PostgreSQL (from within the postgres container)
docker exec qoa-project-postgres-1 pg_isready -h localhost -U qoa -d qoa_local

# Check Redis (from within the redis container)
docker exec qoa-project-redis-1 redis-cli ping
```

## Troubleshooting

### Services not starting

If services fail to start, try rebuilding the container:
1. Open Command Palette (Cmd/Ctrl + Shift + P)
2. Run "Codespaces: Rebuild Container"

### Port forwarding issues

If you can't access the app:
1. Check the "Ports" tab in VS Code
2. Ensure port 3000 is listed and forwarded
3. Click the globe icon to open in browser

### Dependencies not installed

If you see import errors:
```bash
cd /app
bun install
```

### Database connection issues

Verify PostgreSQL is running:
```bash
docker ps
```

All services should show as "healthy" status.

## Tips

- **Hot reload**: The `bun run dev` command includes hot reload, so changes are reflected immediately
- **Database persistence**: Data is persisted in Docker volumes and survives Codespace rebuilds
- **Multiple terminals**: Use VS Code's terminal split feature to run multiple commands simultaneously
- **Extensions**: Installed extensions are configured for optimal TypeScript/Bun development

## Local Development Alternative

If you prefer to develop locally instead of using Codespaces:

```bash
# Start only database services
docker compose up -d postgres redis

# Run app locally with Bun
cd src
bun install
bun run dev
```

For more details, see the main [README.md](../README.md).
