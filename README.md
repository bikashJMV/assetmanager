# Asset Manager

Asset Manager is a **Supabase-centered asset tracking platform** for physical and digital assets. It provides end-to-end lifecycle management with role-based access control, event-driven email notifications, and comprehensive telemetry.

## Repository Structure

```
assetmanager/
├── Client/                 # React 19 + Vite 7 + TypeScript SPA
├── Server/                 # FastAPI backend (Python 3.12+)
├── Observability/          # Grafana stack (Loki + Tempo + Prometheus + Alloy)
├── logs/                   # Server log files (tailed by Alloy)
└── Additional notes/       # Documentation and guides
```

## Architecture

### Data Flow

- **Browser → Supabase**: Most runtime reads and writes (direct connection with anon key + JWT)
- **Browser → FastAPI**: Trusted operations (QR generation, PDF export, bulk operations)
- **FastAPI → Supabase**: Service-role operations (bypasses RLS)
- **FastAPI → Email Service**: Event-driven notifications
- **Observability**: Logs, traces, and metrics collected by Grafana stack

### Key Components

1. **Database (Supabase/PostgreSQL)**:
   - Business logic in SQL (RLS policies, views, RPCs)
   - 53 migrations in `Server/db/migrations/v2/`
   - Row-level security for multi-tenant access control

2. **Frontend (React SPA)**:
   - Direct Supabase connection for most operations
   - OpenTelemetry Web SDK for browser traces
   - Role-based UI (employee, admin, it_ops)

3. **Backend (FastAPI)**:
   - Service-role Supabase client for trusted operations
   - QR code generation and PDF label export
   - Email notification orchestration
   - Prometheus metrics endpoint
   - Loki log proxy for IT Ops

4. **Observability (Grafana Stack)**:
   - **Logs**: Server stdout → log files → Alloy → Loki
   - **Traces**: Browser/Server OTLP → Alloy → Tempo
   - **Metrics**: Prometheus scraping `/metrics` endpoint
   - **Dashboards**: Grafana with auto-provisioned data sources

## Core Domain Rules

### Nomenclature

- **Asset Tag**: System-generated identifier (e.g., AST-00001)
- **Category**: Asset type (laptop, desktop, monitor, etc.)
- **User**: Assignment holder (employee)

### Roles

Stored in `employees.role` column:
- **employee**: View own assets, own profile
- **admin**: Manage all assets, all employees, bulk operations
- **it_ops**: Full access + observability dashboard (highest tier)

### Employee Flags

- `is_active`: Employment status (active/inactive)
- `erp_active`: ERP system status (separate flag, migration 16)

**Important**: Asset status is NOT derived from ERP status.

### Assignment Rules

- **Assign**: `fn_assign_asset(asset_tag, employee_code, ...)`
- **Return**: `fn_return_asset(asset_tag, ...)`
- **Lifecycle**: `fn_set_asset_lifecycle_status(asset_tag, new_status, ...)`

**Status Whitelist** (migration 21): Only `in_stock` or `assigned` assets can be assigned.

### Lifecycle States

- `in_stock`: Available for assignment
- `assigned`: Currently assigned to employee
- `in_repair`: Under maintenance (auto-returns from employee)
- `retired`: End of life
- `lost`: Missing
- `disposed`: Discarded

### Public QR Scan

**RPC**: `fn_public_scan_asset(asset_tag)`

**Data Exposure** (migration 22):
- **Assigned assets**: `asset_name`, `holder_name`, `holder_employee_code`, `holder_department`, `holder_email` (migration 53), `category` (migration 35)
- **Unassigned assets**: `asset_name`, `status`, `asset_tag`, `category`

**Security**: No internal IDs, purchase dates, warranty info, custom fields, or location data exposed.

### Recycle Bin (Soft Delete)

- **Soft Delete**: Marks record as deleted, moves to recycle bin
- **Restore**: Recovers from recycle bin
- **Permanent Delete**: Only after soft delete (migration 46)

**Employee Directory** (`v_employee_directory`): Excludes employees with open recycle bin entries (migration 45).

## Repository Guides

