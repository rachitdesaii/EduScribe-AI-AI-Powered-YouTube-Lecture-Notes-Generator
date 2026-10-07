import dotenv from 'dotenv';

// Load environment variables from .env file into process.env
dotenv.config();

/**
 * Centralized, validated access to environment variables.
 * Import this object anywhere instead of touching process.env directly,
 * so there is a single source of truth and sane defaults.
 */
const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Google Gemini API
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
};

export default env;
