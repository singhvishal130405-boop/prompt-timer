# Privacy Policy

**Prompt Timer for AI Chats** &middot; Last updated: 10 October 2026

Prompt Timer is built to keep everything on your own computer. This document explains
exactly what the extension stores, what it reads, and what it never does.

## Summary

- No data is sent to the developer or to any third party.
- No analytics, tracking, advertising or telemetry.
- The extension makes no network requests of its own.
- No account is needed, and there is no remote code.

## What the extension stores (on your device only)

The extension uses `chrome.storage.local`, which lives inside your Chrome profile:

| Data | Why it is stored |
|---|---|
| Your saved prompts (title and text) | So you can reuse them |
| Scheduled jobs (prompt text copy, chosen site, time, status, error note) | So the timer can run and the queue can be shown |
| Last site you selected | So the popup opens with the right theme |

This data is not encrypted by the extension. Anyone who can access your Chrome profile can
read it, so **do not save passwords, API keys or other secrets as prompts.**

## What the extension reads on web pages

The extension runs a script only on `claude.ai`, `chatgpt.com` and `gemini.google.com`.
On those pages it:

- looks for the chat input box and the Send button,
- writes your saved prompt into the chat box and presses Send,
- reads the text of the chat box (not your conversation history) to confirm the prompt
  was typed and sent.

It does not read, copy, store or transmit your conversations, account details or any
other page content.

## Permissions and why they are needed

| Permission | Reason |
|---|---|
| `storage` | Save prompts and scheduled jobs locally |
| `alarms` | Wake the background worker at the scheduled time |
| `notifications` | Tell you whether a prompt was sent, failed or missed |
| `scripting` | Inject the page script if a tab does not already have it |
| Host access to the three sites above | Fill the chat box and click Send there |

## Your control over your data

- Delete a prompt from the Prompts tab; cancel or remove jobs from the Queue tab.
- **Clear finished** removes completed jobs.
- Removing the extension deletes all of its stored data.

## Third-party services

The extension is not affiliated with Anthropic, OpenAI or Google. Prompts you send are
handled by the service you send them to, under that service's own terms and privacy policy.

## Changes to this policy

Any change will be recorded in [CHANGELOG.md](CHANGELOG.md) and in this file's date.

## Contact

Questions or concerns: please open an issue at
https://github.com/singhvishal130405-boop/prompt-timer/issues
