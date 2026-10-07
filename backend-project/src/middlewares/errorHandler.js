import env from '../config/env.js';

/**
 * Centralized error-handling middleware.
 * Any error passed via next(err) anywhere in the app ends up here.
 * Must be registered LAST, after all routes.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode && err.statusCode !== 200 ? err.statusCode : 500;

  console.error(`[Error] ${req.method} ${req.originalUrl} -> ${err.message}`);

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    // Only expose the stack trace in development for easier debugging
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

export default errorHandler;
