## Framing note before the four reviews

Two things about the ground truth invalidate parts of all four proposals, and both are checkable in the repo right now.

**First, the audit these proposals were written against is stale.** `git log` shows `v0.2.0-retheme` (commit `d106ec3`) already landed: `apps-script/00_Config.js:59` carries the warm palette, `app.css:7-12` carries it, `apps-script/07_Admin.js:116-118` seeds the new shift colours (`#9E8B76`, `#C89A52`), and — most importantly — `apps-script/08_RichMenu.js:45-56` already has the rewritten four-zone bounds with the logo excluded (`news` now starts at `x:1150`, not `x:0`). The line-integration audit's critical "new art without new bounds silently rewires every button" finding is fixed. Several proposals still budget for retheme work that is done.

**Second, the perf proposal's flagship step is already being written, uncommitted, right now.** `git diff HEAD --stat` shows `apps-script/02_Data.js +115` and `apps-script/09_Triggers.js +29` sitting in the working tree. That diff contains `TABLE_MEMO_`, `tableVersion_`/`bumpTableVersion_`, `cacheGetBig_`/`cachePutBig_`, a cached `readTable`, and an installable `onEditInvalidateCache` trigger. So the perf design is not a plan; it is a partial description of in-flight work — and where they differ, **the in-flight code is right and the proposal is wrong.** Details below.

An adversarial review that ignores this would be reviewing a document instead of a system.

---

## 1. perf-architecture

### Where the proposal is worse than the code already being written

**The 90,000-character chunk size is a bug in Thai.** The proposal says "slice at 90,000 chars" against the ~100KB CacheService per-key limit. Thai is three bytes per character in UTF-8. 90,000 Thai characters is up to 270KB — the `put` throws, `cachePutBig_` swallows it, and you get a permanently cold cache that fails silently on exactly the tabs that matter (Handbook, Announcements, AppGuide — all Thai prose). The working-tree code already gets this right at `02_Data.js:44`: `CACHE_CHUNK_ = 30000` with the comment `ภาษาไทย 1 ตัว = 3 ไบต์ 30000 ตัวจึงไม่เกิน 90KB`. Whoever wrote the proposal reasoned in characters; whoever is writing the code reasoned in bytes. Take the code.

**One global `rev` is the wrong granularity given an onEdit trigger.** The proposal's central idea — "ONE new concept: a version-stamped cache revision" — means any edit to any tab invalidates every cached tab. Combined with the proposal's own installable `onEdit` trigger, that means the entire cache goes cold on every single cell HR commits. HR editing the Schedule tab for twenty minutes on a Friday afternoon keeps the Handbook, FAQ, OrgChart and Settings caches permanently cold through the pre-weekend traffic peak. The in-flight code uses per-table keys (`ver_' + name`, `02_Data.js:49`) and is correct.

**The 21600s TTL is a six-hour staleness bomb.** The proposal argues TTL "stops being a correctness mechanism and becomes a memory bound only" because rev-bumping handles invalidation. That is only true while the onEdit trigger is alive. Installable triggers die quietly — authorisation lapses, the owning account changes its password, `installTriggers` is re-run by someone else. `onEditInvalidateCache` (`09_Triggers.js:206`) swallows every error by design so as not to disturb HR's editing. When it stops firing, the proposal's design serves six-hour-old data with no signal; the in-flight design serves at most five-minute-old data (`TABLE_TTL_ = 300`). The proposal's own risk section says "worst-case staleness after an HR edit is 30s — state that plainly in the HR manual." That is only the *rev shadow cache* window, not the failure window, and the proposal never computes the failure window.

**"One `getAll` per table" is not achievable as specified.** You cannot `getAll` chunks without first knowing the count, and the count is itself a cache key. `cacheGetBig_` (`02_Data.js:74-77`) correctly does `c.get(key + '_n')` and *then* `getAll` — two round trips, not one. Minor, but the proposal's latency model is built on the one-trip claim.

