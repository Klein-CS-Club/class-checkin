# Handoff

Newest round first. Each round: what landed (with `seats` shas), what is open, what Nam decided. Made-up names only.

## Round 2 (2026-11-07): late joiners, the modal Tab trap, the closed kiosk

### What Nam decided (OPEN-ASKS, Ready for round 2)
- Keep Tab inside an open modal (seat 4).
- A student added later is not marked Absent on days before they joined, and the teacher can still edit those days (seats 1 and 3).
- The kiosk Restroom tab should say why a name can't join the waitlist once trips have closed. Nam picked "the reason in place of the button" (seat 2); the hint line text stays as it was.

### Landed on `seats`
Seat 1 (data and rules):
- `60e14c7` feat(store): don't mark late joiners absent before they joined. New status key `'notadded'`, label `STATUSES.notadded = 'Not added yet'`. `statusFor` returns it on a date before the student's `addedOn` when that day has no teacher edit and no check-in. An edit (P / L / A) wins and undoing it goes back to Not added yet; `markRestPresent` skips it. `studentHistory` shows a pre-`addedOn` day only if it has an edit or a check-in; counts keep the same four keys. Students without `addedOn` (older saves and backups) are unchanged. No new saved field. 46 tests; one test moved from 2020-01-01 to yesterday because test students now have an `addedOn`.
- `0063ed0` docs(seats): seat 1 next-session prompt. Seat 1 left the room afterwards (Nam's call).

Seat 2 (kiosk):
- `e8528a8` feat(kiosk): say why a restroom name can't join the waitlist. Once trips have closed, each Restroom-tab row shows plain gray text, "Class is over" after the end or "Trips closed" in the last minutes, in place of the dead "Join waitlist" button. Hint line and blue note unchanged; reuses `.kiosk-done`; no store or CSS change. Rows outside the pressable list no longer get the blue highlight. I'm back, Go now and the Session card still work after close.
- `e171cf8` docs(seat2): seat 2 next-session prompt.

Seat 3 (teacher pages):
- `50b27ab` fix(restroom): gray names not on the roster yet. `'notadded'` joins `'notyet'` and `'absent'` in the gray-name list on the Restroom tab. `attendance.js` needed no change: the stat cards already leave it out, P / L / A save an edit with Edited · Undo, Mark rest present skips it, and Export CSV writes the Status as "Not added yet" with empty Check-in time and Minutes late.
- `0202e49` docs(seat3): seat 3 next-session prompt.

Seat 4 (looks):
- `fe4c45b` feat(modal): keep tab inside the open modal. `js/modal.js` only; the `openModal` / `confirmDialog` API is the same. Tab and Shift+Tab cycle inside the top modal (a confirm over another modal gets the focus); Esc, backdrop click and focus return are unchanged.
- `7e1a44f` style(status): `.status-notadded { color: var(--muted) }`, same as Not yet. No new token.
- `359d166` docs(seat4): seat 4 next-session prompt.

Seat 5 (export):
- `72389af` test(csv): round-trip names with commas and quotes. Tests only; `js/csv.js` unchanged. 47 tests pass.
- `1e935c5` docs(seat5): seat 5 next-session prompt. Restroom export checked again end to end on a fresh port (BOM, CRLF, header, Trip order, still-out row).

Seat 6 (docs):
- `1edd292` docs(readme): describe late joiners and closed kiosk rows.
- `0cbdaad` docs(product): add not added yet and the closed kiosk text.

### UI changes to see this round
- **Not added yet** (`60e14c7`, `7e1a44f`): Classes -> add a student -> Attendance, step ‹ to a past day. The row says "Not added yet" in gray, the four cards leave it out, P / L / A still work and Undo goes back.
- **Gray name on the Restroom tab** (`50b27ab`): the same late joiner on a past day, Attendance -> Restroom tab.
- **Tab stays in the window** (`fe4c45b`): click a name on Attendance, press Tab and Shift+Tab (only the close button); Settings -> Restore a backup (confirm box); kiosk -> Teacher (PIN pad). Focus never reaches the sidebar.
- **Closed kiosk rows** (`e8528a8`): Settings -> Open Period 7 demo, clock 2:50 PM or 3:00 PM, Start check-in, Restroom tab.

### Open
- Neither export has been opened in Sheets or Excel by a seat (for Nam).
- The history window on a phone was only checked in a 390px frame (for Nam, on a real phone).
- On a late joiner's past day the four counts add up to less than the roster. That is the ask: Not added yet is in none of them.
- Pre-join days with only a restroom trip (no edit, no check-in) are left out of the history's day list.
- The Tab trap code path for text inputs (Classes add and edit boxes) was not walked with real keys; same code as the history modal, PIN pad and confirm.
- `scripts/worktree-sync.sh` refuses a worktree where `nextsessions/NEXT-PROMPTS.md` is deleted; seats 2 to 5 restored it with `git checkout` and synced. Seat 6 regenerates it last.

### Seat 6 (checks and docs): what I checked
- Baseline on 8136 (seats 8d93b80): kiosk type + Enter, Not you?, Restroom tab; Period 7 demo at 1:59 (waitlist only), 2:10 (go), waitlist, I'm back, Go now, override with a reason ("Teacher override: ..." shows on the trip); name click on all three teacher pages, Esc closes and focus returns; Download backup (44 trips, 218 check-ins, 4 classes). 44 tests pass.
- Review (own lane, no network, no `localStorage` outside `store.js`, made-up names): `60e14c7` reads right (old saves have no `addedOn` so nothing changes), `fe4c45b`, `7e1a44f`, `50b27ab`, `e8528a8` all clean. `node --test` 47 pass at the final head.
- Tab trap with real key presses on 8136: history modal (focus goes to the close button and stays), Shift+Tab stays, Esc closes and returns focus to the name; kiosk Teacher PIN pad after 20 Tabs: focus still inside.
- Kiosk after close (real clock, Period 1 after class): every Restroom row says "Class is over" in gray (4.83:1 on white), hint line and note unchanged, tapping names saves nothing, no name links on the kiosk.
- Old data on a fresh port (8137): restored the "before" backup (4 classes, 218 check-ins, 44 trips, 3 overrides, 1 finalized day): same counts. Restored a hand-made old backup (no `trips`, `queue`, `startTime`, `addedOn`; one class with `lateAfter`): it loads, `lateAfter` became the start time with 0 late minutes, the 9:07 check-in is Late (2 min), nothing lost. Download backup then Restore: identical classes and check-ins. Adding a student on that old save and stepping back a day shows "Not added yet" in gray for the new student and Absent for the old ones.
- Browser notes: tabs go blank after a reload or a cross-origin navigate (open a fresh tab); closing the first tab of the Chrome group ends the group, so call `tabs_context_mcp` with `createIfEmpty` again; Downloads is shared by every seat, and a backup can show as a hidden `.com.brave.Browser.*` file that is gone a few seconds later, so copy it right away; port 8137 held a leftover save from an earlier session, so clear only the `class-checkin-v1` keys there before an old-data check.

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
