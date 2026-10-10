const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const JSON_FILE = path.join(DATA_DIR, "store.json");
const JSON_BAK = path.join(DATA_DIR, "store.json.bak");
const JSON_TMP = path.join(DATA_DIR, "store.json.tmp");
const VISUAL_FILE = path.join(DATA_DIR, "visual.json");
const SQLITE_FILE = path.join(DATA_DIR, "loja.db");

const OBJECT_KEYS = [
  "pedidos", "pagamentos", "cupons", "estoque", "produtos", "produtoOverrides",
  "tickets", "carrinhos", "categorias", "guilds"
];

const VISUAL_CONFIG_KEYS = [
  "lojaTitulo", "lojaDescricao", "lojaCor", "lojaRodape", "banner", "bannerPosicao",
  "pixNomePublico", "ocultarNomePix", "feedbackTitulo", "feedbackMensagem",
  "ticketPainel", "cuponsPainel"
];

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function parseStoreFile(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  if (!raw || !String(raw).trim()) return null;
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function loadJson() {
  for (const file of [JSON_FILE, JSON_BAK]) {
    try {
      const parsed = parseStoreFile(file);
      if (parsed) return parsed;
    } catch (error) {
      console.error("Erro ao ler", path.basename(file) + ":", error.message);
    }
  }
  return null;
}

function extractVisual(store) {
  const cfg = store && store.config && typeof store.config === "object" ? store.config : {};
  const config = {};
  for (const key of VISUAL_CONFIG_KEYS) {
    if (cfg[key] !== undefined) config[key] = cfg[key];
  }
  const produtos = {};
  for (const [id, p] of Object.entries(store.produtos || {})) {
    if (!p || typeof p !== "object") continue;
    produtos[id] = {
      id: p.id || id,
      nome: p.nome,
      descricao: p.descricao,
      emoji: p.emoji,
      banner: p.banner,
      bannerPosicao: p.bannerPosicao,
      imagem: p.imagem,
      cor: p.cor,
      rodape: p.rodape,
      instrucoes: p.instrucoes,
      categoriaId: p.categoriaId,
      precoCentavos: p.precoCentavos,
      precoOriginalCentavos: p.precoOriginalCentavos,
      modo: p.modo,
      disponivel: p.disponivel,
      cargoId: p.cargoId,
      cargoDias: p.cargoDias
    };
  }
  return {
    savedAt: Date.now(),
    config,
    categorias: store.categorias || {},
    produtos,
    produtoOverrides: store.produtoOverrides || {},
    guilds: store.guilds || {}
  };
}

function preferFilled(atual, salvo) {
  if (salvo == null) return atual;
  if (atual == null || atual === "") return salvo;
  if (typeof atual === "object" && !Array.isArray(atual) && typeof salvo === "object" && !Array.isArray(salvo)) {
    const out = { ...salvo };
    for (const [k, v] of Object.entries(atual)) {
      out[k] = preferFilled(v, salvo[k]);
    }
    return out;
  }
  return atual;
}

function applyVisual(store, visual) {
  if (!visual || typeof visual !== "object") return store;
  if (!store.config || typeof store.config !== "object") store.config = {};
  for (const key of VISUAL_CONFIG_KEYS) {
    store.config[key] = preferFilled(store.config[key], visual.config && visual.config[key]);
  }
  if (visual.categorias) {
    if (!store.categorias) store.categorias = {};
    for (const [id, cat] of Object.entries(visual.categorias)) {
      store.categorias[id] = preferFilled(store.categorias[id], cat);
    }
  }
  if (visual.produtos) {
    if (!store.produtos) store.produtos = {};
    for (const [id, p] of Object.entries(visual.produtos)) {
      store.produtos[id] = preferFilled(store.produtos[id], p);
    }
  }
  if (visual.produtoOverrides) {
    if (!store.produtoOverrides) store.produtoOverrides = {};
    for (const [id, p] of Object.entries(visual.produtoOverrides)) {
      store.produtoOverrides[id] = preferFilled(store.produtoOverrides[id], p);
    }
  }
  if (visual.guilds) {
    if (!store.guilds) store.guilds = {};
    for (const [id, g] of Object.entries(visual.guilds)) {
      store.guilds[id] = preferFilled(store.guilds[id], g);
    }
  }
  return store;
}

function loadVisual() {
  try {
    return parseStoreFile(VISUAL_FILE);
  } catch (error) {
    console.error("Erro ao ler visual.json:", error.message);
    return null;
  }
}

function saveVisual(store) {
  try {
    ensureDir();
    fs.writeFileSync(VISUAL_FILE, JSON.stringify(extractVisual(store), null, 2));
  } catch (error) {
    console.error("Erro ao gravar visual.json:", error.message);
  }
}

function saveJson(store) {
  ensureDir();
  const data = JSON.stringify(store, null, 2);
  fs.writeFileSync(JSON_TMP, data);
  if (fs.existsSync(JSON_FILE)) {
    try {
      fs.copyFileSync(JSON_FILE, JSON_BAK);
    } catch (error) {
      console.error("Erro ao gravar store.json.bak:", error.message);
    }
  }
  fs.renameSync(JSON_TMP, JSON_FILE);
  saveVisual(store);
}

function openSqlite() {
  try {
    const { DatabaseSync } = require("node:sqlite");
    ensureDir();
    const db = new DatabaseSync(SQLITE_FILE);
    db.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
    return db;
  } catch {
    return null;
  }
}

function loadSqlite() {
  const db = openSqlite();
  if (!db) return null;
  try {
    const row = db.prepare("SELECT v FROM kv WHERE k = 'store'").get();
    db.close();
    if (!row || !row.v) return null;
    const parsed = JSON.parse(row.v);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error("Erro ao ler loja.db:", error.message);
    try { db.close(); } catch { /* ignore */ }
    return null;
  }
}

function saveSqlite(store) {
  const db = openSqlite();
  if (!db) return false;
  try {
    db.prepare("INSERT INTO kv (k, v) VALUES ('store', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")
      .run(JSON.stringify(store));
    db.close();
    return true;
  } catch (error) {
    console.error("Erro ao gravar loja.db:", error.message);
    try { db.close(); } catch { /* ignore */ }
    return false;
  }
}

function mergeConfig(prefer, fallback) {
  const p = prefer && typeof prefer === "object" && !Array.isArray(prefer) ? prefer : {};
  const f = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};
  const out = { ...f, ...p };
  for (const key of Object.keys(f)) {
    if (out[key] === undefined || out[key] === null) {
      out[key] = f[key];
      continue;
    }
    if (out[key] && typeof out[key] === "object" && !Array.isArray(out[key]) && f[key] && typeof f[key] === "object" && !Array.isArray(f[key])) {
      out[key] = mergeConfig(p[key], f[key]);
    }
  }
  return out;
}

