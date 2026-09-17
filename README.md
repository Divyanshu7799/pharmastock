# PharmaStock

PharmaStock is a pharmacy inventory management system built with React, Node.js/Express, and MySQL.

> **Status:** Step 1 - Project Structure and Development Setup

---

## Project Structure

```text
pharmastock/
├── backend/
│   ├── src/
│   │   ├── app.js         # Express app, middleware, routes, error handling
│   │   └── server.js      # Server entry point and port listener
│   ├── .env               # Environment configuration (ignored in git)
│   ├── .env.example       # Example environment variables
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Root status verification component
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js (v18 or newer, recommended v20+)
- npm (v9 or newer)

---

### 1. Backend Setup

```bash
cd backend
npm install
npm run dev
```

The backend server starts on [http://localhost:5000](http://localhost:5000).

Health Check endpoint:
```bash
curl http://localhost:5000/api/health
```
Response:
```json
{
  "status": "ok"
}
```

---

### Database Setup & Verification

1. Configure `backend/.env` with your MySQL connection credentials:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pharmastock
```

2. Initialize the schema and populate test seed data:
```bash
cd backend
npm run db:init
```

3. Run the automated data model and FEFO verification suite:
```bash
cd backend
npm run db:test
```

---

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server will start at [http://localhost:5173](http://localhost:5173).

---

## Test Automation Suites

Run the full automated verification suite covering all steps and assessment twists:

```bash
cd backend
npm run test:all
```

Individual test suites:
- `npm run db:test` — Step 2: Database connectivity, batch models, FEFO ordering (14 tests)
- `npm run test:api` — Step 3: Authentication, medicines CRUD, search, pagination, alerts (24 tests)
- `npm run test:dispense` — Step 4: Atomic FEFO dispensing transactions and history (16 tests)
- `npm run test:clock` — Twist 1 (T2): Clock automation, expired batch quarantine, 7-day alerts (12 tests)
- `npm run test:import` — Twist 2 (T4): Messy batch data normalization, deduplication, atomic import (18 tests)

**Total automated tests:** **84 / 84 passing (100% success)**

---

## Assessment API Endpoints

### 1. Clock Automation & Batch Quarantine (`POST /clock`)

Simulates the daily inventory maintenance job without requiring an external OS cron job.

- **URL:** `POST /clock` (also aliased at `POST /api/clock`)
- **Authentication:** Public (simulated automation trigger)
- **Headers:** `Content-Type: application/json`

#### Behavior:
1. **Expired Batch Quarantine:** Finds all `ACTIVE` batches where `expiry_date < CURRENT_DATE` and updates their status to `QUARANTINED`.
2. **Actionable Expiring-Soon Count:** Counts all `ACTIVE` batches with `quantity > 0` expiring within 7 days:
   $$\text{CURRENT\_DATE} \le \text{expiry\_date} \le \text{CURRENT\_DATE} + 7\text{ days}$$
   - Expired batches (`< CURRENT_DATE`) are excluded.
   - Zero-quantity batches (`quantity <= 0`) are excluded.
3. **Idempotency:** Calling `POST /clock` multiple times in succession returns `quarantinedCount = 0` on subsequent runs while maintaining the current `expiringSoonCount`. Already quarantined batches remain quarantined.
4. **Dispensing Integration:** Batches marked as `QUARANTINED` are strictly ineligible for FEFO dispensing and excluded from sellable stock.

#### Response:
```json
{
  "message": "Clock processed successfully",
  "data": {
    "quarantinedCount": 3,
    "expiringSoonCount": 2,
    "processedAt": "2026-09-17T11:20:00.000Z"
  }
}
```

---

### 2. Messy Data Batch Import (`POST /api/batches/import`)

Normalizes and imports messy batch records with calendar-accurate validation and deduplication.

- **URL:** `POST /api/batches/import`
- **Authentication:** Required (Bearer JWT token in `Authorization` header)
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`

#### Request Payload:
```json
{
  "rows": [
    {
      "medicine": "Paracetamol 500mg",
      "batchNumber": "P-101",
      "quantity": "10 units",
      "expiryDate": "25/09/2026"
    },
    {
      "medicine": "Paracetamol 500mg",
      "batchNumber": "P-102",
      "quantity": 20,
      "expiryDate": "2027-01-10"
    }
  ]
}
```

#### Normalization Rules:
- **Quantity:**
  - Accepted: Whole integers (`20`) or numeric strings with optional unit labels (`"10 units"`, `" 10 unit "`, `"  45 pcs  "`).
  - Rejected: `null`, empty string, negative values (`"-10"`, `-5`), decimal values (`"10.5"`, `10.5`), non-numeric strings (`"abc"`).
  - Converted to integer without silent zero-defaults.
- **Expiry Date:**
  - Accepted: ISO format `YYYY-MM-DD` (`2026-09-25`) and UK format `DD/MM/YYYY` (`25/09/2026`).
  - Calendar validation: Verifies valid month (1-12) and valid days per month, including Gregorian leap-year validation.
  - Rejected: `null`, empty, impossible calendar dates (`31/02/2026`, `29/02/2025`), ambiguous/malformed dates.
  - Stored in MySQL `DATE` format (`YYYY-MM-DD`).
- **Medicine Resolution:**
  - Case-insensitive lookup by name against catalog.
  - If medicine does not exist: the row is **rejected** (never silently creates a new medicine).
- **Batch Number:**
  - Must be a non-empty string.

#### Duplicate Handling Policy:
1. **Duplicates within the Same Import Payload:**
   - If multiple rows share the same `(medicine, batchNumber)`, only the first valid row is imported.
   - Subsequent identical rows are counted as `deduped` without double-adding quantity.
2. **Duplicates against Existing Database Inventory:**
   - If the `(medicine, batchNumber)` already exists in the database, the row is counted as `deduped` without inventory inflation or modification.

#### Response:
```json
{
  "message": "Batch import completed",
  "imported": 6,
  "deduped": 2,
  "rejected": 2,
  "details": [
    { "row": 1, "status": "imported", "medicine": "Paracetamol 500mg", "batchNumber": "P-101", "quantity": 10, "expiryDate": "2026-09-25" },
    { "row": 7, "status": "deduped", "batchNumber": "P-101", "reason": "Duplicate batch number for this medicine in same import payload" },
    { "row": 9, "status": "rejected", "reason": "Quantity cannot be negative" }
  ]
}
```