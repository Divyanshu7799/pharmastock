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

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server will start at [http://localhost:5173](http://localhost:5173).