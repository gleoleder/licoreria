// ═══════════════════════════════════════════════════════
//  POS v2 — Módulo Google Sheets
//  Lee con gviz/tq (GET público, CORS-safe)
//  Escribe con Apps Script Web App (POST no-cors)
// ═══════════════════════════════════════════════════════

const Sheets = {

  _id()  { return (typeof SHEETS_ID  !== 'undefined' ? SHEETS_ID  : '').trim(); },
  _url() { return (typeof SHEETS_URL !== 'undefined' ? SHEETS_URL : '').trim(); },

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

  // ── Lectura (GET gviz) ────────────────────────────────
  async readSheet(sheetName) {
    const id = this._id();
    if (!id) throw new Error('SHEETS_ID no configurado en config.js');
    const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
    const res = await fetch(url);
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      throw new Error(`Sheet no accesible (${res.status}). Ir a Compartir → "Cualquier persona con el enlace puede VER".`);
    }
    if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
    const raw = await res.text();
    if (raw.includes('<html') || raw.includes('accounts.google'))
      throw new Error('El Sheet no es público. Ir a Compartir → "Cualquier persona puede VER".');
    const json = JSON.parse(raw.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, ''));
    if (json.status === 'error')
      throw new Error(json.errors?.[0]?.detailed_message || 'Error leyendo Sheet');
    return json.table;
  },

  // ── Parsear tabla gviz ────────────────────────────────
  _parseTable(table) {
    const rows  = table?.rows || [];
    const cols  = table?.cols || [];
    const val   = c => (c?.v !== null && c?.v !== undefined) ? String(c.v).trim() : '';
    const num   = c => parseFloat(val(c)) || 0;
    const date  = c => {
      const raw = val(c);
      if (!raw) return '';
      const m = raw.match(/^Date\((\d+),(\d+),(\d+)/);
      if (m) return new Date(+m[1], +m[2], +m[3]).toISOString();
      const d = new Date(raw);
      return isNaN(d.getTime()) ? raw : d.toISOString();
    };
    return { rows, cols, val, num, date };
  },

  // ── Cargar Catalogo → actualiza productos en DB ───────
  //  Columnas: Nombre | Categoría | Unidad | Precio Bs | Costo Bs | Stock mín.
  async loadCatalogo(onProgress) {
    onProgress?.('Leyendo catálogo desde Sheets…');
    const table = await this.readSheet('Catalogo');
    const { rows, val, num } = this._parseTable(table);

    // Solo filas con nombre
    const dataRows = rows.filter(r => r.c?.[0]?.v);
    onProgress?.(`Importando ${dataRows.length} productos…`);

    let added = 0, updated = 0;
    for (const row of dataRows) {
      const c    = row.c || [];
      const name = val(c[0]);
      if (!name) continue;

      const incoming = {
        name,
        category:  (val(c[1]) || 'extra').toLowerCase(),
        base_unit: val(c[2]) || 'unidad',
        price:     num(c[3]),
        cost:      num(c[4]),
        min_stock: num(c[5]),
        active:    true
      };

      const existing = await DB.getProductByName(name);
      if (existing) {
        // Actualizar solo campos del catálogo — preservar stock, barcodes, id
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

  // ── Cargar Inventario + Lotes (dispositivo nuevo) ─────
  //  Lee el estado completo desde Sheets y reconstruye la DB local
  async loadState(onProgress) {
    onProgress?.('Cargando inventario desde Sheets…');
    const invTable = await this.readSheet('Inventario');
    const { rows: invRows, val, num } = this._parseTable(invTable);

    // Limpiar DB local
    await DB.clearAll();

    // Reconstruir productos desde Inventario
    const prodDataRows = invRows.filter(r => r.c?.[1]?.v);
    onProgress?.(`Importando ${prodDataRows.length} productos…`);
    for (const row of prodDataRows) {
      const c = row.c || [];
      let barcodes = [];
      try { barcodes = JSON.parse(val(c[8]) || '[]'); } catch (_) {}
      await DB.addProduct({
        name:      val(c[1]),
        category:  val(c[2]) || 'extra',
        base_unit: val(c[3]) || 'unidad',
        cost:      num(c[4]),
        price:     num(c[5]),
        stock:     num(c[6]),
        min_stock: num(c[7]),
        barcodes,
        active:    true
      });
    }

    // Reconstruir lotes desde Lotes sheet
    onProgress?.('Cargando lotes FIFO…');
    const lotTable = await this.readSheet('Lotes');
    const { rows: lotRows, val: lval, num: lnum, date: ldate } = this._parseTable(lotTable);
    const lotDataRows = lotRows.filter(r => r.c?.[1]?.v);

    for (const row of lotDataRows) {
      const c    = row.c || [];
      const name = lval(c[1]);
      if (!name) continue;
      const prod = await DB.getProductByName(name);
      if (!prod) continue;
      await DB._add('lots', {
        product_id:    prod.id,
        date:          ldate(c[2]) || new Date().toISOString(),
        cost:          lnum(c[3]),
        qty_initial:   lnum(c[4]),
        qty_remaining: lnum(c[5]),
        notes:         lval(c[6]) || ''
      });
    }

    // Recalcular stock de cada producto desde sus lotes
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
