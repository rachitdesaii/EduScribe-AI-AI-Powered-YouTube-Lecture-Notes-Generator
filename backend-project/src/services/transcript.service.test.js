import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { YoutubeTranscript } from 'youtube-transcript';

import {
  getTranscript,
  getTranscriptSafe,
  TranscriptServiceError,
  TRANSCRIPT_ERROR_CODES,
} from './transcript.service.js';

const VALID_ID = 'dQw4w9WgXcQ';

/** Builds a minimal fetch-response-like object. */
function fakeResponse(status) {
  return { ok: status >= 200 && status < 300, status };
}

/** A fetchImpl that always reports the video as public (200 OK). */
function okFetch() {
  return async () => fakeResponse(200);
}

const sampleSegments = [
  { text: 'Hello there', offset: 0, duration: 1200, lang: 'en' },
  { text: 'and welcome', offset: 1200, duration: 1000, lang: 'en' },
  { text: 'to this video.', offset: 2200, duration: 1500, lang: 'en' },
];

describe('getTranscript - input validation', () => {
  test('throws INVALID_VIDEO_ID for a malformed ID, without making network calls', async () => {
    let fetchCalled = false;
    const fetchImpl = async () => {
      fetchCalled = true;
      return fakeResponse(200);
    };

    await assert.rejects(
      () => getTranscript('too-short', {}, { fetchImpl }),
      (err) => {
        assert.ok(err instanceof TranscriptServiceError);
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.INVALID_VIDEO_ID);
        return true;
      }
    );
    assert.equal(fetchCalled, false, 'should not call fetch for an invalid ID');
  });

  test('throws INVALID_VIDEO_ID for a non-string input', async () => {
    await assert.rejects(
      () => getTranscript(12345, {}, { fetchImpl: okFetch() }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.INVALID_VIDEO_ID);
        return true;
      }
    );
  });
});

describe('getTranscript - availability check (oEmbed)', () => {
  test('throws PRIVATE_VIDEO when oEmbed returns 401', async () => {
    const fetchImpl = async () => fakeResponse(401);
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.PRIVATE_VIDEO);
        return true;
      }
    );
  });

  test('throws PRIVATE_VIDEO when oEmbed returns 403', async () => {
    const fetchImpl = async () => fakeResponse(403);
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.PRIVATE_VIDEO);
        return true;
      }
    );
  });

  test('throws VIDEO_NOT_FOUND when oEmbed returns 404', async () => {
    const fetchImpl = async () => fakeResponse(404);
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.VIDEO_NOT_FOUND);
        return true;
      }
    );
  });

  test('throws VIDEO_NOT_FOUND for an unexpected status code (fail-closed default)', async () => {
    const fetchImpl = async () => fakeResponse(500);
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.VIDEO_NOT_FOUND);
        return true;
      }
    );
  });

  test('throws NETWORK_ERROR when the oEmbed request itself fails', async () => {
    const fetchImpl = async () => {
      throw new TypeError('fetch failed');
    };
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.NETWORK_ERROR);
        return true;
      }
    );
  });

  test('throws NETWORK_ERROR when the oEmbed request times out (AbortError)', async () => {
    const fetchImpl = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.NETWORK_ERROR);
        assert.match(err.message, /timed out/i);
        return true;
      }
    );
  });
});

