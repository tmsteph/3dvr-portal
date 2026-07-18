export const LIFE_CHECKINS_MIGRATION_KEY = 'portal-life-checkins-migration';
export const LIFE_CHECKINS_MIGRATION_VERSION = 'v1';

function text(value) {
  return String(value ?? '').trim();
}

export function getLegacyLocalIdentity(storage) {
  return text(storage.getItem('guestId')) || text(storage.getItem('userId'));
}

export function filterPrivateCheckins(entries, identity, migrationComplete) {
  const source = Array.isArray(entries) ? entries : [];
  const currentIdentity = text(identity);

  if (!migrationComplete) {
    const retained = currentIdentity
      ? source.filter((entry) => text(entry?.author) === currentIdentity)
      : [];

    return {
      entries: retained,
      removedCount: source.length - retained.length,
      migrated: true
    };
  }

  const retained = source.filter((entry) => {
    const author = text(entry?.author);
    return !author || author === currentIdentity;
  });

  return {
    entries: retained,
    removedCount: source.length - retained.length,
    migrated: false
  };
}

export function migrateLegacyCheckins(storage) {
  const source = parseStoredEntries(storage.getItem('portal-life-checkins'));
  const migrationComplete = storage.getItem(LIFE_CHECKINS_MIGRATION_KEY)
    === LIFE_CHECKINS_MIGRATION_VERSION;
  const result = filterPrivateCheckins(
    source,
    getLegacyLocalIdentity(storage),
    migrationComplete
  );

  if (result.migrated || result.removedCount > 0) {
    storage.setItem('portal-life-checkins', JSON.stringify(result.entries));
  }

  if (result.migrated) {
    storage.setItem(LIFE_CHECKINS_MIGRATION_KEY, LIFE_CHECKINS_MIGRATION_VERSION);
  }

  return result;
}

function parseStoredEntries(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