function mergeDict(prefer, fallback) {
  const p = prefer && typeof prefer === "object" ? prefer : {};
  const f = fallback && typeof fallback === "object" ? fallback : {};
  const out = { ...f, ...p };
  for (const key of Object.keys(f)) {
    if (out[key] && typeof out[key] === "object" && !Array.isArray(out[key]) && f[key] && typeof f[key] === "object" && !Array.isArray(f[key])) {
      out[key] = { ...f[key], ...p[key] };
    }
  }
  return out;
}

function mergeStores(a, b) {
  if (!a) return b || {};
  if (!b) return a;
  const aTime = Number(a.savedAt || 0);
  const bTime = Number(b.savedAt || 0);
  const base = aTime >= bTime ? a : b;
  const other = base === a ? b : a;
  const merged = { ...other, ...base };
  merged.config = mergeConfig(base.config, other.config);
  for (const key of OBJECT_KEYS) {
    merged[key] = mergeDict(base[key], other[key]);
  }
  if (Array.isArray(base.cargosTemporarios) || Array.isArray(other.cargosTemporarios)) {
    merged.cargosTemporarios = Array.isArray(base.cargosTemporarios) ? base.cargosTemporarios : other.cargosTemporarios;
  }
  if (Array.isArray(base.logs) || Array.isArray(other.logs)) {
    merged.logs = Array.isArray(base.logs) ? base.logs : other.logs;
  }
  return merged;
}

function carregarStore() {
  const fromJson = loadJson();
  const fromDb = loadSqlite();
  const loaded = mergeStores(
    fromJson && typeof fromJson === "object" ? fromJson : null,
    fromDb && typeof fromDb === "object" ? fromDb : null
  );
  const store = loaded && typeof loaded === "object" ? loaded : {};
  applyVisual(store, loadVisual());
  return store;
}

function salvarStore(store) {
  if (store && typeof store === "object") store.savedAt = Date.now();
  saveJson(store);
  saveSqlite(store);
}

module.exports = { carregarStore, salvarStore, JSON_FILE, SQLITE_FILE, VISUAL_FILE };
