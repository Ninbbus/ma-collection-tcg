// Binder : suivi de collection Riftbound, Yu-Gi-Oh et Pokémon.
(function () {
  "use strict";

  /* ================= Configuration ================= */

  const GAMES = {
    riftbound: {
      label: "Riftbound",
      langs: ["EN", "CN", "FR", "Autre"],
      versions: ["Normale", "Foil", "Alt art", "Overnumbered", "Signée", "Promo"],
      defaults: { lang: "EN", ver: "Normale", cond: "NM" },
    },
    yugioh: {
      label: "Yu-Gi-Oh",
      langs: ["EN", "FR", "DE", "IT", "ES", "JP", "Autre"],
      versions: ["1st Edition", "Unlimited", "Limited"],
      defaults: { lang: "EN", ver: "1st Edition", cond: "NM" },
    },
    pokemon: {
      label: "Pokémon",
      langs: ["FR", "EN", "JP", "Autre"],
      versions: ["Normale", "Holo", "Reverse", "1st Edition", "Promo"],
      defaults: { lang: "FR", ver: "Normale", cond: "NM" },
    },
  };
  const CONDITIONS = [
    ["MT", "Mint"],
    ["NM", "Near Mint"],
    ["EX", "Excellent"],
    ["GD", "Good"],
    ["LP", "Light Played"],
    ["PL", "Played"],
    ["PO", "Poor"],
  ];
  const PRIOS = { 5: "Indispensable", 4: "Haute", 3: "Moyenne", 2: "Basse", 1: "Un jour" };
  const PRIO_ORDER = [5, 4, 3, 2, 1];
  // Ancienne échelle (1 basse, 2 moyenne, 3 haute) vers la nouvelle (1 un jour … 5 indispensable).
  function migrateWish(col) {
    if (!col || col.wishScale === 5) return;
    for (const e of Object.values(col.cards || {})) if (e.wish > 0) e.wish = Math.min(5, e.wish + 1);
    col.wishScale = 5;
  }
  const prioSeg = (current, withNone) =>
    `${withNone ? `<button type="button" data-w="0" aria-pressed="${!current}">Non</button>` : ""}${[1, 2, 3, 4, 5]
      .map((p) => `<button type="button" class="p${p}" data-w="${p}" aria-pressed="${current === p}">${PRIOS[p]}</button>`)
      .join("")}`;
  // Ordre des raretés, de la plus haute à la plus basse.
  const RARITIES = {
    riftbound: ["Showcase signée", "Showcase Overnumber", "Showcase Alt Art", "Showcase", "Epic", "Rare", "Uncommon", "Common"],
    yugioh: [
      "Quarter Century Secret Rare", "Starlight Rare", "Ghost Rare", "Collector's Rare", "Ultimate Rare",
      "Prismatic Secret Rare", "Platinum Secret Rare", "Ultra Secret Rare", "Secret Rare", "Prismatic Ultimate Rare",
      "Ultra Rare", "Premium Gold Rare", "Gold Secret Rare", "Gold Rare", "Super Rare", "Rare", "Short Print", "Common",
    ],
    pokemon: [],
  };
  const SLOTS = 12; // cartes par page de binder
  const SET_PAGE = 60;
  const APP_VERSION = "1.5";
  const CHANGELOG = [
    {
      v: "1.5",
      date: "9 novembre 2026",
      items: [
        "Nouvel onglet Accueil : ta vitrine avec des cartes de tous les jeux, et le résumé de tes collections",
        "Les Classeurs s'appellent maintenant Binders",
        "Disposition au choix pour chaque binder : 3 × 4 (portrait) ou 4 × 3 (paysage)",
        "Images décoratives : mets une photo de ta galerie dans une poche de binder",
        "Wishlist : 5 niveaux de priorité (Un jour → Indispensable) et tri par prix max",
        "Réglages déplacés dans la roue dentée en haut à droite",
      ],
    },
    {
      v: "1.4.1",
      date: "7 novembre 2026",
      items: [
        "Riftbound : les versions overnumber, signées et alt art sont maintenant bien séparées et classées (Vendetta et tous les sets)",
        "Les cartes de ta collection sont remises à jour automatiquement avec la bonne rareté",
        "Carte hors base : choix de la version (Showcase signée, Overnumber, Alt Art) pour les cartes absentes du catalogue",
      ],
    },
    {
      v: "1.4",
      date: "7 novembre 2026",
      items: [
        "Multi-sélection dans un set : ajoute, mets en wishlist ou range dans un binder plusieurs cartes d'un coup",
        "Prix max dans la wishlist, affiché sur l'image partagée",
        "Lien Cardmarket sur chaque fiche carte",
        "Glisse la fiche d'une carte vers le bas pour la fermer",
        "Touche le visuel d'une carte pour l'afficher en grand",
        "Page de nouveautés et numéro de version dans Réglages",
      ],
    },
    {
      v: "1.3",
      date: "3 novembre 2026",
      items: [
        "Raretés Showcase détaillées : signée, Overnumber, Alt Art",
        "Filtres par rareté et par couleur dans les sets",
        "Rappel de sauvegarde",
        "Partage de la wishlist en image",
        "Lien de l'app à partager dans Réglages",
      ],
    },
    { v: "1.2", date: "3 novembre 2026", items: ["Binders vitrine avec pages de 12 cartes", "Collection classée par set ou par rareté", "Mise à jour automatique à l'ouverture"] },
    { v: "1.1", date: "3 novembre 2026", items: ["Visuels dans les résultats de recherche", "Set Radiance ajouté via la galerie officielle Riot", "Doublons du set Vendetta supprimés"] },
    { v: "1.0", date: "3 novembre 2026", items: ["Première version : Riftbound, Yu-Gi-Oh et Pokémon, collection, wishlist, sauvegarde, cartes hors base"] },
  ];
  const CARDMARKET = { riftbound: "Riftbound", yugioh: "YuGiOh", pokemon: "Pokemon" };
  const APP_URL = "https://ninbbus.github.io/ma-collection-tcg/";

  /* ================= État ================= */

  const S = {
    game: "riftbound",
    tab: "home",
    wishSort: "prio",
    route: {}, // route par jeu dans l'onglet Sets : { setId } ou {}
    filter: "all",
    quick: false,
    setQuery: "",
    listQuery: "",
    shownSets: SET_PAGE,
    sheet: null, // carte ouverte
    importData: null,
    colSort: "set",
    binderOpen: {}, // jeu -> id du binder ouvert
    binderPage: 0,
    binderEdit: false,
    binderSel: null,
    selecting: false, // multi-sélection dans un set
    sel: new Set(),
    visible: [],
    col: { cards: {}, defaults: {}, binders: [], decos: {}, wishScale: 5, lastGame: "riftbound" },
  };
  const catalog = {}; // game -> { sets, setData: Map, search }
  let meta = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $("#view");
  const sheetEl = $("#sheet");
  const backdrop = $("#backdrop");

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const norm = (s) =>
    String(s ?? "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const eur = (n) => (n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const keyOf = (game, id) => `${game}:${id}`;
  const money = (n) => {
    const d = Number(n) % 1 ? 2 : 0;
    return `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
  };
  const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
  const parsePrice = (v) => {
    const n = parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  };
  // Recherche Cardmarket préremplie (aucune source ne donne l'adresse exacte de chaque carte).
  function cardmarketURL(game, card) {
    const name = String(card.name || "")
      .replace(/\s*\((alternate art|alt art|signature|signed|overnumbered|showcase)[^)]*\)/gi, "")
      .trim();
    return `https://www.cardmarket.com/fr/${CARDMARKET[game]}/Products/Search?searchString=${encodeURIComponent(name)}`;
  }
  // Version haute définition d'un visuel, quand la source en propose une.
  function bigImage(url) {
    return String(url || "")
      .replace("/cards_small/", "/cards/")
      .replace(/\/low\.webp$/, "/high.webp");
  }

  const ICON = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  };

  /* ================= Données catalogue ================= */

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }
  function cat(game) {
    return (catalog[game] ||= { sets: null, setData: new Map(), search: null, error: null });
  }
  async function loadSets(game) {
    const c = cat(game);
    if (c.sets) return c.sets;
    try {
      c.sets = await fetchJSON(`data/${game}/sets.json`);
    } catch (e) {
      c.error = e;
      c.sets = [];
    }
    return c.sets;
  }
  async function loadSet(game, setId) {
    const c = cat(game);
    if (c.setData.has(setId)) return c.setData.get(setId);
    const data = await fetchJSON(`data/${game}/sets/${encodeURIComponent(setId)}.json`);
    c.setData.set(setId, data);
    syncEntries(game, data);
    return data;
  }
  // Remet à jour les fiches de la collection avec le catalogue (rareté, versions signée / overnumber / alt art).
  function syncEntries(game, set) {
    let changed = false;
    for (const c of set.cards || []) {
      const e = S.col.cards[keyOf(game, c.id)];
      if (!e || e.custom) continue;
      const want = { sig: !!c.sig, ovr: !!c.ovr, aa: !!c.aa, rar: c.rar || "", name: c.name || e.name, no: c.no || "", img: c.img || e.img };
      for (const [k, v] of Object.entries(want)) {
        if (e[k] !== v) {
          e[k] = v;
          changed = true;
        }
      }
    }
    if (changed) save();
    return changed;
  }
  async function loadSearch(game) {
    const c = cat(game);
    if (!c.search)
      c.search = fetchJSON(`data/${game}/search.json`)
        .then((d) => {
          if (Array.isArray(d)) return d; // ancien format sans images
          const base = d.base || "";
          return (d.rows || []).map((r) => {
            const img = r[4] || "";
            return [r[0], r[1], r[2], r[3], img && !/^(https?:|data:)/.test(img) ? base + img : img];
          });
        })
        .catch(() => []);
    return c.search;
  }

  /* ================= Collection ================= */

  function entry(game, id) {
    return S.col.cards[keyOf(game, id)] || null;
  }
  function ownedQty(e) {
    return e ? e.copies.reduce((n, c) => n + (c.qty || 0), 0) : 0;
  }
  function ensureEntry(game, card, set) {
    const k = keyOf(game, card.id);
    let e = S.col.cards[k];
    if (!e) {
      e = S.col.cards[k] = {
        game,
        id: card.id,
        setId: set?.id || card.setId || "",
        setName: set?.name || card.setName || "",
        name: card.name,
        no: card.no || "",
        img: card.img || "",
        rar: card.rar || "",
        sig: !!card.sig,
        ovr: !!card.ovr,
        aa: !!card.aa,
        copies: [],
        wish: 0,
        custom: !!card.custom,
        added: Date.now(),
      };
    }
    if (card.sig && !e.sig) e.sig = true;
    return e;
  }
  function cleanup(e) {
    e.copies = e.copies.filter((c) => c.qty > 0);
    const k = keyOf(e.game, e.id);
    if (!e.copies.length && !e.wish && !e.custom && !inBinder(k)) delete S.col.cards[k];
  }
  function defaults(game) {
    return { ...GAMES[game].defaults, ...(S.col.defaults[game] || {}) };
  }
  function newCopy(game) {
    const d = defaults(game);
    return { lang: d.lang, ver: d.ver, cond: d.cond, qty: 1, price: null };
  }
  function save() {
    Store.saveSoon("collection", S.col);
  }
  function quickAdd(game, card, set) {
    const e = ensureEntry(game, card, set);
    const d = defaults(game);
    const same = e.copies.find((c) => c.lang === d.lang && c.ver === d.ver && c.cond === d.cond);
    if (same) same.qty++;
    else e.copies.push(newCopy(game));
    save();
    return e;
  }
  function gameEntries(game) {
    return Object.values(S.col.cards).filter((e) => e.game === game);
  }
  function setProgress(game, setId) {
    let owned = 0;
    let custom = 0;
    for (const e of Object.values(S.col.cards)) {
      if (e.game !== game || e.setId !== setId) continue;
      if (e.custom) custom++;
      if (ownedQty(e) > 0 && !e.custom) owned++;
    }
    return { owned, custom };
  }
  function copyLabel(c) {
    return `${c.lang} · ${c.ver} · ${c.cond}${c.qty > 1 ? ` ×${c.qty}` : ""}`;
  }
  function entryValue(e) {
    return e.copies.reduce((n, c) => n + (c.qty || 0) * (Number(c.price) || 0), 0);
  }

  function isSigned(e) {
    return !!e.sig || /✍|\*/.test(e.no || "") || /\b(signed|signature)\b/i.test(`${e.name} ${e.rar}`);
  }
  // Identifiants Riftbound du type « ven-042a-166 » : numéro, lettre de version alternative, total du set.
  function rbFlags(x) {
    const m = String(x.id || "").toLowerCase().match(/^[a-z0-9]+-(\d+)([a-z]?)-(\d+)$/);
    return {
      sig: isSigned(x),
      ovr: !!x.ovr || !!(m && +m[1] > +m[3]),
      aa: !!x.aa || !!(m && m[2]) || /\(alternate art\)/i.test(x.name || ""),
    };
  }
  function rarityOf(e, game = e.game) {
    if (game === "riftbound") {
      const f = rbFlags(e);
      if (f.sig) return "Showcase signée";
      if (f.ovr) return "Showcase Overnumber";
      if (f.aa) return "Showcase Alt Art";
    }
    return e.rar || "";
  }
  function rarityRank(game, rar) {
    const list = RARITIES[game] || [];
    const i = list.findIndex((r) => r.toLowerCase() === String(rar).toLowerCase());
    return i < 0 ? list.length + (rar ? 0 : 1) : i;
  }

  function bindersOf(game) {
    return (S.col.binders || []).filter((b) => b.game === game);
  }
  function inBinder(key) {
    return (S.col.binders || []).some((b) => b.slots.includes(key));
  }
  function addToBinder(b, key) {
    let i = b.slots.indexOf(null);
    if (i < 0) {
      i = b.slots.length;
      b.slots.push(...Array(SLOTS).fill(null));
    }
    b.slots[i] = key;
    return i;
  }
  function cardFromEntry(e) {
    return { id: e.id, name: e.name, no: e.no, img: e.img, rar: e.rar, sig: e.sig, setId: e.setId, setName: e.setName, custom: e.custom };
  }

  /* ================= Navigation ================= */

  function setGame(game) {
    if (!GAMES[game]) return;
    S.game = game;
    S.col.lastGame = game;
    S.selecting = false;
    S.sel = new Set();
    S.setQuery = "";
    S.listQuery = "";
    S.filter = "all";
    S.shownSets = SET_PAGE;
    document.body.dataset.game = game;
    for (const b of document.querySelectorAll("#games button")) b.setAttribute("aria-pressed", String(b.dataset.game === game));
    save();
    render();
  }
  function setTab(tab) {
    if (tab === S.tab && tab === "sets" && S.route[S.game]?.setId) {
      S.route[S.game] = {}; // re-toucher l'onglet Sets ramène à la liste
    }
    if (tab === S.tab && tab === "binders") S.binderOpen[S.game] = null;
    S.binderEdit = false;
    S.binderSel = null;
    S.selecting = false;
    S.sel = new Set();
    S.tab = tab;
    S.listQuery = "";
    for (const b of document.querySelectorAll("#tabbar button, #open-settings")) {
      if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    render();
    window.scrollTo(0, 0);
  }
  $("#open-settings").addEventListener("click", () => setTab("settings"));
  function openSet(setId) {
    S.route[S.game] = { setId };
    S.selecting = false;
    S.sel = new Set();
    S.filter = "all";
    S.rarFilter = "";
    S.domFilter = "";
    S.listQuery = "";
    render();
    window.scrollTo(0, 0);
  }

  $("#games").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-game]");
    if (b) setGame(b.dataset.game);
  });
  $("#tabbar").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-tab]");
    if (b) setTab(b.dataset.tab);
  });

  const DAY = 86400000;
  function drawBackupBanner() {
    const el = $("#banner");
    const cards = Object.values(S.col.cards);
    const now = Date.now();
    const first = cards.reduce((m, e) => Math.min(m, e.added || now), now);
    const last = S.col.lastExport || 0;
    const due = cards.length > 0 && (last ? now - last > 14 * DAY : now - first > 3 * DAY);
    const snoozed = (S.col.backupSnooze || 0) > now;
    if (!due || snoozed || S.tab === "settings") {
      el.hidden = true;
      return;
    }
    const days = last ? Math.floor((now - last) / DAY) : 0;
    el.hidden = false;
    el.innerHTML = `<span>${last ? `Dernière sauvegarde il y a ${days} jours.` : "Tu n'as encore jamais sauvegardé ta collection."}</span>
      <button type="button" class="btn small primary" id="bn-save">Sauvegarder</button>
      <button type="button" class="btn small" id="bn-later">Plus tard</button>`;
    $("#bn-save").onclick = exportBackup;
    $("#bn-later").onclick = () => {
      S.col.backupSnooze = now + 3 * DAY;
      save();
      el.hidden = true;
    };
  }

  function render() {
    document.body.classList.remove("selecting");
    drawBackupBanner();
    const fn = { home: renderHome, sets: renderSetsTab, collection: renderCollection, binders: renderBinders, wishlist: renderWishlist, settings: renderSettings }[S.tab];
    fn();
  }
  function refreshKeepingScroll() {
    const y = window.scrollY;
    const active = document.activeElement?.id;
    render();
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      if (active && document.getElementById(active)) document.getElementById(active).focus({ preventScroll: true });
    });
  }

  /* ================= Onglet Sets ================= */

  async function renderSetsTab() {
    const r = S.route[S.game] || {};
    if (r.setId) return renderSet(r.setId);
    const game = S.game;
    view.innerHTML = `
      <div class="view-head"><h2>${esc(GAMES[game].label)}</h2></div>
      <input id="set-search" class="search" type="search" placeholder="Chercher un set ou une carte…" autocomplete="off" value="${esc(S.setQuery)}">
      <div id="set-results"><p class="note">Chargement des sets…</p></div>`;
    $("#set-search").addEventListener("input", (ev) => {
      S.setQuery = ev.target.value;
      S.shownSets = SET_PAGE;
      drawSetResults();
    });
    await loadSets(game);
    if (S.game === game && S.tab === "sets") drawSetResults();
  }

  async function drawSetResults() {
    const game = S.game;
    const box = $("#set-results");
    if (!box) return;
    const c = cat(game);
    const sets = c.sets || [];
    if (!sets.length) {
      box.innerHTML = `<div class="empty"><strong>Aucune carte disponible pour ${esc(GAMES[game].label)}</strong>${
        c.error ? "Le catalogue n'a pas pu être chargé. Vérifie ta connexion." : "Le catalogue sera ajouté à la prochaine mise à jour automatique (chaque nuit)."
      }</div>`;
      return;
    }
    const q = norm(S.setQuery.trim());
    const list = q ? sets.filter((s) => norm(`${s.name} ${s.code} ${s.group}`).includes(q)) : sets;
    let html = "";
    if (list.length) {
      html += `<p class="label">${q ? "Sets" : `${sets.length} sets`}</p><div class="set-list">`;
      for (const s of list.slice(0, S.shownSets)) html += setRow(game, s);
      html += "</div>";
      if (list.length > S.shownSets) html += `<button type="button" class="btn more" data-more>Afficher plus de sets (${list.length - S.shownSets})</button>`;
    }
    html += `<div id="card-hits"></div>`;
    box.innerHTML = html;
    if (q.length >= 3) drawCardHits(game, q);
    else if (!list.length) box.innerHTML = `<div class="empty"><strong>Aucun set trouvé</strong>Tape au moins 3 lettres pour chercher aussi dans les noms de cartes.</div>`;
  }

  function setRow(game, s) {
    const { owned, custom } = setProgress(game, s.id);
    const pct = s.count ? Math.min(100, Math.round((owned / s.count) * 100)) : 0;
    const meta = [s.code, s.group, s.date ? s.date.slice(0, 4) : ""].filter(Boolean).join(" · ");
    return `<button type="button" class="set-row" data-set="${esc(s.id)}">
      <span class="name">${esc(s.name)}</span>
      <span class="count"><b>${owned}</b>/${s.count}${custom ? `<br>+${custom} hors base` : ""}<br>${pct} %</span>
      <span class="meta">${esc(meta)}</span>
      <span class="bar ${pct === 100 ? "full" : ""}"><i style="width:${pct}%"></i></span>
    </button>`;
  }

  async function drawCardHits(game, q) {
    const idx = await loadSearch(game);
    const hitsBox = $("#card-hits");
    if (!hitsBox || S.game !== game || norm(S.setQuery.trim()) !== q) return;
    const setsById = new Map((cat(game).sets || []).map((s) => [s.id, s]));
    const hits = [];
    for (const row of idx) {
      if (norm(row[1]).includes(q) || norm(row[3]).includes(q)) {
        hits.push(row);
        if (hits.length >= 60) break;
      }
    }
    if (!hits.length) {
      hitsBox.innerHTML = $(".set-list") ? "" : `<div class="empty"><strong>Rien trouvé</strong>Aucun set ni aucune carte ne correspond à « ${esc(S.setQuery)} ».</div>`;
      return;
    }
    hitsBox.innerHTML = `<p class="label">Cartes${hits.length >= 60 ? " (60 premiers résultats)" : ""}</p><div class="rows">${hits
      .map(([id, name, setId, no, img]) => {
        const e = entry(game, id);
        const qty = ownedQty(e);
        const pic = e?.img || img;
        return `<button type="button" class="row" data-hit="${esc(id)}" data-hit-set="${esc(setId)}">
          <span class="thumb">${pic ? `<img src="${esc(pic)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>
          <span class="txt"><span class="t1">${esc(name)}</span><span class="t2">${esc(no)} · ${esc(setsById.get(setId)?.name || setId)}</span></span>
          <span class="end">${qty ? `×${qty}` : e?.wish ? `<span class="prio p${e.wish}">${PRIOS[e.wish]}</span>` : ""}</span>
        </button>`;
      })
      .join("")}</div>`;
  }

  view.addEventListener("click", async (ev) => {
    const t = ev.target;
    const setBtn = t.closest("[data-set]");
    if (setBtn && S.tab === "sets") return openSet(setBtn.dataset.set);
    if (t.closest("[data-more]")) {
      S.shownSets += SET_PAGE * 2;
      return drawSetResults();
    }
    const hit = t.closest("[data-hit]");
    if (hit) {
      const game = S.game;
      try {
        const set = await loadSet(game, hit.dataset.hitSet);
        const card = set.cards.find((c) => c.id === hit.dataset.hit);
        if (card) openSheet(game, { ...card, setId: set.id, setName: set.name });
      } catch {
        toast("Impossible de charger cette carte");
      }
    }
  });

  /* ================= Vue d'un set (binder) ================= */

  async function renderSet(setId) {
    const game = S.game;
    const sets = await loadSets(game);
    const info = sets.find((s) => s.id === setId);
    view.innerHTML = `<div class="view-head"><button type="button" class="back" id="back" aria-label="Retour aux sets">${ICON.back}</button>
      <div><h2>${esc(info?.name || setId)}</h2><div class="sub" id="set-sub"></div></div></div>
      <p class="note">Chargement des cartes…</p>`;
    $("#back").onclick = () => {
      S.route[game] = {};
      render();
    };
    let set;
    try {
      set = await loadSet(game, setId);
    } catch {
      view.querySelector(".note").textContent = "Impossible de charger ce set. Vérifie ta connexion.";
      return;
    }
    if (S.game !== game || S.tab !== "sets" || S.route[game]?.setId !== setId) return;
    drawSet(game, set, info);
  }

  function setCardsWithCustom(game, set) {
    const customs = gameEntries(game)
      .filter((e) => e.custom && e.setId === set.id)
      .map((e) => ({ id: e.id, no: e.no, name: e.name, img: e.img, rar: e.rar, custom: true }));
    return [...set.cards, ...customs];
  }

  function drawSet(game, set, info) {
    const all = setCardsWithCustom(game, set);
    const { owned } = setProgress(game, set.id);
    const total = set.cards.length;
    const pct = total ? Math.round((owned / total) * 100) : 0;
    const d = defaults(game);
    view.innerHTML = `
      <div class="view-head"><button type="button" class="back" id="back" aria-label="Retour aux sets">${ICON.back}</button>
        <div style="min-width:0"><h2>${esc(set.name)}</h2>
        <div class="sub"><span class="mono">${owned}/${total}</span> possédées · ${pct} %${info?.code ? ` · ${esc(info.code)}` : ""}</div></div></div>
      <input id="card-search" class="search" type="search" placeholder="Filtrer par nom ou numéro…" autocomplete="off" value="${esc(S.listQuery)}">
      <div class="toolbar" id="filters">
        <button type="button" class="chip" data-filter="all" aria-pressed="${S.filter === "all"}">Toutes</button>
        <button type="button" class="chip" data-filter="owned" aria-pressed="${S.filter === "owned"}">Possédées</button>
        <button type="button" class="chip" data-filter="missing" aria-pressed="${S.filter === "missing"}">Manquantes</button>
        <button type="button" class="chip" data-filter="wish" aria-pressed="${S.filter === "wish"}">Wishlist</button>
        <span class="spacer"></span>
        <button type="button" class="chip quick" id="quick" aria-pressed="${S.quick}">Ajout rapide</button>
        <button type="button" class="chip quick" id="multi" aria-pressed="${S.selecting}">Sélection</button>
      </div>
      ${facetsHTML(game, all)}
      <p class="note" id="multi-note" ${S.selecting ? "" : "hidden"}>Sélection : touche les cartes voulues, puis choisis une action en bas. Appui long pour ouvrir une fiche.</p>
      <p class="note" id="quick-note" ${S.quick ? "" : "hidden"}>Ajout rapide : un appui ajoute un exemplaire ${esc(d.lang)} · ${esc(d.ver)} · ${esc(d.cond)}. Appui long pour ouvrir la fiche.</p>
      <div class="binder" id="binder"></div>
      <div class="btn-row" style="margin-top:18px"><button type="button" class="btn" id="add-custom">+ Ajouter une carte hors base</button></div>
      <p class="note">Pour les cartes absentes du catalogue, comme certaines exclusivités chinoises, avec ta propre photo.</p>
      <div class="selbar-space" ${S.selecting ? "" : "hidden"}></div>
      <div class="selbar" id="selbar" ${S.selecting ? "" : "hidden"}>
        <div class="selbar-top"><b id="sel-count"></b><span class="spacer"></span>
          <button type="button" class="btn small" id="sel-all">Tout</button>
          <button type="button" class="btn small" id="sel-none">Aucune</button>
        </div>
        <div class="selbar-actions">
          <button type="button" class="btn primary" data-bulk="add">Ajouter</button>
          <button type="button" class="btn" data-bulk="wish">Wishlist</button>
          <button type="button" class="btn" data-bulk="binder">Binder</button>
        </div>
      </div>`;

    document.body.classList.toggle("selecting", S.selecting);
    $("#back").onclick = () => {
      S.route[game] = {};
      S.selecting = false;
      S.sel = new Set();
      render();
    };
    $("#card-search").addEventListener("input", (ev) => {
      S.listQuery = ev.target.value;
      drawBinder(game, set, all);
    });
    $("#filters").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-filter]");
      if (b) {
        S.filter = b.dataset.filter;
        for (const x of document.querySelectorAll("[data-filter]")) x.setAttribute("aria-pressed", String(x === b));
        drawBinder(game, set, all);
      }
    });
    $("#facets")?.addEventListener("change", (ev) => {
      if (ev.target.id === "f-rar") S.rarFilter = ev.target.value;
      if (ev.target.id === "f-dom") S.domFilter = ev.target.value;
      drawBinder(game, set, all);
    });
    const setMode = (quick, selecting) => {
      S.quick = quick;
      if (S.selecting !== selecting) S.sel = new Set();
      S.selecting = selecting;
      $("#quick").setAttribute("aria-pressed", String(quick));
      $("#multi").setAttribute("aria-pressed", String(selecting));
      $("#quick-note").hidden = !quick;
      $("#multi-note").hidden = !selecting;
      $("#selbar").hidden = !selecting;
      view.querySelector(".selbar-space").hidden = !selecting;
      document.body.classList.toggle("selecting", selecting);
      drawBinder(game, set, all);
      updateSelbar();
    };
    $("#quick").onclick = () => setMode(!S.quick, false);
    $("#multi").onclick = () => setMode(false, !S.selecting);
    $("#sel-all").onclick = () => {
      for (const id of S.visible) S.sel.add(id);
      drawBinder(game, set, all);
      updateSelbar();
    };
    $("#sel-none").onclick = () => {
      S.sel.clear();
      drawBinder(game, set, all);
      updateSelbar();
    };
    $("#selbar").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-bulk]");
      if (!b || !S.sel.size) return;
      const cards = all.filter((c) => S.sel.has(c.id));
      openBulk(b.dataset.bulk, game, set, cards, all);
    });
    updateSelbar();
    $("#add-custom").onclick = () => openCustomForm(game, set);
    drawBinder(game, set, all);
    bindPress($("#binder"), game, set);
  }

  // Deuxième critère selon le jeu : couleur (domaine) pour Riftbound, type de carte pour Yu-Gi-Oh.
  const FACET_LABEL = { riftbound: "Couleur", yugioh: "Type" };
  function facetValues(game, c) {
    if (game === "riftbound") return String(c.dom || "").split("/").map((x) => x.trim()).filter(Boolean);
    if (game === "yugioh") {
      const t = String(c.type || "");
      if (!t) return [];
      return [/spell/i.test(t) ? "Magie" : /trap/i.test(t) ? "Piège" : "Monstre"];
    }
    return [];
  }
  function facetsHTML(game, all) {
    const rars = [...new Set(all.map((c) => rarityOf(c, game)).filter(Boolean))].sort(
      (a, b) => rarityRank(game, a) - rarityRank(game, b) || a.localeCompare(b)
    );
    const doms = [...new Set(all.flatMap((c) => facetValues(game, c)))].sort((a, b) => a.localeCompare(b));
    if (!S.rarFilter || !rars.includes(S.rarFilter)) S.rarFilter = "";
    if (!S.domFilter || !doms.includes(S.domFilter)) S.domFilter = "";
    if (rars.length < 2 && doms.length < 2) return "";
    return `<div class="facets" id="facets">
      ${rars.length > 1 ? `<label>Rareté<select id="f-rar"><option value="">Toutes</option>${rars.map((r) => `<option ${r === S.rarFilter ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></label>` : ""}
      ${doms.length > 1 ? `<label>${FACET_LABEL[game] || "Type"}<select id="f-dom"><option value="">Toutes</option>${doms.map((d) => `<option ${d === S.domFilter ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></label>` : ""}
    </div>`;
  }

  function drawBinder(game, set, all) {
    const q = norm(S.listQuery.trim());
    const list = all.filter((c) => {
      const e = entry(game, c.id);
      const qty = ownedQty(e);
      if (S.filter === "owned" && !qty) return false;
      if (S.filter === "missing" && qty) return false;
      if (S.filter === "wish" && !e?.wish) return false;
      if (S.rarFilter && rarityOf(c, game) !== S.rarFilter) return false;
      if (S.domFilter && !facetValues(game, c).includes(S.domFilter)) return false;
      if (q && !norm(`${c.name} ${c.no}`).includes(q)) return false;
      return true;
    });
    S.visible = list.map((c) => c.id);
    const box = $("#binder");
    if (!list.length) {
      box.innerHTML = `<div class="empty" style="grid-column:1/-1"><strong>Aucune carte</strong>${
        S.filter === "missing" ? "Tu as toutes les cartes de ce set." : "Aucune carte ne correspond à ce filtre."
      }</div>`;
      return;
    }
    box.innerHTML = list.map((c) => pocketHTML(game, c)).join("");
  }

  function pocketHTML(game, c) {
    const e = entry(game, c.id);
    const qty = ownedQty(e);
    const picked = S.selecting && S.sel.has(c.id);
    return `<button type="button" class="pocket ${qty ? "" : "missing"} ${picked ? "picked" : ""}" data-card="${esc(c.id)}" ${S.selecting ? `aria-pressed="${picked}"` : ""} aria-label="${esc(c.name)} ${esc(c.no)}${qty ? `, ${qty} possédée(s)` : ", manquante"}">
      <span class="art">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}<span class="ph">${c.img ? "" : esc(c.name)}</span>
        ${qty ? `<span class="badge">${qty}</span>` : ""}
        ${e?.wish ? `<span class="star">${ICON.star}</span>` : ""}
        ${c.custom ? `<span class="tag-custom">Hors base</span>` : ""}
      </span>
      <span class="no">${esc(c.no || c.name)}</span>
    </button>`;
  }

  function updatePocket(game, cardId) {
    const el = document.querySelector(`.pocket[data-card="${CSS.escape(cardId)}"]`);
    if (!el) return;
    const set = cat(game).setData.get(S.route[game]?.setId);
    const card = set && setCardsWithCustom(game, set).find((c) => c.id === cardId);
    if (!card) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = pocketHTML(game, card);
    const fresh = tmp.firstElementChild;
    el.replaceWith(fresh);
    return fresh;
  }

  // Appui court : fiche (ou ajout rapide). Appui long : fiche.
  function bindPress(box, game, set) {
    let timer = null;
    let longFired = false;
    let startX = 0;
    let startY = 0;
    const cardFor = (el) => setCardsWithCustom(game, set).find((c) => c.id === el.dataset.card);
    box.addEventListener("pointerdown", (ev) => {
      const el = ev.target.closest(".pocket");
      if (!el) return;
      longFired = false;
      startX = ev.clientX;
      startY = ev.clientY;
      timer = setTimeout(() => {
        longFired = true;
        const card = cardFor(el);
        if (card) openSheet(game, { ...card, setId: set.id, setName: set.name });
      }, 480);
    });
    const cancel = (ev) => {
      if (ev.type === "pointermove" && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 10) return;
      clearTimeout(timer);
    };
    box.addEventListener("pointermove", cancel);
    box.addEventListener("pointerup", cancel);
    box.addEventListener("pointercancel", cancel);
    box.addEventListener("contextmenu", (ev) => ev.preventDefault());
    box.addEventListener("click", (ev) => {
      const el = ev.target.closest(".pocket");
      if (!el) return;
      if (longFired) {
        longFired = false;
        return;
      }
      const card = cardFor(el);
      if (!card) return;
      if (S.selecting) {
        if (S.sel.has(card.id)) S.sel.delete(card.id);
        else S.sel.add(card.id);
        el.classList.toggle("picked", S.sel.has(card.id));
        el.setAttribute("aria-pressed", String(S.sel.has(card.id)));
        updateSelbar();
        return;
      }
      if (S.quick && !card.custom) {
        const e = quickAdd(game, card, set);
        const fresh = updatePocket(game, card.id);
        fresh?.classList.add("bump");
        updateSetSub(game, set);
        toast(`${card.name} : ${ownedQty(e)} exemplaire${ownedQty(e) > 1 ? "s" : ""}`);
      } else {
        openSheet(game, { ...card, setId: set.id, setName: set.name });
      }
    });
  }

  function updateSelbar() {
    const count = $("#sel-count");
    if (!count) return;
    const n = S.sel.size;
    count.textContent = n ? `${plural(n, "carte")} sélectionnée${n > 1 ? "s" : ""}` : "Aucune carte sélectionnée";
    for (const b of document.querySelectorAll("[data-bulk]")) b.disabled = !n;
  }

  function showSheet() {
    backdrop.hidden = false;
    sheetEl.hidden = false;
    sheetEl.scrollTop = 0;
    document.documentElement.style.overflow = "hidden";
  }
  function hideSheet() {
    S.sheet = null;
    sheetEl.hidden = true;
    backdrop.hidden = true;
    document.documentElement.style.overflow = "";
  }

  function thumbsHTML(cards) {
    const shown = cards.slice(0, 14);
    return `<div class="thumbs">${shown
      .map((c) => (c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy" onerror="this.remove()">` : `<span title="${esc(c.name)}"></span>`))
      .join("")}${cards.length > shown.length ? `<span class="more-n">+${cards.length - shown.length}</span>` : ""}</div>`;
  }

  // Actions groupées sur les cartes sélectionnées : ajouter, wishlist, binder.
  function openBulk(kind, game, set, cards, all) {
    const g = GAMES[game];
    const d = defaults(game);
    const n = cards.length;
    S.sheet = { game, card: { id: "__bulk" } };
    const head = (title) => `<div class="grabber"></div>
      <button type="button" class="close" id="sheet-close" aria-label="Fermer">${ICON.close}</button>
      <h3 class="sheet-title">${title}</h3>
      ${thumbsHTML(cards)}`;
    if (kind === "add") {
      sheetEl.innerHTML = `${head(`Ajouter ${plural(n, "carte")} à ma collection`)}
        <div class="copy">
          <label>Langue<select id="bk-lang">${options(g.langs, d.lang)}</select></label>
          <label>Version<select id="bk-ver">${options(g.versions, d.ver)}</select></label>
          <label>État<select id="bk-cond">${options(CONDITIONS, d.cond)}</select></label>
          <div class="foot"><span class="sub" style="color:var(--muted);font-size:13px">Exemplaires par carte</span>
            <div class="stepper" style="margin-left:auto"><button type="button" id="bk-minus" aria-label="Retirer un">−</button><output id="bk-qty">1</output><button type="button" id="bk-plus" aria-label="Ajouter un">+</button></div>
          </div>
        </div>
        <button type="button" class="btn primary" id="bk-go" style="width:100%">Ajouter ${plural(n, "carte")}</button>
        <p class="note">Si tu as déjà un exemplaire identique d'une carte, sa quantité augmente.</p>`;
      let qty = 1;
      $("#bk-minus").onclick = () => ($("#bk-qty").textContent = qty = Math.max(1, qty - 1));
      $("#bk-plus").onclick = () => ($("#bk-qty").textContent = qty = Math.min(99, qty + 1));
      $("#bk-go").onclick = () => {
        const opt = { lang: $("#bk-lang").value, ver: $("#bk-ver").value, cond: $("#bk-cond").value };
        for (const c of cards) {
          const e = ensureEntry(game, c, set);
          const same = e.copies.find((x) => x.lang === opt.lang && x.ver === opt.ver && x.cond === opt.cond);
          if (same) same.qty += qty;
          else e.copies.push({ ...opt, qty, price: null });
        }
        finishBulk(game, set, all, `${plural(n, "carte")} ajoutée${n > 1 ? "s" : ""} à ta collection`);
      };
    } else if (kind === "wish") {
      let prio = 3;
      sheetEl.innerHTML = `${head(`Mettre ${plural(n, "carte")} en wishlist`)}
        <p class="label" style="margin-top:4px">Priorité</p>
        <div class="seg seg3" id="bk-prio">
          ${prioSeg(3, false)}
        </div>
        <label class="maxp">Prix max par carte (facultatif)<span><input id="bk-max" type="text" inputmode="decimal" autocomplete="off" placeholder="—"> €</span></label>
        <button type="button" class="btn primary" id="bk-go" style="width:100%;margin-top:14px">Mettre en wishlist</button>`;
      $("#bk-prio").addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-w]");
        if (!b) return;
        prio = +b.dataset.w;
        for (const x of document.querySelectorAll("#bk-prio [data-w]")) x.setAttribute("aria-pressed", String(x === b));
      });
      $("#bk-go").onclick = () => {
        const max = parsePrice($("#bk-max").value);
        for (const c of cards) {
          const e = ensureEntry(game, c, set);
          e.wish = prio;
          if (max != null) e.maxPrice = max;
        }
        finishBulk(game, set, all, `${plural(n, "carte")} en wishlist (priorité ${PRIOS[prio].toLowerCase()})`);
      };
    } else {
      const list = bindersFor(game);
      sheetEl.innerHTML = `${head(`Ranger ${plural(n, "carte")} dans un binder`)}
        ${
          list.length
            ? `<div class="binder-pick" id="bk-binders">${list
                .map((b) => `<button type="button" class="btn" data-b="${esc(b.id)}">« ${esc(b.name)} » <span class="sub" style="color:var(--muted);font-weight:500">· ${plural(b.slots.filter(Boolean).length, "carte")}</span></button>`)
                .join("")}</div>`
            : `<p class="note" style="margin-top:0">Tu n'as pas encore de binder ${esc(g.label)}. Crée-le ici :</p>`
        }
        <form class="new-binder" id="bk-new">
          <input id="bk-name" class="search" placeholder="Nouveau binder" autocomplete="off" maxlength="40">
          <button type="submit" class="btn primary">Créer et ranger</button>
        </form>
        <p class="note">Les cartes vont dans les premières poches libres. Des pages sont ajoutées si besoin.</p>`;
      const put = (b) => {
        let added = 0;
        for (const c of cards) {
          const k = keyOf(game, c.id);
          if (b.slots.includes(k)) continue;
          ensureEntry(game, c, set);
          addToBinder(b, k);
          added++;
        }
        finishBulk(game, set, all, added ? `${plural(added, "carte")} rangée${added > 1 ? "s" : ""} dans « ${b.name} »` : `Déjà toutes dans « ${b.name} »`);
      };
      $("#bk-binders")?.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-b]");
        if (btn) put(S.col.binders.find((x) => x.id === btn.dataset.b));
      });
      $("#bk-new").addEventListener("submit", (ev) => {
        ev.preventDefault();
        const name = $("#bk-name").value.trim();
        if (!name) return $("#bk-name").focus();
        const b = { id: `b-${Date.now().toString(36)}`, game, name, slots: Array(SLOTS).fill(null), created: Date.now() };
        S.col.binders.push(b);
        put(b);
      });
    }
    $("#sheet-close").onclick = closeSheet;
    showSheet();
  }

  function finishBulk(game, set, all, message) {
    save();
    hideSheet();
    S.sel.clear();
    drawBinder(game, set, all);
    updateSetSub(game, set);
    updateSelbar();
    toast(message);
  }

  function updateSetSub(game, set) {
    const sub = view.querySelector(".view-head .sub");
    if (!sub) return;
    const { owned } = setProgress(game, set.id);
    const total = set.cards.length;
    const info = (cat(game).sets || []).find((s) => s.id === set.id);
    sub.innerHTML = `<span class="mono">${owned}/${total}</span> possédées · ${total ? Math.round((owned / total) * 100) : 0} %${info?.code ? ` · ${esc(info.code)}` : ""}`;
  }

  /* ================= Fiche carte ================= */

  function openSheet(game, card) {
    S.sheet = { game, card };
    drawSheet();
    showSheet();
  }
  function closeSheet() {
    if (!S.sheet) return;
    const { game, card } = S.sheet;
    if (card.id.startsWith("__")) {
      // panneaux sans carte (sélection groupée, carte hors base, choix pour un binder)
      hideSheet();
      return;
    }
    const e = entry(game, card.id);
    if (e) cleanup(e);
    save();
    hideSheet();
    if (S.tab === "sets" && S.route[game]?.setId) {
      if (!updatePocket(game, card.id)) refreshKeepingScroll();
      const set = cat(game).setData.get(S.route[game].setId);
      if (set) updateSetSub(game, set);
    } else {
      refreshKeepingScroll();
    }
  }
  backdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && S.sheet) closeSheet();
  });

  // Visuel en grand : un appui ou un glissement vers le bas le ferme.
  function openViewer(src, alt) {
    const v = document.createElement("div");
    v.className = "viewer";
    v.setAttribute("role", "dialog");
    v.setAttribute("aria-label", alt || "Carte");
    v.innerHTML = `<img alt="${esc(alt)}"><p class="viewer-hint">Touche ou glisse vers le bas pour fermer</p>`;
    const img = v.querySelector("img");
    const big = bigImage(src);
    img.onerror = () => {
      if (img.getAttribute("src") !== src) img.src = src;
    };
    img.src = big;
    document.body.appendChild(v);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      v.classList.add("out");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => v.remove(), 170);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    let y0 = null;
    let dy = 0;
    v.addEventListener("touchstart", (ev) => {
      y0 = ev.touches[0].clientY;
      dy = 0;
    }, { passive: true });
    v.addEventListener("touchmove", (ev) => {
      if (y0 == null) return;
      dy = ev.touches[0].clientY - y0;
      if (dy > 0) {
        ev.preventDefault();
        img.style.transform = `translateY(${dy}px)`;
        v.style.background = `rgb(0 0 0 / ${Math.max(0.3, 0.88 - dy / 600)})`;
      }
    }, { passive: false });
    v.addEventListener("touchend", () => {
      if (dy > 90) close();
      else {
        img.style.transform = "";
        v.style.background = "";
      }
      y0 = null;
    });
    v.addEventListener("click", close);
  }

  // Glisser la fiche vers le bas pour la fermer (quand elle est en haut de son défilement).
  function resetSheetStyle() {
    sheetEl.style.transition = "";
    sheetEl.style.transform = "";
    backdrop.style.opacity = "";
    backdrop.style.transition = "";
  }
  (function enableSheetDrag() {
    let startY = 0;
    let dy = 0;
    let t0 = 0;
    let tracking = false;
    let dragging = false;
    sheetEl.addEventListener("touchstart", (ev) => {
      if (sheetEl.hidden || ev.touches.length !== 1) return (tracking = false);
      if (ev.target.closest("input, select, textarea, .thumbs, .pages")) return (tracking = false);
      tracking = sheetEl.scrollTop <= 0;
      dragging = false;
      startY = ev.touches[0].clientY;
      dy = 0;
      t0 = Date.now();
    }, { passive: true });
    sheetEl.addEventListener("touchmove", (ev) => {
      if (!tracking) return;
      dy = ev.touches[0].clientY - startY;
      if (!dragging) {
        if (dy > 8 && sheetEl.scrollTop <= 0) {
          dragging = true;
          sheetEl.style.transition = "none";
          document.activeElement?.blur?.();
        } else if (dy < -4) {
          tracking = false;
          return;
        } else return;
      }
      ev.preventDefault();
      sheetEl.style.transform = `translateY(${Math.max(0, dy)}px)`;
      backdrop.style.opacity = String(Math.max(0.15, 1 - dy / 450));
    }, { passive: false });
    const end = () => {
      if (!dragging) {
        tracking = false;
        return;
      }
      dragging = false;
      tracking = false;
      const fast = dy > 45 && Date.now() - t0 < 260;
      sheetEl.style.transition = "transform .2s ease-out";
      backdrop.style.transition = "opacity .2s";
      if (dy > 110 || fast) {
        sheetEl.style.transform = "translateY(100%)";
        backdrop.style.opacity = "0";
        setTimeout(() => {
          resetSheetStyle();
          closeSheet();
        }, 190);
      } else {
        sheetEl.style.transform = "";
        backdrop.style.opacity = "";
        setTimeout(resetSheetStyle, 210);
      }
    };
    sheetEl.addEventListener("touchend", end);
    sheetEl.addEventListener("touchcancel", end);
  })();

  function options(list, current) {
    return list
      .map((v) => {
        const [val, label] = Array.isArray(v) ? v : [v, v];
        return `<option value="${esc(val)}" ${val === current ? "selected" : ""}>${esc(label)}</option>`;
      })
      .join("");
  }

  function drawSheet() {
    const { game, card } = S.sheet;
    const e = entry(game, card.id);
    const g = GAMES[game];
    const copies = e?.copies || [];
    const qty = ownedQty(e);
    const value = e ? entryValue(e) : 0;
    const img = card.img || e?.img || "";
    sheetEl.innerHTML = `
      <div class="grabber"></div>
      <button type="button" class="close" id="sheet-close" aria-label="Fermer">${ICON.close}</button>
      <div class="sheet-head">
        <button type="button" class="art" id="zoom-art" ${img ? "" : "disabled"} aria-label="Afficher la carte en grand">${img ? `<img src="${esc(img)}" alt="${esc(card.name)}">` : ""}</button>
        <div style="min-width:0">
          <h3>${esc(card.name)}</h3>
          <div class="facts">
            ${card.no ? `<span>N° <span class="mono">${esc(card.no)}</span></span>` : ""}
            ${rarityOf(card, game) ? `<span>${esc(rarityOf(card, game))}</span>` : ""}
            ${card.setName ? `<span>${esc(card.setName)}</span>` : ""}
            ${card.custom ? `<span>Carte hors base</span>` : ""}
            <span>${qty ? `<b style="color:var(--owned)">${qty} possédée${qty > 1 ? "s" : ""}</b>` : "Pas encore possédée"}${value ? ` · ${eur(value)}` : ""}</span>
          </div>
          <a class="btn small cm-link" href="${esc(cardmarketURL(game, card))}" target="_blank" rel="noopener">Voir sur Cardmarket ${ICON.ext}</a>
        </div>
      </div>

      <div class="sheet-section">
        <p class="label">Mes exemplaires</p>
        <div id="copies">
          ${copies
            .map(
              (c, i) => `<div class="copy" data-i="${i}">
              <label>Langue<select data-f="lang">${options(g.langs, c.lang)}</select></label>
              <label>Version<select data-f="ver">${options(g.versions, c.ver)}</select></label>
              <label>État<select data-f="cond">${options(CONDITIONS, c.cond)}</select></label>
              <div class="foot">
                <div class="stepper"><button type="button" data-step="-1" aria-label="Retirer un">−</button><output>${c.qty}</output><button type="button" data-step="1" aria-label="Ajouter un">+</button></div>
                <label class="price">Prix €<input data-f="price" type="number" inputmode="decimal" step="0.01" min="0" placeholder="—" value="${c.price ?? ""}"></label>
                <button type="button" class="icon-btn" data-del aria-label="Supprimer cet exemplaire">${ICON.trash}</button>
              </div>
            </div>`
            )
            .join("")}
        </div>
        <button type="button" class="btn primary" id="add-copy" style="width:100%">+ Ajouter un exemplaire</button>
      </div>

      <div class="sheet-section">
        <p class="label">Wishlist</p>
        <div class="seg seg3" id="wish">
          ${prioSeg(e?.wish || 0, true)}
        </div>
        ${
          e?.wish
            ? `<label class="maxp">Prix max que je suis prêt à payer<span><input id="wish-max" type="text" inputmode="decimal" autocomplete="off" placeholder="—" value="${e.maxPrice != null ? String(e.maxPrice).replace(".", ",") : ""}"> €</span></label>`
            : ""
        }
      </div>

      <div class="sheet-section">
        <p class="label">Binders</p>
        ${
          bindersFor(game).length
            ? `<div class="toolbar" id="sheet-binders" style="margin:0">${bindersFor(game)
                .map((b) => `<button type="button" class="chip" data-b="${esc(b.id)}" aria-pressed="${b.slots.includes(keyOf(game, card.id))}">${b.slots.includes(keyOf(game, card.id)) ? "✓ " : "+ "}${esc(b.name)}</button>`)
                .join("")}</div>`
            : `<p class="note" style="margin:0">Crée un binder dans l'onglet Binders pour y ranger tes plus belles cartes.</p>`
        }
      </div>

      ${
        card.custom
          ? `<div class="sheet-section"><button type="button" class="btn danger" id="del-custom" style="width:100%">Supprimer cette carte hors base</button>
             <div id="del-confirm" hidden class="card-box" style="margin-top:8px"><p>Supprimer définitivement cette carte et ses exemplaires ?</p>
             <div class="btn-row"><button type="button" class="btn danger" id="del-yes">Supprimer</button><button type="button" class="btn" id="del-no">Annuler</button></div></div></div>`
          : ""
      }`;

    $("#sheet-close").onclick = closeSheet;
    $("#add-copy").onclick = () => {
      const en = ensureEntry(game, card);
      en.copies.push(newCopy(game));
      save();
      drawSheet();
    };
    $("#copies").addEventListener("change", (ev) => {
      const box = ev.target.closest(".copy");
      const f = ev.target.dataset.f;
      if (!box || !f) return;
      const c = entry(game, card.id).copies[+box.dataset.i];
      if (f === "price") {
        const v = parseFloat(String(ev.target.value).replace(",", "."));
        c.price = Number.isFinite(v) ? v : null;
      } else c[f] = ev.target.value;
      save();
    });
    $("#copies").addEventListener("click", (ev) => {
      const box = ev.target.closest(".copy");
      if (!box) return;
      const en = entry(game, card.id);
      const i = +box.dataset.i;
      const step = ev.target.closest("[data-step]");
      if (step) {
        en.copies[i].qty = Math.max(0, en.copies[i].qty + +step.dataset.step);
        if (en.copies[i].qty === 0) en.copies.splice(i, 1);
        save();
        drawSheet();
      }
      if (ev.target.closest("[data-del]")) {
        en.copies.splice(i, 1);
        save();
        drawSheet();
      }
    });
    $("#wish").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-w]");
      if (!b) return;
      const w = +b.dataset.w;
      if (w) ensureEntry(game, card).wish = w;
      else if (entry(game, card.id)) {
        entry(game, card.id).wish = 0;
        entry(game, card.id).maxPrice = null;
      }
      save();
      drawSheet();
    });
    $("#wish-max")?.addEventListener("change", (ev) => {
      const e2 = entry(game, card.id);
      if (!e2) return;
      e2.maxPrice = parsePrice(ev.target.value);
      save();
    });
    $("#zoom-art").onclick = () => img && openViewer(img, card.name);
    $("#sheet-binders")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-b]");
      if (!btn) return;
      const b = S.col.binders.find((x) => x.id === btn.dataset.b);
      const k = keyOf(game, card.id);
      const i = b.slots.indexOf(k);
      if (i >= 0) {
        b.slots[i] = null;
        toast(`Retirée de « ${b.name} »`);
      } else {
        ensureEntry(game, card);
        const at = addToBinder(b, k);
        toast(`Ajoutée à « ${b.name} », page ${Math.floor(at / SLOTS) + 1}`);
      }
      save();
      drawSheet();
    });
    if (card.custom) {
      $("#del-custom").onclick = () => ($("#del-confirm").hidden = false);
      $("#del-no").onclick = () => ($("#del-confirm").hidden = true);
      $("#del-yes").onclick = () => {
        delete S.col.cards[keyOf(game, card.id)];
        save();
        S.sheet = null;
        sheetEl.hidden = true;
        backdrop.hidden = true;
        document.documentElement.style.overflow = "";
        refreshKeepingScroll();
        toast("Carte supprimée");
      };
    }
  }

  /* ================= Carte hors base ================= */

  function openCustomForm(game, set) {
    S.sheet = { game, card: { id: "__form" } };
    const g = GAMES[game];
    const d = defaults(game);
    sheetEl.innerHTML = `
      <div class="grabber"></div>
      <button type="button" class="close" id="sheet-close" aria-label="Fermer">${ICON.close}</button>
      <h3 style="font:700 20px/1.2 var(--font-display);margin:2px 0 4px">Carte hors base</h3>
      <p class="note" style="margin:0 0 14px">Dans le set ${esc(set.name)}.</p>
      <form class="form" id="custom-form">
        <label>Nom de la carte<input id="cf-name" required autocomplete="off"></label>
        <label>Numéro (facultatif)<input id="cf-no" autocomplete="off" placeholder="ex. OGN-001 CN"></label>
        <label>Langue<select id="cf-lang">${options(g.langs, game === "riftbound" ? "CN" : d.lang)}</select></label>
        <label>Photo (facultatif)<input id="cf-photo" type="file" accept="image/*"></label>
        ${
          game === "riftbound"
            ? `<label>Version<select id="cf-var"><option value="">Normale</option><option value="sig">Showcase signée</option><option value="ovr">Showcase Overnumber</option><option value="aa">Showcase Alt Art</option><option value="sc">Showcase</option></select></label>`
            : ""
        }
        <label class="row-check" style="display:flex;align-items:center;gap:8px;color:var(--fg)"><input id="cf-owned" type="checkbox" checked style="width:20px;height:20px"> Je la possède déjà</label>
        <button type="submit" class="btn primary">Ajouter la carte</button>
      </form>`;
    backdrop.hidden = false;
    sheetEl.hidden = false;
    document.documentElement.style.overflow = "hidden";
    $("#sheet-close").onclick = () => {
      S.sheet = null;
      sheetEl.hidden = true;
      backdrop.hidden = true;
      document.documentElement.style.overflow = "";
    };
    $("#custom-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const name = $("#cf-name").value.trim();
      if (!name) return;
      const file = $("#cf-photo").files[0];
      let img = "";
      if (file) {
        try {
          img = await resizeImage(file, 420);
        } catch {
          toast("Photo illisible, carte ajoutée sans photo");
        }
      }
      const variant = $("#cf-var")?.value || "";
      const card = {
        id: `custom-${Date.now().toString(36)}`,
        no: $("#cf-no").value.trim(),
        name,
        img,
        rar: variant ? "Showcase" : "",
        custom: true,
        sig: variant === "sig",
        ovr: variant === "ovr",
        aa: variant === "aa",
      };
      const e = ensureEntry(game, card, set);
      if ($("#cf-owned").checked) e.copies.push({ ...newCopy(game), lang: $("#cf-lang").value });
      save();
      S.sheet = null;
      sheetEl.hidden = true;
      backdrop.hidden = true;
      document.documentElement.style.overflow = "";
      const setData = cat(game).setData.get(set.id);
      if (setData) drawSet(game, setData, (cat(game).sets || []).find((s) => s.id === set.id));
      toast("Carte ajoutée");
    });
  }

  function resizeImage(file, width) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, width / img.naturalWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image"));
      };
      img.src = url;
    });
  }

  /* ================= Onglet Collection ================= */

  function rowHTML(e, end) {
    return `<button type="button" class="row" data-entry="${esc(keyOf(e.game, e.id))}">
      <span class="thumb">${e.img ? `<img src="${esc(e.img)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>
      <span class="txt"><span class="t1">${esc(e.name)}</span><span class="t2">${esc([e.no, e.setName].filter(Boolean).join(" · "))}</span>
      ${e.copies.length ? `<span class="t2">${esc(e.copies.map(copyLabel).join(" / "))}</span>` : ""}</span>
      <span class="end">${end}</span>
    </button>`;
  }

  function bindRows() {
    view.querySelectorAll("[data-entry]").forEach((el) => {
      el.onclick = () => {
        const e = S.col.cards[el.dataset.entry];
        if (e) openSheet(e.game, cardFromEntry(e));
      };
    });
  }

  function renderCollection() {
    const game = S.game;
    const owned = gameEntries(game).filter((e) => ownedQty(e) > 0);
    const copies = owned.reduce((n, e) => n + ownedQty(e), 0);
    const value = owned.reduce((n, e) => n + entryValue(e), 0);
    view.innerHTML = `
      <div class="view-head"><h2>Ma collection</h2></div>
      <div class="stats">
        <div class="stat"><b>${owned.length}</b><span>cartes uniques</span></div>
        <div class="stat"><b>${copies}</b><span>exemplaires</span></div>
        <div class="stat"><b>${value ? eur(value).replace(/\s?€/, "") : "—"}</b><span>valeur € (saisie)</span></div>
      </div>
      <input id="col-search" class="search" type="search" placeholder="Chercher dans ma collection…" autocomplete="off" value="${esc(S.listQuery)}">
      <div class="toolbar" id="col-sort"><span class="sub" style="color:var(--muted);font-size:13px">Classer par</span>
        <button type="button" class="chip" data-sort="set" aria-pressed="${S.colSort === "set"}">Set</button>
        <button type="button" class="chip" data-sort="rarity" aria-pressed="${S.colSort === "rarity"}">Rareté</button>
      </div>
      <div id="col-list"></div>`;
    $("#col-sort").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-sort]");
      if (!b) return;
      S.colSort = b.dataset.sort;
      for (const x of document.querySelectorAll("[data-sort]")) x.setAttribute("aria-pressed", String(x === b));
      drawCollectionList(owned);
    });
    $("#col-search").addEventListener("input", (ev) => {
      S.listQuery = ev.target.value;
      drawCollectionList(owned);
    });
    drawCollectionList(owned);
  }

  function drawCollectionList(owned) {
    const q = norm(S.listQuery.trim());
    const list = owned.filter((e) => !q || norm(`${e.name} ${e.no} ${e.setName}`).includes(q));
    const box = $("#col-list");
    if (!owned.length) {
      box.innerHTML = `<div class="empty" style="margin-top:14px"><strong>Ta collection ${esc(GAMES[S.game].label)} est vide</strong>Ouvre un set dans l'onglet Sets, puis touche une carte pour l'ajouter. Active « Ajout rapide » pour en ajouter plusieurs à la suite.</div>`;
      return;
    }
    if (!list.length) {
      box.innerHTML = `<div class="empty" style="margin-top:14px"><strong>Aucun résultat</strong>Aucune carte possédée ne correspond.</div>`;
      return;
    }
    const byRarity = S.colSort === "rarity";
    const game = S.game;
    const groups = new Map();
    for (const e of list) {
      const k = byRarity ? rarityOf(e) || "Rareté inconnue" : e.setName || "Autres";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    let order = [...groups.keys()];
    if (byRarity) order.sort((a, b) => rarityRank(game, a === "Rareté inconnue" ? "" : a) - rarityRank(game, b === "Rareté inconnue" ? "" : b) || a.localeCompare(b));
    let html = "";
    for (const name of order) {
      const items = groups.get(name);
      items.sort((a, b) =>
        byRarity
          ? String(a.setName).localeCompare(String(b.setName)) || String(a.no).localeCompare(String(b.no), "en", { numeric: true })
          : String(a.no).localeCompare(String(b.no), "en", { numeric: true })
      );
      html += `<p class="label">${esc(name)} · ${items.length}</p><div class="rows">${items
        .map((e) => {
          const v = entryValue(e);
          return rowHTML(e, `×${ownedQty(e)}${v ? `<br>${eur(v)}` : ""}`);
        })
        .join("")}</div>`;
    }
    box.innerHTML = html;
    bindRows();
  }

  /* ================= Binders (vitrines) ================= */

  // Binder multi-jeux de la page d'accueil, créé à la demande.
  function homeBinder() {
    let b = (S.col.binders || []).find((x) => x.id === "home");
    if (!b) {
      b = { id: "home", game: "all", name: "Ma vitrine", slots: Array(SLOTS).fill(null), layout: "4x3", created: Date.now() };
      S.col.binders.unshift(b);
      save();
    }
    return b;
  }
  // Binders proposés pour une carte d'un jeu : la vitrine d'accueil puis ceux du jeu.
  function bindersFor(game) {
    return [homeBinder(), ...bindersOf(game)];
  }
  const isDeco = (k) => typeof k === "string" && k.startsWith("deco:");
  const decoSrc = (k) => (S.col.decos || {})[k.slice(5)] || "";
  const cardSlots = (b) => b.slots.filter((k) => k && !isDeco(k));
  function purgeDecos() {
    const used = new Set();
    for (const b of S.col.binders) for (const k of b.slots) if (isDeco(k)) used.add(k.slice(5));
    for (const id of Object.keys(S.col.decos || {})) if (!used.has(id)) delete S.col.decos[id];
  }
  function coverOf(b) {
    for (const k of b.slots) {
      if (!k) continue;
      if (isDeco(k)) {
        if (decoSrc(k)) return decoSrc(k);
      } else if (S.col.cards[k]?.img) return S.col.cards[k].img;
    }
    return "";
  }
  const LAYOUTS = { "3x4": "3 × 4 (portrait)", "4x3": "4 × 3 (paysage)" };

  function renderBinders() {
    const game = S.game;
    const open = bindersOf(game).find((b) => b.id === S.binderOpen[game]);
    if (open) return renderBinder(open);
    const list = bindersOf(game);
    view.innerHTML = `
      <div class="view-head"><h2>Binders</h2></div>
      ${
        list.length
          ? `<div class="binder-list">${list
              .map((b) => {
                const n = cardSlots(b).length;
                const cover = coverOf(b);
                return `<button type="button" class="binder-tile" data-open="${esc(b.id)}">
                  <span class="cover">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>
                  <span class="t1">${esc(b.name)}</span>
                  <span class="t2">${plural(n, "carte")} · ${plural(b.slots.length / SLOTS, "page")} · ${b.layout === "4x3" ? "4 × 3" : "3 × 4"}</span>
                </button>`;
              })
              .join("")}</div>`
          : `<div class="empty"><strong>Aucun binder ${esc(GAMES[game].label)}</strong>Un binder est une vitrine pour tes plus belles cartes, avec des pages de 12 poches. Crée le premier ci-dessous. Pour mélanger les jeux, utilise ta vitrine sur l'Accueil.</div>`
      }
      <form class="new-binder" id="new-binder">
        <input id="nb-name" class="search" placeholder="Nom du nouveau binder" autocomplete="off" maxlength="40">
        <select id="nb-layout" class="search nb-layout" aria-label="Disposition">${Object.entries(LAYOUTS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
        <button type="submit" class="btn primary">Créer</button>
      </form>`;
    view.querySelectorAll("[data-open]").forEach((el) => {
      el.onclick = () => {
        S.binderOpen[game] = el.dataset.open;
        S.binderPage = 0;
        S.binderEdit = false;
        S.binderSel = null;
        render();
        window.scrollTo(0, 0);
      };
    });
    $("#new-binder").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const name = $("#nb-name").value.trim();
      if (!name) return $("#nb-name").focus();
      const b = { id: `b-${Date.now().toString(36)}`, game, name, slots: Array(SLOTS).fill(null), layout: $("#nb-layout").value, created: Date.now() };
      S.col.binders.push(b);
      save();
      S.binderOpen[game] = b.id;
      S.binderPage = 0;
      render();
      toast("Binder créé");
    });
  }

  function slotHTML(b, i) {
    const k = b.slots[i];
    const sel = S.binderEdit && S.binderSel === i;
    if (isDeco(k) && decoSrc(k)) {
      return `<button type="button" class="slot deco ${sel ? "sel" : ""}" data-slot="${i}" aria-label="Image décorative"><img src="${esc(decoSrc(k))}" alt="" decoding="async"></button>`;
    }
    const e = k && !isDeco(k) && S.col.cards[k];
    if (!e) {
      return `<button type="button" class="slot empty ${sel ? "sel" : ""}" data-slot="${i}" aria-label="Poche vide ${(i % SLOTS) + 1}"><span>+</span></button>`;
    }
    const qty = ownedQty(e);
    return `<button type="button" class="slot ${sel ? "sel" : ""} ${qty ? "" : "not-owned"}" data-slot="${i}" aria-label="${esc(e.name)}">
      ${e.img ? `<img src="${esc(e.img)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : `<span class="ph">${esc(e.name)}</span>`}
    </button>`;
  }

  function renderHome() {
    renderBinder(homeBinder());
  }

  function homeStatsHTML() {
    return `<p class="label">Mes collections</p><div class="home-stats">${Object.entries(GAMES)
      .map(([g, info]) => {
        const list = gameEntries(g);
        const owned = list.filter((e) => ownedQty(e) > 0).length;
        const wish = list.filter((e) => e.wish > 0).length;
        return `<button type="button" class="stat home-stat" data-goto="${g}" style="--game:${{ riftbound: "#d9b45a", yugioh: "#a985f0", pokemon: "#ff6a55" }[g]}">
          <span class="g">${esc(info.label)}</span><b>${owned}</b><span>${owned > 1 ? "cartes" : "carte"} · ${wish} en wishlist</span></button>`;
      })
      .join("")}</div>`;
  }

  function renderBinder(b) {
    const home = b.id === "home";
    const game = S.game;
    const pages = b.slots.length / SLOTS;
    if (S.binderPage >= pages) S.binderPage = pages - 1;
    const n = cardSlots(b).length;
    const lastEmpty = pages > 1 && b.slots.slice(-SLOTS).every((x) => !x);
    const layout = b.layout === "4x3" ? "4x3" : "3x4";
    view.innerHTML = `
      <div class="view-head">${home ? "" : `<button type="button" class="back" id="back" aria-label="Retour aux binders">${ICON.back}</button>`}
        <div style="min-width:0"><h2>${esc(b.name)}</h2><div class="sub">${home ? "Tous les jeux · " : ""}${plural(n, "carte")} · ${plural(pages, "page")}</div></div>
        <span class="spacer"></span>
        <button type="button" class="chip quick" id="b-edit" aria-pressed="${S.binderEdit}">${S.binderEdit ? "Terminer" : "Modifier"}</button>
      </div>
      <p class="note" id="b-hint">${
        S.binderEdit
          ? S.binderSel != null
            ? "Touche une autre poche pour y déplacer l'élément (échange si elle est occupée)."
            : "Touche une carte ou une image pour la sélectionner, puis une autre poche pour la déplacer."
          : `Touche une poche vide pour y ranger une carte${home ? " de n'importe quel jeu" : ""} ou une image. Glisse pour tourner les pages.`
      }</p>
      <div class="pages ${layout === "4x3" ? "wide" : ""}" id="pages">${Array.from({ length: pages }, (_, p) =>
        `<section class="page ${layout === "4x3" ? "l43" : ""}" aria-label="Page ${p + 1}">${Array.from({ length: SLOTS }, (_, j) => slotHTML(b, p * SLOTS + j)).join("")}</section>`
      ).join("")}</div>
      <div class="page-nav">
        <button type="button" class="back" id="pg-prev" aria-label="Page précédente">${ICON.back}</button>
        <span class="mono" id="pg-label">Page ${S.binderPage + 1} / ${pages}</span>
        <button type="button" class="back" id="pg-next" aria-label="Page suivante" style="transform:scaleX(-1)">${ICON.back}</button>
      </div>
      <div class="btn-row" id="b-sel-actions" ${S.binderEdit && S.binderSel != null ? "" : "hidden"} style="justify-content:center;margin-top:10px">
        <button type="button" class="btn danger" id="b-remove">Retirer du binder</button>
        <button type="button" class="btn" id="b-cancel">Annuler la sélection</button>
      </div>
      ${home ? homeStatsHTML() : ""}
      <p class="label">Gérer ${home ? "la vitrine" : "le binder"}</p>
      <div class="seg seg2" id="b-layout" role="group" aria-label="Disposition des pages">
        ${Object.entries(LAYOUTS).map(([v, l]) => `<button type="button" data-layout="${v}" aria-pressed="${layout === v}">${l}</button>`).join("")}
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button type="button" class="btn small" id="b-addpage">+ Ajouter une page</button>
        ${lastEmpty ? `<button type="button" class="btn small" id="b-delpage">Supprimer la dernière page</button>` : ""}
        <button type="button" class="btn small" id="b-rename">Renommer</button>
        ${home ? "" : `<button type="button" class="btn small danger" id="b-delete">Supprimer</button>`}
      </div>
      <form class="new-binder" id="b-rename-form" hidden style="margin-top:10px">
        <input id="b-rename-input" class="search" value="${esc(b.name)}" maxlength="40" autocomplete="off">
        <button type="submit" class="btn primary">OK</button>
      </form>
      ${
        home
          ? ""
          : `<div class="card-box" id="b-delete-confirm" hidden style="margin-top:10px">
        <p>Supprimer le binder « ${esc(b.name)} » ? Les cartes restent dans ta collection.</p>
        <div class="btn-row"><button type="button" class="btn danger" id="b-delete-yes">Supprimer</button><button type="button" class="btn" id="b-delete-no">Annuler</button></div>
      </div>`
      }`;

    const pagesEl = $("#pages");
    const goTo = (p, smooth = true) => {
      S.binderPage = Math.max(0, Math.min(pages - 1, p));
      pagesEl.scrollTo({ left: S.binderPage * pagesEl.clientWidth, behavior: smooth ? "smooth" : "instant" });
      $("#pg-label").textContent = `Page ${S.binderPage + 1} / ${pages}`;
    };
    requestAnimationFrame(() => goTo(S.binderPage, false));
    let scrollT = null;
    pagesEl.addEventListener("scroll", () => {
      clearTimeout(scrollT);
      scrollT = setTimeout(() => {
        S.binderPage = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth);
        $("#pg-label").textContent = `Page ${S.binderPage + 1} / ${pages}`;
      }, 60);
    });
    $("#pg-prev").onclick = () => goTo(S.binderPage - 1);
    $("#pg-next").onclick = () => goTo(S.binderPage + 1);
    $("#back")?.addEventListener("click", () => {
      S.binderOpen[game] = null;
      S.binderEdit = false;
      S.binderSel = null;
      render();
    });
    $("#b-edit").onclick = () => {
      S.binderEdit = !S.binderEdit;
      S.binderSel = null;
      renderBinder(b);
    };
    pagesEl.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-slot]");
      if (!el) return;
      const i = +el.dataset.slot;
      const k = b.slots[i];
      if (S.binderEdit) {
        if (S.binderSel == null) {
          if (k) S.binderSel = i;
        } else if (S.binderSel === i) {
          S.binderSel = null;
        } else {
          [b.slots[S.binderSel], b.slots[i]] = [b.slots[i], b.slots[S.binderSel]];
          S.binderSel = null;
          save();
        }
        return renderBinder(b);
      }
      if (isDeco(k) && decoSrc(k)) return openViewer(decoSrc(k), "Image décorative");
      if (k && S.col.cards[k]) {
        const e = S.col.cards[k];
        openSheet(e.game, cardFromEntry(e));
      } else {
        openPicker(b, i);
      }
    });
    $("#home-goto")?.remove();
    view.querySelectorAll("[data-goto]").forEach((el) => {
      el.onclick = () => {
        setGame(el.dataset.goto);
        setTab("collection");
      };
    });
    $("#b-layout").addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-layout]");
      if (!btn || btn.dataset.layout === layout) return;
      b.layout = btn.dataset.layout;
      save();
      renderBinder(b);
    });
    $("#b-remove").onclick = () => {
      const wasDeco = isDeco(b.slots[S.binderSel]);
      b.slots[S.binderSel] = null;
      S.binderSel = null;
      purgeDecos();
      for (const e of Object.values(S.col.cards)) cleanup(e);
      save();
      renderBinder(b);
      toast(wasDeco ? "Image retirée" : "Carte retirée du binder");
    };
    $("#b-cancel").onclick = () => {
      S.binderSel = null;
      renderBinder(b);
    };
    $("#b-addpage").onclick = () => {
      b.slots.push(...Array(SLOTS).fill(null));
      save();
      S.binderPage = b.slots.length / SLOTS - 1;
      renderBinder(b);
    };
    $("#b-delpage")?.addEventListener("click", () => {
      b.slots.splice(-SLOTS, SLOTS);
      save();
      renderBinder(b);
    });
    $("#b-rename").onclick = () => {
      $("#b-rename-form").hidden = false;
      $("#b-rename-input").focus();
    };
    $("#b-rename-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const name = $("#b-rename-input").value.trim();
      if (!name) return;
      b.name = name;
      save();
      renderBinder(b);
    });
    if (!home) {
      $("#b-delete").onclick = () => ($("#b-delete-confirm").hidden = false);
      $("#b-delete-no").onclick = () => ($("#b-delete-confirm").hidden = true);
      $("#b-delete-yes").onclick = () => {
        S.col.binders = S.col.binders.filter((x) => x !== b);
        purgeDecos();
        for (const e of Object.values(S.col.cards)) cleanup(e);
        save();
        S.binderOpen[game] = null;
        render();
        toast("Binder supprimé");
      };
    }
  }

  // Image de la galerie recadrée au format carte (63 × 88) et compressée.
  function cropToCard(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const W = 378, H = 528;
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const r = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
        canvas.getContext("2d").drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image"));
      };
      img.src = url;
    });
  }

  // Choisir une carte (ou une image) pour une poche vide.
  function openPicker(b, slot) {
    const multi = b.game === "all";
    let gameFilter = multi ? "" : b.game;
    S.sheet = { game: multi ? S.game : b.game, card: { id: "__picker" } };
    sheetEl.innerHTML = `
      <div class="grabber"></div>
      <button type="button" class="close" id="sheet-close" aria-label="Fermer">${ICON.close}</button>
      <h3 class="sheet-title">Remplir la poche</h3>
      <p class="note" style="margin:0 0 12px">Page ${Math.floor(slot / SLOTS) + 1}, poche ${(slot % SLOTS) + 1}.</p>
      <label class="btn deco-btn" for="pk-photo">Mettre une image décorative</label>
      <input id="pk-photo" type="file" accept="image/*" hidden>
      <p class="label">Ou une carte de ta collection ou de ta wishlist</p>
      ${
        multi
          ? `<div class="toolbar" id="pk-games" style="margin:0 0 8px"><button type="button" class="chip" data-g="" aria-pressed="true">Tous</button>${Object.entries(GAMES)
              .map(([g, i]) => `<button type="button" class="chip" data-g="${g}" aria-pressed="false">${esc(i.label)}</button>`)
              .join("")}</div>`
          : ""
      }
      <input id="pk-search" class="search" type="search" placeholder="Chercher une carte…" autocomplete="off">
      <div class="rows" id="pk-list" style="margin-top:10px"></div>`;
    showSheet();
    $("#sheet-close").onclick = hideSheet;
    const pool = Object.values(S.col.cards)
      .filter((e) => (multi || e.game === b.game) && (ownedQty(e) > 0 || e.wish || e.custom))
      .sort((x, y) => rarityRank(x.game, rarityOf(x)) - rarityRank(y.game, rarityOf(y)) || x.name.localeCompare(y.name));
    const draw = () => {
      const q = norm($("#pk-search").value.trim());
      const list = pool.filter((e) => (!gameFilter || e.game === gameFilter) && (!q || norm(`${e.name} ${e.no} ${e.setName}`).includes(q))).slice(0, 80);
      $("#pk-list").innerHTML = list.length
        ? list
            .map((e) => {
              const k = keyOf(e.game, e.id);
              const here = b.slots.includes(k);
              const tag = multi ? `${esc(GAMES[e.game].label)}<br>` : "";
              return rowHTML(e, `${tag}${here ? "déjà dedans" : ownedQty(e) ? `×${ownedQty(e)}` : "wishlist"}<br>${esc(rarityOf(e))}`).replace("data-entry=", "data-pick=");
            })
            .join("")
        : `<div class="empty"><strong>Aucune carte</strong>Ajoute d'abord des cartes à ta collection depuis l'onglet Sets.</div>`;
    };
    draw();
    $("#pk-search").addEventListener("input", draw);
    $("#pk-games")?.addEventListener("click", (ev) => {
      const c = ev.target.closest("[data-g]");
      if (!c) return;
      gameFilter = c.dataset.g;
      for (const x of document.querySelectorAll("#pk-games [data-g]")) x.setAttribute("aria-pressed", String(x === c));
      draw();
    });
    $("#pk-photo").addEventListener("change", async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        const data = await cropToCard(file);
        const id = Date.now().toString(36);
        S.col.decos = S.col.decos || {};
        S.col.decos[id] = data;
        b.slots[slot] = `deco:${id}`;
        save();
        hideSheet();
        renderBinder(b);
        toast("Image ajoutée");
      } catch {
        toast("Image illisible, essaie une autre photo");
      }
    });
    $("#pk-list").addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-pick]");
      if (!el) return;
      const k = el.dataset.pick;
      const old = b.slots.indexOf(k);
      if (old >= 0) b.slots[old] = null; // une carte n'occupe qu'une poche par binder
      b.slots[slot] = k;
      save();
      hideSheet();
      renderBinder(b);
    });
  }

  /* ================= Onglet Wishlist ================= */

  function renderWishlist() {
    const game = S.game;
    const wished = gameEntries(game).filter((e) => e.wish > 0);
    view.innerHTML = `
      <div class="view-head"><h2>Wishlist</h2></div>
      ${
        wished.length
          ? `<div class="btn-row" style="margin:-4px 0 6px"><button type="button" class="btn primary" id="share-wish">Partager ma wishlist</button><button type="button" class="btn" id="copy-wish">Copier en texte</button></div>
             <div class="toolbar" id="wish-sort"><span class="sub" style="color:var(--muted);font-size:13px">Trier par</span>
               <button type="button" class="chip" data-ws="prio" aria-pressed="${S.wishSort !== "price"}">Priorité</button>
               <button type="button" class="chip" data-ws="price" aria-pressed="${S.wishSort === "price"}">Prix max</button></div>`
          : ""
      }
      <div id="wish-list"></div>`;
    $("#wish-sort")?.addEventListener("click", (ev) => {
      const c = ev.target.closest("[data-ws]");
      if (!c) return;
      S.wishSort = c.dataset.ws;
      renderWishlist();
    });
    const box = $("#wish-list");
    if (!wished.length) {
      box.innerHTML = `<div class="empty"><strong>Ta wishlist ${esc(GAMES[game].label)} est vide</strong>Ouvre une carte et choisis une priorité dans « Wishlist ». Dans un set, le filtre « Manquantes » aide à repérer ce qu'il te manque.</div>`;
      return;
    }
    let html = "";
    const endOf = (e) => `${ownedQty(e) ? `déjà ×${ownedQty(e)}<br>` : ""}${e.maxPrice ? `max ${money(e.maxPrice)}<br>` : ""}<span class="prio p${e.wish}">${PRIOS[e.wish]}</span>`;
    if (S.wishSort === "price") {
      const items = [...wished].sort((a, b) => (b.maxPrice ?? -1) - (a.maxPrice ?? -1) || b.wish - a.wish || a.name.localeCompare(b.name));
      const priced = items.filter((e) => e.maxPrice).length;
      html = `<p class="label">${plural(priced, "carte")} avec un prix max${items.length > priced ? ` · ${items.length - priced} sans prix à la fin` : ""}</p><div class="rows">${items.map((e) => rowHTML(e, endOf(e))).join("")}</div>`;
    }
    for (const p of S.wishSort === "price" ? [] : PRIO_ORDER) {
      const items = wished.filter((e) => e.wish === p).sort((a, b) => a.setName.localeCompare(b.setName) || String(a.no).localeCompare(String(b.no), "en", { numeric: true }));
      if (!items.length) continue;
      html += `<p class="label">Priorité ${PRIOS[p].toLowerCase()} · ${items.length}</p><div class="rows">${items
        .map((e) => rowHTML(e, `${ownedQty(e) ? `déjà ×${ownedQty(e)}<br>` : ""}${e.maxPrice ? `max ${money(e.maxPrice)}<br>` : ""}<span class="prio p${p}">${PRIOS[p]}</span>`))
        .join("")}</div>`;
    }
    box.innerHTML = html;
    bindRows();
    $("#copy-wish").onclick = async () => {
      try {
        await navigator.clipboard.writeText(wishText(game, wished));
        toast("Liste copiée");
      } catch {
        toast("Copie impossible sur cet appareil");
      }
    };
    $("#share-wish").onclick = (ev) => shareWishlist(game, wished, ev.currentTarget);
  }

  function wishText(game, wished) {
    const lines = [`🃏 Ma wishlist ${GAMES[game].label}`];
    for (const p of PRIO_ORDER) {
      const items = wished.filter((e) => e.wish === p);
      if (!items.length) continue;
      lines.push("", `${p === 5 ? "🔥" : p === 4 ? "⭐" : "•"} ${PRIOS[p]} :`);
      for (const e of items) lines.push(`- ${e.name}${e.no ? ` (${e.no})` : ""}${e.setName ? ` — ${e.setName}` : ""}${e.maxPrice ? ` · max ${money(e.maxPrice)}` : ""}`);
    }
    return lines.join("\n");
  }

  /* ---------- Image de wishlist à partager ---------- */

  // Les images doivent autoriser le partage entre sites pour être dessinées dans l'image :
  // on passe par un proxy d'images public (wsrv.nl), sinon l'URL directe, sinon une case avec le nom.
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const t = setTimeout(() => resolve(null), 9000);
      img.onload = () => {
        clearTimeout(t);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(t);
        resolve(null);
      };
      img.src = src;
    });
  }
  async function cardImage(url) {
    if (!url) return null;
    if (url.startsWith("data:")) return loadImage(url);
    const proxied = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=300&h=420&fit=cover&output=jpg&q=82`;
    return (await loadImage(proxied)) || (await loadImage(url));
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fitText(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
    return t + "…";
  }

  async function wishImage(game, wished) {
    const MAX = 60;
    const W = 1080, PAD = 48, COLS = 5, GAP = 20;
    const cw = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
    const ch = cw * (88 / 63);
    const rowH = ch + 64;
    const accent = { riftbound: "#d9b45a", yugioh: "#a985f0", pokemon: "#ff6a55" }[game];
    const groups = PRIO_ORDER
      .map((p) => ({ p, items: wished.filter((e) => e.wish === p).sort((a, b) => a.setName.localeCompare(b.setName) || String(a.no).localeCompare(String(b.no), "en", { numeric: true })) }))
      .filter((g) => g.items.length);
    let left = MAX;
    for (const g of groups) {
      g.shown = g.items.slice(0, Math.max(0, left));
      left -= g.shown.length;
    }
    const hidden = wished.length - groups.reduce((n, g) => n + g.shown.length, 0);
    let H = PAD + 120;
    for (const g of groups) if (g.shown.length) H += 70 + Math.ceil(g.shown.length / COLS) * rowH;
    H += hidden ? 70 : 0;
    H += 60;

    const imgs = new Map();
    const all = groups.flatMap((g) => g.shown);
    await Promise.all(all.map(async (e) => imgs.set(e, await cardImage(e.img))));
    try { await document.fonts.ready; } catch {}

    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#11141b";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 12, H);

    const display = '"Chakra Petch", "Avenir Next Condensed", system-ui, sans-serif';
    const body = '"Figtree", -apple-system, system-ui, sans-serif';
    let y = PAD;
    ctx.fillStyle = accent;
    ctx.font = `700 26px ${display}`;
    ctx.fillText(GAMES[game].label.toUpperCase(), PAD, y + 26);
    ctx.fillStyle = "#ebedf3";
    ctx.font = `700 54px ${display}`;
    ctx.fillText("Ma wishlist", PAD, y + 86);
    ctx.fillStyle = "#9aa1b3";
    ctx.font = `500 24px ${body}`;
    const sub = `${wished.length} carte${wished.length > 1 ? "s" : ""} recherchée${wished.length > 1 ? "s" : ""} · ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
    ctx.textAlign = "right";
    ctx.fillText(sub, W - PAD, y + 84);
    ctx.textAlign = "left";
    y += 120;

    const prioColor = { 5: "#ff6f61", 4: accent, 3: accent, 2: "#9aa1b3", 1: "#6b7285" };
    for (const g of groups) {
      if (!g.shown.length) continue;
      y += 20;
      ctx.fillStyle = prioColor[g.p];
      roundRect(ctx, PAD, y, 14, 30, 4);
      ctx.fill();
      ctx.fillStyle = "#ebedf3";
      ctx.font = `700 30px ${display}`;
      ctx.fillText(`Priorité ${PRIOS[g.p].toLowerCase()}`, PAD + 28, y + 26);
      ctx.fillStyle = "#9aa1b3";
      ctx.font = `500 24px ${body}`;
      ctx.fillText(`${g.items.length}`, PAD + 28 + ctx.measureText(`Priorité ${PRIOS[g.p].toLowerCase()}`).width * 1.25 + 14, y + 26);
      y += 50;
      g.shown.forEach((e, i) => {
        const x = PAD + (i % COLS) * (cw + GAP);
        const yy = y + Math.floor(i / COLS) * rowH;
        ctx.save();
        roundRect(ctx, x, yy, cw, ch, 10);
        ctx.clip();
        ctx.fillStyle = "#232837";
        ctx.fillRect(x, yy, cw, ch);
        const im = imgs.get(e);
        if (im) {
          const r = Math.max(cw / im.width, ch / im.height);
          const dw = im.width * r, dh = im.height * r;
          ctx.drawImage(im, x + (cw - dw) / 2, yy, dw, dh);
        } else {
          ctx.fillStyle = "#9aa1b3";
          ctx.font = `600 20px ${body}`;
          ctx.textAlign = "center";
          const words = e.name.split(/\s+/);
          let line = "", ly = yy + ch / 2 - 20;
          for (const w of words) {
            if (ctx.measureText(line + " " + w).width > cw - 20 && line) {
              ctx.fillText(line, x + cw / 2, ly);
              line = w;
              ly += 26;
            } else line = line ? line + " " + w : w;
          }
          ctx.fillText(line, x + cw / 2, ly);
          ctx.textAlign = "left";
        }
        ctx.restore();
        if (e.maxPrice) {
          const label = `max ${money(e.maxPrice)}`;
          ctx.font = `700 21px ${body}`;
          const tw = ctx.measureText(label).width;
          const pw = tw + 22, ph = 34, px = x + cw - pw - 8, py = yy + ch - ph - 8;
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          roundRect(ctx, px + 1, py + 2, pw, ph, 17);
          ctx.fill();
          ctx.fillStyle = accent;
          roundRect(ctx, px, py, pw, ph, 17);
          ctx.fill();
          ctx.fillStyle = "#11141b";
          ctx.fillText(label, px + 11, py + 24);
        }
        ctx.fillStyle = "#ebedf3";
        ctx.font = `600 20px ${body}`;
        ctx.fillText(fitText(ctx, e.name, cw), x, yy + ch + 28);
        ctx.fillStyle = "#9aa1b3";
        ctx.font = `500 17px ${body}`;
        ctx.fillText(fitText(ctx, [e.no, rarityOf(e)].filter(Boolean).join(" · "), cw), x, yy + ch + 52);
      });
      y += Math.ceil(g.shown.length / COLS) * rowH;
    }
    if (hidden) {
      y += 30;
      ctx.fillStyle = "#9aa1b3";
      ctx.font = `600 26px ${body}`;
      ctx.fillText(`+ ${hidden} autre${hidden > 1 ? "s" : ""} carte${hidden > 1 ? "s" : ""} (liste complète en texte)`, PAD, y + 20);
      y += 40;
    }
    ctx.fillStyle = "#5d6475";
    ctx.font = `500 20px ${body}`;
    ctx.textAlign = "right";
    ctx.fillText("Binder", W - PAD, H - 26);
    return new Promise((res) => c.toBlob(res, "image/png"));
  }

  let sharing = false;
  async function shareWishlist(game, wished, btn) {
    if (sharing) return;
    sharing = true;
    const label = btn.textContent;
    btn.textContent = "Préparation de l'image…";
    btn.disabled = true;
    const text = wishText(game, wished);
    try {
      let blob = null;
      try {
        blob = await wishImage(game, wished);
      } catch (e) {
        console.error(e);
      }
      const file = blob && new File([blob], `wishlist-${game}.png`, { type: "image/png" });
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: `Ma wishlist ${GAMES[game].label}` });
      } else if (navigator.share) {
        await navigator.share({ text, title: `Ma wishlist ${GAMES[game].label}` });
      } else if (blob) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `wishlist-${game}.png`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } else {
        await navigator.clipboard.writeText(text);
        toast("Partage indisponible : liste copiée en texte");
      }
    } catch (e) {
      if (e?.name !== "AbortError") toast("Partage impossible, essaie « Copier en texte »");
    } finally {
      sharing = false;
      btn.textContent = label;
      btn.disabled = false;
    }
  }

  /* ================= Onglet Réglages ================= */

  function renderSettings() {
    const game = S.game;
    const g = GAMES[game];
    const d = defaults(game);
    const total = Object.values(S.col.cards);
    const updated = meta?.updated ? new Date(meta.updated).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "inconnue";
    const gm = meta?.games?.[game];
    view.innerHTML = `
      <div class="view-head"><h2>Réglages</h2></div>

      <p class="label">Ajout rapide · ${esc(g.label)}</p>
      <div class="card-box">
        <p>Ce qui est ajouté quand tu touches une carte en mode « Ajout rapide », et la valeur par défaut d'un nouvel exemplaire.</p>
        <div class="copy" style="margin:0;border:0;padding:0;background:none">
          <label>Langue<select id="def-lang">${options(g.langs, d.lang)}</select></label>
          <label>Version<select id="def-ver">${options(g.versions, d.ver)}</select></label>
          <label>État<select id="def-cond">${options(CONDITIONS, d.cond)}</select></label>
        </div>
      </div>

      <p class="label">Sauvegarde</p>
      <div class="card-box">
        <p>Ta collection est enregistrée sur cet iPhone uniquement (${total.length} fiche${total.length > 1 ? "s" : ""}, tous jeux confondus). Exporte une sauvegarde de temps en temps et range-la dans iCloud Drive.</p>
        <p><b>Dernière sauvegarde :</b> ${S.col.lastExport ? new Date(S.col.lastExport).toLocaleDateString("fr-FR", { dateStyle: "long" }) : "jamais"}</p>
        <div class="btn-row">
          <button type="button" class="btn primary" id="export">Exporter la sauvegarde</button>
          <label class="btn" for="import-file" style="display:inline-block">Importer une sauvegarde</label>
          <input id="import-file" type="file" accept="application/json,.json" hidden>
        </div>
        <div id="import-confirm" class="card-box" style="margin-top:10px" hidden></div>
      </div>

      <p class="label">À propos</p>
      <div class="card-box">
        <p><b>Binder · version ${APP_VERSION}</b> · ${esc(CHANGELOG[0].date)}${BUILD && !BUILD.includes("__") ? ` <span class="mono" style="font-size:11.5px">(publication ${esc(BUILD)})</span>` : ""}</p>
        <button type="button" class="btn small" id="show-news">Voir les nouveautés</button>
      </div>

      <p class="label">Partager l'app</p>
      <div class="card-box">
        <p>Envoie ce lien à tes amis : chacun aura sa propre app vide, sans accès à ta collection.</p>
        <p class="mono" style="color:var(--fg);user-select:all;-webkit-user-select:all;overflow-wrap:anywhere">${esc(APP_URL)}</p>
        <div class="btn-row"><button type="button" class="btn primary" id="share-app">Partager le lien</button><button type="button" class="btn" id="copy-app">Copier le lien</button></div>
      </div>

      <p class="label">Catalogue de cartes</p>
      <div class="card-box">
        <p>Mis à jour automatiquement chaque nuit. Dernière mise à jour : <b>${esc(updated)}</b>.${
          gm ? ` ${esc(g.label)} : ${gm.sets} sets, ${gm.cards.toLocaleString("fr-FR")} cartes${gm.source === "previous" ? " (source indisponible lors de la dernière mise à jour, données de la veille)" : ""}.` : ""
        }</p>
        <p class="note">Sources : Riftcodex (Riftbound, base communautaire non officielle), YGOPRODeck (Yu-Gi-Oh), TCGdex (Pokémon).</p>
      </div>`;

    for (const f of ["lang", "ver", "cond"]) {
      $(`#def-${f}`).onchange = (ev) => {
        S.col.defaults[game] = { ...(S.col.defaults[game] || {}), [f]: ev.target.value };
        save();
        toast("Réglage enregistré");
      };
    }
    $("#export").onclick = exportBackup;
    $("#show-news").onclick = () => showIntro(true);
    $("#copy-app").onclick = async () => {
      try {
        await navigator.clipboard.writeText(APP_URL);
        toast("Lien copié");
      } catch {
        toast("Copie impossible : sélectionne le lien au-dessus");
      }
    };
    $("#share-app").onclick = async () => {
      try {
        if (navigator.share) await navigator.share({ title: "Binder", text: "Mon app de suivi de collection Riftbound, Yu-Gi-Oh et Pokémon :", url: APP_URL });
        else {
          await navigator.clipboard.writeText(APP_URL);
          toast("Lien copié");
        }
      } catch (e) {
        if (e?.name !== "AbortError") toast("Partage impossible, utilise « Copier le lien »");
      }
    };
    $("#import-file").onchange = async (ev) => {
      const file = ev.target.files[0];
      ev.target.value = "";
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const cards = data?.collection?.cards || data?.cards;
        if (!cards || typeof cards !== "object") throw new Error();
        S.importData = data.collection || data;
        const n = Object.keys(cards).length;
        const box = $("#import-confirm");
        box.hidden = false;
        box.innerHTML = `<p>Le fichier contient ${n} fiche${n > 1 ? "s" : ""}. Que veux-tu faire ?</p>
          <div class="btn-row"><button type="button" class="btn primary" id="imp-merge">Fusionner avec l'existant</button>
          <button type="button" class="btn danger" id="imp-replace">Tout remplacer</button>
          <button type="button" class="btn" id="imp-cancel">Annuler</button></div>`;
        $("#imp-merge").onclick = () => doImport(false);
        $("#imp-replace").onclick = () => doImport(true);
        $("#imp-cancel").onclick = () => {
          S.importData = null;
          box.hidden = true;
        };
      } catch {
        toast("Ce fichier n'est pas une sauvegarde valide");
      }
    };
  }

  function doImport(replace) {
    const data = S.importData;
    if (!data) return;
    if (replace) S.col = { cards: {}, defaults: {}, binders: [], decos: {}, wishScale: 5, lastGame: S.game };
    migrateWish(data);
    Object.assign(S.col.cards, data.cards || {});
    S.col.decos = { ...(S.col.decos || {}), ...(data.decos || {}) };
    const known = new Set(S.col.binders.map((b) => b.id));
    for (const b of data.binders || []) if (!known.has(b.id)) S.col.binders.push(b);
    S.col.defaults = { ...S.col.defaults, ...(data.defaults || {}) };
    S.importData = null;
    save();
    Store.flush();
    toast(replace ? "Collection remplacée" : "Sauvegarde fusionnée");
    render();
  }

  function markExported() {
    S.col.lastExport = Date.now();
    S.col.backupSnooze = 0;
    save();
    drawBackupBanner();
    if (S.tab === "settings") renderSettings();
  }

  async function exportBackup() {
    await Store.flush();
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `classeur-tcg-${stamp}.json`;
    const blob = new Blob([JSON.stringify({ app: "classeur-tcg", version: 1, exported: new Date().toISOString(), collection: S.col })], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Sauvegarde Binder" });
        markExported();
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    markExported();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  /* ================= Toast ================= */

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 1800);
  }

  /* ================= Page de garde ================= */

  const LOGO = `<svg viewBox="0 0 120 120" aria-hidden="true">
    <g class="c1"><rect x="38" y="30" width="44" height="62" rx="6" fill="#7b4fc9"/><rect x="44" y="36" width="32" height="24" rx="3" fill="#4d2f86"/></g>
    <g class="c2"><rect x="38" y="30" width="44" height="62" rx="6" fill="#d63a2b"/><rect x="44" y="36" width="32" height="24" rx="3" fill="#8f2219"/></g>
    <g class="c0"><rect x="38" y="30" width="44" height="62" rx="6" fill="#d9b45a"/><rect x="44" y="36" width="32" height="26" rx="3" fill="#11141b"/>
      <rect x="44" y="68" width="32" height="4" rx="2" fill="#11141b"/><rect x="44" y="76" width="21" height="4" rx="2" fill="#11141b"/></g>
  </svg>`;

  function showIntro(manual = false) {
    if (document.getElementById("intro")) return;
    const fresh = !manual && !S.col.seenVersion && !Object.keys(S.col.cards).length;
    const [latest, ...older] = CHANGELOG;
    const el = document.createElement("div");
    el.className = "intro";
    el.id = "intro";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", fresh ? "Bienvenue" : "Nouveautés");
    el.innerHTML = `<div class="intro-inner">
      <div class="logo">${LOGO}</div>
      <h1 class="intro-title">Binder</h1>
      <p class="intro-sub">Riftbound · Yu-Gi-Oh · Pokémon</p>
      ${
        fresh
          ? `<div class="intro-card"><p class="label">Bienvenue</p>
              <ul><li>Choisis ton jeu en haut, ouvre un set et touche une carte pour l'ajouter.</li>
              <li>« Ajout rapide » et « Sélection » permettent d'en saisir beaucoup d'un coup.</li>
              <li>Ta collection reste sur ce téléphone : exporte une sauvegarde de temps en temps (Réglages).</li></ul></div>`
          : ""
      }
      <div class="intro-card">
        <p class="label">${manual || fresh ? "Dernière version" : "Nouveautés"} · version ${esc(latest.v)}</p>
        <p class="note" style="margin:0">${esc(latest.date)}</p>
        <ul>${latest.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>
      <details class="intro-older"><summary>Versions précédentes</summary>
        ${older.map((r) => `<div class="ver"><p class="label">Version ${esc(r.v)} · ${esc(r.date)}</p><ul>${r.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}
      </details>
      <button type="button" class="btn primary intro-go" id="intro-go">${manual ? "Fermer" : "C'est parti"}</button>
    </div>`;
    document.body.appendChild(el);
    document.documentElement.style.overflow = "hidden";
    el.querySelector("#intro-go").focus({ preventScroll: true });
    el.querySelector("#intro-go").onclick = () => {
      S.col.seenVersion = APP_VERSION;
      save();
      el.classList.add("out");
      document.documentElement.style.overflow = S.sheet ? "hidden" : "";
      setTimeout(() => el.remove(), 210);
    };
  }

  /* ================= Démarrage ================= */

  // iOS garde la page d'accueil en cache jusqu'à 10 min après une publication :
  // on compare le numéro de version publié avec celui en cours et on recharge si besoin.
  const BUILD = document.querySelector('meta[name="build"]')?.content || "";
  async function checkUpdate() {
    if (!BUILD || BUILD.includes("__")) return;
    try {
      const res = await fetch(`index.html?check=${Date.now()}`, { cache: "no-store" });
      const html = await res.text();
      const live = html.match(/<meta name="build" content="([^"]+)"/)?.[1];
      if (live && live !== BUILD && !live.includes("__")) {
        await Store.flush();
        location.replace(`./?v=${encodeURIComponent(live)}`);
      }
    } catch {}
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !S.sheet) checkUpdate();
  });

  (async function start() {
    checkUpdate();
    const saved = await Store.get("collection");
    if (saved && saved.cards) S.col = { cards: {}, defaults: {}, binders: [], ...saved };
    if (!Array.isArray(S.col.binders)) S.col.binders = [];
    if (!S.col.decos) S.col.decos = {};
    if (S.col.wishScale !== 5) {
      migrateWish(S.col);
      save();
    }
    Store.persist();
    fetchJSON("data/meta.json").then((m) => (meta = m)).catch(() => {});
    setGame(GAMES[S.col.lastGame] ? S.col.lastGame : "riftbound");
    if (S.col.seenVersion !== APP_VERSION) showIntro();
    // Remet à niveau les fiches Riftbound existantes (raretés et versions corrigées).
    const rbSets = [...new Set(Object.values(S.col.cards).filter((e) => e.game === "riftbound" && !e.custom && e.setId).map((e) => e.setId))];
    Promise.all(rbSets.map((id) => loadSet("riftbound", id).catch(() => null))).then(() => {
      if (S.tab === "collection" || S.tab === "wishlist") refreshKeepingScroll();
    });
  })();
})();
