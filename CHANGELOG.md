# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned
- Repeating schedules (daily / every N hours)
- Edit saved prompts
- Import and export prompts as JSON

## [0.1.3] - 2026-10-10

### Added
- Site-aware popup theming: the popup adopts the colors, corner shapes and button
  style of the selected site (Claude, ChatGPT or Gemini), in light and dark mode.
- A "Sending to ..." pill in the header and a colored site indicator on every job in the queue.
- The popup preselects the site of the current tab, otherwise the last site used.
- `homepage_url` in the manifest.

## [0.1.2] - 2026-10-10

### Fixed
- Claude: "Could not establish connection. Receiving end does not exist." The background
  worker now injects `content.js` programmatically when a tab has no content script
  (for example, a tab opened before the extension was installed or reloaded).
- ChatGPT: a prompt could be typed but not sent while the extension still reported success.
  "Sent" is now confirmed only when the page URL changes or a freshly located, visible
  chat box is empty. The old element is never trusted, because sites re-render it.

### Added
- `scripting` permission (used only for the injection fallback above).
- Additional send route: `form.requestSubmit()` on the surrounding form.
- Failure messages now include the tab URL.

## [0.1.1] - 2026-10-10

### Fixed
- Prompts were typed into the chat box but not sent on some sites.

### Added
- Smarter Send-button detection: known selectors, then a scan of buttons near the
  chat box, then a submit button inside the same form.
- Full pointer/mouse event sequence when clicking Send.
- Fallback to Enter and Ctrl+Enter key events.
- On failure, the error lists the buttons found near the chat box to speed up debugging.

## [0.1.0] - 2026-10-10

### Added
- First working prototype (Manifest V3): save prompts, schedule one-time sends for
  Claude, ChatGPT and Gemini, live queue with countdown, desktop notifications,
  alarm restoration after browser restart, and skipping of jobs more than 30 minutes late.
