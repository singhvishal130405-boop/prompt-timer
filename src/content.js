// content.js — runs inside claude.ai, chatgpt.com and gemini.google.com.
// Receives { type: "PROMPT", text, send } from the popup/background,
// types the text into the chat box and (optionally) clicks Send.
//
// If a site changes its page structure and sending stops working,
// update the selectors in SITES below (see README for how to find them).

(() => {
  // Guard against being injected twice into the same page.
  if (window.__promptTimerLoaded) return;

  const SITES = {
    "claude.ai": {
      name: "Claude",
      input: [
        '[data-testid="chat-input"]',
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]'
      ],
      send: [
        'button[aria-label="Send message"]',
        'button[aria-label="Send Message"]',
        'button[data-testid="send-button"]'
      ]
    },
    "chatgpt.com": {
      name: "ChatGPT",
      input: [
        "div#prompt-textarea",
        '#prompt-textarea[contenteditable="true"]',
        'div.ProseMirror[contenteditable="true"]',
        "textarea#prompt-textarea",
        "textarea"
      ],
      send: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Send message"]'
      ]
    },
    "gemini.google.com": {
      name: "Gemini",
      input: [
        "rich-textarea .ql-editor",
        'div.ql-editor[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]'
      ],
      send: [
        'button[aria-label="Send message"]',
        "button.send-button",
        'button[mattooltip="Send message"]'
      ]
    }
  };

  const cfg = SITES[location.hostname];
  if (!cfg) return;
  window.__promptTimerLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function findFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // The chat box, looked up fresh each time (sites re-render it often).
  function getComposer() {
    for (const sel of cfg.input) {
      for (const el of document.querySelectorAll(sel)) {
        if (isVisible(el)) return el;
      }
    }
    return null;
  }

  async function waitFor(fn, timeoutMs = 30000, stepMs = 300) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const value = fn();
      if (value) return value;
      await sleep(stepMs);
    }
    return null;
  }

  function readText(el) {
    if ("value" in el) return el.value || "";
    return el.innerText || el.textContent || "";
  }

  async function insertText(el, text) {
    el.focus();

    // Plain <textarea> / <input>
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    // Rich-text editors (ProseMirror, Quill): replace whatever is there.
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);

    // Attempt 1: simulate a paste (keeps line breaks intact).
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true
        })
      );
    } catch (_) {
      /* fall through to attempt 2 */
    }
    await sleep(250);

    // Attempt 2: execCommand insertText.
    if (readText(el).trim().length === 0) {
      el.focus();
      document.execCommand("insertText", false, text);
      await sleep(250);
    }

    if (readText(el).trim().length === 0) {
      throw new Error("Could not type into the chat box.");
    }
  }

  // ---- Finding and pressing the Send button -------------------------

  const SEND_RE = /send|submit/i;
  const NOT_RE = /attach|upload|voice|dictat|microphone|record|stop|add |menu|model|search|file|photo|image/i;

  function isEnabled(b) {
    return !b.disabled && b.getAttribute("aria-disabled") !== "true";
  }

  function labelOf(b) {
    return [
      b.getAttribute("aria-label"),
      b.getAttribute("data-testid"),
      b.getAttribute("title"),
      b.getAttribute("mattooltip"),
      (b.textContent || "").trim().slice(0, 20)
    ].filter(Boolean).join(" | ");
  }

  function nearbyButtons(composer) {
    const found = new Set();
    let node = composer;
    for (let i = 0; i < 10 && node && node.parentElement; i++) {
      node = node.parentElement;
      node.querySelectorAll('button, [role="button"]').forEach((b) => found.add(b));
    }
    return [...found];
  }

  function findSendButton(composer) {
    const known = findFirst(cfg.send);
    if (known) return known;

    const candidates = nearbyButtons(composer).filter((b) => {
      const text = labelOf(b);
      const cls = String(b.className || "");
      return (SEND_RE.test(text) || SEND_RE.test(cls)) && !NOT_RE.test(text);
    });
    const enabled = candidates.find(isEnabled);
    if (enabled || candidates.length) return enabled || candidates[0];

    const form = composer.closest("form");
    if (form) return form.querySelector('button[type="submit"]');
    return null;
  }

  function fullClick(el) {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.click();
  }

  function pressEnter(el, extra = {}) {
    el.focus();
    const opts = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
      ...extra
    };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  // "Sent" = the page moved to a new chat URL, OR a freshly looked-up,
  // visible chat box is now empty. (We never trust the old element,
  // because sites replace it while re-rendering.)
  async function wasSent(startHref) {
    const ok = await waitFor(() => {
      if (location.href !== startHref) return true;
      const c = getComposer();
      return !!c && readText(c).trim().length === 0;
    }, 4000, 250);
    return !!ok;
  }

  async function submit() {
    const startHref = location.href;
    const started = Date.now();
    let nudged = false;

    // Wait for an enabled Send button.
    const button = await waitFor(() => {
      const c = getComposer();
      if (!c) return null;
      const b = findSendButton(c);
      if (b && isEnabled(b)) return b;
      if (!nudged && Date.now() - started > 2500) {
        nudged = true;
        c.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: " " }));
      }
      return null;
    }, 10000, 300);

    // Attempt 1: click the Send button
    if (button) {
      fullClick(button);
      if (await wasSent(startHref)) return "button";
    }

    // Attempt 2: submit the surrounding <form>
    let c = getComposer();
    const form = c && c.closest("form");
    if (form && typeof form.requestSubmit === "function") {
      try { form.requestSubmit(); } catch (_) { /* ignore */ }
      if (await wasSent(startHref)) return "form-submit";
    }

    // Attempt 3: Enter, then Ctrl+Enter
    c = getComposer();
    if (c) {
      pressEnter(c);
      if (await wasSent(startHref)) return "enter-key";
      pressEnter(c, { ctrlKey: true });
      if (await wasSent(startHref)) return "ctrl-enter";
    }

    c = getComposer();
    const labels = c ? nearbyButtons(c).map(labelOf).filter(Boolean).slice(0, 10) : [];
    console.warn("[Prompt Timer] Could not send. Buttons near the chat box:", labels);
    throw new Error(
      "The prompt was typed but could not be sent. Buttons near the chat box: " +
        (labels.join(" ; ") || "none found")
    );
  }

  async function handlePrompt(msg) {
    const composer = await waitFor(getComposer, 30000, 400);

    if (!composer) {
      return {
        ok: false,
        error: `Couldn't find the ${cfg.name} chat box. Are you logged in? (selectors may need updating)`
      };
    }

    await insertText(composer, msg.text);

    if (!msg.send) return { ok: true, sent: false };

    await sleep(500);
    const how = await submit();
    return { ok: true, sent: true, how };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;

    if (msg.type === "PING") {
      sendResponse({ ok: true, site: cfg.name });
      return;
    }

    if (msg.type === "PROMPT") {
      handlePrompt(msg)
        .then(sendResponse)
        .catch((err) =>
          sendResponse({ ok: false, error: String((err && err.message) || err) })
        );
      return true; // keep the channel open for the async response
    }
  });
})();
