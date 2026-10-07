/**
 * youtubeValidator.js
 *
 * Reusable utilities for validating YouTube URLs and extracting the
 * 11-character video ID from them.
 *
 * Supported URL shapes (http or https, with or without "www."/"m."):
 *   - https://youtu.be/VIDEO_ID
 *   - https://youtube.com/watch?v=VIDEO_ID
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://m.youtube.com/watch?v=VIDEO_ID
 *   - https://www.youtube.com/embed/VIDEO_ID
 *   - https://www.youtube.com/v/VIDEO_ID
 *   - https://www.youtube.com/shorts/VIDEO_ID
 *   - https://www.youtube.com/live/VIDEO_ID
 *   - https://www.youtube-nocookie.com/embed/VIDEO_ID
 *   - Any of the above with extra query params (&t=10s, &list=..., ?si=...)
 *   - URLs missing a protocol (e.g. "www.youtube.com/watch?v=VIDEO_ID")
 */

/** Machine-readable error codes returned by validateYouTubeUrl(). */
export const YOUTUBE_ERROR_CODES = Object.freeze({
  EMPTY_URL: 'EMPTY_URL',
  INVALID_URL_FORMAT: 'INVALID_URL_FORMAT',
  UNSUPPORTED_HOST: 'UNSUPPORTED_HOST',
  MISSING_VIDEO_ID: 'MISSING_VIDEO_ID',
  INVALID_VIDEO_ID_FORMAT: 'INVALID_VIDEO_ID_FORMAT',
});

/** Hostnames (after stripping "www."/"m.") accepted as YouTube. */
const ALLOWED_HOSTS = new Set(['youtube.com', 'youtu.be', 'youtube-nocookie.com']);

/** A valid YouTube video ID is exactly 11 URL-safe base64-ish characters. */
export const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/** Path prefixes on youtube.com that are followed by "/VIDEO_ID". */
const PATH_PREFIXES_WITH_ID = ['/embed/', '/v/', '/shorts/', '/live/'];

/**
 * Custom error thrown by extractYouTubeVideoId() so callers can
 * distinguish validation failures from unrelated runtime errors.
 */
export class YouTubeValidationError extends Error {
  /**
   * @param {string} message  Human-readable error message.
   * @param {string} code     One of YOUTUBE_ERROR_CODES.
   */
  constructor(message, code) {
    super(message);
    this.name = 'YouTubeValidationError';
    this.code = code;
  }
}

/**
 * Normalizes a hostname by stripping a leading "www." or "m." subdomain.
 * @param {string} hostname
 * @returns {string}
 */
function normalizeHost(hostname) {
  return hostname.replace(/^(www\.|m\.)/i, '').toLowerCase();
}

/**
 * Parses a raw string into a URL object, tolerating missing protocols
 * (e.g. "www.youtube.com/watch?v=xxxxx" instead of "https://...").
 *
 * @param {string} rawUrl
 * @returns {URL}
 * @throws {YouTubeValidationError} INVALID_URL_FORMAT if it can't be parsed.
 */
function parseUrl(rawUrl) {
  const candidate = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    return new URL(candidate);
  } catch {
    throw new YouTubeValidationError(
      `"${rawUrl}" is not a valid URL.`,
      YOUTUBE_ERROR_CODES.INVALID_URL_FORMAT
    );
  }
}

/**
 * Extracts the raw (unvalidated) video ID candidate from a parsed URL,
 * based on which YouTube host/path pattern it matches.
 *
 * @param {URL} url
 * @returns {string | null} The candidate ID, or null if the URL shape
 *                          doesn't carry a video ID at all (e.g. a channel
 *                          or playlist page).
 */
function extractCandidateId(url) {
  const host = normalizeHost(url.hostname);

  if (host === 'youtu.be') {
    // https://youtu.be/VIDEO_ID
    const [, id] = url.pathname.split('/');
    return id || null;
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    // https://youtube.com/watch?v=VIDEO_ID
    if (url.pathname === '/watch') {
      return url.searchParams.get('v');
    }

    // https://youtube.com/embed|v|shorts|live/VIDEO_ID
    const matchedPrefix = PATH_PREFIXES_WITH_ID.find((prefix) => url.pathname.startsWith(prefix));
    if (matchedPrefix) {
      return url.pathname.slice(matchedPrefix.length).split('/')[0] || null;
    }

    return null;
  }

  return null;
}

/**
 * Validates a YouTube URL and extracts its video ID, throwing on failure.
 *
 * @param {string} rawUrl
 * @returns {string} The 11-character YouTube video ID.
 * @throws {YouTubeValidationError}
 */
export function extractYouTubeVideoId(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    throw new YouTubeValidationError('URL is required and cannot be empty.', YOUTUBE_ERROR_CODES.EMPTY_URL);
  }

  const url = parseUrl(rawUrl.trim());
  const host = normalizeHost(url.hostname);

  if (!ALLOWED_HOSTS.has(host)) {
    throw new YouTubeValidationError(
      `"${url.hostname}" is not a recognized YouTube domain.`,
      YOUTUBE_ERROR_CODES.UNSUPPORTED_HOST
    );
  }

  const candidateId = extractCandidateId(url);

  if (!candidateId) {
    throw new YouTubeValidationError(
      'No video ID could be found in this YouTube URL.',
      YOUTUBE_ERROR_CODES.MISSING_VIDEO_ID
    );
  }

  if (!VIDEO_ID_PATTERN.test(candidateId)) {
    throw new YouTubeValidationError(
      `"${candidateId}" is not a valid YouTube video ID.`,
      YOUTUBE_ERROR_CODES.INVALID_VIDEO_ID_FORMAT
    );
  }

  return candidateId;
}

/**
 * Non-throwing convenience wrapper around extractYouTubeVideoId(), suitable
 * for use in Express controllers/middleware without try/catch boilerplate.
 *
 * @param {string} rawUrl
 * @returns {{ valid: true, videoId: string } | { valid: false, error: { code: string, message: string } }}
 */
export function validateYouTubeUrl(rawUrl) {
  try {
    const videoId = extractYouTubeVideoId(rawUrl);
    return { valid: true, videoId };
  } catch (err) {
    if (err instanceof YouTubeValidationError) {
      return { valid: false, error: { code: err.code, message: err.message } };
    }
    throw err;
  }
}

/**
 * Boolean-only convenience check for whether a string is a valid,
 * supported YouTube URL.
 *
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isValidYouTubeUrl(rawUrl) {
  return validateYouTubeUrl(rawUrl).valid;
}
