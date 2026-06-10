# Trading-Benchmarker: Distributed Benchmarking & Hosting Platform for Trading Engines

**Trading-Benchmarker** is a highly concurrent, resource-isolated, and distributed benchmarking and hosting platform designed to securely execute, profile, and stress-test contestant-submitted trading engines under extreme simulated market volatility.

The platform utilizes a decoupled, event-driven agent-controller architecture to run real-time telemetry analysis at microsecond precision while maintaining absolute execution safety on the host infrastructure.

---

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [Component Deep Dive](#2-component-deep-dive)
   - [Frontend SaaS Portal](#frontend-saas-portal)
   - [Backend Express Controller](#backend-express-controller)
   - [Secure Sandbox Containerizer](#secure-sandbox-containerizer)
   - [HFT Mock Engine (C++)](#hft-mock-engine-c)
   - [Load Generator (Go Bot Core)](#load-generator-go-bot-core)
3. [Database Schemas & Analytical Scoring](#3-database-schemas--analytical-scoring)
4. [gRPC Service Contract](#4-grpc-service-contract)
5. [Local Development & Mock Testing](#5-local-development--mock-testing)
6. [Production Deployment (IaC)](#6-production-deployment-iac)
7. [Directory Structure](#7-directory-structure)

---

## 1. System Architecture

The platform isolates untrusted user binaries using a strictly decoupled execution pipeline. Core components communicate asynchronously via gRPC, WebSockets, and Server-Sent Events (SSE) to prevent blocking operations and eliminate noisy neighbor interference.

```text
+-----------------------+              (gRPC / HTTP API)              +-------------------------------+
|                       |                                             |                               |
|   Node.js Backend     +-------------------------------------------->|   Remote Load Gen Agent       |
|  (Controller Node)    |                                             |   (Dedicated Server VM)       |
|                       |                                             |                               |
+-----------+-----------+                                             +---------------+---------------+
            |                                                                         |
            | (Deploys via Socket)                                                    | (Bombards via WS)
            v                                                                         v
+-----------+-----------+                                             +---------------+---------------+
|                       |                                             |                               |
|   Contestant Sandbox  | <========================================== |      Go Bot Fleet Engine      |
|  (Isolated Container) |             (Extreme Volatility)            |                               |
|                       |                                             |                               |
+-----------------------+                                             +-------------------------------+

```

---

## 2. Component Deep Dive

### Frontend SaaS Portal

* **Engine & Routing:** Built using React, Vite, and Tailwind CSS. It implements standard client-side routing via `HashRouter` (`react-router-dom`) to ensure backward/forward history traversal and deep-linking without encountering 404 reload errors on static hosting servers.
* **Zero-Dependency SVG Charting:** Bypasses heavy, compilation-prone third-party visualization libraries by utilizing raw inline SVG math and scaling coordinates. Incoming time-series streams are converted directly into responsive mathematical line graphs on the fly.
* **Native PDF Reports:** Compiles database aggregate metrics and multi-run execution summaries into downloadable, formatted PDF report cards natively using `jspdf` and `jspdf-autotable`.

### Backend Express Controller

* **Core Architecture:** Node.js backend leveraging structural ES Modules (ESM). Protects server runtime using a strict `FileSanitizer` utility that cleans uploaded binary names and strips malicious directory traversal sequences (`../`).
* **FIFO Job Scheduler:** Enqueues incoming compilation and benchmarking tasks onto a centralized Redis List (`LPUSH` and `RPOP`). This guarantees single-tenant evaluation patterns across horizontally scaled instances, preventing overlapping performance distortion.
* **Real-time Streaming:** Opens unidirectional HTTP channels (`text/event-stream`) via Server-Sent Events (SSE) to instantly pipe system logs, compilation output, and real-time execution metrics directly from the backend event bus to the React dashboard.

### Secure Sandbox Containerizer

* **Isolation Layers:** Wraps untrusted user binaries inside a stripped-down `iicpc-sandbox-base` container running as an unprivileged system user `sandbox_user` who has zero administrative rights.
* **Hardware Bounds:** Caps CPU core allocations to exactly 1 CPU and restricts memory usage to a hard roof of 512MB RAM via Docker engine container resource flags.
* **Ephemeral Sockets:** Queries the Linux host network layer dynamically for an unallocated port to hook up the binary wrapper loop on the fly, preventing port-collision crashes on concurrent runs.
* **Garbage Collection:** Automatically invokes filesystem unlinks to delete the uploaded binary from the host's `uploads/` directory 3 seconds after container teardown to protect storage boundaries cleanly.

### HFT Mock Engine (C++)

* **Core Stack:** Native C++ utilizing `Boost.Asio` and `WebSocket++`.
* **Execution Logic:** Processes network packets via a dedicated non-blocking asynchronous event loop (`ws_server.run()`). It accepts high-speed trade packets and matches orders dynamically based on price-time priority inside an in-memory limit order book.

### Load Generator (Go Bot Core)

* **Concurrency Engine:** Written in Go (Golang) to maximize low-level resource efficiency. It can instantiate or destroy over 10,000+ lightweight Goroutines in under a millisecond to generate up to 50,000+ Requests Per Second (TPS).
* **Fan-In WebSocket Multiplexing:** To prevent **Ephemeral Port Exhaustion** (the 65,535 TCP socket limit), it multiplexes thousands of virtual bot entities over a single, persistent WebSocket connection. Virtual actors push JSON payloads into a highly buffered concurrent Go channel (`orderChannel`) where a single writer flushes them into the network pipeline.
* **"Write Coalescing" Telemetry:** Avoids choking the engine on database I/O by utilizing a non-blocking batching strategy. Telemetry records are pushed into a channel where a background worker collects and flushes them to Redis via a single `RPUSH` command every 100ms or 1,000 items, reducing network traffic by 99.9%.
* **O(1) Lock-Free State:** Tracks in-flight orders without CPU lock contention by leveraging Go’s native `sync.Map`, utilizing atomic hardware-level memory operations instead of coarse-grained `RWMutex` locks.

---

## 3. The Dual-Stream Testing Methodology

To eliminate the "Illusion of Time" introduced by TCP network jitter and accurately evaluate contestant business logic, the load generator bifurcates workloads into two distinct operational streams:

### Stream A: Chaotic Bots (Throughput & Negative Fuzzing)

Simulates massive market volatility by scaling workloads exponentially. These bots actively evaluate engine durability via data-corruption injection:

* **Trap Injection:** 5% of all outbound transactions are corrupted on-the-fly (e.g., negative boundaries, zero volumes, or illegal instruction enums). If an engine accepts these malformed packets rather than raising an immediate validation rejection, its core accuracy index is penalized.
* **Maker vs. Taker Isolation:** The platform separates order-book resting time (Maker) from immediate trade execution time (Taker). System latency metrics are computed exclusively from Taker response legs to eliminate artificial latency inflation caused by resting liquidity.

### Stream B: Sniper Bot (Algorithmic Logic Auditing)

Operates sequentially on an isolated asset identifier (`IICPC_PRIO`) to eliminate network jitter and mathematically verify matching logic accuracy:

* **Synchronous Handshakes:** The bot sends an order and waits for an explicit network acknowledgement event before dispatching successive operations, ensuring a traceable execution sequence.
* **The Middleman Sorting Trap:** The bot purposefully structures a three-tiered placement sequence: `Sell @ $105`, `Sell @ $100` (Optimal Price), and `Sell @ $110`. By positioning the optimal clearing price between sub-optimal parameters, the audit engine forces the contestant's system to invoke sorting algorithms, instantly exposing lazy FIFO/LIFO stack shortcuts.

---

## 4. Database Schemas & Analytical Scoring

Historical executions and time-series telemetry metrics are persisted using a relational schema optimized for TimescaleDB / PostgreSQL.

### Schema Definitions

```sql
CREATE TABLE submissions (
    id serial primary key,
    team_id varchar(30),
    submission_id varchar(50)
);

CREATE TABLE metrics_trading_engine (
     id serial,
    submission_id varchar(50) not null,
    recorded_at timestamptz not null,
    time_second int not null,
    tps int,
    p50_lat float,
    p99_lat float,
    accuracy float,
    primary key (id,recorded_at)
);

```

### Composite Scoring Formula

The platform grades trading engines using a multi-variable calculation that rewards throughput and processing precision while aggressively penalizing high tail-latency values:

$$\text{Composite Score} = \left(\text{Peak TPS} \times \frac{\text{Average Accuracy}}{100.0}\right) - \left(\text{p99 Latency} \times 10\right)$$

---

## 5. gRPC Service Contract

High-performance binary serialization is maintained across distributed load generation nodes over HTTP/2 using the following standard structural protocol definitions:

```protobuf
syntax = "proto3";

package main;

option go_package = "/proto/gen;genpb";

service LoadGeneration {
    rpc StartLoad(StartingRequest) returns (StartingResponse);
    rpc StopLoad(StoppingRequest) returns (StoppingResponse);
}

message StartingRequest {
    string URL = 1;
}

message StartingResponse {
    string Message = 1;
}

message StoppingRequest {
    string Message = 1;
}

message StoppingResponse {
    string Message = 1;
}

```

---

## 6. Local Development & Mock Testing

A standalone decoupled local mock server is included to test the full React dashboard workflow (Authentication $\rightarrow$ Upload $\rightarrow$ Live SVG Streaming $\rightarrow$ Result Compilation $\rightarrow$ PDF Download) without requiring system installations of PostgreSQL, Redis, or Docker infrastructure.

### Execution Steps

1. **Spin up Backend Mock Routing:**

```bash
   cd backend
   npm install
   node mock_server.js

```

2. **Launch Frontend Application Instance:**

```bash
   cd ../frontend
   npm install
   npm run dev

```

3. **Access Local Instance:** Open your browser and navigate to the local loopback address provided by Vite (typically `http://localhost:5173`).

---

## 7. Production Deployment (IaC)

The system architecture is completely containerized for cloud-agnostic deployment. Boot up the entire multi-tier environment (React Web Frontend, Node Controller Backend, go load generator, Redis Cache Engine, and TimescaleDB Database cluster) with a single infrastructure-as-code command block:

```bash
docker compose up --build -d

```

> **Note:** Ensure your Docker engine or daemon is active and running before executing the setup command.

---

## 8. Directory Structure

```text
IICPC-Hackathon/
├── backend/
│   ├── auth/              # Auth routes & JWT verification middleware
│   ├── middleware/        # Multer upload configuration & size limits
│   ├── proto/             # gRPC main.proto contracts
│   ├── routes/            # Submissions upload, stream, & SQL metrics routers
│   ├── sandbox/           # Custom Dockerfile for iicpc-sandbox-base
│   ├── services/          # Redis queue & Docker sandbox execution managers
│   ├── uploads/           # Persistent local file store for binaries
│   ├── utils/             # Singleton Event Bus & File name sanitizers
│   ├── mock_server.js     # Standalone lightweight testing server
│   ├── server.js          # Express app entry-point
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/    # Pages (Home, Auth, Upload, Dashboard, Leaderboard)
    │   ├── App.jsx        # Root Router context mapping
    │   └── main.jsx       # App entry-point
    ├── vite.config.js     # Vite bundler configurations
    └── package.json

```
