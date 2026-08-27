/* Account Switcher — popup */

const SERVICE_LABELS = { claude: "Claude", chatgpt: "ChatGPT" };
const SERVICE_ORDER = ["claude", "chatgpt"];

const servicesEl = document.getElementById("services");
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

function profileRow(service, name, profile, isActive) {
  const row = el("div", "profile" + (isActive ? " active" : ""));
  const info = el("div", "profile-info");
  const title = el("div", "profile-name", name);
  info.append(title);
  const sub = [profile.identity, profile.plan].filter(Boolean).join(" · ");
  if (sub) info.append(el("div", "profile-sub", sub));
  info.append(
    el("div", "profile-sub", `saved ${new Date(profile.savedAt).toLocaleDateString()}`)
  );
  row.append(info);

  const actions = el("div", "profile-actions");
  const switchBtn = el("button", "switch", "Switch");
  switchBtn.disabled = isActive;
  switchBtn.addEventListener("click", async () => {
    switchBtn.disabled = true;
    await browser.runtime.sendMessage({ type: "switch-profile", service, name });
    await render();
  });
  const delBtn = el("button", "delete", "✕");
  delBtn.title = "Delete profile";
  delBtn.addEventListener("click", async () => {
    delBtn.disabled = true;
    await browser.runtime.sendMessage({ type: "delete-profile", service, name });
    await render();
  });
  actions.append(switchBtn, delBtn);
  row.append(actions);
  return row;
}

function serviceSection(service, state) {
  const section = el("section", "service");
  section.append(el("h2", null, SERVICE_LABELS[service]));

  const usage = (state.usage && state.usage[service]) || null;
  const status = el("div", "status");
  if (usage && !usage.error) {
    const who = [usage.identity, usage.plan].filter(Boolean).join(" · ");
    status.append(el("div", "identity", who || "signed in"));
    const meterList = el("div", "meters");
    for (const m of usage.meters || []) meterList.append(meterEl(m));
    if ((usage.meters || []).length === 0) meterList.append(el("div", "dim", "no usage data"));
    status.append(meterList);
  } else {
    status.append(el("div", "error", (usage && usage.error) || "no data yet"));
  }
  section.append(status);

  const svcProfiles = (state.profiles && state.profiles[service]) || {};
  const active = state.activeProfile && state.activeProfile[service];
  const names = Object.keys(svcProfiles).sort();
  const list = el("div", "profiles");
  for (const name of names) {
    list.append(profileRow(service, name, svcProfiles[name], name === active));
  }
  if (names.length === 0) list.append(el("div", "dim", "no saved profiles"));
  section.append(list);

  const form = el("div", "save-form");
  const input = el("input");
  input.type = "text";
  input.placeholder = "profile name…";
  input.maxLength = 40;
  const saveBtn = el("button", "save", "Save current session");
  const doSave = async () => {
    const name = input.value.trim();
    if (!name) return;
    saveBtn.disabled = true;
    const res = await browser.runtime.sendMessage({ type: "save-profile", service, name });
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

async function render() {
  const state = await browser.runtime.sendMessage({ type: "get-state" });
  servicesEl.textContent = "";
  for (const service of SERVICE_ORDER) {
    servicesEl.append(serviceSection(service, state || {}));
  }
}

render();
