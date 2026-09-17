require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const batchRoutes = require('./routes/batchRoutes');
const alertRoutes = require('./routes/alertRoutes');
const dispensingRoutes = require('./routes/dispensingRoutes');
const clockController = require('./controllers/clockController');
const notificationController = require('./controllers/notificationController');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middleware - Strict CORS configuration for frontend
const allowedOrigin = (process.env.CORS_ORIGIN || 'http://localhost:5173').trim();
const corsOptions = {
  origin: allowedOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());

// Health Check Endpoint (Public)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

// Twist 1 (T2): Simulated Daily Maintenance Automation Endpoint
app.post('/clock', clockController.processClock);
app.post('/api/clock', clockController.processClock);

// Level 3 / T1: Outbox Inspection Endpoint
app.get('/outbox', notificationController.getOutbox);
app.get('/api/outbox', notificationController.getOutbox);

// Mount Feature API Routes
app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api', dispensingRoutes);

// 404 Handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Resource not found',
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
