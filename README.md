# 🏥 MedCare Suite — Hospital Management System

<p align="center">
  <strong>Modern full-stack hospital operations platform</strong><br/>
  Appointments • EHR • Billing • Lab Reports • Pharmacy • Beds • Chat • Notifications
</p>

<p align="center">
  <img alt="Frontend" src="https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=000" />
  <img alt="Backend" src="https://img.shields.io/badge/Backend-Node%20%2B%20Express-3C873A?style=for-the-badge&logo=node.js&logoColor=fff" />
  <img alt="Database" src="https://img.shields.io/badge/Database-MongoDB-10AA50?style=for-the-badge&logo=mongodb&logoColor=fff" />
  <img alt="Realtime" src="https://img.shields.io/badge/Realtime-Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=fff" />
  <img alt="Styling" src="https://img.shields.io/badge/UI-TailwindCSS-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=fff" />
</p>

---

## ✨ What this project does

This system manages end-to-end hospital workflows for multiple roles:

- 👨‍⚕️ **Doctor**: appointments, prescriptions, lab orders/reports
- 🧑‍💼 **Receptionist**: patient onboarding, scheduling, invoicing
- 💊 **Pharmacist**: inventory, medicine sales, stock alerts
- 🛏️ **Admin**: bed management, reports, activity monitoring
- 🧑 **Patient**: appointments, records, bills, notifications, chat

It includes role-aware access, secure authentication, real-time updates, and production-oriented hardening.

---

## 🔥 Core highlights

- 🔐 JWT auth with cookie + bearer support
- 🧭 Role-based route protection (frontend + backend)
- 💬 Real-time messaging & notification counters (Socket.IO)
- 📄 Billing + invoice lifecycle (paid/unpaid)
- 🧪 Lab reports workflow (ordered → in progress → completed)
- 📚 Medical history, prescriptions, and visit records
- 🛏️ Bed assignment/discharge with integrated billing
- 🌗 Modern dark mode + responsive patient-first UX
- 📱 Mobile enhancements for patient dashboards, chat, settings, and lab reports

---

## 🧱 Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 18, Vite, React Router, Axios, Framer Motion, TailwindCSS, Toastify |
| Backend | Node.js, Express, Mongoose, JWT, Helmet, CORS, Morgan, Compression |
| Realtime | Socket.IO (server + client) |
| Media | Multer + Cloudinary |
| Security | express-rate-limit, express-validator, role auth guards |
| DevOps | GitHub Actions CI (backend smoke + frontend build) |

---

## 📁 Project structure

```text
Hospital-manegment/
├── backend/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   ├── config/
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   └── utils/
│   └── vite.config.js
├── docs/
│   ├── ROLE_ACCESS_MATRIX.md
│   └── SECURITY_VERIFICATION_CHECKLIST.md
└── .github/workflows/ci.yml
```

---

## 🚀 Local setup

### 1) Clone & install

```bash
git clone <your-repo-url>
cd Hospital-manegment
```

Install dependencies in both apps:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2) Backend env

Create `backend/.env` from `backend/.env.example`.

```env
PORT=5000
MONGO_URI=...
JWT_SECRET=...
JWT_EXPIRES_IN=7d
JWT_COOKIE_MAX_AGE_MS=604800000
ADMIN_SECRET_KEY=...
NODE_ENV=development
REQUEST_BODY_LIMIT=1mb
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
FRONTEND_URL=http://localhost:5173
QR_PUBLIC_BASE_URL=http://localhost:5173
QR_TOKEN_TTL_MINUTES=15
```

### 3) Frontend env

Create `frontend/.env` from `frontend/.env.example`.

```env
VITE_API_URL=http://localhost:5000
VITE_DEV_PROXY_TARGET=http://localhost:5000
VITE_API_TIMEOUT_MS=10000
```

> ⚠️ Important: `VITE_API_URL` should be base URL only (no `/api` suffix).

### 4) Run

```bash
# Terminal 1
cd backend
npm start

# Terminal 2
cd frontend
npm run dev
```

---

## 🌍 Deployment notes

### Frontend (Vercel/Netlify/etc.)

Set:

- `VITE_API_URL=https://your-backend-domain`
- `VITE_API_TIMEOUT_MS=10000`

`VITE_DEV_PROXY_TARGET` is only useful for local Vite dev proxy and can be skipped in production.

### Backend (Render/Railway/etc.)

Ensure:

- `FRONTEND_URL` includes your deployed frontend domain(s)
- `MONGO_URI`, `JWT_SECRET`, Cloudinary keys are correctly set

---

## 🔒 Security & access control

Go-live docs:

- 📘 [`docs/ROLE_ACCESS_MATRIX.md`](docs/ROLE_ACCESS_MATRIX.md)
- ✅ [`docs/SECURITY_VERIFICATION_CHECKLIST.md`](docs/SECURITY_VERIFICATION_CHECKLIST.md)

Recommended before production:

- Validate all role/route permissions
- Test unauthorized and self-scope access paths
- Verify health check and CI pass status

---

## 🧪 Available scripts

### Backend

- `npm start` — start API server

### Frontend

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run preview` — preview production build
- `npm run lint` — lint frontend code

---

## 📡 API route groups (high-level)

- `/api/users` — auth/profile
- `/api/patients` — patient management
- `/api/doctors` — doctor management
- `/api/appointments` — scheduling
- `/api/invoices` — billing
- `/api/medicines` — pharmacy inventory
- `/api/prescriptions` — prescription lifecycle
- `/api/lab-reports` — lab workflow
- `/api/medical-history` — EHR history
- `/api/beds` — bed operations
- `/api/notifications` — notification center
- `/api/chat` — messaging
- `/api/qr-share` — tokenized QR sharing

---

## 🤝 Contributing

1. Create a feature branch
2. Keep changes focused and testable
3. Run frontend build before PR
4. Follow role/security docs while adding endpoints

---

## 📄 License

ISC

---

<p align="center">
  Made with ❤️ for better patient care and smoother hospital operations.
</p>
