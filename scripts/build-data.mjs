// Récupère les catalogues de cartes et écrit des fichiers JSON compacts dans _site/data.
// Lancé chaque nuit par GitHub Actions (Node 20+, fetch natif).
// Si une source est indisponible, on reprend les données déjà publiées sur le site.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.env.OUT_DIR || "_site/data";
const PAGES_URL = (process.env.PAGES_URL || "").replace(/\/$/, "");
const UA = "ma-collection-tcg/1.0 (collection perso; github.com/Ninbbus/ma-collection-tcg)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, { tries = 4 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(120000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
      return await res.json();
    } catch (e) {
      last = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw last;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const slug = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "set";

async function writeJSON(path, data) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(data));
}

// Écrit un jeu complet : index des sets, un fichier par set, index de recherche.
async function writeGame(game, sets) {
  const dir = join(OUT, game);
  await mkdir(dir, { recursive: true });
  const index = [];
  const search = [];
  for (const s of sets) {
    await writeJSON(join(dir, "sets", `${s.id}.json`), { id: s.id, name: s.name, cards: s.cards });
    index.push({ id: s.id, name: s.name, code: s.code || "", date: s.date || "", group: s.group || "", count: s.cards.length });
    for (const c of s.cards) search.push([c.id, c.name, s.id, c.no || ""]);
  }
  await writeJSON(join(dir, "sets.json"), index);
  await writeJSON(join(dir, "search.json"), search);
  return { sets: index.length, cards: search.length };
}

// Reprise des données publiées précédemment (si la source est bloquée ce soir-là).
async function copyPrevious(game) {
  if (!PAGES_URL) throw new Error("pas d'URL du site pour récupérer les anciennes données");
  const base = `${PAGES_URL}/data/${game}`;
  const index = await getJSON(`${base}/sets.json`, { tries: 2 });
  if (!Array.isArray(index)) throw new Error("aucune donnée précédente");
  const sets = await pool(index, 8, async (s) => {
    const full = await getJSON(`${base}/sets/${s.id}.json`, { tries: 2 });
    return { ...s, cards: full?.cards || [] };
  });
  return sets;
}

/* ---------------- Riftbound (Riftcodex) ---------------- */

async function riftbound() {
  const API = "https://api.riftcodex.com";
  const listOf = (body) => (Array.isArray(body) ? body : body?.items || body?.data || []);

  const setsBody = await getJSON(`${API}/sets`).catch(() => null);
  const setMeta = new Map();
  for (const s of listOf(setsBody)) {
    const id = String(s.set_id || s.id || "").toLowerCase();
    if (id) setMeta.set(id, { name: s.label || s.name || id.toUpperCase(), date: s.published_on || s.release_date || s.published || "" });
  }

  const cards = [];
  let page = 1;
  for (;;) {
    const body = await getJSON(`${API}/cards?page=${page}&size=100&limit=100`);
    const items = listOf(body);
    if (!items.length) break;
    cards.push(...items);
    const pages = body?.pages || 0;
    if (pages && page >= pages) break;
    if (!pages && items.length < 100) break;
    page++;
    await sleep(250);
  }
  if (!cards.length) throw new Error("Riftcodex n'a renvoyé aucune carte");

  const bySet = new Map();
  for (const c of cards) {
    const setId = String(c.set?.set_id || "autre").toLowerCase();
    if (!bySet.has(setId)) bySet.set(setId, []);
    const meta = c.metadata || {};
    bySet.get(setId).push({
      id: String(c.riftbound_id || c.id),
      no: c.riftbound_id ? String(c.riftbound_id).toUpperCase() : String(c.collector_number ?? ""),
      n: c.collector_number ?? null,
      name: c.name || "?",
      img: c.media?.image_url || "",
      rar: c.classification?.rarity || "",
      type: c.classification?.type || "",
      dom: (c.classification?.domain || []).join(" / "),
      alt: !!(meta.alternate_art || meta.overnumbered || meta.signature),
    });
    if (!setMeta.has(setId)) setMeta.set(setId, { name: c.set?.label || setId.toUpperCase(), date: "" });
  }

  const sets = [];
  for (const [id, list] of bySet) {
    list.sort((a, b) => (a.n ?? 9999) - (b.n ?? 9999) || a.no.localeCompare(b.no, "en", { numeric: true }));
    const m = setMeta.get(id);
    sets.push({ id, name: m.name, code: id.toUpperCase(), date: m.date, cards: list });
  }
  sets.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return sets;
}

