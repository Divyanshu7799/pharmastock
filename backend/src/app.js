const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
}));

app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

// 404 Handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Resource not found',
  });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error',
  });
});

module.exports = app;
