import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicBearer } from '../src/graphql-bookmarks.js';

test('getPublicBearer prefers X_PUBLIC_BEARER override', () => {
  const original = process.env.X_PUBLIC_BEARER;
  process.env.X_PUBLIC_BEARER = 'override-token';
  try {
    assert.equal(getPublicBearer(), 'override-token');
  } finally {
    if (original === undefined) delete process.env.X_PUBLIC_BEARER;
    else process.env.X_PUBLIC_BEARER = original;
  }
});
