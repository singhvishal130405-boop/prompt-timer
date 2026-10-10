// popup.js — UI logic for the extension popup.

const SITE_NAMES = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini" };
const $ = (sel) => document.querySelector(sel);

let prompts = [];
let schedules = [];

/* ---------- small helpers ---------- */

// Tiny DOM builder: h("div", {class: "x", onclick: fn}, child, child...)
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(props)) {
    if (key === "class") el.className = val;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), val);
    else if (val !== false && val != null) el.setAttribute(key, val);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

let toastTimer;
function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function pad(n) { return String(n).padStart(2, "0"); }

function toLocalInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function countdown(ms) {
  if (ms <= 0) return "now";
  const total = Math.floor(ms / 1000);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hrs > 0 ? `${hrs}h ${pad(mins)}m ${pad(secs)}s` : `${mins}m ${pad(secs)}s`;
}

/* ---------- storage ---------- */

async function load() {
  const data = await chrome.storage.local.get(["prompts", "schedules"]);
  prompts = data.prompts || [];
  schedules = data.schedules || [];
}

async function savePrompts() {
  await chrome.storage.local.set({ prompts });
}

/* ---------- tabs ---------- */

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
}

/* ---------- prompts ---------- */

async function addPrompt() {
  const text = $("#pText").value.trim();
  if (!text) return toast("Write a prompt first.");
  const title = $("#pTitle").value.trim() || text.slice(0, 40);
  prompts.unshift({ id: crypto.randomUUID(), title, text });
  await savePrompts();
  $("#pTitle").value = "";
  $("#pText").value = "";
  toast("Prompt saved.");
  render();
}

async function deletePrompt(id) {
  prompts = prompts.filter((p) => p.id !== id);
  await savePrompts();
  render();
}

async function sendToActiveTab(prompt, send) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onSupportedSite = tab && tab.url && /^https:\/\/(claude\.ai|chatgpt\.com|gemini\.google\.com)\//.test(tab.url);
  if (!onSupportedSite) {
    return toast("Open Claude, ChatGPT or Gemini in this tab first.");
  }
  try {
    const reply = await chrome.tabs.sendMessage(tab.id, { type: "PROMPT", text: prompt.text, send });
    if (reply && reply.ok) toast(send ? "Sent." : "Filled the chat box.");
    else toast((reply && reply.error) || "Something went wrong.");
  } catch (_) {
    toast("Reload the AI page, then try again.");
  }
}

function prefillSchedule(promptId) {
  $("#schedPrompt").value = promptId;
  switchTab("schedule");
}

function renderPrompts() {
  const list = $("#promptList");
  list.replaceChildren();
  if (!prompts.length) {
    list.append(h("p", { class: "empty" }, "No saved prompts yet. Write one above."));
    return;
  }
  for (const p of prompts) {
    list.append(
      h("article", { class: "card" },
        h("strong", {}, p.title),
        h("p", { class: "preview" }, p.text.length > 140 ? p.text.slice(0, 140) + "…" : p.text),
        h("div", { class: "row" },
          h("button", { class: "btn small", onclick: () => sendToActiveTab(p, false) }, "Fill chat box"),
          h("button", { class: "btn small", onclick: () => sendToActiveTab(p, true) }, "Send now"),
          h("button", { class: "btn small", onclick: () => prefillSchedule(p.id) }, "Schedule"),
          h("button", { class: "btn small danger", onclick: () => deletePrompt(p.id) }, "Delete")
        )
      )
    );
  }
}

/* ---------- schedule form ---------- */

function renderScheduleForm() {
  const select = $("#schedPrompt");
  const previous = select.value;
  select.replaceChildren();
  if (!prompts.length) {
    select.append(h("option", { value: "" }, "Save a prompt first"));
    return;
  }
  for (const p of prompts) select.append(h("option", { value: p.id }, p.title));
  if (prompts.some((p) => p.id === previous)) select.value = previous;
}

