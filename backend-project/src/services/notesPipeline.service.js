/**
 * notesPipeline.service.js
 *
 * Orchestrates the full "YouTube URL -> structured lecture notes" workflow
 * by composing three independent services in sequence:
 *
 *   1. validateYouTubeUrl()          (utils/youtubeValidator.js)
 *   2. getTranscriptSafe()           (services/transcript.service.js)
 *   3. generateNotesFromTranscriptSafe() (services/gemini.service.js)
 *
 * This module contains no HTTP-specific logic (no req/res, no status
 * codes) - it's a plain, reusable async function that could be called
 * from an Express controller, a CLI script, a queue worker, etc. HTTP
 * status mapping lives in the controller that calls it.
 *
 * Every failure, from any stage, is normalized into a single
 * PipelineError shape carrying:
 *   - stage:   which step failed (PIPELINE_STAGES)
 *   - code:    the underlying error code from that stage's own service
 *   - message: a human-readable description
 * This gives callers one consistent shape to branch on, instead of three
 * different error shapes from three different services.
 */

import { validateYouTubeUrl } from '../utils/youtubeValidator.js';
import { getTranscriptSafe } from './transcript.service.js';
import { generateNotesFromTranscriptSafe } from './gemini.service.js';

/** Identifies which step of the pipeline an error occurred in. */
export const PIPELINE_STAGES = Object.freeze({
  VALIDATE_URL: 'VALIDATE_URL',
  FETCH_TRANSCRIPT: 'FETCH_TRANSCRIPT',
  GENERATE_NOTES: 'GENERATE_NOTES',
});

/**
 * A single, normalized error type for any failure anywhere in the
 * pipeline. Callers branch on `.stage` and/or `.code` rather than
 * needing to know which underlying service threw what.
 */
export class PipelineError extends Error {
  /**
   * @param {string} message   Human-readable description.
   * @param {string} stage     One of PIPELINE_STAGES.
   * @param {string} code      The error code from the failing stage's own service.
   * @param {unknown} [cause]  The original underlying error/result, if any.
   */
  constructor(message, stage, code, cause) {
    super(message);
    this.name = 'PipelineError';
    this.stage = stage;
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Runs the full pipeline: validates a YouTube URL, extracts its video ID,
 * fetches the transcript, and sends it to Gemini for summarization.
 *
 * @param {string} url
 *   A YouTube URL in any supported format (see youtubeValidator.js).
 * @param {object} [options]
 * @param {object} [options.transcript]  Passed through to getTranscript() (e.g. { lang, timeoutMs }).
 * @param {object} [options.gemini]      Passed through to generateNotesFromTranscript() (e.g. { model, timeoutMs }).
 * @param {object} [deps]
 *   Injectable dependencies, primarily for unit testing.
 * @param {object} [deps.transcript]  Forwarded as the `deps` argument to getTranscriptSafe().
 * @param {object} [deps.gemini]      Forwarded as the `deps` argument to generateNotesFromTranscriptSafe().
 *
 * @returns {Promise<{
 *   videoId: string,
 *   transcriptLanguage: string | null,
 *   notes: {
 *     summary: string,
 *     keyPoints: string[],
 *     importantConcepts: Array<{ concept: string, explanation: string }>,
 *     actionItems: string[]
 *   }
 * }>}
 *
 * @throws {PipelineError} tagged with the stage and the underlying
 *   service's own error code (see youtubeValidator.js, transcript.service.js,
 *   and gemini.service.js for the full list of possible codes per stage).
 */
export async function generateNotesFromYoutubeUrl(url, options = {}, deps = {}) {
  // Step 1: Receive URL -> Validate URL -> Extract Video ID.
  // (validateYouTubeUrl performs both validation and extraction in one call.)
  const urlResult = validateYouTubeUrl(url);
  if (!urlResult.valid) {
    throw new PipelineError(urlResult.error.message, PIPELINE_STAGES.VALIDATE_URL, urlResult.error.code);
  }
  const { videoId } = urlResult;

  // Step 2: Fetch Transcript.
  const transcriptResult = await getTranscriptSafe(videoId, options.transcript, deps.transcript);
  if (!transcriptResult.success) {
    throw new PipelineError(
      transcriptResult.error.message,
      PIPELINE_STAGES.FETCH_TRANSCRIPT,
      transcriptResult.error.code
    );
  }

  // Step 3: Send to Gemini -> Receive JSON.
  const geminiResult = await generateNotesFromTranscriptSafe(
    transcriptResult.data.fullText,
    options.gemini,
    deps.gemini
  );
  if (!geminiResult.success) {
    throw new PipelineError(geminiResult.error.message, PIPELINE_STAGES.GENERATE_NOTES, geminiResult.error.code);
  }

  // Step 4 (caller's responsibility): Return API response.
  return {
    videoId,
    transcriptLanguage: transcriptResult.data.language,
    notes: geminiResult.data,
  };
}

/**
 * Non-throwing convenience wrapper around generateNotesFromYoutubeUrl(),
 * suitable for use in Express controllers without try/catch boilerplate.
 *
 * @param {string} url
 * @param {object} [options]  Same as generateNotesFromYoutubeUrl().
 * @param {object} [deps]     Same as generateNotesFromYoutubeUrl().
 * @returns {Promise<
 *   { success: true, data: Awaited<ReturnType<typeof generateNotesFromYoutubeUrl>> } |
 *   { success: false, error: { stage: string, code: string, message: string } }
 * >}
 */
export async function generateNotesFromYoutubeUrlSafe(url, options = {}, deps = {}) {
  try {
    const data = await generateNotesFromYoutubeUrl(url, options, deps);
    return { success: true, data };
  } catch (err) {
    if (err instanceof PipelineError) {
      return { success: false, error: { stage: err.stage, code: err.code, message: err.message } };
    }
    throw err;
  }
}

/**
 * Fetches the transcript for a YouTube URL: validates the URL, extracts the video ID,
 * and fetches the full transcript with segment timestamps.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {object} [options.transcript]
 * @param {object} [deps]
 * @returns {Promise<{
 *   videoId: string,
 *   transcriptLanguage: string | null,
 *   fullText: string,
 *   segments: Array<{ text: string, offset: number, duration: number, lang?: string }>
 * }>}
 */
export async function getTranscriptFromYoutubeUrl(url, options = {}, deps = {}) {
  const urlResult = validateYouTubeUrl(url);
  if (!urlResult.valid) {
    throw new PipelineError(urlResult.error.message, PIPELINE_STAGES.VALIDATE_URL, urlResult.error.code);
  }
  const { videoId } = urlResult;

  const transcriptResult = await getTranscriptSafe(videoId, options.transcript, deps.transcript);
  if (!transcriptResult.success) {
    throw new PipelineError(
      transcriptResult.error.message,
      PIPELINE_STAGES.FETCH_TRANSCRIPT,
      transcriptResult.error.code
    );
  }

  return {
    videoId,
    transcriptLanguage: transcriptResult.data.language,
    fullText: transcriptResult.data.fullText,
    segments: transcriptResult.data.segments,
  };
}

/**
 * Non-throwing convenience wrapper around getTranscriptFromYoutubeUrl().
 */
export async function getTranscriptFromYoutubeUrlSafe(url, options = {}, deps = {}) {
  try {
    const data = await getTranscriptFromYoutubeUrl(url, options, deps);
    return { success: true, data };
  } catch (err) {
    if (err instanceof PipelineError) {
      return { success: false, error: { stage: err.stage, code: err.code, message: err.message } };
    }
    throw err;
  }
}

