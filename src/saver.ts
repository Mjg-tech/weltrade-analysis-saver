#!/usr/bin/env node
// Weltrade analysis saver.
//
// Connects to a browser started with --remote-debugging-port (see start.bat) and, for every Weltrade chart tab:
//  - adds a small Save / History / Load panel to the chart,
//  - auto-saves your drawings ~2 s after each change (per symbol),
//  - redraws a symbol's latest analysis when it opens with no drawings (after a reload or in a new window).
//
// How: a script injected into the chart watches the drawings and calls back into this process through a DevTools
// binding. Drawings stay in the chart's memory per symbol while the page is open, so auto-load only acts on an empty
// symbol and never clears anything. The injected panel never uses alert/confirm/prompt (they would block DevTools).
//
// Usage: node dist/saver.js [--no-panel] [--no-autoload] [--tab <tab id prefix>]      Ctrl+C to stop.
import { API, CHART, CDP_HTTP, attach, listChartTabs, type Session } from "./browser.js";
import { ANALYSIS_DIR, CAPTURE_FN, captureOn, list, read, restore, write, type Capture, type Saved } from "./store.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: weltrade-analysis-saver [--no-panel] [--no-autoload]\nBrowser: ${CDP_HTTP} (WELTRADE_CDP_HTTP)  Saves to: ${ANALYSIS_DIR} (WELTRADE_ANALYSIS_DIR)`);
  process.exit(0);
}
const PANEL = !args.includes("--no-panel");
const AUTOLOAD = !args.includes("--no-autoload");
const ONLY_TAB = args.includes("--tab") ? args[args.indexOf("--tab") + 1] : null; // advanced: handle one tab only
const BINDING = "__wtSaverBinding";

const log = (m: string) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const time = () => new Date().toLocaleTimeString();

const PAGE_SCRIPT = `(() => {
  if (window.__wtS) return "already";
  const api = () => { const f = document.querySelector('iframe[id^="tradingview_"]'); return f && f.contentWindow && f.contentWindow.tradingViewApi; };
  const send = (m) => { try { window.${BINDING}(JSON.stringify(m)); return true; } catch (e) { return false; } };
  const capture = ${CAPTURE_FN};
  const sigOf = (cap) => JSON.stringify(cap.shapes);
  let sym = null, sig = null, pending = null, timer = null, paused = false, ui = null;

  const flush = () => { if (timer) { clearTimeout(timer); timer = null; } if (pending) { send({ type: "autosave", capture: pending }); pending = null; } };
  const check = () => {
    let cap; try {
      const c = api() && api().activeChart(); if (!c || !c.symbol()) return;
      // After a (re)load the symbol is known before the bars arrive; drawings can't be created until then.
      let ready = true; try { ready = c.dataReady(() => {}) !== false; } catch (e) {}
      if (!ready) return;
      cap = capture(c);
    } catch (e) { return; }
    if (!sym || cap.symbol.toUpperCase() !== sym.toUpperCase()) { flush(); sym = cap.symbol; sig = sigOf(cap); send({ type: "symbol", symbol: sym, drawings: cap.shapes.length, capture: cap }); return; }
    if (paused) return;
    const s = sigOf(cap);
    if (s !== sig) { sig = s; pending = cap; if (timer) clearTimeout(timer); timer = setTimeout(flush, 2000); status("unsaved changes…"); }
  };

  const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; };
  const BTN = "background:#2a2e39;color:#d1d4dc;border:1px solid #434651;border-radius:4px;padding:2px 8px;font:12px sans-serif;cursor:pointer;";
  const buildUi = () => {
    const box = el("div", "position:fixed;left:56px;bottom:34px;z-index:2147483647;display:flex;gap:4px;align-items:center;" +
      "background:rgba(19,23,34,.92);border:1px solid #434651;border-radius:6px;padding:4px 6px;font:12px sans-serif;color:#d1d4dc;");
    box.id = "__wtS_panel";
    const name = el("input", "width:110px;background:#131722;color:#d1d4dc;border:1px solid #434651;border-radius:4px;padding:2px 4px;font:12px sans-serif;");
    name.placeholder = "name (optional)";
    const save = el("button", BTN, "Save"), hist = el("select", BTN + "max-width:190px;"), load = el("button", BTN, "Load");
    const st = el("span", "margin-left:4px;opacity:.8;white-space:nowrap;", "");
    save.onclick = () => { flush(); send({ type: "save", name: name.value || null }); name.value = ""; status("saving…"); };
    load.onclick = () => { if (!hist.value) return; flush(); send({ type: "load", id: hist.value }); status("loading…"); };
    hist.onfocus = () => send({ type: "history" });
    box.append(name, save, hist, load, st);
    document.body.appendChild(box);
    ui = { box, hist, st };
  };
  const status = (t) => { if (ui) ui.st.textContent = t; };
  const showHistory = (items) => {
    if (!ui) return;
    const cur = ui.hist.value; ui.hist.innerHTML = "";
    if (!items.length) { const o = el("option", "", "no saved analyses"); o.value = ""; ui.hist.appendChild(o); return; }
    for (const it of items) { const o = el("option", "", it.label); o.value = it.id; ui.hist.appendChild(o); }
    if ([...ui.hist.options].some(o => o.value === cur)) ui.hist.value = cur;
  };

  if (${PANEL}) buildUi();
  const poll = setInterval(check, 2000);
  try { api().subscribe("drawing_event", () => setTimeout(check, 50)); } catch (e) {}
  window.__wtS = {
    rebase() { try { const c = capture(api().activeChart()); sym = c.symbol; sig = sigOf(c); pending = null; if (timer) { clearTimeout(timer); timer = null; } } catch (e) {} },
    pause(v) { paused = !!v; },
    status, showHistory,
    stop() { flush(); clearInterval(poll); if (ui) ui.box.remove(); ui = null; delete window.__wtS; },
  };
  check();
  return "installed";
})()`;

