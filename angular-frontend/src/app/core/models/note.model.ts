/**
 * A single named concept/term explained in the notes, as returned by
 * the backend's Gemini-powered summarization.
 */
export interface ImportantConcept {
  concept: string;
  explanation: string;
}

/**
 * The structured notes generated from a lecture transcript.
 * Matches the exact shape returned by the backend's Gemini service.
 */
export interface Notes {
  summary: string;
  keyPoints: string[];
  importantConcepts: ImportantConcept[];
  actionItems: string[];
}

/**
 * A single timed subtitle / caption segment from YouTube.
 */
export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
  lang?: string;
}

/**
 * Response payload returned from the POST /api/transcript endpoint on success.
 */
export interface TranscriptResponse {
  success: true;
  videoId: string;
  transcriptLanguage: string | null;
  fullText: string;
  segments: TranscriptSegment[];
}

/**
 * Request payload sent to the "generate notes" endpoint.
 * Supports either a YouTube URL or direct pre-fetched transcript text.
 */
export interface GenerateNotesRequest {
  url?: string;
  transcript?: string;
  videoId?: string;
  transcriptLanguage?: string | null;
}

/**
 * Response payload returned from the "generate notes" endpoint on success.
 */
export interface GenerateNotesResponse {
  success: true;
  videoId: string | null;
  transcriptLanguage: string | null;
  notes: Notes;
}

/**
 * Response payload returned from API endpoints on failure.
 * `step` identifies which stage failed (e.g. "validate-url", "fetch-transcript", "generate-notes").
 */
export interface GenerateNotesErrorResponse {
  success: false;
  step: string;
  error: {
    code: string;
    message: string;
  };
}
