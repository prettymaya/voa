const STORAGE_KEY = "voa-shadow-hub-db-v1";

const state = {
  db: loadDb(),
  visible: 100,
  level: "all",
};

const els = {
  todayMinutes: document.querySelector("#todayMinutes"),
  totalMinutes: document.querySelector("#totalMinutes"),
  shadowedCount: document.querySelector("#shadowedCount"),
  resetToday: document.querySelector("#resetToday"),
  exportDb: document.querySelector("#exportDb"),
  importDb: document.querySelector("#importDb"),
  catalogMeta: document.querySelector("#catalogMeta"),
  levelTabs: document.querySelector("#levelTabs"),
  search: document.querySelector("#search"),
  sectionFilter: document.querySelector("#sectionFilter"),
  typeFilter: document.querySelector("#typeFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  resultCount: document.querySelector("#resultCount"),
  showMore: document.querySelector("#showMore"),
  grid: document.querySelector("#grid"),
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const db = JSON.parse(raw);
    return {
      items: db.items || {},
      days: db.days || {},
      settings: db.settings || {},
      updatedAt: db.updatedAt || null,
    };
  } catch {
    return {
      items: {},
      days: {},
      settings: {},
      updatedAt: null,
    };
  }
}

function saveDb() {
  state.db.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
}

function minutesLabel(minutes) {
  const total = Math.round(minutes || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} dk`;
  return `${h} sa ${m} dk`;
}

function parseDurationMinutes(duration) {
  const value = String(duration || "").trim();
  if (!value) return 0;

  const iso = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (iso) {
    const hours = Number(iso[1] || 0);
    const minutes = Number(iso[2] || 0);
    const seconds = Number(iso[3] || 0);
    return (hours * 60) + minutes + (seconds / 60);
  }

  const clock = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) {
    const hours = Number(clock[1] || 0);
    const minutes = Number(clock[2] || 0);
    const seconds = Number(clock[3] || 0);
    return (hours * 60) + minutes + (seconds / 60);
  }

  const numeric = Number(value.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : 0;
}

function durationLabel(duration) {
  const minutes = parseDurationMinutes(duration);
  if (!minutes) return "";
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h) return `${h} sa ${m} dk`;
  if (m && s) return `${m} dk ${s} sn`;
  if (m) return `${m} dk`;
  return `${s} sn`;
}

function itemState(id) {
  if (!state.db.items[id]) {
    state.db.items[id] = {
      shadowed: false,
      minutes: 0,
      count: 0,
      updatedAt: null,
    };
  }
  return state.db.items[id];
}

function addMinutes(item, minutes) {
  const record = itemState(item.id);
  const date = todayKey();
  record.minutes = (record.minutes || 0) + minutes;
  record.shadowed = true;
  record.count = (record.count || 0) + 1;
  record.updatedAt = new Date().toISOString();
  state.db.days[date] = (state.db.days[date] || 0) + minutes;
  saveDb();
  render();
}

function toggleShadowed(item) {
  const record = itemState(item.id);
  record.shadowed = !record.shadowed;
  record.updatedAt = new Date().toISOString();
  if (record.shadowed && !record.count) record.count = 1;
  saveDb();
  render();
}

function resetToday() {
  state.db.days[todayKey()] = 0;
  saveDb();
  renderStats();
}

function catalogItems() {
  return (window.VOA_CATALOG && window.VOA_CATALOG.items) || [];
}

async function refreshCatalogFromJson() {
  if (!window.fetch) return;
  try {
    const response = await fetch(`./voa_catalog_building.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const incoming = await response.json();
    if ((incoming.items || []).length > catalogItems().length) {
      window.VOA_CATALOG = incoming;
      setupFilters();
      render();
    }
  } catch {
    // The stable bundled catalog is enough when the building file is not available.
  }
}

function itemLevel(item) {
  const value = String(item.level || "").toLowerCase();
  if (value === "beginner" || value === "beginning") return "Beginning";
  if (value === "intermediate") return "Intermediate";
  if (value === "advanced") return "Advanced";
  return item.level || "VOA";
}

