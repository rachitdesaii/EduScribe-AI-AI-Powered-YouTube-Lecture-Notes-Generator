import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateNotesFromYoutubeUrl,
  generateNotesFromYoutubeUrlSafe,
  PipelineError,
  PIPELINE_STAGES,
} from './notesPipeline.service.js';
import { YOUTUBE_ERROR_CODES } from '../utils/youtubeValidator.js';
import { TRANSCRIPT_ERROR_CODES } from './transcript.service.js';
import { GEMINI_ERROR_CODES } from './gemini.service.js';

const VALID_ID = 'dQw4w9WgXcQ';
const VALID_URL = `https://youtu.be/${VALID_ID}`;

const sampleNotes = {
  summary: 'A short lecture summary.',
  keyPoints: ['Point one.', 'Point two.'],
  importantConcepts: [{ concept: 'Inertia', explanation: 'Resistance to change in motion.' }],
  actionItems: ['Review chapter 3.'],
};

/** Fake transcript-stage deps that always succeed with the given segments. */
function fakeTranscriptDeps() {
  return {
    fetchImpl: async () => ({ ok: true, status: 200 }),
    fetchTranscriptImpl: async () => [{ text: 'Some lecture content here.', offset: 0, duration: 1000, lang: 'en' }],
  };
}

/** Fake Gemini-stage deps that always succeed with sampleNotes. */
function fakeGeminiDeps() {
  return {
    generateContent: async () => ({ text: JSON.stringify(sampleNotes) }),
  };
}

describe('generateNotesFromYoutubeUrl - stage 1: URL validation', () => {
  test('fails at VALIDATE_URL for a non-YouTube URL, without touching later stages', async () => {
    let transcriptCalled = false;
    const deps = {
      transcript: {
        fetchImpl: async () => {
          transcriptCalled = true;
          return { ok: true, status: 200 };
        },
      },
      gemini: fakeGeminiDeps(),
    };

    await assert.rejects(
      () => generateNotesFromYoutubeUrl('https://vimeo.com/123456', {}, deps),
      (err) => {
        assert.ok(err instanceof PipelineError);
        assert.equal(err.stage, PIPELINE_STAGES.VALIDATE_URL);
        assert.equal(err.code, YOUTUBE_ERROR_CODES.UNSUPPORTED_HOST);
        return true;
      }
    );
    assert.equal(transcriptCalled, false, 'should never reach the transcript stage');
  });

  test('fails at VALIDATE_URL for an empty URL', async () => {
    await assert.rejects(
      () => generateNotesFromYoutubeUrl('', {}, { transcript: fakeTranscriptDeps(), gemini: fakeGeminiDeps() }),
      (err) => {
        assert.equal(err.stage, PIPELINE_STAGES.VALIDATE_URL);
        assert.equal(err.code, YOUTUBE_ERROR_CODES.EMPTY_URL);
        return true;
      }
    );
  });
});

describe('generateNotesFromYoutubeUrl - stage 2: transcript fetching', () => {
  test('fails at FETCH_TRANSCRIPT when the video is private, without calling Gemini', async () => {
    let geminiCalled = false;
    const deps = {
      transcript: { fetchImpl: async () => ({ ok: false, status: 401 }) },
      gemini: { generateContent: async () => { geminiCalled = true; return { text: '{}' }; } },
    };

    await assert.rejects(
      () => generateNotesFromYoutubeUrl(VALID_URL, {}, deps),
      (err) => {
        assert.equal(err.stage, PIPELINE_STAGES.FETCH_TRANSCRIPT);
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.PRIVATE_VIDEO);
        return true;
      }
    );
    assert.equal(geminiCalled, false, 'should never reach the Gemini stage');
  });

  test('fails at FETCH_TRANSCRIPT when no captions exist', async () => {
    const deps = {
      transcript: {
        fetchImpl: async () => ({ ok: true, status: 200 }),
        fetchTranscriptImpl: async () => [],
      },
      gemini: fakeGeminiDeps(),
    };

    await assert.rejects(
      () => generateNotesFromYoutubeUrl(VALID_URL, {}, deps),
      (err) => {
        assert.equal(err.stage, PIPELINE_STAGES.FETCH_TRANSCRIPT);
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.NO_TRANSCRIPT_AVAILABLE);
        return true;
      }
    );
  });
});

