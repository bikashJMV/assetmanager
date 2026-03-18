# AMS Server — API Reference

FastAPI backend for the Asset Management System demo. No auth, flat structure, Supabase (PostgreSQL) as the database.

**Base URL:** `http://127.0.0.1:8000`  
**Interactive Docs:** `http://127.0.0.1:8000/docs`

---

## Endpoints

### GET `/`
Health check. Confirms the server is running.

**Example Response:**
```json
{ "message": "AMS API is running" }
```

---

### GET `/assets`
Fetch all assets. Optionally search by `asset_id`, `brand`, `model`, or `assigned_to`.

**Why:** Main data source for the admin dashboard.

**Example Request:**
```
GET /assets?search=Dell
```
**Example Response:**
```json
[
  {
    "asset_id": "JMV-A001",
    "brand": "Dell",
    "model": "Latitude 5420",
    "assigned_to": "Rahul Sharma",
    "status": "Active"
  }
]
```

---

### POST `/assets`
Create a new asset in the database.

**Why:** Allows adding assets beyond the initial CSV seed — e.g. new purchases.

**Example Request Body:**
```json
{
  "asset_id": "JMV-A032",
  "asset_type": "Laptop",
  "brand": "HP",
  "model": "EliteBook 840 G9",
  "processor": "Intel i7-1260P",
  "ram": "16GB",
  "storage": "1TB SSD",
  "serial_number": "SN-HP-EB84-032",
  "purchase_date": "2024-05-12",
  "warranty_expiry": "2027-05-12",
  "assigned_to": "Arjun Verma",
  "employee_email": "arjun.verma@jmv.com",
  "department": "Finance",
  "location": "Gurugram Cyber Hub",
  "status": "Active",
  "condition": "Excellent",
  "last_updated": "2026-03-17",
  "notes": "Finance core team"
}
```

---

### GET `/assets/{asset_id}`
Fetch a single asset by its `asset_id`.

**Why:** Used when the admin clicks on a specific asset row to view full details.

**Example Request:**
```
GET /assets/JMV-A001
```
**Example Response:**
```json
{
  "asset_id": "JMV-A001",
  "brand": "Dell",
  "model": "Latitude 5420",
  "assigned_to": "Rahul Sharma",
  "department": "Engineering",
  "status": "Active"
}
```

---

### POST `/logs`
Create a log entry for an existing asset and generate a unique QR code pointing to the asset's scan page.

**Why:** Core demo feature — admin logs an asset check-in/check-out and gets a printable/displayable QR.

> ⚠️ The asset must already exist in the database. Use `POST /assets` first if needed.

**Example Request Body:**
```json
{
  "asset_id": "JMV-A001",
  "note": "Issued to Rahul for Q2 project"
}
```
**Example Response:**
```json
{
  "id": "abc123...",
  "asset_id": "JMV-A001",
  "note": "Issued to Rahul for Q2 project",
  "qr_code": "data:image/png;base64,iVBORw0KGgo...",
  "created_at": "2026-03-17T18:00:00Z"
}
```

---

### GET `/logs`
Fetch the 50 most recent asset log entries, ordered by newest first.

**Why:** Admin can see a history of all logged asset events.

**Example Request:**
```
GET /logs
```

---

### GET `/scan/{asset_id}`
Returns full asset details for a given `asset_id`. This is the page a mobile device lands on after scanning a QR code.

**Why:** QR codes encode a URL like `/scan/JMV-A001`. When an employee scans the QR, this endpoint returns the asset info to display.

**Example Request:**
```
GET /scan/JMV-A001
```
**Example Response:**
```json
{
  "asset_id": "JMV-A001",
  "brand": "Dell",
  "model": "Latitude 5420",
  "assigned_to": "Rahul Sharma",
  "status": "Active",
  "condition": "Good"
}
```

---

## Running the Server

```bash
# Install dependencies
pip install -r requirements.txt

# Seed the database (run once)
python seed.py

# Start the dev server
fastapi dev app.py
```
