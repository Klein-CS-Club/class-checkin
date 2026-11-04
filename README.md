# Class Check-in

A classroom attendance and restroom app for one teacher. It extends the original plain HTML,
CSS and JavaScript app: no build step, package installation, backend, database or login.
**All data stays in this browser on this device. There is no synchronization.** Export attendance
regularly; clearing site data removes records. Use one open app tab per device to avoid conflicting writes.

## Run

```sh
python3 serve.py
```

The no-cache development server uses port 8130. Use `python3 serve.py 8140` for another port.
Serve over HTTP; ES modules do not work from `file://`. Live processes must restart after cloud snapshots.

## Set up a real classroom

1. In **Settings**, set the school's IANA timezone, such as `America/Chicago`. The app does not
   infer a school timezone from the tablet. Set restroom capacity and the opening restriction.
2. In **Classes**, add or edit periods and rosters. Paste one student name per line or import CSV.
   Names are normalized, and duplicates are skipped as before.
3. Choose **Bell schedule** on each class. Enable the relevant weekdays, enter start/end times,
   and set the grace period. Optional date overrides take precedence, including closed dates.
   Schedules must start and end on the same school date; overnight classes are not supported.
4. Select a period in the sidebar. The session header shows its selected school date, schedule,
   actual late cutoff, timezone and live phase. **Go to current period** is explicit; time passing
   never changes the selected class. Overlapping configured periods choose the first matching class.

The original three sample classes are retained on a new install. They have no invented full bell
schedule. Configure them or add real classes. The separate Period 7 demo below supplies example times.

## Attendance and restroom workflow

Attendance and Restroom tabs share the selected period and date. Arrival timestamps, overrides,
trips, waitlist order and the selected session survive refreshes. Change dates with Previous/Next
or the date picker. A session is one class on one school date.

- Record arrival from the roster, the kiosk, or the dedicated scan input. An arrival **at or before
  the exact cutoff** is Present; later is Late. Minutes late are rounded up from scheduled start,
  not from the grace cutoff. A repeated arrival preserves its original timestamp.
- Unchecked students stay **Not yet checked in**, even after class. **Finalize attendance** confirms
  marking them Absent; undo finalization restores the automatic state. P/L/A edits are visibly labeled
  status-only overrides, with individual undo. Historical edits never invent arrival timestamps.
- Export CSV includes arrival time, minutes late from start, override indication and school timezone.
- **Request restroom** adds a FIFO request. **Mark out** confirms an actual departure. At capacity or
  during the opening restriction, requests can wait but ordinary departure is disabled. When a student
  returns, the next eligible request is highlighted; it is never automatically marked out.
- The default opening restriction means **no ordinary departures during the first 10 minutes after
  scheduled start**. It does not restrict attendance. Exactly at ten minutes, departure becomes eligible.
  Change or disable this rule in Settings (0 disables). An emergency **Teacher override** requires a
  reason, recorded visibly with the trip; it may bypass the restriction, capacity or FIFO.
- Returns remain possible during the restriction and after class, including unresolved earlier-date
  sessions. Class ending never closes a trip. Open its original date to resolve it. An active trip cannot
  be duplicated in a later session, even with an override.
- Metrics distinguish trips from unique students, and completed-trip time from time including active trips.
  Student totals show trips and cumulative time. Durations derive from timestamps, with no writes per tick.

## Scanner and labels

Each roster enrollment has a stable unique identifier. **Classes → Print barcode labels** creates
Code 39 labels containing only that identifier, with student name and readable ID underneath.
Adjust dimensions (minimum 55 × 30 mm; default 80 × 35 mm), then print at **100% scale**.
The generated PDF layout has been checked; physical printers, label stock and scanners have not.
Test one label first. Avoid scaling that makes narrow bars too small for the scanner.

Use a USB/Bluetooth keyboard-wedge scanner with **Code 39 enabled**, no check digit requirement,
and an **Enter suffix**. Focus the dedicated **Student scan identifier** input. Choose an explicit mode:

- **Attendance** records one arrival.
- **Restroom departure** marks out if eligible; otherwise joins the queue. Already-waiting students
  can depart with another scan once eligible (after the 1.5-second duplicate suppression window).
- **Restroom return** resolves an active trip in the selected session.

Unknown IDs, unenrolled students, duplicate scans, already-out/waiting students, and returns without
an active trip get visible feedback. Ordinary form typing is never captured globally. Scan input
clears after submission; manual roster actions and kiosk name search remain available. Camera scanning
is not implemented. The default kiosk exit PIN is **1234**; change it in Settings. This is a casual-tap
barrier, not authentication. Restroom overrides are teacher workflow actions, not an audited login system.

## Period 7 demo walkthrough

