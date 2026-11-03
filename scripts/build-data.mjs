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

const norm = (s) => String(s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

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
    for (const c of s.cards) search.push([c.id, c.name, s.id, c.no || "", c.img || ""]);
  }
  // Préfixe commun des URL d'images, retiré de chaque ligne pour alléger l'index de recherche.
  const imgs = search.map((r) => r[4]).filter(Boolean);
  let base = imgs[0] || "";
  for (const u of imgs) {
    let i = 0;
    while (i < base.length && i < u.length && base[i] === u[i]) i++;
    base = base.slice(0, i);
    if (!base) break;
  }
  base = base.slice(0, base.lastIndexOf("/") + 1);
  if (base) for (const r of search) if (r[4].startsWith(base)) r[4] = r[4].slice(base.length);
  await writeJSON(join(dir, "sets.json"), index);
  await writeJSON(join(dir, "search.json"), { base, rows: search });
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

// Source 1 : Riftcodex (API communautaire).
async function riftcodexCards() {
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

  return cards.map((c) => {
    const setId = String(c.set?.set_id || "autre").toLowerCase();
    const m = setMeta.get(setId);
    const meta = c.metadata || {};
    return {
      setId,
      setName: m?.name || c.set?.label || setId.toUpperCase(),
      setDate: m?.date || "",
      id: String(c.riftbound_id || c.id),
      no: c.riftbound_id ? String(c.riftbound_id).toUpperCase() : String(c.collector_number ?? ""),
      n: c.collector_number ?? null,
      name: c.name || "?",
      img: c.media?.image_url || "",
      rar: c.classification?.rarity || "",
      type: c.classification?.type || "",
      dom: (c.classification?.domain || []).join(" / "),
      alt: !!(meta.alternate_art || meta.overnumbered || meta.signature),
    };
  });
}

// Source 2 : galerie officielle de Riot. La page Next.js embarque toute la liste de cartes
// dans <script id="__NEXT_DATA__">. Les nouveaux sets y apparaissent dès leur sortie.
async function riotGalleryCards() {
  const res = await fetch("https://playriftbound.com/en-us/card-gallery/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`galerie Riot : HTTP ${res.status}`);
  const page = await res.text();
  const m = page.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("galerie Riot : __NEXT_DATA__ introuvable");
  const data = JSON.parse(m[1]);

  const find = (node, depth = 0) => {
    if (depth > 14 || !node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      if (node.length && node[0] && typeof node[0] === "object" && "publicCode" in node[0]) return node;
      for (const v of node) {
        const got = find(v, depth + 1);
        if (got) return got;
      }
      return null;
    }
    for (const v of Object.values(node)) {
      const got = find(v, depth + 1);
      if (got) return got;
    }
    return null;
  };
  const raw = find(data.props || data);
  if (!raw?.length) throw new Error("galerie Riot : liste de cartes introuvable");

  return raw.map((c) => {
    const code = String(c.publicCode || "");
    const head = code.split("/")[0].replace("*", "");
    const suffix = head.includes("-") ? head.split("-").slice(1).join("-") : "";
    const signed = code.includes("*");
    const alt = /^\d+[a-z]$/i.test(suffix);
    const setCode = String(c.set?.value?.id || head.split("-")[0] || "autre");
    return {
      setId: setCode.toLowerCase(),
      setName: c.set?.value?.label || setCode,
      setDate: "",
      id: String(c.id || code),
      no: code.replace(/\/.*$/, "") + (signed ? " ✍" : ""),
      n: c.collectorNumber ?? null,
      name: c.name || "?",
      img: c.cardImage?.url || "",
      rar: c.rarity?.value?.label || "",
      type: (c.cardType?.type || []).map((t) => t.label).join(" / "),
      dom: (c.domain?.values || []).map((d) => d.label).join(" / "),
      alt: alt || signed,
    };
  });
}

async function riftbound() {
  const [codex, riot] = await Promise.allSettled([riftcodexCards(), riotGalleryCards()]);
  if (codex.status === "rejected") console.error(`  Riftcodex indisponible : ${codex.reason?.message}`);
  if (riot.status === "rejected") console.error(`  Galerie Riot indisponible : ${riot.reason?.message}`);
  const a = codex.status === "fulfilled" ? codex.value : [];
  const b = riot.status === "fulfilled" ? riot.value : [];
  console.log(`  Riftcodex : ${a.length} cartes, galerie Riot : ${b.length} cartes`);
  if (!a.length && !b.length) throw new Error("aucune source Riftbound disponible");

  // Riftcodex reste la base (identifiants inchangés pour les collections existantes) ;
  // la galerie Riot ajoute ce qui manque, en particulier les sets récents.
  // Rapprochement par nom de set + nom de carte (les codes de set et les numéros peuvent différer
  // entre les deux sources, ex. Vendetta), en préférant la même version et le même numéro.
  const setKey = (c) => norm(c.setName);
  const pool = new Map(); // set|nom -> cartes Riftcodex pas encore rapprochées
  const setIdByName = new Map();
  for (const c of a) {
    const k = `${setKey(c)}|${norm(c.name)}`;
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(c);
    if (!setIdByName.has(setKey(c))) setIdByName.set(setKey(c), { id: c.setId, name: c.setName, date: c.setDate });
  }
  const ids = new Set(a.map((c) => c.id.toLowerCase()));
  const merged = [...a];
  let added = 0;
  let enriched = 0;
  for (const c of b) {
    if (ids.has(c.id.toLowerCase())) continue;
    const candidates = pool.get(`${setKey(c)}|${norm(c.name)}`) || [];
    let i = candidates.findIndex((x) => x.alt === c.alt && x.n === c.n);
    if (i < 0) i = candidates.findIndex((x) => x.alt === c.alt);
    if (i < 0) i = candidates.findIndex((x) => x.n === c.n);
    if (i < 0 && candidates.length) i = 0;
    if (i >= 0) {
      const x = candidates.splice(i, 1)[0];
      // Complète les infos manquantes côté Riftcodex (cartes ajoutées avec des données partielles).
      if (x.n == null && c.n != null) x.n = c.n;
      if (!x.img && c.img) x.img = c.img;
      if (!x.rar && c.rar) x.rar = c.rar;
      if (!x.type && c.type) x.type = c.type;
      if (!x.dom && c.dom) x.dom = c.dom;
      enriched++;
      continue;
    }
    const same = setIdByName.get(setKey(c));
    merged.push(same ? { ...c, setId: same.id, setName: same.name, setDate: same.date } : c);
    ids.add(c.id.toLowerCase());
    added++;
  }
  console.log(`  ${added} cartes ajoutées depuis la galerie Riot, ${enriched} rapprochées de Riftcodex`);

  const bySet = new Map();
  for (const c of merged) {
    if (!bySet.has(c.setId)) bySet.set(c.setId, { name: c.setName, date: c.setDate, cards: [] });
    const s = bySet.get(c.setId);
    if (!s.date && c.setDate) s.date = c.setDate;
    const { setId, setName, setDate, ...card } = c;
    s.cards.push(card);
  }

  const sets = [];
  for (const [id, s] of bySet) {
    s.cards.sort((x, y) => (x.n ?? 9999) - (y.n ?? 9999) || x.no.localeCompare(y.no, "en", { numeric: true }));
    sets.push({ id, name: s.name, code: id.toUpperCase(), date: s.date, cards: s.cards });
  }
  // Sets datés du plus récent au plus ancien ; un set sans date (souvent tout nouveau) passe en tête.
  sets.sort((x, y) => (x.date ? 1 : 0) - (y.date ? 1 : 0) || (y.date || "").localeCompare(x.date || ""));
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
