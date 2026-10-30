# Class Check-in

A classroom attendance app for one teacher. Students check themselves in on a shared tablet at the
door, and the teacher exports each day's attendance as a CSV file that opens in Google Sheets or Excel.

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
- **Classes** (`#/classes`): add a class with a "late after" time, then add students. You can paste names
  one per line, type a single name, or import a CSV. "Last, First" is flipped to "First Last", and names
  already on the roster are skipped.
- **Attendance** (`#/attendance`): shows the period picked in the sidebar. Step through days with ‹ ›. Statuses are worked out from check-in times:
  **Present** at or before the late-after minute, **Late** after it, **Absent** with no check-in, and
  **Not yet** today until the late-after time. Tap P / L / A to override a status. **Edited · Undo** puts
  it back to automatic. **Mark rest present** fills in everyone still absent.
- **Export CSV** downloads the day you're looking at: Date, Class, Student, Status, Check-in time.
- **Start check-in** locks the tablet into the kiosk for that class and hides the sidebar.
- **Kiosk** (`#/checkin`): built for a Chromebook at the door. A dark bar shows the class, a live clock
  and date, and how many are checked in. Students type part of their name (accents optional, any word
  order) in the box on the left, and the class list on the right filters as they type. **Enter** or the
  big **Check in** button checks in the highlighted name (↑/↓) or the only one left; with several matches
  it does nothing. Each row also has its own **Check in** button. Tapping a name does nothing, so
  scrolling can't check someone in by accident. Checked-in names drop below the rest, dimmed, with their
  check-in time. A teacher's Present or Late counts as checked in. **Not you?** shows for 5 seconds after
  each check-in and undoes it. A second check-in on the same day saves nothing. The kiosk shows check-in
  times but never late status.
- **Teacher** (top right of the kiosk) asks for the PIN to leave. The default PIN is **1234**, and you can
  change it in Settings. It only stops casual tapping. It isn't real security.

## Where things live

| Path | What it does |
| --- | --- |
| `index.html` | Shell: sidebar, main view, modal root |
| `css/styles.css` | All styles. Tokens are at the top, from the cash register |
| `js/app.js` | Hash router. Forces the kiosk while it's on |
| `js/store.js` | All state and actions; the only code that touches `localStorage` |
| `js/names.js` | Accent-free name search, sorting by last name, "Last, First" cleanup |
| `js/csv.js` | CSV writer (BOM, quoting, formula guard), parser for roster import, download |
| `js/format.js` | Local dates (`YYYY-MM-DD`), times, `escapeHtml` |
| `js/seed.js` | Demo classes, made-up names only |
| `js/modal.js`, `js/icons.js` | Modal, confirm dialog and inline SVG icons from the cash register |
| `js/views/*.js` | Sidebar, check-in kiosk, Attendance, Classes, Settings |

## Limits

- **One device.** Check-ins live in the tablet's browser. The attendance page needs to be opened on that
  same tablet and browser. Clearing the browser's site data erases everything, so export as you go.
- **Dates use the device's clock and time zone.**