/* ---------------- Yu-Gi-Oh (YGOPRODeck) ---------------- */

async function yugioh() {
  const API = "https://db.ygoprodeck.com/api/v7";
  const [setList, all] = await Promise.all([getJSON(`${API}/cardsets.php`), getJSON(`${API}/cardinfo.php`)]);
  const cards = all?.data || [];
  if (!cards.length) throw new Error("YGOPRODeck n'a renvoyé aucune carte");

  const meta = new Map();
  const usedIds = new Set();
  for (const s of setList || []) {
    let id = slug(s.set_code || s.set_name);
    if (usedIds.has(id)) id = `${id}-${slug(s.set_name)}`;
    usedIds.add(id);
    meta.set(s.set_name, { id, name: s.set_name, code: s.set_code || "", date: s.tcg_date || "" });
  }

  const bySet = new Map();
  for (const c of cards) {
    const img = c.card_images?.[0]?.image_url_small || "";
    for (const p of c.card_sets || []) {
      let m = meta.get(p.set_name);
      if (!m) {
        m = { id: slug(p.set_name), name: p.set_name, code: "", date: "" };
        meta.set(p.set_name, m);
      }
      if (!bySet.has(m.id)) bySet.set(m.id, { m, list: [], seen: new Set() });
      const entry = bySet.get(m.id);
      const pid = `${p.set_code}|${p.set_rarity_code || p.set_rarity}`;
      if (entry.seen.has(pid)) continue;
      entry.seen.add(pid);
      entry.list.push({
        id: pid,
        no: p.set_code,
        name: c.name,
        img,
        rar: p.set_rarity || "",
        type: c.type || "",
      });
    }
  }

  const sets = [];
  for (const { m, list } of bySet.values()) {
    list.sort((a, b) => a.no.localeCompare(b.no, "en", { numeric: true }) || a.rar.localeCompare(b.rar));
    sets.push({ id: m.id, name: m.name, code: m.code, date: m.date, cards: list });
  }
  sets.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return sets;
}

/* ---------------- Pokémon (TCGdex) ---------------- */

async function pokemon() {
  const API = "https://api.tcgdex.net/v2/en";
  const series = (await getJSON(`${API}/series`)) || [];
  const seriesSets = await pool(series, 4, async (s) => {
    const full = await getJSON(`${API}/series/${encodeURIComponent(s.id)}`).catch(() => null);
    return (full?.sets || []).map((x) => ({ id: x.id, serie: s.name }));
  });
  const refs = seriesSets.flat();
  if (!refs.length) throw new Error("TCGdex n'a renvoyé aucun set");

  const sets = await pool(refs, 6, async (ref) => {
    const s = await getJSON(`${API}/sets/${encodeURIComponent(ref.id)}`).catch(() => null);
    if (!s) return null;
    const list = (s.cards || []).map((c) => ({
      id: c.id,
      no: String(c.localId ?? ""),
      name: c.name || "?",
      img: c.image ? `${c.image}/low.webp` : "",
    }));
    list.sort((a, b) => a.no.localeCompare(b.no, "en", { numeric: true }));
    return { id: slug(s.id), name: s.name, code: s.id, date: s.releaseDate || "", group: ref.serie, cards: list };
  });
  const ok = sets.filter((s) => s && s.cards.length);
  ok.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return ok;
}

/* ---------------- Main ---------------- */

const games = { riftbound, yugioh, pokemon };
const summary = { updated: new Date().toISOString(), games: {} };
let failures = 0;

for (const [game, fn] of Object.entries(games)) {
  const t0 = Date.now();
  let sets;
  let source = "live";
  try {
    sets = await fn();
  } catch (e) {
    console.error(`⚠ ${game} : source indisponible (${e.message}). Reprise des données précédentes.`);
    source = "previous";
    try {
      sets = await copyPrevious(game);
    } catch (e2) {
      console.error(`✖ ${game} : pas de données précédentes (${e2.message}).`);
      sets = [];
      source = "missing";
      failures++;
    }
  }
  const stats = await writeGame(game, sets);
  summary.games[game] = { ...stats, source };
  console.log(`✔ ${game} : ${stats.sets} sets, ${stats.cards} cartes (${source}, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

await writeJSON(join(OUT, "meta.json"), summary);
console.log(JSON.stringify(summary, null, 2));
if (failures === Object.keys(games).length) process.exit(1);
