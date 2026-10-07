import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@google/genai';

import {
  generateNotesFromTranscript,
  generateNotesFromTranscriptSafe,
  GeminiServiceError,
  GEMINI_ERROR_CODES,
} from './gemini.service.js';

const SAMPLE_TRANSCRIPT = 'Today we will discuss the water cycle and why it matters for climate.';

const validNotes = {
  summary: 'The video explains the water cycle and its role in climate.',
  keyPoints: ['Water evaporates from oceans.', 'Clouds form and release precipitation.'],
  importantConcepts: [{ concept: 'Evaporation', explanation: 'Liquid water turning into vapor due to heat.' }],
  actionItems: ['Track local rainfall patterns for a week.'],
};

/** Builds a fake Gemini response object matching { text }. */
function fakeResponse(bodyObject) {
  return { text: JSON.stringify(bodyObject) };
}

describe('generateNotesFromTranscript - input validation', () => {
  test('throws EMPTY_TRANSCRIPT for an empty string', async () => {
    await assert.rejects(
      () => generateNotesFromTranscript('', {}, { generateContent: async () => fakeResponse(validNotes) }),
      (err) => {
        assert.ok(err instanceof GeminiServiceError);
        assert.equal(err.code, GEMINI_ERROR_CODES.EMPTY_TRANSCRIPT);
        return true;
      }
    );
  });

  test('throws EMPTY_TRANSCRIPT for whitespace only', async () => {
    await assert.rejects(
      () => generateNotesFromTranscript('   ', {}, { generateContent: async () => fakeResponse(validNotes) }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.EMPTY_TRANSCRIPT);
        return true;
      }
    );
  });

  test('throws EMPTY_TRANSCRIPT for a non-string input', async () => {
    await assert.rejects(
      () => generateNotesFromTranscript(null, {}, { generateContent: async () => fakeResponse(validNotes) }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.EMPTY_TRANSCRIPT);
        return true;
      }
    );
  });
});

describe('generateNotesFromTranscript - successful responses', () => {
  test('sends the lecture-summarization system instruction and includes the transcript in contents', async () => {
    const generateContent = async (params) => {
      assert.equal(params.config.responseMimeType, 'application/json');
      assert.ok(params.contents.includes(SAMPLE_TRANSCRIPT));
      assert.match(params.config.systemInstruction, /lecture transcripts into structured study notes/);
      assert.match(params.config.systemInstruction, /Never invent facts/);
      return fakeResponse(validNotes);
    };

    await generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent });
  });

  test('returns parsed notes for a well-formed JSON response', async () => {
    const generateContent = async (params) => {
      assert.equal(params.config.responseMimeType, 'application/json');
      assert.ok(params.contents.includes(SAMPLE_TRANSCRIPT));
      return fakeResponse(validNotes);
    };

    const result = await generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent });
    assert.deepEqual(result, validNotes);
  });

  test('strips a markdown code fence if the model adds one', async () => {
    const fenced = { text: '```json\n' + JSON.stringify(validNotes) + '\n```' };
    const generateContent = async () => fenced;

    const result = await generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent });
    assert.deepEqual(result, validNotes);
  });

  test('uses options.model to override the default model', async () => {
    let usedModel;
    const generateContent = async (params) => {
      usedModel = params.model;
      return fakeResponse(validNotes);
    };

    await generateNotesFromTranscript(SAMPLE_TRANSCRIPT, { model: 'gemini-custom-test' }, { generateContent });
    assert.equal(usedModel, 'gemini-custom-test');
  });
});

describe('generateNotesFromTranscript - malformed responses', () => {
  test('throws INVALID_RESPONSE_FORMAT for non-JSON text', async () => {
    const generateContent = async () => ({ text: 'This is not JSON at all.' });
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.INVALID_RESPONSE_FORMAT);
        return true;
      }
    );
  });

  test('throws INVALID_RESPONSE_FORMAT when required fields are missing', async () => {
    const generateContent = async () => fakeResponse({ summary: 'Only a summary, nothing else.' });
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.INVALID_RESPONSE_FORMAT);
        return true;
      }
    );
  });

  test('throws INVALID_RESPONSE_FORMAT when importantConcepts items are malformed', async () => {
    const badNotes = { ...validNotes, importantConcepts: ['just a string, not an object'] };
    const generateContent = async () => fakeResponse(badNotes);
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.INVALID_RESPONSE_FORMAT);
        return true;
      }
    );
  });

  test('throws EMPTY_RESPONSE when Gemini returns no text', async () => {
    const generateContent = async () => ({ text: undefined });
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.EMPTY_RESPONSE);
        return true;
      }
    );
  });

  test('EMPTY_RESPONSE message mentions the block reason when present', async () => {
    const generateContent = async () => ({ text: undefined, promptFeedback: { blockReason: 'SAFETY' } });
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.EMPTY_RESPONSE);
        assert.match(err.message, /SAFETY/);
        return true;
      }
    );
  });
});

