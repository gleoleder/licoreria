// ═══════════════════════════════════════════════════════════════
//  DB — IndexedDB wrapper
//  Stores: products | sales | movements | lots
//
//  LOTES FIFO: cada entrada de mercancía crea un lote con su
//  costo de adquisición. Al vender, se consume el lote más
//  antiguo primero (First In, First Out). Esto permite calcular
//  el Costo de Ventas (COGS) exacto y la Ganancia Bruta real.
// ═══════════════════════════════════════════════════════════════

const DB_NAME    = 'pos_licores';
const DB_VERSION = 2;          // ← subimos versión para agregar 'lots'
let   _db        = null;

const DB = {
  open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;

        // ── products ──────────────────────────────────────────
        if (!db.objectStoreNames.contains('products')) {
          const ps = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
          ps.createIndex('name',     'name',     { unique: false });
          ps.createIndex('category', 'category', { unique: false });
          ps.createIndex('active',   'active',   { unique: false });
        }

        // ── sales ─────────────────────────────────────────────
        if (!db.objectStoreNames.contains('sales')) {
          const ss = db.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
          ss.createIndex('date', 'date', { unique: false });
        }

        // ── movements ─────────────────────────────────────────
        if (!db.objectStoreNames.contains('movements')) {
          const ms = db.createObjectStore('movements', { keyPath: 'id', autoIncrement: true });
          ms.createIndex('product_id', 'product_id', { unique: false });
          ms.createIndex('date',       'date',       { unique: false });
        }

        // ── lots (lotes de compra — FIFO) ──────────────────────
        // Cada lote representa una tanda de compra con su propio
        // costo de adquisición por unidad base.
        if (!db.objectStoreNames.contains('lots')) {
          const ls = db.createObjectStore('lots', { keyPath: 'id', autoIncrement: true });
          ls.createIndex('product_id', 'product_id', { unique: false });
          ls.createIndex('date',       'date',       { unique: false });
        }
      };

      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  },

  // ── Generic helpers ────────────────────────────────────────

  _tx(store, mode = 'readonly') {
    return _db.transaction([store], mode).objectStore(store);
  },

  _all(store) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  _get(store, id) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  _put(store, obj) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').put(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  _add(store, obj) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').add(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  _delete(store, id) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  },

  // ── Products ───────────────────────────────────────────────

  getProducts()     { return this._all('products'); },
  getProduct(id)    { return this._get('products', id); },
  saveProduct(p)    { return this._put('products', p); },
  deleteProduct(id) { return this._delete('products', id); },

  async getActiveProducts() {
    const all = await this.getProducts();
    return all.filter(p => p.active !== false);
  },

  async findByBarcode(code) {
    const products = await this.getActiveProducts();
    for (const p of products) {
      const bc = (p.barcodes || []).find(b => b.code === code.trim());
      if (bc) return { product: p, barcode: bc };
    }
    return null;
  },

  async searchProducts(query) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const all = await this.getActiveProducts();
    return all.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  },

  async updateStock(productId, delta) {
    const p = await this.getProduct(productId);
    if (!p) return;
    p.stock = Math.max(0, (p.stock || 0) + delta);
    return this.saveProduct(p);
  },

  // ── Lotes FIFO ─────────────────────────────────────────────
  //
  // Terminología contable:
  //   Costo de Adquisición  = lo que pagaste por unidad al comprar
  //   Costo de Ventas(COGS) = costo de adquisición de lo que vendiste
  //   Ganancia Bruta        = Ingresos - COGS
  //   Margen Bruto %        = (Ganancia Bruta / Ingresos) × 100

  getLots()          { return this._all('lots'); },
  getLot(id)         { return this._get('lots', id); },
  saveLot(lot)       { return this._put('lots', lot); },

  async getLotsByProduct(pid) {
    const all = await this.getLots();
    return all
      .filter(l => l.product_id === pid)
      .sort((a, b) => new Date(a.date) - new Date(b.date)); // FIFO: más antiguo primero
  },

  async addLot(lot) {
    const id = await this._add('lots', lot);
    // También sumar al stock del producto
    await this.updateStock(lot.product_id, lot.qty_initial);
    return id;
  },

  /**
   * Consume unidades de un producto usando FIFO.
   * Retorna el COGS (Costo de Ventas) total de las unidades consumidas
   * y el detalle de lotes consumidos.
   *
   * Si no hay lotes registrados, usa product.cost como fallback.
   */
  async consumeFIFO(product_id, units_needed) {
    const lots = (await this.getLotsByProduct(product_id))
      .filter(l => l.qty_remaining > 0);

    let remaining = units_needed;
    let cogs      = 0;
    const detail  = []; // [{ lot_id, cost, units_taken }]

    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.qty_remaining, remaining);
      cogs              += take * lot.cost;
      lot.qty_remaining -= take;
      remaining         -= take;
      detail.push({ lot_id: lot.id, cost: lot.cost, units_taken: take });
      await this.saveLot(lot);
    }

    // Fallback: si no había lotes (stock inicial sin lote), usar product.cost
    if (remaining > 0) {
      const p = await this.getProduct(product_id);
      cogs += remaining * (p.cost || 0);
    }

    // Descontar del stock del producto
    await this.updateStock(product_id, -units_needed);

    return { cogs, detail };
  },

  /**
   * Stock disponible según lotes activos (qty_remaining).
   * Incluye también el costo promedio ponderado actual.
   */
  async getLotsInfo(product_id) {
    const lots = await this.getLotsByProduct(product_id);
    const active = lots.filter(l => l.qty_remaining > 0);
    const totalUnits = active.reduce((s, l) => s + l.qty_remaining, 0);
    const totalCost  = active.reduce((s, l) => s + l.qty_remaining * l.cost, 0);
    return {
      lots:     active,
      allLots:  lots,
      units:    totalUnits,
      avgCost:  totalUnits > 0 ? totalCost / totalUnits : 0,
      totalCost
    };
  },

  // ── Sales ──────────────────────────────────────────────────

  getSales()    { return this._all('sales'); },
  getSale(id)   { return this._get('sales', id); },
  addSale(sale) { return this._add('sales', sale); },

  async getSalesByDate(dateStr) {
    const all = await this.getSales();
    return all.filter(s => s.date && s.date.startsWith(dateStr));
  },

  async getSalesByRange(from, to) {
    const all = await this.getSales();
    return all.filter(s => s.date >= from && s.date <= to + 'T23:59:59');
  },

  // ── Movements ──────────────────────────────────────────────

  addMovement(m)  { return this._add('movements', m); },
  getMovements()  { return this._all('movements'); },

  // ── Estadísticas ───────────────────────────────────────────

  /**
   * Calcula KPIs contables para un rango de ventas.
   * Retorna: { revenue, cogs, grossProfit, margin, salesCount, unitsSold }
   */
  async getStats(sales) {
    let revenue    = 0;
    let cogs       = 0;
    let unitsSold  = 0;
    const byProduct = {};

    for (const sale of sales) {
      revenue   += sale.total;
      cogs      += sale.total_cogs || 0;
      for (const item of (sale.items || [])) {
        unitsSold += item.units || 0;
        const pid  = item.product_id;
        if (!byProduct[pid]) byProduct[pid] = { name: item.product_name, revenue: 0, cogs: 0, units: 0 };
        byProduct[pid].revenue += item.lineTotal || 0;
        byProduct[pid].cogs    += item.item_cogs  || 0;
        byProduct[pid].units   += item.units      || 0;
      }
    }

    const grossProfit = revenue - cogs;
    const margin      = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const topProducts = Object.values(byProduct)
      .map(p => ({ ...p, profit: p.revenue - p.cogs, margin: p.revenue > 0 ? ((p.revenue - p.cogs) / p.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);

    return { revenue, cogs, grossProfit, margin, salesCount: sales.length, unitsSold, topProducts };
  },

  // ── Seed ───────────────────────────────────────────────────

  // ── Catálogo real de la licorería ──────────────────────────
  //  cost y price en 0 → el usuario los llena desde Productos.
  //  Esta función BORRA productos y lotes pero conserva ventas.
  async importarCatalogo() {
    // Borrar productos existentes y sus lotes
    const prods = await this.getProducts();
    for (const p of prods) await this._delete('products', p.id);
    const lots  = await this.getLots();
    for (const l of lots)  await this._delete('lots', l.id);

    const catalogo = [
      // ── CERVEZAS ──────────────────────────────────────────
      { name:'Paceña lata grande',       category:'cerveza',    base_unit:'lata',    cost:0, price:0, stock:0, min_stock:24, active:true, barcodes:[] },
      { name:'Paceña retornable',        category:'cerveza',    base_unit:'botella', cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'Huari lata grande',        category:'cerveza',    base_unit:'lata',    cost:0, price:0, stock:0, min_stock:24, active:true, barcodes:[] },
      { name:'Bock lata grande',         category:'cerveza',    base_unit:'lata',    cost:0, price:0, stock:0, min_stock:24, active:true, barcodes:[] },
      { name:'Judas lata grande',        category:'cerveza',    base_unit:'lata',    cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'Burguesa lata grande',     category:'cerveza',    base_unit:'lata',    cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'Amstell lata grande',      category:'cerveza',    base_unit:'lata',    cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'Corona botellín',          category:'cerveza',    base_unit:'botella', cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'Heineken botellín',        category:'cerveza',    base_unit:'botella', cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      // ── BEBIDAS PREPARADAS ────────────────────────────────
      { name:'Four Loko pequeño',        category:'bebida',     base_unit:'lata',    cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'Four Loko mediano',        category:'bebida',     base_unit:'lata',    cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'Four Loko grande',         category:'bebida',     base_unit:'lata',    cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'PTK',                      category:'bebida',     base_unit:'lata',    cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'Granada pequeña 3P.',      category:'bebida',     base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Granada mediana 3P.',      category:'bebida',     base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Granada grande Cepas',     category:'bebida',     base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Bacardi Mojito Bot.',       category:'bebida',     base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Blue Frizz Bot.',           category:'bebida',     base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Blue Frizz Lata',          category:'bebida',     base_unit:'lata',    cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'Lix 1L.',                   category:'bebida',     base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Lix 2L',                    category:'bebida',     base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Lix 2.5L.',                 category:'bebida',     base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Baradero Ron/Cola 1L.',    category:'bebida',     base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Baradero Ron/Cola 2L.',    category:'bebida',     base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Bardero San Mateo',        category:'bebida',     base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Mojito Urbano',            category:'bebida',     base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      // ── CUBAS ─────────────────────────────────────────────
      { name:'Cuba mini',                category:'bebida',     base_unit:'vaso',    cost:0, price:0, stock:0, min_stock:0,  active:true, barcodes:[] },
      { name:'Cuba 500ml',               category:'bebida',     base_unit:'vaso',    cost:0, price:0, stock:0, min_stock:0,  active:true, barcodes:[] },
      { name:'Cuba 1L.',                  category:'bebida',     base_unit:'jarra',   cost:0, price:0, stock:0, min_stock:0,  active:true, barcodes:[] },
      { name:'Cuba 2L.',                  category:'bebida',     base_unit:'jarra',   cost:0, price:0, stock:0, min_stock:0,  active:true, barcodes:[] },
      { name:'Cuba 3L.',                  category:'bebida',     base_unit:'jarra',   cost:0, price:0, stock:0, min_stock:0,  active:true, barcodes:[] },
      // ── VINOS ─────────────────────────────────────────────
      { name:'Caja Toro',                category:'vino',       base_unit:'caja',    cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Campos Oporto',            category:'vino',       base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Campos Tinto',             category:'vino',       base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Campos Blanco',            category:'vino',       base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      // ── FERNETS ───────────────────────────────────────────
      { name:'Branca menta',             category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Branca 3/4',               category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Branca 1L.',               category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Combo Branca + CocaCola 2L.', category:'licor',  base_unit:'combo',   cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Jaguer 1L',                category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Jaguer 3/4',               category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      // ── VODKA ─────────────────────────────────────────────
      { name:'Vodka Stark',              category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Vodka Rebel',              category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Vodka SKY',                category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      // ── RON ───────────────────────────────────────────────
      { name:'Ron 37 Lenguas',           category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Ron Havana 7 años',        category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Ron Havana especial',      category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Ron Havana reserva',       category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Ron Abuelo pata',          category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Ron Abuelo 1L.',           category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Ron Flor de Caña 4 años',  category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Ron Flor de Caña 5 años',  category:'licor',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      // ── SINGANI ───────────────────────────────────────────
      { name:'Casa Real negro',          category:'singani',    base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Casa Real rojo',           category:'singani',    base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Casa Real azul',           category:'singani',    base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Insignia negro',           category:'singani',    base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Insignia rojo',            category:'singani',    base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Insignia azul',            category:'singani',    base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      // ── REFRESCOS ─────────────────────────────────────────
      { name:'CocaCola 3L.',             category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'CocaCola 2L.',             category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'CocaCola retornable 2L.',  category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      { name:'Sprite 1L.',               category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Fanta 2L.',                category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Tampico 2L.',              category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'7up 3L.',                  category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Ginger Ale 2L.',           category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Ginger Ale 1L.',           category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Agua Tónica 1L.',          category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Agua Vital 3L.',           category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Agua Mendocina 3L.',       category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:6,  active:true, barcodes:[] },
      { name:'Agua Mendocina 1/2L.',     category:'refresco',   base_unit:'botella', cost:0, price:0, stock:0, min_stock:12, active:true, barcodes:[] },
      // ── CIGARRILLOS ───────────────────────────────────────
      { name:'L&M Rojo (paquete)',        category:'cigarrillo', base_unit:'paquete', cost:0, price:0, stock:0, min_stock:10, active:true, barcodes:[] },
      { name:'L&M Azul (paquete)',        category:'cigarrillo', base_unit:'paquete', cost:0, price:0, stock:0, min_stock:10, active:true, barcodes:[] },
      { name:'L&M Canela (paquete)',      category:'cigarrillo', base_unit:'paquete', cost:0, price:0, stock:0, min_stock:10, active:true, barcodes:[] },
      { name:'Derby doble click',        category:'cigarrillo', base_unit:'paquete', cost:0, price:0, stock:0, min_stock:10, active:true, barcodes:[] },
      { name:'Camel doble click grande', category:'cigarrillo', base_unit:'paquete', cost:0, price:0, stock:0, min_stock:10, active:true, barcodes:[] },
      { name:'Camel doble click pequeño',category:'cigarrillo', base_unit:'paquete', cost:0, price:0, stock:0, min_stock:10, active:true, barcodes:[] },
      { name:'L&M Rojo (suelto)',         category:'cigarrillo', base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:20, active:true, barcodes:[] },
      { name:'L&M Azul (suelto)',         category:'cigarrillo', base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:20, active:true, barcodes:[] },
      { name:'L&M Canela (suelto)',       category:'cigarrillo', base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:20, active:true, barcodes:[] },
      { name:'Derby doble click suelto', category:'cigarrillo', base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:20, active:true, barcodes:[] },
      { name:'Camel grande suelto',      category:'cigarrillo', base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:20, active:true, barcodes:[] },
      { name:'Camel pequeño suelto',     category:'cigarrillo', base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:20, active:true, barcodes:[] },
      // ── EXTRAS ────────────────────────────────────────────
      { name:'Café coñac 3P',            category:'extra',      base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:5,  active:true, barcodes:[] },
      { name:'Old Red',                  category:'extra',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Old Red miel',             category:'extra',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Alcohol pequeño Caiman',   category:'extra',      base_unit:'botella', cost:0, price:0, stock:0, min_stock:3,  active:true, barcodes:[] },
      { name:'Cuetillos',                category:'extra',      base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:10, active:true, barcodes:[] },
      { name:'Serpentina',               category:'extra',      base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:10, active:true, barcodes:[] },
      { name:'Espuma',                   category:'extra',      base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:5,  active:true, barcodes:[] },
      { name:'Encendedor',               category:'extra',      base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:10, active:true, barcodes:[] },
      { name:'Chicles',                  category:'extra',      base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:10, active:true, barcodes:[] },
      { name:'Top Line',                 category:'extra',      base_unit:'unidad',  cost:0, price:0, stock:0, min_stock:5,  active:true, barcodes:[] },
      { name:'Coca machucada',           category:'extra',      base_unit:'bolsa',   cost:0, price:0, stock:0, min_stock:5,  active:true, barcodes:[] },
      { name:'Coca entera',              category:'extra',      base_unit:'bolsa',   cost:0, price:0, stock:0, min_stock:5,  active:true, barcodes:[] },
    ];

    for (const p of catalogo) await this._add('products', p);
    return catalogo.length;
  },

  async seedIfEmpty() {
    const existing = await this.getProducts();
    if (existing.length > 0) return;

    const demos = [
      {
        name: 'Cerveza Paceña lata 350ml', category: 'cerveza',
        base_unit: 'lata', cost: 7.5, price: 12, stock: 0, min_stock: 24, active: true,
        barcodes: [
          { code: '7790003001234', multiplier: 1,  label: 'Lata individual' },
          { code: '7790003001240', multiplier: 6,  label: 'Six-pack' },
          { code: '7790003001257', multiplier: 24, label: 'Caja 24 unid.' }
        ]
      },
      {
        name: 'Cerveza Huari lata 350ml', category: 'cerveza',
        base_unit: 'lata', cost: 7, price: 11, stock: 0, min_stock: 24, active: true,
        barcodes: [
          { code: '7790005001111', multiplier: 1, label: 'Lata individual' },
          { code: '7790005001128', multiplier: 6, label: 'Six-pack' }
        ]
      },
      {
        name: 'Whisky Old Times 750ml', category: 'licor',
        base_unit: 'botella', cost: 65, price: 90, stock: 0, min_stock: 6, active: true,
        barcodes: [
          { code: '7896024001001', multiplier: 1, label: 'Botella individual' },
          { code: '7896024001018', multiplier: 6, label: 'Caja 6 botellas' }
        ]
      },
      {
        name: 'Ron Millor 1L', category: 'licor',
        base_unit: 'botella', cost: 45, price: 65, stock: 0, min_stock: 4, active: true,
        barcodes: [{ code: '7799999002001', multiplier: 1, label: 'Botella individual' }]
      },
      {
        name: 'Vino Kohlberg Tinto 750ml', category: 'vino',
        base_unit: 'botella', cost: 35, price: 55, stock: 0, min_stock: 6, active: true,
        barcodes: [{ code: '7791111003001', multiplier: 1, label: 'Botella individual' }]
      },
      {
        name: 'Coca-Cola 500ml', category: 'bebida',
        base_unit: 'botella', cost: 4, price: 7, stock: 0, min_stock: 12, active: true,
        barcodes: [{ code: '7501055301807', multiplier: 1, label: 'Botella individual' }]
      }
    ];

    // Crear productos y sus lotes iniciales de demo
    const now = new Date().toISOString();
    const initialLots = [144, 96, 18, 12, 3, 48]; // stock inicial por producto
    for (let i = 0; i < demos.length; i++) {
      const id = await this._add('products', demos[i]);
      await this._add('lots', {
        product_id:    id,
        date:          now,
        cost:          demos[i].cost,
        qty_initial:   initialLots[i],
        qty_remaining: initialLots[i],
        notes:         'Stock inicial demo'
      });
      await this.updateStock(id, initialLots[i]);
    }
  }
};
