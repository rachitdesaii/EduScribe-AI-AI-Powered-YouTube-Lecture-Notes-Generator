/**
 * transcript.service.js
 *
 * Reusable service for fetching the full transcript/captions of a YouTube
 * video, given its 11-character video ID.
 *
 * Design notes:
 *  - This module does NOT call Gemini or any other AI/summarization API.
 *    It only retrieves the raw transcript text. That is intentionally
 *    left for a later module.
 *  - YouTube has no official public API for fetching caption text without
 *    OAuth + owner permission, so this service uses two lightweight,
 *    unauthenticated HTTP calls under the hood:
 *      1. YouTube's public "oEmbed" endpoint, used purely as a fast,
 *         reliable way to tell apart "video doesn't exist" from
 *         "video exists but is private" before we try to fetch captions.
 *      2. The `youtube-transcript` npm package, which fetches the
 *         caption track YouTube itself serves to the video player.
 *  - Every network call goes through a timeout wrapper so a slow/stuck
 *    connection is reported as a NETWORK_ERROR instead of hanging forever.
 *  - All dependencies (fetch, the transcript-fetching function, timeout)
 *    are injectable via the `deps` parameter so this service can be unit
 *    tested without making real HTTP calls.
 */

import { YoutubeTranscript } from 'youtube-transcript';
import { VIDEO_ID_PATTERN } from '../utils/youtubeValidator.js';

/** Machine-readable error codes this service can return. */
export const TRANSCRIPT_ERROR_CODES = Object.freeze({
  INVALID_VIDEO_ID: 'INVALID_VIDEO_ID',
  VIDEO_NOT_FOUND: 'VIDEO_NOT_FOUND',
  PRIVATE_VIDEO: 'PRIVATE_VIDEO',
  NO_TRANSCRIPT_AVAILABLE: 'NO_TRANSCRIPT_AVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
});

/** Default timeout (ms) applied to every outbound HTTP request (generous for long videos). */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Custom error type thrown by this service so callers can branch on
 * `error.code` instead of parsing error message strings.
 */