describe('generateNotesFromTranscript - API/network failures', () => {
  test('maps a 401 ApiError to AUTH_ERROR', async () => {
    const generateContent = async () => {
      throw new ApiError({ message: 'invalid api key', status: 401 });
    };
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.AUTH_ERROR);
        return true;
      }
    );
  });

  test('maps a 429 ApiError to RATE_LIMITED', async () => {
    const generateContent = async () => {
      throw new ApiError({ message: 'quota exceeded', status: 429 });
    };
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.RATE_LIMITED);
        return true;
      }
    );
  });

  test('maps a 400 ApiError to INVALID_REQUEST', async () => {
    const generateContent = async () => {
      throw new ApiError({ message: 'bad request', status: 400 });
    };
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.INVALID_REQUEST);
        return true;
      }
    );
  });

  test('maps a 500 ApiError to SERVER_ERROR', async () => {
    const generateContent = async () => {
      throw new ApiError({ message: 'internal error', status: 503 });
    };
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.SERVER_ERROR);
        return true;
      }
    );
  });

  test('maps a raw TypeError (fetch failure) to NETWORK_ERROR', async () => {
    const generateContent = async () => {
      throw new TypeError('fetch failed');
    };
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.NETWORK_ERROR);
        return true;
      }
    );
  });

  test('maps an AbortError (timeout) to NETWORK_ERROR', async () => {
    const generateContent = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.NETWORK_ERROR);
        assert.match(err.message, /timed out/i);
        return true;
      }
    );
  });

  test('maps an unrecognized error to UNKNOWN_ERROR', async () => {
    const generateContent = async () => {
      throw new Error('Something completely unexpected happened');
    };
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.equal(err.code, GEMINI_ERROR_CODES.UNKNOWN_ERROR);
        return true;
      }
    );
  });
});

describe('generateNotesFromTranscript - MISSING_API_KEY passthrough', () => {
  test('propagates MISSING_API_KEY as-is instead of relabeling it UNKNOWN_ERROR', async () => {
    // Simulates getClient() throwing before any network call is made
    // (e.g. when GEMINI_API_KEY is unset), by having the injected
    // generateContent function raise the same error type directly.
    const generateContent = async () => {
      throw new GeminiServiceError('GEMINI_API_KEY environment variable is not set.', GEMINI_ERROR_CODES.MISSING_API_KEY);
    };
    await assert.rejects(
      () => generateNotesFromTranscript(SAMPLE_TRANSCRIPT, {}, { generateContent }),
      (err) => {
        assert.ok(err instanceof GeminiServiceError);
        assert.equal(err.code, GEMINI_ERROR_CODES.MISSING_API_KEY);
        return true;
      }
    );
  });
});

describe('generateNotesFromTranscriptSafe (non-throwing wrapper)', () => {
  test('returns { success: true, data } on success', async () => {
    const generateContent = async () => fakeResponse(validNotes);
    const result = await generateNotesFromTranscriptSafe(SAMPLE_TRANSCRIPT, {}, { generateContent });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, validNotes);
  });

  test('returns { success: false, error } on failure', async () => {
    const generateContent = async () => {
      throw new ApiError({ message: 'invalid api key', status: 401 });
    };
    const result = await generateNotesFromTranscriptSafe(SAMPLE_TRANSCRIPT, {}, { generateContent });

    assert.equal(result.success, false);
    assert.equal(result.error.code, GEMINI_ERROR_CODES.AUTH_ERROR);
    assert.ok(typeof result.error.message === 'string' && result.error.message.length > 0);
  });
});
