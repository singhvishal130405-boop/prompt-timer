# Contributing to Prompt Timer

Thanks for your interest! Small fixes and focused improvements are very welcome.

## The most useful contribution: fixing a broken selector

The AI sites change their pages from time to time. When that happens the chat box or Send
button can no longer be found. The fix is usually tiny and lives in one place: the `SITES`
object at the top of [`src/content.js`](src/content.js).

1. Open the site, right-click the chat box and choose **Inspect**.
2. Look for a stable attribute: `id`, `data-testid`, `aria-label` or `role`.
3. Add a selector for it at the **top** of that site's `input` (chat box) or `send` (button) list.
4. Reload the extension in `chrome://extensions`, then reload the site and test.

## Running the project locally

There is no build step.

1. Fork and clone the repository.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and choose `src/`.
3. After every code change, click the reload icon on the extension and reload the AI tab.

Debugging consoles:

- **Popup:** right-click the extension icon, then **Inspect popup**.
- **Service worker:** `chrome://extensions`, then click the **service worker** link.
- **Content script:** open DevTools (F12) on the AI site.

## Before you open a pull request

- Test on every site your change could affect (Claude, ChatGPT, Gemini).
- Run the checks: `node .github/scripts/validate-extension.js`
- Keep changes focused. One fix or feature per pull request.
- Keep the extension dependency-free and request no new permissions without a clear reason.
- Update [CHANGELOG.md](CHANGELOG.md) under **Unreleased**.
- Do not include personal prompts, screenshots of private chats, or secrets.

## Commit messages

Use short, conventional messages:

- `feat: add repeat schedules`
- `fix: update ChatGPT send selector`
- `docs: clarify install steps`
- `refactor: split send logic into helpers`

## Ground rules

- Be respectful and constructive.
- This tool must stay honest: it sends what the user wrote, when the user asked, in the user's own session. Features meant for spam, bulk automation or evading provider limits will not be accepted.