describe('getTranscript - transcript fetching', () => {
  test('returns fullText and segments for a successful fetch', async () => {
    const fetchTranscriptImpl = async () => sampleSegments;

    const result = await getTranscript(VALID_ID, {}, { fetchImpl: okFetch(), fetchTranscriptImpl });

    assert.equal(result.videoId, VALID_ID);
    assert.equal(result.language, 'en');
    assert.equal(result.fullText, 'Hello there and welcome to this video.');
    assert.equal(result.segments.length, 3);
    assert.deepEqual(result.segments[0], {
      text: 'Hello there',
      offset: 0,
      duration: 1200,
      lang: 'en',
    });
  });

  test('throws NO_TRANSCRIPT_AVAILABLE when the library returns an empty array', async () => {
    const fetchTranscriptImpl = async () => [];
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl: okFetch(), fetchTranscriptImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.NO_TRANSCRIPT_AVAILABLE);
        return true;
      }
    );
  });

  test('maps YoutubeTranscriptDisabledError to NO_TRANSCRIPT_AVAILABLE', async () => {
    const fetchTranscriptImpl = async () => {
      const err = new Error('Transcript is disabled on this video');
      err.name = 'YoutubeTranscriptDisabledError';
      throw err;
    };
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl: okFetch(), fetchTranscriptImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.NO_TRANSCRIPT_AVAILABLE);
        return true;
      }
    );
  });

  test('maps YoutubeTranscriptNotAvailableError to NO_TRANSCRIPT_AVAILABLE', async () => {
    const fetchTranscriptImpl = async () => {
      const err = new Error('No transcripts are available for this video');
      err.name = 'YoutubeTranscriptNotAvailableError';
      throw err;
    };
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl: okFetch(), fetchTranscriptImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.NO_TRANSCRIPT_AVAILABLE);
        return true;
      }
    );
  });

  test('maps YoutubeTranscriptTooManyRequestError to NETWORK_ERROR', async () => {
    const fetchTranscriptImpl = async () => {
      const err = new Error('Too many requests');
      err.name = 'YoutubeTranscriptTooManyRequestError';
      throw err;
    };
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl: okFetch(), fetchTranscriptImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.NETWORK_ERROR);
        return true;
      }
    );
  });

  test('maps YoutubeTranscriptVideoUnavailableError to VIDEO_NOT_FOUND', async () => {
    const fetchTranscriptImpl = async () => {
      const err = new Error('The video is no longer available');
      err.name = 'YoutubeTranscriptVideoUnavailableError';
      throw err;
    };
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl: okFetch(), fetchTranscriptImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.VIDEO_NOT_FOUND);
        return true;
      }
    );
  });

  test('maps an unrecognized error to UNKNOWN_ERROR', async () => {
    const fetchTranscriptImpl = async () => {
      throw new Error('Something completely unexpected happened');
    };
    await assert.rejects(
      () => getTranscript(VALID_ID, {}, { fetchImpl: okFetch(), fetchTranscriptImpl }),
      (err) => {
        assert.equal(err.code, TRANSCRIPT_ERROR_CODES.UNKNOWN_ERROR);
        return true;
      }
    );
  });
});

describe('getTranscriptSafe (non-throwing wrapper)', () => {
  test('returns { success: true, data } on success', async () => {
    const fetchTranscriptImpl = async () => sampleSegments;
    const result = await getTranscriptSafe(VALID_ID, {}, { fetchImpl: okFetch(), fetchTranscriptImpl });

    assert.equal(result.success, true);
    assert.equal(result.data.fullText, 'Hello there and welcome to this video.');
  });

  test('returns { success: false, error } on failure', async () => {
    const fetchImpl = async () => fakeResponse(404);
    const result = await getTranscriptSafe(VALID_ID, {}, { fetchImpl });

    assert.equal(result.success, false);
    assert.equal(result.error.code, TRANSCRIPT_ERROR_CODES.VIDEO_NOT_FOUND);
    assert.ok(typeof result.error.message === 'string' && result.error.message.length > 0);
  });
});

describe('regression: YoutubeTranscript.fetchTranscript `this` binding', () => {
  // This exact bug shipped once: getTranscript() defaulted
  // fetchTranscriptImpl to a *detached* reference to the static method
  // `YoutubeTranscript.fetchTranscript`. Since that method uses `this`
  // internally (this.retrieveVideoId(...)), calling the detached
  // reference as a plain function makes `this` undefined, throwing
  // "Cannot read properties of undefined (reading 'retrieveVideoId')"
  // on every single call - before any network request was ever made.
  // These tests exercise the real library directly (not a fake), which
  // is the only way this class of bug shows up - every other test in
  // this file injects a fake fetchTranscriptImpl and so never touches
  // the real default, which is exactly why this bug shipped unnoticed.

  test('documents the bug: a detached reference loses `this` and throws immediately', async () => {
    const detached = YoutubeTranscript.fetchTranscript;
    await assert.rejects(() => detached(VALID_ID), (err) => {
      assert.match(err.message, /retrieveVideoId/);
      return true;
    });
  });

  test('the fix: .bind(YoutubeTranscript) preserves `this`, so retrieveVideoId no longer throws', async () => {
    const bound = YoutubeTranscript.fetchTranscript.bind(YoutubeTranscript);
    try {
      await bound(VALID_ID);
      assert.ok(true);
    } catch (err) {
      assert.doesNotMatch(err.message, /retrieveVideoId/);
    }
  });
});
