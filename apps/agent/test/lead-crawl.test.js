const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSearchQueries,
  parseDuckDuckGoResults,
  resolveSearchResultUrl,
} = require('../thomas-agent/node/lead-crawl');

test('search queries target concrete business types instead of broad service pages', () => {
  const queries = buildSearchQueries('San Diego, CA', 'service');

  assert.equal(queries.length, 4);
  assert.match(queries.join('\n'), /auto repair/);
  assert.match(queries.join('\n'), /hair salon/);
  assert.doesNotMatch(queries.join('\n'), /^service San Diego/);
});

test('DuckDuckGo result parsing keeps business sites and rejects government and directory noise', () => {
  const businessUrl = 'https://coastalautoworks.example/contact';
  const redirect = `https://duckduckgo.com/l/?uddg=${encodeURIComponent(businessUrl)}`;
  const html = [
    `<a class="result__a" href="${redirect}">Coastal Auto Works</a>`,
    '<a class="result__a" href="https://www.sandiego.gov/">City of San Diego Official Website</a>',
    '<a class="result__a" href="https://www.yelp.com/search?find_desc=Auto+Repair">Best 10 Auto Repair Near Me</a>',
    '<a class="result__a" href="https://independentlandscape.example/">Independent Landscape Co.</a>',
  ].join('\n');

  const results = parseDuckDuckGoResults(html);

  assert.deepEqual(results.map((result) => result.name), [
    'Coastal Auto Works',
    'Independent Landscape Co.',
  ]);
  assert.equal(results[0].link, businessUrl);
});

test('DuckDuckGo redirect resolution rejects internal search links without a destination', () => {
  assert.equal(resolveSearchResultUrl('https://duckduckgo.com/l/?foo=bar'), '');
});
