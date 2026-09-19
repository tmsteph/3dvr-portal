import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPostalAddress } from '../campaigns/address.js';

test('formats a compact US postal address consistently', () => {
  assert.equal(
    formatPostalAddress('33377 shockey tt. campo, ca 91906'),
    '33377 Shockey TT, Campo, CA 91906'
  );
});

test('normalizes commas, suffixes, and ZIP+4 formatting', () => {
  assert.equal(
    formatPostalAddress('123 main street   san diego, ca 921011234'),
    '123 Main St, San Diego, CA 92101-1234'
  );
});

test('keeps PO Box formatting useful', () => {
  assert.equal(
    formatPostalAddress('po box 42, campo, ca 91906'),
    'PO Box 42, Campo, CA 91906'
  );
});
