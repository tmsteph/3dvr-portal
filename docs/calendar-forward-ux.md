# 3DVR Calendar: forward-first UX

The calendar is a time-navigation tool, not a paper calendar replica.

## Product principles

- Default to **what is next**, not the start of the current month.
- The primary horizons are **7 days** and **4 weeks**.
- Keep the past out of the primary navigation; the back control stops at today.
- Treat **start and end times** as primary event information.
- Preserve readable times at every zoom level, including narrow mobile screens.
- Make a zoomed-out event open its exact detail in one tap or key action.
- Keep creation progressive: one clear Add event action, advanced options collapsed.
- Connected calendars should feel like sources, not separate calendar products.
- Reliability beats cleverness: stale auth and partial sync data must never masquerade as healthy state.

## Interaction model

1. Open on the next 7 days.
2. Swipe horizontally to move through upcoming days.
3. Switch to 4 Weeks for forward planning without showing historical dates.
4. Tap an event chip to focus its detailed event card.
5. Use Today to return to the present instantly.

## Next candidates

- Up Next card with countdown and location/travel context.
- Conflict and free-time visualization across connected calendars.
- Natural-language quick add (for example, “A1 Friday 8–4”).
- Calendar/source filters with work, family, appointments, and tasks.
- Home-screen widgets and stronger notification controls.
