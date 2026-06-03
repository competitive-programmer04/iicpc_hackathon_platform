# 🛠️ IICPC Trading Engine Submission Guide

Welcome to the benchmarking arena. To be successfully evaluated by our Load Generator, your trading engine must strictly adhere to the following infrastructure and API contracts.

### 1. Build Requirements
You must upload a single, standalone executable binary.
* **Target OS:** Linux x86_64 (`amd64`)
* **Network:** Your engine must listen on `0.0.0.0:8080`.
* **Endpoint:** You must expose a WebSocket server at the path `/trade`.

### 2. The WebSocket API Contract
Our bots will connect to your WebSocket and send JSON orders. You must parse the JSON and return exactly one of the **6 Event Types** below. 

#### Expected Input (From our Bots to You):
```json
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

Required Outputs (From You to Us):
Your engine must reply with valid JSON containing the event type and the processed_at timestamp.
Acknowledged: When an order is added to the resting orderbook.
{"event": "Acknowledged", "order_id": "...", "processed_at": 123456789}
Filled: When a maker and taker order fully match.
{"event": "Filled", "buy_order_id": "...", "sell_order_id": "...", "match_price": 150.00, "filled_quantity": 10, "processed_at": 123456789}
Partially Filled: When an order is only partially executed.
{"event": "Partially Filled", "buy_order_id": "...", "sell_order_id": "...", "match_price": 150.00, "filled_quantity": 4, "buy_remaining": 6, "sell_remaining": 0, "processed_at": 123456789}
Cancelled: When a user requests an order to be cancelled.
{"event": "Cancelled", "order_id": "...", "processed_at": 123456789}
Rejected (Wash Trade Prevention): If a bot tries to trade with itself.
{"event": "Rejected", "incoming_order_id": "...", "resting_order_id": "...", "bot_id": "...", "reason": "Self-Trade", "processed_at": 123456789}
Invalid Request: If an order has a negative price, negative quantity, etc.
{"event": "Invalid Request", "order_id": "...", "reason": "Negative Price", "processed_at": 123456789}
code
Code
---

# 📄 Document 2: The Architecture Blueprint (Deliverable 2)
*(Submit this to the judges to prove your system design mastery)*

```markdown
# 🏛️ Architecture Blueprint: Distributed Benchmarking Platform

## 1. System Overview
Our platform is a highly decoupled, multi-tiered microservice architecture designed to benchmark algorithmic trading engines at scale. It dynamically provisions isolated Linux sandboxes, blasts them with high-frequency WebSocket traffic, and aggregates P99 latency and throughput metrics in real-time.

## 2. Core Components & Tech Stack
* **Orchestrator & Ingester (Node.js/Express):** Manages Docker container lifecycles, calculates rolling telemetry metrics, and streams real-time data to the UI via Server-Sent Events (SSE).
* **Distributed Load Generator (Golang):** A highly concurrent, thread-safe traffic generator. It manages 10,000+ Goroutines to simulate a volatile market environment.
* **Message Broker (Redis):** Acts as an ultra-low-latency buffer between the Go traffic generator and the Node.js ingester.
* **Time-Series Database (TimescaleDB / PostgreSQL):** Stores the aggregated performance metrics. We utilized Postgres Hypertables (`TIMESTAMPTZ`) for O(1) time-based insertions and dynamic SQL calculation of the Leaderboard Composite Score.

## 3. Inter-Service Communication
To minimize overhead, our microservices communicate through heavily optimized protocols:
* **Node.js <-> Go (Control Plane):** We utilized **gRPC** for the `StartLoad` and `StopLoad` commands. This allows Node.js to pass graceful cancellation contexts (`context.WithCancel`) to Go in microseconds.
* **Go <-> Contestant Engine (Data Plane):** We multiplexed 10,000 virtual bot actors over a single **WebSocket** connection using Go Channels (the Fan-In pattern) to completely bypass OS-level ephemeral port exhaustion.

## 4. Advanced Engineering Implementations
To ensure the platform remained stable under 100,000+ TPS loads, we implemented the following strategies:
* **Thread-Safe State Machine (`sync.Map`):** The Go Load Generator tracks the lifecycle of every order in memory without Mutex lock-contention, strictly matching `Maker` and `Taker` orders to accurately calculate Taker latency.
* **Redis Write Coalescing (The Dump Truck Pattern):** Instead of executing 100,000 network calls to Redis per second, Go batches results into memory arrays and executes a single `RPUSH` command every 100ms.
* **Deterministic Price-Time Auditing (The Sniper Bot):** To verify algorithmic correctness without network jitter interfering, 99% of our traffic generates chaotic load (measuring TPS), while a dedicated "Sniper" goroutine operates on an isolated asset pair to mathematically verify Price-Time priority.
* **Circuit Breaker Crash Detection:** The Node.js ingester implements a 3-strike circuit breaker (`consecutiveFailure >= 3`) based on mathematically impossible metrics (Throughput = 0, P99 > 1500ms, Accuracy < 50%) to automatically tear down the sandbox if a contestant's engine deadlocks.