### Where it breaks at 60 users on restaurant wifi

**The onEdit trigger competes with staff for the 30-simultaneous-execution ceiling, at the worst moment.** Installable `onEdit` fires once per committed edit, asynchronously, each with Apps Script's ~1-3s dispatch overhead. A shift lead pasting a week of roster corrections generates dozens to hundreds of trigger executions. Those executions and the staff schedule requests draw on the same 30-execution pool, and the roster is edited immediately before the schedule is checked. This is a self-inflicted concurrency spike that the proposal's capacity argument ("cutting per-request wall time cuts concurrent executions proportionally") does not account for, because it counts only user-facing requests.

**Trigger runtime is a hard consumer-tier quota.** `kohnaisoi.staff@gmail.com` is a consumer Google account; the trigger total-runtime budget is 90 minutes/day. Four scheduled triggers plus an unbounded-frequency onEdit trigger. A heavy roster-editing day at 1-2s per fire reaches five to ten minutes; a bulk paste or an import could reach far more. When the budget is exhausted, **all four scheduled jobs stop silently** — no 08:00 auto-publish, no 09:00 HR digest, no Saturday badge, no Monday health check. The proposal introduces the one unbounded trigger in the system and never mentions the shared budget it draws from.

**There is a read-through cache race the proposal does not name.** Reader A reads the sheet. HR edits and `bumpTableVersion_` writes a new version. Reader A then writes its (now stale) rows under the *new* version key. Every subsequent reader gets stale data for the full TTL. Low probability, bounded by TTL — which is another argument for 300s over 21600s.

### Where it violates a hard rule

**"lineUserId must never be copied outside the sheet" — this proposal copies all sixty of them into CacheService, and then hand-waves it.** The proposal's own risk note says: *"Employees rows now sit in CacheService, but the existing `emp_<userId>` cache already does exactly that, so no new data boundary is crossed."* That is not true in the way that matters. Today's cache holds **one** employee's record, keyed by the caller's own id. The new cache holds the **entire Employees table** — every `lineUserId`, every `phoneLast4`, every status — as a JSON blob in a script-wide store that is not covered by the spreadsheet's ACLs, not covered by its version history, not in any export, and readable by any code in the project. Whether or not you decide this is acceptable, the decision must be *made and written down*, not asserted away in a parenthesis.

### Over-engineered

Step 7 (GitHub PAT in Script Properties, Apps Script committing snapshot JSON to the repo, Pages rebuild) should be deleted rather than marked optional. It puts a long-lived write credential on an anonymously-reachable endpoint that has a live formula-injection hole, it adds an automated committer to the exact repo whose git history is the goal-0 rollback story, and by the proposal's own admission it only helps two non-personal tabs after the client SWR layer has already captured most of the perceived gain.

Three cache layers (per-execution memo, CacheService, localStorage SWR) plus a `notModified` short-circuit plus skeleton screens, all keyed on one rev, for five read endpoints and sixty users, is more invalidation surface than the problem justifies. The memo and the CacheService layer are the whole win and they are already landing. Client SWR saves one round trip on repeat opens; ship it later, or not at all.

### Under-engineered — the rewrite in six months

**Schedule is excluded from caching and that is where the actual cost is.** The proposal caps the cache at 12 chunks and says "Schedule simply is not cached, which is the correct answer and also the simple one." It is the simple answer, not the correct one. Schedule is read in full on: every schedule page open, R01, R02, R05, R06, `buildIcs_`, `weeklyHealthCheck` (`09_Triggers.js:137`), and `reportShiftCoverage`. Sixty phones polling the .ics feed on a 6-hour TTL is ~240 full Schedule reads per day from calendar clients alone, forever, with no user watching. The obvious cheap fix nobody proposed: **cache Schedule per month.** Past months are immutable; the current and next month are the only volatile keys; each month at 60 staff is ~1,800 rows, well inside a chunked cache entry. That is a small change that removes the single largest read in the system, and all four proposals defer it to a hypothetical database migration instead.