function setupFilters() {
  const current = els.sectionFilter.value || "all";
  const levelItems = state.level === "all"
    ? catalogItems()
    : catalogItems().filter(item => itemLevel(item) === state.level);
  const sections = ["all", ...new Set(levelItems.map(item => item.section).filter(Boolean).sort())];
  els.sectionFilter.innerHTML = sections.map(section => {
    const label = section === "all" ? "Tüm seriler" : section;
    return `<option value="${escapeHtml(section)}">${escapeHtml(label)}</option>`;
  }).join("");
  els.sectionFilter.value = sections.includes(current) ? current : "all";
}

function filteredItems() {
  const q = els.search.value.trim().toLowerCase();
  const section = els.sectionFilter.value;
  const type = els.typeFilter.value;
  const status = els.statusFilter.value;

  return catalogItems().filter(item => {
    const record = state.db.items[item.id];
    const level = itemLevel(item);
    const haystack = `${item.title} ${item.description} ${item.section} ${level}`.toLowerCase();
    if (state.level !== "all" && level !== state.level) return false;
    if (q && !haystack.includes(q)) return false;
    if (section !== "all" && item.section !== section) return false;
    if (type === "media" && item.type !== "video" && item.type !== "audio") return false;
    if (type !== "all" && type !== "media" && item.type !== type) return false;
    if (status === "shadowed" && !record?.shadowed) return false;
    if (status === "unshadowed" && record?.shadowed) return false;
    return true;
  });
}

function renderStats() {
  const today = state.db.days[todayKey()] || 0;
  const itemRecords = Object.values(state.db.items);
  const total = itemRecords.reduce((sum, item) => sum + (item.minutes || 0), 0);
  const shadowed = itemRecords.filter(item => item.shadowed).length;

  els.todayMinutes.textContent = minutesLabel(today);
  els.totalMinutes.textContent = minutesLabel(total);
  els.shadowedCount.textContent = String(shadowed);
}

function render() {
  renderStats();
  const items = filteredItems();
  const visibleItems = items.slice(0, state.visible);
  const catalog = window.VOA_CATALOG || {};
  const total = catalogItems().length;
  els.resultCount.textContent = `${visibleItems.length}/${items.length} filtre sonucu · toplam ${total}`;
  els.showMore.hidden = state.visible >= items.length;
  els.catalogMeta.textContent = `${catalogItems().length} içerik · ${catalog.generatedAt ? new Date(catalog.generatedAt).toLocaleString("tr-TR") : "indeks bekleniyor"}`;
  els.grid.innerHTML = visibleItems.length ? visibleItems.map(renderItem).join("") : renderEmptyState();
}

function renderEmptyState() {
  const hasLevel = state.level === "all" || catalogItems().some(item => itemLevel(item) === state.level);
  const title = hasLevel ? "Bu filtrede içerik yok." : `${state.level} henüz taranıyor.`;
  const detail = hasLevel
    ? "Arama, medya tipi veya durum filtresini gevşetmeyi dene."
    : "Crawler arka planda devam ediyor; bu seviye geldiğinde liste otomatik dolacak.";
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
}

