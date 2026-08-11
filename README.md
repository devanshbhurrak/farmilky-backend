# Farmilky - Backend API Server 🥛

A modular and scalable REST API providing all backend capabilities for the Farmilky milk & dairy ecommerce platform, including the customer-facing storefront and the staff/admin portal.

- Node.js + Express 5 API server (ESM)
- MongoDB + Mongoose data layer
- JWT authentication with secure HTTP-only cookie strategy
- Cart, order, subscription, and invoice/passbook management
- Delivery operations: areas, agents (delivery partners), daily delivery manifests
- Supplier & milk collection management
- Complaints, returns, and contact-message handling
- Rate limiting, Helmet, CORS, and morgan logging
- Cron jobs for daily delivery, manifest generation, and end-of-day processing

---

## Table of Contents
1. Overview
2. Tech Stack
3. Project Structure
4. Environment Setup
5. Running Locally
6. API Endpoints
7. Authentication, Roles & Middleware
8. Scheduler and Cron Jobs
9. Delivery Manifest Service
10. Scripts & Migrations
11. Testing
12. Deployment
13. Contributing
14. License

---

## 1. Overview
The backend service handles API requests from the frontend and the management portal, covering:

- user registration/login/logout, profile management
- product catalog (public read, admin CRUD)
- cart operations (add/update/remove/clear)
- order creation, cancellation, admin management, and delivery outcomes
- subscription lifecycle (pause/resume/cancel/vacation/skip/scheduled changes)
- passbook (customer balance ledger) and payment recording
- area & delivery-agent management, daily delivery manifests
- holidays, milk collections, suppliers, and supplier payments
- complaints, returns, and contact messages
- admin stats, bulk subscription actions, and delivery performance

---

## 2. Tech Stack
- Node.js + Express 5
- MongoDB + Mongoose
- JWT + bcrypt for authentication
- dotenv for configuration
- helmet, cors, cookie-parser, morgan, express-rate-limit for security & logging
- node-cron for optional local scheduled jobs
- Node's built-in test runner (`node:test`) for tests

---

## 3. Project Structure

```text
backend/
├── config/
│   ├── db.js                  # MongoDB connection logic
│   └── env.js                 # env validation + CORS origin parsing
├── controllers/               # Route handlers per domain
│   ├── admin.controller.js
│   ├── agent.controller.js
│   ├── area.controller.js
│   ├── cart.controller.js
│   ├── complaint.controller.js
│   ├── contact.controller.js
│   ├── cron.controller.js
│   ├── deliveryManifest.controller.js
│   ├── holiday.controller.js
│   ├── milkCollection.controller.js
│   ├── order.controller.js
│   ├── passbook.controller.js
│   ├── payment.controller.js
│   ├── product.controller.js
│   ├── return.controller.js
│   ├── subscription.controller.js
│   ├── supplier.controller.js
│   ├── supplierAdjustment.controller.js
│   ├── supplierPayment.controller.js
│   └── user.controller.js
├── middleware/
│   ├── adminMiddleware.js     # role checks for admin/delivery partners
│   └── authMiddleware.js      # JWT verify + role helpers
├── models/                    # Mongoose schemas
├── routes/                    # Express routers per domain
├── scripts/                   # One-off data migration utilities
│   ├── dedupeManifests.js
│   ├── migrateRoles.js
│   ├── migrateSupplierBalances.js
│   └── migrateToPassbook.js
├── services/
│   ├── manifestService.js     # daily delivery sheet generation
│   └── scheduler.js           # local cron jobs (delivery, end-of-day, manifests)
├── tests/                     # node:test suite
├── utils/
│   └── cookieOptions.js       # shared JWT cookie settings
├── .env.example
├── server.js                  # App initialization & middleware
├── package.json
└── vercel.json                # Serverless + cron route config
```

---

## 4. Environment Setup
Copy `.env.example` to `.env` and fill in secure values:

```env
PORT=4000
NODE_ENV=development
MONGO_URI=mongodb+srv://<db_user>:<db_pass>@<cluster>.mongodb.net/<db_name>?retryWrites=true&w=majority
JWT_SECRET=<your_jwt_secret>
FRONTEND_URL=http://localhost:5173
ADMIN_PORTAL_URL=http://localhost:3000
BACKEND_URL=http://localhost:4000
ENABLE_LOCAL_SCHEDULER=true
CRON_SECRET=<your_cron_secret>
```

**Required variables** (validated on boot): `MONGO_URI`, `JWT_SECRET`, `FRONTEND_URL`, `CRON_SECRET`.

Notes:
- `FRONTEND_URL` and `ADMIN_PORTAL_URL` accept a comma-separated list (or a JSON array) of allowed CORS origins.
- `ENABLE_LOCAL_SCHEDULER=true` runs cron jobs inside the Node process, but only when `NODE_ENV !== "production"`.
- `CRON_SECRET` protects `/api/cron/*` endpoints (Bearer token).
- Keep secrets out of Git: `.env` is ignored.

