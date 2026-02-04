# Testing GitHub Codespaces Setup

This document provides instructions for testing the GitHub Codespaces configuration.

## Prerequisites

- GitHub account with Codespaces access
- Repository access to iddar/qoa-project

## Test Plan

### 1. Launch Codespace

**Steps:**
1. Navigate to https://github.com/iddar/qoa-project
2. Click the "Code" button
3. Select the "Codespaces" tab
4. Click "Create codespace on main" or use the badge in README.md

**Expected Results:**
- Codespace creation starts
- VS Code interface loads in browser or desktop app
- Terminal shows build progress

### 2. Verify Container Build

**Expected Results:**
- Docker Compose builds the app service
- PostgreSQL container starts with health check passing
- Redis container starts with health check passing
- Post-create command executes (`bun install`)
- No errors in the build logs

### 3. Verify VS Code Extensions

**Steps:**
1. Open the Extensions panel (Cmd/Ctrl + Shift + X)
2. Check for installed extensions

**Expected Extensions:**
- ✓ Bun for Visual Studio Code (oven.bun-vscode)
- ✓ ESLint (dbaeumer.vscode-eslint)
- ✓ Prettier (esbenp.prettier-vscode)
- ✓ Docker (ms-azuretools.vscode-docker)
- ✓ Code Spell Checker (streetsidesoftware.code-spell-checker)
- ✓ GitLens (eamodio.gitlens)
- ✓ GitHub Copilot (github.copilot)
- ✓ Pretty TypeScript Errors (yoavbls.pretty-ts-errors)

### 4. Verify Port Forwarding

**Steps:**
1. Open the "Ports" tab in VS Code
2. Check forwarded ports

**Expected Results:**
- Port 3000 (Application) - shown and accessible
- Port 5432 (PostgreSQL) - shown
- Port 6379 (Redis) - shown

### 5. Test Application Startup

**Steps:**
1. Open a new terminal in VS Code
2. Run:
   ```bash
   bun run dev
   ```

**Expected Results:**
- Application starts successfully
- Shows "Server is running at http://0.0.0.0:3000"
- Hot reload is enabled
- No errors in the console

### 6. Test Application Endpoints

**Steps:**
1. Wait for the port forwarding notification
2. Click "Open in Browser" for port 3000
3. Navigate to `/health`

**Expected Results:**
- Browser opens with the forwarded URL
- `/health` endpoint returns a successful response
- No errors in browser console

### 7. Test Database Connection

**Steps:**
1. In the terminal, run:
   ```bash
   docker ps
   ```

**Expected Results:**
- `qoa-project-postgres-1` shows as "Up" and "healthy"
- `qoa-project-redis-1` shows as "Up" and "healthy"
- `qoa-project-app-1` shows as "Up"

**Optional - Direct PostgreSQL Test:**
```bash
docker exec -it qoa-project-postgres-1 psql -U qoa -d qoa_local -c "SELECT version();"
```

### 8. Test Redis Connection

**Steps:**
```bash
docker exec -it qoa-project-redis-1 redis-cli ping
```

**Expected Results:**
- Returns "PONG"

### 9. Test Hot Reload

**Steps:**
1. With `bun run dev` running
2. Open `src/index.ts`
3. Make a small change (e.g., add a comment)
4. Save the file

**Expected Results:**
- Terminal shows reload message
- Application reloads automatically
- New changes are reflected immediately

### 10. Test Environment Variables

**Steps:**
1. In the terminal, run:
   ```bash
   printenv | grep -E "(NODE_ENV|POSTGRES|REDIS)"
   ```

**Expected Results:**
- `NODE_ENV=development`
- PostgreSQL variables are set
- Redis variables are set

### 11. Test Bun Commands

**Steps:**
```bash
bun --version
bun test spec
```

**Expected Results:**
- Bun version 1.x.x displayed
- Tests run successfully (if any exist)

## Common Issues and Solutions

### Issue: Container fails to build

**Solution:**
1. Check the build logs in the terminal
2. Verify `src/package.json` and `src/bun.lock` exist
3. Try rebuilding: Command Palette → "Codespaces: Rebuild Container"

### Issue: Port 3000 not forwarded

**Solution:**
1. Manually forward the port: Ports tab → "Add Port" → Enter 3000
2. Or restart the application: Stop `bun run dev` and start again

### Issue: Database connection errors

**Solution:**
1. Check service health: `docker compose ps`
2. Wait for health checks to pass (may take 30 seconds)
3. Verify environment variables in `src/.env.local`

### Issue: Bun not found

**Solution:**
1. Check if you're in the correct container
2. Verify the Dockerfile uses `oven/bun` base image
3. Rebuild the container

## Success Criteria

All of the following should be true:

- [x] Codespace launches without errors
- [x] All three services (app, postgres, redis) are running and healthy
- [x] `bun run dev` starts the application successfully
- [x] Application is accessible via forwarded port 3000
- [x] `/health` endpoint responds correctly
- [x] Hot reload works when editing files
- [x] All recommended VS Code extensions are installed
- [x] Database and Redis connections work

## Cleanup

After testing, you can:
1. Stop the Codespace: File → Close Remote Connection
2. Delete the Codespace: GitHub → Settings → Codespaces → Delete

## Additional Testing

### Performance Test

Test the application performance:
```bash
curl http://localhost:3000/health
time curl http://localhost:3000/health
```

### Load Test (Optional)

If you want to test under load:
```bash
# Install apache bench if available
ab -n 100 -c 10 http://localhost:3000/health
```

## Documentation Verification

Verify all documentation is accurate:
- [x] `.devcontainer/README.md` - Instructions are clear
- [x] Main `README.md` - Codespaces section is visible
- [x] Badge link works correctly

## Reporting Issues

If you find any issues during testing, please report them with:
1. Steps to reproduce
2. Expected vs actual behavior
3. Screenshots if applicable
4. Codespace creation logs
5. Container runtime logs

## Notes

- First launch takes longer due to image pulls and builds (~2-3 minutes)
- Subsequent launches are faster due to caching (~30-60 seconds)
- Data persists in Docker volumes between Codespace sessions
- Stopping the Codespace preserves data; deleting it removes everything
