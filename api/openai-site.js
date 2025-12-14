const DEFAULT_MODEL = 'gpt-4o-mini';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function buildPrompt() {
  return [
    'You are the 3dvr portal website generator.',
    'Return concise, production-ready HTML with inline CSS only.',
    'Keep markup semantic, accessible, and mobile-friendly.',
    'Do not reference external assets or scripts.',
    'Use calming palettes with sufficient contrast unless the prompt asks otherwise.'
  ].join(' ');
}

function parseChoice(choice) {
  const raw = choice?.message?.content;
  if (!raw) {
    throw new Error('No content returned from OpenAI.');
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.html) {
      throw new Error('HTML content missing from OpenAI response.');
    }

    return {
      title: parsed.title || 'AI Generated Site',
      html: parsed.html,
      summary: parsed.summary || 'Generated site content ready to publish.',
    };
  } catch (err) {
    throw new Error(`Failed to parse OpenAI response: ${err.message}`);
  }
}

export function createSiteGeneratorHandler(options = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    model = DEFAULT_MODEL,
    fetchImpl = globalThis.fetch,
  } = options;

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { prompt, apiKey: requestApiKey } = req.body || {};
    const effectiveApiKey = typeof requestApiKey === 'string' && requestApiKey.trim()
      ? requestApiKey.trim()
      : apiKey;

    if (!effectiveApiKey) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'A prompt string is required.' });
    }

    try {
      const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveApiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildPrompt() },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText || 'OpenAI error' });
      }

      const data = await response.json();
      const choice = data?.choices?.[0];
      const parsed = parseChoice(choice);

      return res.status(200).json({
        ...parsed,
        model,
        createdAt: Date.now()
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Unexpected error during site generation.' });
    }
  };
}

const handler = createSiteGeneratorHandler();
export default handler;
