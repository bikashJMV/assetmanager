# Asset Manager Email Microservice

A production-grade, standalone microservice built with FastAPI that handles all automated email notifications for the Asset Manager ecosystem. This service acts as a plug-and-play internal system that maps application events directly to beautifully designed HTML templates with built-in retry logic, audit logging, and secure authentication.

---

## 1. Project Overview

This microservice solves the problem of email notification management by providing a centralized, decoupled service that can be integrated into any application. Instead of embedding email logic directly into your main application (Asset Manager, ERP, etc.), applications simply send HTTP requests to this service, which handles:

- Email dispatch with exponential backoff retry (3 attempts: 1s, 4s, 16s)
- Dynamic Jinja2 template rendering with Asset Manager dashboard aesthetic
- To/CC recipient resolution based on role hierarchy
- Full audit logging to Supabase for observability
- SHA-256 HMAC-based API key authentication
- Rate limiting (200 requests/minute via slowapi)
- IST date calculation (UTC + 5:30)

---

## 2. Tech Stack

| Library | Version | Purpose | Why Chosen |
|---------|---------|---------|------------|
| FastAPI | 0.135.3 | High-performance async web framework | Built-in validation, OpenAPI docs, async support |
| fastapi-mail | 1.6.2 | Async email sending with SMTP | Async support, Jinja2 integration, background tasks |
| Jinja2 | 3.1.6 | HTML templating engine | Industry standard, flexible, email client compatible |
| Supabase | 2.28.3 | PostgreSQL client for audit logging | Real-time, Python SDK, Row Level Security |
| Pydantic | 2.12.5 | Data validation and settings | Type safety, automatic validation, settings management |
| Pydantic Settings | 2.13.1 | Environment variable management | Type-safe config, .env support, validation |
| Slowapi | 0.1.9 | Rate limiting middleware | FastAPI-compatible, flexible, production-ready |
| Uvicorn | 0.44.0 | ASGI server | Fast, production-ready, hot reload |

---

## 3. Architecture

```
Client Application (Asset Manager, ERP, etc.)
            |
            | HTTP POST /send/event
            | Headers: X-API-Key, Content-Type
            | Body: EmailRequest (JSON)
            v
+---------------------------+
|  FastAPI Application      |
|  (main.py)                |
+---------------------------+
            |
            | 1. Rate Limit Check (slowapi)
            | 2. API Key Verification (SHA-256 HMAC)
            | 3. Pydantic Validation (EmailRequest)
            v
+---------------------------+
|  Background Tasks Queue   |
|  (FastAPI BackgroundTasks)|
+---------------------------+
            |
            | Async Task: send_with_retry()
            v
+---------------------------+
|  Email Service Layer      |
|  (app/services/email.py)  |
+---------------------------+
            |
            | 1. Fetch IST Date (UTC + 5:30)
            | 2. Resolve Recipients (To/CC)
            | 3. Get Template Info
            | 4. Render Jinja2 Template
            | 5. Send via fastapi-mail
            | 6. Retry on Failure (1s, 4s, 16s)
            v
+---------------------------+
|  SMTP Server (Gmail)      |
+---------------------------+
            |
            | Success/Failure
            v
+---------------------------+
|  Supabase Audit Log       |
|  (app/services/logger.py) |
+---------------------------+
            |
            | Log Entry: queued, success, failed
            v
+---------------------------+
|  Supabase Database        |
|  Tables: api_keys, email_logs|
+---------------------------+
```

### Layer Explanations

**API Layer (app/api/routes.py):** Handles HTTP requests, rate limiting, authentication, and background task queuing. Returns 202 Accepted immediately for async processing.

**Service Layer (app/services/email.py):** Core business logic including retry mechanism, recipient resolution, template mapping, and email dispatch.

**Logging Layer (app/services/logger.py):** Synchronous Supabase logging for full audit trail (queued, success, failed states).

**Security Layer (app/core/security.py):** SHA-256 HMAC-based API key verification.

**Rate Limiting (app/core/limiter.py):** Centralized slowapi limiter instance (200/minute).

---

## 4. Project Structure

```
email-service/
|-- main.py                          # FastAPI app entry point
|-- pyproject.toml                   # Project dependencies (uv)
|-- requirements.txt                 # Pinned dependencies
|-- vercel.json                      # Vercel deployment config
|-- supabase_init.sql                # Supabase schema
|-- .env                             # Environment variables
|
+-- app/
    |-- config.py                    # Settings class, mail_config
    |-- api/routes.py                # API endpoints: GET /, POST /send/event
    |-- core/security.py             # SHA-256 HMAC API key verification
    |-- core/limiter.py              # Centralized slowapi limiter
    |-- schemas/email.py             # Pydantic models: EmailRequest, ApiResponse
    |-- services/email.py             # send_with_retry, resolve_recipients
    |-- services/logger.py           # log_email_event to Supabase
    |-- services/worldtime.py        # fetch_current_date (IST calculation)
    |-- templates/
        |-- email/
            |-- AssetManager/
                |-- base.html        # Base template with dashboard aesthetic
                |-- asset_assigned.html  # Template for asset.assigned
                |-- asset_returned.html  # Template for asset.returned
                |-- force_recall_old.html # Template for force.recall.old
                |-- force_recall_new.html # Template for force.recall.new
```

---

## 5. How It Works

### Step-by-Step Flow

**1. Client Application Sends Request**
```http
POST /send/event HTTP/1.1
X-API-Key: your-api-key
Content-Type: application/json

{
  "event_name": "asset.assigned",
  "primary_recipient": {
    "email": "employee@example.com",
    "name": "John Doe",
    "role": "employee"
  },
  "admin_email": "admin@example.com",
  "admin_name": "Admin Smith",
  "all_admin_emails": ["admin@example.com", "it@example.com"],
  "asset_data": {
    "category": "Laptop",
    "model_no": "MacBook Pro M3",
    "asset_id": "AST-001"
  }
}
```

