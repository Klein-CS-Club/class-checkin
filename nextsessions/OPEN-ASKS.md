## Open asks (the backlog)

Seats take **Ready** items in their own lane once their numbered jobs are done: post "claiming: <item>" in the room first, one at a time. **Needs Nam** items wait for Nam's yes in that seat's own chat. Seats never add items; seat 6 keeps this list and puts room proposals under **Proposed**. Nam adds or moves items here himself.

### Ready (Nam said yes on 2026-11-07, for round 2)
- [seat 4] **Keep Tab inside an open modal** (`js/modal.js`): Tab and Shift+Tab cycle inside the open modal; Esc and focus return stay as they are. Post before you change it (every seat opens modals through it). Proof on 8134: Tab through the history modal, a confirm dialog and the kiosk's Teacher PIN box; focus never reaches the sidebar.
- [seat 1, then seat 3] **Late joiner on Attendance.** Nam: "I'd rather not mark them absent if the teacher didn't add them on earlier, and maybe she can edit them too. By just going back into the past of the attendance date on the dashboard."
  - Seat 1 (`store.js`): on a date before a student's `addedOn`, their status is neutral (not Absent, not Not yet) unless that day has a teacher edit (P / L / A) or a check-in. Edits still work on those dates. History lists such a day only when it has an edit or a check-in. Students without `addedOn` (older saves) don't change. Post the new status key and label before you commit; tests include an old save.
  - Seat 3 (`attendance.js`): show that status plainly, leave it out of the Present / Late / Absent / Not yet counts, keep P / L / A working on it, and Mark rest present skips it. Post how Export CSV writes it before you commit.
- [seat 2] **Kiosk Restroom tab after trips close.** Today every row still says "Join waitlist" and pressing it shows nothing. Nam: "do not replace the text in the hint line, and also make it more prominent as well." First look in Chrome at how other apps show a "you can't do this right now" answer (public pages only; type nothing about students; the app itself still makes no network requests). Post 2 or 3 plain options in your own chat (no pills, no animation), and build the one Nam picks in `checkin.js`. The hint line text stays as it is.

### Needs Nam
- (none)

### For Nam (no seat can do these)
- Open a restroom CSV and an attendance CSV in Sheets or Excel.
- Try the history modal on a real phone (seats only tested a 390px frame).

### Proposed
- (none)
