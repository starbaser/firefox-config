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
const POLL_PERIOD_MINUTES = 10;
const STALE_MS = POLL_PERIOD_MINUTES * 60 * 1000;

function isFresh(ts) {
  return typeof ts === "number" && Date.now() - ts < STALE_MS;
}

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
  profileCache = profiles;
  await browser.storage.local.set({ profiles });
}

// ---------- per-profile request auth ----------
//
// The live usage endpoints answer for whatever session is in the browser's
// cookie jar. To poll profiles that are NOT active, we attach that profile's
// cookies as a manual Cookie header (never touching the jar): the fetch sets
// credentials:"omit" plus an x-acct-switcher-profile marker header, and this
// blocking webRequest listener swaps in the profile's cookies and strips the
// marker. Extension pages are CORS-exempt for permitted hosts, so the custom
// header triggers no preflight.

let profileCache = {};
browser.storage.local.get("profiles").then((s) => {
  profileCache = s.profiles || {};
});

const PROFILE_MARKER = "x-acct-switcher-profile";

function cookieHeaderFor(profile, host) {
  const now = Date.now() / 1000;
  return (profile.cookies || [])
    .filter((c) => {
      const bare = c.domain.replace(/^\./, "");
      const hostMatch = c.domain.startsWith(".")
        ? host === bare || host.endsWith(`.${bare}`)
        : host === bare;
      const notExpired = !c.expirationDate || c.expirationDate > now;
      return hostMatch && notExpired;
    })
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.tabId !== -1) return {};
    const headers = details.requestHeaders || [];
    const marker = headers.find((h) => h.name.toLowerCase() === PROFILE_MARKER);
    if (!marker) return {};
    const sep = marker.value.indexOf(":");
    const service = marker.value.slice(0, sep);
    const name = marker.value.slice(sep + 1);
    const profile = profileCache[service] && profileCache[service][name];
    const out = headers.filter((h) => h.name.toLowerCase() !== PROFILE_MARKER);
    if (profile) {
      const value = cookieHeaderFor(profile, new URL(details.url).host);
      const existing = out.find((h) => h.name.toLowerCase() === "cookie");
      if (existing) existing.value = value;
      else out.push({ name: "Cookie", value });
    }
    return { requestHeaders: out };
  },
  {
    urls: [
      "https://claude.ai/api/*",
      "https://chatgpt.com/api/*",
      "https://chatgpt.com/backend-api/*"
    ]
  },
  ["blocking", "requestHeaders"]
);