interface Tab { tabId: string; session: Session | null; busy: Promise<unknown> }
const tabs = new Map<string, Tab>();
const short = (id: string) => id.slice(0, 8);
const ui = (s: Session, fn: string, arg?: unknown) => s.eval(`window.__wtS && window.__wtS.${fn}(${arg === undefined ? "" : JSON.stringify(arg)})`).catch(() => {});

async function pushHistory(s: Session, symbol: string) {
  const items = (await list(symbol)).map((x) => ({
    id: x.id,
    label: x.id === "autosave" ? `autosave · ${new Date(x.created_at).toLocaleString()}` : `${x.name ? x.name + " · " : ""}${new Date(x.created_at).toLocaleString()} · ${x.drawings} dr`,
  }));
  await ui(s, "showHistory", items);
}

async function redraw(s: Session, rec: Saved, mode: "replace" | "merge") {
  await ui(s, "pause", true);
  try { return await restore(s, rec, mode); }
  finally { await s.eval(`window.__wtS && (window.__wtS.rebase(), window.__wtS.pause(false))`).catch(() => {}); }
}

async function handle(t: Tab, raw: string) {
  const s = t.session; if (!s) return;
  const m = JSON.parse(raw) as { type: string; capture?: Capture; symbol?: string; drawings?: number; name?: string | null; id?: string };
  try {
    if (m.type === "autosave" && m.capture) {
      await write(m.capture, { kind: "autosave" });
      await ui(s, "status", `autosaved ${time()}`);
    } else if (m.type === "symbol" && m.symbol) {
      if (AUTOLOAD && m.drawings === 0) {
        const rec = await read(m.symbol, "latest").catch(() => null);
        if (rec?.shapes.length) {
          // Re-check just before drawing, and retry while the chart is still loading its bars.
          let r: Awaited<ReturnType<typeof redraw>> | null = null;
          for (let i = 0; i < 5; i++) {
            if ((await s.eval<number>(`${CHART}.getAllShapes().length`)) > 0) break;
            r = await redraw(s, rec, "merge");
            if (r.onChart > 0) break;
            await new Promise((res) => setTimeout(res, 2000));
          }
          if (r) { log(`Restored ${r.onChart} drawings on ${m.symbol}.`); await ui(s, "status", `restored ${r.onChart} drawings (${new Date(rec.created_at).toLocaleString()})`); }
        } else await ui(s, "status", "no saved analysis");
      } else if (m.drawings && m.capture) {
        // Drawings already on the chart when we attach or switch symbol (e.g. drawn while the saver wasn't running):
        // save them now instead of waiting for the next change, unless they're exactly what's already saved.
        const saved = await read(m.symbol, "latest").catch(() => null);
        if (!saved || JSON.stringify(saved.shapes) !== JSON.stringify(m.capture.shapes)) {
          await write(m.capture, { kind: "autosave" });
          log(`Saved ${m.capture.shapes.length} drawings already on ${m.symbol}.`);
          await ui(s, "status", `saved ${m.capture.shapes.length} existing drawings`);
        } else await ui(s, "status", "");
      } else await ui(s, "status", "");
      await pushHistory(s, m.symbol);
    } else if (m.type === "save") {
      const cap = await captureOn(s);
      const rec = await write(cap, { kind: "version", name: m.name ?? undefined, session: s });
      log(`Saved ${cap.symbol}: ${rec.shapes.length} drawings${rec.name ? ` ("${rec.name}")` : ""}.`);
      await ui(s, "status", `saved ✓ ${rec.shapes.length} drawings`);
      await pushHistory(s, cap.symbol);
    } else if (m.type === "load" && m.id) {
      const sym = await s.eval<string>(`${API}.activeChart().symbol()`);
      const r = await redraw(s, await read(sym, m.id), "replace");
      await ui(s, "status", r.ok ? `loaded ✓ ${r.onChart} drawings` : `loaded, ${r.failed.length} drawings failed`);
    } else if (m.type === "history") {
      await pushHistory(s, await s.eval<string>(`${API}.activeChart().symbol()`));
    }
  } catch (e) {
    log(`Error (${m.type}): ${(e as Error).message}`);
    await ui(s, "status", `error: ${(e as Error).message.slice(0, 80)}`);
  }
}

