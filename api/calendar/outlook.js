function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function validateIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function prepareEventDates(start, end) {
  const normalizedStart = validateIsoDate(start);
  const normalizedEnd = validateIsoDate(end);
  if (!normalizedStart || !normalizedEnd) {
    return null;
  }
  if (new Date(normalizedEnd) <= new Date(normalizedStart)) {
    return null;
  }
  return { start: normalizedStart, end: normalizedEnd };
}

function getBaseUrl(mailbox) {
  const suffix = mailbox ? `users/${encodeURIComponent(mailbox)}` : 'me';
  return `https://graph.microsoft.com/v1.0/${suffix}`;
}

async function listEvents(body) {
  const accessToken = body.accessToken?.trim();
  if (!accessToken) {
    return { status: 400, payload: { error: 'Access token is required.' } };
  }
  const params = new URLSearchParams({
    $orderby: 'start/dateTime'
  });
  if (body.maxResults) {
    const limit = Math.min(Math.max(Number(body.maxResults) || 1, 1), 100);
    params.set('$top', String(limit));
  }
  let url = `${getBaseUrl(body.mailbox?.trim())}/events`;
  if (body.timeMin && body.timeMax) {
    const start = validateIsoDate(body.timeMin);
    const end = validateIsoDate(body.timeMax);
    if (!start || !end) {
      return { status: 400, payload: { error: 'Invalid time range provided.' } };
    }
    const rangeParams = new URLSearchParams({
      startDateTime: start,
      endDateTime: end
    });
    if (params.has('$top')) {
      rangeParams.set('$top', params.get('$top'));
    }
    rangeParams.set('$orderby', 'start/dateTime');
    url = `${getBaseUrl(body.mailbox?.trim())}/calendarView?${rangeParams.toString()}`;
  } else if (params.toString()) {
    url = `${url}?${params.toString()}`;
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data?.error?.message || 'Unable to load Outlook events.';
    return { status: response.status, payload: { error } };
  }
  return {
    status: 200,
    payload: {
      events: Array.isArray(data.value) ? data.value : []
    }
  };
}

async function createEvent(body) {
  const accessToken = body.accessToken?.trim();
  if (!accessToken) {
    return { status: 400, payload: { error: 'Access token is required.' } };
  }
  const range = prepareEventDates(body.start, body.end);
  if (!range) {
    return { status: 400, payload: { error: 'Valid start and end datetimes are required.' } };
  }
  const eventPayload = {
    subject: body.title || 'Untitled event',
    body: {
      contentType: 'HTML',
      content: body.description || ''
    },
    start: {
      dateTime: range.start,
      timeZone: body.timeZone || 'UTC'
    },
    end: {
      dateTime: range.end,
      timeZone: body.timeZone || 'UTC'
    }
  };
  const response = await fetch(`${getBaseUrl(body.mailbox?.trim())}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: `outlook.timezone="${body.timeZone || 'UTC'}"`
    },
    body: JSON.stringify(eventPayload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data?.error?.message || 'Unable to create Outlook event.';
    return { status: response.status, payload: { error } };
  }
  return { status: 200, payload: { event: data } };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const action = req.body?.action;
  try {
    if (action === 'listEvents') {
      const result = await listEvents(req.body || {});
      return res.status(result.status).json(result.payload);
    }
    if (action === 'createEvent') {
      const result = await createEvent(req.body || {});
      return res.status(result.status).json(result.payload);
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('Outlook calendar proxy error', err);
    return res.status(500).json({ error: 'Unexpected server error.' });
  }
}
