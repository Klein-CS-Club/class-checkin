# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One teacher and the students in their class periods.

- **Students** check themselves in at the classroom door on a shared Chromebook (about 1366×768, with a keyboard), running the kiosk page unattended. They type part of their name and press Enter. The job is a few seconds long.
- **The teacher** opens the Attendance page during class, after students have checked in, and copies who is absent and who is late into Skyward by hand. Skyward assumes everyone is present, so only the exceptions matter.
- **Restroom trips** use the same kiosk: a student picks the Restroom tab, finds their name and leaves, or joins the waitlist when they can't go yet. The student who is out gets a Session card (time out, time in, running timer) with an I'm back button, and a student who joined the waitlist can leave it. The teacher watches the same queue on the Restroom tab and can override.

## Product Purpose

Replace calling names at the start of class. Students record their own arrival; the teacher gets the exceptions ready to enter into Skyward in a few seconds, without scrolling or hunting. Success is a check-in that takes one name and one keypress, and an attendance glance that shows absent and late students immediately.

## Positioning

A single-classroom tool that never sends student names anywhere. Everything lives in the browser on the device at the door: no account, no server, no sync. It does one job (check-in and the day's exceptions) and refuses to grow into a reporting system.

## Operating Context

- The kiosk runs all period on the Chromebook at the door, locked behind a teacher PIN (default 1234; casual-tap protection, not security).
- The teacher uses the same device and browser for Attendance, since data lives in that browser's `localStorage`.
- Skyward is the school's system of record; this app feeds it by hand. Export CSV (Date, Class, Student, Status, Check-in time) is a backup and a way to open the day in Sheets or Excel.
- Each class has a start time, an optional end time, a number of "late after" minutes and an optional "absent after" number (a single day can have its own times). Statuses come from check-in times against those cutoffs: Present, Late, Absent for an arrival past the absent cutoff, Not yet (hasn't checked in), and Absent for no check-in once the teacher finalizes the day or the day is over. The teacher can override with P / L / A and undo the override.
- Restroom trips are limited by capacity (default 1 student) and one number of minutes (default 10) set in Settings: no trips in the first or the last that many minutes of class. The last minutes only apply to a class with an end time, and nobody joins the waitlist once trips have closed. Students who are out can always come back. Students who can't go yet wait in line; the teacher can override with a reason.

## Capabilities and Constraints

- Plain HTML, CSS and JavaScript ES modules, no build step, no dependencies. Served locally with `python3 serve.py` (port 8130).
- **Everything stays local.** No backend, database, sync, accounts, analytics, third-party scripts or fonts. The page makes no network requests and student names never leave the device.
- Scope stays minimal: check-in, the day's attendance, restroom trips and the waitlist, classes/rosters, settings. No range views, per-student history, charts or reports. No barcodes, school timezone setting or weekly bell schedules; times use the device's clock.
- The kiosk shows check-in times but never late status to students.
- Pages: kiosk (`#/checkin`, with Check in and Restroom tabs), Attendance (`#/attendance`) and its Restroom tab (`#/restroom`), Classes (`#/classes`), Settings (`#/settings`, including a Support section with the computer science club's email as a `mailto:` link, never on the kiosk), plus a collapsible sidebar (260px or a 64px icon rail; phones always get the rail).

## Brand Commitments

- Name: **Class Check-in**.
- The design tokens inherited from the sibling cash-register project (`../cash-register-software`) are binding: navy primary, the present/late/absent status colors, the system font stack, radii and shadows defined in `:root` of `css/styles.css`.
- Check-in behavior follows the sibling `gdpt-checkin` project (accent-free, any-order name search).

## Evidence on Hand

- Demo data only: three made-up classes with a week of history (`js/seed.js`). No real student names, testimonials or school branding exist in the repo, and none should be invented.

## Product Principles

1. **Local first, always.** If a feature needs a network or a server, it doesn't belong here.
2. **Exceptions over everyone.** Attendance surfaces who to mark in Skyward; the present majority stays out of the way.
3. **One name, one keypress.** The kiosk is for a student in a hurry at the door; nothing should slow that down or let a scroll check in the wrong person.
4. **Say no to scope.** Simplicity is the feature; extra dashboards, history and charts were explicitly rejected.

## Accessibility & Inclusion

WCAG 2.2 AA: 4.5:1 text contrast, full keyboard operation (the kiosk is keyboard-first), visible focus, and screen-reader announcements for state changes such as check-ins.
