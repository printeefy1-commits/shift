# Browser-only edition (no installation)

Download [shift-local.zip](shift-local.zip), extract it and open `index.html`. The self-contained build is in `local/index.html`; it needs no server, Python, package installation or internet connection. Choose **Set up administrator** on first use. Local editing is password-locked for convenience, but there is no server-enforced security. Use **Export backup** regularly, **Restore backup** to transfer data, and **Share read-only copy** to send a self-contained snapshot without credentials. Snapshots do not synchronize. See `local/README.txt` for browser-storage and backup details.

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
- Use **Plan next month** to generate a private draft, review or edit its assignments, then **Publish schedule**. Alternatively, create a blank month for manual planning. Drafts are held in the current browser tab until published; leaving or reloading warns about unsaved drafts.
- Use **Print / PDF**, then choose your browser’s **Save as PDF** destination. This uses the filtered view; clear the search to export the full month.

## Automatic planning rules

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
