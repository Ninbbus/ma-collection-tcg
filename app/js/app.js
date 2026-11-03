// Classeur TCG : suivi de collection Riftbound, Yu-Gi-Oh et Pokémon.
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
  const PRIOS = { 3: "Haute", 2: "Moyenne", 1: "Basse" };
  const SET_PAGE = 60;

  /* ================= État ================= */

  const S = {
    game: "riftbound",
    tab: "sets",
    route: {}, // route par jeu dans l'onglet Sets : { setId } ou {}
    filter: "all",
    quick: false,
    setQuery: "",
    listQuery: "",
    shownSets: SET_PAGE,
    sheet: null, // carte ouverte
    importData: null,
    col: { cards: {}, defaults: {}, lastGame: "riftbound" },
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

  const ICON = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
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
    return data;
  }
  async function loadSearch(game) {
    const c = cat(game);
    if (!c.search) c.search = fetchJSON(`data/${game}/search.json`).catch(() => []);
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
        copies: [],
        wish: 0,
        custom: !!card.custom,
        added: Date.now(),
      };
    }
    return e;
  }
  function cleanup(e) {
    e.copies = e.copies.filter((c) => c.qty > 0);
    if (!e.copies.length && !e.wish && !e.custom) delete S.col.cards[keyOf(e.game, e.id)];
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

  /* ================= Navigation ================= */

  function setGame(game) {
    if (!GAMES[game]) return;
    S.game = game;
    S.col.lastGame = game;
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
    S.tab = tab;
    S.listQuery = "";
    for (const b of document.querySelectorAll("#tabbar button")) {
      if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    render();
    window.scrollTo(0, 0);
  }
  function openSet(setId) {
    S.route[S.game] = { setId };
    S.filter = "all";
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

  function render() {
    const fn = { sets: renderSetsTab, collection: renderCollection, wishlist: renderWishlist, settings: renderSettings }[S.tab];
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
      .map(([id, name, setId, no]) => {
        const e = entry(game, id);
        const qty = ownedQty(e);
        return `<button type="button" class="row" data-hit="${esc(id)}" data-hit-set="${esc(setId)}">
          <span class="thumb">${e?.img ? `<img src="${esc(e.img)}" alt="" loading="lazy">` : ""}</span>
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

  /* ================= Vue d'un set (classeur) ================= */

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
      </div>
      <p class="note" id="quick-note" ${S.quick ? "" : "hidden"}>Ajout rapide : un appui ajoute un exemplaire ${esc(d.lang)} · ${esc(d.ver)} · ${esc(d.cond)}. Appui long pour ouvrir la fiche.</p>
      <div class="binder" id="binder"></div>
      <div class="btn-row" style="margin-top:18px"><button type="button" class="btn" id="add-custom">+ Ajouter une carte hors base</button></div>
      <p class="note">Pour les cartes absentes du catalogue, comme certaines exclusivités chinoises, avec ta propre photo.</p>`;

    $("#back").onclick = () => {
      S.route[game] = {};
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
    $("#quick").onclick = (ev) => {
      S.quick = !S.quick;
      ev.currentTarget.setAttribute("aria-pressed", String(S.quick));
      $("#quick-note").hidden = !S.quick;
    };
    $("#add-custom").onclick = () => openCustomForm(game, set);
    drawBinder(game, set, all);
    bindPress($("#binder"), game, set);
  }

  function drawBinder(game, set, all) {
    const q = norm(S.listQuery.trim());
    const list = all.filter((c) => {
      const e = entry(game, c.id);
      const qty = ownedQty(e);
      if (S.filter === "owned" && !qty) return false;
      if (S.filter === "missing" && qty) return false;
      if (S.filter === "wish" && !e?.wish) return false;
      if (q && !norm(`${c.name} ${c.no}`).includes(q)) return false;
      return true;
    });
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
    return `<button type="button" class="pocket ${qty ? "" : "missing"}" data-card="${esc(c.id)}" aria-label="${esc(c.name)} ${esc(c.no)}${qty ? `, ${qty} possédée(s)` : ", manquante"}">
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
    backdrop.hidden = false;
    sheetEl.hidden = false;
    document.documentElement.style.overflow = "hidden";
  }
  function closeSheet() {
    if (!S.sheet) return;
    const { game, card } = S.sheet;
    const e = entry(game, card.id);
    if (e) cleanup(e);
    save();
    S.sheet = null;
    sheetEl.hidden = true;
    backdrop.hidden = true;
    document.documentElement.style.overflow = "";
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
        <div class="art">${img ? `<img src="${esc(img)}" alt="${esc(card.name)}">` : ""}</div>
        <div style="min-width:0">
          <h3>${esc(card.name)}</h3>
          <div class="facts">
            ${card.no ? `<span>N° <span class="mono">${esc(card.no)}</span></span>` : ""}
            ${card.rar ? `<span>${esc(card.rar)}</span>` : ""}
            ${card.setName ? `<span>${esc(card.setName)}</span>` : ""}
            ${card.custom ? `<span>Carte hors base</span>` : ""}
            <span>${qty ? `<b style="color:var(--owned)">${qty} possédée${qty > 1 ? "s" : ""}</b>` : "Pas encore possédée"}${value ? ` · ${eur(value)}` : ""}</span>
          </div>
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
        <div class="seg" id="wish">
          <button type="button" data-w="0" aria-pressed="${!e?.wish}">Non</button>
          <button type="button" data-w="1" aria-pressed="${e?.wish === 1}">Basse</button>
          <button type="button" data-w="2" aria-pressed="${e?.wish === 2}">Moyenne</button>
          <button type="button" class="p3" data-w="3" aria-pressed="${e?.wish === 3}">Haute</button>
        </div>
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
      else if (entry(game, card.id)) entry(game, card.id).wish = 0;
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
      const card = { id: `custom-${Date.now().toString(36)}`, no: $("#cf-no").value.trim(), name, img, rar: "", custom: true };
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
        if (e) openSheet(e.game, { id: e.id, name: e.name, no: e.no, img: e.img, rar: e.rar, setId: e.setId, setName: e.setName, custom: e.custom });
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
      <div id="col-list"></div>`;
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
    const groups = new Map();
    for (const e of list) {
      const k = e.setName || "Autres";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    let html = "";
    for (const [name, items] of groups) {
      items.sort((a, b) => String(a.no).localeCompare(String(b.no), "en", { numeric: true }));
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

  /* ================= Onglet Wishlist ================= */

  function renderWishlist() {
    const game = S.game;
    const wished = gameEntries(game).filter((e) => e.wish > 0);
    view.innerHTML = `
      <div class="view-head"><h2>Wishlist</h2><span class="spacer"></span>${wished.length ? `<button type="button" class="btn small" id="copy-wish">Copier la liste</button>` : ""}</div>
      <div id="wish-list"></div>`;
    const box = $("#wish-list");
    if (!wished.length) {
      box.innerHTML = `<div class="empty"><strong>Ta wishlist ${esc(GAMES[game].label)} est vide</strong>Ouvre une carte et choisis une priorité dans « Wishlist ». Dans un set, le filtre « Manquantes » aide à repérer ce qu'il te manque.</div>`;
      return;
    }
    let html = "";
    for (const p of [3, 2, 1]) {
      const items = wished.filter((e) => e.wish === p).sort((a, b) => a.setName.localeCompare(b.setName) || String(a.no).localeCompare(String(b.no), "en", { numeric: true }));
      if (!items.length) continue;
      html += `<p class="label">Priorité ${PRIOS[p].toLowerCase()} · ${items.length}</p><div class="rows">${items
        .map((e) => rowHTML(e, `${ownedQty(e) ? `déjà ×${ownedQty(e)}<br>` : ""}<span class="prio p${p}">${PRIOS[p]}</span>`))
        .join("")}</div>`;
    }
    box.innerHTML = html;
    bindRows();
    $("#copy-wish").onclick = async () => {
      const lines = [`Wishlist ${GAMES[game].label}`];
      for (const p of [3, 2, 1]) {
        const items = wished.filter((e) => e.wish === p);
        if (!items.length) continue;
        lines.push("", `${PRIOS[p]} :`);
        for (const e of items) lines.push(`- ${e.name}${e.no ? ` (${e.no})` : ""}${e.setName ? ` — ${e.setName}` : ""}`);
      }
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        toast("Liste copiée");
      } catch {
        toast("Copie impossible sur cet appareil");
      }
    };
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
        <div class="btn-row">
          <button type="button" class="btn primary" id="export">Exporter la sauvegarde</button>
          <label class="btn" for="import-file" style="display:inline-block">Importer une sauvegarde</label>
          <input id="import-file" type="file" accept="application/json,.json" hidden>
        </div>
        <div id="import-confirm" class="card-box" style="margin-top:10px" hidden></div>
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
    if (replace) S.col = { cards: {}, defaults: {}, lastGame: S.game };
    Object.assign(S.col.cards, data.cards || {});
    S.col.defaults = { ...S.col.defaults, ...(data.defaults || {}) };
    S.importData = null;
    save();
    Store.flush();
    toast(replace ? "Collection remplacée" : "Sauvegarde fusionnée");
    render();
  }

  async function exportBackup() {
    await Store.flush();
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `classeur-tcg-${stamp}.json`;
    const blob = new Blob([JSON.stringify({ app: "classeur-tcg", version: 1, exported: new Date().toISOString(), collection: S.col })], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Sauvegarde Classeur TCG" });
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

  /* ================= Démarrage ================= */

  (async function start() {
    const saved = await Store.get("collection");
    if (saved && saved.cards) S.col = { cards: {}, defaults: {}, ...saved };
    Store.persist();
    fetchJSON("data/meta.json").then((m) => (meta = m)).catch(() => {});
    setGame(GAMES[S.col.lastGame] ? S.col.lastGame : "riftbound");
  })();
})();
