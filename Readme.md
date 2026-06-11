# Trading-Benchmarker: Distributed Benchmarking & Hosting Platform for Trading Engines

**Trading-Benchmarker** is a highly concurrent, resource-isolated, and distributed benchmarking and hosting platform designed to securely execute, profile, and stress-test contestant-submitted trading engines under extreme simulated market volatility.

The platform utilizes a decoupled, event-driven agent-controller architecture to run real-time telemetry analysis at microsecond precision while maintaining absolute execution safety on the host infrastructure.

---

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [Contestant Guide: Building Statically Linked Binaries](#2-contestant-guide-building-statically-linked-binaries)
3. [Contestant API & Communication Contract](#3-contestant-api--communication-contract)
4. [Component Deep Dive](#4-component-deep-dive)
5. [The Dual-Stream Testing Methodology](#5-the-dual-stream-testing-methodology)
6. [Database Schemas & Analytical Scoring](#6-database-schemas--analytical-scoring)
7. [gRPC Service Contract](#7-grpc-service-contract)
8. [Infrastructure as Code (IaC)](#8-infrastructure-as-code-iac)
9. [Future Scalability: Redis Pub/Sub](#9-future-scalability-redis-pubsub)
10. [Directory Structure](#10-directory-structure)

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


## 2. Contestant Guide: Building Statically Linked Binaries

To ensure maximum performance and zero dependency-mismatch errors (e.g., missing GLIBC), all submitted trading engines must be statically linked Linux executables targeting x86_64 (amd64). Your engine must bind its WebSocket server to 0.0.0.0:8080.


### 🐹 Go (Golang)

Disable CGO to enforce strict static linking:
```
Bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -installsuffix cgo -o trading_engine main.go
```


### 🦀 Rust

Compile against the musl target to guarantee it runs flawlessly on any Linux sandbox:
```
Bash
rustup target add x86_64-unknown-linux-musl
cargo build --target x86_64-unknown-linux-musl --release
```


### ⚙️ C++ (Automated via GitHub Actions)

If you are compiling C++ on Windows or Mac, the easiest way to generate a pristine Ubuntu Linux binary is to use GitHub Actions. Create a .github/workflows/build.yml file in your repository:
```
Yaml
name: Compile C++ Trading Engine
on: [push]
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
    - uses: actions/checkout@v4
    - name: Install Dependencies
      # Replace '<your-dependencies-here>' with any specific C++ libraries your engine needs
      run: sudo apt-get update && sudo apt-get install -y g++ <your-dependencies-here>
    - name: Compile Static Binary
      # Update 'your_source_file.cpp' and 'engine_binary' to match your project
      run: g++ -std=c++17 -static -O3 your_source_file.cpp -lpthread -o engine_binary
    - name: Upload Binary
      uses: actions/upload-artifact@v4
      with:
        name: linux-trading-engine-binary
        path: engine_binary
```

GitHub will compile your code automatically. Download the resulting artifact and upload it to our platform!


### 🌐 Other Languages

If you are writing your engine in another compiled language (Nim, Zig, Crystal, etc.), please consult your language's official documentation on how to output a "statically linked Linux x86_64 executable."



## 3. Contestant API & Communication Contract

Our Load Generator communicates exclusively over WebSockets on ws://0.0.0.0:8080/trade.
Expected Input (From Platform to Your Engine)
Your engine will be bombarded with JSON payloads matching this schema:
```
JSON
{
  "order_id": "bot-1-1715965412345", 
  "bot_id": "bot-1",
  "symbol": "AAPL",
  "price": 150.25,
  "quantity": 10,
  "action": "buy",
  "order_type": "limit",
  "timestamp": 1715965412345
}
```

Required Output (From Your Engine to Platform)
Your engine must parse the incoming JSON and return exactly one of the 6 Event Types below. (All events must include the exact processed_at Unix millisecond timestamp).

1. Acknowledged: An order is validated and added to the resting orderbook.
```
JSON
{"event": "Acknowledged", "order_id": "...", "bot_id": "...", "processed_at": 123456789}
```

2. Filled: A Maker and Taker order fully match.
```
JSON
{"event": "Filled", "buy_order_id": "...", "sell_order_id": "...", "match_price": 150.00, "filled_quantity": 10, "processed_at": 123456789}
```

3. Partially Filled: An order is only partially executed.
```
JSON
{"event": "Partially Filled", "buy_order_id": "...", "sell_order_id": "...", "match_price": 150.00, "filled_quantity": 4, "buy_remaining": 6, "sell_remaining": 0, "processed_at": 123456789}
```

4. Cancelled: A user successfully requested an order removal.
```
JSON
{"event": "Cancelled", "order_id": "...", "bot_id": "...", "processed_at": 123456789}
```

5. Rejected: A bot attempted to Wash Trade (trade with itself).
```
JSON
{"event": "Rejected", "incoming_order_id": "...", "resting_order_id": "...", "processed_at": 123456789}
```

6. Invalid Request: Malformed requests (e.g., negative prices/quantities).
```
JSON
{"event": "Invalid Request", "order_id": "...", "bot_id": "...", "processed_at": 123456789}
```


## 4. Component Deep Dive


### Frontend SaaS Portal

Engine & Routing: Built using React and Vite. It implements standard client-side routing to ensure backward/forward history traversal and deep-linking.

Zero-Dependency SVG Charting: Bypasses heavy, compilation-prone third-party visualization libraries by utilizing raw inline SVG math and scaling coordinates to render incoming time-series streams natively.


### Backend Express Controller

FIFO Job Scheduler: Enqueues incoming compilation and benchmarking tasks onto a centralized Redis List. This guarantees single-tenant evaluation patterns across horizontally scaled instances, preventing overlapping performance distortion.

Real-time Streaming: Opens unidirectional HTTP channels (text/event-stream) via Server-Sent Events (SSE) to instantly pipe execution metrics directly from the backend event bus to the React dashboard.

Secure Sandbox Containerizer
Isolation Layers: Wraps untrusted user binaries inside a stripped-down ubuntu:24.04 container running as an unprivileged system user (nobody / UID 65534), protected by --security-opt no-new-privileges.

Hardware Bounds: Caps resource allocations to exactly 1 CPU Core and restricts memory usage to a hard roof of 1GB RAM via Docker Engine resource flags.

Docker Internal DNS: Circumvents Host-OS port collision limits entirely. The Go Load Generator bypasses exposed host ports and routes traffic directly into the internal container network (ws://container_name:8080).


### Load Generator (Go Bot Core)

Concurrency Engine: Written in Go to maximize low-level resource efficiency. Uses heavily buffered channels and context.WithCancel watchdogs to safely manage 10,000+ lightweight Goroutines, preventing zombie-thread memory leaks.

Fan-In WebSocket Multiplexing: To bypass Ephemeral Port Exhaustion, it multiplexes thousands of virtual bot entities over a single, persistent WebSocket connection.

Write Coalescing Telemetry: A background worker collects latency results and flushes them to Redis via a single RPUSH command every 100ms or 1,000 items, reducing database network traffic by 99.9%.

O(1) Lock-Free State: Tracks in-flight orders without CPU lock contention by leveraging Go’s native sync.Map, utilizing atomic hardware-level memory operations instead of coarse-grained RWMutex locks.


## 5. The Dual-Stream Testing Methodology


To eliminate the "Illusion of Time" introduced by TCP network jitter, the load generator bifurcates workloads into two distinct operational streams:

### Stream A: Chaotic Bots (Throughput & Negative Fuzzing)

Simulates massive market volatility by scaling workloads exponentially.

Trap Injection: 5% of all outbound transactions are corrupted on-the-fly (e.g., negative boundaries or illegal enums). If an engine accepts these rather than raising an immediate validation rejection, its accuracy score drops.

Maker vs. Taker Latency Isolation: System latency metrics are computed exclusively from Taker response legs to eliminate artificial latency inflation caused by resting Maker liquidity.

### Stream B: Sniper Bot (Algorithmic Logic Auditing)

Operates sequentially on an isolated asset identifier (IICPC_PRIO) to mathematically verify matching logic accuracy:
The Middleman Sorting Trap: The bot purposefully structures a three-tiered placement sequence: Sell @ $105, Sell @ $100 (Optimal Price), and Sell @ $110. By positioning the optimal clearing price in the middle, the audit engine forces the contestant's system to invoke sorting algorithms, instantly exposing lazy FIFO/LIFO stack shortcuts.



## 6. Database Schemas & Analytical Scoring


Historical executions and time-series telemetry metrics are persisted using TimescaleDB / PostgreSQL.
Schema Definitions
```
SQL
CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    team_id VARCHAR(30) NOT NULL,
    submission_id VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics_trading_engine (
    id SERIAL,
    submission_id VARCHAR(50) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    time_second INT NOT NULL,
    tps INT,
    p50_lat FLOAT,
    p99_lat FLOAT,
    accuracy FLOAT,
    PRIMARY KEY (id, recorded_at)
);

-- Initialize TimescaleDB Hypertable
SELECT create_hypertable('metrics_trading_engine', 'recorded_at', if_not_exists => TRUE);
```

### Composite Scoring Formula
The platform grades trading engines using a dynamic SQL calculation that rewards throughput while aggressively penalizing high tail-latency values. Scores are dynamically constrained using LEAST and GREATEST wrappers.

$$\text{Composite Score} = \left(\text{Peak TPS} \times \frac{\text{Average Accuracy}}{100.0}\right) - \left(\text{p99 Latency} \times 10\right)$$
​

## 7. gRPC Service Contract


High-performance binary serialization is maintained between the Node.js Orchestrator and the Go Load Generator over HTTP/2 using standard protobuf definitions:
```
Protobuf
syntax = "proto3";

package loadgenerator;

option go_package = "./proto/gen";

service LoadGenerationServer {
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
    string Message=1; 
}

message StoppingResponse { 
    string Message = 1; 
}
```



## 8. Infrastructure as Code (IaC)


To fulfill automated deployment requirements, the entire multi-tier environment (Node Controller Backend, Go Load Generator, Redis Cache, TimescaleDB Database, and Caddy Reverse Proxy) is containerized via Docker Compose for instant, one-click provisioning on cloud compute instances.

By mounting /var/run/docker.sock, the orchestrator natively executes Docker-out-of-Docker (DooD) sandbox provisioning without requiring nested virtualization overhead. Caddy auto-provisions Let's Encrypt SSL certificates to ensure End-to-End Encryption between the browser and the backend cluster.



## 9. Future Scalability: Redis Pub/Sub


While the current MVP operates the Go Load Generator as a single gRPC microservice capable of 50,000+ TPS (easily saturating the 1-core limit of contestant sandboxes), the architecture is designed for horizontal enterprise scalability.
To break past single-node TCP limits, the system can seamlessly pivot to a Redis Pub/Sub model. The Node.js orchestrator would broadcast the StartLoad metadata payload to a Redis channel. This allows an orchestration cluster (like Kubernetes/EKS) to spin up N Go Load Generator replicas across multiple availability zones, each subscribing to the channel and concurrently spawning bots for a globally distributed DDoS load-generation event.



## 10. Directory Structure
```
IICPC_Hackathon_Platform/
|── frontend/
|   ├── src/
|   │   ├── components/    # Pages (Home, Auth, Upload, Dashboard, Leaderboard)
|   │   ├── App.jsx        # Root Router context mapping
|   │   └── main.jsx       # App entry-point
|   ├── vite.config.js     # Vite bundler configurations
|   └── package.json
├── backend/
│   ├── auth/              # Auth routes & JWT verification middleware
│   ├── routes/            # Submissions upload, stream, & SQL metrics routers
│   ├── services/          # Redis queue & Docker sandbox execution managers
│   ├── server.js          # Express app entry-point
│   └── Dockerfile
├── go_bot_generator/
│   ├── proto/gen/         # Compiled gRPC stubs (main.pb.go)
│   ├── main.go            # High-concurrency bot fleet & Telemetry logic
│   └── Dockerfile
├── db_scripts/
│   └── init.sql           # TimescaleDB Table & Hypertable generation
├── .gitignore
├── Caddyfile              # Reverse proxy routing & Auto-SSL
├── docker-compose.yml     # IaC Orchestration
└── README.md
```
---
