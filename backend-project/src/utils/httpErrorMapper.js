/**
 * httpErrorMapper.js
 *
 * Maps the machine-readable error codes produced by our services
 * (youtubeValidator.js, transcript.service.js, gemini.service.js) to the
 * HTTP status code a controller should respond with.
 *
 * Kept as its own module (rather than inlined in a controller) so the
 * mapping is defined once, is reusable by any future route that consumes
 * these same services, and can be unit tested on its own.
 */

/**
 * code -> HTTP status.
 *
 * Grouping rationale:
 *  - 400 (Bad Request): the problem is with the input the client sent
 *    (a malformed URL, a badly-formed video ID).
 *  - 403 (Forbidden): the resource exists but access is not permitted
 *    (a private video).
 *  - 404 (Not Found): the resource doesn't exist (removed/invalid video).
 *  - 422 (Unprocessable Entity): the input was well-formed and the
 *    resource exists, but the request still can't be fulfilled (no
 *    captions available, an unexpectedly empty transcript).
 *  - 429 (Too Many Requests): the client should slow down and retry
 *    (rate-limited by an upstream API).
 *  - 500 (Internal Server Error): our server/configuration is at fault
 *    (missing API key, an upstream auth failure that isn't the caller's
 *    doing, or any error type we didn't anticipate).
 *  - 502 (Bad Gateway): an upstream service (YouTube, Gemini) failed,
 *    timed out, or returned something we couldn't use.
 */
const ERROR_CODE_TO_STATUS = Object.freeze({
  // --- utils/youtubeValidator.js ---
  EMPTY_URL: 400,
  INVALID_URL_FORMAT: 400,
  UNSUPPORTED_HOST: 400,
  MISSING_VIDEO_ID: 400,
  INVALID_VIDEO_ID_FORMAT: 400,

  // --- services/transcript.service.js ---
  INVALID_VIDEO_ID: 400,
  VIDEO_NOT_FOUND: 404,
  PRIVATE_VIDEO: 403,
  NO_TRANSCRIPT_AVAILABLE: 422,
  // NETWORK_ERROR is shared with gemini.service.js - defined once below.

  // --- services/gemini.service.js ---
  MISSING_API_KEY: 500,
  EMPTY_TRANSCRIPT: 422,
  AUTH_ERROR: 500,
  INVALID_REQUEST: 500,
  RATE_LIMITED: 429,
  SERVER_ERROR: 502,
  EMPTY_RESPONSE: 502,
  INVALID_RESPONSE_FORMAT: 502,

  // --- shared across services ---
  NETWORK_ERROR: 502,
  UNKNOWN_ERROR: 500,
});

/** Fallback status used for any error code not explicitly listed above. */
const DEFAULT_STATUS = 500;

/**
 * Looks up the HTTP status code that should be returned for a given
 * service error code. Unknown codes default to 500 rather than throwing,
 * so a new/unrecognized error code never crashes the response path -
 * it just degrades to a generic server error.
 *
 * @param {string} code  One of the *_ERROR_CODES values from a service module.
 * @returns {number}     An HTTP status code.
 */
export function mapErrorCodeToStatus(code) {
  return ERROR_CODE_TO_STATUS[code] ?? DEFAULT_STATUS;
}
