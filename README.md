# Hotel Offer Orchestrator

A distributed system built with **Node.js (TypeScript)**, **Express**, **Temporal.io**, **Redis**, and **Docker Compose** to aggregate overlapping hotel offers from multiple suppliers, deduplicate listings, select the best-priced offer per hotel, and enable high-performance price filtering.

---

## 🌟 Key Features

1. **Parallel Supplier Offer Aggregation**: Calls Supplier A and Supplier B concurrently via Temporal Activities.
2. **Intelligent Deduplication & Best Price Selection**:
   - Compares overlapping hotel listings by hotel name.
   - Selects the cheapest offer with supplier attribution and commission percentage.
   - Retains uniquely offered hotels from either supplier.
3. **Temporal.io Orchestration**:
   - End-to-end workflow execution (`hotelOfferWorkflow`).
   - Resilient retries, timeouts, and state tracking.
4. **Redis In-Memory Caching & Native Price Filtering**:
   - Stores deduplicated records in Redis hash maps (`hotels:data:<city>`).
   - Indexes hotel prices using Redis Sorted Sets (`hotels:zset:<city>`).
   - Implements native price filtering via `ZRANGEBYSCORE` directly inside Redis for sub-millisecond retrieval.
5. **Mock Supplier APIs & Health Check**:
   - Internal `/supplierA/hotels` and `/supplierB/hotels` endpoints with overlapping mock data.
   - Optional health check endpoint (`/health`) reporting the availability of suppliers.
   - Simulation endpoint (`/admin/simulate-failure`) for chaos testing.
6. **Containerization**:
   - Multi-stage Dockerfile.
   - Single-command orchestration via `docker-compose.yml` (API, Temporal Worker, Redis, and Temporal Dev Server).
7. **Postman Collection**:
   - Complete Postman JSON test suite included (`hotel-offer-orchestrator.postman_collection.json`).

---

## 🏗 Architecture & Workflow

```
                          ┌─────────────────────────────┐
                          │         Client / HTTP       │
                          └──────────────┬──────────────┘
                                         │ GET /api/hotels?city=delhi&minPrice=5000&maxPrice=6000
                                         ▼
                          ┌─────────────────────────────┐
                          │       Express REST API      │
                          └──────────────┬──────────────┘
                     (If filtered cached)│ (If cache miss / new search)
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
      ┌─────────────────────────┐                 ┌─────────────────────────┐
      │          Redis          │                 │    Temporal Workflow    │
      │   (ZSET & Hash Map)     │                 │   (hotelOfferWorkflow)  │
      └─────────────────────────┘                 └────────────┬────────────┘
                                                               │ Parallel Activities
                                                 ┌─────────────┴─────────────┐
                                                 ▼                           ▼
                                    ┌────────────────────────┐  ┌────────────────────────┐
                                    │  Activity: Supplier A  │  │  Activity: Supplier B  │
                                    │  (/supplierA/hotels)   │  │  (/supplierB/hotels)   │
                                    └────────────┬───────────┘  └────────────┬───────────┘
                                                 └─────────────┬─────────────┘
                                                               ▼
                                                ┌─────────────────────────────┐
                                                │ Activity: Deduplicate & Pick│
                                                │   Lowest Price per Hotel    │
                                                └──────────────┬──────────────┘
                                                               ▼
                                                ┌─────────────────────────────┐
                                                │ Activity: Cache to Redis    │
                                                │ (ZADD price + HSET details) │
                                                └─────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Docker** and **Docker Compose** installed.
- (Optional for local development without Docker) Node.js v18+, Redis, and Temporal CLI.

---

### Run with Docker Compose (Recommended)

1. Clone or navigate to the repository directory:
   ```bash
   cd "Hotel Offer Orchestrator"
   ```

2. Start the entire stack:
   ```bash
   docker-compose up --build
   ```

   This launches:
   - **`api`**: Express server on port `3000`
   - **`worker`**: Temporal worker listening on `hotel-offers-task-queue`
   - **`redis`**: Redis server on port `6379`
   - **`temporal`**: Temporal server on port `7233` with Web UI on port `8233`

3. Open the Temporal Web UI in your browser:
   [http://localhost:8233](http://localhost:8233)

---

### Local Development (Without Docker)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

3. **Start Redis**:
   ```bash
   redis-server
   ```

4. **Start Temporal Dev Server**:
   ```bash
   temporal server start-dev
   ```

5. **Start Temporal Worker**:
   ```bash
   npm run dev:worker
   ```

6. **Start Express Server**:
   ```bash
   npm run dev
   ```

---

## 📡 API Specification

### 1. Get Deduplicated Hotel Offers
- **Endpoint**: `GET /api/hotels?city=delhi`
- **Description**: Triggers Temporal workflow to query Supplier A and B in parallel, deduplicate by hotel name, select lowest price, store to Redis, and return best offers.
- **Sample Response**:
  ```json
  [
    {
      "name": "Holtin",
      "price": 5340,
      "supplier": "Supplier B",
      "commissionPct": 20
    },
    {
      "name": "Radison",
      "price": 5900,
      "supplier": "Supplier A",
      "commissionPct": 13
    },
    {
      "name": "Grand Hyatt",
      "price": 8200,
      "supplier": "Supplier B",
      "commissionPct": 18
    },
    {
      "name": "Taj Palace",
      "price": 11000,
      "supplier": "Supplier A",
      "commissionPct": 12
    },
    {
      "name": "Oberoi",
      "price": 9500,
      "supplier": "Supplier B",
      "commissionPct": 14
    }
  ]
  ```

---

### 2. Filter Hotels by Price Range
- **Endpoint**: `GET /api/hotels?city=delhi&minPrice=5000&maxPrice=6000`
- **Description**: Queries Redis directly using `ZRANGEBYSCORE hotels:zset:delhi 5000 6000` and fetches hotel records from the hash map.
- **Sample Response**:
  ```json
  [
    {
      "name": "Holtin",
      "price": 5340,
      "supplier": "Supplier B",
      "commissionPct": 20
    },
    {
      "name": "Radison",
      "price": 5900,
      "supplier": "Supplier A",
      "commissionPct": 13
    }
  ]
  ```

---

### 3. Health Check (Bonus Point)
- **Endpoint**: `GET /health`
- **Response**:
  ```json
  {
    "status": "UP",
    "timestamp": "2026-11-19T11:15:00.000Z",
    "suppliers": {
      "supplierA": "UP",
      "supplierB": "UP"
    }
  }
  ```

---

### 4. Mock Supplier Endpoints
- `GET /supplierA/hotels?city=delhi`
- `GET /supplierB/hotels?city=delhi`

---

## 🧪 Testing

Run unit tests covering deduplication and best offer logic:
```bash
npm test
```

Import `hotel-offer-orchestrator.postman_collection.json` into Postman to run automated API tests.

---

## 📋 Checklist Verification

- [x] Node.js + TypeScript + Express setup
- [x] Mock Supplier A and Supplier B APIs
- [x] Parallel supplier calls via Temporal.io
- [x] Hotel deduplication by name & cheapest price selection
- [x] Saving deduplicated records in Redis
- [x] Native price filtering inside Redis (`ZRANGEBYSCORE`)
- [x] Multi-stage Dockerfile and docker-compose.yml
- [x] Postman collection file (`.json`)
- [x] Health check endpoint (`/health`)
- [x] Error handling and retries in activities/workflows
