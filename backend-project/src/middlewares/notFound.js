/**
 * Catches any request that didn't match a defined route
 * and forwards a 404 error to the centralized error handler.
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

export default notFound;
