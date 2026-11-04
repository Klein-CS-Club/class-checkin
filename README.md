# Class Check-in

A classroom attendance and restroom app for one teacher. Students check themselves in on a shared tablet
at the door, the same tablet handles restroom trips and the waitlist, and the teacher exports each day's
attendance as a CSV file that opens in Google Sheets or Excel.

It's plain HTML, CSS and JavaScript with no build step and no dependencies. Everything is saved in the
browser's `localStorage`, so nothing leaves the device. There's no database and no login.

The UI is built on the [cash register](../cash-register-software) design system. The check-in behavior
follows [gdpt-checkin](../gdpt-checkin).

## How to run it

```sh
cd ~/dev/class-checkin
python3 serve.py
```

Then open <http://localhost:8130>. You need to serve it over http because ES modules don't load from
`file://`. `serve.py` is Python's built-in server with caching turned off, so a reload always picks up
the latest CSS and JS. With plain `python3 -m http.server`, the browser can mix old and new files until
you hard reload (Cmd+Shift+R). For another port, run `python3 serve.py 8140`. To use a tablet on the same Wi-Fi, open `http://<this computer's IP>:8130` on the tablet.
Data lives in that tablet's browser.

The first run loads three demo classes with made-up names and a week of history.

## How it works

- **Sidebar**: Attendance, Classes and Settings, then each period with how many students are here
  today ("14/18"). Picking a period opens its attendance, and **Add class** adds one. The sidebar
  button at the top collapses it to a 64px icon rail (periods show as number tiles) and opens it
  again; the choice is remembered. Phones always get the rail.
- **Classes** (`#/classes`): add a class with a **start time**, an optional **end time**, **late after (minutes)**
  and an optional **absent after (minutes)**, then add students. The start and end times are plain text
  boxes: `8`, `8:05`, `2:30pm` and `14:30` all work, and a line under each box shows how it was read
  (with no am or pm, 7 to 11 mean morning and 1 to 6 mean afternoon). The end time is only used by the
  restroom rule below; leave it empty and nothing else changes. You can paste names one per line, type a single name, or
  import a CSV. "Last, First" is flipped to "First Last", and names already on the roster are skipped.
  Times use the device's clock.
- **Attendance** (`#/attendance`): shows the period picked in the sidebar. Step through days with ‹ ›. Statuses are worked out from check-in times:
  **Present** at or before the late cutoff (start time plus the late-after minutes), **Late** after it,
  **Absent** after the absent cutoff if the class has one (the check-in time is still kept), and
  **Not yet** for everyone who hasn't checked in. **Minutes late** counts whole minutes after the start
  time, rounded up. The heading shows the day's times, such as "Starts 8:00 AM · Ends 8:50 AM ·
  Late after 8:05 AM · Absent after 8:15 AM". **Finalize attendance** (today only) marks everyone who hasn't checked in as
  **Absent**, and can be undone. Days that are over count as Absent without finalizing. Tap P / L / A to
  override a status. **Edited · Undo** puts it back to automatic. **Mark rest present** fills in everyone
  who is absent or not yet in. **Change times** sets a different start time, end time, late-after and absent-after
  for just that day (an assembly, a short day), and **Use usual times** puts them back.
