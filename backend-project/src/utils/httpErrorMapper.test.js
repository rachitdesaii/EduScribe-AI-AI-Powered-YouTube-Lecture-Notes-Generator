import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { mapErrorCodeToStatus } from './httpErrorMapper.js';

describe('mapErrorCodeToStatus', () => {
  const cases = [
    // youtubeValidator.js codes
    ['EMPTY_URL', 400],
    ['INVALID_URL_FORMAT', 400],
    ['UNSUPPORTED_HOST', 400],
    ['MISSING_VIDEO_ID', 400],
    ['INVALID_VIDEO_ID_FORMAT', 400],
    // transcript.service.js codes
    ['INVALID_VIDEO_ID', 400],
    ['VIDEO_NOT_FOUND', 404],
    ['PRIVATE_VIDEO', 403],
    ['NO_TRANSCRIPT_AVAILABLE', 422],
    // gemini.service.js codes
    ['MISSING_API_KEY', 500],
    ['EMPTY_TRANSCRIPT', 422],
    ['AUTH_ERROR', 500],
    ['INVALID_REQUEST', 500],
    ['RATE_LIMITED', 429],
    ['SERVER_ERROR', 502],
    ['EMPTY_RESPONSE', 502],
    ['INVALID_RESPONSE_FORMAT', 502],
    // shared codes
    ['NETWORK_ERROR', 502],
    ['UNKNOWN_ERROR', 500],
  ];

  for (const [code, expectedStatus] of cases) {
    test(`maps ${code} -> ${expectedStatus}`, () => {
      assert.equal(mapErrorCodeToStatus(code), expectedStatus);
    });
  }

  test('defaults to 500 for an unrecognized code', () => {
    assert.equal(mapErrorCodeToStatus('SOMETHING_MADE_UP'), 500);
  });

  test('defaults to 500 for undefined', () => {
    assert.equal(mapErrorCodeToStatus(undefined), 500);
  });
});