export class TranscriptServiceError extends Error {
  /**
   * @param {string} message   Human-readable description.
   * @param {string} code      One of TRANSCRIPT_ERROR_CODES.
   * @param {string} [videoId] The video ID this error relates to, if known.
   * @param {unknown} [cause]  The original underlying error, if any.
   */
  constructor(message, code, videoId, cause) {
    super(message);
    this.name = 'TranscriptServiceError';
    this.code = code;
    this.videoId = videoId;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Wraps a fetch-compatible function so any single call that takes longer
 * than `timeoutMs` is aborted and reported as a timeout, instead of
 * hanging indefinitely.
 *
 * @param {typeof fetch} fetchImpl  The fetch function to wrap.
 * @param {number} timeoutMs        Timeout in milliseconds.
 * @returns {typeof fetch}          A fetch function with the same signature.
 */
function withTimeout(fetchImpl, timeoutMs) {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Races a promise-returning function against a timeout, rejecting with an
 * AbortError-shaped error if the timeout wins. Used instead of injecting
 * our own fetch implementation into the `youtube-transcript` library,
 * because that library makes multiple sequential internal fetch calls
 * (with its own fallback/retry logic) that we don't want to interfere
 * with - wrapping the *outer* call is simpler and safer than trying to
 * control every internal request it makes.
 *
 * @param {() => Promise<T>} fn
 * @param {number} timeoutMs
 * @returns {Promise<T>}
 */
function runWithTimeout(fn, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Operation timed out after ${timeoutMs}ms`);
      err.name = 'AbortError';
      reject(err);
    }, timeoutMs);

    fn().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Validates that a string looks like a real YouTube video ID
 * (exactly 11 URL-safe characters). This does NOT check whether the
 * video actually exists — only that the ID is well-formed.
 *
 * @param {string} videoId
 * @throws {TranscriptServiceError} INVALID_VIDEO_ID if the format is wrong.
 */
function assertValidVideoIdFormat(videoId) {
  if (typeof videoId !== 'string' || !VIDEO_ID_PATTERN.test(videoId.trim())) {
    throw new TranscriptServiceError(
      `"${videoId}" is not a valid YouTube video ID (expected 11 URL-safe characters).`,
      TRANSCRIPT_ERROR_CODES.INVALID_VIDEO_ID,
      videoId
    );
  }
}

/**
 * Checks whether a video exists and is publicly accessible, using
 * YouTube's public oEmbed endpoint (no API key required). This lets us
 * distinguish a genuinely nonexistent/invalid video from a private one
 * *before* attempting to fetch captions, which the transcript-fetching
 * library alone cannot tell apart.
 *
 * Behavior relied upon (best-effort, since YouTube does not formally
 * document oEmbed status codes as a stable contract):
 *   - 200 OK              -> video exists and is publicly viewable.
 *   - 401 / 403            -> video exists but is private/restricted.
 *   - 404                  -> video does not exist / ID is invalid.
 *   - other non-OK status  -> treated as VIDEO_NOT_FOUND (safe default).
 *
 * @param {string} videoId
 * @param {typeof fetch} fetchImpl  Injectable fetch implementation.
 * @throws {TranscriptServiceError} PRIVATE_VIDEO, VIDEO_NOT_FOUND, or NETWORK_ERROR.
 */
async function assertVideoIsPubliclyAccessible(videoId, fetchImpl) {
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;

  let response;
  try {
    response = await fetchImpl(oEmbedUrl);
  } catch (err) {
    throw toNetworkError(err, videoId);
  }

  if (response.ok) {
    return; // Video exists and is public - safe to continue.
  }

  if (response.status === 401 || response.status === 403) {
    throw new TranscriptServiceError(
      `Video "${videoId}" is private or otherwise restricted and cannot be accessed.`,
      TRANSCRIPT_ERROR_CODES.PRIVATE_VIDEO,
      videoId
    );
  }

  if (response.status === 404) {
    throw new TranscriptServiceError(
      `Video "${videoId}" does not exist or has been removed.`,
      TRANSCRIPT_ERROR_CODES.VIDEO_NOT_FOUND,
      videoId
    );
  }

  // Any other unexpected status (5xx, rate limiting, etc.) - fail closed
  // as "not found" rather than guessing further.
  throw new TranscriptServiceError(
    `Could not verify video "${videoId}" (YouTube returned status ${response.status}).`,
    TRANSCRIPT_ERROR_CODES.VIDEO_NOT_FOUND,
    videoId
  );
}

/**
 * Converts a low-level fetch/network failure (DNS error, connection
 * refused, aborted/timed-out request, etc.) into a TranscriptServiceError
 * with the NETWORK_ERROR code.
 *
 * @param {unknown} err
 * @param {string} videoId
 * @returns {TranscriptServiceError}
 */
function toNetworkError(err, videoId) {
  const isAbort = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
  const message = isAbort
    ? `Request timed out while contacting YouTube for video "${videoId}".`
    : `A network error occurred while contacting YouTube for video "${videoId}".`;
  return new TranscriptServiceError(message, TRANSCRIPT_ERROR_CODES.NETWORK_ERROR, videoId, err);
}

/**
 * Maps an error thrown by the `youtube-transcript` library into our own
 * TranscriptServiceError, based on the library's error class/message.
 * The library itself doesn't expose distinct classes we can `instanceof`
 * against reliably across versions, so we branch on the constructor name
 * and message content, which are stable enough for this purpose.
 *
 * @param {unknown} err
 * @param {string} videoId
 * @returns {TranscriptServiceError}
 */
function mapLibraryError(err, videoId) {
  const name = err && err.name;
  const message = (err && err.message) || '';

  // Fetch-level failures (DNS, connection reset, aborted/timeout) bubble
  // up as generic TypeError/AbortError from the underlying fetch call.
  if (err instanceof TypeError || name === 'AbortError') {
    return toNetworkError(err, videoId);
  }

  if (name === 'YoutubeTranscriptTooManyRequestError') {
    // YouTube is throttling/CAPTCHA-gating this IP - treat as a
    // network/availability problem rather than a video-content problem.
    return new TranscriptServiceError(
      'YouTube is temporarily rate-limiting transcript requests. Please try again later.',
      TRANSCRIPT_ERROR_CODES.NETWORK_ERROR,
      videoId,
      err
    );
  }

  if (name === 'YoutubeTranscriptVideoUnavailableError') {
    // We already checked availability via oEmbed before reaching this
    // point, so this is a rare edge case (e.g. region lock). Report it
    // as "not found" since we can't access the video's content either way.
    return new TranscriptServiceError(
      `Video "${videoId}" is unavailable.`,
      TRANSCRIPT_ERROR_CODES.VIDEO_NOT_FOUND,
      videoId,
      err
    );
  }

  if (name === 'YoutubeTranscriptDisabledError' || name === 'YoutubeTranscriptNotAvailableError') {
    return new TranscriptServiceError(
      `No transcript is available for video "${videoId}".`,
      TRANSCRIPT_ERROR_CODES.NO_TRANSCRIPT_AVAILABLE,
      videoId,
      err
    );
  }

  if (name === 'YoutubeTranscriptNotAvailableLanguageError') {
    return new TranscriptServiceError(
      `No transcript is available in the requested language for video "${videoId}".`,
      TRANSCRIPT_ERROR_CODES.NO_TRANSCRIPT_AVAILABLE,
      videoId,
      err
    );
  }

  // Anything else is unexpected - surface it without pretending to know
  // exactly what went wrong.
  return new TranscriptServiceError(
    message || `An unknown error occurred while fetching the transcript for video "${videoId}".`,
    TRANSCRIPT_ERROR_CODES.UNKNOWN_ERROR,
    videoId,
    err
  );
}

/**
 * Joins individual transcript segments into a single, readable block of
 * plain text (used for the `fullText` field of the result).
 *
 * @param {Array<{ text: string }>} segments
 * @returns {string}
 */
function buildFullText(segments) {
  return segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetches the complete transcript for a YouTube video.
 *
 * @param {string} videoId
 *   The 11-character YouTube video ID (NOT a full URL - use
 *   extractYouTubeVideoId() from youtubeValidator.js first if you only
 *   have a URL).
 * @param {object} [options]
 * @param {string} [options.lang]
 *   Optional ISO language code to request a specific caption track
 *   (e.g. "en"). If omitted, the first available track is used.
 * @param {number} [options.timeoutMs=10000]
 *   Timeout applied to each outbound network request.
 * @param {object} [deps]
 *   Injectable dependencies, primarily for unit testing.
 * @param {typeof fetch} [deps.fetchImpl=fetch]
 *   Fetch implementation used only for our own oEmbed availability check.
 *   Not used for the transcript fetch itself (see runWithTimeout()).
 * @param {(videoId: string, config: object) => Promise<any[]>} [deps.fetchTranscriptImpl]
 *   Function used to fetch raw transcript segments. Defaults to
 *   `YoutubeTranscript.fetchTranscript` from the `youtube-transcript` package.
 *
 * @returns {Promise<{
 *   videoId: string,
 *   language: string | null,
 *   fullText: string,
 *   segments: Array<{ text: string, offset: number, duration: number, lang?: string }>
 * }>}
 *
 * @throws {TranscriptServiceError} with one of:
 *   - INVALID_VIDEO_ID        the videoId string isn't a well-formed YouTube ID
 *   - VIDEO_NOT_FOUND         the video doesn't exist / was removed
 *   - PRIVATE_VIDEO           the video exists but is private/restricted
 *   - NO_TRANSCRIPT_AVAILABLE the video has no captions (disabled or none exist)
 *   - NETWORK_ERROR           a request to YouTube failed or timed out
 *   - UNKNOWN_ERROR           any other unexpected failure
 */
export async function getTranscript(videoId, options = {}, deps = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Used only for our own oEmbed availability check (one call we fully
  // control). NOT passed into the transcript library - see the note on
  // runWithTimeout() for why.
  const oEmbedFetchImpl = withTimeout(deps.fetchImpl ?? fetch, timeoutMs);
  // IMPORTANT: YoutubeTranscript.fetchTranscript is a static class method
  // that relies on `this` internally (it calls this.retrieveVideoId(...)
  // and other static helpers on itself). Assigning it to a plain variable
  // and calling it as a bare function detaches it from the class, making
  // `this` undefined inside the method - which throws
  // "Cannot read properties of undefined (reading 'retrieveVideoId')".
  // .bind(YoutubeTranscript) preserves the correct `this` when we call it
  // later as a standalone function.
  const fetchTranscriptImpl = deps.fetchTranscriptImpl ?? YoutubeTranscript.fetchTranscript.bind(YoutubeTranscript);

  const trimmedId = typeof videoId === 'string' ? videoId.trim() : videoId;

  // 1. Validate the ID is well-formed before making any network calls.
  assertValidVideoIdFormat(trimmedId);

  // 2. Confirm the video exists and is public (distinguishes "invalid/
  //    removed" from "private" before we even try to fetch captions).
  await assertVideoIsPubliclyAccessible(trimmedId, oEmbedFetchImpl);

  // 3. Fetch the actual transcript/caption segments. We let the library
  //    use its own default fetch internally (it makes several sequential
  //    calls of its own - an InnerTube API request, and a fallback HTML
  //    scrape - and injecting a custom fetch there risks breaking that
  //    internal flow in ways we don't control). The whole operation is
  //    still time-bounded via runWithTimeout().
  let segments;
  try {
    segments = await runWithTimeout(
      () => fetchTranscriptImpl(trimmedId, { lang: options.lang }),
      timeoutMs
    );
  } catch (err) {
    throw mapLibraryError(err, trimmedId);
  }

  if (!Array.isArray(segments) || segments.length === 0) {
    throw new TranscriptServiceError(
      `No transcript is available for video "${trimmedId}".`,
      TRANSCRIPT_ERROR_CODES.NO_TRANSCRIPT_AVAILABLE,
      trimmedId
    );
  }

  return {
    videoId: trimmedId,
    language: segments[0]?.lang ?? options.lang ?? null,
    fullText: buildFullText(segments),
    segments: segments.map((s) => ({
      text: s.text,
      offset: s.offset,
      duration: s.duration,
      lang: s.lang,
    })),
  };
}

/**
 * Non-throwing convenience wrapper around getTranscript(), suitable for
 * use in Express controllers without try/catch boilerplate.
 *
 * @param {string} videoId
 * @param {object} [options]  Same as getTranscript().
 * @param {object} [deps]     Same as getTranscript().
 * @returns {Promise<
 *   { success: true, data: Awaited<ReturnType<typeof getTranscript>> } |
 *   { success: false, error: { code: string, message: string } }
 * >}
 */
export async function getTranscriptSafe(videoId, options = {}, deps = {}) {
  try {
    const data = await getTranscript(videoId, options, deps);
    return { success: true, data };
  } catch (err) {
    if (err instanceof TranscriptServiceError) {
      return { success: false, error: { code: err.code, message: err.message } };
    }
    throw err;
  }
}