**2. API Layer Processes Request**
- Rate limit check: 200/minute per IP
- API key verification: SHA-256 HMAC comparison with stored hash
- Pydantic validation: EmailRequest schema validation
- Returns 202 Accepted with request_id

**3. Background Task Queued**
```python
background_tasks.add_task(send_with_retry, request_id, payload.dict())
```

**4. Email Service Executes (Async)**
```python
async def send_with_retry(request_id: str, payload: dict, max_retries: int = 3):
    delay = 1
    for attempt in range(max_retries):
        try:
            current_date = fetch_current_date()  # UTC + 5:30
            to, cc = resolve_recipients(payload)
            template_info = get_template_info(payload['event_name'])
            template_data = {
                "employee_name": payload['primary_recipient']['name'],
                "admin_name": payload['admin_name'],
                "category": payload['asset_data']['category'],
                "model_no": payload['asset_data']['model_no'],
                "asset_id": payload['asset_data']['asset_id'],
                "date": current_date,  # DD-MM-YYYY format
            }
            fm = FastMail(mail_config)
            await fm.send_message(message, template_name=template_info["template"])
            log_email_event(request_id, payload, status="success", retry_count=attempt, dispatched_date=current_date)
            return
        except Exception as e:
            if attempt == max_retries - 1:
                log_email_event(request_id, payload, status="failed", retry_count=attempt, error=str(e))
                return
            await asyncio.sleep(delay)
            delay *= 4  # exponential: 1s -> 4s -> 16s
```

**5. Supabase Audit Logging**
```python
def log_email_event(request_id: str, payload: dict, status: str, retry_count: int = 0, dispatched_date: str = None, error: str = None):
    data = {
        "request_id": request_id,
        "event_name": payload['event_name'],
        "recipient_email": payload['primary_recipient']['email'],
        "cc_emails": payload.get('all_admin_emails', []),
        "subject": "Email notification",
        "status": status,  # "queued", "success", "failed"
        "retry_count": retry_count,
        "error_details": error,
        "asset_category": payload['asset_data']['category'],
        "asset_model": payload['asset_data']['model_no'],
        "asset_id": payload['asset_data']['asset_id'],
        "dispatched_date": dispatched_date
    }
    supabase.table("email_logs").insert(data).execute()
```

### Key Features

**Retry Logic:** Exponential backoff with 3 attempts (1s, 4s, 16s). Logs each attempt.

**To/CC Resolution:**
- To: Employee + Admin who performed the action
- CC: All other Admins (excludes the performing admin)

**Date Fetching:** Synchronous IST calculation (UTC + 5:30), returns DD-MM-YYYY format.

**Background Processing:** Non-blocking, immediate 202 response, async email dispatch.

**Full Audit Trail:** Every state logged (queued, success, failed) with retry count and error details.

---

## 6. Email Events

### Event 1: `asset.assigned`
**Trigger:** When a laptop, phone, or any physical/digital asset is assigned to an employee.

**To Recipients:**
- Primary: Employee who received the asset
- Secondary: Admin who performed the assignment

**CC Recipients:** All other admins (excluding the performing admin)

**Template:** `asset_assigned.html`

**Subject:** "Asset Assigned to You"

**Event Title Color:** `#0a0a0a` (black)

**Context Line:** "An asset has been assigned to you by {{ admin_name }}."

**Closing Line:** "If you have any questions, please reach out to the IT Team."

---

### Event 2: `asset.returned`
**Trigger:** When an employee returns an asset and it's logged back into inventory.

**To Recipients:**
- Primary: Employee who returned the asset
- Secondary: Admin who processed the return

**CC Recipients:** All other admins (excluding the processing admin)

**Template:** `asset_returned.html`

**Subject:** "Asset Returned Successfully"

**Event Title Color:** `#28a745` (green)

**Context Line:** "Your asset return has been recorded by {{ admin_name }}."

**Closing Line:** "If you have any questions, please reach out to the IT Team."

---

### Event 3: `force.recall.old`
**Trigger:** When an asset is forcefully recalled from an employee (e.g., employee leaving, asset reallocation).

**To Recipients:**
- Primary: Employee who had the asset
- Secondary: Admin who initiated the recall

**CC Recipients:** All other admins (excluding the initiating admin)

**Template:** `force_recall_old.html`

**Subject:** "Important: Asset Force Recalled from You"

**Event Title Color:** `#dc3545` (red)

**Context Line:** "Your asset has been recalled by {{ admin_name }}."

**Closing Line:** "If you have any questions, please reach out to the IT Team."

---

### Event 4: `force.recall.new`
**Trigger:** When a recalled asset is reassigned to a new employee.

**To Recipients:**
- Primary: New employee receiving the asset
- Secondary: Admin who reassigned the asset

**CC Recipients:** All other admins (excluding the reassigning admin)

**Template:** `force_recall_new.html`

**Subject:** "Asset Assigned to You (Force Recall)"

**Event Title Color:** `#e8825a` (warm orange)

**Context Line:** "An asset has been reassigned to you by {{ admin_name }}."

**Closing Line:** "If you have any questions, please reach out to the IT Team."

---

## 7. Email Template Design

### Template Variables

All 4 event templates receive the same 6 Jinja2 variables:

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `{{ employee_name }}` | string | Name of the employee recipient | "John Doe" |
| `{{ admin_name }}` | string | Name of the admin who performed the action | "Admin Smith" |
| `{{ category }}` | string | Asset category | "Laptop" |
| `{{ model_no }}` | string | Model number | "MacBook Pro M3" |
| `{{ asset_id }}` | string | Asset ID/Tag | "AST-001" |
| `{{ date }}` | string | IST date (DD-MM-YYYY) | "11-04-2026" |

