# Chrome built-in AI (Gemini Nano) — failure modes

Reference for when Prompt API / Summarizer / Writer / Rewriter / Proofreader / Translator /
other built-in-AI APIs stop working in Chrome, especially "worked yesterday, dead today"
cases. These are unstable, actively-changing APIs — most breakage is Chrome/infra, not your
code. Diagnose in this order: console availability check → chrome://crashes →
chrome://components → chrome://gpu → flags/namespace.

Last updated: 2026-09-09 evening.

## Diagnostic first move

In devtools console, on the actual page:

```js
await LanguageModel.availability()
```

- `LanguageModel is not defined` → wrong/old namespace or flag not set (see "API renames" below).
- `"unavailable"` → device/browser ineligible right now (crash breaker, GPU blocklist, disk space).
- `"downloadable"` / `"downloading"` → model isn't resident yet; `.create()` should trigger/resume it.
- `"available"` → Chrome's fine, bug is in your code.
- A thrown/logged error instead of a clean status → read it, it's usually specific (see below).

## Known failure modes

### 1. Crash-loop circuit breaker (confirmed cause, 2026-09-08)
**Symptom:** `LanguageModel.availability()` throws "The model process crashed too many times
for this version. Check chrome://crashes for additional information." Feature is dead until
fixed — retrying does nothing.

**Cause:** the on-device model runs in its own process. Chrome counts crashes of that process
per model version, and once the count is exceeded it refuses to relaunch it at all — not a
graceful per-request error, a hard stop for the whole browser session/profile. Oversized or
malformed prompts (e.g. dumping raw extracted-PDF text with no length cap) are a common
trigger — the model's context window is small enough that big or garbled input can crash the
process instead of erroring cleanly.

**Fix, in order of effort:**
1. `chrome://components` → "Check for update" on the on-device model manifest components
   (`Optimization Guide On DeviceModels Manifest`, and any `nano_v*_gpu_component` /
   `nano_v*_component`). The crash counter is scoped to model version — a new build resets it.
2. Fully quit Chrome (Cmd+Q) and relaunch. Not guaranteed (counter lives in prefs, not memory)
   but free to try first.
3. If neither clears it: stuck until Chrome ships a new model/build, or until the profile's
   optimization-guide prefs are reset (more invasive — last resort).

**Prevent recurrence:** cap input length before sending to `.prompt()`/`.create()` — truncate
or chunk long extracted text rather than passing it raw. Don't feed it anything you haven't
sanity-checked the size of.

### 2. API renamed/moved namespace
The global surface for these APIs has moved more than once: `window.ai.*` → `self.ai.*` →
top-level globals (`LanguageModel`, `Summarizer`, `Writer`, `Rewriter`, `Proofreader`,
`Translator`, `LanguageDetector`). Code written against an older namespace silently breaks
(usually `undefined` rather than a clear error) after a Chrome update that finishes the
migration for a given API.

**Fix:** check the current namespace against https://developer.chrome.com/docs/ai/built-in for
the API in question before assuming a deeper problem. Feature-detect rather than hardcoding one
namespace where practical.

### 3. Missing output-language spec
Newer builds warn (not yet a hard failure, but tightening): "No output language was specified
... Please specify a supported output language code." Calls without `outputLanguage` /
`expectedOutputs` may get downgraded quality or, on some versions, rejected outright.

**Fix:** always pass an explicit output language in `create()` options.

### 4. GPU blocklist / hardware-acceleration regression
Some model variants (the `*_gpu_component` builds) require GPU acceleration. If Chrome's GPU
blocklist flags your hardware/driver after an update, or hardware accel gets disabled some
other way, the GPU-backed model path fails even though the manifest looks fine.

**Fix:** check `chrome://gpu` for blocklisted/disabled features after any breakage that
coincides with a Chrome update. Cross-reference against a stale-looking `*_gpu_component`
manifest in `chrome://components` (a manifest that hasn't updated in a year while its siblings
update monthly is a sign its registration path is broken).

### 5. Disk-space eligibility
The on-device model has a real disk-space floor to even be offered for download. If free space
drops below it (backups, downloads, Time Machine sparsebundle growth, etc.) the model can go
from "available" to "unavailable" with no code change and no obvious error — it just silently
stops being offered.

**Fix:** check free disk space. No dedicated internals page for this in the current channel
(see note below) — infer it from a sudden `"unavailable"` with everything else (crashes,
components, GPU) clean.

### 6. Rollout/Finch gating, not just flags
Availability isn't governed by `chrome://flags` alone — Google also gates these features by a
server-side rollout percentage per profile/install. Two machines on identical Chrome versions
with identical flags can differ. This means "it works on my other machine" doesn't rule out a
local issue, and there's no user-facing toggle to force it — you're at the mercy of the rollout
unless testing on a flag that's fully stable-enabled.

### 7. Flag expiry across milestones
Chrome periodically "expires" experimental flags at a given milestone; if it was relied on, it
can vanish or reset silently on update (see the `#temporary-unexpire-flags-mNNN` entries in
`chrome-flags.md` — that mechanism exists precisely because flags get retired routinely).
A flag you set once isn't guaranteed to survive every future update.

### 8. Origin trial token expiration (hosted, non-flag usage)
If a site uses these APIs via an origin-trial token (`<meta http-equiv="origin-trial" ...>`)
instead of requiring visitors to flip flags, the token has a fixed calendar expiration
independent of Chrome version. It can lapse on its own schedule and silently disable the
feature for all visitors — check the token's expiry if a hosted (not local-flags-based) demo
stops working with no correlating Chrome update.

## Notes on diagnostics available in this Chrome build (152.x, stable channel)
- No `chrome://on-device-internals` in this channel — don't rely on it, it's not compiled in
  here (may exist on Canary/Dev).
- `chrome://on-device-translation-internals` exists but is Translator-API-specific (language
  pack install state) — not useful for Prompt API / general Nano issues.
- `chrome://components` shows installer state only, not eligibility or crash-breaker state.
  A missing "Optimization Guide On Device Model" weights entry means it's never been
  triggered to download, not necessarily that it's broken.
- `chrome://crashes` is the ground truth for the crash-loop scenario (failure mode #1).
- `chrome://gpu` is the ground truth for failure mode #4.
