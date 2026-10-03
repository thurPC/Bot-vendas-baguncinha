const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const JSON_FILE = path.join(DATA_DIR, "store.json");
const SQLITE_FILE = path.join(DATA_DIR, "loja.db");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson() {
  try {
    if (fs.existsSync(JSON_FILE)) {
      return JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Erro ao ler store.json:", error.message);
  }
  return null;
}

function saveJson(store) {
  ensureDir();
  fs.writeFileSync(JSON_FILE, JSON.stringify(store, null, 2));
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
    return JSON.parse(row.v);
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

function configScore(store) {
  const c = store && store.config && typeof store.config === "object" ? store.config : {};
  return ["smtpHost", "smtpUser", "smtpPass", "smtpFrom", "ticketCategoryId", "banner"]
    .filter(k => c[k] != null && c[k] !== "")
    .length;
}

function mergeStores(a, b) {
  if (!a) return b || {};
  if (!b) return a;
  const base = (Number(a.savedAt || 0) >= Number(b.savedAt || 0) ? a : b) || {};
  const other = base === a ? b : a;
  const merged = { ...other, ...base };
  const cfgA = a.config && typeof a.config === "object" ? a.config : {};
  const cfgB = b.config && typeof b.config === "object" ? b.config : {};
  const prefer = configScore(a) >= configScore(b) ? cfgA : cfgB;
  const fallback = prefer === cfgA ? cfgB : cfgA;
  merged.config = { ...fallback, ...prefer };
  for (const key of new Set([...Object.keys(cfgA), ...Object.keys(cfgB)])) {
    if (merged.config[key] == null || merged.config[key] === "") {
      merged.config[key] = prefer[key] != null && prefer[key] !== "" ? prefer[key] : fallback[key];
    }
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
  return loaded && typeof loaded === "object" ? loaded : {};
}

function salvarStore(store) {
  if (store && typeof store === "object") store.savedAt = Date.now();
  saveJson(store);
  saveSqlite(store);
}

module.exports = { carregarStore, salvarStore, JSON_FILE, SQLITE_FILE };
