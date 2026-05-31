// ═══════════════════════════════════════════════════════
//  POS Licorería — Módulo de sincronización con Google Sheets
//  Lee  → API de Google Sheets v4 con API Key (sin auth)
//  Escribe → Google Apps Script Web App (POST no-cors)
// ═══════════════════════════════════════════════════════

const Sheets = {

  _id()          { return (typeof SHEETS_ID      !== 'undefined' ? SHEETS_ID      : '').trim(); },
  _apiKey()      { return (typeof SHEETS_API_KEY !== 'undefined' ? SHEETS_API_KEY : '').trim(); },

  _scriptUrl()   { return (typeof APPS_SCRIPT_URL !== 'undefined' ? APPS_SCRIPT_URL : '').trim(); },

  isConfigured() { return !!this._id() && !!this._apiKey(); },

  // ── GET (API Key, sin auth) ───────────────────────────
  async readSheet(sheetName, timeoutMs = 15000) {
    const id  = this._id();
    const key = this._apiKey();
    if (!id || !key) throw new Error('Base de datos no configurada en config.js');
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(sheetName)}?key=${encodeURIComponent(key)}`;
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        let msg = err?.error?.message || `Error ${res.status}`;
        if (res.status === 403) msg += ' — Habilita la Google Sheets API en Google Cloud Console.';
        throw new Error(msg);
      }
      const json = await res.json();
      return json.values || [];
    } catch (e) {
      clearTimeout(tid);
      if (e.name === 'AbortError') throw new Error(`Timeout leyendo "${sheetName}" (${timeoutMs/1000}s)`);
      throw e;
    }
  },

  // ── POST via Apps Script (no-cors) ────────────────────
  // Con no-cors no se puede leer la respuesta, pero el dato SÍ se guarda.
  async _post(payload) {
    const url = this._scriptUrl();
    if (!url || url.includes('PEGAR_URL')) {
      console.warn('[Sheets._post] APPS_SCRIPT_URL no configurada — escritura omitida');
      return;
    }
    await fetch(url, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
  },

  // ── Helpers parseo ────────────────────────────────────
  _helpers() {
    const val  = (row, n) => (row[n] != null ? String(row[n]).trim() : '');
    const num  = (row, n) => parseFloat(val(row, n)) || 0;
    const date = (row, n) => {
      const raw = val(row, n);
      if (!raw) return '';
      // dd/MM/yyyy — formato boliviano de Sheets
      const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (ddmmyyyy) {
        const d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}T12:00:00`);
        return isNaN(d.getTime()) ? '' : d.toISOString();
      }
      // yyyy-MM-dd o ISO completo
      const d = new Date(raw);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    };
    return { val, num, date };
  },

  // ── Buscar fila por valor (para confirmación visual) ──
  async _findRow(sheetName, colIdx, value) {
    const rows = await this.readSheet(sheetName);
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][colIdx] ?? '').toString().trim() === String(value).trim()) {
        return i + 1;
      }
    }
    return -1;
  },

  // ── Inventario + Catálogo: guardar producto ───────────
  async saveProduct(p, usuario = '') {
    const fecha = new Date().toISOString();
    await this._post({
      accion:    'saveProduct',
      id:        p.id || '',
      name:      p.name,
      category:  p.category,
      base_unit: p.base_unit,
      cost:      p.cost,
      price:     p.price,
      stock:     p.stock,
      min_stock: p.min_stock,
      barcodes:  JSON.stringify(p.barcodes || []),
      usuario,
      fecha
    });
  },

  // ── Inventario + Catálogo: eliminar producto ──────────
  async deleteProd(p) {
    await this._post({
      accion: 'deleteProduct',
      name:   p.name
    });
  },

  // ── Lotes: solo append de una fila nueva ─────────────
  async addLote(lot, productName) {
    await this._post({
      accion:        'addLote',
      id:            lot.lot_uid || lot.id || '',
      product_name:  productName,
      date:          lot.date,
      expiry:        lot.expiry || '',
      cost:          lot.cost,
      qty_initial:   lot.qty_initial,
      qty_remaining: lot.qty_remaining,
      notes:         lot.notes || ''
    });
  },

  // ── Lotes: eliminar fila por lot_uid (col A) ─────────
  async deleteLote(lotUid) {
    await this._post({ accion: 'deleteLote', id: lotUid });
  },

  // ── Lotes: actualizar qty_remaining (usado por FIFO al vender) ──
  async updateLote(lot, productName) {
    await this._post({
      accion:        'updateLote',
      id:            lot.lot_uid || lot.id || '',
      product_name:  productName,
      qty_remaining: lot.qty_remaining
    });
  },

  // ── Lotes: editar todos los campos desde el modal de edición ──
  async editLote(lot, productName) {
    await this._post({
      accion:        'editLote',
      id:            lot.lot_uid || lot.id || '',
      product_name:  productName,
      date:          lot.date          || '',
      expiry:        lot.expiry        || '',
      cost:          lot.cost          || 0,
      qty_initial:   lot.qty_initial   || 0,
      qty_remaining: lot.qty_remaining || 0,
      notes:         lot.notes         || ''
    });
  },

  // ── Ventas: append ─────────────────────────────────────
  async addVenta(s) {
    await this._post({
      accion:       'addVenta',
      date:         s.date,
      total:        s.total,
      payment:      s.payment,
      total_cogs:   s.total_cogs   || 0,
      gross_profit: s.gross_profit || 0,
      received:     s.received     || s.total,
      change:       s.change       || 0,
      items:        JSON.stringify(s.items || []),
      usuario:      s.usuario      || ''
    });
  },

  // ── Ventas: eliminar fila por ID ──────────────────────
  async deleteVenta(id) {
    await this._post({ accion: 'deleteVenta', id });
  },

  // ── Ventas: editar fila existente por ID ──────────────
  // Envía acción 'editVenta' al Apps Script con el ID y los campos a actualizar.
  // El Apps Script debe buscar la fila por ID (col A) y sobreescribir las columnas.
  async editVenta(v) {
    await this._post({
      accion:       'editVenta',
      id:           v.id,
      fecha:        v.fecha,        // dd/MM/yyyy
      hora:         v.hora,         // HH:MM
      total:        v.total,
      total_cogs:   v.cogs,
      gross_profit: v.ganancia,
      payment:      v.metodo,
      items:        v.items         // JSON string
    });
  },

  // ── Movimientos: append ────────────────────────────────
  async addMovimiento(m) {
    await this._post({
      accion:       'addMovimiento',
      date:         m.date,
      product_name: m.product_name || '',
      type:         m.type,
      qty:          m.qty,
      cost:         m.cost  || 0,
      notes:        m.notes || '',
      usuario:      m.usuario || ''
    });
  },

  // ── Categorías: leer desde hoja "Categorias" ──────────
  async loadCategorias() {
    try {
      const rows = await this.readSheet('Categorias');
      // Clave(A) | Nombre visible(B)
      const cats = rows.slice(1).filter(r => r[0] && r[1]).map(r => ({
        key:  String(r[0]).trim().toLowerCase().replace(/\s+/g, '_'),
        name: String(r[1]).trim()
      }));
      if (cats.length) {
        localStorage.setItem('pos_categorias', JSON.stringify(cats));
        return cats;
      }
    } catch (_) {}
    return null; // null = usar las categorías por defecto del código
  },

  // ── Carga unificada: Catálogo + Inventario + Lotes ────
  async loadFromSheets(onProgress) {
    onProgress?.('Leyendo catálogo…');
    const { val, num, date } = this._helpers();

    // 0. Categorías (opcional — no falla si la hoja no existe)
    await this.loadCategorias();

    // 1. Catálogo — deduplicar por nombre (toma la primera aparición)
    const catRows  = await this.readSheet('Catalogo');
    const seenProds = new Set();
    const catProds = catRows.slice(1).filter(r => r[0]).reduce((acc, row) => {
      const nombre = val(row, 0).trim().toLowerCase();
      if (!nombre || seenProds.has(nombre)) return acc;
      seenProds.add(nombre);
      acc.push({
        name:      val(row, 0).trim(),
        category:  (val(row, 1) || 'extra').toLowerCase(),
        base_unit: val(row, 2) || 'unidad',
        price:     num(row, 3),
        cost:      num(row, 4),
        min_stock: num(row, 5)
      });
      return acc;
    }, []);
    if (!catProds.length) throw new Error('Catálogo vacío en la base de datos');

    // 2. Inventario (stock + barcodes)
    onProgress?.('Leyendo inventario…');
    const stockMap    = {};
    const barcodesMap = {};
    try {
      const invRows = await this.readSheet('Inventario');
      for (const row of invRows.slice(1).filter(r => r[1])) {
        const key = val(row, 1).toLowerCase();
        stockMap[key] = num(row, 6);
        try { barcodesMap[key] = JSON.parse(val(row, 8) || '[]'); } catch (_) {}
      }
    } catch (_) {}

    // 3. Leer lotes ANTES de borrar IndexedDB — si falla, no perdemos nada
    onProgress?.('Cargando lotes FIFO…');
    const lotesNuevos = [];
    try {
      const lotRows  = await this.readSheet('Lotes');
      const seenUids = new Set();
      const seenSig  = new Set();

      for (const row of lotRows.slice(1).filter(r => r[1] && num(row, 5) > 0)) {
        const lotUid = val(row, 0).trim();
        const nombre = val(row, 1).trim().toLowerCase();
        const fecha  = val(row, 2).trim();
        const costo  = num(row, 3);
        const sig    = `${nombre}|${fecha}|${costo}`;

        if (lotUid && seenUids.has(lotUid)) continue;
        if (!lotUid && seenSig.has(sig))    continue;
        if (lotUid)  seenUids.add(lotUid);
        else         seenSig.add(sig);

        lotesNuevos.push({
          lot_uid:       lotUid,
          nombre_prod:   val(row, 1).trim(), // guardar nombre para resolver después
          date:          date(row, 2) || new Date().toISOString(),
          cost:          costo,
          qty_initial:   num(row, 4),
          qty_remaining: num(row, 5),
          notes:         val(row, 6) || '',
          expiry:        date(row, 7) || null,
          synced:        true
        });
      }
    } catch (e) {
      console.warn('[loadFromSheets] Error leyendo Lotes:', e);
    }

    // 4. Ahora sí reconstruir IndexedDB — solo si tenemos productos
    await DB.clearAll();
    onProgress?.(`Importando ${catProds.length} productos…`);
    for (const p of catProds) {
      const key = p.name.toLowerCase();
      await DB.addProduct({
        ...p,
        stock:    stockMap[key]    ?? 0,
        barcodes: barcodesMap[key] || [],
        active:   true
      });
    }

    // 5. Insertar lotes resolviendo product_id por nombre
    for (const l of lotesNuevos) {
      const prod = await DB.getProductByName(l.nombre_prod);
      if (!prod) continue;
      await DB._add('lots', {
        lot_uid:       l.lot_uid,
        product_id:    prod.id,
        date:          l.date,
        cost:          l.cost,
        qty_initial:   l.qty_initial,
        qty_remaining: l.qty_remaining,
        notes:         l.notes,
        expiry:        l.expiry,
        synced:        true
      });
    }
    const prods = await DB.getActiveProducts();
    for (const p of prods) await DB.recalcStock(p.id);

    onProgress?.('¡Listo!');
  },

  // Aliases de compatibilidad
  loadCatalogo(onProgress) { return this.loadFromSheets(onProgress); },
  loadState(onProgress)    { return this.loadFromSheets(onProgress); }
};