1. **Settings → Open Period 7 demo**. This adds or opens a clearly labeled fictional class without
   replacing existing classes. It uses America/Chicago and a sample 14:00–15:00 schedule with 5-minute
   grace, capacity one, and a 10-minute restriction. These demo rules are isolated from real settings.
2. Expand **Period 7 demo time controls**. The frozen clock affects this class only. Use **13:59** for
   before-start, **14:00** for an on-time arrival, **14:05** for exact cutoff, and **14:06** for late.
   Use different students to compare. Scan IDs are shown in Classes and on printable labels.
3. At **14:09**, request restroom for Alex and Jordan; both wait. At **14:10**, Alex becomes eligible.
   Mark Alex out; Jordan keeps waiting because capacity is full. Add another student to test FIFO.
4. At **14:15**, mark Alex returned. Jordan is highlighted, still waiting until departure is confirmed.
   Let Alex request again to test multiple trips. Use Teacher override with a reason to test an emergency.
5. Reload during an active trip; change tabs, dates or periods; confirm session data stays separate.
   At **15:01**, an active trip stays unresolved. Mark it returned explicitly.
6. **Reset only demo** removes only Period 7's records and recreates its fictional roster/schedule/clock.
   Clock rewinds before an existing trip are rejected; reset first to repeat scenarios. The custom time
   input supports other times on the selected date. Opening existing demo uses its frozen school date.

## Persistence and migration

The existing `class-checkin-v1` localStorage key now carries schema `version: 2`.
Before the first successful legacy migration, its exact original JSON is copied to
`class-checkin-v1-backup`. Migration preserves classes, names, PIN, timestamps, date keys and
manual overrides; it adds scan IDs, explicit arrival session IDs, new settings and empty trip/queue state.
Historical dates are preserved, not reinterpreted in the new timezone. Migrated classes retain their
legacy cutoff fallback until a full schedule is configured. New arrivals require an explicit timezone
and schedule. Storage-write failures show a warning; changes remain in memory and may be lost on reload.
Unreadable saved JSON is preserved and ordinary writes are blocked until an explicit reset.
The app cannot recover data after the browser's storage is cleared. The demo reset never removes real records.

## Validation

No dependencies are needed for the model tests. Use Node 22+ (validated with Node 24):

```sh
node --test tests/workflow.test.js
```

The 24 tests cover exact arrival boundaries, duplicate IDs/scans, manual edits, finalization undo,
restroom opening boundaries, FIFO/capacity, emergency overrides, returns, multiple trips and metrics,
persistence/migration, school timezone/DST, schedule overrides, cross-session isolation and storage failure.

Optional browser integration check, with the server running and Playwright plus Chromium installed:

```sh
node tests/browser-smoke.cjs
```

`CHROMIUM_PATH` overrides `/usr/bin/chromium`. `CAPTURE_SCREENSHOTS=1` also writes desktop/tablet/mobile
captures under `/tmp`; the print check writes `/tmp/class-labels.pdf`. This uses an isolated browser
context and fictional test data. Keyboard entry is simulated; it does not establish physical scanner compatibility.
There is no build or bundling step.

## Main files

- `js/store.js`: persisted state, migrations, attendance and restroom transitions, demo fixture/clock.
- `js/session.js`: school timezone/calendar, schedule validation/resolution and duration formatting.
- `js/views/attendance.js`: shared session header, Attendance/Restroom tabs and actions.
- `js/views/scanner.js`, `js/barcode.js`, `js/views/labels.js`: explicit scan input and printable Code 39.
- `js/views/schedule.js`, `js/views/classes.js`, `js/views/settings.js`: schedule, roster and school configuration.
- `js/views/checkin.js`: existing kiosk with dedicated scanner fallback.
- `css/styles.css`: existing design tokens with responsive session/print layouts.

## Deploy a separate copy to your Vercel account

`vercel.json` builds a static `public/` directory containing only `index.html`, CSS and JavaScript.
No runtime functions, backend credentials or paid features are required for this static deployment.
Vercel Hobby's current account and usage restrictions still apply.

To deploy independently of the repository owner's Vercel project, use the Vercel CLI and select your
own personal account when linking a **new** project. Do not select an existing project belonging to
another account. A direct CLI upload does not require merging into the repository's main branch or
connecting the owner's Git integration.

```sh
git switch codex/classroom-attendance-restroom-workflow
npx vercel login
npx vercel --prod
```

In the prompts, choose your personal Hobby scope, create a new project, and use the current directory.
The committed configuration supplies the build/output settings. Keep `.vercel/` private and untracked;
it contains the local project link. Generated `public/` assets are also ignored.

A deployment on a new hostname has its own browser localStorage. Existing attendance data does not
move automatically to that hostname. This app has no server-side synchronization. Export important
attendance records from the old site before moving to the new site; CSV exports are reports, not a
full-fidelity data migration/import mechanism.
