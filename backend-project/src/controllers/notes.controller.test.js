import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createGenerateNotesHandler } from './notes.controller.js';

/** Minimal fake Express Response that records what was sent. */
function createMockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const sampleNotes = {
  summary: 'A short summary.',
  keyPoints: ['Point one.'],
  importantConcepts: [{ concept: 'Thing', explanation: 'What it means.' }],
  actionItems: [],
};

describe('generateNotes controller - request validation', () => {
  test('returns 400 MISSING_URL when the body has no url', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromYoutubeUrlSafe: async () => {
        throw new Error('should not be called');
      },
    });

    const req = { body: {} };
    const res = createMockRes();
    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.step, 'validate-url');
    assert.equal(res.body.error.code, 'MISSING_URL');
  });

  test('returns 400 MISSING_URL when url is not a string', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromYoutubeUrlSafe: async () => {
        throw new Error('should not be called');
      },
    });

    const req = { body: { url: 12345 } };
    const res = createMockRes();
    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'MISSING_URL');
  });

  test('returns 400 MISSING_URL when body is entirely missing', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromYoutubeUrlSafe: async () => {
        throw new Error('should not be called');
      },
    });

    const req = {};
    const res = createMockRes();
    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'MISSING_URL');
  });
});

describe('generateNotes controller - pipeline failures mapped to HTTP status', () => {
  test('maps a VALIDATE_URL failure to 400 with step "validate-url"', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromYoutubeUrlSafe: async () => ({
        success: false,
        error: { stage: 'VALIDATE_URL', code: 'UNSUPPORTED_HOST', message: 'Not a YouTube domain.' },
      }),
    });

    const res = createMockRes();
    await handler({ body: { url: 'https://vimeo.com/123' } }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.step, 'validate-url');
    assert.deepEqual(res.body.error, { code: 'UNSUPPORTED_HOST', message: 'Not a YouTube domain.' });
  });

  test('maps a FETCH_TRANSCRIPT/PRIVATE_VIDEO failure to 403 with step "fetch-transcript"', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromYoutubeUrlSafe: async () => ({
        success: false,
        error: { stage: 'FETCH_TRANSCRIPT', code: 'PRIVATE_VIDEO', message: 'Video is private.' },
      }),
    });

    const res = createMockRes();
    await handler({ body: { url: 'https://youtu.be/dQw4w9WgXcQ' } }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.step, 'fetch-transcript');
    assert.equal(res.body.error.code, 'PRIVATE_VIDEO');
  });

  test('maps a FETCH_TRANSCRIPT/NO_TRANSCRIPT_AVAILABLE failure to 422', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromYoutubeUrlSafe: async () => ({
        success: false,
        error: { stage: 'FETCH_TRANSCRIPT', code: 'NO_TRANSCRIPT_AVAILABLE', message: 'No captions.' },
      }),
    });

    const res = createMockRes();
    await handler({ body: { url: 'https://youtu.be/dQw4w9WgXcQ' } }, res);

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.step, 'fetch-transcript');
  });

  test('maps a GENERATE_NOTES/RATE_LIMITED failure to 429 with step "generate-notes"', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromYoutubeUrlSafe: async () => ({
        success: false,
        error: { stage: 'GENERATE_NOTES', code: 'RATE_LIMITED', message: 'Too many requests.' },
      }),
    });

    const res = createMockRes();
    await handler({ body: { url: 'https://youtu.be/dQw4w9WgXcQ' } }, res);

    assert.equal(res.statusCode, 429);
    assert.equal(res.body.step, 'generate-notes');
    assert.equal(res.body.error.code, 'RATE_LIMITED');
  });

  test('maps a GENERATE_NOTES/MISSING_API_KEY failure to 500', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromYoutubeUrlSafe: async () => ({
        success: false,
        error: { stage: 'GENERATE_NOTES', code: 'MISSING_API_KEY', message: 'No API key configured.' },
      }),
    });

    const res = createMockRes();
    await handler({ body: { url: 'https://youtu.be/dQw4w9WgXcQ' } }, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.step, 'generate-notes');
  });

  test('falls back to step "unknown" for an unrecognized stage', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromYoutubeUrlSafe: async () => ({
        success: false,
        error: { stage: 'SOME_FUTURE_STAGE', code: 'UNKNOWN_ERROR', message: 'Unexpected.' },
      }),
    });

    const res = createMockRes();
    await handler({ body: { url: 'https://youtu.be/dQw4w9WgXcQ' } }, res);

    assert.equal(res.body.step, 'unknown');
    assert.equal(res.statusCode, 500);
  });
});

describe('generateNotes controller - success path', () => {
  test('returns 200 with videoId, transcriptLanguage, and notes', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromYoutubeUrlSafe: async (url) => {
        assert.equal(url, 'https://youtu.be/dQw4w9WgXcQ');
        return {
          success: true,
          data: {
            videoId: 'dQw4w9WgXcQ',
            transcriptLanguage: 'en',
            notes: sampleNotes,
          },
        };
      },
    });

    const res = createMockRes();
    await handler({ body: { url: 'https://youtu.be/dQw4w9WgXcQ' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      success: true,
      videoId: 'dQw4w9WgXcQ',
      transcriptLanguage: 'en',
      notes: sampleNotes,
    });
  });

  test('generates notes directly when transcript is passed in body', async () => {
    const handler = createGenerateNotesHandler({
      generateNotesFromTranscriptSafe: async (transcript) => {
        assert.equal(transcript, 'Hello world transcript');
        return {
          success: true,
          data: sampleNotes,
        };
      },
    });

    const res = createMockRes();
    await handler({ body: { transcript: 'Hello world transcript', videoId: 'abc12345678' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      success: true,
      videoId: 'abc12345678',
      transcriptLanguage: null,
      notes: sampleNotes,
    });
  });
});

describe('fetchTranscript controller', () => {
  test('returns 400 when url is missing', async () => {
    const { createFetchTranscriptHandler } = await import('./notes.controller.js');
    const handler = createFetchTranscriptHandler();
    const res = createMockRes();
    await handler({ body: {} }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'MISSING_URL');
  });

  test('returns 200 with videoId, segments and fullText on success', async () => {
    const { createFetchTranscriptHandler } = await import('./notes.controller.js');
    const handler = createFetchTranscriptHandler({
      getTranscriptFromYoutubeUrlSafe: async (url) => {
        assert.equal(url, 'https://youtu.be/dQw4w9WgXcQ');
        return {
          success: true,
          data: {
            videoId: 'dQw4w9WgXcQ',
            transcriptLanguage: 'en',
            fullText: 'Hello world full transcript',
            segments: [{ text: 'Hello world', offset: 0, duration: 2000 }],
          },
        };
      },
    });

    const res = createMockRes();
    await handler({ body: { url: 'https://youtu.be/dQw4w9WgXcQ' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      success: true,
      videoId: 'dQw4w9WgXcQ',
      transcriptLanguage: 'en',
      fullText: 'Hello world full transcript',
      segments: [{ text: 'Hello world', offset: 0, duration: 2000 }],
    });
  });
});

