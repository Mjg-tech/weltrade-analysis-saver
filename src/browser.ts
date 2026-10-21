// Minimal Chrome DevTools Protocol client (Node's built-in WebSocket/fetch, no dependencies).
// Only ever attaches to / detaches from pages; it never closes a tab or the browser.

export const CDP_HTTP = process.env.WELTRADE_CDP_HTTP ?? "http://localhost:9222";
const CHART_URL = "weltradecharts.com/chart";

// The TradingView widget lives in a nested iframe inside the Weltrade chart frame.
export const API = `document.querySelector('iframe[id^="tradingview_"]').contentWindow.tradingViewApi`;
export const CHART = `${API}.activeChart()`;

export interface Target { id: string; type: string; url: string; title?: string; parentId?: string; webSocketDebuggerUrl?: string }

export async function listTargets(): Promise<Target[]> {
  const r = await fetch(`${CDP_HTTP}/json`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Target[];
}

/** Every Weltrade chart open in the browser, keyed by the id of the tab (top-level page) that holds it.
 *  `agent` marks windows opened by the Weltrade MCP for trading agents: it labels their title "[page-name] ...".
 *  The saver leaves those alone so agent drawings never mix with yours. */
export async function listChartTabs(): Promise<{ tabId: string; target: Target; agent: boolean }[]> {
  const all = await listTargets();
  const title = new Map(all.filter((t) => t.type === "page").map((t) => [t.id, t.title ?? ""]));
  return all
    .filter((t) => t.url.includes(CHART_URL) && t.parentId && t.webSocketDebuggerUrl)
    .map((t) => ({ tabId: t.parentId!, target: t, agent: (title.get(t.parentId!) ?? "").startsWith("[") }));
}

class Conn {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  onEvent: (method: string, params: any) => void = () => {};
  closed = false;

  static async open(url: string): Promise<Conn> {
    const c = new Conn();
    c.ws = new WebSocket(url);
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error("DevTools connection timed out")), 5000);
      c.ws.addEventListener("open", () => (clearTimeout(t), res()), { once: true });
      c.ws.addEventListener("error", () => (clearTimeout(t), rej(new Error("DevTools connection error"))), { once: true });
    });
    c.ws.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id !== undefined && c.pending.has(m.id)) {
        const p = c.pending.get(m.id)!;
        c.pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      } else if (m.method) c.onEvent(m.method, m.params);
    });
    c.ws.addEventListener("close", () => {
      c.closed = true;
      for (const p of c.pending.values()) p.rej(new Error("DevTools connection closed"));
      c.pending.clear();
    });
    return c;
  }

  send(method: string, params: object = {}, timeoutMs = 15000): Promise<any> {
    if (this.closed) return Promise.reject(new Error("DevTools connection closed"));
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method} timed out`)); }, timeoutMs);
      this.pending.set(id, { res: (v) => (clearTimeout(t), res(v)), rej: (e) => (clearTimeout(t), rej(e)) });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { try { this.ws.close(); } catch {} }
}

export class Session {
  listeners = new Set<(method: string, params: any) => void>();
  constructor(public tabId: string, public conn: Conn) {
    conn.onEvent = (m, p) => { for (const l of this.listeners) try { l(m, p); } catch {} };
  }
  async eval<T = any>(expression: string, awaitPromise = false, timeoutMs = 20000): Promise<T> {
    const r = await this.conn.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise }, timeoutMs);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "evaluate failed");
    return r.result?.value as T;
  }
  get closed() { return this.conn.closed; }
  detach() { this.conn.close(); }
}

/** Attach to the chart inside one tab. */
export async function attach(tabId: string): Promise<Session> {
  const t = (await listChartTabs()).find((x) => x.tabId === tabId);
  if (!t) throw new Error("the chart in this tab isn't loaded yet");
  const conn = await Conn.open(t.target.webSocketDebuggerUrl!);
  const s = new Session(tabId, conn);
  await conn.send("Runtime.enable");
  // Background windows get throttled; pretend they're focused so the chart keeps updating.
  await conn.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  return s;
}

/** PNG (base64) of the whole tab. Screenshots only work on top-level pages, so this opens a short-lived connection. */
export async function screenshot(tabId: string): Promise<string> {
  const top = (await listTargets()).find((t) => t.id === tabId && t.webSocketDebuggerUrl);
  if (!top) throw new Error("tab not found");
  const c = await Conn.open(top.webSocketDebuggerUrl!);
  try {
    await c.send("Page.bringToFront", {}, 5000).catch(() => {}); // captures hang on background tabs
    return (await c.send("Page.captureScreenshot", { format: "png" }, 20000)).data as string;
  } finally {
    c.close();
  }
}
