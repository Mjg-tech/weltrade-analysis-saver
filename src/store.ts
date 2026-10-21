// Saving drawings to disk and drawing them back onto the chart.
//
// Weltrade's TradingView build doesn't allow exporting all drawings at once, so each drawing is read one by one
// (type, anchor points, style) and recreated the same way. Points are time + price, so drawings land at the same
// levels on any timeframe.
//
// On disk: analyses/<SYMBOL>/<id>.json (+ <id>.png for manual saves), autosave.json (rolling), latest.json (newest).
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHART, screenshot, type Session } from "./browser.js";

export const ANALYSIS_DIR = process.env.WELTRADE_ANALYSIS_DIR ?? fileURLToPath(new URL("../analyses", import.meta.url));

// The chart returns symbols upper-cased (FX-VOL-60), so folders use that form.
const symKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9._-]/g, "_");
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);

interface Shape { name: string; points: { time: number; price: number }[]; properties: Record<string, unknown> }
interface Study { name: string; inputs: { id: string; value: unknown }[] | null }
export type Capture = { symbol: string; resolution: string; shapes: Shape[]; studies: Study[] };
export interface Saved extends Capture {
  id: string;
  name?: string;
  created_at: string;
  price_at_save: number | null;
  screenshot: string | null;
}

// Runs inside the page. Shared with the page script in saver.ts.
export const CAPTURE_FN = `function capture(c) {
  const shapes = c.getAllShapes().map(s => {
    const sh = c.getShapeById(s.id); let properties = {};
    try { properties = JSON.parse(JSON.stringify(sh.getProperties())); } catch (e) {}
    return { name: s.name, points: sh.getPoints(), properties };
  });
  const studies = c.getAllStudies().map(s => { let inputs = null; try { inputs = c.getStudyById(s.id).getInputValues(); } catch (e) {} return { name: s.name, inputs }; });
  return { symbol: c.symbol(), resolution: c.resolution(), shapes, studies };
}`;

export const captureOn = (s: Session) => s.eval<Capture>(`(${CAPTURE_FN})(${CHART})`);
const shapeCount = (s: Session) => s.eval<number>(`${CHART}.getAllShapes().length`);
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/** kind 'version' = a new permanent file with a screenshot; 'autosave' = the rolling autosave.json. Both update latest.json. */
export async function write(cap: Capture, opts: { kind: "version" | "autosave"; name?: string; session?: Session }) {
  const now = new Date();
  const id = opts.kind === "autosave" ? "autosave" : `${symKey(cap.symbol)}_${cap.resolution}_${stamp(now)}`;
  const dir = join(ANALYSIS_DIR, symKey(cap.symbol));
  await mkdir(dir, { recursive: true });

  let price: number | null = null, shot: string | null = null;
  if (opts.kind === "version" && opts.session) {
    try {
      price = await opts.session.eval<number>(
        `${CHART}.exportData({ includeTime: false, includeSeries: true }).then(d => { const r = d.data[d.data.length - 1]; const i = d.schema.findIndex(x => x.plotTitle && x.plotTitle.toLowerCase() === "close"); return r ? r[i] : null; })`, true);
    } catch { /* no bars loaded */ }
    try { await writeFile(join(dir, `${id}.png`), Buffer.from(await screenshot(opts.session.tabId), "base64")); shot = `${id}.png`; } catch { /* optional */ }
  }

  const rec: Saved = { id, name: opts.name, created_at: now.toISOString(), price_at_save: price, screenshot: shot, ...cap };
  const body = JSON.stringify(rec, null, 2);
  await writeFile(join(dir, `${id}.json`), body);
  await writeFile(join(dir, "latest.json"), body);
  return JSON.parse(await readFile(join(dir, `${id}.json`), "utf8")) as Saved; // read back = verified on disk
}

export async function read(symbol: string, id: string) {
  return JSON.parse(await readFile(join(ANALYSIS_DIR, symKey(symbol), id === "latest" ? "latest.json" : `${safe(id)}.json`), "utf8")) as Saved;
}

export async function list(symbol: string) {
  const dir = join(ANALYSIS_DIR, symKey(symbol));
  let files: string[];
  try { files = await readdir(dir); } catch { return []; }
  const out: { id: string; name?: string; created_at: string; drawings: number }[] = [];
  for (const f of files.filter((x) => x.endsWith(".json") && x !== "latest.json")) {
    try { const r = JSON.parse(await readFile(join(dir, f), "utf8")) as Saved; out.push({ id: r.id, name: r.name, created_at: r.created_at, drawings: r.shapes.length }); } catch { /* skip */ }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Draw a saved analysis on the chart's current symbol. 'replace' removes only this symbol's drawings first. */
export async function restore(s: Session, rec: Saved, mode: "replace" | "merge") {
  const r = await s.eval<{ before: number; failed: { name: string; error: string }[] }>(
    `(async () => {
      const c = ${CHART};
      const rec = ${JSON.stringify({ shapes: rec.shapes, studies: rec.studies })};
      if (${JSON.stringify(mode)} === "replace") c.getAllShapes().forEach(x => c.removeEntity(x.id));
      const before = c.getAllShapes().length, failed = [];
      for (const s of rec.shapes) {
        try {
          const o = { shape: s.name, overrides: s.properties };
          if (typeof s.properties.text === "string" && s.properties.text) o.text = s.properties.text;
          const id = s.points.length === 1 ? await c.createShape(s.points[0], o) : await c.createMultipointShape(s.points, o);
          if (!id) failed.push({ name: s.name, error: "not created" });
        } catch (e) { failed.push({ name: s.name, error: String(e && e.message || e) }); }
      }
      const have = new Set(c.getAllStudies().map(x => x.name));
      for (const st of rec.studies) {
        if (have.has(st.name)) continue;
        try { const inputs = {}; (st.inputs || []).forEach(i => { inputs[i.id] = i.value; }); await c.createStudy(st.name, false, false, inputs); } catch (e) {}
      }
      return { before, failed };
    })()`,
    true,
  );
  const onChart = await shapeCount(s);
  return { ok: onChart === r.before + rec.shapes.length && r.failed.length === 0, onChart, failed: r.failed };
}
