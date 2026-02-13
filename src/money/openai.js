export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

function parseJsonContent(choice = {}) {
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI response did not include assistant content.');
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`OpenAI returned non-JSON content: ${error.message}`);
  }
}

function buildPrompt({ market, budget, channels, keywords, signals }) {
  return [
    'You are an execution-focused micro-SaaS strategist.',
    'Return strict JSON with keys: opportunities, adDrafts, monetizationNotes.',
    'Each opportunity item must include: title, problem, audience, solution, mvp, suggestedPrice, painScore, willingnessToPay, speedToBuild, competitionGap, evidence.',
    'Each ad draft item must include: channel, headline, body, cta, linkedOpportunityId.',
    'Scores are integers between 0 and 100.',
    `Market focus: ${market}.`,
    `Weekly ad budget: ${budget}.`,
    `Preferred channels: ${channels.join(', ') || 'reddit, x, linkedin'}.`,
    `Keywords: ${keywords.join(', ') || market}.`,
    `Signals JSON: ${JSON.stringify(signals.slice(0, 12))}`
  ].join(' ');
}

export function createOpenAiMoneyClient({ apiKey, model = DEFAULT_OPENAI_MODEL, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('OpenAI API key is required for money-loop synthesis.');
  }

  return {
    async synthesize(payload = {}) {
      const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You prioritize practical opportunities that can ship this week and convert within 14 days.'
            },
            {
              role: 'user',
              content: buildPrompt(payload)
            }
          ]
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI error ${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const data = await response.json();
      return parseJsonContent(data?.choices?.[0]);
    }
  };
}
