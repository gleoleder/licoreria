// ═══════════════════════════════════════════════════════
//  POS v2 — Módulo Google Sheets
//  Lee con Sheets API v4 (GET con API Key, CORS-safe)
//  Escribe con Apps Script Web App (POST no-cors)
// ═══════════════════════════════════════════════════════

const Sheets = {

  _id()     { return (typeof SHEETS_ID      !== 'undefined' ? SHEETS_ID      : '').trim(); },
  _url()    { return (typeof SHEETS_URL     !== 'undefined' ? SHEETS_URL     : '').trim(); },
  _apiKey() { return (typeof SHEETS_API_KEY !== 'undefined' ? SHEETS_API_KEY : '').trim(); },

  isConfigured() { return !!this._id() && !!this._url(); },

  // ── Escritura (POST fire-and-forget) ─────────────────
  async send(action, data) {
    const url = this._url();
    if (!url) return;
    try {
      const body = new URLSearchParams({ action, data: JSON.stringify(data) });
      await fetch(url, { method: 'POST', mode: 'no-cors', body });
    } catch (e) {
      console.warn('[Sheets] send error:', e);
    }
  },

  // ── Lectura (Sheets API v4) ───────────────────────────
  async readSheet(sheetName) {
    const id  = this._id();
    const key = this._apiKey();
    if (!id)  throw new Error('SHEETS_ID no configurado en config.js');
    if (!key) throw new Error('SHEETS_API_KEY no configurado en config.js');

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(sheetName)}?key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try {
        const err = await res.json();
        msg = err?.error?.message || msg;
      } catch (_) {}
      if (res.status === 403) msg += ' — Habilita la "Google Sheets API" en Google Cloud Console y verifica la API key.';
      if (res.status === 400) msg += ' — Hoja no encontrada o nombre incorrecto.';
      throw new Error(msg);
    }
    const json = await res.json();
    // json.values = array de arrays; fila 0 = cabeceras
    return json.values || [];
  },

  // ── Helpers para parsear filas ────────────────────────
  _helpers() {
    const val  = (row, n) => (row[n] != null ? String(row[n]).trim() : '');
    const num  = (row, n) => parseFloat(val(row, n)) || 0;
    const date = (row, n) => {
      const raw = val(row, n);
      if (!raw) return '';
      const d = new Date(raw);
      return isNaN(d.getTime()) ? raw : d.toISOString();
    };
    return { val, num, date };
  },

  // ── Cargar Catálogo → actualiza productos en DB ───────
  //  Fila 1 = cabeceras: Nombre | Categoría | Unidad | Precio Bs | Costo Bs | Stock mín.
  //  Filas 2+ = datos
  async loadCatalogo(onProgress) {
    onProgress?.('Leyendo catálogo desde Sheets…');
    const rows = await this.readSheet('Catalogo');
    const { val, num } = this._helpers();

    // Saltar fila de cabeceras (índice 0); filtrar filas con nombre
    const dataRows = rows.slice(1).filter(r => r[0]);
    onProgress?.(`Importando ${dataRows.length} productos…`);

    let added = 0, updated = 0;
    for (const row of dataRows) {
      const name = val(row, 0);
      if (!name) continue;

      const incoming = {
        name,
        category:  (val(row, 1) || 'extra').toLowerCase(),
        base_unit: val(row, 2) || 'unidad',
        price:     num(row, 3),
        cost:      num(row, 4),
        min_stock: num(row, 5),
        active:    true
      };

      const existing = await DB.getProductByName(name);
      if (existing) {
        await DB.saveProduct({
          ...existing,
          category:  incoming.category,
          base_unit: incoming.base_unit,
          price:     incoming.price,
          cost:      incoming.cost,
          min_stock: incoming.min_stock,
          active:    true
        });
        updated++;
      } else {
        await DB.addProduct({ ...incoming, stock: 0, barcodes: [] });
        added++;
      }
    }
    onProgress?.(`✓ ${added} nuevos · ${updated} actualizados`);
    return { added, updated };
  },

  // ── Cargar Inventario + Lotes (estado completo) ───────
  //  Inventario fila 1: cabeceras — ID | Nombre | Categoría | Unidad | Costo | Precio | Stock | Stock mín. | Barcodes
  //  Lotes fila 1: cabeceras — ID | Nombre | Fecha | Costo | Qty inicial | Qty restante | Notas
  async loadState(onProgress) {
    onProgress?.('Cargando inventario desde Sheets…');
    const invRows = await this.readSheet('Inventario');
    const { val, num } = this._helpers();

    // Saltar cabecera; filtrar filas con nombre (col 1)
    const prodDataRows = invRows.slice(1).filter(r => r[1]);
    if (prodDataRows.length === 0) throw new Error('Inventario vacío en Sheets');

    await DB.clearAll();
    onProgress?.(`Importando ${prodDataRows.length} productos…`);
    for (const row of prodDataRows) {
      let barcodes = [];
      try { barcodes = JSON.parse(val(row, 8) || '[]'); } catch (_) {}
      await DB.addProduct({
        name:      val(row, 1),
        category:  val(row, 2) || 'extra',
        base_unit: val(row, 3) || 'unidad',
        cost:      num(row, 4),
        price:     num(row, 5),
        stock:     num(row, 6),
        min_stock: num(row, 7),
        barcodes,
        active:    true
      });
    }

    // Reconstruir lotes FIFO
    onProgress?.('Cargando lotes FIFO…');
    const lotRows = await this.readSheet('Lotes');
    const { val: lval, num: lnum, date: ldate } = this._helpers();
    const lotDataRows = lotRows.slice(1).filter(r => r[1]);

    for (const row of lotDataRows) {
      const name = lval(row, 1);
      if (!name) continue;
      const prod = await DB.getProductByName(name);
      if (!prod) continue;
      await DB._add('lots', {
        product_id:    prod.id,
        date:          ldate(row, 2) || new Date().toISOString(),
        cost:          lnum(row, 3),
        qty_initial:   lnum(row, 4),
        qty_remaining: lnum(row, 5),
        notes:         lval(row, 6) || ''
      });
    }

    // Recalcular stock desde lotes
    const prods = await DB.getActiveProducts();
    for (const p of prods) await DB.recalcStock(p.id);

    onProgress?.('¡Estado cargado!');
  },

  // ── Sync escrituras ───────────────────────────────────
  async syncInventario() {
    const prods = await DB.getActiveProducts();
    return this.send('syncInventario', prods);
  },
  async syncLotes() {
    const lots  = await DB.getLots();
    const prods = await DB.getActiveProducts();
    const data  = lots.map(l => ({
      ...l,
      product_name: prods.find(p => p.id === l.product_id)?.name || ''
    }));
    return this.send('syncLotes', data);
  },
  syncAll() {
    this.syncInventario();
    this.syncLotes();
  },
  addVenta(sale)       { return this.send('addVenta',      sale); },
  addMovimiento(mov)   { return this.send('addMovimiento', mov);  }
};