### Base Template Inheritance

**File:** `app/templates/email/AssetManager/base.html`

All event templates extend `base.html` using Jinja2 inheritance:

```html
{% extends "base.html" %}
{% block header %}Asset Assigned{% endblock %}
{% block content %}
  <!-- Event-specific content -->
{% endblock %}
```

**Base Template Structure:**
- **Header:** Black background (`#0a0a0a`), white text, "ASSET MANAGER" uppercase, letter-spacing 1px
- **Content Block:** Event-specific content injected here
- **Footer:** Light gray background (`#f5f5f0`), "Asset Manager" title, "Automated notification. Do not reply."

### UX4G Color Reference

| Element | Color | Hex Code |
|---------|-------|----------|
| Header Background | Black | `#0a0a0a` |
| Header Text | White | `#ffffff` |
| Page Background | Light Beige | `#f5f5f0` |
| Container Background | White | `#ffffff` |
| Accent Color (Table Header Left Border) | Warm Orange | `#e8825a` |
| Table Header Background | Black | `#0a0a0a` |
| Table Header Text | White | `#ffffff` |
| Table Row Even | Light Gray | `#f9f9f7` |
| Table Row Odd | White | `#ffffff` |
| Table Border | Light Gray | `#e8e8e3` |
| Text Primary | Dark Gray | `#1a1a1a` |
| Text Secondary | Medium Gray | `#6b6b6b` |
| Footer Background | Light Beige | `#f5f5f0` |

### Asset Details Table

All templates use a consistent 4-column table matching the Asset Manager dashboard:

| Column | Variable | Label Style | Value Style |
|--------|----------|-------------|-------------|
| CATEGORY | `{{ category }}` | Uppercase, 11px, #6b6b6b, letter-spacing 1px | 15px, font-weight 500, #1a1a1a |
| ASSET TAG | `{{ asset_id }}` | Uppercase, 11px, #6b6b6b, letter-spacing 1px | 15px, font-weight 500, #1a1a1a |
| MODEL | `{{ model_no }}` | Uppercase, 11px, #6b6b6b, letter-spacing 1px | 15px, font-weight 500, #1a1a1a |
| DATE | `{{ date }}` | Uppercase, 11px, #6b6b6b, letter-spacing 1px | 15px, font-weight 500, #1a1a1a |

### Email Client Compatibility

Templates use:
- Inline CSS (no external stylesheets)
- No CSS variables (hardcoded hex values)
- No JavaScript
- No external fonts
- Table-based layout (not div-based)
- Standard HTML email best practices

---

## 8. Environment Variables

### Required Variables

| Variable | Type | Description | Example Value |
|----------|------|-------------|--------------|
| `MAIL_USERNAME` | string | Gmail username for SMTP | `your-email@jmv.co.in` |
| `MAIL_PASSWORD` | string | Gmail app password (NOT account password) | `abcd efgh ijkl mnop` |
| `MAIL_FROM` | string | From email address | `your-email@jmv.co.in` |
| `MAIL_FROM_NAME` | string | From display name | `Asset Manager` |
| `MAIL_SERVER` | string | SMTP server address | `smtp.gmail.com` |
| `MAIL_PORT` | integer | SMTP port | `587` |
| `MAIL_STARTTLS` | boolean | Use STARTTLS | `True` |
| `MAIL_SSL_TLS` | boolean | Use SSL/TLS | `False` |
| `SUPABASE_URL` | string | Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_KEY` | string | Supabase service role key (NOT anon key) | `eyJhbGc...` |
| `EMAIL_SERVICE_API_KEY_HASH` | string | SHA-256 hex digest of API key | `a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890` |

### Optional Variables

| Variable | Type | Default | Description | Example Value |
|----------|------|---------|-------------|--------------|
| `MAIL_DEFAULT_CC` | string | `None` | Default CC recipient for all emails | `it@example.com` |
| `WORLDTIME_API_URL` | string | `https://worldtimeapi.org/api/timezone/Asia/Kolkata` | WorldTime API URL for IST date | `https://worldtimeapi.org/api/timezone/Asia/Kolkata` |
| `RATE_LIMIT` | string | `200/minute` | Rate limit per IP | `200/minute` |

### Side: Client vs Server

**Server Side (email-service):**
- All mail configuration variables (`MAIL_*`)
- All Supabase variables (`SUPABASE_*`)
- `EMAIL_SERVICE_API_KEY_HASH` (SHA-256 hex digest)
- `RATE_LIMIT`

**Client Side (Asset Manager, ERP, etc.):**
- Plain text API key (to be hashed and stored in `EMAIL_SERVICE_API_KEY_HASH`)
- `all_admin_emails` list (passed in request payload)

---

## 9. Supabase Schema

### Table 1: `api_keys`

Stores SHA-256 hashed API keys for authentication.

| Column | Type | Purpose | Example |
|--------|------|---------|---------|
| `id` | UUID | Primary key | `550e8400-e29b-41d4-a716-446655440000` |
| `key_hash` | TEXT | SHA-256 hex digest of API key | `a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890` |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp | `2026-04-11 12:34:56.123456+00:00` |
| `is_active` | BOOLEAN | Active status | `true` |

**SQL to Create:**
```sql
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);
```

---

### Table 2: `email_logs`

Stores full audit trail of all email events.

