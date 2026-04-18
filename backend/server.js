import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression'; // added for gzip compression
import jwt from 'jsonwebtoken';
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
import User from './models/User.js';

import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

const normalizeOrigin = (url = '') => url.trim().replace(/\/+$/, '');

const getAllowedOrigins = () => {
  const configured = (process.env.FRONTEND_URL || 'http://localhost:5173')
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

const activeUserSockets = new Map();

const markUserOnline = (userId, socketId) => {
  if (!userId || !socketId) {
    return;
  }

  const existingSockets = activeUserSockets.get(userId) || new Set();
  existingSockets.add(socketId);
  activeUserSockets.set(userId, existingSockets);
};

const markUserOffline = (userId, socketId) => {
  if (!userId || !socketId) {
    return;
  }

  const existingSockets = activeUserSockets.get(userId);
  if (!existingSockets) {
    return;
  }

  existingSockets.delete(socketId);
  if (existingSockets.size === 0) {
    activeUserSockets.delete(userId);
  }
};

const emitOnlineUsers = () => {
  io.emit('online_users', Array.from(activeUserSockets.keys()));
};

const parseCookies = (cookieHeader = '') => {
  if (typeof cookieHeader !== 'string' || !cookieHeader.trim()) {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    const key = String(rawKey || '').trim();

    if (!key) {
      return acc;
    }

    const value = rawValue.join('=');
    try {
      acc[key] = decodeURIComponent(value);
    } catch {
      acc[key] = value;
    }

    return acc;
  }, {});
};

const getSocketToken = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.startsWith('Bearer ')
      ? authToken.slice(7).trim()
      : authToken.trim();
  }

  const authHeader = socket.handshake.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const cookies = parseCookies(socket.handshake.headers?.cookie);
  return String(cookies.jwt || '').trim();
};

const normalizeRoomName = (value) => String(value || '').trim();

io.use(async (socket, next) => {
  try {
    const token = getSocketToken(socket);

    if (!token) {
      next(new Error('Authentication error: token missing'));
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('_id role').lean();

    if (!user) {
      next(new Error('Authentication error: user not found'));
      return;
    }

    socket.data.userId = String(user._id);
    socket.data.userRole = normalizeRoomName(user.role);

    next();
  } catch {
    next(new Error('Authentication error: invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = normalizeRoomName(socket.data.userId);
  const userRole = normalizeRoomName(socket.data.userRole);

  if (userId) {
    // legacy room support (raw userId)
    socket.join(userId);
    // canonical room support
    socket.join(`user:${userId}`);
  }

  if (userRole) {
    // legacy room support (raw role)
    socket.join(userRole);
    // canonical room support
    socket.join(`role:${userRole}`);
  }

  if (userId) {
    markUserOnline(userId, socket.id);
    emitOnlineUsers();
  }

  socket.on('join_room', (requestedRoom) => {
    const room = normalizeRoomName(requestedRoom);
    if (!room || !userId) {
      return;
    }

    const allowedRooms = new Set([userId, `user:${userId}`]);
    if (allowedRooms.has(room)) {
      socket.join(room);
    }
  });

  socket.on('disconnect', () => {
    if (userId) {
      markUserOffline(userId, socket.id);
      emitOnlineUsers();
    }
  });
});

// Middleware
app.use(express.json());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(compression()); // Compress all responses
app.use(helmet());
app.set('trust proxy', 1); // Trust the first proxy (Render load balancer)

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
