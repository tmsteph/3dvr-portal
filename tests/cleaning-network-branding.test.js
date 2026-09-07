import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPublicCleaningPartner } from '../src/cleaning-network/service.js';

describe('cleaning network partner branding', () => {
  it('exposes a safe custom service list and hero image for a configured company', () => {
    const profile = getPublicCleaningPartner({
      CLEANING_PARTNERS_JSON: JSON.stringify({
        'sparkle-co': {
          name: 'Sparkle Co',
          email: 'private-routing@example.com',
          serviceArea: 'San Diego County',
          heroImageUrl: 'https://images.example.com/sparkle.jpg',
          services: ['Homes', 'Offices', 'Rental turnovers', 'Homes'],
        },
      }),
    }, 'sparkle-co');

    assert.equal(profile.name, 'Sparkle Co');
    assert.equal(profile.heroImageUrl, 'https://images.example.com/sparkle.jpg');
    assert.deepEqual(profile.services, ['Homes', 'Offices', 'Rental turnovers']);
    assert.equal('email' in profile, false);
    assert.equal(JSON.stringify(profile).includes('private-routing@example.com'), false);
  });

  it('falls back to the network defaults for unsafe or unknown partner configuration', () => {
    const profile = getPublicCleaningPartner({
      CLEANING_PARTNERS_JSON: JSON.stringify({
        unsafe: {
          heroImageUrl: 'javascript:alert(1)',
          services: 'not-an-array',
        },
      }),
    }, 'unsafe');

    assert.equal(profile.heroImageUrl, '');
    assert.deepEqual(profile.services, [
      'Home cleaning',
      'Move in / move out',
      'Office / commercial',
      'Rental turnover',
    ]);
  });
});
