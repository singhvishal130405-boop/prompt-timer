// background.js — service worker.
// Wakes up when a chrome.alarms timer fires, opens/finds the right tab,
// and asks content.js to type and send the saved prompt.

const SITES = {
  claude: {
    name: "Claude",
    newChat: "https://claude.ai/new",
    match: "https://claude.ai/*"
  },
  chatgpt: {
    name: "ChatGPT",
    newChat: "https://chatgpt.com/",
    match: "https://chatgpt.com/*"
  },
  gemini: {
    name: "Gemini",
    newChat: "https://gemini.google.com/app",
    match: "https://gemini.google.com/*"
  }
};

const LATE_LIMIT_MS = 30 * 60 * 1000; // skip schedules that are >30 min overdue

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getSchedules() {
  const { schedules = [] } = await chrome.storage.local.get("schedules");
  return schedules;
}

async function patchSchedule(id, patch) {
  const all = await getSchedules();
  const i = all.findIndex((s) => s.id === id);
  if (i === -1) return null;
  all[i] = { ...all[i], ...patch };
  await chrome.storage.local.set({ schedules: all });
  return all[i];
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message
  });
}

function waitForComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === "complete") return resolve();
      } catch (_) {
        return resolve();
      }
      if (Date.now() - started > timeoutMs) return resolve();
      setTimeout(check, 500);
    };
    check();
  });
}

function navigate(tabId, url, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const finish = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url });
  });
}

async function getReadyTab(siteKey, newChat) {
  const site = SITES[siteKey];
  const tabs = await chrome.tabs.query({ url: site.match });
  let tab = tabs.find((t) => t.active) || tabs[0];

  if (!tab) {
    tab = await chrome.tabs.create({ url: site.newChat, active: true });
    await waitForComplete(tab.id);
  } else {
    if (newChat) await navigate(tab.id, site.newChat);
    await chrome.tabs.update(tab.id, { active: true });
  }

  await sleep(1500); // let the page's scripts settle
  return tab;
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return true;
  } catch (_) {
    return false;
  }
}

async function sendToTab(tabId, message) {
  let lastError;
  let injected = false;
  for (let i = 0; i < 12; i++) {
    try {
      const reply = await chrome.tabs.sendMessage(tabId, message);
      if (reply) return reply;
    } catch (err) {
      lastError = err;
      // The page has no content script (tab was open before the extension
      // loaded, or it was reloaded). Inject it by hand, once.
      if (!injected && i >= 1) {
        injected = true;
        await injectContentScript(tabId);
      }
    }
    await sleep(1500);
  }

  let where = "";
  try {
    const tab = await chrome.tabs.get(tabId);
    where = ` (tab: ${tab.url || "unknown"})`;
  } catch (_) { /* tab closed */ }
  throw new Error(
    "Couldn't reach the page" + where + ". " + ((lastError && lastError.message) || "")
  );
}

async function fire(id) {
  const all = await getSchedules();
  const s = all.find((x) => x.id === id);
  if (!s || s.status !== "pending") return;

  const site = SITES[s.site];
  if (Date.now() - s.when > LATE_LIMIT_MS) {
    await patchSchedule(id, { status: "missed", note: "Browser was closed at the scheduled time." });
    notify("Prompt missed", `"${s.title}" wasn't sent to ${site.name}: it was more than 30 minutes late.`);
    return;
  }

  await patchSchedule(id, { status: "running" });

  try {
    const tab = await getReadyTab(s.site, s.newChat);
    const result = await sendToTab(tab.id, { type: "PROMPT", text: s.text, send: true });
    if (result.ok) {
      await patchSchedule(id, { status: "sent", sentAt: Date.now(), note: "" });
      notify("Prompt sent", `"${s.title}" was sent to ${site.name}.`);
    } else {
      throw new Error(result.error || "Unknown error");
    }
  } catch (err) {
    await patchSchedule(id, { status: "failed", note: String((err && err.message) || err) });
    notify("Prompt failed", `"${s.title}" → ${site.name}: ${(err && err.message) || err}`);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("sched:")) fire(alarm.name.slice(6));
});

// Re-create alarms for pending schedules after install, update or browser start.
async function restoreAlarms() {
  const all = await getSchedules();
  for (const s of all) {
    if (s.status !== "pending") continue;
    const existing = await chrome.alarms.get("sched:" + s.id);
    if (!existing) {
      chrome.alarms.create("sched:" + s.id, { when: Math.max(s.when, Date.now() + 2000) });
    }
  }
}

chrome.runtime.onInstalled.addListener(restoreAlarms);
chrome.runtime.onStartup.addListener(restoreAlarms);
