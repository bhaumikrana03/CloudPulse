# CloudPulse

**A real-time cloud load balancer console.** A Node.js backend runs the scheduling engine, and a live web dashboard shows server load and lets an administrator control the servers. Built for the *Analysis and Design of Algorithms* course.

> Traffic is simulated: the backend schedules generated requests onto simulated servers. No real HTTP traffic is proxied.

## Why it exists

When requests are sent to servers carelessly, some overload while others sit idle. CloudPulse lets you:

- see load as it happens,
- take servers out of service for maintenance or failure,
- compare how different scheduling algorithms spread load.

## Scheduling algorithms

Each request has a size (cost) and lasts a few seconds. Utilization = a server's load ÷ its capacity.

| | Greedy | Min-heap |
|---|---|---|
| Strategy | Compare utilization of every healthy server, pick the lowest | Keep healthy servers in a heap by utilization; take the top, assign, reinsert |
| Cost per request | O(n) | O(log n) |
| Best when | Few servers | Many servers |

If the chosen server cannot fit the request, the request is rejected and counted. Draining and failed servers are never chosen. The algorithm can be switched while the system runs.

## Features

- Greedy and min-heap schedulers, switchable at runtime
- Per-server capacity limits with rejection counting
- Server controls: **drain** (stop new requests), **fail** (drop in-flight requests), **restore**
- Live dashboard: load per server, 40-second utilization chart, active / dispatched / rejected counters, activity log
- Traffic generator: background traffic from 0 to 20 requests/second, plus batch sends by size (small, medium, large) and count
- Pause and resume the simulation
- Admin login with signed tokens (valid 12 hours)
- Light and dark mode
- Backend protection: rate limiting, circuit breaker, Swagger API docs at `/docs`

## Architecture

1. **Dashboard (browser):** HTML, CSS, JavaScript. Sends commands over REST, receives live updates over Socket.IO.
2. **Backend (Node.js + Express):** scheduler, server controls, login, rate limiting, API docs, Socket.IO server. It also serves the dashboard, so the whole app runs from one address.
3. **Database (PostgreSQL on Supabase):** *planned*, for history and analytics.

**Every second** the backend completes finished requests (freeing capacity), generates background requests, assigns each using the selected algorithm, records chart history, and pushes the new state to all connected dashboards.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, Socket.IO |
| Dashboard | HTML, CSS, JavaScript, Bootstrap 5, Chart.js |
| Login page | React, Tailwind CSS |
| Database (planned) | PostgreSQL on Supabase, `pg` driver |
| Testing | Jest, Supertest |
| Deployment | Docker, Docker Compose, Nginx, Render |
| API docs | Swagger (OpenAPI) |
| Optional | AWS S3 metrics export, Firebase token check |

## Getting started

### Run locally

```bash
cd backend
npm install
npm start
```

Open <http://localhost:5001>.

### Run with Docker Compose

```bash
docker compose up
```

Dashboard on port **3000**, API on port **5001**.

### Deploy

Can be hosted on Render as a single service.

### Run the tests

```bash
cd backend
npm test
```

8 automated tests cover both schedulers, even load spread, rejection when full, skipping draining/failed servers, restore behavior, input validation, and API authentication.

## API

All endpoints except login require `Authorization: Bearer <token>`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Returns a signed token |
| GET | `/api/lb/state` | Servers, counters, history |
| POST | `/api/lb/dispatch` | Send requests |
| POST | `/api/lb/algorithm` | Switch between `greedy` and `heap` |
| POST | `/api/lb/traffic` | Set background traffic |
| POST | `/api/lb/running` | Pause or resume |
| POST | `/api/lb/servers/:id/:action` | `drain`, `fail` or `restore` a server |
| GET | `/api/metrics/summary` | Aggregate metrics |

**Socket.IO events (server → client):** `lb:state` (full state every second and after each command) and `lb:event` (each activity log entry).

Interactive docs are available at `/docs`.

## Security and reliability

- Signed, expiring tokens protect the API and live feed
- Stricter rate limit on login, general rate limit on the API
- All command inputs are validated
- Circuit breaker protects the metrics endpoint
- Client reconnects automatically and shows a notice if the connection drops

## Planned database design

Tables: `users`, `servers`, `requests`, `metric_snapshots`, `events`, `algorithm_switches`. Planned concepts: ER diagram, 3NF normalization, constraints, triggers, a stored function, a transaction for batch dispatch, views and indexes. Planned analytics: rejection rate per server, peak load per hour, Greedy vs min-heap comparison.

## Limitations

- Traffic is simulated; no real HTTP traffic is proxied
- Single administrator account
- Social login buttons and "Forgot Password" are placeholders
- S3 export needs AWS and Firebase credentials that are not included
- Database persistence is not yet implemented

## Future scope

- Proxy mode forwarding real HTTP requests
- Server health checks
- More algorithms: weighted round-robin, least connections
- Multiple user roles and social login
- High-utilization alerts
- Database-backed history and analytics page

## Team

| Name | Roll no. | Responsibility |
|---|---|---|
| Abhinav Dubey | 25293916004 | Backend and API |
| Bhaumik Rana  | 25293916025 | Backend and API |
| Khush Chauhan | 25293916049 | Testing and Frontend|

## Repository

<https://github.com/bhaumikrana03/CloudPulse>
