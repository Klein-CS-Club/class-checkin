# Handoff

Newest round first. Each round: what landed (with `seats` shas), what is open, what Nam decided. Made-up names only.

## Round 1 (2026-11-07): student history and the restroom export

### What Nam decided
- Click a student's name to see their history. It shows attendance days and restroom trips, a one-line count, no charts, in a modal. Reference he gave: eHall Pass.
- The Restroom tab gets its own Export CSV: one row per trip, so a student with several trips has several rows.
- Backup and restore must keep working, old backups included.
- This reverses the old "no per-student history" line in PRODUCT.md. Charts, range views and reports are still out.
- Dropped: the kiosk fix for "Join waitlist" after trips close (seat 2 did no feature work).
- Seat 1 asked for, and got in its own chat, a new optional saved field: `students[].addedOn`.

### Landed on `seats`
Seat 1 (data and rules):
- `16a0fd6` feat(store): add a read-only student history. `studentHistory(classId, studentId)` returns `{ cls, student, days, trips, counts }`, or null. Nothing new is saved.
- `9643306` test(store): read history from old saves and backups.
- `6887c93` feat(seed): add past restroom trips to the demo. 41 finished trips over 5 past school days, one "Nurse pass" override, one student twice in a day per class. Demo check-ins unchanged (218).
- `a30006d` feat(store): start history from the day a student joined. Optional `students[].addedOn` (`YYYY-MM-DD`), set by `addStudents`. History days start there. Students from old saves and backups have none and keep every day.
- `85b15e4` docs(seats): seat 1 next-session prompt.

Seat 5 (export):
- `b5bb6d6` feat(csv): add restroom export rows. `RESTROOM_HEADER` and `restroomRows(cls, date, trips)` in `js/csv.js`. Rows sorted by time out, Trip numbered per student, a trip still out has no Back or Minutes out, a removed student shows as "Removed student". New `tests/csv.test.js`.
- `532d8c5` docs(seat5): seat 5 next-session prompt.

Seat 2 (kiosk): no code change. `checkin.js` and `app.js` are the same as on main.
- `1c30a7b` docs(seat2): seat 2 next-session prompt, and `644f1f3` docs(seat2): correct the demo clock note.

Seat 3 (teacher pages):
- `c6ea17d` feat(history): add student history modal. `js/views/history.js`, `openStudentHistory(classId, studentId)`: class name, one-line count ("Not yet" only if above 0), Attendance table, Restroom trips table, plain empty lines. Teacher pages only; the kiosk never imports it.
- `954a7c6` Attendance names, `d11ad95` Restroom Students-table names, `b0ff9de` Classes roster names: `button.name-link` opens the modal. Attendance and Restroom use `data-history` (not `data-student`, which would trigger the P/L/A override handler); Classes uses `data-a="history"`. Out now, Waitlist and Completed trips stay plain text (Nam's choice).
- `e76b83a` feat(restroom): export the day's trips as CSV. Export CSV shows on the Restroom tab and downloads `restroom-<slug>-<date>.csv` from `RESTROOM_HEADER` and `restroomRows`. The Attendance export is unchanged; the slug code is shared (`classSlug`).
- `6ff0e42` docs(seat3): seat 3 next-session prompt.

Seat 6 (docs):
- `48922d7` docs(readme): describe history and restroom csv.
- `b2a86ce` docs(product): allow a per-student history view.

Seat 4 (looks), Nam saw it on localhost and said yes in seat 4's chat. Only `css/styles.css` changed:
- `82293c3` style(table): add name-link button. `.name-link` has the same font, weight and color as the name it replaces (`.away` stays gray), underlines on hover, uses the global focus ring, keeps the ellipsis inside `.list-title`. Row heights and name widths unchanged.
- `5005de6` style(modal): add wide modal and history styles. `.modal-wide` is 720px, on phones a 12px gutter, body scrolls. `.history-counts`, `.history-section`, and `.history-table` (shares the `.table` rules, nowrap on every cell but the last). No new tokens or animations.
- `0d31921` docs(seat4): seat 4 next-session prompt.

### Open
- Attendance's past days still show a student who joined late as Absent before `addedOn`. Only the history skips those days (seat 1).
- Kiosk Restroom rows still say "Join waitlist" after trips have closed (`js/views/checkin.js`). Pressing it saves nothing and shows nothing on screen (the store refuses; only screen-reader text). The banner already says "Class is over". Seat 2 built a 3-line fix (the reason in the existing hint line); Nam said drop it, so it is not committed. A known small issue.
- Neither the Restroom export nor the attendance export has been opened in Sheets or Excel by a seat. Only the bytes were checked (UTF-8 BOM, CRLF, header, rows).
- `js/modal.js` has no Tab trap: Tab inside any modal leaves it for the sidebar after the close button. Old behavior, seat 4's file, needs Nam's yes (seat 4's next job). Esc and focus return work.
- The history window on a phone reuses the Attendance stacked-row layout (Label: value) and was not redesigned. Seats 4 and 6 checked it in a 390px iframe, not on a real phone (the Chrome window can't be resized).
- Demo clock presets earlier than the latest demo trip are refused on purpose (`setDemoClock`); the message shows under the buttons. Reset demo to start over. By design (seat 2 saw it first and thought it was a bug; seats 1 and 3 explained it).

### Seat 6 (checks and docs): what I checked
- Baseline on port 8136: kiosk check-in, Not you?, the Period 7 demo rules (2:06 blocked, 2:10 go, waitlist, I'm back, override with a reason), Attendance P/L/A, Finalize and undo, Download backup then Restore. All fine.
- Old data on a fresh origin (8137): restored the "before" backup (3 classes, 218 check-ins, 41 trips) and a hand-made backup from before trips and start times (class has `lateAfter`, no `trips`, `queue`, `startTime`). Both load, `studentHistory` reads them, nothing is lost, and Download backup then Restore gives an identical state.
- Walk of seats at `e76b83a` on 8136: name click opens the right history on Attendance, the Restroom Students table and Classes; Esc closes and returns focus to the name; Enter opens it from the keyboard. On the kiosk there are no name links and tapping names (both tabs) does nothing (seat 2 checked the same).
- Restroom Export CSV from the real button (Period 7 demo: one student with two trips, one override, one trip still out): `restroom-period-7-demo-2026-11-07.csv`, UTF-8 BOM, CRLF, columns Date, Class, Student, Trip, Out, Back, Minutes out, Override reason. Trip numbers follow time out, the still-out trip has an empty Back and Minutes out, 11m51s shows as 12. Attendance export unchanged.
- Re-walk with seat 4's CSS (`5005de6`) on 8136: at desktop width the window is 720px wide, no times wrap, no sideways scroll. In a 390px iframe it is 364px wide with a 12px gutter, no overflow in the page or the tables, the body scrolls. `node --test` 44 pass.
- Browser notes: a tab can go blank after a reload (open a fresh tab); the Chrome window can't be resized; in Brave the first download works at once, later ones can sit as a hidden temp file in Downloads for a while.
