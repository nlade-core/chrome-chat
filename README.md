# chrome-chat

A familiar, modern chat-app interface running entirely on Chrome's built-in Gemini Nano — no server, no API key, no account, nothing sent anywhere. Live at https://nlade-core.github.io/chrome-chat/

## Why this exists

Built directly on two pages from [`pages-lab-ai`](https://github.com/nlade-core/pages-lab-ai): `chat-threads` (multiple saved conversations in `localStorage`, replayed into the model only on demand) and `assistant` (markdown rendering, further chat polish). This repo takes that same underlying mechanism and gives it the full-height app-shell interface modern AI chat apps use — a dark sidebar of past conversations, centered chat column, bubble-less assistant replies — rather than `pages-lab-ai`'s boxed-panel, scrolling-document house style.

## Features

- Multiple saved conversations, listed in the sidebar, backed by `localStorage`
- Streaming replies with Markdown rendering
- Copy a finished reply to the clipboard
- Stop generation mid-stream
- Regenerate the last reply
- Edit a previous message and resend
- A warning once a conversation gets close to the model's context limit

## Requirements

**Branded Google Chrome, desktop, only.** Gemini Nano's weights are proprietary to Google's own Chrome binary — open-source Chromium doesn't have them, so this won't produce real answers in Chromium-based non-Google browsers or automated test browsers. The Prompt API itself needs a recent Chrome (138+); if the sidebar shows "not in this browser" or "needs download," that's what's happening.

## Architecture

Single static `index.html` — zero build step, zero framework, zero backend. Everything runs in your browser:

- **Model:** `window.LanguageModel` (Chrome's Prompt API), lazily created — no session exists until you actually send a message or open a saved conversation.
- **Storage:** `localStorage`, namespaced `chrome-chat:`. An index key (`chrome-chat:index`) holds `[{id, title, updatedAt}]`; each conversation's messages live under their own `chrome-chat:thread:<id>` key.
- **Restoring a saved conversation:** its messages render immediately (free, just redrawn from storage) — the model itself is only re-primed with that history via `initialPrompts` at the moment you open it, never speculatively for conversations you haven't clicked on.
- **Markdown:** rendered via `marked.js`, with model output escaped *before* parsing — literal HTML/`<script>` in a response renders as inert text, never executes.

## Verified

End to end with Playwright, stubbing `window.LanguageModel` (this is an ordinary web API call — real Chromium test browsers don't carry Google's proprietary Nano weights, so real answer quality can only be confirmed in your own real Chrome):

- Full-viewport shell renders with no console errors; composer stays fixed in place while the chat log scrolls independently.
- Mobile layout: sidebar genuinely off-screen by default, opens via the hamburger button, closes on overlay click or Escape.
- Zero `LanguageModel.create()` calls at page load or after a reload — the model is never touched just from opening the page.
- Sending a message creates exactly one session; a second "+ New chat" doesn't create another one until you actually send.
- Reopening a saved conversation replays the *exact* saved history into a fresh session via `initialPrompts` — confirmed by inspecting the real argument passed to `create()`, not just checking the UI.
- A response containing a literal `<script>` tag and Markdown formatting renders as inert escaped text with the formatting intact — no real script executes.
- Stop generation cancels the stream immediately via a real `AbortSignal`; no further chunks land even if the underlying call resumes afterward, and the partial reply still gets a Copy button.
- Regenerating the last reply preserves every earlier exchange (confirmed via the exact `initialPrompts` sent to the recreated session), drops only the pair being regenerated, and resends the real original message — not a placeholder.
- Editing a message truncates the conversation correctly, repopulates the input, and a resend afterward recreates the session with the true preserved history rather than silently forgetting it.
- The context-limit warning fires only once real usage crosses 85% of the window, and clears on a new chat.

**Not yet verified:** real Gemini Nano answer quality, real streaming latency, and real `contextWindow`/`contextUsage` figures — all need testing in actual Chrome, not a stub.

## License

MIT
