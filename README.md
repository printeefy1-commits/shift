# Browser-only edition (no installation)

Download [shift-local.zip](shift-local.zip), extract it and open `index.html`. The self-contained build is in `local/index.html`; it needs no server, Python, package installation or internet connection. Choose **Admin sign in** to edit without a password for now. After signing in, **Enable password protection** restores the password prompt using the retained password, or lets you create one if none exists. This setting survives reloads. Existing schedules, browser storage and password hashes are preserved; update the HTML at the same location in the same browser/profile. Local controls are a convenience; there is no server-enforced security. Use **Export backup** regularly, **Restore backup** to transfer data, and **Share read-only copy** to send a self-contained snapshot without credentials. Snapshots do not synchronize. See `local/README.txt` for browser-storage and backup details.

To rebuild the local distributable during development: `python3 tools/build_local.py`. This build command is not needed by end users. The following documentation describes the optional server edition.

# Shift

A responsive English team roster with a public read-only schedule, one administrator, employee eligibility, monthly editing, and print / Save as PDF. Includes the operational November 2026 roster and a separate read-only archive of 1,064 dates from January 2024 through November 2026. Friday and Saturday are visually marked as weekends.

## Run

Requires Python 3.12+; no packages to install.

```sh
cd /workspace/shift
python3 server.py
```

The server listens on port 8000 on loopback by default. `HOST` and `PORT` override this. SQLite data persists in `data/shift.db` (ignored by Git); `SHIFT_DB` selects another database. Back up this file to preserve schedules.

## Set up the single administrator

Before first administrator login, securely set `SHIFT_ADMIN_PASSWORD` to a unique password of at least 12 characters in the server environment and start the server. The username is `admin`. The password is salted and hashed using scrypt; it is never stored in plaintext. The variable is only used if no administrator password exists. Do not commit credentials. For local Bash setup, avoid storing the password in shell history:

```sh
read -rsp 'Administrator password: ' SHIFT_ADMIN_PASSWORD
export SHIFT_ADMIN_PASSWORD
python3 server.py
```

Sessions expire after eight hours and are held in memory. Restarting the server signs administrators out. Login attempts are limited. The public API only permits reads; writes require a server-validated session. A worker cannot be assigned to both shifts on one day; day-only staff cannot be assigned to evening shifts. To change eligibility to day-only, remove current and future evening assignments first.

For shared production access, run behind an HTTPS reverse proxy with a persistent database volume and `SHIFT_SECURE_COOKIE=1`. Preserve the original Host header. This repository does not provision a public host or domain. The public roster exposes employee names to anyone with access to the deployment, as requested.

## Workflow

- Browse months and filter by employee; published edits appear for other viewers on refresh or within 30 seconds.
- Sign in to edit daily assignments, add / rename employees, or change shift eligibility.
- Use **Plan next month** to review the weekly column roles and select Friday coverage, create a private draft, review or edit its assignments, then **Publish schedule**. Alternatively, create a blank month for manual planning. Drafts are held in the current browser tab until published; leaving or reloading warns about unsaved drafts.
- Use **Print / PDF**, then choose your browser’s **Save as PDF** destination. This uses the filtered view; clear the search to export the full month.

## Legacy API planning rules

- Rotation A: Saturday daytime, then Sunday / Monday / Tuesday evening, then Wednesday / Thursday recovery.
- Rotation B: Wednesday / Thursday / Friday / Saturday evening, then Sunday / Monday recovery.
- Sunday through Thursday, other available employees work daytime. Saturday daytime is reserved for the following Rotation A employee.
- Friday and Algerian public holiday daytime shifts have exactly one eligible, available employee in a shared rotation. Available employees with the oldest last Friday/holiday assignment take the next turn. Sid Ali and Lamine are initially ineligible for Friday daytime. The administrator can change Friday eligibility on each employee’s card; remove current and future Friday assignments first when making someone ineligible.
- New evening blocks prefer eligible employees with fewer recorded evening assignments; Friday/holiday turns track the most recent special-day assignment, with assignment count and employee order breaking ties. Equal counts use employee order. This fairness strategy is an implementation default, not a rule inferred from the example.
- Planning continues existing blocks and rest periods across calendar boundaries. The previous month must exist with its final seven evening assignments completed. A Saturday daytime assignment reserves the next Sunday rotation, even across months. Inconsistent boundary assignments produce a readable error rather than silently changing published data.
- Generation does not modify the supplied November roster or any published month. Only publishing the reviewed draft saves that month. Regenerating an existing month explicitly confirms its replacement at publication.
- Manual edits allow operational overrides of the rotation/rest pattern; day-only eligibility and the prohibition on two shifts in one day remain enforced. Review overrides before publishing. No holiday, leave or maximum-hours rules have been specified.