async function addSchedule() {
  const prompt = prompts.find((p) => p.id === $("#schedPrompt").value);
  if (!prompt) return toast("Save a prompt first.");

  const value = $("#schedWhen").value;
  if (!value) return toast("Pick a date and time.");
  const when = new Date(value).getTime();
  if (!(when > Date.now() + 5000)) return toast("Choose a time in the future.");

  const job = {
    id: crypto.randomUUID(),
    title: prompt.title,
    text: prompt.text, // snapshot, so deleting the prompt later doesn't break the job
    site: $("#schedSite").value,
    when,
    newChat: $("#schedNew").checked,
    status: "pending",
    created: Date.now()
  };

  const fresh = (await chrome.storage.local.get("schedules")).schedules || [];
  fresh.push(job);
  await chrome.storage.local.set({ schedules: fresh });
  await chrome.alarms.create("sched:" + job.id, { when });

  toast("Scheduled.");
  switchTab("queue");
}

/* ---------- queue ---------- */

async function cancelJob(id) {
  await chrome.alarms.clear("sched:" + id);
  const fresh = (await chrome.storage.local.get("schedules")).schedules || [];
  await chrome.storage.local.set({ schedules: fresh.filter((s) => s.id !== id) });
}

async function clearFinished() {
  const fresh = (await chrome.storage.local.get("schedules")).schedules || [];
  await chrome.storage.local.set({ schedules: fresh.filter((s) => s.status === "pending" || s.status === "running") });
}

function renderQueue() {
  const list = $("#queueList");
  list.replaceChildren();
  const sorted = [...schedules].sort((a, b) => a.when - b.when);
  $("#queueCount").textContent = schedules.filter((s) => s.status === "pending").length;

  if (!sorted.length) {
    list.append(h("p", { class: "empty" }, "Nothing scheduled. Pick a prompt in the Schedule tab."));
    return;
  }

  for (const s of sorted) {
    const pending = s.status === "pending";
    list.append(
      h("article", { class: "card site-" + s.site },
        h("div", { class: "job-top" },
          h("strong", {}, s.title),
          pending
            ? h("span", { class: "clock", "data-when": s.when }, countdown(s.when - Date.now()))
            : h("span", { class: "status " + s.status }, s.status)
        ),
        h("div", { class: "when" }, h("span", { class: "dot " + s.site }), `${SITE_NAMES[s.site]} · ${new Date(s.when).toLocaleString()}`),
        s.note ? h("p", { class: "note" }, s.note) : null,
        h("div", { class: "row" },
          h("button", { class: "btn small danger", onclick: () => cancelJob(s.id) }, pending ? "Cancel" : "Remove")
        )
      )
    );
  }
}

function tick() {
  document.querySelectorAll(".clock").forEach((el) => {
    el.textContent = countdown(Number(el.dataset.when) - Date.now());
  });
}

/* ---------- site theme ---------- */

function siteFromUrl(url = "") {
  if (url.startsWith("https://claude.ai")) return "claude";
  if (url.startsWith("https://chatgpt.com")) return "chatgpt";
  if (url.startsWith("https://gemini.google.com")) return "gemini";
  return null;
}

// Restyles the whole popup to match the chosen site and remembers the choice.
function applySite(site) {
  document.body.dataset.site = site;
  $("#sitePill").textContent = "Sending to " + SITE_NAMES[site];
  chrome.storage.local.set({ lastSite: site });
}

/* ---------- init ---------- */

function render() {
  renderPrompts();
  renderScheduleForm();
  renderQueue();
}

async function init() {
  await load();

  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("#savePrompt").addEventListener("click", addPrompt);
  $("#addSchedule").addEventListener("click", addSchedule);
  $("#clearDone").addEventListener("click", clearFinished);

  document.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      const date = new Date(Date.now() + Number(chip.dataset.hours) * 3600 * 1000);
      $("#schedWhen").value = toLocalInput(date);
    })
  );

  $("#schedWhen").value = toLocalInput(new Date(Date.now() + 3600 * 1000));

  // Theme: the site in the current tab, else the last one used, else Claude.
  const { lastSite } = await chrome.storage.local.get("lastSite");
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const startSite = siteFromUrl(activeTab && activeTab.url) || lastSite || "claude";
  $("#schedSite").value = startSite;
  applySite(startSite);
  $("#schedSite").addEventListener("change", (e) => applySite(e.target.value));

  // Re-render when the background worker updates a job's status.
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local" || (!changes.prompts && !changes.schedules)) return;
    await load();
    render();
  });

  render();
  setInterval(tick, 1000);
}

init();