---

## 5. Running Locally

Install dependencies:
```bash
cd backend
npm install
```

Start in development mode (nodemon, restarts on change):
```bash
npm run dev
```

Production-style run:
```bash
npm start
```

Check the server at: `http://localhost:4000`

---

## 6. API Endpoints

### User (`/api/user`) — rate limited
- `POST /register` - register new user
- `POST /login` - login and set cookie
- `POST /logout` - clear cookie (authenticated)
- `GET /profile` - current user profile (authenticated)
- `PUT /profile` - update profile (authenticated)
- Admin: `GET /admin/all`, `GET /admin/:id`, `POST /admin/create`, `PUT /admin/:id`, `PUT /admin/:id/delivery-config`

### Products (`/api/products`)
- `GET /` - list all products (public)
- `GET /:id` - product details (public)
- `POST /` - add product (admin)
- `PUT /:id` - update product (admin)
- `DELETE /:id` - remove product (admin)

### Cart (`/api/cart`) — authenticated
- `GET /` - get current user cart
- `POST /add` - add item to cart
- `PUT /update` - update cart item
- `DELETE /remove` - remove item
- `DELETE /clear` - clear cart

### Orders (`/api/order`)
- `POST /` - place order from cart (authenticated)
- `GET /` - list user orders (authenticated)
- `GET /:id` - order details (authenticated)
- `PUT /:id/cancel` - cancel an order (authenticated)
- Admin: `GET /admin/all`, `GET /admin/:id`, `POST /admin/create`, `PUT /admin/:id`, `PUT /admin/:id/status`, `POST /admin/:id/delivery-outcome`

### Subscriptions (`/api/subscriptions`)
- `POST /` - create subscription (authenticated)
- `GET /` - list my subscriptions (authenticated)
- `GET /:id` - subscription details (authenticated)
- `PUT /:id` - update subscription
- `PUT /:id/pause` / `PUT /:id/resume` - pause/resume
- `PUT /:id/cancel` - cancel
- `PUT /:id/vacation` / `DELETE /:id/vacation` - vacation scheduling
- `PUT /:id/skip` / `PUT /:id/unskip` - skip/unskip a delivery date
- `PUT /:id/schedule-change` / `DELETE /:id/schedule-change` - scheduled quantity changes
- Admin: `GET /admin/all`, `GET /admin/today-supply`, `GET /admin/delivery-board`, `GET /admin/user/:userId/active`, `GET /admin/:id`, `POST /admin/create`, `PUT /admin/:id`, `PUT /admin/:id/status`, `POST /admin/:id/delivery-outcome`, `POST /admin/:id/mark-delivered`

### Admin (`/api/admin`) — admin only
- `GET /stats` - aggregated dashboard stats
- `GET /delivery-performance` - delivery performance metrics
- `PUT /subscriptions/bulk-pause` / `PUT /subscriptions/bulk-resume` - bulk subscription actions
- `GET /agents` - list delivery agents

### Cron (`/api/cron`) — `CRON_SECRET` bearer auth
- `POST /daily-delivery` - run the daily delivery job
- `POST /end-of-day` - run the end-of-day job

### Holidays (`/api/holidays`) — authenticated
- `GET /` - list holidays
- `POST /` - create holiday (admin)
- `PUT /:id` - update holiday (admin)
- `DELETE /:id` - delete holiday (admin)

### Complaints (`/api/complaints`)
- `POST /` - file a complaint (authenticated)
- `GET /my` / `GET /my/:id` - my complaints (authenticated)
- Admin: `GET /admin/all`, `PUT /admin/:id/status`

### Contact (`/api/contact`) — rate limited (5/hour/IP)
- `POST /` - submit contact message (public)
- Admin: `GET /admin/all`, `PATCH /admin/:id/status`

### Areas (`/api/areas`) — admin
- `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`
- `GET /:id/customers` / `PUT /:id/customers` - manage area customers

### Agents (`/api/agents`) — admin (delivery partner management)
- `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`
- `PATCH /:id/status` - toggle active
- `PUT /:id/assign-area` - assign coverage area
- `GET /:id/performance` - agent performance

### Delivery Manifests (`/api/manifests`)
- `POST /generate` - generate daily manifests (admin)
- `GET /` - manifests by date (admin)
- `GET /my/today` / `GET /my/history` - agent's own sheets (delivery partner)
- `GET /:id` - manifest details (admin/delivery partner)
- `PUT /:id/resequence` - reorder entries (admin)
- `PUT /:id/entries/:entryId` - update an entry outcome

### Returns (`/api/returns`)
- `POST /` - request a return (authenticated)
- `GET /my` - my returns (authenticated)
- Admin: `GET /admin/all`, `PUT /admin/:id/status`

### Payments / Passbook (`/api/payments`)
- `GET /my-passbook` - my passbook ledger (authenticated)
- `GET /:userId` - customer passbook (admin)
- Admin: `POST /admin/record`, `DELETE /admin/:id`

