import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression'; // added for gzip compression
import userRoutes from './routes/authRoutes.js';
import patientRoutes from './routes/patientRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import medicineRoutes from './routes/medicineRoutes.js';
import prescriptionRoutes from './routes/prescriptionRoutes.js';
import labReportRoutes from './routes/labReportRoutes.js';
import medicalHistoryRoutes from './routes/medicalHistoryRoutes.js';
import bedRoutes from './routes/bedRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import activityLogRoutes from './routes/activityLogRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import qrShareRoutes from './routes/qrShareRoutes.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { validateEnv } from './config/env.js';

import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

dotenv.config();
validateEnv();

const isProduction = process.env.NODE_ENV === 'production';
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '1mb';

const normalizeOrigin = (url = '') => url.trim().replace(/\/+$/, '');

const getAllowedOrigins = () => {
  const configured = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  if (process.env.NODE_ENV === 'development') {
    return [
      ...new Set([
        ...configured,
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
      ]),
    ];
  }

  return [...new Set(configured)];
};

const allowedOrigins = getAllowedOrigins();

const readCookie = (cookieHeader = '', cookieName) => {
  if (!cookieHeader) return '';

  const targetPrefix = `${cookieName}=`;
  const cookie = cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(targetPrefix));

  if (!cookie) return '';

  const encodedValue = cookie.slice(targetPrefix.length);
  try {
    return decodeURIComponent(encodedValue);
  } catch {
    return encodedValue;
  }
};

const getSocketToken = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.startsWith('Bearer ')
      ? authToken.slice('Bearer '.length).trim()
      : authToken.trim();
  }

  return readCookie(socket.handshake.headers?.cookie || '', 'jwt');
};

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.includes(normalized)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

const onlineUserSocketCounts = new Map();

const emitOnlineUsers = () => {
  io.emit('online_users', Array.from(onlineUserSocketCounts.keys()));
};

const markUserOnline = (userId) => {
  const activeSockets = onlineUserSocketCounts.get(userId) || 0;
  onlineUserSocketCounts.set(userId, activeSockets + 1);
  emitOnlineUsers();
};

const markUserOffline = (userId) => {
  const activeSockets = onlineUserSocketCounts.get(userId) || 0;

  if (activeSockets <= 1) {
    onlineUserSocketCounts.delete(userId);
  } else {
    onlineUserSocketCounts.set(userId, activeSockets - 1);
  }

  emitOnlineUsers();
};

io.use((socket, next) => {
  try {
    const token = getSocketToken(socket);

    if (!token) {
      return next(new Error('Socket authentication failed'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = {
      userId: String(decoded.userId || ''),
      role: decoded.role || 'Patient',
    };

    if (!socket.user.userId) {
      return next(new Error('Socket authentication failed'));
    }

    next();
  } catch (error) {
    next(new Error('Socket authentication failed'));
  }
});

io.on('connection', (socket) => {
  const { userId, role } = socket.user;

  markUserOnline(userId);

  socket.join(userId);
  socket.join(role);

  if (role !== 'Patient') {
    socket.join('Staff');
  }

  socket.on('disconnect', () => {
    markUserOffline(userId);
    // console.log('Client disconnected');
  });
});

const redactSensitiveQueryParams = (url = '') =>
  url.replace(
    /([?&](?:token|jwt|access_token|refresh_token)=)[^&]*/gi,
    '$1[REDACTED]',
  );

morgan.token('safe-url', (req) =>
  redactSensitiveQueryParams(req.originalUrl || req.url),
);

const shouldSkipRequestLog = (req) => req.path === '/health';

// Middleware
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(compression()); // Compress all responses
app.use(
  helmet({
    hsts: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
  }),
);
app.set('trust proxy', 1); // Trust the first proxy (Render load balancer)
app.use(
  morgan(':method :safe-url :status :response-time ms - :res[content-length]', {
    skip: shouldSkipRequestLog,
  }),
);

// Make io accessible in routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.log(err));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/lab-reports', labReportRoutes);
app.use('/api/medical-history', medicalHistoryRoutes);
app.use('/api/beds', bedRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/qr-share', qrShareRoutes);

app.get('/health', (req, res) => {
  const dbReadyState = mongoose.connection.readyState;
  const dbStateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const dbStatus = dbStateMap[dbReadyState] || 'unknown';
  const healthy = dbReadyState === 1;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      status: dbStatus,
      readyState: dbReadyState,
    },
  });
});

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