function renderItem(item) {
  const record = state.db.items[item.id] || {};
  const image = item.image || "";
  const done = !!record.shadowed;
  const description = (item.description || item.transcriptPreview || "").slice(0, 170);
  const date = (item.published || "").slice(0, 10);
  const mediaType = item.type || "article";
  const level = itemLevel(item);
  const itemDuration = durationLabel(item.duration);
  const itemMinutes = parseDurationMinutes(item.duration);

  return `
    <article class="item" data-card-id="${escapeAttr(item.id)}">
      <div class="thumb">
        ${image ? `<img src="${escapeAttr(image)}" loading="lazy" alt="">` : ""}
      </div>
      <div>
        <div class="actions">
          <span class="tag">${escapeHtml(level)}</span>
          <span class="tag ${escapeAttr(mediaType)}">${escapeHtml(mediaType)}</span>
          ${itemDuration ? `<span class="tag duration">${escapeHtml(itemDuration)}</span>` : ""}
          ${done ? `<span class="tag done">Shadowed</span>` : ""}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class="meta">${escapeHtml(item.section || "")}${date ? ` · ${escapeHtml(date)}` : ""}${itemDuration ? ` · süre: ${escapeHtml(itemDuration)}` : ""}</div>
        ${description ? `<p class="summary">${escapeHtml(description)}</p>` : ""}
        <div class="actions">
          <a class="primary" href="${escapeAttr(item.url)}" target="_blank" rel="noopener">VOA'da aç</a>
          <button class="ghost" data-action="toggle" data-id="${escapeAttr(item.id)}">${done ? "Shadowed kaldır" : "Shadowed"}</button>
        </div>
        <div class="quickMinutes">
          ${itemMinutes ? `<button class="mini durationAdd" data-action="min" data-id="${escapeAttr(item.id)}" data-min="${escapeAttr(itemMinutes)}">+Süre (${escapeHtml(itemDuration)})</button>` : ""}
          <button class="mini" data-action="min" data-id="${escapeAttr(item.id)}" data-min="5">+5 dk</button>
          <button class="mini" data-action="min" data-id="${escapeAttr(item.id)}" data-min="10">+10 dk</button>
          <button class="mini" data-action="min" data-id="${escapeAttr(item.id)}" data-min="20">+20 dk</button>
          <button class="mini" data-action="min" data-id="${escapeAttr(item.id)}" data-min="30">+30 dk</button>
        </div>
        <div class="customMinutes">
          <input type="number" inputmode="decimal" min="0" step="0.5" placeholder="Özel dk">
          <button class="mini" data-action="custom-min" data-id="${escapeAttr(item.id)}">Ekle</button>
        </div>
        <div class="cardStats">
          <span>${minutesLabel(record.minutes || 0)}</span>
          <span>${record.count || 0} tekrar</span>
        </div>
      </div>
    </article>
  `;
}

function exportDb() {
  const blob = new Blob([JSON.stringify(state.db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "voa-shadow-db-latest.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importDb(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      state.db.items = { ...state.db.items, ...(incoming.items || {}) };
      state.db.days = { ...state.db.days, ...(incoming.days || {}) };
      state.db.settings = { ...state.db.settings, ...(incoming.settings || {}) };
      saveDb();
      render();
    } catch {
      alert("DB JSON okunamadı.");
    }
  };
  reader.readAsText(file);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function bindEvents() {
  els.levelTabs.addEventListener("click", event => {
    const button = event.target.closest("button[data-level]");
    if (!button) return;
    state.level = button.dataset.level;
    state.visible = 100;
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === button));
    setupFilters();
    render();
  });

  els.search.addEventListener("input", () => {
    state.visible = 100;
    render();
  });

  [els.sectionFilter, els.typeFilter, els.statusFilter].forEach(el => {
    el.addEventListener("change", () => {
      state.visible = 100;
      render();
    });
  });

  els.showMore.addEventListener("click", () => {
    state.visible += 100;
    render();
  });

  els.resetToday.addEventListener("click", resetToday);
  els.exportDb.addEventListener("click", exportDb);
  els.importDb.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) importDb(file);
    event.target.value = "";
  });

  els.grid.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    const item = catalogItems().find(entry => entry.id === id);
    if (!item) return;
    if (button.dataset.action === "toggle") toggleShadowed(item);
    if (button.dataset.action === "min") addMinutes(item, Number(button.dataset.min || 0));
    if (button.dataset.action === "custom-min") {
      const input = button.closest("[data-card-id]")?.querySelector(".customMinutes input");
      const minutes = Number(String(input?.value || "").replace(",", "."));
      if (!Number.isFinite(minutes) || minutes <= 0) {
        input?.focus();
        return;
      }
      addMinutes(item, minutes);
    }
  });
}

setupFilters();
bindEvents();
render();
refreshCatalogFromJson();