### Suppliers (`/api/suppliers`)
- `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`
- `PATCH /:id/status` - toggle supplier status
- `GET /:supplierId/passbook` - supplier passbook
- `POST /:supplierId/adjustments` / `DELETE /:supplierId/adjustments/:id` - adjustments
- `GET /outstanding` - outstanding balances
- `GET /collection-total` - collection totals for a period

### Milk Collections (`/api/milk-collections`)
- `GET /` - collection history
- `GET /today-shift` - today's shift summary
- `GET /daily` - daily confirmation report
- `POST /generate` - generate daily collections
- `POST /bulk-confirm` - bulk-confirm a day
- `GET /missing` - missing collections
- `POST /:id/confirm` - confirm a collection
- `PUT /:id` - update a collection

### Supplier Payments (`/api/supplier-payments`)
- `POST /` - record a payment
- `GET /:supplierId` - payment history

### Utils (`/api/utils`)
- `POST /resolve-maps-link` - resolve a Google Maps link to coordinates (rate limited)

---

## 7. Authentication, Roles & Middleware

- User logs in with email/password; the server validates credentials and signs a JWT.
- The JWT is stored in a secure, HTTP-only cookie (`utils/cookieOptions.js`).
- `authMiddleware` verifies the JWT on protected routes and attaches the user to `req.user`.
- `adminMiddleware` enforces role-based access for restricted actions.
- Recognized portal roles: `admin`, `delivery_partner` (and legacy `delivery`/`agent`).
- Auth endpoints are rate limited (100 req / 15 min / IP); the public contact form has a stricter limit (5 / hour / IP).

---

## 8. Scheduler and Cron Jobs

### Local scheduler (`services/scheduler.js`)
Enabled only when `ENABLE_LOCAL_SCHEDULER=true` and `NODE_ENV !== "production"`:

| Job | Schedule | What it does |
| --- | --- | --- |
| Daily delivery | `0 0 * * *` | Evaluates active subscriptions, applies due scheduled quantity changes, auto-clears expired vacations, prunes old skipped dates |
| Manifest generation | `5 0 * * *` | Generates/refreshes today's delivery sheets |
| End-of-day | `0 21 * * *` | Marks un-attempted manifest entries as failed and completes the day's sheets |

Delivery dates are holiday-aware (cached holiday set) and skip dates fall on holidays.

### Vercel cron (`vercel.json`)
In production, scheduled jobs run as Vercel cron requests to `/api/cron/*` (protected by `CRON_SECRET`):
- `0 0 * * *` → `/api/cron/daily-delivery`
- `5 0 1 * *` → `/api/cron/monthly-invoices`
- `0 21 * * *` → `/api/cron/end-of-day`

### Startup manifest generation
On boot, the server runs `runDailyManifestGenerationJob()` once the DB connection is open so today's sheets exist even after a mid-day restart (idempotent).

---

## 9. Delivery Manifest Service
`services/manifestService.js` builds per-agent daily delivery sheets from active subscriptions and orders:
- Manifests are generated for the current day and keyed by date + agent.
- Late orders/subscriptions are appended to the active sheet for the day.
- Supports entry-level outcome updates (delivered / failed / skipped) and admin re-sequencing.

---

## 10. Scripts & Migrations

| Script | Command | Purpose |
| --- | --- | --- |
| Dedupe manifests | `npm run dedupe:manifests` | Remove duplicate manifest entries |
| Migrate roles | `npm run migrate:roles` | Migrate legacy user roles |
| Migrate supplier balances | `node scripts/migrateSupplierBalances.js` | Backfill supplier balance fields |
| Migrate to passbook | `node scripts/migrateToPassbook.js` | Backfill customer passbook records |

---

## 11. Testing
Tests use Node's built-in test runner:

```bash
npm test
```

Existing suites: `config.test.js`, `cron.controller.test.js`, `manifestService.test.js`, `middleware.test.js`, `order.routes.test.js`.

---

## 12. Deployment

### Vercel
1. Push to GitHub repository.
2. Create a Vercel project from the repo.
3. Add env vars: `MONGO_URI`, `JWT_SECRET`, `FRONTEND_URL`, `CRON_SECRET`, plus `NODE_ENV=production` (set automatically by `vercel.json`).
4. `vercel.json` routes all requests to `server.js` and schedules the cron jobs.

### Local Docker / Other
- Build a container from the Node base image.
- Set the env vars in your deployment platform.
- Ensure network access to MongoDB.
- In production, rely on external cron triggers (e.g. Vercel cron) rather than `ENABLE_LOCAL_SCHEDULER`.

---

## 13. Contributing
- Fork the project
- Create a feature branch (`feature/xxx`)
- Open a PR against `main`
- Keep commit messages clear

---

## 14. License
(Select or add your license)

`MIT`, `Apache 2.0`, or your preferred terms.
