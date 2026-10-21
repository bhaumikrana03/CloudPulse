# CloudPulse

A real-time load balancer console. A Node.js backend runs the scheduling engine, and a plain HTML, CSS and JavaScript dashboard shows it live, so you can watch traffic spread across servers and control them as an administrator.


## Features

- **Two scheduling algorithms**, switchable while running:
  - **Greedy:** scans every healthy server and picks the one with the lowest utilization.
  - **Min-heap:** keeps servers in a heap ordered by utilization, so the least-loaded one is always on top.
- **Capacity limits:** a server at capacity cannot take more work, and requests that fit nowhere are rejected and counted.
- **Server controls:** drain a server (no new requests), fail it (drops in-flight requests), or restore it.
- **Live updates:** the backend streams its state every second over Socket.IO. The dashboard shows load per server, a utilization chart, counters and an activity log.
- **Traffic generator:** adjustable background traffic, plus a form to send batches of requests by size and count.
- **Admin sign-in:** the dashboard, REST API and live feed all require a signed token.
- **Light and dark mode** with a saved preference.
- **Backend hardening:** rate limiting, a circuit breaker, and OpenAPI docs at `/docs`.

## Tech stack

| Part | Technology |
| --- | --- |
| Backend | Node.js, Express, Socket.IO |
| Frontend | HTML, CSS, JavaScript, Bootstrap 5, Chart.js |
| Login page | React and Tailwind CSS (loaded from CDNs, no build step) |
| Tests | Jest, Supertest |
| Deployment | Docker, Docker Compose, Nginx |

## Project structure

```
CloudPulse/
  backend/
    src/
      server.js              Express and Socket.IO setup
      routes/lb.js           Load balancer REST endpoints
      services/
        loadBalancer.js      Greedy and Min-heap schedulers, server controls
        adminAuth.js         Sign-in and token handling
        s3Export.js          Optional metrics export to S3
      middleware/            Rate limiter, circuit breaker, Firebase check
    tests/                   Jest tests
  frontend/
    index.html               Dashboard
    login.html               Sign-in page
    css/styles.css
    js/app.js                Dashboard logic
    js/config.js             Backend address
    src/LoginPage.jsx        Login page as a standalone React component
  docker-compose.yml
```

## Getting started

You need Node.js 18 or newer.

```bash
cd backend
npm install
npm start
```

Open **http://localhost:5001** and sign in with:

- Username: `admin`
- Password: `1234`

The backend serves the dashboard itself, so there is nothing else to start. It uses port 5001 because macOS AirPlay Receiver occupies port 5000.

### Run with Docker

```bash
docker-compose up --build
```

Dashboard: http://localhost:3000 
API and docs: http://localhost:5001/docs

## Configuration

Set these in `backend/.env` (see `.env.example`). All are optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5001` | Backend port |
| `ADMIN_USERNAME` | `admin` | Sign-in username |
| `ADMIN_EMAIL` | none | Optional email that can also be used to sign in |
| `ADMIN_PASSWORD` | `1234` | Sign-in password. Change it before any public deployment |
| `AUTH_SECRET` | random | Signs tokens. Set it to keep users signed in across restarts |
| `CORS_ORIGIN` | `*` | Allowed browser origin |

To point the pages at a different backend address, edit `frontend/js/config.js`.

## API

All endpoints except login need the header `Authorization: Bearer <token>`.

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | `{ identifier, password }` | Returns `{ token }` |
| GET | `/api/lb/state` | | Servers, counters and recent history |
| POST | `/api/lb/dispatch` | `{ count, cost }` | Send requests through the scheduler |
| POST | `/api/lb/algorithm` | `{ algo: "greedy" or "heap" }` | Switch scheduler |
| POST | `/api/lb/traffic` | `{ rate }` | Background requests per second, 0 to 20 |
| POST | `/api/lb/running` | `{ running }` | Pause or resume the simulation |
| POST | `/api/lb/servers/:id/:action` | | `drain`, `fail` or `restore` |
| GET | `/api/metrics/summary` | | Aggregate metrics |

Socket.IO: connect with `auth: { token }`. The server emits `lb:state` every second and after each command, and `lb:event` for each activity log entry.

## How scheduling works

Each request has a size (cost) and runs for a few seconds. Every second the backend finishes completed requests, creates new background traffic, and assigns each request to a server.

- **Greedy** compares the utilization (load divided by capacity) of every healthy server on each request. It takes O(n) per request.
- **Min-heap** rebuilds a heap when state changes, then takes the least-loaded server from the top and pushes it back with its new load. Each assignment costs O(log n), which matters as the server count grows.

If the chosen server cannot fit the request, the request is rejected. Draining and failed servers are never chosen.

## Tests

```bash
cd backend
npm test
```

The tests cover both schedulers, capacity rejection, drain, fail and restore behavior, input validation, and API authentication.

## Limitations

- Traffic is simulated. The backend schedules generated requests onto simulated servers and does not proxy real HTTP traffic.
- The sign-in is a single administrator account. Social sign-in buttons and "Forgot Password" on the login page are placeholders.
- The S3 export endpoint needs Firebase and AWS credentials that are not included.
