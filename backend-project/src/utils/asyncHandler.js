/**
 * asyncHandler.js
 *
 * Express 4 does not automatically catch rejected promises thrown inside
 * async route handlers - an unhandled rejection there would otherwise
 * either crash the process or silently hang the request. This wrapper
 * catches any rejection and forwards it to `next(err)`, so it always
 * reaches the centralized error handler (middlewares/errorHandler.js).
 *
 * Usage:
 *   router.post('/route', asyncHandler(myAsyncController));
 */

/**
 * Wraps an async Express request handler so any thrown/rejected error is
 * passed to `next()` instead of being lost.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void>} fn
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void}
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
