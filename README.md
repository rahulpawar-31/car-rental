# DriveEase — Car Rental Web App

A full-stack car rental platform where users can browse cars, make bookings, and pay online. Admins can manage the fleet, locations, users, and all bookings through a dedicated dashboard.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, Zustand, Axios, React Router v7 |
| Backend | Node.js, Express 4, MongoDB Atlas, Mongoose |
| Auth | JWT (access + refresh tokens), httpOnly cookies, OTP-based password reset |
| Payments | Razorpay (orders + webhooks) |
| Storage | Cloudinary (car images, avatars, documents) |
| Email | Nodemailer via Resend SMTP |

## Project Structure

```
car/
├── api/                  # Express backend (port 5000)
│   └── src/
│       ├── app.js        # Express app: middleware, routes (no .listen/DB connect)
│       ├── server.js     # Entry point: connects DB, then app.listen(...)
│       ├── config/       # DB, Cloudinary
│       ├── model/        # Mongoose schemas
│       ├── controllers/  # Route handlers
│       ├── routes/       # Express routers
│       ├── middleware/   # Auth, error handler, multer/Cloudinary upload
│       ├── utils/        # JWT, email, OTP, logger (Winston)
│       └── seed.js       # Seed script (cars, locations, users)
└── web/                  # React + Vite frontend (port 5173)
    └── src/
        ├── api/          # Axios client + domain helpers (cars, bookings, payments…)
        ├── store/        # Zustand auth store
        ├── components/   # Layout, Navbar, Footer, ProtectedRoute, UI components
        └── pages/        # Route-level pages (Home, Cars, CarDetail, Booking, Admin…)
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB on port `27017`)
- Cloudinary account
- Razorpay account (test keys work for development)
- Resend account (or any SMTP provider)

### 1. Configure environment variables

Create `api/.env` (never commit this file — see `api/.env.example`):

```env
# Server
NODE_ENV=development
PORT=5000

# Database
MONGO_URL=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/car_rental

# JWT
JWT_SECRET=<random string, min 32 chars>
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=<different random string, min 32 chars>
JWT_REFRESH_EXPIRES_IN=30d

# Frontend URL (used in CORS and email links)
FRONTEND_URL=http://localhost:5173

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Razorpay
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# Email — Resend SMTP
EMAIL_HOST=smtp.resend.com
EMAIL_PORT=587
EMAIL_USER=resend
EMAIL_PASSWORD=<resend_api_key>
EMAIL_FROM=onboarding@resend.dev

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

### 2. Seed the database (optional)

Populates cars, locations, and demo users (1 admin + 3 regular users):

```bash
cd api
npm install
npm run seed
```

Seed credentials:

| Role | Email | Password |
|---|---|---|
| Admin | admin@driveease.com | admin123 |
| User | rahul@example.com | password123 |

### 3. Start the backend

```bash
cd api
npm run dev     # nodemon watches src/ and auto-restarts
```

Backend runs at **http://localhost:5000**. Health check: `GET /api/health`

### 4. Start the frontend

```bash
cd web
npm install
npm run dev     # Vite dev server with HMR
```

Frontend runs at **http://localhost:5173**. All `/api/*` requests are proxied to the backend by Vite.

### Production build (frontend)

```bash
cd web
npm run build      # outputs to web/dist/
npm run preview    # serve the production build locally
```

## Pages & Routes

| Path | Access | Description |
|---|---|---|
| `/` | Public | Redirects to `/login` or `/home` |
| `/login` | Public | Login page |
| `/register` | Public | Registration page |
| `/forgot-password` | Public | OTP-based password reset |
| `/home` | Public | Landing page with featured cars |
| `/cars` | Public | Car listing with filters & search |
| `/cars/:id` | Public | Car detail, gallery, reviews, availability |
| `/locations` | Public | Branch locations |
| `/about` | Public | About page |
| `/contact` | Public | Contact form |
| `/dashboard` | Auth | Booking history, cancellations |
| `/profile` | Auth | Profile settings, avatar & license upload |
| `/booking/:carId` | Auth | Booking form (dates, location, coupon) |
| `/payment/:bookingId` | Auth | Razorpay payment page |
| `/bookings/:id` | Auth | Booking detail |
| `/admin` | Admin | Admin dashboard |

## Features

### User
- Browse and search cars with filters (type, brand, transmission, fuel type, price range)
- View car detail: image gallery, specs, ratings, and user reviews
- Check availability by date range
- Book a car with pickup/drop location selection and coupon codes
- Pay securely via Razorpay (test & live mode)
- Dashboard with booking history and cancellation
- Profile management with avatar and driving licence upload
- OTP email for password reset

### Admin
- Dashboard stats (revenue, bookings, fleet overview)
- Manage cars: create, edit, upload images to Cloudinary, toggle availability/featured
- Manage locations, coupons, and users
- View and update all bookings and payments
- Issue refunds

## API Overview

Base path: `/api/v1`

| Resource | Base Route |
|---|---|
| Auth | `/auth` |
| Cars | `/cars` |
| Bookings | `/bookings` |
| Payments | `/payments` |
| Reviews | `/reviews` |
| Locations | `/locations` |
| Users | `/users` |
| Admin | `/admin` |
| Contact | `/contact` |

## Authentication Flow

1. Login/Register returns an access token (JSON body) and sets an httpOnly refresh token cookie.
2. The Axios client attaches `Authorization: Bearer <token>` to every request.
3. On a `401`, the client silently POSTs to `/auth/refresh-token` (cookie sent automatically) and retries the original request with the new token.
4. Zustand persists the access token and user object to survive page refreshes.

## Booking & Payment Flow

```
Browse Cars → Car Detail → Check Availability
  → Booking form (dates, pickup/drop location, coupon)
    → POST /bookings → booking created with price breakdown
      (base rate − coupon discount + 18% GST + security deposit)
        → Payment page
          → POST /payments/create-intent → Razorpay order ID
            → Razorpay checkout (client-side)
              → POST /payments/confirm → signature verified → booking confirmed
                → Confirmation email sent via Resend
```

The base rate depends on rental type, chosen on the booking form:

| Rental type | Base rate |
|---|---|
| Daily (`day`) | `car.pricePerDay × totalDays` (minimum 1 day) |
| Hourly (`hour`) | `car.pricePerHour × totalHours` (falls back to `pricePerDay / 8` if a car has no hourly rate set) |
| Airport transfer (`airport`) | flat `car.pricePerDay × 0.4`, capped at 24 hours |

A coupon discount (percentage or flat, both capped so the discount can never exceed the base rate) is applied before GST. All pricing math lives in one place — `api/src/services/booking.quote.js` — shared by booking creation, rescheduling, and the coupon-preview endpoint, so a preview always matches what you're actually charged.

## Image Upload Flow

Car images and profile avatars are uploaded directly to Cloudinary via the backend:

- `POST /api/v1/cars/:id/images` — upload car images (`multipart/form-data`, field: `images[]`)
- `PATCH /api/v1/users/avatar` — upload profile avatar (field: `avatar`)
- `POST /api/v1/cars/:id/documents/:type` — upload car documents (insurance, registration, pollution)

Files are stored in Cloudinary folders `car-rental/cars`, `car-rental/profiles`, and `car-rental/documents` respectively. A `1200×800` fill transformation is applied to car images automatically.
