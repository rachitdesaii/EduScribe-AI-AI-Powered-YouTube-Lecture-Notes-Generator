import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractYouTubeVideoId,
  validateYouTubeUrl,
  isValidYouTubeUrl,
  YouTubeValidationError,
  YOUTUBE_ERROR_CODES,
} from './youtubeValidator.js';

const VALID_ID = 'dQw4w9WgXcQ';

describe('extractYouTubeVideoId - valid URLs', () => {
  const validUrls = [
    `https://youtu.be/${VALID_ID}`,
    `https://youtube.com/watch?v=${VALID_ID}`,
    `https://www.youtube.com/watch?v=${VALID_ID}`,
    `http://www.youtube.com/watch?v=${VALID_ID}`,
    `https://m.youtube.com/watch?v=${VALID_ID}`,
    `https://www.youtube.com/watch?v=${VALID_ID}&t=42s`,
    `https://www.youtube.com/watch?list=PL123&v=${VALID_ID}`,
    `https://youtu.be/${VALID_ID}?si=abc123`,
    `https://www.youtube.com/embed/${VALID_ID}`,
    `https://www.youtube.com/v/${VALID_ID}`,
    `https://www.youtube.com/shorts/${VALID_ID}`,
    `https://www.youtube.com/live/${VALID_ID}`,
    `https://www.youtube-nocookie.com/embed/${VALID_ID}`,
    `www.youtube.com/watch?v=${VALID_ID}`, // no protocol
    `youtu.be/${VALID_ID}`, // no protocol
    `  https://youtu.be/${VALID_ID}  `, // surrounding whitespace
  ];

  for (const url of validUrls) {
    test(`extracts "${VALID_ID}" from: ${url}`, () => {
      assert.equal(extractYouTubeVideoId(url), VALID_ID);
    });
  }
});

describe('extractYouTubeVideoId - invalid inputs', () => {
  test('throws EMPTY_URL for an empty string', () => {
    assert.throws(() => extractYouTubeVideoId(''), (err) => {
      assert.ok(err instanceof YouTubeValidationError);
      assert.equal(err.code, YOUTUBE_ERROR_CODES.EMPTY_URL);
      return true;
    });
  });

  test('throws EMPTY_URL for a whitespace-only string', () => {
    assert.throws(() => extractYouTubeVideoId('   '), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.EMPTY_URL);
      return true;
    });
  });

  test('throws EMPTY_URL for null', () => {
    assert.throws(() => extractYouTubeVideoId(null), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.EMPTY_URL);
      return true;
    });
  });

  test('throws INVALID_URL_FORMAT for a malformed string', () => {
    assert.throws(() => extractYouTubeVideoId(':::not a url:::'), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.INVALID_URL_FORMAT);
      return true;
    });
  });

  test('throws UNSUPPORTED_HOST for garbage text containing "://"', () => {
    // The URL spec parser is lenient and will treat "ht!tp" as a hostname
    // here rather than failing outright — it should still be rejected,
    // just via the "not a YouTube domain" path instead of a parse error.
    assert.throws(() => extractYouTubeVideoId('ht!tp://not a url'), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.UNSUPPORTED_HOST);
      return true;
    });
  });

  test('throws UNSUPPORTED_HOST for a non-YouTube domain', () => {
    assert.throws(() => extractYouTubeVideoId('https://vimeo.com/123456'), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.UNSUPPORTED_HOST);
      return true;
    });
  });

  test('throws UNSUPPORTED_HOST for a lookalike domain', () => {
    assert.throws(() => extractYouTubeVideoId('https://youtube.com.evil.com/watch?v=' + VALID_ID), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.UNSUPPORTED_HOST);
      return true;
    });
  });

  test('throws MISSING_VIDEO_ID for a channel URL', () => {
    assert.throws(() => extractYouTubeVideoId('https://www.youtube.com/channel/UC12345'), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.MISSING_VIDEO_ID);
      return true;
    });
  });

  test('throws MISSING_VIDEO_ID for /watch with no "v" param', () => {
    assert.throws(() => extractYouTubeVideoId('https://www.youtube.com/watch?list=PL123'), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.MISSING_VIDEO_ID);
      return true;
    });
  });

  test('throws MISSING_VIDEO_ID for a bare youtu.be root', () => {
    assert.throws(() => extractYouTubeVideoId('https://youtu.be/'), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.MISSING_VIDEO_ID);
      return true;
    });
  });

  test('throws INVALID_VIDEO_ID_FORMAT for a too-short ID', () => {
    assert.throws(() => extractYouTubeVideoId('https://youtu.be/short'), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.INVALID_VIDEO_ID_FORMAT);
      return true;
    });
  });

  test('throws INVALID_VIDEO_ID_FORMAT for an ID with illegal characters', () => {
    assert.throws(() => extractYouTubeVideoId('https://www.youtube.com/watch?v=abc$%^&*()!'), (err) => {
      assert.equal(err.code, YOUTUBE_ERROR_CODES.INVALID_VIDEO_ID_FORMAT);
      return true;
    });
  });
});

describe('validateYouTubeUrl (non-throwing wrapper)', () => {
  test('returns { valid: true, videoId } for a valid URL', () => {
    const result = validateYouTubeUrl(`https://youtu.be/${VALID_ID}`);
    assert.deepEqual(result, { valid: true, videoId: VALID_ID });
  });

  test('returns { valid: false, error } for an invalid URL', () => {
    const result = validateYouTubeUrl('https://vimeo.com/123456');
    assert.equal(result.valid, false);
    assert.equal(result.error.code, YOUTUBE_ERROR_CODES.UNSUPPORTED_HOST);
    assert.ok(typeof result.error.message === 'string' && result.error.message.length > 0);
  });
});

describe('isValidYouTubeUrl (boolean wrapper)', () => {
  test('returns true for a valid URL', () => {
    assert.equal(isValidYouTubeUrl(`https://www.youtube.com/watch?v=${VALID_ID}`), true);
  });

  test('returns false for an invalid URL', () => {
    assert.equal(isValidYouTubeUrl('not a url at all'), false);
  });

  test('returns false for an empty string', () => {
    assert.equal(isValidYouTubeUrl(''), false);
  });
});
