import express from 'express';
import cors from 'cors';
import corsOptions from './config/cors.js';
import routes from './routes/index.js';
import notFound from './middlewares/notFound.js';
import errorHandler from './middlewares/errorHandler.js';

const app = express();

// ---- Global middlewares ----
app.use(cors(corsOptions));           // Enable CORS with configured options
app.use(express.json({ limit: '10mb' }));              // Parse JSON request bodies (supports multi-hour transcripts)
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// ---- Root route ----
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to the API',
  });
});

// ---- API routes ----
app.use('/api', routes);

// ---- 404 handler (must come after all valid routes) ----
app.use(notFound);

// ---- Centralized error handler (must be last) ----
app.use(errorHandler);

export default app;