- **Restroom** (`#/restroom`): the second tab of the same page, using the same class and date. The left
  side has **Out now** (each student with when they left, a running time and an **I'm back** button) and the
  **Waitlist**. The right side has the student list, with **Send out** or **Add to waitlist**, and the
  completed trips. A student can leave once class has started, the first minutes are over, there is a free
  slot (default 1 student at a time), and nobody is waiting ahead of them. This is the 10:10 rule: **no
  trips in the first N minutes or the last N minutes of class** (N is one number in Settings, default 10).
  The last minutes only apply to a class with an end time, and no one can join the waitlist once trips have
  closed. Anyone who can't go yet joins the waitlist, first come first served, and **Go now** lights up
  for the first in line when it's their turn. Students who are out can always come back. **Override**
  sends a student out regardless of the opening or closing minutes, a full restroom or the queue order,
  and needs a reason, which is saved and shown with the trip. Trips can only start on today's date, and
  a student who is still out can be marked back from any date. Set the capacity and minutes in Settings
  (0 minutes allows trips for the whole class).
- **Export CSV** downloads the day you're looking at: Date, Class, Student, Status, Check-in time, Minutes late.
- **Start check-in** locks the tablet into the kiosk for that class and hides the sidebar.
- **Kiosk** (`#/checkin`): built for a Chromebook at the door. A dark bar shows the class, a live clock
  and date, and how many are checked in. Students type part of their name (accents optional, any word
  order) in the box on the left, and the class list on the right filters as they type. **Enter** or the
  big **Check in** button checks in the highlighted name (↑/↓) or the only one left; with several matches
  it does nothing, and the hint under the box says how many match and to keep typing or press ↓. Each row also has its own **Check in** button. Tapping a name does nothing, so
  scrolling can't check someone in by accident. Checked-in names drop below the rest, dimmed, with their
  check-in time. A teacher's Present or Late counts as checked in. After each check-in a large notice right
  under the button shows the name and time with **Not you?** (undoes it) and **✕** (closes it). A bar under it counts down 8 seconds, then it
  closes on its own. A second check-in on the same day saves nothing. The kiosk shows check-in
  times but never late status.
- **Kiosk Restroom tab**: a **Check in / Restroom** switch sits above the name box. On Restroom a student
  finds their name and presses one button: **Go to restroom** when they can leave now, **Join waitlist**
  when they can't, or **Go now** when it's their turn. The right side reads top to bottom: a **Session**
  card for the student who is out (name, time out, time in, a running timer and **I'm back**; with nobody
  out it keeps the last finished trip), the **Waitlist** (students who joined, in order, each with a gray
  **Leave waitlist** button), then the **Class list**. The bar shows how many are out and waiting, and
  the screen updates by itself when trips open or a slot frees up. There is no confirmation card here:
  the name moving into the Waitlist, or the Session card starting or ending, is the answer.
- **Teacher** (top right of the kiosk) asks for the PIN to leave. The default PIN is **1234**, and you can
  change it in Settings. It only stops casual tapping. It isn't real security.
- **Backup** (Settings): **Download backup** saves classes, rosters, attendance, restroom trips and
  settings as a JSON file, and **Restore** loads one back, replacing what's on the device. Clearing the
  browser's data erases everything, so download a new backup after changing rosters. Backups also move
  data to a new device or web address. Older backups still restore.
- **Period 7 demo** (Settings → Open Period 7 demo): adds a made-up class that runs 2:00 to 3:00 PM, with a
  clock that stays put until you press a time (1:59, 2:00, 2:05, 2:06, 2:10, 2:15, 2:50, 3:00 or any
  other). Use it to try the opening and closing blocks, waitlist, capacity, overrides and late arrivals
  without waiting for the bell. It always uses 1 student at a time and a 10-minute block at each end, and **Reset demo** removes only its
  own records.
- **Upgrading**: older saves had one "late after" time per class. It becomes the start time with 0 late
  minutes and no absent cutoff, so every old check-in keeps its status, and a copy of the original data is kept under
  `class-checkin-v1-backup`. Set real start times, end times and late minutes in Classes. Classes from older saves have no end time.

## Where things live

| Path | What it does |
| --- | --- |
| `index.html` | Shell: sidebar, main view, modal root |
| `css/styles.css` | All styles. Tokens are at the top, from the cash register |
| `js/app.js` | Hash router. Forces the kiosk while it's on |
| `js/store.js` | All state and actions; the only code that touches `localStorage` |
| `js/names.js` | Accent-free name search, sorting by last name, "Last, First" cleanup |
| `js/csv.js` | CSV writer (BOM, quoting, formula guard), parser for roster import, download |
| `js/format.js` | Local dates (`YYYY-MM-DD`), times, durations, `escapeHtml` |
| `js/seed.js` | Demo classes, made-up names only |
| `js/modal.js`, `js/icons.js` | Modal, confirm dialog and inline SVG icons from the cash register |
| `js/views/*.js` | Sidebar, check-in kiosk, Attendance, Restroom tab, Classes, Settings |
| `tests/store.test.js` | Tests for the store: late times, finalizing, restroom rules, backup. Run `node --test` |
| `package.json` | Only tells Node the files are modules so the tests can load them; there are no dependencies |

## Limits

- **One device.** Check-ins live in the tablet's browser. The attendance page needs to be opened on that
  same tablet and browser. Clearing the browser's site data erases everything, so export as you go.
- **Dates use the device's clock and time zone.**