### What's sound

The rejections are all correct and well argued: no service worker in a LINE webview, no Firestore, no Script Properties snapshot (the 9KB/value limit genuinely disqualifies it), no trigger-rebuilt snapshot, no cursor pagination for a date-range query. The per-execution memo is correctly identified as the highest-leverage three lines in the plan. Caching `verifyIdToken` on a hash of the token with `TTL = min(300, exp − now)` is right and is the one change that pays on literally every path including the webhook. The `boot`-instead-of-`Promise.all` argument is right for the stated reason (two invocations means two dispatches, two cold-start risks, two token verifications).

And step 1 is genuinely the cheapest large win still outstanding: `app.css:4` still has the render-blocking `@import`, still requesting weight 300 that nothing declares.

---

## 2. database-decision

This is the strongest of the four. The conclusion (don't migrate) is right, the ordering insight (console before migration, because migrating while the Sheet is the only admin UI leaves HR with nothing on day one) is the single best idea across all four documents, and the trigger conditions are specific enough to act on. Most of my objections are about execution, not judgement.

### The instrumentation step contradicts its own goal

Step 2 says "emit one structured console line **and append a rolling row to a small Perf tab**." Appending a row to a sheet on every `doPost` adds a header read plus an append plus an implicit flush — a few hundred milliseconds — to *every single request*, on the write path, creating a new unbounded tab and a write-contention point across up to 30 concurrent executions. That is the exact pathology the rest of the document is trying to remove. Instrument to `console.log` only (Cloud Logging is free and queryable), or batch into a CacheService counter flushed once by an existing trigger.

### The measurement gate will not be honoured

"p95 above 2.5s for two consecutive weeks... reviewed quarterly" requires a technical person to open the Executions log or a Perf tab on a schedule, indefinitely, for a decision they hope never to make. This is textbook quietly-stops-happening. The fix is to make the number arrive uninvited: one line in the existing `dailyHrEmail` or `weeklyHealthCheck` ("ความเร็วเฉลี่ยสัปดาห์นี้ X วินาที — ช้ากว่าเกณฑ์ N ครั้ง"). Same for the perf proposal's p95.

### The security argument is contingent on the largest, least-certain step

The document's answer to "Sheets cannot express permissions" is: build the console, then revoke sheet edit access. That is correct — but the revocation lives in step 7, marked `[L]`, described as "High but unavoidable", and belongs to a different workstream. If the console slips, the migration argument was rejected on the strength of a mitigation that never shipped, and the critical finding (a shift lead with edit access can run `emergencyBroadcast`, offboard staff, and read every `hr_only` complaint body) stays open indefinitely. The honest framing: *staying on Sheets is conditional on the console landing*, and if the console is not going to land this round, the permission hole needs an interim answer (e.g. revoke edit access now and accept that shift leads cannot fix rosters until the console exists).

### The formula-injection fix is not at a single chokepoint

Step 1 says to sanitise in `appendRow` and `updateRow` and calls that "the single write chokepoint." It is not. `07_Admin.js:569` writes the entire Schedule table with `setValues()`. `11_Reports.js:24` writes every report row with `setValues()` — and `reportTickets` (`11_Reports.js:154`) reads ticket subjects straight from the Tickets tab into that write. So a poisoned ticket subject that got in before the fix, or through any path that bypasses `appendRow`, is re-materialised as a live formula in a report tab the moment HR runs the report. Sanitise on the way *out* of `readTableRaw_` as well as on the way in, or sanitise in a shared `writeValues_` helper that all three paths use.

There is also an unverified assumption in the fix itself: whether a leading `'` prefix survives a `setValue`/`getValues` round trip cleanly in this sheet's configuration. The step's own risk note flags it ("verify `readTable`/`cellToString_` strips it on read") — that verification must happen before the fix ships, because if the apostrophe *is* returned by `getValues()`, every string comparison on those columns (status matching, `shiftCode` joins, date range filters) silently stops matching. That is a worse outage than the vulnerability.

### One number is wrong in a way that flatters the conclusion

"60 staff × 30 days × 20 columns ≈ 432,000 cells per year against Sheets' 10M cell limit — over twenty years of headroom." The 10M limit is per *spreadsheet*, and this spreadsheet has 15 schema tabs plus every `รายงาน-…` tab that `writeReport_` creates and never deletes (`11_Reports.js:14`), each defaulting to 1000×26 = 26,000 cells whether populated or not. The headroom is still large and the conclusion still holds — but the argument as stated ignores the report tabs, which are also the thing the PDPA finding says are accumulating org-wide PII inside the live database.

### The archive step will make old open tickets invisible

Step 8 proposes bottom-up range reads ("last N rows, since rows are appended") for Tickets/Leave/AuditLog. Combined with the admin proposal's ticket inbox reading "the last ~300 rows", a ticket opened 400 rows ago and still open **disappears from the inbox and from the daily HR email simultaneously.** Right now the status bug means replied tickets nag forever, which is annoying but safe. Fix the status bug and add a windowed read in the same round and you convert a nagging system into one that silently drops the oldest unresolved complaint — which will be, by construction, the hardest one. A windowed read needs a companion: either an index of open ticket rows, or a scan that always includes rows whose status is not closed.

---

## 3. admin-console

The core calls are right: one responsive LIFF page rather than a second app; a single-day roster editor rather than a month grid; ticket inbox as the flagship; and the insistence that **revoking sheet access is the deliverable, not the UI**. The rejections of Flex-as-console and of a full offline PWA are correct.

### The automatic `manual` status will poison the roster generator within months

This is the biggest unexamined consequence in the document. The console's headline safety feature is that it sets `status='manual'` automatically on any human edit, removing the silent-data-loss class. But `generateScheduleFromPattern` (`07_Admin.js:500`) preserves rows *only* because they are marked `manual`. Today that flag is rare because it must be hand-typed. Make it automatic and every sick-day swap, every shift-lead correction, every leave substitution becomes a permanently protected row. After a few months of daily use, a large fraction of the Schedule tab is `manual`, and regenerating from `ShiftPattern` stops producing a coherent roster — it produces a patchwork of months-old exceptions that no one can identify or clear. Nobody proposed scoping preservation to future dates only, expiring `manual` after the date passes, or recording *what* was manual about the row so the generator can distinguish "deliberate ongoing exception" from "one-off swap in March".

That is a six-month rewrite trigger created by an MVP feature, and it is created by the safest-looking decision in the proposal.

### The offline write queue and the LINE ID token do not compose

`app.js` obtains an ID token once at `liff.init()`. LINE ID tokens expire. A shift lead who leaves `admin.html` open on their phone through a shift and then taps Send is submitting an expired token; `verifyIdToken` rejects it and the user sees a generic failure. Worse with the proposed localStorage queue: a write queued at 14:00 and retried at 14:40 replays a token that is dead, so the queue retries forever against a permanent failure while showing "ค้างส่ง 1 รายการ". The fix is small (call `liff.getIDToken()` at send time, not at queue time, and handle the re-login path) but it must be designed in, and no proposal mentions token lifetime anywhere.

### The row-index cache is a wrong-row write waiting to happen

Step 4 caches a `(date|empCode) → rowNumber` index for 300s. If HR sorts the Schedule tab, inserts rows, or runs `generateScheduleFromPattern` (which clears and rewrites the whole table, `07_Admin.js:568-569`) while a shift lead has the console open, every cached row number is wrong and the console patches other people's shifts. The proposal's mitigation — "re-verify empCode in the target row before writing and fall back to a fresh read on mismatch" — is correct and must be non-negotiable, not a risk note. Note also that the `manual` flag means the console's own writes are exactly the rows most likely to be shuffled by the next regeneration.

### No concurrency control between two editors

Two shift leads on the same day, or a shift lead and HR in the sheet, is last-write-wins with no detection. At a 60-person restaurant with branch supervisors this is a realistic Saturday. Not necessarily worth solving in v1, but it should be a named accepted risk rather than an omission, and the AuditLog before→after rows the proposal already specifies are what makes it recoverable.

### The new write endpoints have no rate limiting

The proposal correctly notes the existing ticket limiter has a read-modify-write race. It then adds four new write endpoints with no limits mentioned at all. `admin_schedule_set` takes an array of items — one request can write arbitrarily many rows. Given that these endpoints are role-gated to a handful of people the exposure is low, but a buggy client retry loop is as damaging as an attacker here.

### Over-engineered for five users

`opId` + server dedupe + localStorage queue + AbortController + SWR + skeletons, for a console used by roughly five people on the restaurant's own wifi. Keep the `opId` dedupe (cheap, and it genuinely prevents a duplicate ticket reply from a double-tap) and the fetch timeout (which fixes a real existing defect — `app.js` has no `AbortController` at all today). Cut the queue: a clear Thai error plus a Retry button that resubmits the same `opId` covers the same ground with a tenth of the moving parts, and it does not create the expired-token trap above.

### The step most likely to be skipped is the one that matters

The proposal says so itself: *"This is the step that actually closes the critical security hole, and it is also the step most likely to be skipped because it is not code."* Right. Add a concrete precondition to make it possible: verify that desktop LIFF login works for the HR account **before** building anything, because LINE web login commonly requires a QR scan from the phone, and if that flow is unusable for this HR person then the console cannot replace their desktop Sheet workflow and the revocation will never happen.

---

## 4. quiz-and-media

### The `initDatabase` backfill can write headers into the wrong row

Step 2 says "SCHEMA += Forms, FormItems, FormResponses; Announcements += imageFileId; AppGuide += updatedAt. Run `initDatabase()`, which backfills missing columns without touching existing ones." Look at `07_Admin.js:93-95`: it writes headers at **row 1, unconditionally**. But `readTableRaw_` (`02_Data.js:161-165`) *detects* the header row, skipping merged description rows above it — and `repairSheetHeaders` exists precisely because that situation occurs in this sheet. On any tab where the real headers are on row 2 or 3, `initDatabase` writes `imageFileId` into row 1, `headerIndex_` and `readTable` never see it, and the new column is silently dead. You would ship the image feature, attach a picture, and it would simply not appear, with no error anywhere. Run `repairSheetHeaders` first, on a copy, and verify header row positions before the backfill.

### The `drive.file` claim may invert the security win

The proposal's most attractive security line is that the manifest gets *narrower*: drop `drive.readonly`, take `drive.file`. But Apps Script's `DriveApp` has historically required the full `https://www.googleapis.com/auth/drive` scope; `drive.file` is not a general substitute for `DriveApp` operations. If that holds here, the actual outcome is that an `ANYONE_ANONYMOUS` web app with a live formula-injection path gains **full read-write access to the owner's entire Drive** — which contains, by the proposal's own reasoning about the HR account, payroll and identity documents. That inverts the claimed benefit into the worst scope change in the whole program. The step-1 spike verifies the thumbnail endpoint and `getMessageContent` but **does not verify that `DriveApp.createFile` + `setSharing` work under `drive.file` alone.** Add it; it is a ten-minute check and it gates everything.

### The reply-token window will break the upload flow on real photos

The flow is: HR sends a photo → webhook downloads it via `getMessageContent` → writes to Drive → sets sharing → reads Announcements → replies with a Flex picker. That is one reply token covering a multi-megabyte download, two Drive round trips and a sheet read, on Apps Script's cold-start latency, over restaurant wifi. Modern phone cameras produce 3-8MB originals, so the proposal's 5MB cap will reject a large share of real photos *and* the ones it accepts are the slowest. If the reply token expires, HR sends a photo and gets silence — the most confusing possible failure for the least technical user. There is no second free message: a follow-up is a push, which costs one of the 300. So either the "0 quota" claim needs an asterisk, or the flow needs restructuring (acknowledge immediately, do the work on a subsequent interaction).

Compounding: the webhook has **no event de-duplication** (the line-integration audit found this and no proposal fixes it). A slow image handler is exactly what causes LINE to treat the delivery as failed and retry — producing duplicate Drive files and duplicate picker prompts. Dedupe on `webhookEventId` is a prerequisite for this feature, not an unrelated cleanup.

### The sharpest PDPA exposure in any of the four proposals

The manual guidance is *"never photograph a document with personal data."* But a restaurant's announcement images will overwhelmingly be **photographs of staff** — team photos, training sessions, Eid gatherings, a new hire's introduction. Every one becomes a permanently world-readable bearer URL on a public Drive link, with no expiry, no takedown workflow, no consent record, and no relationship to the offboarding process. The audits worry at length about `lineUserId` leaving the sheet; this proposal makes staff faces publicly downloadable by anyone with a URL, forever, and treats it as a footnote. It needs: a stated consent basis, a documented takedown action in the sheet menu, and a rule that images are removed when the announcement expires.

### The Forms engine is a form engine, not an MVP

`Forms` has 16 columns; `FormItems` has 15. The definition includes `drawRules` as a mini-language (`policy:3,vision:3,app:4`), `retakePolicy`, `cooldownHours`, `shuffle`, `showExplain`, `openFrom`, `dueDate`, plus four question types (`single|multi|tf|text`), five choices, per-question `points`, and `sourceTab`/`sourceId` staleness tracking. All of it hand-typed by an HR person who today cannot compose an announcement without hand-filling 18 columns.

The owner asked for: test staff understanding of policy, vision, and the myHR Cloud app; store scores; generalise later. The MVP is one quiz, ~10 single-choice questions, one row per person per attempt. The generalisation hook is a `formId` column — you do not need `drawRules`, `shuffle`, `cooldownHours` or four question types to keep the door open. The proposal already rejected shuffling for exactly the right reason; apply the same reasoning three more times.

**And the maintenance burden is where this quietly dies.** Authoring 30-40 questions across 15 columns in Thai, then keeping `sourceId` links valid, then acting on staleness flags surfaced by a **desktop-only sheet menu action** — for an HR person for whom 28 of 28 existing admin actions are already desktop-only. This is the single most likely thing in the entire program to be done once and never again. If the quiz ships, the coverage/staleness tooling should be a line in the weekly HR email, not a menu item.

### Per-question round trips will not survive a mandatory quiz

Twelve round trips per attempt is defensible for anti-cheat. But the realistic usage is "everyone complete this by Friday", and staff will do it during the same break. Twenty-five concurrent staff × a multi-second request each, against a 30-simultaneous-execution ceiling that already has the onEdit trigger and normal traffic in it, is a queue.

Worse, the per-question write does not get cheaper over time. `quiz_answer` must find and patch the attempt row in `FormResponses`. `updateRow` bumps that tab's cache version, so **every subsequent answer re-reads the entire FormResponses tab from the sheet** — the cache can never be warm for the one tab this feature writes to constantly. At 60 staff × 10 questions × retakes, FormResponses grows by ~700 rows per quiz cycle and every one of those ~700 writes pays a full-tab read of everything that came before. That is the shape of a feature that works beautifully in week one and is unusable in year two.

The middle option nobody offered: **send the paper without the `correct` field, grade the whole submission server-side in one call.** Two round trips instead of twelve. The answer key still never reaches the device before submission. You lose per-question instant feedback and you lose "no back navigation" — which is anti-cheat theatre anyway when the questions are pool-drawn and the staff are sitting next to each other. That is the MVP-correct trade.

### What's sound

The rejections here are the best-reasoned in any of the four documents. Base64 (`hero.url` requires https), `ContentService` (cannot emit image bytes), and Drive `/file/d/.../view` links (HTML viewer, not an image) are all correctly identified as impossible rather than merely inferior, which saves real time. The `sz=w<N>` observation — one stored file yielding three delivery sizes with no image-processing code — is genuinely the right insight and it is the whole slow-connection answer. Persisting `imageFileId` so every URL is regenerable is exactly the right goal-0 instinct. Reusing `matchAudience_()` for form targeting and `reports.html`'s existing view-swap seam instead of a ninth LIFF page are both correct. And insisting on a verification spike *before* committing to the undocumented thumbnail endpoint is the right discipline — it just needs one more item in it.

---

## MISSED — things none of the four proposals addressed

**1. The entire system lives in one consumer Gmail account with no recovery path.** `kohnaisoi.staff@gmail.com` owns the spreadsheet, the Apps Script project, the triggers, the MailApp quota, and (under the media proposal) the Drive image folder. A consumer Google account has no admin console, no recovery contact for an organisation, and no way for the restaurant to regain access if the account is lost, suspended, or held by someone who leaves. Thai labour law requires these records for two-plus years. Nothing in any proposal addresses ownership, succession, a second owner on the spreadsheet, or migration to a Workspace account. This is the highest-severity gap in the program and it costs almost nothing to fix.

**2. There are no backups.** Goal 6 mentions a "local backup strategy" as a *chapter in a manual*. No proposal implements one. Sheets version history is not a backup — it dies with the account and cannot be taken off-platform. A weekly `SpreadsheetApp.openById(CFG.ssId).copy('backup-YYYY-MM-DD')` plus a quarterly manual download is a handful of lines. Note the cross-proposal conflict: the media proposal's scope narrowing to `drive.file` would block a `DriveApp`-based backup, though `Spreadsheet.copy()` under the existing `spreadsheets` scope would still work — which is exactly the kind of interaction that needs to be decided once, deliberately.

**3. There is no staging environment, and the rollback rail that exists is dangerous.** Every proposal ships straight to 60 people's production system. A second LINE OA, a copy of the spreadsheet, and a second Apps Script deployment cost zero baht and would make every one of these changes testable. Meanwhile `scripts/rollback.sh` (untracked, on disk) does `git checkout "$TAG"` and then instructs the operator to run `git push origin HEAD:main --force-with-lease` from a detached HEAD — that force-pushes over `main` and destroys every commit made after the tag. That is not a rollback, it is a data-loss command in a script written to make rollback safe. `git revert` is the correct primitive for the frontend half; the Apps Script half (repointing the pinned deployment to an older version) is already correct and genuinely good.

More importantly, neither script can roll back **the two things most likely to need it**: the Google Sheet's data and schema (the status-enum migration, the new Forms tabs, the `manual` flag semantics), and the LINE rich menu (which `release.sh` correctly notes requires a manual desktop sheet-menu action). Goal 0 is not satisfied by tags on code when the breaking changes are in data and in LINE.

**4. Nobody reconciled the four proposals with each other.** They collide directly:
- Perf step 2 and DB step 3 are the *same* cache work with *different* invalidation models (global `rev` vs per-tab TTLs). Implement both and you get two cache layers.
- Perf step 4, admin step 4, and DB step 4 all rewrite `apiSchedule_`/`getScheduleFor`.
- Perf step 6 and quiz step 5 both rewrite `apiNews_`.
- DB step 6 says put every sheet call behind `02b_Repo.js`; admin step 3 creates `12_AdminApi.js` calling `readTable` directly.
- Three proposals independently propose the formula-injection fix, in three different places.

There is no merge order, no owner, and no combined effort estimate. Summed, this is a multi-month program for one part-time developer against a brief that says "must stay an MVP." Nothing names what gets cut if only six weeks exist. My ranking, if forced: finish the in-flight cache work → formula sanitisation (all write paths) → ticket inbox + leave queue + revoke sheet access → font/boot critical path → images → quiz.

**5. Goals 6 and 7 are unowned.** Three PDF manuals and an executive presentation are explicit owner goals and appear in no proposal's step list except as passing references. They also have a sequencing constraint nobody stated: all four proposals substantially change how the system is operated, so manuals written before the work lands are wrong on delivery. They must be last, and the effort must be budgeted rather than assumed.

**6. No tests, of any kind, are proposed.** There are none today. The program adds a cache layer with subtle invalidation, an auth-path token cache, a status-enum migration over live labour records, and a formula sanitiser that touches every write. Apps Script supports a plain `runAllTests()` with assertions runnable from the editor. Twenty assertions covering `cellToString_`, header-row detection, `matchAudience_`, the status enum, and the sanitiser round-trip would cost an afternoon and would catch the apostrophe-round-trip question, the Thai chunk-size question, and the header-row-position question before they reach 60 people.

**7. No load test, despite every proposal arguing about concurrency.** The 30-simultaneous-execution ceiling is the pivot of the migrate/stay decision, the quiz feasibility question, and the shift-change capacity claim — and it is argued entirely from estimates. Thirty parallel POSTs to `/exec` from a laptop would settle it in an hour. Launch day (60 staff verifying at once) is a known, dated event; it should be rehearsed, not predicted.

**8. Nothing surfaces failure to a human.** Almost every error path is `try { } catch { console.error }`. The only alerting channel is email from an account with a 100/day quota that the security audit shows can be exhausted by ~100 unrate-limited leave submissions. There is no "N errors yesterday" line anywhere. After this program the system will have more moving parts — a cache, an onEdit trigger, an image pipeline, a quiz state machine — and the same zero visibility.

**9. There is no maintenance-mode kill switch.** One Settings key checked at the top of `handleApi_` returning a friendly Thai "ระบบกำลังปรับปรุง สักครู่นะครับ" would make every deploy in this program safe and would cost five lines. The quiz proposal has per-feature `status` switches; nothing has a global one.

**10. Client-side asset staleness after a deploy.** All eight pages load `app.css`, `config.js` and `app.js` with no version query string (`news.html:7`). After the retheme, staff phones holding a cached `app.css` render the old palette against new markup. GitHub Pages' cache headers bound this to minutes rather than forever, but the LINE in-app webview is its own cache and the fix is free: have `release.sh` stamp `?v=$TAG` onto the three asset references. This matters more once the console and the quiz ship, because a stale `app.js` against a new API shape is a broken page rather than a wrong colour.

**11. The date-convention bug is unowned.** `schedule.html` mixes a `+7h`-then-read-UTC convention with device-local `getTimezoneOffset()` and device-local `getFullYear()/getMonth()`, and `app.js` uses a third convention. On an Asia/Bangkok phone they cancel; on any other device the month grid and the range sent to `api('schedule')` drift by a day near month boundaries. The audits found it; no proposal's step list includes it. It surfaces to the user as "the app showed me the wrong day for my shift", which is the single fastest way to lose staff trust in a scheduling system.

**12. Dead code and dead diagnostics are unowned.** `action=how_to` still has no handler (`08_RichMenu.js:74`) — it is the second button a new hire touches. `checkWebhookTraffic` still reads two counters nothing writes. `pushTomorrowReminder` is still deleted-and-not-recreated by `installTriggers`. `config.js:28` `THEME` is still dead, and the retheme has now produced **four** copies of the palette (`config.js`, `00_Config.js`, `app.css`, `richmenu/build.py`), each with a comment telling the reader to keep it in sync with the other three. Dead paths and duplicated sources of truth are precisely what makes a maintenance manual (goal 6) untrustworthy, and the manual is being written on top of them.

**13. Two product questions worth asking the owner before the quiz is built.** This is a halal restaurant with ~60 mostly-Muslim staff; the shift system has no concept of Friday Jumu'ah timing or a Ramadan schedule, and the quiz's "company vision" content will presumably touch values that the handbook already treats carefully. Neither is a bug, but both are cheaper to design in now than to retrofit — and the Ramadan case in particular will produce a month of `manual` schedule rows every year, feeding directly into the roster-generator problem above.