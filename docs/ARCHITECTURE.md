# Architecture

This document describes how Prompt Timer is put together. For a beginner-friendly walkthrough
of every file, see the developer guide (`docs/developer-guide.pdf`, if present).

## Components

| Component | Files | Runs in | Responsibility |
|---|---|---|---|
| Popup | `popup.html`, `popup.css`, `popup.js` | Popup page (exists only while open) | UI, saving prompts, creating jobs and alarms |
| Service worker | `background.js` | Extension background (event-driven) | Reacts to alarms, orchestrates tab and send, records results |
| Content script | `content.js` | Inside claude.ai, chatgpt.com, gemini.google.com | Types the prompt and sends it |

The content script runs in an isolated world: it shares the page's DOM but not its JavaScript variables.

## Scheduled send, step by step

1. In the popup, the user schedules a job. `popup.js` appends it to `schedules` in `chrome.storage.local` and calls `chrome.alarms.create('sched:<id>', { when })`.
2. At the scheduled time Chrome fires `chrome.alarms.onAlarm` and wakes the service worker.
3. `fire(id)` loads the job. It stops if the job is no longer `pending`, and marks it `missed` if it is more than 30 minutes late.
4. The job is marked `running`. `getReadyTab()` finds a tab on the site (or opens one), optionally navigates to the new-chat URL, and activates the tab.
5. `sendToTab()` sends `{ type: 'PROMPT', text, send: true }` to the content script, retrying while the page loads. If no content script is present, it injects `content.js` with `chrome.scripting.executeScript`.
6. `content.js` finds the chat box, inserts the text, finds and activates the Send button, and verifies the message was sent.
7. The content script replies `{ ok: true, sent: true, how }` or `{ ok: false, error }`.
8. The worker stores `sent` or `failed`, plus a note, and shows a notification. The popup re-renders automatically through `chrome.storage.onChanged`.

## Data model

Stored in `chrome.storage.local`:

```js
// prompts
{ id, title, text }

// schedules
{
  id, title,
  text,            // snapshot of the prompt text at scheduling time
  site,            // 'claude' | 'chatgpt' | 'gemini'
  when,            // timestamp (ms)
  newChat,         // boolean
  status,          // 'pending' | 'running' | 'sent' | 'failed' | 'missed'
  note,            // error or explanation, optional
  created, sentAt  // timestamps, optional
}

// lastSite: 'claude' | 'chatgpt' | 'gemini'   (popup theme)
```

Status flow: `pending` to `running` to `sent` or `failed`. A `pending` job that is too late becomes `missed`.

## Message protocol

| Message | Direction | Meaning |
|---|---|---|
| `{ type: 'PROMPT', text, send }` | popup or worker to content script | Type the text; send it if `send` is true |
| `{ type: 'PING' }` | any to content script | Health check, replies `{ ok, site }` |
| `{ ok, sent, how }` / `{ ok: false, error }` | content script reply | Result of a `PROMPT` |

`how` is the route that worked: `button`, `form-submit`, `enter-key` or `ctrl-enter`.

## Sending strategy (`content.js`)

- **Find the chat box:** per-site selector lists, visible elements only, looked up fresh each time.
- **Type:** plain `textarea` via the native value setter plus an `input` event; rich-text editors via a simulated paste event, falling back to `execCommand('insertText')`.
- **Send, in order:** click the Send button (known selectors, then buttons near the chat box, then a form submit button); `form.requestSubmit()`; Enter; Ctrl+Enter.
- **Verify:** success only if the URL changed or a freshly found, visible chat box is empty.

## Design decisions

- **Alarms over timers:** the service worker is terminated when idle, so in-memory timers are unreliable.
- **Storage as the source of truth:** the worker never relies on variables that may disappear.
- **Job text snapshot:** deleting a saved prompt never breaks a scheduled job.
- **Isolated selectors:** the only part that breaks over time is a small config object.
- **Verification before success:** errors are surfaced instead of reported as sent.
- **Late-send limit:** a prompt sent hours late defeats the purpose, so overdue jobs are skipped.

## Theming

`popup.js` sets `document.body.dataset.site` to `claude`, `chatgpt` or `gemini`. CSS rules such as
`body[data-site='gemini'] { ... }` override a set of CSS variables (colors, radii, heading font).
Dark mode uses `prefers-color-scheme`.

## Extending to a new site

1. Add the site to `SITES` in `background.js` (name, new-chat URL, match pattern).
2. Add selector lists for the chat box and Send button in `SITES` in `content.js`.
3. Add the host to `host_permissions` and `content_scripts.matches` in `manifest.json`.
4. Add an option to the site `select` in `popup.html`, a name in `SITE_NAMES`, and a theme block in `popup.css`.
