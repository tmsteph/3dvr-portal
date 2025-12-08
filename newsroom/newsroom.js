const feedSources = {
  'open-web': {
    label: 'Tech',
    url: 'https://api.rss2json.com/v1/api.json?rss_url=' +
      encodeURIComponent('https://www.theverge.com/rss/index.xml')
  },
  immersive: {
    label: 'XR & Play',
    url: 'https://api.rss2json.com/v1/api.json?rss_url=' +
      encodeURIComponent('https://www.roadtovr.com/feed/')
  },
  community: {
    label: 'Community',
    url: 'https://api.rss2json.com/v1/api.json?rss_url=' +
      encodeURIComponent('https://hnrss.org/frontpage')
  }
};

const feedCards = Array.from(document.querySelectorAll('[data-feed]'));

function formatDate(dateString) {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function setStatus(card, message) {
  const status = card.querySelector('[data-feed-status]');
  if (status) {
    status.textContent = message;
  }
}

function renderItems(card, items = []) {
  const list = card.querySelector('[data-feed-list]');
  if (!list) return;
  list.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No stories found yet. Try refreshing in a moment.';
    empty.className = 'feed-card__status';
    list.appendChild(empty);
    return;
  }

  items.slice(0, 8).forEach((item) => {
    const listItem = document.createElement('li');
    listItem.className = 'feed-card__item';

    const link = document.createElement('a');
    link.href = item.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.title || 'Untitled story';

    const meta = document.createElement('div');
    meta.className = 'feed-card__meta';

    const date = document.createElement('span');
    date.textContent = formatDate(item.pubDate);

    const tag = document.createElement('span');
    tag.className = 'feed-card__tag';
    tag.textContent = item.tag || feedSources[card.dataset.feed]?.label || 'Feed';

    meta.appendChild(date);
    meta.appendChild(tag);

    listItem.appendChild(link);
    if (item.description) {
      const description = document.createElement('p');
      description.className = 'feed-card__summary';
      description.textContent = item.description.replace(/<[^>]+>/g, '').slice(0, 140) + '…';
      listItem.appendChild(description);
    }
    listItem.appendChild(meta);
    list.appendChild(listItem);
  });
}

function fetchFeed(card) {
  const feedKey = card.dataset.feed;
  const source = feedSources[feedKey];
  if (!source) {
    setStatus(card, 'Unknown feed.');
    return;
  }

  setStatus(card, 'Fetching fresh stories…');

  fetch(source.url)
    .then((response) => response.json())
    .then((data) => {
      if (!data || !Array.isArray(data.items)) {
        throw new Error('No items returned');
      }
      const cleanedItems = data.items.map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        description: item.description,
        tag: source.label
      }));
      renderItems(card, cleanedItems);
      setStatus(card, `Updated · ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    })
    .catch((error) => {
      console.error('Feed error', error);
      setStatus(card, 'Feed is quiet right now. Try again in a moment.');
      renderItems(card, []);
    });
}

function attachRefreshHandlers() {
  document.querySelectorAll('[data-feed-refresh]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('[data-feed]');
      if (card) {
        fetchFeed(card);
      }
    });
  });

  const refreshAll = document.querySelector('[data-refresh-all]');
  if (refreshAll) {
    refreshAll.addEventListener('click', () => {
      feedCards.forEach(fetchFeed);
    });
  }
}

if (feedCards.length) {
  feedCards.forEach(fetchFeed);
  attachRefreshHandlers();
}
