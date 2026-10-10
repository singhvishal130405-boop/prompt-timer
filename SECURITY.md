# Security Policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private reporting: open the **Security** tab of this repository and choose
**Report a vulnerability**. Include what you found, how to reproduce it and the possible impact.

You can expect an acknowledgement within a few days. This is a personal project maintained
in spare time, so fixes are made on a best-effort basis.

## Scope and design notes

- The extension has no backend and makes no network requests.
- Data is stored only in `chrome.storage.local` and is not encrypted. Do not save secrets as prompts.
- Host access is limited to `claude.ai`, `chatgpt.com` and `gemini.google.com`.
- User-provided text is rendered with `textContent`, never `innerHTML`.