describe('generateNotesFromYoutubeUrl - stage 3: Gemini summarization', () => {
  test('fails at GENERATE_NOTES when Gemini rejects the API key', async () => {
    const deps = {
      transcript: fakeTranscriptDeps(),
      gemini: {
        generateContent: async () => {
          const { ApiError } = await import('@google/genai');
          throw new ApiError({ message: 'bad key', status: 401 });
        },
      },
    };

    await assert.rejects(
      () => generateNotesFromYoutubeUrl(VALID_URL, {}, deps),
      (err) => {
        assert.equal(err.stage, PIPELINE_STAGES.GENERATE_NOTES);
        assert.equal(err.code, GEMINI_ERROR_CODES.AUTH_ERROR);
        return true;
      }
    );
  });

  test('passes the fetched transcript text through to Gemini', async () => {
    let receivedContents;
    const deps = {
      transcript: {
        fetchImpl: async () => ({ ok: true, status: 200 }),
        fetchTranscriptImpl: async () => [
          { text: 'Unique lecture sentence about photosynthesis.', offset: 0, duration: 1000, lang: 'en' },
        ],
      },
      gemini: {
        generateContent: async (params) => {
          receivedContents = params.contents;
          return { text: JSON.stringify(sampleNotes) };
        },
      },
    };

    await generateNotesFromYoutubeUrl(VALID_URL, {}, deps);
    assert.match(receivedContents, /photosynthesis/);
  });
});

describe('generateNotesFromYoutubeUrl - success path', () => {
  test('returns videoId, transcriptLanguage, and notes end to end', async () => {
    const deps = { transcript: fakeTranscriptDeps(), gemini: fakeGeminiDeps() };

    const result = await generateNotesFromYoutubeUrl(VALID_URL, {}, deps);

    assert.equal(result.videoId, VALID_ID);
    assert.equal(result.transcriptLanguage, 'en');
    assert.deepEqual(result.notes, sampleNotes);
  });

  test('works with all supported URL formats', async () => {
    const urls = [
      `https://www.youtube.com/watch?v=${VALID_ID}`,
      `https://youtube.com/watch?v=${VALID_ID}&t=10s`,
      `https://m.youtube.com/watch?v=${VALID_ID}`,
      `youtu.be/${VALID_ID}`,
    ];

    for (const url of urls) {
      const result = await generateNotesFromYoutubeUrl(url, {}, {
        transcript: fakeTranscriptDeps(),
        gemini: fakeGeminiDeps(),
      });
      assert.equal(result.videoId, VALID_ID);
    }
  });
});

describe('generateNotesFromYoutubeUrlSafe (non-throwing wrapper)', () => {
  test('returns { success: true, data } on success', async () => {
    const result = await generateNotesFromYoutubeUrlSafe(VALID_URL, {}, {
      transcript: fakeTranscriptDeps(),
      gemini: fakeGeminiDeps(),
    });
    assert.equal(result.success, true);
    assert.equal(result.data.videoId, VALID_ID);
  });

  test('returns { success: false, error } with stage and code on failure', async () => {
    const result = await generateNotesFromYoutubeUrlSafe('not a youtube url', {}, {
      transcript: fakeTranscriptDeps(),
      gemini: fakeGeminiDeps(),
    });
    assert.equal(result.success, false);
    assert.equal(result.error.stage, PIPELINE_STAGES.VALIDATE_URL);
    assert.ok(typeof result.error.code === 'string');
    assert.ok(typeof result.error.message === 'string' && result.error.message.length > 0);
  });
});
