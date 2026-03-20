# Farmilky - Backend API Server 🥛

A modular and scalable REST API providing all backend capabilities for the Farmilky ecommerce platform.

- Node.js + Express API server
- MongoDB + Mongoose data layer
- JWT authentication with secure cookie strategy
- Cart, order, subscription, and invoice management
- background scheduler with `node-cron`

---

## Table of Contents
1. Overview
2. Tech Stack
3. Project Structure
4. Environment Setup
5. Running Locally
6. API Endpoints
7. Authentication Flow
8. Scheduler and Subscription Service
9. Testing
10. Deployment
11. Contributing
12. License

---

## 1. Overview
The backend service handles API requests from the frontend and manages core ecommerce features:

- user registration/login/logout
- product catalog
- cart operations (add/remove/update)
- order creation and retrieval
- subscription lifecycle
- invoice generation


## 2. Tech Stack
- Node.js
- Express.js
- MongoDB + Mongoose
- JWT + bcrypt for authentication
- dotenv for configuration
- cookie-parser, cors, and helmet for security
- node-cron for scheduled jobs

---

## 3. Project Structure

```text
backend/
├── config/
│   └── db.js               # MongoDB connection logic
├── controllers/            # Route handlers per domain
│   ├── cart.controller.js
│   ├── invoice.controller.js
│   ├── order.controller.js
│   ├── product.controller.js
│   ├── subscription.controller.js
│   └── user.controller.js
├── middleware/
│   ├── adminMiddleware.js
│   └── authMiddleware.js   # JWT protectRoute and role checks
├── models/                 # Mongoose schemas
├── routes/                 # Express routers
├── services/
│   └── scheduler.js        # daily subscription processor
├── server.js               # App initialization
├── package.json            # NPM scripts & dependencies
└── vercel.json             # Serverless route config
```

---

## 4. Environment Setup
Create `backend/.env` with values like:

```env
PORT=4000
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/farmilky?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_signing_key
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

**Important**: keep secrets out of Git. `.gitignore` should include `node_modules/`, `.env`, log files, and build output.

---

## 5. Running Locally

Install dependencies:
```bash
cd backend
npm install
```

Start in development mode (nodemon):
```bash
npm run start
```

Production run:
```bash
npm run build   # if build step exists
npm run serve
```

Check server at: `http://localhost:4000`

---

## 6. API Endpoints

### Auth
- `POST /api/users/register` - register new user
- `POST /api/users/login` - login and set cookie
- `POST /api/users/logout` - clear cookie
- `GET /api/users/profile` - get profile (authenticated)

### Products
- `GET /api/products` - list all products
- `GET /api/products/:id` - product details
- `POST /api/products` - add product (admin)
- `PATCH /api/products/:id` - update product (admin)
- `DELETE /api/products/:id` - remove product (admin)

### Cart
- `GET /api/cart` - get current user cart
- `POST /api/cart` - add or update cart item
- `DELETE /api/cart/:itemId` - remove item
- `DELETE /api/cart` - clear cart

### Orders
- `GET /api/orders` - list user orders
- `POST /api/orders` - place order from cart
- `GET /api/orders/:id` - order details

### Subscriptions
- `GET /api/subscriptions` - list subscriptions
- `POST /api/subscriptions` - create subscription
- `PATCH /api/subscriptions/:id` - update subscription
- `DELETE /api/subscriptions/:id` - cancel subscription

### Invoices
- `GET /api/invoices` - list invoices
- `GET /api/invoices/:id` - invoice details

---

## 7. Authentication Flow
- User provides email/password to login endpoint
- Server validates credentials and signs a JWT
- JWT stored in secure, HTTP-only cookie
- `authMiddleware` verifies JWT on protected routes
- `adminMiddleware` checks user role for restricted actions

---

## 8. Scheduler and Subscription Service
The `services/scheduler.js` file runs a daily cron job to:
- evaluate active subscriptions
- create new orders/invoices
- update next delivery dates
- notify users (if implemented)

Scheduler starts when server boots if `NODE_ENV` is not `test`.

---

## 9. Testing
Add tests with your preferred framework (Jest, Mocha, Supertest):

```bash
npm install --save-dev jest supertest
npm run test
```

> Existing project may not include tests yet. Add unit and integration tests for routes and controllers.

---

## 10. Deployment
### Vercel
1. Push to GitHub repository.
2. Create Vercel project from repo.
3. Add env vars: `MONGO_URI`, `JWT_SECRET`, `FRONTEND_URL`, `NODE_ENV=production`.
4. Vercel uses `vercel.json` for routing to `server.js`.

### Local Docker / Other
- Build container from Node base
- Set env vars in deployment platform
- Ensure network access to MongoDB

---

## 11. Contributing
- Fork project
- Create feature branch (`feature/xxx`)
- Open PR against `main`
- Keep commit messages clear

---

## 12. License
(Select or add your license) 

`MIT`, `Apache 2.0`, or your preferred terms.