| Column | Type | Purpose | Example |
|--------|------|---------|---------|
| `id` | UUID | Primary key | `550e8400-e29b-41d4-a716-446655440000` |
| `request_id` | UUID | Unique request identifier | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `created_at` | TIMESTAMP WITH TIME ZONE | Log timestamp | `2026-04-11 12:34:56.123456+00:00` |
| `event_name` | TEXT | Event type | `asset.assigned` |
| `recipient_email` | TEXT | Primary recipient email | `employee@example.com` |
| `cc_emails` | TEXT[] | CC recipients array | `["admin@example.com", "it@example.com"]` |
| `subject` | TEXT | Email subject | `Asset Assigned to You` |
| `status` | TEXT | Log status: `queued`, `success`, `failed` | `success` |
| `retry_count` | INTEGER | Number of retry attempts | `1` |
| `error_details` | TEXT | Error message (if failed) | `SMTP connection timeout` |
| `asset_category` | TEXT | Asset category | `Laptop` |
| `asset_model` | TEXT | Asset model | `MacBook Pro M3` |
| `asset_id` | TEXT | Asset ID/Tag | `AST-001` |
| `dispatched_date` | TEXT | IST date (DD-MM-YYYY) | `11-04-2026` |

**SQL to Create:**
```sql
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    event_name TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    cc_emails TEXT[],
    subject TEXT NOT NULL,
    status TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    error_details TEXT,
    asset_category TEXT,
    asset_model TEXT,
    asset_id TEXT,
    dispatched_date TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_logs_request_id ON email_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at);

-- Row Level Security (RLS)
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Allow insert access to service role
DROP POLICY IF EXISTS "Allow service role to insert logs" ON email_logs;
CREATE POLICY "Allow service role to insert logs" ON email_logs
    FOR INSERT
    WITH CHECK (true);

-- Allow reading logs for service role
DROP POLICY IF EXISTS "Allow service role to select logs" ON email_logs;
CREATE POLICY "Allow service role to select logs" ON email_logs
    FOR SELECT
    USING (true);
```

---

## 10. API Reference

### Endpoint 1: `GET /`

Health check and service information endpoint.

**Method:** `GET`

**Authentication:** None required

**Headers Required:** None

**Request Body:** None

**Response (200 OK):**
```json
{
  "status": "success",
  "status_code": 200,
  "message": "Notification Microservice is running",
  "timestamp": "2026-04-11T12:34:56.123456+00:00",
  "data": {
    "service": "email-microservice",
    "version": "1.0.0",
    "supported_events": [
      "asset.assigned",
      "asset.returned",
      "force.recall.old",
      "force.recall.new"
    ]
  }
}
```

**Error Codes:** None (always returns 200)

---

### Endpoint 2: `POST /send/event`

Queue email event for processing with retry logic.

**Method:** `POST`

**Authentication:** Required (X-API-Key header)

**Headers Required:**
- `X-API-Key`: Plain text API key (will be SHA-256 HMAC verified)
- `Content-Type`: `application/json`

**Request Body (EmailRequest):**
```json
{
  "event_name": "asset.assigned",
  "primary_recipient": {
    "email": "employee@example.com",
    "name": "John Doe",
    "role": "employee"
  },
  "admin_email": "admin@example.com",
  "admin_name": "Admin Smith",
  "all_admin_emails": [
    "admin@example.com",
    "it@example.com",
    "manager@example.com"
  ],
  "asset_data": {
    "category": "Laptop",
    "model_no": "MacBook Pro M3",
    "asset_id": "AST-001"
  },
  "previous_employee_email": null,
  "new_employee_email": null
}
```

**Field Types:**
- `event_name`: Enum (`asset.assigned`, `asset.returned`, `force.recall.old`, `force.recall.new`)
- `primary_recipient`: Object with `email` (EmailStr), `name` (string), `role` (Enum: `it_ops`, `admin`, `employee`)
- `admin_email`: EmailStr (validated email format)
- `admin_name`: string
- `all_admin_emails`: Array of EmailStr (optional, default: `[]`)
- `asset_data`: Object with `category` (string, non-empty), `model_no` (string, non-empty), `asset_id` (string, non-empty)
- `previous_employee_email`: EmailStr (optional, for force.recall events)
- `new_employee_email`: EmailStr (optional, for force.recall events)

**Response (202 Accepted):**
```json
{
  "status": "success",
  "status_code": 202,
  "message": "Event queued for processing",
  "timestamp": "2026-04-11T12:34:56.123456+00:00",
  "data": {
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**Error Codes:**
- `403 Forbidden`: Invalid API key (SHA-256 HMAC verification failed)
- `422 Unprocessable Entity`: Pydantic validation error (invalid email, empty fields, etc.)
- `429 Too Many Requests`: Rate limit exceeded (200/minute)

**Error Response (403):**
```json
{
  "detail": "Invalid API key"
}
```

**Error Response (422):**
```json
{
  "detail": [
    {
      "type": "value_error.email",
      "loc": ["body", "primary_recipient", "email"],
      "msg": "value is not a valid email address",
      "input": "invalid-email"
    }
  ]
}
```

---

## 11. Authentication

### How SHA-256 HMAC API Key Verification Works

**1. API Key Generation**
```python
from app.core.security import hash_api_key

# Generate SHA-256 hash for a new API key
plain_api_key = "my-secure-api-key-123"
hashed_key = hash_api_key(plain_api_key)
# Returns: "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890"
```

**2. Store Hash in Environment**
```env
EMAIL_SERVICE_API_KEY_HASH=a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890
```

**3. Verification Flow**
```python
# app/core/security.py
async def verify_api_key(api_key: str = Security(api_key_header)):
    """Verify X-API-Key against SHA-256 hash stored in env"""
    if not hmac.compare_digest(api_key.encode(), settings.EMAIL_SERVICE_API_KEY_HASH.encode()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API key",
        )
    return api_key
```

**4. Client Sends Request**
```http
POST /send/event HTTP/1.1
X-API-Key: my-secure-api-key-123
Content-Type: application/json

