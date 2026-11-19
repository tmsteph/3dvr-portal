# Today, review-only start page

Additive `/today/` route in tmsteph/3dvr-portal, no root replacement. Uses existing Sky Room at `/sky-room/?embed=today`; normal page works if embed mode is unavailable. Existing Squat Timer, Guided Stretching, Meditation Garden and Game Hub remain canonical apps. No new reminders, permission prompts, account storage or duplicated timer cadence. No manifest or default start-screen change.

Run `node --test tests/today-home.test.js`. Tests cover destination references, no duplicated timer or active page scripts, embedding permission restrictions, and responsive/accessibility hooks. These are static checks, not browser interaction or notification-delivery proof. Verify desktop/mobile iframe layout, keyboard skip and links, unavailable-frame fallback, and back navigation in a supported browser before deployment. Game/fitness app behavior is unchanged.
