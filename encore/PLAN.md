# Encore — Venue Mode: v1 and the plan for the rest

Written 2026-11-09, alongside the v1 build. Thomas's ask: an Encore game that
maps the different hotels, takes in Lighthouse info, and shows the events
going on — with a plan for whatever v1 does not implement.

## What v1 implements

- **One self-contained page** at `encore/index.html`, a mode of the combined
  3DVR game in the same pattern as Preserve / Valley / Companion Quest /
  Corner Office: dependency-free, silent, phone-first, no build step, and no
  card on `games.html` (the combined shell adopts it as the Encore mode).
- **A drawn map of San Diego's coast and bay** with the three venues Thomas
  actually works as pins: Manchester Grand Hyatt (property 9036), Hyatt
  Regency Mission Bay (3819), Gaylord Pacific (4494). Click a pin and his
  character drives the bay road and walks in. The map is labeled honestly:
  these are *his* venues. IATSE Local 122's Encore agreement covers 24 venues
  across San Diego County; v1 maps the three in his verified rotation.
- **Venue interiors** as open top-down ballroom floors (airwalls are drawn,
  not walls — the rooms are divisible spaces): Manchester shows Expo Hall and
  the Harbor Ballroom; Mission Bay shows Bayview I & II; Gaylord shows the
  California Ballroom with its 2–8 sections. Plus the working furniture of
  his life: stage, FOH booth, loading dock.
- **His character in Encore blacks** with a headset, drawn from the shared
  3DVR character spec. The roster and creator are the same as every other
  mode, with the same storage mirroring (own `encore.*` keys, the sibling
  modes' stores, and the shell's `world.character.v1`), so a character made
  anywhere walks onto a show floor here as the same person, just in blacks.
- **Events from Lighthouse, as data**: the mode reads `encore/events.json`
  and renders a "What's On" panel — his shows with job number, show name,
  room, date, role, and shift times. The shipped file is a snapshot of his
  verified record as of 2026-11-09 (Job #19615, Clarion Connexa at Mission
  Bay, Bayview I & II, is the anchor), with an embedded copy of the same
  snapshot in the page as a fallback if the fetch ever fails. Walking into
  an event room opens its flowsheet card, gear lines and all.
- **Controls**: mouse-first (click to travel, click to walk), tap is the
  same thing, WASD / arrows work too. Leave it alone for ten seconds and
  ambient mode takes over: he wanders the floor like a tech between cues.
  Two crew NPCs in blacks drift around the venue with the occasional quiet
  "Check, one two."

## What v1 deliberately does not implement

Each item: what it is, why it is not in v1, and what unlocks it.

1. **A live Lighthouse feed.** The game should read fresh `events.json`
   written by a scheduled scrape of Lighthouse My Schedule and the
   flowsheets, on the same pattern as the existing daily Encore→IATSE
   availability sync (encore lane, read-only, fail-silent, as-of stamp on
   the file so staleness is always visible). Not in v1 because the scrape
   does not exist yet and the lane session expires: a feed that silently
   serves week-old shows is worse than an honest snapshot.
   *Unlock*: Thomas's call on freshness (daily is probably right; his
   schedule firms up days ahead) and on letting a scheduled job hold the
   Lighthouse session warm, with the known recovery path (email-only
   sign-in; an Authenticator tap from Thomas if the tenant challenges).
2. **Venue-wide event listings.** V1 shows *his* events only, never every
   client's show at a venue. Two reasons: his Lighthouse views are scoped
   to his properties and schedule, and show names are client business —
   this portal is a public repo, and a client's conference name is not
   ours to publish just because it is on his flowsheet.
   *Unlock*: an explicit decision from Thomas plus a redaction rule (his
   shows named; everything else as anonymous "Private event" blocks), or
   gating the full feed behind the member sign-in the portal already has.
3. **Interiors for all 24 venues.** V1 draws the three floors he works.
   The other 21 need the Local 122 venue roster and at least a rough
   floor plan each; inventing ballrooms helps nobody.
   *Unlock*: the venue list from the Local or Encore, then grow the map
   organically — add a venue's floor the first time a real flowsheet puts
   him in it, drawn from that sheet.
4. **Crew NPCs from real flowsheets.** Flowsheets name his actual crew
   (the Clarion sheet lists Cory Pallanck; Sunday's added Aaron Pavlica).
   V1's NPCs are generic crew in blacks. Putting real coworkers in the
   game by name should be a deliberate, comfortable choice, not a scrape
   side effect.
   *Unlock*: Thomas's comfort call; the feed already carries a `crew`
   array per event, so the moment he says yes, NPCs spawn with names and
   roles from the sheet he is actually working.
5. **A clock-in tie-in.** The natural joke — walk to the venue in game,
   clock in for real — is not safe to wire yet. The current TouchBase web
   clock's post-badge behavior is still unmapped (a badge entry may itself
   record a punch), and the whole clock is being retired: the UKG Pro
   replacement launches **December 7** with company access code
   `Encoreglobal`, and UKG Pro sign-in is verified working.
   *Unlock*: the Dec 7 launch, then a deep link from the game to the real
   clock. The game should never punch for him; it can walk him to the
   door, he taps the button.
6. **Travel-time realism.** In v1 the drive between venues takes seconds.
   Real drives (Mission Bay to downtown ~15 minutes, downtown to Gaylord
   Pacific ~25) could cost in-game time against a shift-start clock,
   which turns the map into a planning toy: can he make a 7 AM call at
   Gaylord after a Mission Bay strike?
   *Unlock*: a design call from Thomas on whether travel should cost
   anything; the road path and distances are already in the map data.
7. **Multiplayer / crew presence.** Other techs as live players needs a
   presence layer. The portal's Gun relay exists, but presence, identity,
   and the house bot-ethics rule (a bot never pretends to be a person)
   need thought before real people's dots appear on a map of their
   workplace.
   *Unlock*: after the combined shell settles and items 1 and 4 land;
   presence rides the same feed and roster.

## Follow-up order (value per effort)

1. **Live feed** (item 1) — turns a snapshot into the real thing; the
   sync pattern, lane, and read paths already exist for the IATSE job.
2. **Crew NPCs from flowsheets** (item 4) — small lift once the feed
   exists; makes the floor feel like *his* floor.
3. **Clock-in deep link** (item 5) — calendar-gated to Dec 7; tiny build,
   daily usefulness.
4. **More venues as he works them** (item 3) — incremental, one floor
   plan at a time, always grounded in a real sheet.
5. **Redacted venue-wide listings** (item 2) — only with the privacy
   rule settled first.
6. **Travel-time costs** (item 6) — a flavor decision, cheap to add.
7. **Multiplayer presence** (item 7) — the biggest build; last.

## Data and privacy note

`events.json` contains Thomas's own work schedule: venue, room, show name
for *his* shows, role, and times. That is the same information his
calendar and the IATSE availability grid already carry, and he asked for
it in the game explicitly. It contains no client contacts, no rates, no
crew contact details. If the venue-wide expansion (item 2) ever happens,
the redaction rule above is the price of admission.

## Maintenance

Until the feed lands, updating the game is editing `encore/events.json`
(one object per shift; `job` and `show` may be null until the flowsheet
lands) and bumping `asOf`. The page's embedded fallback snapshot should be
refreshed in the same edit — the test suite checks that the fallback and
the JSON agree on Job #19615.
