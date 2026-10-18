# CloudPulse

Real-time load balancer console. The backend runs the scheduling engine (Greedy and Min-heap), and the dashboard streams its state live.

- **Backend** (`backend/`): Node.js, Express, Socket.IO. Scheduler, server controls (drain, fail, restore), admin sign-in, rate limiting, circuit breaker, S3 export, OpenAPI docs at `/docs`.
- **Frontend** (`frontend/`): plain HTML, CSS and JS with Bootstrap and Chart.js. No build step.

## Run locally

```bash
cd backend
npm install
npm start            # http://localhost:5001 (login: username `admin`, password `1234`)
```

Then open **http://localhost:5001** in a browser. The backend serves the dashboard itself, so there is nothing else to start. (Port 5001 is used because macOS AirPlay Receiver occupies 5000.) To point the pages at a different backend, edit `frontend/js/config.js`.

## Run with Docker

```bash
cp .env.example .env     # optional: change the login
docker-compose up --build
```

Dashboard: http://localhost:3000, API and docs: http://localhost:5001/docs

## API (all except login need `Authorization: Bearer <token>`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | `{ identifier, password }` returns `{ token }` |
| GET | `/api/lb/state` | Current servers, counters and history |
| POST | `/api/lb/dispatch` | `{ count, cost }` send requests through the scheduler |
| POST | `/api/lb/algorithm` | `{ algo: "greedy" \| "heap" }` |
| POST | `/api/lb/traffic` | `{ rate }` background requests per second (0 to 20) |
| POST | `/api/lb/running` | `{ running }` pause or resume the simulation |
| POST | `/api/lb/servers/:id/:action` | `drain`, `fail` or `restore` |

Socket.IO (connect with `auth: { token }`): `lb:state` every second and after each command, `lb:event` for the activity log.

## Tests

```bash
cd backend && npm test
```
