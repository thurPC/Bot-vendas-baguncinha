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

function carregarStore() {
  const fromDb = loadSqlite();
  if (fromDb && typeof fromDb === "object") return fromDb;
  const fromJson = loadJson();
  if (fromJson && typeof fromJson === "object") {
    saveSqlite(fromJson);
    return fromJson;
  }
  return {};
}

function salvarStore(store) {
  saveJson(store);
  saveSqlite(store);
}

module.exports = { carregarStore, salvarStore, JSON_FILE, SQLITE_FILE };
