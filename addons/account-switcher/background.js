/* Account Switcher — background
 *
 * Cookie snapshot/switch per service + usage polling for claude.ai and
 * chatgpt.com. All state lives in browser.storage.local:
 *
 *   profiles      { <service>: { <name>: { savedAt, identity, plan, cookies[] } } }
 *   activeProfile { <service>: <name|null> }
 *   usage         { <service>: { identity, plan, meters[], updatedAt, error } }
 */

const SERVICES = {
  claude: {
    label: "Claude",
    domains: ["claude.ai"],
    tabUrls: ["https://claude.ai/*", "https://*.claude.ai/*"]
  },
  chatgpt: {
    label: "ChatGPT",
    domains: ["chatgpt.com", "openai.com"],
    tabUrls: ["https://chatgpt.com/*", "https://*.chatgpt.com/*"]
  }
};

const POLL_ALARM = "account-switcher-poll";
const POLL_PERIOD_MINUTES = 5;

// ---------- storage helpers ----------

async function getStore(keys) {
  const s = await browser.storage.local.get(keys);
  return {
    profiles: s.profiles || {},
    activeProfile: s.activeProfile || {},
    usage: s.usage || {}
  };
}

async function setProfiles(profiles) {
  await browser.storage.local.set({ profiles });
}

// ---------- cookie snapshot / restore ----------

function serializeCookie(c) {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || "/",
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    sameSite: c.sameSite || null,
    expirationDate: c.session ? null : (c.expirationDate || null),
    storeId: c.storeId || "firefox-default",
    firstPartyDomain: c.firstPartyDomain || null,
    partitionKey: c.partitionKey || null
  };
}

function cookieUrl(c) {
  return `${c.secure ? "https" : "http"}://${c.domain.replace(/^\./, "")}${c.path || "/"}`;
}

async function snapshotCookies(service) {
  const out = [];
  for (const domain of SERVICES[service].domains) {
    const cookies = await browser.cookies.getAll({ domain });
    for (const c of cookies) out.push(serializeCookie(c));
  }
  return out;
}

async function clearCookies(service) {
  for (const domain of SERVICES[service].domains) {
    const live = await browser.cookies.getAll({ domain });
    for (const c of live) {
      const details = {
        url: cookieUrl(c),
        name: c.name,
        storeId: c.storeId
      };
      if (c.firstPartyDomain) details.firstPartyDomain = c.firstPartyDomain;
      if (c.partitionKey) details.partitionKey = c.partitionKey;
      try {
        await browser.cookies.remove(details);
      } catch (err) {
        console.warn("[account-switcher] remove failed", c.name, err);
      }
    }
  }
}

async function restoreCookies(snapshot) {
  for (const c of snapshot) {
    const details = {
      url: cookieUrl(c),
      name: c.name,
      value: c.value,
      path: c.path || "/",
      secure: c.secure,
      httpOnly: c.httpOnly,
      storeId: c.storeId || "firefox-default"
    };
    // Passing `domain` (dot stripped) keeps domain-wide cookies domain-wide;
    // host-only cookies arrive without a leading dot but still carry a domain
    // key in getAll output, so restore them host-only instead.
    if (c.domain.startsWith(".")) details.domain = c.domain.slice(1);
    if (c.sameSite && c.sameSite !== "unset") details.sameSite = c.sameSite;
    if (c.expirationDate) details.expirationDate = c.expirationDate;
    if (c.firstPartyDomain) details.firstPartyDomain = c.firstPartyDomain;
    if (c.partitionKey) details.partitionKey = c.partitionKey;
    try {
      await browser.cookies.set(details);
    } catch (err) {
      console.warn("[account-switcher] set failed", c.name, err);
    }
  }
}

async function reloadServiceTabs(service) {
  try {
    const tabs = await browser.tabs.query({ url: SERVICES[service].tabUrls });
    for (const tab of tabs) {
      if (tab.id != null) browser.tabs.reload(tab.id);
    }
  } catch (err) {
    console.warn("[account-switcher] tab reload failed", err);
  }
}

// ---------- usage fetchers ----------

function numberOrNull(v) {
  return typeof v === "number" && !isNaN(v) ? v : null;
}

