import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { createRouter } from './routes/index.js';
import { expressErrorHandler } from './middlewares/errorHandler.js';
import { httpStatusCode } from './utils/errors.js';

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: env.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing (1 MB limit)
app.use(express.json({ limit: '1mb' }));

// Routes
app.use(createRouter());

// 404 — no route matched
app.use((req, res) => {
  const status = 404;
  res.status(status).json({
    error: { status, code: httpStatusCode(status), message: `Cannot ${req.method} ${req.path}` },
  });
});

// Global error handler (must be last and have exactly 4 params)
app.use(expressErrorHandler);

export { app };
