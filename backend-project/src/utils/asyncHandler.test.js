import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { asyncHandler } from './asyncHandler.js';

describe('asyncHandler', () => {
  test('calls the wrapped handler normally when it resolves', async () => {
    let called = false;
    const handler = asyncHandler(async (req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    });

    const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    let nextCalledWith = 'not-called';
    const next = (err) => { nextCalledWith = err; };

    await handler({}, res, next);

    assert.equal(called, true);
    assert.equal(res.statusCode, 200);
    assert.equal(nextCalledWith, 'not-called');
  });

  test('forwards a rejected promise to next(err) instead of throwing', async () => {
    const boom = new Error('boom');
    const handler = asyncHandler(async () => {
      throw boom;
    });

    let receivedError;
    const next = (err) => { receivedError = err; };

    await handler({}, {}, next);

    assert.equal(receivedError, boom);
  });
});