function clampPct(v) {
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

// Claude returns `utilization`/`percent` already in 0..100.
function parseReset(v) {
  if (v == null) return null;
  if (typeof v === "number") {
    // epoch seconds or milliseconds
    return v > 1e12 ? v : v * 1000;
  }
  const t = Date.parse(v);
  return isNaN(t) ? null : t;
}

function toMeter(node) {
  if (!node || typeof node !== "object") return null;
  let pct = null;
  if (numberOrNull(node.used) != null && numberOrNull(node.limit) != null && node.limit > 0) {
    pct = (node.used / node.limit) * 100;
  } else {
    pct = numberOrNull(node.utilization) ?? numberOrNull(node.percent) ?? numberOrNull(node.percentage);
  }
  if (pct == null) return null;
  return { percent: clampPct(pct), resetsAt: parseReset(node.resets_at ?? node.reset_at ?? node.reset) };
}

function parseClaudeUsage(data) {
  const meters = [];
  const seen = new Set();
  const push = (id, label, node) => {
    const m = toMeter(node);
    if (!m || seen.has(label)) return;
    seen.add(label);
    meters.push({ id, label, ...m });
  };

  push("five_hour", "5-hour", data.five_hour || data.session);
  push("seven_day", "7-day", data.seven_day || data.weekly);
  for (const key of Object.keys(data || {})) {
    if (!/^seven_day_.+/.test(key)) continue;
    push(key, `7-day ${key.replace("seven_day_", "")}`, data[key]);
  }

  // Newer shape: model-scoped weekly limits live in a limits[] array,
  // e.g. { kind: "weekly_scoped", scope: { model: { display_name: "Fable" } } }
  if (Array.isArray(data.limits)) {
    for (const l of data.limits) {
      const model = l.scope && l.scope.model && l.scope.model.display_name;
      const label = l.kind === "session" ? "5-hour" : model ? `7-day ${model}` : "7-day";
      push(`limit_${l.kind}_${model || "all"}`, label, l);
    }
  }
  return meters;
}

async function fetchClaudeState() {
  const opts = { credentials: "include", headers: { accept: "application/json" } };
  const orgsResp = await fetch("https://claude.ai/api/organizations", opts);
  if (orgsResp.status === 401 || orgsResp.status === 403) return { error: "not signed in" };
  if (!orgsResp.ok) return { error: `organizations http ${orgsResp.status}` };
  const orgs = await orgsResp.json();
  const org =
    (Array.isArray(orgs) && orgs.find((o) => Array.isArray(o.capabilities) && o.capabilities.includes("chat"))) ||
    (Array.isArray(orgs) && orgs[0]);
  if (!org) return { error: "no organizations" };
  const orgId = org.uuid || org.id;
  const identity = org.name || null;
  const plan = org.billing_type || org.rate_limit_tier || null;

  const usageResp = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, opts);
  if (!usageResp.ok) return { identity, plan, error: `usage http ${usageResp.status}` };
  const data = await usageResp.json();
  return { identity, plan, meters: parseClaudeUsage(data), updatedAt: Date.now(), error: null };
}

async function fetchChatGPTState() {
  const sResp = await fetch("https://chatgpt.com/api/auth/session", {
    credentials: "include",
    headers: { accept: "application/json" }
  });
  if (!sResp.ok) return { error: "not signed in" };
  const session = await sResp.json();
  const token = session && session.accessToken;
  if (!token) return { error: "not signed in" };

  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
  let identity = (session.user && (session.user.email || session.user.name)) || null;
  let plan = null;
  const meters = [];

  try {
    const meResp = await fetch("https://chatgpt.com/backend-api/me", { credentials: "include", headers });
    if (meResp.ok) {
      const me = await meResp.json();
      identity = identity || me.email || me.name || null;
      plan =
        (me.account_plan && me.account_plan.plan_type) ||
        (me.account && me.account.plan_type) ||
        (me.accounts && me.accounts.default && me.accounts.default.plan_type) ||
        null;
    }
  } catch (err) {
    console.warn("[account-switcher] backend-api/me failed", err);
  }

  try {
    const uResp = await fetch("https://chatgpt.com/backend-api/wham/usage", { credentials: "include", headers });
    if (uResp.ok) {
      const u = await uResp.json();
      plan = plan || u.plan_type || null;
      const rl = u.rate_limits || u.rate_limit || u;
      const windows = [
        ["primary_window", "Primary window"],
        ["secondary_window", "Secondary window"]
      ];
      for (const [key, label] of windows) {
        const w = rl && rl[key];
        if (!w) continue;
        const pct = numberOrNull(w.used_percent) ?? numberOrNull(w.utilization);
        if (pct == null) continue;
        meters.push({
          id: key,
          label,
          percent: clampPct(pct),
          resetsAt: parseReset(w.reset_at ?? w.resets_at)
        });
      }
    }
  } catch (err) {
    console.warn("[account-switcher] wham/usage failed", err);
  }

  return { identity, plan, meters, updatedAt: Date.now(), error: null };
}

