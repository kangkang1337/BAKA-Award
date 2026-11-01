# First Play Timeline

First Play Timeline records a date you confirm as the first time you played a game. Steam's current library data, achievements, last-played time, and the website's first-seen time do not prove that date.

## Local manager

Run from the project root:

```bash
npm run timeline:manage
```

Open `http://127.0.0.1:8789`. The service binds only to `127.0.0.1`, uses the existing `var/steam-film-static.sqlite`, does not contact Steam, and does not need the retired HTTP service or a VPS. The manager refuses to open `var/steam-film.sqlite` and refuses to create a missing static database. Stop it with Ctrl+C.

The first manager start adds the `first_play_entries` and `first_play_entry_changes` tables in place. It does not rebuild the database, modify game rows, or change Steam snapshots. Older databases whose `source`/`changed_by` columns only allowed `heybox-import` and `manual` are upgraded in a single transaction by copying rows into a freshly defined table and swapping names; no history is dropped. Every add, edit, delete, or confirmed import writes an audit entry. Deleting a timeline row does not delete the Steam game profile.

## Add a record

Search the Steam candidates, select a result, confirm the first-play date, and add it. You can also type a title and optional AppID for games absent from the Steam database. New manual entries default to today's local calendar date. Set precision to month, year, or unknown when that is all you can confirm; never fill a date from another Steam timestamp.

Unknown dates are saved with `first_played_on = NULL` and appear in the separate “待确认” section. Day, month, and year values are stored as date-only strings (`YYYY-MM-DD`, `YYYY-MM`, or `YYYY`) so timezone conversion cannot move the date.

## Import CSV or JSON

The manager accepts UTF-8 CSV or JSON, up to 2 MB and 5,000 rows. Supported fields include `appId` or `steamAppId`, `gameName` or `name`, `firstPlayedOn` or `date`, `datePrecision` or `precision`, and optionally `source` and `originalFirstPlaytime`. The JSON may be a top-level array or an object with a `records` array. CSV requires a header row.

`source` records where the date actually came from, and the confirmed import stores it instead of guessing. Allowed values are `heybox-import` (default when the column is missing, reserved for real 小黑盒 exports), `manual` (manual entries), and `steam-client-get-last-played-times` (Steam client first-play timestamps). An unknown value falls back to `heybox-import` and is flagged in the preview. `originalFirstPlaytime` keeps the raw Unix seconds in the database for later cross-checking; it never influences the stored calendar date.

Templates:

- [CSV template](first-play-timeline-template.csv)
- [JSON template](first-play-timeline-template.json)

When selected in the manager, the original import file is saved under `var/imports/heybox-first-play/`. That directory is private and ignored by Git. The import preview does not write timeline rows. Review name candidates, missing dates, duplicates, and conflicts. Then choose which rows to insert, skip, or explicitly use to update an existing date. A duplicate AppID cannot be silently overwritten. Repeated import of an already imported record with the same date is skipped.

Import matching prioritizes an exact AppID. If there is no AppID and one exact case-insensitive game-name match exists, the manager offers it for confirmation. Ambiguous or missing matches remain custom records or can be assigned an AppID during preview. Each confirmed batch uses a SQLite transaction; a database error rolls back the entire batch.

## Export and public data

After every successful change, the manager writes `public/data/steam-film/first-play-timeline.v1.json`. If export fails, the saved SQLite entry remains and the manager reports that the JSON must be regenerated. Use the manager's export button to retry.

The public timeline contains only records explicitly added to it. It includes each game's confirmed name, date and precision, cover when available, source label, current playtime for matched Steam games, and personal note. Notes appear on the public website; do not enter text you want to keep private. It excludes SteamID64, API Key, cookies, change history, raw imports, and the full Steam library. The legacy `archive.v1.json` is retained as a compatibility file but is regenerated from Steam games that are actually on the timeline. Monthly Reel continues to use the private SQLite snapshot history and is not calculated from first-play dates.

Back up records from the manager's “下载时间轴备份 JSON” link. The backup includes private notes and source metadata; keep the downloaded file private.
