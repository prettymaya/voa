const STORAGE_KEY = "voa-shadow-hub-db-v1";
const CATEGORY_ORDER = [
  "all",
  "Beginning",
  "Intermediate",
  "Advanced",
  "American English Podcast",
  "All Ears English",
  "Learn English Podcast",
  "The Moth",
  "Open to Debate",
];

const state = {
  db: loadDb(),
  visible: 100,
  level: "all",
  playerId: null,
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

function playbackRate() {
  const rate = Number(state.db.settings.playbackRate || 1);
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function effectiveMinutes(minutes) {
  const rate = playbackRate();
  return minutes && rate ? minutes / rate : minutes;
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

function parseDurationSeconds(duration) {
  return Math.round(parseDurationMinutes(duration) * 60);
}

function secondsLabel(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function durationLabel(duration) {
  return durationMinutesLabel(parseDurationMinutes(duration));
}

function durationMinutesLabel(minutes) {
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
      partialSeconds: 0,
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

function savePartialProgress(item, seconds) {
  const record = itemState(item.id);
  const previous = Number(record.partialSeconds || 0);
  const next = Math.max(previous, Math.floor(Number(seconds || 0)));
  if (!Number.isFinite(next) || next <= 0) return;

  const itemTotalSeconds = parseDurationSeconds(item.duration);
  const deltaSeconds = Math.max(0, next - previous);
  record.partialSeconds = next;
  record.updatedAt = new Date().toISOString();

  if (deltaSeconds > 0) {
    const date = todayKey();
    const minutes = effectiveMinutes(deltaSeconds / 60);
    record.minutes = (record.minutes || 0) + minutes;
    state.db.days[date] = (state.db.days[date] || 0) + minutes;
  }

  if (itemTotalSeconds && next >= itemTotalSeconds * 0.95) {
    record.shadowed = true;
    if (!record.count) record.count = 1;
  }

  saveDb();
  render();
}

function clearPartialProgress(item) {
  const record = itemState(item.id);
  record.partialSeconds = 0;
  record.updatedAt = new Date().toISOString();
  saveDb();
  render();
}

function toggleShadowed(item) {
  const record = itemState(item.id);
  record.shadowed = !record.shadowed;
  if (record.shadowed) {
    const itemTotalSeconds = parseDurationSeconds(item.duration);
    if (itemTotalSeconds) record.partialSeconds = Math.max(record.partialSeconds || 0, itemTotalSeconds);
  }
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
  return [
    ...((window.VOA_CATALOG && window.VOA_CATALOG.items) || []),
    ...((window.EXTRA_CATALOG && window.EXTRA_CATALOG.items) || []),
  ];
}

async function refreshCatalogFromJson() {
  if (!window.fetch) return;
  try {
    const response = await fetch(`./voa_catalog_building.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const incoming = await response.json();
    const currentVoaCount = ((window.VOA_CATALOG && window.VOA_CATALOG.items) || []).length;
    if ((incoming.items || []).length > currentVoaCount) {
      window.VOA_CATALOG = incoming;
      setupCategoryTabs();
      setupFilters();
      render();
    }
  } catch {
    // The stable bundled catalog is enough when the building file is not available.
  }
}

function itemLevel(item) {
  if (item.source && item.source !== "VOA") return item.source;
  const value = String(item.level || "").toLowerCase();
  if (value === "beginner" || value === "beginning") return "Beginning";
  if (value === "intermediate") return "Intermediate";
  if (value === "advanced") return "Advanced";
  return item.level || "VOA";
}

function setupCategoryTabs() {
  const available = new Set(catalogItems().map(itemLevel));
  const categories = CATEGORY_ORDER.filter(category => category === "all" || available.has(category));
  for (const category of [...available].sort()) {
    if (!categories.includes(category)) categories.push(category);
  }
  els.levelTabs.innerHTML = categories.map(category => {
    const label = category === "all" ? "All" : category;
    return `<button class="tab ${state.level === category ? "active" : ""}" data-level="${escapeAttr(category)}">${escapeHtml(label)}</button>`;
  }).join("");
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
    const haystack = `${item.title} ${item.description} ${item.section} ${level} ${item.source || ""} ${item.accent || ""}`.toLowerCase();
    if (state.level !== "all" && level !== state.level) return false;
    if (q && !haystack.includes(q)) return false;
    if (section !== "all" && item.section !== section) return false;
    if (type === "media" && item.type !== "video" && item.type !== "audio") return false;
    if (type !== "all" && type !== "media" && item.type !== type) return false;
    if (status === "shadowed" && !record?.shadowed) return false;
    if (status === "partial" && (record?.shadowed || !(record?.partialSeconds > 0))) return false;
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
  const voaCount = ((window.VOA_CATALOG && window.VOA_CATALOG.items) || []).length;
  const extraCount = ((window.EXTRA_CATALOG && window.EXTRA_CATALOG.items) || []).length;
  const total = voaCount + extraCount;
  els.resultCount.textContent = `${visibleItems.length}/${items.length} filtre sonucu · toplam ${total}`;
  els.showMore.hidden = state.visible >= items.length;
  els.catalogMeta.textContent = `${voaCount} VOA · ${extraCount} podcast · toplam ${total}`;
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
  const source = item.source || "VOA";
  const itemDuration = durationLabel(item.duration);
  const itemMinutes = parseDurationMinutes(item.duration);
  const itemSeconds = parseDurationSeconds(item.duration);
  const adjustedMinutes = effectiveMinutes(itemMinutes);
  const adjustedDuration = durationMinutesLabel(adjustedMinutes);
  const speedLabel = playbackRate() === 1 ? "" : ` @ ${playbackRate().toFixed(1)}x`;
  const canPlayInside = !!item.mediaUrl && (mediaType === "audio" || mediaType === "video");
  const isPlayerOpen = state.playerId === item.id && canPlayInside;
  const partialSeconds = Number(record.partialSeconds || 0);
  const partialPct = itemSeconds ? Math.min(100, Math.round((partialSeconds / itemSeconds) * 100)) : 0;
  const isPartial = !done && partialSeconds > 0;

  return `
    <article class="item" data-card-id="${escapeAttr(item.id)}">
      <div class="thumb">
        ${image ? `<img src="${escapeAttr(image)}" loading="lazy" alt="">` : ""}
      </div>
      <div>
        <div class="actions">
          <span class="tag">${escapeHtml(level)}</span>
          <span class="tag source">${escapeHtml(source)}</span>
          <span class="tag ${escapeAttr(mediaType)}">${escapeHtml(mediaType)}</span>
          ${itemDuration ? `<span class="tag duration">${escapeHtml(itemDuration)}</span>` : ""}
          ${isPartial ? `<span class="tag partial">Kısmi · ${escapeHtml(secondsLabel(partialSeconds))}</span>` : ""}
          ${done ? `<span class="tag done">Shadowed</span>` : ""}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class="meta">${escapeHtml(item.section || "")}${date ? ` · ${escapeHtml(date)}` : ""}${itemDuration ? ` · süre: ${escapeHtml(itemDuration)}` : ""}</div>
        ${description ? `<p class="summary">${escapeHtml(description)}</p>` : ""}
        <div class="actions">
          ${canPlayInside ? `<button class="primary" data-action="player" data-id="${escapeAttr(item.id)}">${isPlayerOpen ? "Oynatıcıyı kapat" : "Site içinde oynat"}</button>` : ""}
          <a class="primary" href="${escapeAttr(item.url)}" target="_blank" rel="noopener">${escapeHtml(source)}'da aç</a>
          <button class="ghost" data-action="toggle" data-id="${escapeAttr(item.id)}">${done ? "Shadowed kaldır" : "Shadowed"}</button>
        </div>
        ${isPlayerOpen ? renderPlayer(item, mediaType) : ""}
        <div class="quickMinutes">
          ${itemMinutes ? `<button class="mini durationAdd" data-action="min" data-id="${escapeAttr(item.id)}" data-base-min="${escapeAttr(itemMinutes)}" data-min="${escapeAttr(adjustedMinutes)}">+Süre (${escapeHtml(adjustedDuration)}${escapeHtml(speedLabel)})</button>` : ""}
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
          ${partialSeconds ? `<span>${escapeHtml(secondsLabel(partialSeconds))}${itemSeconds ? ` / ${escapeHtml(secondsLabel(itemSeconds))}` : ""} kaydedildi${partialPct ? ` · %${partialPct}` : ""}</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderPlayer(item, mediaType) {
  const rate = playbackRate();
  const media = mediaType === "video"
    ? `<video class="inlineMedia" data-media-id="${escapeAttr(item.id)}" src="${escapeAttr(item.mediaUrl)}" controls playsinline preload="metadata"></video>`
    : `<audio class="inlineMedia" data-media-id="${escapeAttr(item.id)}" src="${escapeAttr(item.mediaUrl)}" controls preload="metadata"></audio>`;
  const record = state.db.items[item.id] || {};
  const partialSeconds = Number(record.partialSeconds || 0);
  return `
    <div class="playerBox">
      ${media}
      <div class="resumeRow">
        <span>${partialSeconds ? `Kaldığın yer: ${escapeHtml(secondsLabel(partialSeconds))}` : "Kayıtlı ilerleme yok"}</span>
        <button class="mini" data-action="save-progress" data-id="${escapeAttr(item.id)}">Şu ana kadar shadowed</button>
        ${partialSeconds ? `<button class="mini dangerMini" data-action="clear-progress" data-id="${escapeAttr(item.id)}">Kaldığım yeri temizle</button>` : ""}
      </div>
      <div class="speedRow" aria-label="Oynatma hızı">
        <span>Hız</span>
        ${[0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5].map(value => `
          <button class="mini speed ${rate === value ? "active" : ""}" data-action="speed" data-id="${escapeAttr(item.id)}" data-rate="${value}">${value.toFixed(1)}x</button>
        `).join("")}
      </div>
    </div>
  `;
}

function applyPlaybackRate(scope = document) {
  scope.querySelectorAll(".inlineMedia").forEach(media => {
    media.playbackRate = playbackRate();
    const record = state.db.items[media.dataset.mediaId] || {};
    const startAt = Number(record.partialSeconds || 0);
    if (startAt > 0) {
      media.addEventListener("loadedmetadata", () => {
        if (media.duration && startAt < media.duration - 2) media.currentTime = startAt;
      }, { once: true });
    }
  });
}

function updateDurationButtons(scope = document) {
  const rate = playbackRate();
  scope.querySelectorAll(".durationAdd[data-base-min]").forEach(button => {
    const baseMinutes = Number(button.dataset.baseMin || 0);
    const adjusted = effectiveMinutes(baseMinutes);
    const label = durationMinutesLabel(adjusted);
    const speedLabel = rate === 1 ? "" : ` @ ${rate.toFixed(1)}x`;
    button.dataset.min = String(adjusted);
    button.textContent = `+Süre (${label}${speedLabel})`;
  });
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
    els.levelTabs.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === button));
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
    if (button.dataset.action === "player") {
      state.playerId = state.playerId === id ? null : id;
      render();
      applyPlaybackRate();
    }
    if (button.dataset.action === "speed") {
      state.db.settings.playbackRate = Number(button.dataset.rate || 1);
      saveDb();
      applyPlaybackRate();
      updateDurationButtons();
      button.closest(".speedRow")?.querySelectorAll(".speed").forEach(speedButton => {
        speedButton.classList.toggle("active", speedButton === button);
      });
    }
    if (button.dataset.action === "save-progress") {
      const media = button.closest(".playerBox")?.querySelector(".inlineMedia");
      savePartialProgress(item, media?.currentTime || 0);
    }
    if (button.dataset.action === "clear-progress") clearPartialProgress(item);
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

setupCategoryTabs();
setupFilters();
bindEvents();
render();
refreshCatalogFromJson();
