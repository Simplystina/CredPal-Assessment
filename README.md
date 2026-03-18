# FX Trading App — Backend API

A production-ready NestJS backend for an FX Trading application supporting multi-currency wallets, real-time foreign exchange rates, and secure currency conversion and trading.

---

## Setup Instructions

### Prerequisites
- **Node.js** v18+
- **PostgreSQL** v14+ (running locally or via Docker)
- A free API key from [exchangerate-api.com](https://www.exchangerate-api.com/)
- A Gmail account with [App Password](https://support.google.com/accounts/answer/185833) enabled *(for OTP emails)*

### 1. Clone 

```
git clone <your-repo-url>
cd fx-trading-app
npm install
```

### 2. RUN INSTALL using npm
```
npm install
```
### 2. Configure Environment

```
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=yourpassword
DB_DATABASE=fx_trading_db

JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d

MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your_gmail@gmail.com
MAIL_PASS=your_gmail_app_password

FX_API_KEY=your_exchangerate_api_key
FX_API_BASE_URL=https://v6.exchangerate-api.com/v6

FX_CACHE_TTL=300
```

### 3. Create Database

```sql
CREATE DATABASE fx_trading_db;
```

### 4. Run the Application

```bash
# Development (auto-restarts on file changes)
npm run start:dev

# Production build
npm run build && npm run start:prod
```

The API is available at `http://localhost:3000/api`  
Swagger docs are at `http://localhost:3000/api/docs`

### 5. Run Tests

```bash
# All unit tests
npm test

# With coverage report
npm run test:cov
```

---

## 📡 API Documentation

Interactive Swagger documentation is available at **`/api/docs`** when the app is running.

### Endpoints Overview

| Method | Endpoint | Auth Required | Description |
|--------|----------|--------------|-------------|
| `POST` | `/api/auth/register` | ❌ | Register user, triggers OTP email |
| `POST` | `/api/auth/verify` | ❌ | Verify OTP, activate account |
| `POST` | `/api/auth/login` | ❌ | Login, returns JWT |
| `POST` | `/api/auth/resend-otp` | ❌ | Resend OTP to email |
| `GET` | `/api/wallet` | ✅ + Verified | Get all wallet balances |
| `POST` | `/api/wallet/fund` | ✅ + Verified | Fund wallet |
| `POST` | `/api/wallet/convert` | ✅ + Verified | Convert between currencies |
| `POST` | `/api/wallet/trade` | ✅ + Verified | Trade currencies (logged as TRADE) |
| `GET` | `/api/fx/rates` | ✅ | Get real-time FX rates |
| `GET` | `/api/transactions` | ✅ + Verified | Paginated transaction history |

### Example Flow

**1. Register**
```json
POST /api/auth/register
{ "email": "user@example.com", "password": "StrongPass1!" }
```

**2. Verify OTP** *(from email)*
```json
POST /api/auth/verify
{ "email": "user@example.com", "otp": "482916" }
```

**3. Login**
```json
POST /api/auth/login
{ "email": "user@example.com", "password": "StrongPass1!" }
// → { "accessToken": "eyJ..." }
```

**4. Fund Wallet** *(Bearer token required)*
```json
POST /api/wallet/fund
{ "currency": "NGN", "amount": 10000 }
```

**5. Convert NGN → USD**
```json
POST /api/wallet/convert
{ "fromCurrency": "NGN", "toCurrency": "USD", "amount": 1000 }
```

**6. View Transactions**
```
GET /api/transactions?page=1&limit=20&type=CONVERSION
```

---

## 🏗 Architectural Decisions

### Database: PostgreSQL
ACID compliance is essential for financial transactions. PostgreSQL's support for row-level locking and advisory locks makes it ideal for preventing race conditions in concurrent wallet operations.

### Multi-Currency Wallet Model
Each user-currency pair is stored as a separate `Wallet` row with a `(userId, currency)` unique constraint. This is simpler to query than a JSONB column, easier to lock at the row level, and trivially extensible to new currencies.

### Double-Spend Prevention
Wallet mutations (fund, convert, trade) run inside a **TypeORM `QueryRunner` transaction** with **pessimistic write locks** (`FOR UPDATE` in SQL) on the affected wallet rows. This prevents two concurrent requests from reading the same balance and both succeeding on insufficient funds.

```
BEGIN TRANSACTION
  SELECT * FROM wallets WHERE userId=? AND currency=? FOR UPDATE;  -- locks row
  -- check balance
  -- update balance
COMMIT
```

### FX Rate Caching
Rates are fetched from [exchangerate-api.com](https://www.exchangerate-api.com/) and cached **in-memory** for 5 minutes (configurable via `FX_CACHE_TTL`). On cache miss the API is called; on API failure a `503 Service Unavailable` is returned. This is safe because financial transactions should not proceed with potentially stale rates.

### Auth Design
- JWT tokens are stateless and validated per-request via Passport strategy.
- Two guards layer on top: `JwtAuthGuard` (validates token) and `VerifiedGuard` (checks `isVerified` flag).
- OTPs are 6 digits, expire in 10 minutes, and are single-use. Old OTPs are invalidated on resend.

### Separation of Conversion vs. Trade
Both `/wallet/convert` and `/wallet/trade` execute the same atomic currency swap. The distinction is the `TransactionType` field (`CONVERSION` vs `TRADE`) recorded in the transaction history for reporting/analytics granularity.

---

## Key Assumptions

1. **Initial balance is 0** — users fund their wallets explicitly.
2. **Funding is direct** — no payment gateway integration. Funding is treated as a direct credit (e.g., bank transfer confirmation received by another service).
3. **FX rates are one-directional** — rates are fetched with a base currency and the inverse is computed by the API. Cross-rates (e.g., EUR→GBP) go through the API's base conversion.
4. **No fractional OTP resend limit** — unlimited resends are allowed; each resend invalidates previous OTPs.
5. **`synchronize: true` in development** — TypeORM auto-creates tables from entities. **For production**, set `synchronize: false` and use TypeORM migrations.
6. **Email delivery is best-effort** — if the email provider fails during registration, the OTP is logged to console in non-production mode so development is not blocked.
7. 

---

## Tests

Unit tests cover the three most critical services:

| Test File | Coverage |
|-----------|----------|
| `auth/auth.service.spec.ts` | Registration, OTP verification, login edge cases |
| `wallet/wallet.service.spec.ts` | Fund, convert, trade, insufficient balance, missing wallet |
| `fx/fx.service.spec.ts` | Cache hit/miss, API failure, same-currency rate |

---

## Scalability Considerations

- **Horizontal scaling**: JWT is stateless, so multiple instances can run behind a load balancer with no session affinity.
- **Cache**: Replace in-memory cache with **Redis** (`@nestjs/cache-manager` + `cache-manager-redis-store`) for shared cache across instances.
- **Database connection pool**: TypeORM uses a connection pool by default. Tune `extra.max` for high-concurrency scenarios.
- **DB migrations**: Replace `synchronize: true` with TypeORM migration files for safe schema evolution in production.
- **Rate limiting**: The global `ThrottlerGuard` (100 req/min per IP) provides basic protection. Scale with Redis-backed throttler for distributed deployments.

---

## 💱 Supported Currencies

`NGN`, `USD`, `EUR`, `GBP`, `JPY`, `CAD`, `AUD`, `CHF`

New currencies can be added by updating the `SUPPORTED_CURRENCIES` array in `src/common/constants.ts`.