/** Attach to a tab's chart (or re-attach after a reload) and inject the watcher. */
async function install(t: Tab) {
  if (!t.session || t.session.closed) {
    const s = await attach(t.tabId);
    s.listeners.add((method, p) => {
      if (method === "Runtime.bindingCalled" && p?.name === BINDING) t.busy = t.busy.then(() => handle(t, p.payload)).catch(() => {});
    });
    await s.conn.send("Runtime.addBinding", { name: BINDING });
    t.session = s;
  }
  const r = await t.session.eval<string>(PAGE_SCRIPT);
  return r;
}

let browserUp: boolean | null = null;
let agentTabs = new Set<string>(); // agent windows (title "[name] ..."): never handled
let misses = 0; // consecutive failed browser checks (one slow answer, e.g. during a screenshot, isn't a disconnect)
const lastError = new Map<string, string>();

async function tick() {
  let open: string[];
  try {
    const found = await listChartTabs();
    agentTabs = new Set(found.filter((x) => x.agent).map((x) => x.tabId));
    open = [...new Set(found.filter((x) => !x.agent).map((x) => x.tabId))].filter((id) => !ONLY_TAB || id.startsWith(ONLY_TAB));
    misses = 0;
    if (browserUp !== true) { log(`Connected to the browser. Open Weltrade > Analytic Hub > TradingView.`); browserUp = true; }
  } catch {
    if (++misses < 3) return;
    if (browserUp !== false) { log(`Waiting for the browser on ${CDP_HTTP} (start it with start.bat)...`); browserUp = false; }
    return;
  }
  for (const tabId of open) {
    const t = tabs.get(tabId) ?? { tabId, session: null, busy: Promise.resolve() };
    try {
      // Cheap check: is our watcher still in the page? (It disappears when the page reloads.)
      const alive = t.session && !t.session.closed && (await t.session.eval<boolean>("!!window.__wtS").catch(() => false));
      if (alive) continue;
      const fresh = !tabs.has(tabId);
      tabs.set(tabId, t);
      if (await install(t) === "installed") {
        // Right after a reload the chart may still be loading; the watcher waits for it by itself.
        const c = await t.session!.eval<{ symbol: string; n: number }>(`({ symbol: ${CHART}.symbol(), n: ${CHART}.getAllShapes().length })`).catch(() => null);
        log(`${fresh ? "Saving" : "Re-attached to"} chart tab ${short(tabId)}${c ? ` (${c.symbol}, ${c.n} drawings)` : " (chart still loading)"}.`);
      }
      lastError.delete(tabId);
    } catch (e) {
      const msg = (e as Error).message;
      if (lastError.get(tabId) !== msg) { lastError.set(tabId, msg); log(`Chart tab ${short(tabId)} not ready: ${msg}`); }
    }
  }
  for (const [tabId, t] of tabs) {
    if (open.includes(tabId)) continue;
    if (agentTabs.has(tabId) && t.session && !t.session.closed) {
      // Got its agent label after we attached: drop any unsaved change (rebase) so agent drawings never reach your
      // folder, then take our panel and watcher back out.
      await t.session.eval("window.__wtS && (window.__wtS.rebase(), window.__wtS.stop())").catch(() => {});
      log(`Chart tab ${short(tabId)} is a trading-agent window; left alone.`);
    } else log(`Chart tab ${short(tabId)} closed or reloading.`);
    t.session?.detach();
    tabs.delete(tabId);
  }
}

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  log("Stopping: saving pending changes...");
  for (const t of tabs.values()) {
    if (!t.session || t.session.closed) continue;
    await t.session.eval("window.__wtS && window.__wtS.stop()").catch(() => {}); // flushes a pending autosave
    await new Promise((r) => setTimeout(r, 300));
    await t.busy;
    t.session.detach();
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log(`Weltrade analysis saver. Panel ${PANEL ? "on" : "off"}, auto-load ${AUTOLOAD ? "on" : "off"}.`);
log(`Analyses are saved in ${ANALYSIS_DIR}`);
for (;;) {
  await tick();
  await new Promise((r) => setTimeout(r, 3000));
}
