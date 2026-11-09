// Reconnaissance d'une carte à partir d'une photo, entièrement sur le téléphone.
// 1. Tesseract.js (servi par l'app elle-même, dossier ocr/) lit le texte de la photo.
// 2. On repère le code imprimé selon le jeu et on le rapproche du catalogue.
(function (root) {
  "use strict";

  /* ================= Lecture des codes (fonctions pures, testables) ================= */

  const fold = (s) =>
    String(s || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();

  // Corrige les confusions courantes de l'OCR à l'intérieur des nombres (O→0, l/I→1, S→5, B→8).
  function fixDigits(text) {
    return String(text || "").replace(/[0-9OoIlSB|]{2,}/g, (run) =>
      /\d/.test(run) ? run.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/B/g, "8") : run
    );
  }

  // --- Riftbound : « OGN · 042/298 », « 019a/166 », « 299*/298 »
  function parseRiftId(id) {
    const m = /^([a-z0-9]+)-(\d+)([a-z]?)(\*?)-(\d+)$/.exec(String(id).toLowerCase().replace("-star-", "*-"));
    if (!m) return null;
    return { set: m[1], num: +m[2], letter: m[3], star: !!m[4], total: +m[5] };
  }
  function riftboundCandidates(text, rows, setIds) {
    const t = fixDigits(text);
    const hits = [];
    for (const m of t.matchAll(/(\d{1,3})\s*([a-zA-Z])?\s*(\*)?\s*[\/|]\s*(\d{2,3})/g)) {
      hits.push({ num: +m[1], letter: (m[2] || "").toLowerCase(), star: !!m[3], total: +m[4] });
    }
    const upper = t.toUpperCase();
    const setsInText = setIds.filter((s) => s.length >= 2 && new RegExp(`(^|[^A-Z])${s.toUpperCase()}([^A-Z]|$)`).test(upper));
    // Sans « / » lisible : « OGN 042 », « OGN-042a »
    if (!hits.length) {
      for (const s of setsInText) {
        for (const m of upper.matchAll(new RegExp(`${s.toUpperCase()}\\s*[-•·.]?\\s*(\\d{2,3})([A-Z])?(\\*)?`, "g"))) {
          hits.push({ num: +m[1], letter: (m[2] || "").toLowerCase(), star: !!m[3], total: 0, set: s });
        }
      }
    }
    if (!hits.length) return [];
    const scored = [];
    for (const r of rows) {
      const p = parseRiftId(r[0]);
      if (!p) continue;
      let best = 0;
      for (const h of hits) {
        if (p.num !== h.num) continue;
        const setOk = (h.total && p.total === h.total) || (h.set && p.set === h.set) || setsInText.includes(p.set);
        if (!setOk) continue;
        let sc = 10;
        if (setsInText.includes(p.set)) sc += 3;
        if (h.total && p.total === h.total) sc += 3;
        sc += p.letter === h.letter ? 3 : 0;
        sc += p.star === h.star ? 2 : 0;
        best = Math.max(best, sc);
      }
      if (best) scored.push([best, r]);
    }
    return scored.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }

  // --- Yu-Gi-Oh : « LOB-EN001 », « RA03-FR045 », « SDY-006 »
  function parseYgoNo(no) {
    const m = /^([A-Z0-9]{2,6})-([A-Z]{0,2})(\d{2,3})$/.exec(String(no).toUpperCase());
    return m ? { prefix: m[1], num: +m[3] } : null;
  }
  function yugiohCandidates(text, rows) {
    const t = String(text || "").toUpperCase().replace(/[—–_]/g, "-");
    const hits = [];
    for (const m of t.matchAll(/\b([A-Z0-9]{2,6})\s?-\s?([A-Z]{0,2})\s?([0-9OISL]{3,4})\b/g)) {
      const prefix = m[1];
      // « 00O1 » (lettre O doublée par l'OCR) -> 001
      const digits = m[3].replace(/[O]/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5");
      const num = +(digits.length === 4 && digits[0] === "0" ? digits.replace(/^0(?=\d{3}$)|(\d)\1(?=\d$)/, "$1") : digits);
      if (!/[A-Z]/.test(prefix) || Number.isNaN(num)) continue;
      hits.push({ prefix, num });
      // l'OCR confond parfois 0/O dans le préfixe (RA03 / RAO3)
      if (/O/.test(prefix)) hits.push({ prefix: prefix.replace(/O/g, "0"), num });
      if (/0/.test(prefix)) hits.push({ prefix: prefix.replace(/0/g, "O"), num });
    }
    if (!hits.length) return [];
    const out = [];
    for (const r of rows) {
      const p = parseYgoNo(r[3]);
      if (p && hits.some((h) => h.prefix === p.prefix && h.num === p.num)) out.push(r);
    }
    return out;
  }

  // --- Pokémon : « 025/165 », « TG05/TG30 » ; le set se déduit du total officiel, le nom départage.
  function pokemonCandidates(text, rows, sets) {
    const t = fixDigits(text).toUpperCase();
    const hits = [];
    for (const m of t.matchAll(/\b([A-Z]{0,2})(\d{1,3})\s*[\/|]\s*([A-Z]{0,2})(\d{2,3})\b/g)) {
      hits.push({ prefix: m[1], num: +m[2], total: +m[4] });
    }
    if (!hits.length) return [];
    const setTotals = new Map(sets.map((s) => [s.id, [s.official, s.count].filter(Boolean)]));
    const words = new Set(fold(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
    const scored = [];
    for (const r of rows) {
      const no = String(r[3]).toUpperCase();
      const m = /^([A-Z]*)(\d+)/.exec(no);
      if (!m) continue;
      const totals = setTotals.get(r[2]) || [];
      for (const h of hits) {
        if (+m[2] !== h.num || (h.prefix || "") !== (m[1] || "")) continue;
        if (!totals.includes(h.total)) continue;
        let sc = 10 + (totals[0] === h.total ? 2 : 0);
        for (const w of fold(r[1]).split(/[^a-z0-9]+/)) if (w.length >= 3 && words.has(w)) sc += 4;
        scored.push([sc, r]);
        break;
      }
    }
    return scored.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }

  function findCandidates(game, text, { rows = [], sets = [] } = {}) {
    if (game === "riftbound") return riftboundCandidates(text, rows, sets.map((s) => s.id));
    if (game === "yugioh") return yugiohCandidates(text, rows);
    if (game === "pokemon") return pokemonCandidates(text, rows, sets);
    return [];
  }

  /* ================= Préparation de la photo ================= */

  function loadBitmap(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image"));
      };
      img.src = url;
    });
  }

  // Découpe une bande de la photo (proportions 0-1), l'agrandit et augmente le contraste.
  function band(img, y0, y1, width = 1500) {
    const sw = img.naturalWidth;
    const sh = img.naturalHeight * (y1 - y0);
    const scale = width / sw;
    const c = document.createElement("canvas");
    c.width = Math.round(sw * scale);
    c.height = Math.max(1, Math.round(sh * scale));
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, img.naturalHeight * y0, sw, sh, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    let min = 255, max = 0;
    const gray = new Uint8ClampedArray(px.length / 4);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      gray[j] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const v = ((gray[j] - min) * 255) / range;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }

  // Zones à lire, dans l'ordre, selon l'endroit où chaque jeu imprime son code.
  const ZONES = {
    riftbound: [[0.78, 1], [0.6, 1], [0, 1]],
    yugioh: [[0.62, 0.82], [0.55, 0.9], [0, 1]],
    pokemon: [[0.82, 1], [0.7, 1], [0, 1]],
  };

  /* ================= Moteur OCR ================= */

  const abs = (p) => new URL(p, document.baseURI).href;
  let workerPromise = null;
  let progressCb = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("script"));
      document.head.appendChild(s);
    });
  }

  function getWorker() {
    if (!workerPromise) {
      const cfg = root.OCR_CONFIG || { base: "ocr/" };
      const base = cfg.base;
      workerPromise = (async () => {
        if (!root.Tesseract) await loadScript(abs(`${base}tesseract.min.js`));
        const worker = await root.Tesseract.createWorker("eng", 1, {
          workerPath: abs(`${base}worker.min.js`),
          corePath: abs(`${base}core`),
          langPath: abs(`${base}lang`),
          logger: (m) => progressCb && progressCb(m),
        });
        await worker.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" });
        return worker;
      })().catch((e) => {
        workerPromise = null;
        throw e;
      });
    }
    return workerPromise;
  }

  // Analyse complète : renvoie { candidates, text }.
  async function scan(file, game, catalog, onProgress) {
    progressCb = onProgress;
    const [{ img, url }, worker] = await Promise.all([loadBitmap(file), getWorker()]);
    let text = "";
    let candidates = [];
    try {
      const zones = ZONES[game] || [[0, 1]];
      for (let i = 0; i < zones.length; i++) {
        onProgress && onProgress({ status: "zone", zone: i + 1, zones: zones.length });
        const canvas = band(img, zones[i][0], zones[i][1], zones[i][0] === 0 && zones[i][1] === 1 ? 1300 : 1500);
        const { data } = await worker.recognize(canvas);
        text += `\n${data.text || ""}`;
        candidates = findCandidates(game, text, catalog);
        // Pokémon : on continue une zone de plus pour lire le nom et départager les sets.
        if (candidates.length === 1 || (candidates.length && game !== "pokemon")) break;
        if (candidates.length && game === "pokemon" && i >= 1) break;
      }
    } finally {
      URL.revokeObjectURL(url);
      progressCb = null;
    }
    return { candidates, text: text.trim() };
  }

  // Libellé court de la version d'un candidat (pour choisir la bonne impression).
  function variantLabel(game, row) {
    if (game === "riftbound") {
      const p = parseRiftId(row[0]);
      if (!p) return "";
      return [p.star ? "Signée" : "", p.total && p.num > p.total ? "Overnumber" : "", p.letter ? "Alt Art" : ""].filter(Boolean).join(" · ");
    }
    if (game === "yugioh") return String(row[0]).split("|")[1]?.replace(/[()]/g, "") || "";
    return "";
  }

  const api = { scan, findCandidates, variantLabel, fixDigits, parseRiftId, parseYgoNo, warmUp: () => getWorker().catch(() => null) };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Scanner = api;
})(typeof window !== "undefined" ? window : globalThis);
