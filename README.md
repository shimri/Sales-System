## Sales-System

Distributed sales and delivery system built with NestJS, Kafka, Postgres, and Redis.  
Repository: [`shimri/Sales-System`](https://github.com/shimri/Sales-System)

---

### Features

- **Sales service (`apps/sales`)**
  - User registration and authentication (JWT).
  - Order creation with optimistic concurrency and custom exception filters.
  - Inventory checks with dedicated exceptions and filters.
  - Publishes order events to Kafka for the delivery service.
  - HTTP API on `http://localhost:3000`.

- **Delivery service (`apps/delivery`)**
  - Listens to order events from Kafka.
  - Persists shipment data in Postgres.
  - Sends delivery status events back to the sales service.
  - HTTP health endpoint on `http://localhost:3001`.

- **Infrastructure via Docker Compose**
  - Postgres for sales and delivery.
  - Redis for locking / caching.
  - Kafka broker.
  - Dockerized sales and delivery services.

---

## Project Structure

```text
apps/
  sales/          # Sales service (NestJS HTTP + Kafka consumer/producer)
    src/
      auth/       # Authentication & JWT
      sales/      # Sales module (controllers, services, health)
      order/      # Order entity, DTOs, filters
      inventory/  # Inventory checks, exceptions, filters
      user/       # User entity, DTOs, service
      database/   # TypeORM config
      middleware/ # Correlation ID middleware
      validator/  # Event validation

  delivery/       # Delivery service (NestJS HTTP + Kafka consumer/producer)
    src/
      delivery/   # Delivery controller/service
      shipment/   # Shipment entity
      database/   # TypeORM config
      validator/  # Event validation

docker-compose.yml  # Full local stack definition
sales-api.http      # Example HTTP calls for the sales service
```

---

## Prerequisites

- **Docker & Docker Compose**
  - Install Docker Desktop and ensure `docker` / `docker compose` work in your terminal.
- **Node.js & npm** (only needed for local dev without Docker)
  - Recommended: Node **20+**.
- **NestJS CLI** (optional)
  - `npm install -g @nestjs/cli`

---

## Quickstart (recommended – Docker Compose)

### 1. Clone the repository

```bash
git clone https://github.com/shimri/Sales-System.git
cd Sales-System
```

### 2. Environment variables (for local dev)

Each service has its own `.env` file:

- `apps/sales/.env`

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=sales_db
KAFKA_BROKERS=localhost:9092
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000


- `apps/delivery/.env`

POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=delivery_db
KAFKA_BROKERS=localhost:9092


Minimal example for `apps/sales/.env`:

```bash
JWT_SECRET=change-me-in-dev
JWT_EXPIRATION=1h
```

When you run everything with Docker Compose, database, Redis, and Kafka connection settings are already provided to the containers via `docker-compose.yml`, so you typically only need app-specific secrets there.

These example `.env` values are mainly for **local development without Dockerized services**. For local (non-Docker) runs, ensure your `.env` values match your local infra.

---

## Running with Docker (recommended for everyone)

From the project root:

```bash
docker compose up --build
```

This starts:

- **Postgres (sales)**: `localhost:5432`
- **Postgres (delivery)**: `localhost:5433`
- **Redis**: `localhost:6379`
- **Kafka**: `localhost:9092`
- **Sales service**: `http://localhost:3000`
- **Delivery service**: `http://localhost:3001`

Wait until all containers are healthy and the NestJS apps log that they are listening on their ports.

To stop:

```bash
docker compose down
```

---

## Running Locally (optional – for contributors)

This section is **optional** and intended for contributors who want hot-reload and local debugging of the NestJS apps. In this mode, you typically:

- Run **infrastructure in Docker** (Postgres, Redis, Kafka).
- Run **sales** and **delivery** locally with `npm run start:dev`.

Do **not** also run the `sales` and `delivery` containers at the same time, or you will get port conflicts on 3000/3001.

### 1. Start infrastructure only

```bash
docker compose up postgres-sales postgres-delivery redis kafka
```

Make sure your `.env` files in `apps/sales` and `apps/delivery` point to the correct hosts and ports (`localhost` vs container names like `postgres-sales`, `kafka`, etc.), depending on how you run them.

### 2. Run sales service

```bash
cd apps/sales
npm install
npm run start:dev
```

Sales service will be available at:

- `http://localhost:3000`

### 3. Run delivery service

```bash
cd apps/delivery
npm install
npm run start:dev
```

Delivery service will be available at:

- `http://localhost:3001`

---

## Health & Test Endpoints

These endpoints are designed to easily verify that each service is up.

### Sales service (apps/sales)

Base URL: **`http://localhost:3000`**

- **GET `/`**
- **GET `/health`**

Example response:

```json
{ "service": "sales", "status": "ok" }
```

### Delivery service (apps/delivery)

Base URL: **`http://localhost:3001`**

- **GET `/`**
- **GET `/health`**

Example response:

```json
{ "service": "delivery", "status": "ok" }
```

---

## Core Business Endpoints

Detailed examples are available in `sales-api.http`. Some key flows:

- **User authentication (sales service)**
  - `POST /auth/register`
  - `POST /auth/login`

- **Order creation (sales service)**
  - `POST /orders` (requires JWT; uses `CreateOrderDto`)
  - Triggers inventory check and publishes an order event to Kafka if successful.

- **Delivery processing (delivery service)**
  - Consumes `order-events` from Kafka.
  - Persists `Shipment` entities and publishes delivery status events back to the sales service.

Refer to the controllers in `apps/sales/src` and `apps/delivery/src` for the full set of routes and message patterns.

---

## Testing

From inside each app directory:

```bash
# Sales service
cd apps/sales
npm test         # unit tests
npm run test:e2e # end-to-end tests
npm run lint     # linting

# Delivery service
cd apps/delivery
npm test         # unit tests
npm run test:e2e # end-to-end tests
npm run lint     # linting
```

---

## Notes

- This project is intended as a **interview assignment**, showcasing:
  - Event-driven communication with Kafka.
  - Transactional boundaries and error handling with custom exception filters.
  - Separation of concerns between sales and delivery domains.
- For production use, you would:
  - Harden security and secrets management.
  - Add observability (logging, metrics, tracing).
  - Configure proper SSL, topics, and DB migrations.


