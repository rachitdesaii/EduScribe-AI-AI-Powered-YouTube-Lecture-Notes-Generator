/**
 * notes.controller.js
 *
 * HTTP layer for POST /api/transcript and POST /api/generate-notes.
 * This controller owns HTTP concerns (reading request bodies, choosing status
 * codes, shaping JSON responses) while workflow logic lives in the services.
 */

import {
  generateNotesFromYoutubeUrlSafe as defaultGenerateNotesFromYoutubeUrlSafe,
  getTranscriptFromYoutubeUrlSafe as defaultGetTranscriptFromYoutubeUrlSafe,
} from '../services/notesPipeline.service.js';
import { generateNotesFromTranscriptSafe as defaultGenerateNotesFromTranscriptSafe } from '../services/gemini.service.js';
import { mapErrorCodeToStatus } from '../utils/httpErrorMapper.js';

/**
 * Builds the Express handler for POST /api/transcript.
 *
 * @param {object} [deps]
 * @param {typeof defaultGetTranscriptFromYoutubeUrlSafe} [deps.getTranscriptFromYoutubeUrlSafe]
 * @returns {(req: import('express').Request, res: import('express').Response) => Promise<void>}
 */
export function createFetchTranscriptHandler(deps = {}) {
  const getTranscriptFromYoutubeUrlSafe = deps.getTranscriptFromYoutubeUrlSafe ?? defaultGetTranscriptFromYoutubeUrlSafe;

  /**
   * Handles POST /api/transcript.
   *
   * Request body:  { "url": "<YouTube URL>" }
   * Success (200): { success: true, videoId, transcriptLanguage, fullText, segments }
   * Failure:       { success: false, step, error: { code, message } }
   */
  return async function fetchTranscript(req, res) {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        step: 'validate-url',
        error: {
          code: 'MISSING_URL',
          message: 'A "url" field (string) is required in the request body.',
        },
      });
    }

    const result = await getTranscriptFromYoutubeUrlSafe(url);

    if (!result.success) {
      const { stage, code, message } = result.error;
      return res.status(mapErrorCodeToStatus(code)).json({
        success: false,
        step: pipelineStageToStepName(stage),
        error: { code, message },
      });
    }

    return res.status(200).json({
      success: true,
      videoId: result.data.videoId,
      transcriptLanguage: result.data.transcriptLanguage,
      fullText: result.data.fullText,
      segments: result.data.segments,
    });
  };
}

/**
 * Builds the Express handler for POST /api/generate-notes.
 *
 * @param {object} [deps]
 * @param {typeof defaultGenerateNotesFromYoutubeUrlSafe} [deps.generateNotesFromYoutubeUrlSafe]
 * @param {typeof defaultGenerateNotesFromTranscriptSafe} [deps.generateNotesFromTranscriptSafe]
 * @returns {(req: import('express').Request, res: import('express').Response) => Promise<void>}
 */
export function createGenerateNotesHandler(deps = {}) {
  const generateNotesFromYoutubeUrlSafe = deps.generateNotesFromYoutubeUrlSafe ?? defaultGenerateNotesFromYoutubeUrlSafe;
  const generateNotesFromTranscriptSafe = deps.generateNotesFromTranscriptSafe ?? defaultGenerateNotesFromTranscriptSafe;

  /**
   * Handles POST /api/generate-notes.
   *
   * Request body:  { "url": "<YouTube URL>" } OR { "transcript": "<full text>", "videoId"?: "...", "transcriptLanguage"?: "..." }
   * Success (200): { success: true, videoId, transcriptLanguage, notes }
   * Failure:       { success: false, step, error: { code, message } }
   */
  return async function generateNotes(req, res) {
    const { url, transcript, videoId, transcriptLanguage } = req.body || {};

    // If transcript is provided directly, summarize it without re-fetching
    if (transcript && typeof transcript === 'string') {
      const result = await generateNotesFromTranscriptSafe(transcript);
      if (!result.success) {
        return res.status(mapErrorCodeToStatus(result.error.code)).json({
          success: false,
          step: 'generate-notes',
          error: { code: result.error.code, message: result.error.message },
        });
      }
      return res.status(200).json({
        success: true,
        videoId: typeof videoId === 'string' ? videoId : null,
        transcriptLanguage: typeof transcriptLanguage === 'string' ? transcriptLanguage : null,
        notes: result.data,
      });
    }

    // Guard clause for a missing/malformed URL
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        step: 'validate-url',
        error: {
          code: 'MISSING_URL',
          message: 'A "url" field (string) is required in the request body.',
        },
      });
    }

    const result = await generateNotesFromYoutubeUrlSafe(url);

    if (!result.success) {
      const { stage, code, message } = result.error;
      return res.status(mapErrorCodeToStatus(code)).json({
        success: false,
        step: pipelineStageToStepName(stage),
        error: { code, message },
      });
    }

    const responsePayload = {
      success: true,
      videoId: result.data.videoId,
      transcriptLanguage: result.data.transcriptLanguage,
      notes: result.data.notes,
    };
    if (result.data.fullText !== undefined) {
      responsePayload.fullText = result.data.fullText;
    }
    if (result.data.segments !== undefined) {
      responsePayload.segments = result.data.segments;
    }
    return res.status(200).json(responsePayload);
  };
}

/**
 * Converts pipeline stages to step names for API responses.
 *
 * @param {string} stage
 * @returns {string}
 */
function pipelineStageToStepName(stage) {
  switch (stage) {
    case 'VALIDATE_URL':
      return 'validate-url';
    case 'FETCH_TRANSCRIPT':
      return 'fetch-transcript';
    case 'GENERATE_NOTES':
      return 'generate-notes';
    default:
      return 'unknown';
  }
}

/**
 * Real production handlers wired with default services.
 */
export const fetchTranscript = createFetchTranscriptHandler();
export const generateNotes = createGenerateNotesHandler();