// prof = { service, name } to authenticate as a stored profile; omitted = live jar.
function authedFetch(url, opts = {}, prof = null) {
  const o = { ...opts, headers: { ...(opts.headers || {}) } };
  if (prof) {
    o.credentials = "omit";
    o.headers[PROFILE_MARKER] = `${prof.service}:${prof.name}`;
  } else {
    o.credentials = "include";
  }
  return fetch(url, o);
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

async function fetchClaudeState(prof = null) {
  const opts = { headers: { accept: "application/json" } };
  const orgsResp = await authedFetch("https://claude.ai/api/organizations", opts, prof);
  if (orgsResp.status === 401 || orgsResp.status === 403) return { error: "not signed in" };
  if (!orgsResp.ok) return { error: `organizations http ${orgsResp.status}` };
  const orgs = await orgsResp.json();
  const org =
    (Array.isArray(orgs) && orgs.find((o) => Array.isArray(o.capabilities) && o.capabilities.includes("chat"))) ||
    (Array.isArray(orgs) && orgs[0]);
  if (!org) return { error: "no organizations" };
  const orgId = org.uuid || org.id;
  const identity = org.name || null;
  const plan =
    Array.isArray(org.capabilities) && org.capabilities.includes("claude_max")
      ? "Max"
      : org.rate_limit_tier || org.billing_type || null;

  let nextBilling = null;
  try {
    const subResp = await authedFetch(`https://claude.ai/api/organizations/${orgId}/subscription_details`, opts, prof);
    if (subResp.ok) {
      const sub = await subResp.json();
      nextBilling = parseReset(sub.next_charge_at ?? sub.next_charge_date);
    }
  } catch (err) {
    console.warn("[account-switcher] subscription_details failed", err);
  }

  const usageResp = await authedFetch(`https://claude.ai/api/organizations/${orgId}/usage`, opts, prof);
  if (!usageResp.ok) return { identity, plan, nextBilling, error: `usage http ${usageResp.status}` };
  const data = await usageResp.json();
  return { identity, plan, nextBilling, meters: parseClaudeUsage(data), updatedAt: Date.now(), error: null };
}

async function fetchChatGPTState(prof = null) {
  const sResp = await authedFetch(
    "https://chatgpt.com/api/auth/session",
    { headers: { accept: "application/json" } },
    prof
  );
  if (!sResp.ok) return { error: "not signed in" };
  const session = await sResp.json();
  const token = session && session.accessToken;
  if (!token) return { error: "not signed in" };

  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
  // With a profile, the Bearer token identifies the account; omit credentials
  // so the live jar can't bleed into the request.
  const bearerCreds = prof ? "omit" : "include";
  let identity = (session.user && (session.user.email || session.user.name)) || null;
  let plan = null;
  let nextBilling = null;
  const meters = [];

  try {
    const meResp = await fetch("https://chatgpt.com/backend-api/me", { credentials: bearerCreds, headers });
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
    const aResp = await fetch("https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27", {
      credentials: bearerCreds,
      headers
    });
    if (aResp.ok) {
      const a = await aResp.json();
      const first = a.accounts && Object.values(a.accounts)[0];
      plan = plan || (first && first.account && first.account.plan_type) || null;
      const ent = first && first.entitlement;
      if (ent) nextBilling = parseReset(ent.renews_at ?? ent.expires_at);
    }
  } catch (err) {
    console.warn("[account-switcher] accounts/check failed", err);
  }

  try {
    const uResp = await fetch("https://chatgpt.com/backend-api/wham/usage", { credentials: bearerCreds, headers });
    if (uResp.ok) {
      const u = await uResp.json();
      plan = plan || u.plan_type || null;
      const rl = u.rate_limits || u.rate_limit || u;
      // Label windows by their actual length: on some plans the primary window
      // IS the weekly one (limit_window_seconds = 604800) and secondary is null.
      for (const key of ["primary_window", "secondary_window"]) {
        const w = rl && rl[key];
        if (!w) continue;
        const pct = numberOrNull(w.used_percent) ?? numberOrNull(w.utilization);
        if (pct == null) continue;
        const secs = numberOrNull(w.limit_window_seconds) ?? numberOrNull(w.window_seconds);
        const label = secs
          ? secs >= 86400
            ? `${Math.round(secs / 86400)}-day`
            : `${Math.round(secs / 3600)}-hour`
          : key === "primary_window"
            ? "Primary window"
            : "Secondary window";
        meters.push({
          id: key,
          label,
          percent: clampPct(pct),
          resetsAt: parseReset(w.reset_at ?? w.resets_at),
          windowSeconds: secs
        });
      }
    }
  } catch (err) {
    console.warn("[account-switcher] wham/usage failed", err);
  }

  return { identity, plan, nextBilling, meters, updatedAt: Date.now(), error: null };
}

// The generic weekly meter per service: Claude labels it "7-day"; ChatGPT
// windows are labeled by duration, so any day-plus window qualifies.
function pickWeeklyMeter(state) {
  const meters = (state && state.meters) || [];
  return (
    meters.find((m) => m.label === "7-day") ||
    meters.find((m) => m.id === "secondary_window") ||
    meters
      .filter((m) => (m.windowSeconds || 0) >= 86400)
      .sort((a, b) => b.windowSeconds - a.windowSeconds)[0] ||
    null
  );
}

// Claude-only model-scoped weekly meter ("7-day Fable", from limits[] or a
// legacy seven_day_fable key).
function pickFableMeter(state) {
  const meters = (state && state.meters) || [];
  return meters.find((m) => /fable/i.test(m.label)) || null;
}

// forceLive: bypass the staleness gate for the live-session fetch (used after
// a switch/save, where the cached state belongs to the previous account, and
// by the popup's refresh button). Inactive profiles are always staleness-gated.
async function pollUsage(forceLive = false) {
  const { usage, profiles, activeProfile } = await getStore(["usage", "profiles", "activeProfile"]);
  const next = { ...usage };
  for (const service of Object.keys(SERVICES)) {
    const cached = usage[service];
    if (!forceLive && cached && !cached.error && isFresh(cached.updatedAt)) continue;
    try {
      next[service] = service === "claude" ? await fetchClaudeState() : await fetchChatGPTState();
    } catch (err) {
      next[service] = { error: String((err && err.message) || err) };
    }
  }
  await browser.storage.local.set({ usage: next });

  // Refresh every stored profile. The active one is stamped from the live
  // state; inactive ones are polled with their own cookies (webRequest Cookie
  // rewrite — the browser jar is never touched), skipping any fetched
  // recently. Stale/dead sessions keep their last-known values and are
  // retried next cycle.
  let changed = false;
  const nextProfiles = { ...profiles };
  for (const service of Object.keys(SERVICES)) {
    const svcProfiles = { ...(nextProfiles[service] || {}) };
    const names = Object.keys(svcProfiles);
    if (names.length === 0) continue;
    const active = activeProfile[service];

    const apply = (name, state) => {
      if (!state || state.error) return;
      const weekly = pickWeeklyMeter(state);
      const fable = pickFableMeter(state);
      const p = svcProfiles[name];
      svcProfiles[name] = {
        ...p,
        fetchedAt: Date.now(),
        identity: state.identity || p.identity,
        plan: state.plan || p.plan,
        nextBilling: state.nextBilling || p.nextBilling || null,
        weekly: weekly ? { percent: weekly.percent, updatedAt: state.updatedAt || Date.now() } : p.weekly,
        fable: fable ? { percent: fable.percent, updatedAt: state.updatedAt || Date.now() } : p.fable
      };
      changed = true;
    };

    if (active && svcProfiles[active]) apply(active, next[service]);

    for (const name of names) {
      if (name === active) continue;
      if (isFresh(svcProfiles[name].fetchedAt)) continue;
      try {
        const state =
          service === "claude"
            ? await fetchClaudeState({ service, name })
            : await fetchChatGPTState({ service, name });
        apply(name, state);
      } catch (err) {
        console.warn(`[account-switcher] poll failed for ${service}/${name}`, err);
      }
    }
    nextProfiles[service] = svcProfiles;
  }
  if (changed) await setProfiles(nextProfiles);
}

// ---------- profile operations ----------

async function saveProfile(service, name) {
  const cookies = await snapshotCookies(service);
  if (cookies.length === 0) return { ok: false, error: "no cookies found — sign in first" };

  // Identity/plan of the session being saved, from the live usage fetch.
  await pollUsage(true);
  const { profiles, activeProfile, usage } = await getStore(["profiles", "activeProfile", "usage"]);
  const svcUsage = usage[service] || {};
  if (svcUsage.error) return { ok: false, error: svcUsage.error };

  const svcProfiles = { ...(profiles[service] || {}) };
  svcProfiles[name] = {
    savedAt: Date.now(),
    identity: svcUsage.identity || null,
    plan: svcUsage.plan || null,
    nextBilling: svcUsage.nextBilling || null,
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
  // The live session just changed accounts — cached usage belongs to the
  // previous one, so force the live fetch.
  pollUsage(true);
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
      return run(pollUsage(true).then(() => ({ ok: true })));
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
