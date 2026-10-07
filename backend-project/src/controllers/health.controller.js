/**
 * Returns basic service health/status info.
 * Useful for load balancers, uptime monitors, and container orchestrators
 * (e.g. Docker HEALTHCHECK, Kubernetes liveness/readiness probes).
 */
export const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
};
