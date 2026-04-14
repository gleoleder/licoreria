// ═══════════════════════════════════════════════════════
//  POS v2 — IndexedDB (caché local)
//  Actúa como caché rápida de Google Sheets.
//  Stores: products | sales | movements | lots
// ═══════════════════════════════════════════════════════

const DB_NAME    = 'pos_licores_v2';
const DB_VERSION = 1;
let   _db        = null;

const DB = {

  open() {
    return new Promise((res, rej) => {
      if (_db) return res(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('products')) {
          const s = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
          s.createIndex('name',     'name',     { unique: false });
          s.createIndex('category', 'category', { unique: false });
        }
        if (!db.objectStoreNames.contains('lots')) {
          const s = db.createObjectStore('lots', { keyPath: 'id', autoIncrement: true });
          s.createIndex('product_id', 'product_id', { unique: false });
          s.createIndex('date',       'date',       { unique: false });
        }
        if (!db.objectStoreNames.contains('sales')) {
          const s = db.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
          s.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('movements')) {
          const s = db.createObjectStore('movements', { keyPath: 'id', autoIncrement: true });
          s.createIndex('product_id', 'product_id', { unique: false });
          s.createIndex('date',       'date',       { unique: false });
        }
      };
      req.onsuccess = e => { _db = e.target.result; res(_db); };
      req.onerror   = e => rej(e.target.error);
    });
  },

  // ── Helpers genéricos ─────────────────────────────────
  _tx(store, mode = 'readonly') {
    return _db.transaction([store], mode).objectStore(store);
  },
  _all(store) {
    return new Promise((res, rej) => {
      const r = this._tx(store).getAll();
      r.onsuccess = () => res(r.result);
      r.onerror   = e => rej(e.target.error);
    });
  },
  _get(store, id) {
    return new Promise((res, rej) => {
      const r = this._tx(store).get(id);
      r.onsuccess = () => res(r.result);
      r.onerror   = e => rej(e.target.error);
    });
  },
  _put(store, obj) {
    return new Promise((res, rej) => {
      const r = this._tx(store, 'readwrite').put(obj);
      r.onsuccess = () => res(r.result);
      r.onerror   = e => rej(e.target.error);
    });
  },
  _add(store, obj) {
    return new Promise((res, rej) => {
      const r = this._tx(store, 'readwrite').add(obj);
      r.onsuccess = () => res(r.result);
      r.onerror   = e => rej(e.target.error);
    });
  },
  _delete(store, id) {
    return new Promise((res, rej) => {
      const r = this._tx(store, 'readwrite').delete(id);
      r.onsuccess = () => res();
      r.onerror   = e => rej(e.target.error);
    });
  },

  // ── Productos ─────────────────────────────────────────
  getProducts()           { return this._all('products'); },
  getProduct(id)          { return this._get('products', id); },
  saveProduct(p)          { return this._put('products', p); },
  addProduct(p)           { return this._add('products', p); },
  deleteProduct(id)       { return this._delete('products', id); },

  async getActiveProducts() {
    return (await this.getProducts()).filter(p => p.active !== false);
  },
  async getProductByName(name) {
    const all = await this.getProducts();
    return all.find(p => p.name.toLowerCase().trim() === name.toLowerCase().trim()) || null;
  },
  async findByBarcode(code) {
    code = code.trim();
    for (const p of await this.getActiveProducts()) {
      const bc = (p.barcodes || []).find(b => b.code === code);
      if (bc) return { product: p, barcode: bc };
    }
    return null;
  },
  async searchProducts(q) {
    q = q.toLowerCase().trim();
    if (!q) return [];
    return (await this.getActiveProducts())
      .filter(p => p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
      .slice(0, 10);
  },
  async updateStock(pid, delta) {
    const p = await this.getProduct(pid);
    if (!p) return;
    p.stock = Math.max(0, (p.stock || 0) + delta);
    return this.saveProduct(p);
  },
  // Recalcular stock desde lotes activos (evita divergencia)
  async recalcStock(pid) {
    const lots  = await this.getLotsByProduct(pid);
    const stock = lots.filter(l => l.qty_remaining > 0)
                      .reduce((s, l) => s + l.qty_remaining, 0);
    const p = await this.getProduct(pid);
    if (!p) return;
    p.stock = stock;
    return this.saveProduct(p);
  },

  // ── Lotes FIFO ────────────────────────────────────────
  getLots()    { return this._all('lots'); },
  getLot(id)   { return this._get('lots', id); },
  saveLot(lot) { return this._put('lots', lot); },

  async addLot(lot) {
    const id = await this._add('lots', lot);
    await this.updateStock(lot.product_id, lot.qty_initial);
    return id;
  },
  async getLotsByProduct(pid) {
    return (await this.getLots())
      .filter(l => l.product_id === pid)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  },
  async getActiveLots(pid) {
    return (await this.getLotsByProduct(pid)).filter(l => l.qty_remaining > 0);
  },
  async getLotsInfo(pid) {
    const lots   = await this.getLotsByProduct(pid);
    const active = lots.filter(l => l.qty_remaining > 0);
    const units  = active.reduce((s, l) => s + l.qty_remaining, 0);
    const cost   = active.reduce((s, l) => s + l.qty_remaining * l.cost, 0);
    return {
      lots:    active,
      allLots: lots,
      units,
      avgCost: units > 0 ? cost / units : 0
    };
  },

  // Consumo FIFO — devuelve COGS total
  async consumeFIFO(pid, unitsNeeded) {
    const lots  = await this.getActiveLots(pid);
    let   rem   = unitsNeeded;
    let   cogs  = 0;

    for (const lot of lots) {
      if (rem <= 0) break;
      const take        = Math.min(lot.qty_remaining, rem);
      cogs             += take * lot.cost;
      lot.qty_remaining -= take;
      rem              -= take;
      await this.saveLot(lot);
    }
    // Fallback si no había lotes
    if (rem > 0) {
      const p = await this.getProduct(pid);
      cogs += rem * (p?.cost || 0);
    }
    await this.updateStock(pid, -unitsNeeded);
    return cogs;
  },

  // ── Ventas ────────────────────────────────────────────
  getSales()   { return this._all('sales'); },
  getSale(id)  { return this._get('sales', id); },
  addSale(s)   { return this._add('sales', s); },
  saveSale(s)  { return this._put('sales', s); },

  async getSalesByDate(dateStr) {
    const fromD = new Date(dateStr + 'T00:00:00');
    const toD   = new Date(dateStr + 'T23:59:59.999');
    return (await this.getSales()).filter(s => {
      if (!s.date) return false;
      const d = new Date(s.date);
      return d >= fromD && d <= toD;
    });
  },
  async getSalesByRange(from, to) {
    const fromD = new Date(from + 'T00:00:00');
    const toD   = new Date(to   + 'T23:59:59.999');
    return (await this.getSales()).filter(s => {
      if (!s.date) return false;
      const d = new Date(s.date);
      return d >= fromD && d <= toD;
    });
  },

  // ── Movimientos ───────────────────────────────────────
  addMovement(m)  { return this._add('movements', m); },
  getMovements()  { return this._all('movements'); },

  // ── Estadísticas ──────────────────────────────────────
  async getStats(sales) {
    let revenue = 0, cogs = 0, units = 0;
    const byProd = {};
    for (const s of sales) {
      revenue += s.total || 0;
      cogs    += s.total_cogs || 0;
      for (const item of s.items || []) {
        units += item.units || 0;
        const pid = item.product_id;
        if (!byProd[pid]) byProd[pid] = { name: item.product_name, revenue: 0, cogs: 0, units: 0 };
        byProd[pid].revenue += item.lineTotal || 0;
        byProd[pid].cogs    += item.item_cogs  || 0;
        byProd[pid].units   += item.units      || 0;
      }
    }
    const profit = revenue - cogs;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const top = Object.values(byProd)
      .map(p => ({ ...p, profit: p.revenue - p.cogs, margin: p.revenue > 0 ? (p.revenue - p.cogs) / p.revenue * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);
    return { revenue, cogs, profit, margin, salesCount: sales.length, units, top };
  },

  // ── Limpiar todo (uso: "Cargar estado" completo desde Sheets) ──
  async clearAll() {
    const prods = await this.getProducts();
    for (const p of prods) await this._delete('products', p.id);
    const lots  = await this.getLots();
    for (const l of lots)  await this._delete('lots', l.id);
  }
};