## Verify

```sh
python3 -m unittest discover -s tests -v
```

Use the existing checkout in each isolated cloud task; do not create a worktree unless requested.

## Algerian public holidays

The annual fixed calendar includes January 1, January 12 (Yennayer), May 1, July 5, and November 1. In **Public holidays**, the administrator can add, rename, and remove dated holidays. Add officially confirmed religious holidays manually, one entry per day; lunar dates are not guessed or automatically certified. Fixed annual dates apply in every year.

A holiday takes precedence over normal weekday and Saturday daytime staffing: one eligible worker takes a turn from the same pool as Fridays (initially everyone except Sid Ali and Lamine). A Friday that is also a holiday counts as one turn. A holiday Saturday overrides the usual next-Sunday worker's daytime preparation; evening rotation and recovery remain unchanged. Adding/removing dates never silently rewrites published schedules: regenerate or edit the affected month. Manual staffing counts can be overridden, while Friday/holiday eligibility and same-day double-shift checks remain enforced.

The shared Friday/holiday rotation takes effect on **2025-01-01**, as confirmed by the owner. Holidays in 2024 must not be counted as turns in that shared rotation; Fridays still count. Historical eligibility also differs from today and must be preserved separately during any future history import.

## Source history

**Shift history** lets everyone browse 35 months of the supplied Excel archive, print it, and switch between Excel and the original text for November 2026. Six daytime differences appear in a comparison table. November 17, 2024 is visibly marked missing; no coverage is fabricated. Original historical employee eligibility is preserved in this archive. Ramadan records can be viewed, but Ramadan generation is deferred.

The versioned `resources/history.json` contains only dates, short employee names, source row references and normalization notes. The original workbook's phone numbers, identifiers and leave columns are excluded. Two missing commas between known employee names were normalized with explicit notes. No Excel library is needed at runtime.

Generation uses the Excel archive as history and overlays operational schedules stored in SQLite. It never merges conflicting source teams or rewrites the archive. November's operational text-based version continues to take precedence until the administrator edits it. Stable employee ID mappings are persisted at initialization, so renaming an employee does not lose their history. Imported historical eligibility is not revalidated against today's rules; newly generated months are.

Recorded special-day dates explicitly listed in the workbook's coverage summary are included in historical rotation accounting, subject to the 2025-01-01 effective date. They are not presented as a certified future religious holiday calendar. Add future confirmed dates through Public holidays.

## Excel-style administrator planning

After local administrator sign-in, the schedule becomes a spreadsheet: one row per date, Day and Date columns, then one engineer slot per team member. Click a cell to select the engineer, shift and state. Choosing a different engineer swaps the two positions, so an engineer cannot appear twice in the same row. The grid automatically adds a slot when a team member is added.

States match the supplied Excel legend: Recovery (cyan), Training (purple), Leave (light green), Illness/vaccination (green), Friday/holiday (orange), Saturday (yellow), Telework (red). Working cells are unfilled white. Friday/holiday and Saturday date headers are highlighted automatically. Non-working states remove the engineer from active coverage; telework remains active coverage. Unspecified absences from older schedules are labeled Not scheduled rather than guessed as leave.

To plan a month, choose **Plan weekly rotation**, review the starting Sunday roles and select each Friday's engineer. Rules 1–8 determine the rotating columns and recovery; the daytime stage after D lasts the number of day/evening engineers minus four weeks. Review the draft, then publish. Leave, illness and training can be edited for a specific date. Old backups remain compatible; new backups and shared HTML snapshots retain cell states and weekly rotation metadata.

## Compact planning, contacts and switches

The administrator schedule defaults to **Fit full month**, with dense rows and columns sized to show all dates and engineers on a desktop display. **Comfortable view** restores larger cells. The 31-day grid was checked at 1280×720; narrow/mobile displays retain horizontal scrolling.

Column headings show editable time ranges instead of slot numbers. Click a heading to set its start and end; these are column labels shared across months. A cell's Day/Evening role remains independently selected for rotation eligibility. Time preferences survive reload, JSON backups and shared HTML exports.

Friday/holiday rows are orange and Saturdays yellow across the grid. Recovery, leave, training, illness and telework retain their own state colors within those rows. Recovery is computed for the next two calendar days after the end of an actual consecutive evening block, including blocks interrupted by a manual switch. Conflicting evening assignments are rejected; daytime coverage is removed for recovery.

**Switch engineers**, or drag an engineer onto another on the same date, to choose a one-shift swap that preserves other turns or a change to the remaining weekly rotation cycle. Both choices create a review draft. Earlier dates remain unchanged; current eligibility and recovery constraints apply. Use the cycle option only after the month has weekly rotation metadata.

