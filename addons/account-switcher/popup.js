/* Account Switcher — popup */

const SERVICE_LABELS = { claude: "Claude", chatgpt: "ChatGPT" };
const SERVICE_ORDER = ["chatgpt", "claude"];

const servicesEl = document.getElementById("services");
const statusesEl = document.getElementById("statuses");
document.getElementById("export").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  const res = await browser.runtime.sendMessage({ type: "export-profiles" });
  if (res && res.ok) {
    const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `account-switcher-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  ev.target.disabled = false;
});
document.getElementById("refresh").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  await browser.runtime.sendMessage({ type: "refresh-usage" });
  await render();
  ev.target.disabled = false;
});

function fmtReset(resetsAt) {
  if (!resetsAt) return "";
  const ms = resetsAt - Date.now();
  if (ms <= 0) return "resetting…";
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return `resets in ${days}d ${hours}h`;
  if (hours > 0) return `resets in ${hours}h ${m}m`;
  return `resets in ${m}m`;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function meterEl(meter) {
  const row = el("div", "meter");
  const head = el("div", "meter-head");
  head.append(el("span", "meter-label", meter.label));
  const pct = meter.percent != null ? `${meter.percent}%` : "—";
  head.append(el("span", "meter-pct", pct));
  row.append(head);

  const bar = el("div", "meter-bar");
  const fill = el("div", "meter-fill");
  fill.style.width = `${Math.min(100, meter.percent || 0)}%`;
  fill.classList.add(
    meter.percent >= 90 ? "crit" : meter.percent >= 70 ? "warn" : "ok"
  );
  bar.append(fill);
  row.append(bar);

  const reset = fmtReset(meter.resetsAt);
  if (reset) row.append(el("div", "meter-reset", reset));
  return row;
}

function thinMeterBar(data, label, title, extraClass) {
  const wrap = el("div", "profile-weekly" + (extraClass ? ` ${extraClass}` : ""));
  const reset = fmtReset(data.resetsAt);
  const bar = el("div", "profile-weekly-bar");
  bar.title = reset ? `${title} · ${reset}` : title;
  const fill = el("div", "profile-weekly-fill");
  fill.style.width = `${Math.min(100, data.percent)}%`;
  fill.classList.add(data.percent >= 90 ? "crit" : data.percent >= 70 ? "warn" : "ok");
  bar.append(fill);
  wrap.append(bar);
  wrap.append(el("div", "meter-reset", reset ? `${label} · ${reset}` : label));
  return wrap;
}

// isCurrent: this preset's identity matches the live session's identity.
function presetRow(service, name, preset, isCurrent) {
  const row = el("div", "profile" + (isCurrent ? " current" : ""));
  const info = el("div", "profile-info");
  const title = el("div", "profile-name", name);
  info.append(title);
  const sub = [preset.identity, preset.plan].filter(Boolean).join(" · ");
  if (sub) info.append(el("div", "profile-sub", sub));
  info.append(
    el(
      "div",
      "profile-sub",
      preset.nextBilling
        ? `next billing ${new Date(preset.nextBilling).toLocaleDateString()}`
        : `saved ${new Date(preset.savedAt).toLocaleDateString()}`
    )
  );
  if (service === "chatgpt" && preset.codexResets != null) {
    info.append(el("div", "profile-sub", `codex resets: ${preset.codexResets}`));
  }
  if (preset.weekly && preset.weekly.percent != null) {
    info.append(thinMeterBar(preset.weekly, "7-day", `7-day usage: ${preset.weekly.percent}%`));
  }
  if (preset.fable && preset.fable.percent != null) {
    info.append(thinMeterBar(preset.fable, "fable", `Fable 7-day: ${preset.fable.percent}%`, "fable"));
  }
  row.append(info);

  const actions = el("div", "profile-actions");
  const loadBtn = el("button", "switch", "Load");
  loadBtn.title = "Write this preset's cookies into the browser session";
  loadBtn.addEventListener("click", async () => {
    loadBtn.disabled = true;
    await browser.runtime.sendMessage({ type: "load-preset", service, name });
    await render();
  });
  const delBtn = el("button", "delete", "✕");
  delBtn.title = "Delete preset";
  delBtn.addEventListener("click", async () => {
    delBtn.disabled = true;
    await browser.runtime.sendMessage({ type: "delete-preset", service, name });
    await render();
  });
  actions.append(loadBtn, delBtn);
  row.append(actions);
  return row;
}

function liveIdentity(state, service) {
  const usage = (state.usage && state.usage[service]) || null;
  return usage && !usage.error && usage.identity ? usage.identity.toLowerCase() : null;
}

function serviceSection(service, state) {
  const section = el("section", "service");
  section.append(el("h2", null, SERVICE_LABELS[service]));

  const svcProfiles = (state.profiles && state.profiles[service]) || {};
  const live = liveIdentity(state, service);
  const names = Object.keys(svcProfiles).sort();
  const list = el("div", "profiles");
  for (const name of names) {
    const p = svcProfiles[name];
    list.append(presetRow(service, name, p, !!(live && p.identity && p.identity.toLowerCase() === live)));
  }
  if (names.length === 0) list.append(el("div", "dim", "no saved presets"));
  section.append(list);

  const form = el("div", "save-form");
  const input = el("input");
  input.type = "text";
  input.placeholder = "preset name…";
  input.maxLength = 40;
  const saveBtn = el("button", "save", "Save current session");
  const doSave = async () => {
    const name = input.value.trim();
    if (!name) return;
    saveBtn.disabled = true;
    const res = await browser.runtime.sendMessage({ type: "save-preset", service, name });
    if (!res || !res.ok) {
      saveBtn.textContent = (res && res.error) || "save failed";
      setTimeout(() => {
        saveBtn.textContent = "Save current session";
        saveBtn.disabled = false;
      }, 2000);
      return;
    }
    input.value = "";
    await render();
  };
  saveBtn.addEventListener("click", doSave);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSave();
  });
  form.append(input, saveBtn);
  section.append(form);

  return section;
}

// Bottom bar: the live session's full status for each service, plus which
// preset (if any) it matches.
function statusSection(service, state) {
  const panel = el("section", "status-panel");
  panel.append(el("h2", null, SERVICE_LABELS[service]));

  const usage = (state.usage && state.usage[service]) || null;
  const status = el("div", "status");
  if (usage && !usage.error) {
    const who = [usage.identity, usage.plan].filter(Boolean).join(" · ");
    status.append(el("div", "identity", who || "signed in"));

    const svcProfiles = (state.profiles && state.profiles[service]) || {};
    const matches = Object.keys(svcProfiles)
      .filter((n) => {
        const id = svcProfiles[n].identity;
        return id && usage.identity && id.toLowerCase() === usage.identity.toLowerCase();
      })
      .sort();
    status.append(
      el(
        "div",
        "profile-sub",
        matches.length > 0 ? `preset: ${matches.join(", ")}` : "no matching preset"
      )
    );

    const meterList = el("div", "meters");
    for (const m of usage.meters || []) meterList.append(meterEl(m));
    if ((usage.meters || []).length === 0) meterList.append(el("div", "dim", "no usage data"));
    status.append(meterList);
  } else {
    status.append(el("div", "error", (usage && usage.error) || "no data yet"));
  }
  panel.append(status);
  return panel;
}

async function render() {
  const state = await browser.runtime.sendMessage({ type: "get-state" });
  servicesEl.textContent = "";
  statusesEl.textContent = "";
  for (const service of SERVICE_ORDER) {
    servicesEl.append(serviceSection(service, state || {}));
    statusesEl.append(statusSection(service, state || {}));
  }
}

render();