- [`Client/CLIENT_README.md`](./Client/CLIENT_README.md) - React SPA documentation
- [`Server/SERVER_README.md`](./Server/SERVER_README.md) - FastAPI backend documentation
- [`Server/db/migrations/v2/README.md`](./Server/db/migrations/v2/README.md) - Database migrations
- [`Observability/OBSERVABILITY_TELEMETRY.md`](./Observability/OBSERVABILITY_TELEMETRY.md) - Observability stack

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.12+
- Docker (for Grafana stack)
- Supabase account

### 1. Database Setup

1. Create Supabase project at [supabase.com](https://supabase.com)
2. Apply migrations in order (01-53):
   ```bash
   # In Supabase SQL Editor, run each migration file
   # Or use Supabase CLI:
   supabase db push
   ```
3. Note down:
   - Project URL
   - Anon key (public)
   - Service role key (secret)

### 2. Client Setup

```bash
cd Client

# Copy environment template
cp .env.example .env

# Edit .env with your Supabase credentials
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

# Install dependencies
npm install

# Start development server
npm run dev
```

**Access**: `http://localhost:5173`

### 3. Server Setup

```bash
cd Server

# Copy environment template
cp .env.example .env

# Edit .env with your Supabase credentials
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_KEY=your-service-role-key

# Install dependencies
pip install -r requirements.txt

# Start development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Access**: 
- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`

### 4. Observability Stack (Optional)

```bash
cd Observability

# Copy environment template
cp .env.observability.example .env.observability

# Start Grafana stack
docker compose up -d
```

**Access**:
- Grafana: `http://localhost:3000` (admin/admin)
- Prometheus: `http://localhost:9090`
- Loki: `http://localhost:3100`

### 5. Create Initial Admin

**Option 1: Bootstrap Endpoint**
```bash
curl -X POST http://localhost:8000/internal/bootstrap-role \
  -H "X-Bootstrap-Secret: your-bootstrap-secret" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@company.com", "role": "it_ops"}'
```

**Option 2: Direct Database**
```sql
-- Create employee
INSERT INTO employees (employee_code, name, email, role, is_active)
VALUES ('EMP-001', 'Admin User', 'admin@company.com', 'it_ops', true);

-- After first Google sign-in, link auth_user_id
UPDATE employees
SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'admin@company.com')
WHERE email = 'admin@company.com';
```

## Environment Variables

### Client (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_SUPABASE_URL` | Yes | - | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | - | Supabase anon key (public) |
| `VITE_PUBLIC_APP_ORIGIN` | No | `https://web-assetmanager.vercel.app` | QR scan origin |
| `VITE_API_URL` | No | `http://localhost:8000` | FastAPI server URL |
| `VITE_BACKEND_API_KEY` | No | - | Backend API key (if required) |
| `VITE_OTEL_GRAFANA_ENABLED` | No | `false` | Enable OpenTelemetry tracing |
| `VITE_OTEL_EXPORTER_ENDPOINT` | No | `http://localhost:4318` | OTLP/HTTP endpoint |
| `VITE_GRAFANA_DASHBOARD_URL_FOR_ITOPS` | No | - | Grafana dashboard link |

### Server (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | - | Supabase project URL |
| `SUPABASE_KEY` | Yes | - | Supabase service-role key (secret) |
| `FRONTEND_URL` | Recommended | `https://web-assetmanager.vercel.app` | Client origin for QR generation |
| `ALLOWED_ORIGINS` | Recommended | - | CORS allowlist (comma-separated) |
| `BACKEND_API_KEY` | No | - | Optional API key for protected routes |
| `ROLE_BOOTSTRAP_SECRET` | No | - | Break-glass role promotion secret |
| `ENV` | No | `local` | Environment (local/production) |
| `EMAIL_SERVICE_URL` | No | - | Email notification microservice URL |
| `BACKEND_API_KEY_EMAIL_NOTIFICATION` | No | - | Email service API key |
| `NOTIFICATIONS_ENABLED` | No | `false` | Enable email notifications |
| `OTEL_GRAFANA_ENABLED` | No | `false` | Enable Prometheus `/metrics` endpoint |
| `LOKI_BASE_URL` | No | `http://localhost:3100` | Loki URL for log proxy |

## Key Features

### Asset Management

- ✅ Create, read, update, delete (soft delete)
- ✅ Assign to employees
- ✅ Return to stock
- ✅ Lifecycle status management (in_repair, retired, lost, disposed)
- ✅ QR code generation and scanning
- ✅ PDF label export (bulk)
- ✅ Bulk import from Excel
- ✅ Complete audit trail with actor snapshots

### Employee Management

- ✅ Create, read, update, delete (soft delete)
- ✅ Role-based access control (employee, admin, it_ops)
- ✅ Google OAuth authentication
- ✅ Auto-link auth_user_id on sign-in
- ✅ Bulk import from Excel
- ✅ Recycle bin with restore

### Observability

- ✅ Browser traces (OpenTelemetry Web SDK)
- ✅ Server metrics (Prometheus)
- ✅ Server logs (Loki)
- ✅ IT Ops log viewer in UI
- ✅ Grafana dashboards
- ✅ Request correlation (X-Request-Id)

### Security

- ✅ Row-level security (RLS) policies
- ✅ JWT authentication (Supabase Auth)
- ✅ Role-based authorization
- ✅ CORS protection
- ✅ API key protection (optional)
- ✅ Audit logging

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 19.0.0 |
| Build Tool | Vite | 7.0.0 |
| Language | TypeScript | 5.6.2 |
| Styling | TailwindCSS | 3.4.17 |
| Backend | FastAPI | Latest |
| Language | Python | 3.12+ |
| Database | PostgreSQL (Supabase) | 15+ |
| Auth | Supabase Auth | Latest |
| Observability | Grafana Stack | Latest |
| Telemetry | OpenTelemetry | Latest |

## Development Workflow

### Making Database Changes

1. Create new migration file: `Server/db/migrations/v2/54_your_change.sql`
2. Apply migration in Supabase SQL Editor
3. Update `Server/db/migrations/v2/README.md` with migration details
4. Test migration on local database
5. Commit migration file

### Adding New Features

1. Update database schema (if needed)
2. Update backend API (if needed)
3. Update frontend UI
4. Update tests
5. Update documentation

### Testing

**Client**:
```bash
cd Client
npm run test        # Run tests once
npm run test:watch  # Watch mode
npm run lint        # ESLint
```

**Server**:
```bash
cd Server
python -m pytest tests/ -v
```

## Deployment

### Client (Vercel)

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables
4. Deploy

**Build Command**: `npm run build`  
**Output Directory**: `dist`

### Server (Vercel/Docker/Traditional)

See [`Server/SERVER_README.md`](./Server/SERVER_README.md) for deployment options.

### Database (Supabase)

Migrations are applied via Supabase SQL Editor or CLI.

## Troubleshooting

### "Employee is not active" error

**Cause**: Employee `is_active = false`

**Fix**: Edit employee, set Active to true

### "Asset status must be in_stock or assigned" error

**Cause**: Asset is in `in_repair`, `retired`, `lost`, or `disposed`

**Fix**: Change asset status to "In Stock" first, then assign

### Soft-deleted employee still appears

**Cause**: Missing migration 45 or 47

**Fix**: Apply migrations 45 and 47

### QR scan returns 404

**Cause**: Asset doesn't exist or is soft-deleted

**Fix**: Verify asset tag, check recycle bin

### Logs not in Grafana

**Cause**: Alloy not tailing log files

**Fix**: Check Alloy config, restart Alloy

## Notes

- The client assumes `https://web-assetmanager.vercel.app` for QR codes unless overridden by `VITE_PUBLIC_APP_ORIGIN`
- The server must have `FRONTEND_URL` matching the client host for correct QR generation
- Anonymous QR scan exposes only limited data (see Public QR Scan section)
- Treat PostgreSQL RPC schema as single source of truth

## License

Proprietary - All rights reserved

## Support

For questions or issues, refer to:
- [Detailed Technical Report](./Additional%20notes/Detailed_Report.md)
- Individual README files in each directory
- Database migration documentation

