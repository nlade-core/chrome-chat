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
- Edit any previous message (not just the last) and resend — non-destructive: nothing is touched until you confirm, and a clear warning shows how many later messages would be removed if you're editing an earlier one
- A warning once a conversation gets close to the model's context limit
- Delete a saved conversation with a two-click confirmation (no accidental, un-undoable deletes)
- Rename a saved conversation inline
- Search saved conversations by title *and* full message content
- A "scroll to bottom" button that appears once you've scrolled up mid-conversation
- **Conversation forking**: editing a message offers "Fork" alongside "Save & submit" — instead of overwriting, it creates a brand-new conversation with everything before the edit preserved, leaving the original completely untouched. Forked conversations collapse into a single sidebar entry (the original's title + a count badge); expanding it shows every version — original and forks alike — as neutral peers with a relation tag and last-updated time, no version auto-selected as "main". Forking a fork still traces back to the true original, however deep the chain.
- **Multimodal input**: attach an image or audio clip alongside your message. The attachment persists across reloads and browser restarts, same as everything else — the real image/audio renders again the next time you open that conversation, not just a memory of it having existed.
- **Response timing**: each finished reply shows how long it actually took — time to first token and total duration — a quick, honest answer to "is this slow, does an image slow it down," measured live rather than assumed. In-memory only, not saved across a reload.
- **Safe background generation**: switching to a different conversation — or starting a new chat — while a reply is still streaming no longer loses or corrupts anything. The reply keeps generating and saves correctly to the conversation it actually belongs to; a small dot in the sidebar shows which thread is still working while you're looking at something else.

## Requirements

**Branded Google Chrome, desktop, only.** Gemini Nano's weights are proprietary to Google's own Chrome binary — open-source Chromium doesn't have them, so this won't produce real answers in Chromium-based non-Google browsers or automated test browsers. The Prompt API itself needs a recent Chrome (138+); if the sidebar shows "not in this browser" or "needs download," that's what's happening.

## Architecture

Single static `index.html` — zero build step, zero framework, zero backend. Everything runs in your browser:

- **Model:** `window.LanguageModel` (Chrome's Prompt API), lazily created — no session exists until you actually send a message or open a saved conversation.
- **Storage:** `localStorage`, namespaced `chrome-chat:`, for everything text-based — an index key (`chrome-chat:index`) holds `[{id, title, updatedAt}]`, each conversation's messages live under their own `chrome-chat:thread:<id>` key. Attachment *blobs* live separately in IndexedDB (`chrome-chat-attachments`, one object store keyed by a generated id) since binary data doesn't fit `localStorage`'s small text-only quota — a message references its attachment by that id rather than embedding it. Deleting a conversation deletes its attachment blobs too, unless a fork still references the same one (forks can share pre-fork attachments — checked before any blob is actually removed).
- **Restoring a saved conversation:** its messages render immediately (free, just redrawn from storage) — the model itself is only re-primed with that history via `initialPrompts` at the moment you open it, never speculatively for conversations you haven't clicked on.
- **Markdown:** rendered via `marked.js`, with model output escaped *before* parsing — literal HTML/`<script>` in a response renders as inert text, never executes.
- **Fork lineage:** two extra fields on a thread's index entry — `forkedFrom` (immediate parent id) and `forkRoot` (the ultimate original ancestor, inherited transitively). A fork of a fork still resolves back to the true root in one lookup, without walking the chain.
- **Per-conversation isolation:** each conversation (including a brand-new one, from the instant its first message is sent) has its own session, its own message history, and its own in-flight-generation state, held independently of whichever one is currently displayed. Switching what you're looking at never touches another conversation's live state.

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
- Editing any message (confirmed on the first message of a multi-turn conversation, not just the last) correctly truncates only what comes after it, shows the right discard count first, and a confirmed resend recreates the session with the true preserved history; Cancel/Escape reverts with zero side effects -- no session destroyed, nothing lost.
- The context-limit warning fires only once real usage crosses 85% of the window, and clears on a new chat.
- Delete requires two clicks (confirmed the thread survives the first, is removed on the second) and auto-reverts if left unconfirmed; rename updates and persists, Escape cancels without saving; search matches by stored message content, not just title (confirmed against a renamed thread whose title no longer contained the search term but whose messages still did), and shows a distinct message when nothing matches versus when there's nothing saved at all.
- The scroll-to-bottom button appears only once scrolled away from the bottom, and correctly hides itself when switching conversations even if you'd scrolled up in the previous one.
- Forking leaves the original thread's saved messages and index entry byte-for-byte unchanged; a fork's `forkedFrom`/`forkRoot` are correct, and forking a fork still resolves `forkRoot` back to the true original two levels back, not the intermediate fork. A 3-member family (original + fork + fork-of-a-fork) collapses to one sidebar row with the correct count badge; expanding shows exactly one "Original" and the rest tagged "Fork"; the row highlights as active whenever any member is the open conversation. Renaming a family's root updates the sidebar label live. Deleting a thread with dependent forks warns with the real count first, and — once confirmed — the surviving forks correctly render as a plain standalone row rather than a broken family display.

- Attaching a file sends a real File as part of the model turn alongside any text, every session declares all three `expectedInputs`, and the attachment renders as a real inline preview both immediately and after a full reload (confirmed via the restored `<img>`'s actual decoded pixel data, not just its presence in the DOM).
- The image-attachment flicker while a reply streams in is gone: the display URL is minted once per message and reused, not regenerated on every streamed chunk (confirmed: exactly one `createObjectURL` call across a multi-chunk stream, was many before the fix).
- Deleting a conversation whose attachment is also referenced by a fork leaves the shared blob intact; deleting the last conversation that references a blob actually removes it from IndexedDB (no orphaned/leaked blobs either way) — both confirmed directly against IndexedDB contents, not inferred from the UI.
- Editing, forking, or regenerating a message that had an attachment carries the attachment forward correctly — it stays visible in the transcript and the model actually sees the real image/audio again, not a silently text-only resend; confirmed the same stored blob is reused (same `attachmentId` before and after) rather than a duplicate copy.
- Switching to a different conversation (or starting a new one) while a reply is still streaming no longer loses or corrupts anything — reproduced the original bug directly first (the interrupted reply vanished with no trace in one run, and hijacked a stray thread id in another), then confirmed both are gone: the interrupted reply now completes and saves correctly in the background while an unrelated new conversation proceeds independently. Also confirmed: Stop only ever affects the currently-displayed conversation (a background reply is unaffected), deleting a conversation mid-generation aborts it rather than letting it resurrect itself afterward, and reopening a conversation that's still generating shows its real live state (Stop button, correct partial content) rather than a stale snapshot.

**Not yet verified:** real Gemini Nano answer quality, real streaming latency, real `contextWindow`/`contextUsage` figures, and real multimodal understanding (does it actually describe an attached image sensibly) — all need testing in actual Chrome, not a stub.

## License

MIT
