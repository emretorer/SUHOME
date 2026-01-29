# SUHOME

Full-stack ecommerce project (client + server) built with React/Vite and Node.js/Express, backed by MySQL. The server exposes REST APIs under `/api` and serves the production client build from `server/public`.

## Tech stack
- Client: React 19, Vite, React Router, GSAP
- Server: Node.js (ESM), Express 5, mysql2, Prisma (schema/migrations), Nodemailer
- Database: MySQL

## Repository structure
- `client/` Vite React app
- `server/` Express API + static hosting for built client
- `server/prisma/` Prisma schema
- `database/` SQL schema and seed scripts
- `docs/` (empty placeholders)
- `cloudbuild.yaml` Cloud Build/Run pipeline
- `Dockerfile` production image build (multi-stage)

## Local development

### 1) Install dependencies
```bash
cd server
npm install

cd ../client
npm install
```

### 2) Configure environment
Create `server/.env` with runtime (app) credentials. Example:
```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=suhome_app
DB_PASSWORD=your_app_password
DB_DATABASE=suhome

PORT=3000

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=suhomedev@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="SUHOME <suhomedev@gmail.com>"

PAYMENT_ENCRYPTION_KEY=base64_or_hex_key
FRONTEND_BASE_URL=http://localhost:5173
```

If you use Cloud SQL sockets in production, the server also supports:
```bash
DB_SOCKET_PATH=/cloudsql/PROJECT:REGION:INSTANCE
INSTANCE_CONNECTION_NAME=PROJECT:REGION:INSTANCE
```

### 3) Database setup
This project assumes the schema already exists. Do NOT run schema creation at runtime.

Options:
- Apply SQL directly: `database/schema.sql` then `database/seed.sql`
- Or use Prisma with a migrate user (DDL privileges only)

Recommended production model:
- `suhome_migrate` for migrations (CREATE/ALTER/DROP)
- `suhome_app` for runtime (SELECT/INSERT/UPDATE/DELETE)

Example migration env (not committed):
```bash
DATABASE_URL="mysql://suhome_migrate:password@host:3306/suhome"
```

From `server/`:
```bash
npx prisma migrate deploy
```

### 4) Run dev servers
```bash
# API server (http://localhost:3000)
cd server
npm run dev

# Client (http://localhost:5173)
cd ../client
npm run dev
```

## Production build
The server serves static files from `server/public`. Build the client and copy output there (or use Docker).

### Docker (production-like)
```bash
docker build -t suhome .
docker run --rm -p 8081:8080 \
  --env-file server/.env \
  -e NODE_ENV=production \
  -e PORT=8080 \
  suhome

curl -i http://localhost:8081/api/products
```

If MySQL is on the host machine:
```bash
docker run --rm -p 8081:8080 \
  --env-file server/.env \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e DB_HOST=host.docker.internal \
  suhome
```

## API routes (high level)
All APIs are served under `/api`:
- `/api/products`
- `/api/cart`
- `/api/orders`
- `/api/support`
- `/api/auth`
- `/api/comments`
- `/api/sales`
- `/api/payments`
- `/api/users`
- `/api/wishlist`
- `/api/categories`
- `/api/main-categories`
- `/api/returns`
- `/api/product-requests`

## Notes
- The server auto-creates `server/uploads` at startup for file uploads.
- Email sending uses SMTP settings from `server/.env`.
- Schema changes must be handled by Prisma migrations or SQL scripts, not by app runtime.