{...}
```

**5. Server Verifies**
- Extracts `X-API-Key` header
- Compares plain text key with SHA-256 hash using `hmac.compare_digest()`
- Returns 403 if verification fails
- Proceeds if verification succeeds

### Generating a New API Key Pair

**Step 1: Generate Plain Text Key**
```bash
# Use a secure random string generator
python -c "import secrets; print(secrets.token_urlsafe(32))"
# Output: my-secure-api-key-123
```

**Step 2: Generate SHA-256 Hash**
```python
from app.core.security import hash_api_key

plain_key = "my-secure-api-key-123"
hashed_key = hash_api_key(plain_key)
print(hashed_key)
# Output: a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890
```

**Step 3: Update .env**
```env
EMAIL_SERVICE_API_KEY_HASH=a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890
```

**Step 4: Distribute Plain Key to Clients**
- Share `my-secure-api-key-123` with client applications
- Never share the SHA-256 hash
- Store plain key securely in client application environment variables

### Security Best Practices

- Generate API keys with at least 32 characters
- Rotate API keys regularly
- Never commit plain text keys to version control
- Use different API keys for different environments (dev, staging, prod)
- Monitor failed authentication attempts in Supabase logs

---

## 12. Rate Limiting

### What Slowapi Does

Slowapi is a rate limiting middleware for FastAPI that:
- Tracks requests per IP address
- Enforces rate limits using token bucket algorithm
- Returns 429 status when limit exceeded
- Integrates seamlessly with FastAPI dependencies

### Current Limit

**Limit:** 200 requests per minute per IP address

**Configuration:**
```python
# app/core/limiter.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

```python
# app/api/routes.py
@router.post("/send/event", status_code=202)
@limiter.limit("200/minute")
async def send_event(...):
    ...
```

### Where It's Configured

**File:** `app/core/limiter.py`

**Usage:** Imported in `app/api/routes.py` and applied to `/send/event` endpoint

**Global Registration:** `main.py` registers the limiter and exception handler:
```python
# main.py
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

### Rate Limit Exceeded Response

**Status Code:** 429 Too Many Requests

**Response Body:**
```json
{
  "detail": "Rate limit exceeded: 200 per 1 minute"
}
```

### Customizing Rate Limit

To change the rate limit, update the decorator in `app/api/routes.py`:
```python
@limiter.limit("100/minute")  # Change to 100 per minute
async def send_event(...):
    ...
```

Or update the environment variable:
```env
RATE_LIMIT=100/minute
```

---

## 13. Local Development Setup

### Step 1: Clone Repository
```bash
git clone <repository-url>
cd email-service
```

### Step 2: Install Dependencies
```bash
# Using uv (recommended)
pip install uv
uv sync

# Or using pip
pip install -r requirements.txt
```

### Step 3: Set Up Environment Variables
Create `.env` file in the root directory:
```env
# Mail Credentials
MAIL_USERNAME=your-email@jmv.co.in
MAIL_PASSWORD=your-gmail-app-password
MAIL_FROM=your-email@jmv.co.in
MAIL_FROM_NAME=Asset Manager
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_STARTTLS=True
MAIL_SSL_TLS=False

# Supabase
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_KEY=your-supabase-service-role-key

# Security
EMAIL_SERVICE_API_KEY_HASH=a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890

# Rate Limiting
RATE_LIMIT=200/minute
```

### Step 4: Set Up Supabase Database
Run the SQL script in Supabase SQL Editor:
```bash
# Copy contents of supabase_init.sql
# Paste into Supabase SQL Editor
# Execute
```

### Step 5: Generate API Key Hash
```bash
# Generate SHA-256 hash for your API key
python -c "import hashlib; print(hashlib.sha256('your-secure-api-key'.encode()).hexdigest())"
# Add output to EMAIL_SERVICE_API_KEY_HASH in .env
```

### Step 6: Run the Server
```bash
# Using uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8020

# Or using uv
uv run uvicorn main:app --reload
```

### Step 7: Test the Service
```bash
# Test health check
curl http://localhost:8020/

# Test email sending (see Testing section for full payloads)
curl -X POST http://localhost:8020/send/event \
  -H "X-API-Key: your-secure-api-key" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Step 8: Verify in Supabase
Check Supabase dashboard:
- Open Supabase project
- Navigate to Table Editor
- Check `email_logs` table for queued/success/failed entries

---

## 14. Testing

### Testing via Postman

#### Test 1: Asset Assigned Event

**Request:**
```http
POST http://localhost:8020/send/event
X-API-Key: your-secure-api-key
Content-Type: application/json

{
  "event_name": "asset.assigned",
  "primary_recipient": {
    "email": "employee@example.com",
    "name": "John Doe",
    "role": "employee"
  },
  "admin_email": "admin@example.com",
  "admin_name": "Admin Smith",
  "all_admin_emails": [
    "admin@example.com",
    "it@example.com"
  ],
  "asset_data": {
    "category": "Laptop",
    "model_no": "MacBook Pro M3",
    "asset_id": "AST-001"
  }
}
```

**Expected Response (202):**
```json
{
  "status": "success",
  "status_code": 202,
  "message": "Event queued for processing",
  "timestamp": "2026-04-11T12:34:56.123456+00:00",
  "data": {
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

---

#### Test 2: Asset Returned Event

**Request:**
```http
POST http://localhost:8020/send/event
X-API-Key: your-secure-api-key
Content-Type: application/json