The sidebar now lists each engineer's full name and telephone number below Shift history, using the user-provided contact table. Contacts can be edited in Team members and are retained in local backups and shared copies. Older local data receives the initial contacts without overwriting values the administrator has already entered. The intentionally supplied directory is stored in `resources/contacts.json`; the history archive itself still excludes phone and identifier columns.


## Weekly column rotation (rules 1–8)

Use **Plan weekly rotation** (or **Plan next month**). Review the starting
Sunday's roles and select the Friday engineer for each displayed week. The
planner creates a private draft; only **Publish schedule** replaces saved data.
Published history and other months are preserved.

- A carries Sunday–Tuesday evenings (17:30–23:30), preceded by Saturday daytime.
  That engineer rests Wednesday–Thursday in C; the next weekly stage is B.
- B is the regular Friday / following four-night candidate. Friday coverage is
  selected by the administrator. Friday daytime earns recovery the following
  Sunday, with Saturday already off.
- C works Monday–Tuesday daytime, then Wednesday–Saturday evenings in A.
  If Yougo or another eligible daytime-only engineer works Friday, B's regular
  candidate still takes the following Wednesday–Saturday block. A different
  eligible day/evening Friday selection takes that block instead, exchanging
  its place in the next week's queue with the regular candidate.
- D records Sunday–Monday recovery after four evenings, followed by daytime
  Tuesday–Thursday. The engineer then enters the daytime queue: **zero weeks with 4 available rotating engineers, one week
  with 5, two with 6, three with 7** (count minus four).
  The daytime stage is displayed as one shared E/F/G column after D,
  containing all engineers in that stage. With six rotating engineers, both
  engineers appear together in F and each stays there for two weeks. The
  oldest proceeds to Saturday daytime and A's three nights. Friday/Saturday
  rows display only working engineers; inactive cells are blank and white.
- Daytime-only engineers occupy the final columns (the final three with the
  supplied team). Yougo participates in Friday/holiday coverage; Sid Ali and
  Lamine retain their ineligible setting. Holidays choose the next available
  eligible engineer in the shared Friday/holiday rotation, with an optional
  administrator override. Friday/evening and recovery conflicts are rejected.

Drag an engineer onto another **on the same date**. Before any change, select:
**only this shift** (all other dates and turns remain unchanged), or **change
the rotation cycle** (recompute from that date using the exchanged weekly
roles and the rule-8 daytime queue). Both choices create a review draft; cancel
or discard leaves the published schedule unchanged. Daytime-only engineers
cannot take evening turns or leave their reserved column group. A one-shift
swap that would violate recovery is rejected instead of silently changing
other dates. Earlier dates remain unchanged when replanning a cycle.

Weekly queue metadata survives publication, reload, backups and read-only
exports, and seeds the next month. Existing schedules without this metadata
remain intact; use **Plan weekly rotation** to review their initial roles
before making a cycle change. The older Python/browser fairness generator
remains available through the existing API for compatibility; the application's
planning buttons use the same weekly-rule planner in both editions.


## Long absences and monthly continuity

Use **Absences / return dates** to record an engineer, Formation / Congé /
Maladie, first absent date and last absent date (inclusive). The next day is
that engineer's automatic return to the day/evening team; shift eligibility is
never changed to day-only. Overlapping periods for one engineer are rejected.
The same feature also records daytime-only absences without changing the
rotating-team count.

Planning uses the engineers actually available on each date. Six engineers
with one away for six weeks use the five-engineer cycle for that period;
after the return, the six-engineer cycle resumes. Four available engineers
use the exact A/B/C/D example, without a daytime waiting stage: D's Saturday
prepares A's next Sunday–Tuesday nights. A fifth adds one daytime week, a
sixth two, a seventh three. When an engineer leaves a core role, the oldest
available engineer from the daytime queue fills it; other roles stay in place
where possible. Returning engineers join the newest daytime position, then
progress to both evening blocks. Actual completed evenings and Friday
assignments determine recovery through these changes.

Saved schedules are not silently rewritten when an absence is recorded. Use
**Plan weekly rotation**, set **Plan from date** to the affected date, review
the draft and publish it. Earlier dates remain unchanged. Publication rejects
an assignment to an engineer recorded absent on that date. At least four
rotating engineers must be available; a smaller team produces a clear error.

**Plan next month** inherits the previous published/draft week's roles,
remaining daytime queue and next rotation. Initial roles are locked when
continuation exists; the month boundary never restarts the cycle. An explicit
cycle switch still uses the drag confirmation. Absence dates and weekly
metadata survive reloads, JSON backups and read-only exports; older backups
without absences continue to restore.