async function pollUsage() {
  const { usage } = await getStore(["usage"]);
  const next = { ...usage };
  try {
    next.claude = await fetchClaudeState();
  } catch (err) {
    next.claude = { error: String((err && err.message) || err) };
  }
  try {
    next.chatgpt = await fetchChatGPTState();
  } catch (err) {
    next.chatgpt = { error: String((err && err.message) || err) };
  }
  await browser.storage.local.set({ usage: next });
}

// ---------- profile operations ----------

async function saveProfile(service, name) {
  const cookies = await snapshotCookies(service);
  if (cookies.length === 0) return { ok: false, error: "no cookies found — sign in first" };

  // Identity/plan of the session being saved, from the live usage fetch.
  await pollUsage();
  const { profiles, activeProfile, usage } = await getStore(["profiles", "activeProfile", "usage"]);
  const svcUsage = usage[service] || {};
  if (svcUsage.error) return { ok: false, error: svcUsage.error };

  const svcProfiles = { ...(profiles[service] || {}) };
  svcProfiles[name] = {
    savedAt: Date.now(),
    identity: svcUsage.identity || null,
    plan: svcUsage.plan || null,
    cookies
  };
  const next = { ...profiles, [service]: svcProfiles };
  await setProfiles(next);
  await browser.storage.local.set({ activeProfile: { ...activeProfile, [service]: name } });
  return { ok: true };
}

async function switchProfile(service, name) {
  const { profiles, activeProfile } = await getStore(["profiles", "activeProfile"]);
  const profile = profiles[service] && profiles[service][name];
  if (!profile) return { ok: false, error: "profile not found" };

  await clearCookies(service);
  await restoreCookies(profile.cookies);
  await browser.storage.local.set({ activeProfile: { ...activeProfile, [service]: name } });
  reloadServiceTabs(service);
  pollUsage();
  return { ok: true };
}

async function deleteProfile(service, name) {
  const { profiles, activeProfile } = await getStore(["profiles", "activeProfile"]);
  const svcProfiles = { ...(profiles[service] || {}) };
  delete svcProfiles[name];
  await setProfiles({ ...profiles, [service]: svcProfiles });
  if (activeProfile[service] === name) {
    await browser.storage.local.set({ activeProfile: { ...activeProfile, [service]: null } });
  }
  return { ok: true };
}

// ---------- message router ----------

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return undefined;

  const run = (p) => p.then((r) => r).catch((err) => ({ ok: false, error: String((err && err.message) || err) }));

  switch (msg.type) {
    case "get-state":
      return run(getStore(["profiles", "activeProfile", "usage"]).then((s) => ({ ok: true, ...s })));
    case "save-profile":
      return run(saveProfile(msg.service, msg.name));
    case "switch-profile":
      return run(switchProfile(msg.service, msg.name));
    case "delete-profile":
      return run(deleteProfile(msg.service, msg.name));
    case "refresh-usage":
      return run(pollUsage().then(() => ({ ok: true })));
    default:
      return undefined;
  }
});

// ---------- scheduling ----------

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) pollUsage();
});
browser.runtime.onInstalled.addListener(() => {
  browser.alarms.create(POLL_ALARM, { periodInMinutes: POLL_PERIOD_MINUTES });
  pollUsage();
});
browser.runtime.onStartup.addListener(() => {
  browser.alarms.create(POLL_ALARM, { periodInMinutes: POLL_PERIOD_MINUTES });
  pollUsage();
});