{
  "event_name": "asset.returned",
  "primary_recipient": {
    "email": "employee@example.com",
    "name": "John Doe",
    "role": "employee"
  },
  "admin_email": "admin@example.com",
  "admin_name": "Admin Smith",
  "all_admin_emails": [
    "admin@example.com",
    "it@example.com"
  ],
  "asset_data": {
    "category": "Laptop",
    "model_no": "MacBook Pro M3",
    "asset_id": "AST-001"
  }
}
```

**Expected Response (202):**
```json
{
  "status": "success",
  "status_code": 202,
  "message": "Event queued for processing",
  "timestamp": "2026-04-11T12:34:56.123456+00:00",
  "data": {
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

---

#### Test 3: Force Recall Old Event

**Request:**
```http
POST http://localhost:8020/send/event
X-API-Key: your-secure-api-key
Content-Type: application/json

{
  "event_name": "force.recall.old",
  "primary_recipient": {
    "email": "employee@example.com",
    "name": "John Doe",
    "role": "employee"
  },
  "admin_email": "admin@example.com",
  "admin_name": "Admin Smith",
  "all_admin_emails": [
    "admin@example.com",
    "it@example.com"
  ],
  "asset_data": {
    "category": "Laptop",
    "model_no": "MacBook Pro M3",
    "asset_id": "AST-001"
  },
  "previous_employee_email": "employee@example.com"
}
```

**Expected Response (202):**
```json
{
  "status": "success",
  "status_code": 202,
  "message": "Event queued for processing",
  "timestamp": "2026-04-11T12:34:56.123456+00:00",
  "data": {
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

---

#### Test 4: Force Recall New Event

**Request:**
```http
POST http://localhost:8020/send/event
X-API-Key: your-secure-api-key
Content-Type: application/json

{
  "event_name": "force.recall.new",
  "primary_recipient": {
    "email": "new-employee@example.com",
    "name": "Jane Smith",
    "role": "employee"
  },
  "admin_email": "admin@example.com",
  "admin_name": "Admin Smith",
  "all_admin_emails": [
    "admin@example.com",
    "it@example.com"
  ],
  "asset_data": {
    "category": "Laptop",
    "model_no": "MacBook Pro M3",
    "asset_id": "AST-001"
  },
  "new_employee_email": "new-employee@example.com"
}
```

**Expected Response (202):**
```json
{
  "status": "success",
  "status_code": 202,
  "message": "Event queued for processing",
  "timestamp": "2026-04-11T12:34:56.123456+00:00",
  "data": {
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

---

## 15. Deployment (Vercel)

### Vercel.json Configuration

**File:** `vercel.json`

```json
{
  "version": 2,
  "builds": [
    {
      "src": "main.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "main.py"
    }
  ]
}
```

**Explanation:**
- `version`: Vercel platform version (2)
- `builds`: Specifies Python runtime for `main.py`
- `routes`: Routes all requests to `main.py` (FastAPI entry point)

### Environment Variables on Vercel

Add the following environment variables in Vercel dashboard:

1. Go to Vercel project settings
2. Navigate to Environment Variables
3. Add each variable:

| Variable | Value | Environment |
|----------|-------|-------------|
| `MAIL_USERNAME` | `your-email@jmv.co.in` | Production |
| `MAIL_PASSWORD` | `your-gmail-app-password` | Production |
| `MAIL_FROM` | `your-email@jmv.co.in` | Production |
| `MAIL_FROM_NAME` | `Asset Manager` | Production |
| `MAIL_SERVER` | `smtp.gmail.com` | Production |
| `MAIL_PORT` | `587` | Production |
| `MAIL_STARTTLS` | `True` | Production |
| `MAIL_SSL_TLS` | `False` | Production |
| `SUPABASE_URL` | `https://xyz.supabase.co` | Production |
| `SUPABASE_KEY` | `your-supabase-service-role-key` | Production |
| `EMAIL_SERVICE_API_KEY_HASH` | `a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890` | Production |
| `RATE_LIMIT` | `200/minute` | Production |

### Deploy Command

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

### Deployment Flow

1. Vercel clones repository
2. Installs dependencies from `pyproject.toml`
3. Runs `main.py` as entry point
4. Applies environment variables
5. Deploys to Vercel's edge network

### Post-Deployment Steps

1. **Verify Deployment:**
   ```bash
   curl https://your-app.vercel.app/
   ```

2. **Test Email Sending:**
   ```bash
   curl -X POST https://your-app.vercel.app/send/event \
     -H "X-API-Key: your-secure-api-key" \
     -H "Content-Type: application/json" \
     -d '{...}'
   ```

3. **Check Supabase Logs:**
   - Verify `email_logs` table receives entries
   - Check `status` field: should be `queued`, then `success` or `failed`

---

## 16. Plugging Into Another Project

### What Another Project Needs to Do

#### 1. Set Up Environment Variables

Add to the client application's `.env`:
```env
EMAIL_SERVICE_URL=https://your-email-service.vercel.app
EMAIL_SERVICE_API_KEY=your-secure-api-key-plain-text
ALL_ADMIN_EMAILS=admin@example.com,it@example.com,manager@example.com
```

#### 2. Create Email Service Adapter

Create an adapter module in the client application:

```python
# client_app/services/email_adapter.py
import httpx
from typing import List, Dict, Any
import os

class EmailServiceAdapter:
    """Adapter for integrating with Email Microservice"""
    
    def __init__(self):
        self.base_url = os.getenv("EMAIL_SERVICE_URL")
        self.api_key = os.getenv("EMAIL_SERVICE_API_KEY")
        self.all_admin_emails = os.getenv("ALL_ADMIN_EMAILS", "").split(",")
    
    async def send_asset_assigned(
        self,
        employee_email: str,
        employee_name: str,
        admin_email: str,
        admin_name: str,
        asset_category: str,
        asset_model: str,
        asset_id: str
    ) -> Dict[str, Any]:
        """Send asset assigned email"""
        payload = {
            "event_name": "asset.assigned",
            "primary_recipient": {
                "email": employee_email,
                "name": employee_name,
                "role": "employee"
            },
            "admin_email": admin_email,
            "admin_name": admin_name,
            "all_admin_emails": self.all_admin_emails,
            "asset_data": {
                "category": asset_category,
                "model_no": asset_model,
                "asset_id": asset_id
            }
        }
        return await self._send_request(payload)
    
    async def send_asset_returned(
        self,
        employee_email: str,
        employee_name: str,
        admin_email: str,
        admin_name: str,
        asset_category: str,
        asset_model: str,
        asset_id: str
    ) -> Dict[str, Any]:
        """Send asset returned email"""
        payload = {
            "event_name": "asset.returned",
            "primary_recipient": {
                "email": employee_email,
                "name": employee_name,
                "role": "employee"
            },
            "admin_email": admin_email,
            "admin_name": admin_name,
            "all_admin_emails": self.all_admin_emails,
            "asset_data": {
                "category": asset_category,
                "model_no": asset_model,
                "asset_id": asset_id
            }
        }
        return await self._send_request(payload)
    
    async def send_force_recall_old(
        self,
        employee_email: str,
        employee_name: str,
        admin_email: str,
        admin_name: str,
        asset_category: str,
        asset_model: str,
        asset_id: str
    ) -> Dict[str, Any]:
        """Send force recall old email"""
        payload = {
            "event_name": "force.recall.old",
            "primary_recipient": {
                "email": employee_email,
                "name": employee_name,
                "role": "employee"
            },
            "admin_email": admin_email,
            "admin_name": admin_name,
            "all_admin_emails": self.all_admin_emails,
            "asset_data": {
                "category": asset_category,
                "model_no": asset_model,
                "asset_id": asset_id
            },
            "previous_employee_email": employee_email
        }
        return await self._send_request(payload)
    
    async def send_force_recall_new(
        self,
        new_employee_email: str,
        new_employee_name: str,
        admin_email: str,
        admin_name: str,
        asset_category: str,
        asset_model: str,
        asset_id: str
    ) -> Dict[str, Any]:
        """Send force recall new email"""
        payload = {
            "event_name": "force.recall.new",
            "primary_recipient": {
                "email": new_employee_email,
                "name": new_employee_name,
                "role": "employee"
            },
            "admin_email": admin_email,
            "admin_name": admin_name,
            "all_admin_emails": self.all_admin_emails,
            "asset_data": {
                "category": asset_category,
                "model_no": asset_model,
                "asset_id": asset_id
            },
            "new_employee_email": new_employee_email
        }
        return await self._send_request(payload)
    
    async def _send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Send request to email microservice"""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{self.base_url}/send/event",
                headers={
                    "X-API-Key": self.api_key,
                    "Content-Type": "application/json"
                },
                json=payload
            )
            response.raise_for_status()
            return response.json()
```

#### 3. Use the Adapter in Client Application

```python
# client_app/services/asset_service.py
from .email_adapter import EmailServiceAdapter

class AssetService:
    def __init__(self):
        self.email_adapter = EmailServiceAdapter()
    
    async def assign_asset(self, asset_id: str, employee_id: str, admin_id: str):
        """Assign asset to employee and send email"""
        # ... asset assignment logic ...
        
        # Send email notification
        await self.email_adapter.send_asset_assigned(
            employee_email=employee.email,
            employee_name=employee.name,
            admin_email=admin.email,
            admin_name=admin.name,
            asset_category=asset.category,
            asset_model=asset.model,
            asset_id=asset.id
        )
```

### What the Client Never Needs to Touch

- **Email Templates:** All templates are managed in the email microservice
- **SMTP Configuration:** Gmail credentials are in the email microservice
- **Retry Logic:** Built-in exponential backoff, no client-side retry needed
- **Date Calculation:** IST date is calculated automatically
- **Supabase Logging:** Audit logging is handled by the microservice
- **Rate Limiting:** Managed by the microservice
- **Authentication:** Only need to provide plain text API key

### Payload Structure Reference

**Required Fields for All Events:**
- `event_name`: Event type (enum)
- `primary_recipient`: Object with `email`, `name`, `role`
- `admin_email`: Admin's email
- `admin_name`: Admin's name
- `all_admin_emails`: Array of all admin emails
- `asset_data`: Object with `category`, `model_no`, `asset_id`

**Optional Fields:**
- `previous_employee_email`: For `force.recall.old` event
- `new_employee_email`: For `force.recall.new` event

---

## 17. Monitoring

### How to Check Supabase Logs

#### 1. Access Supabase Dashboard
- Go to https://supabase.com/dashboard
- Select your project
- Navigate to Table Editor

#### 2. View Email Logs
- Open `email_logs` table
- View all entries with columns: `id`, `request_id`, `created_at`, `event_name`, `recipient_email`, `status`, `retry_count`, etc.

#### 3. Filter by Status
```sql
-- View only failed emails
SELECT * FROM email_logs WHERE status = 'failed';

-- View only successful emails
SELECT * FROM email_logs WHERE status = 'success';

-- View emails with retries
SELECT * FROM email_logs WHERE retry_count > 0;
```

#### 4. Filter by Request ID
```sql
-- View all logs for a specific request
SELECT * FROM email_logs WHERE request_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
```

#### 5. Filter by Event Type
```sql
-- View all asset.assigned events
SELECT * FROM email_logs WHERE event_name = 'asset.assigned';
```

### What Each Status Means

| Status | Meaning | Occurs When |
|--------|---------|-------------|
| `queued` | Email queued for processing | Immediately after API request received |
| `success` | Email sent successfully | After email dispatched via SMTP |
| `failed` | Email failed after all retries | After 3 retry attempts exhausted |

### How to Identify Failed Emails

**Method 1: Supabase Dashboard**
```sql
-- View all failed emails with error details
SELECT 
    request_id,
    event_name,
    recipient_email,
    cc_emails,
    error_details,
    retry_count,
    created_at
FROM email_logs 
WHERE status = 'failed'
ORDER BY created_at DESC;
```

**Method 2: API Query**
```python
from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Fetch failed emails
response = supabase.table("email_logs").select("*").eq("status", "failed").execute()
failed_emails = response.data

for email in failed_emails:
    print(f"Request ID: {email['request_id']}")
    print(f"Event: {email['event_name']}")
    print(f"Error: {email['error_details']}")
    print(f"Retries: {email['retry_count']}")
    print("---")
```

### Monitoring Best Practices

**1. Set Up Alerts:**
- Configure Supabase to send alerts on `status = 'failed'`
- Monitor retry_count threshold (e.g., alert if > 2)

**2. Regular Audits:**
- Review failed emails weekly
- Identify common error patterns (SMTP timeout, invalid email, etc.)

**3. Performance Metrics:**
```sql
-- Average retry count
SELECT AVG(retry_count) FROM email_logs WHERE status = 'success';

-- Success rate
SELECT 
    status,
    COUNT(*) as count,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM email_logs
GROUP BY status;
```

**4. Event Distribution:**
```sql
-- Email volume by event type
SELECT 
    event_name,
    COUNT(*) as count
FROM email_logs
GROUP BY event_name
ORDER BY count DESC;
```

---

## 18. Future Scope

### Intentionally Not Built Yet

**1. Webhook Notifications**
- **Why:** Not required for current use case
- **When to Add:** If client applications need real-time status updates
- **How:** Add webhook URL to payload, send HTTP POST on success/failure

**2. Email Queue with Redis/Arq**
- **Why:** Current BackgroundTasks sufficient for current load
- **When to Add:** If email volume increases significantly (>1000/minute)
- **How:** Replace BackgroundTasks with arq worker, Redis queue

**3. Multi-SMTP Support**
- **Why:** Single Gmail account sufficient for current needs
- **When to Add:** If need to send from different domains or providers
- **How:** Add SMTP provider selection to payload, multiple mail_config instances

**4. Email Template Editor UI**
- **Why:** Templates are static and managed via code
- **When to Add:** If non-technical users need to edit templates
- **How:** Build admin UI with Jinja2 editor, preview, version control

**5. Attachment Support**
- **Why:** Asset Manager emails don't require attachments
- **When to Add:** If need to attach PDFs, images, or documents
- **How:** Add `attachments` field to payload, use fastapi-mail attachment support

**6. Scheduled/Delayed Emails**
- **Why:** All emails are immediate in current workflow
- **When to Add:** If need to send reminders or delayed notifications
- **How:** Add `scheduled_at` field to payload, use arq scheduled jobs

**7. Multi-Language Support**
- **Why:** All emails are in English currently
- **When to Add:** If need to support multiple languages
- **How:** Add `language` field to payload, create language-specific templates

**8. Email Analytics Dashboard**
- **Why:** Supabase logs provide sufficient audit trail
- **When to Add:** If need advanced analytics, charts, reports
- **How:** Build dashboard with Grafana, Metabase, or custom UI

**9. Bounce and Complaint Handling**
- **Why:** Not monitoring bounces currently
- **When to Add:** If need to handle bounced emails, invalid addresses
- **How:** Use SendGrid/Mailgun webhooks, update Supabase with bounce status

**10. A/B Testing for Templates**
- **Why:** Single template per event is sufficient
- **When to Add:** If need to test different email designs
- **How:** Add template variants, random selection, track open/click rates

### Planned Enhancements

**Priority 1 (Near Term):**
- Add webhook support for real-time status updates
- Implement email queue with arq for higher volume
- Add attachment support for asset documents

**Priority 2 (Medium Term):**
- Multi-SMTP support for different domains
- Email template editor UI
- Multi-language support

**Priority 3 (Long Term):**
- Email analytics dashboard
- Bounce and complaint handling
- A/B testing framework

---

## Appendix: Quick Reference

### Common Commands

```bash
# Start server
uvicorn main:app --reload

# Start server on custom port
uvicorn main:app --reload --port 8020

# Run tests
python test_assigned.py
python test_returned.py

# Generate API key hash
python -c "import hashlib; print(hashlib.sha256('your-key'.encode()).hexdigest())"

# Check health
curl http://localhost:8020/

# Send test email
curl -X POST http://localhost:8020/send/event \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"event_name": "asset.assigned", ...}'
```

### Troubleshooting

**Issue:** Server won't start
- **Check:** `.env` file exists and has all required variables
- **Check:** Python version >= 3.10
- **Check:** Dependencies installed (`uv sync`)

**Issue:** Email not sending
- **Check:** Gmail app password (NOT account password)
- **Check:** SMTP settings (port 587, STARTTLS enabled)
- **Check:** Supabase logs for error details

**Issue:** API key verification fails
- **Check:** `EMAIL_SERVICE_API_KEY_HASH` is SHA-256 hex digest (not plain text)
- **Check:** Client sending plain text key in `X-API-Key` header
- **Check:** Hash was generated with correct command

**Issue:** Rate limit exceeded
- **Check:** `RATE_LIMIT` in `.env` (default 200/minute)
- **Check:** Client making too many requests from same IP
- **Check:** Slowapi exception handler registered in `main.py`

### Support

For issues or questions:
1. Check Supabase logs for error details
2. Review this README for configuration details
3. Check FastAPI docs: base_url/docs
4. Contact IT Ops team

---

**Version:** 1.0.0  
**Last Updated:** 2026-04-12 
**License:** Internal Use Only
