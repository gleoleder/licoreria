// ═══════════════════════════════════════════════════════
//  POS v2 — Módulo Google Sheets
//  Lee  → Sheets API v4 con API Key (sin auth)
//  Escribe → Sheets API v4 con OAuth 2.0 (Google Identity Services)
// ═══════════════════════════════════════════════════════

const Sheets = {

  _id()       { return (typeof SHEETS_ID       !== 'undefined' ? SHEETS_ID       : '').trim(); },
  _apiKey()   { return (typeof SHEETS_API_KEY  !== 'undefined' ? SHEETS_API_KEY  : '').trim(); },
  _clientId() { return (typeof SHEETS_CLIENT_ID !== 'undefined' ? SHEETS_CLIENT_ID : '').trim(); },

  isConfigured() { return !!this._id() && !!this._apiKey(); },

  // ── Estado OAuth ──────────────────────────────────────
  _token:       null,
  _tokenClient: null,
  _sheetIds:    {},   // caché: nombre → sheetId numérico

  // Llamado desde init() en app.js tras cargar el script GIS
  initAuth() {
    if (!this._clientId()) return;
    const load = () => {
      this._tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this._clientId(),
        scope:     'https://www.googleapis.com/auth/spreadsheets',
        callback:  resp => {
          if (resp.error) { console.warn('[Sheets Auth]', resp.error); return; }
          this._token = resp.access_token;
          this._updateAuthUI(true);
          console.log('[Sheets] OAuth OK');
        }
      });
      // Intento silencioso: si ya autorizó antes, no muestra nada
      this._tokenClient.requestAccessToken({ prompt: '' });
    };
    if (typeof google !== 'undefined') { load(); }
    else { window.addEventListener('gsi-loaded', load, { once: true }); }
  },

  // Botón manual "Conectar Google" en la cabecera
  requestAuth() {
    if (!this._tokenClient) return;
    this._tokenClient.requestAccessToken({ prompt: 'select_account' });
  },

  _updateAuthUI(ok) {
    const btn = document.getElementById('btnGoogleAuth');
    if (!btn) return;
    if (ok) {
      btn.textContent = 'Google ✓';
      btn.style.color = 'var(--green)';
      btn.title = 'Conectado — escritura habilitada';
    }
  },

  // ── GET (API Key, sin auth) ───────────────────────────
  async readSheet(sheetName) {
    const id  = this._id();
    const key = this._apiKey();
    if (!id || !key) throw new Error('Sheets no configurado en config.js');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(sheetName)}?key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      let msg = err?.error?.message || `Error ${res.status}`;
      if (res.status === 403) msg += ' — Habilita la Google Sheets API en Google Cloud Console.';
      throw new Error(msg);
    }
    const json = await res.json();
    return json.values || [];
  },

  // ── POST/PUT con Bearer token ─────────────────────────
  async _write(method, path, body) {
    if (!this._token) {
      // Sin token: pedir auth y reintentar automáticamente
      return new Promise((resolve, reject) => {
        if (!this._tokenClient) { reject(new Error('OAuth no inicializado')); return; }
        const orig = this._tokenClient._callback;
        this._tokenClient._callback = resp => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          this._token = resp.access_token;
          this._updateAuthUI(true);
          this._write(method, path, body).then(resolve).catch(reject);
        };
        this._tokenClient.requestAccessToken({ prompt: 'select_account' });
      });
    }
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this._id()}${path}`;
    const res = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${this._token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) {
      this._token = null;
      return this._write(method, path, body); // reintentar con token nuevo
    }
    return res.json().catch(() => null);
  },

  // ── Buscar fila por valor de columna ──────────────────
  async _findRow(sheetName, colIdx, value) {
    const rows = await this.readSheet(sheetName);
    for (let i = 1; i < rows.length; i++) {   // i=0 es cabecera
      if ((rows[i][colIdx] ?? '').toString().trim() === String(value).trim()) {
        return i + 1; // número de fila 1-based en el sheet
      }
    }
    return -1;
  },

  // ── sheetId numérico (para deleteDimension) ───────────
  async _getSheetId(sheetName) {
    if (this._sheetIds[sheetName] != null) return this._sheetIds[sheetName];
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this._id()}?key=${encodeURIComponent(this._apiKey())}&fields=sheets.properties`;
    const res  = await fetch(url);
    const json = await res.json();
    for (const s of (json.sheets || [])) {
      this._sheetIds[s.properties.title] = s.properties.sheetId;
    }
    return this._sheetIds[sheetName] ?? 0;
  },

  // ── Inventario: upsert por nombre ─────────────────────
  //  Columnas: ID | Nombre | Categoría | Unidad | Costo | Precio | Stock | Stock mín. | Barcodes
  async saveProduct(p) {
    const row    = [[p.id||'', p.name, p.category, p.base_unit, p.cost, p.price, p.stock, p.min_stock, JSON.stringify(p.barcodes||[])]];
    const rowNum = await this._findRow('Inventario', 1, p.name);
    if (rowNum > 0) {
      // Actualizar fila existente
      await this._write('PUT',
        `/values/Inventario!A${rowNum}:I${rowNum}?valueInputOption=USER_ENTERED`,
        { range: `Inventario!A${rowNum}:I${rowNum}`, majorDimension: 'ROWS', values: row }
      );
    } else {
      // Agregar fila nueva al final
      await this._write('POST',
        `/values/Inventario!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { range: 'Inventario!A:I', majorDimension: 'ROWS', values: row }
      );
    }
  },

  // ── Inventario: eliminar fila por nombre ──────────────
  async deleteProd(p) {
    const rowNum = await this._findRow('Inventario', 1, p.name);
    if (rowNum < 0) return;
    const sheetId = await this._getSheetId('Inventario');
    await this._write('POST', ':batchUpdate', {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum }
        }
      }]
    });
  },

  // ── Lotes: sync completo (reescribe la hoja entera) ───
  async syncLotes() {
    const lots  = await DB.getLots();
    const prods = await DB.getActiveProducts();
    const header = [['ID','Nombre','Fecha','Costo','Qty inicial','Qty restante','Notas']];
    const rows   = lots.map(l => [
      l.id||'',
      prods.find(p => p.id === l.product_id)?.name || '',
      l.date, l.cost, l.qty_initial, l.qty_remaining, l.notes||''
    ]);
    const all = [...header, ...rows];
    await this._write('PUT',
      `/values/Lotes!A1:G${all.length}?valueInputOption=USER_ENTERED`,
      { range: `Lotes!A1:G${all.length}`, majorDimension: 'ROWS', values: all }
    );
  },

  // ── Ventas: solo append (nunca se editan) ─────────────
  async addVenta(s) {
    const row = [[
      s.date, s.total, s.payment,
      s.total_cogs||0, s.gross_profit||0,
      s.received||s.total, s.change||0,
      JSON.stringify(s.items||[])
    ]];
    await this._write('POST',
      `/values/Ventas!A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { range: 'Ventas!A:H', majorDimension: 'ROWS', values: row }
    );
  },

  // ── Movimientos: solo append ──────────────────────────
  async addMovimiento(m) {
    const row = [[m.date, m.product_name||'', m.type, m.qty, m.cost||0, m.notes||'']];
    await this._write('POST',
      `/values/Movimientos!A:F:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { range: 'Movimientos!A:F', majorDimension: 'ROWS', values: row }
    );
  },

  // ── Helpers parseo ────────────────────────────────────
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

  // ── Cargar Catálogo → primera vez / sin Inventario ────
  //  Cabeceras fila 1: Nombre | Categoría | Unidad | Precio Bs | Costo Bs | Stock mín.
  async loadCatalogo(onProgress) {
    onProgress?.('Leyendo catálogo desde Sheets…');
    const rows = await this.readSheet('Catalogo');
    const { val, num } = this._helpers();
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
        await DB.saveProduct({ ...existing, ...incoming, active: true });
        updated++;
      } else {
        await DB.addProduct({ ...incoming, stock: 0, barcodes: [] });
        added++;
      }
    }
    onProgress?.(`✓ ${added} nuevos · ${updated} actualizados`);
    return { added, updated };
  },

  // ── Cargar estado completo desde Inventario + Lotes ───
  async loadState(onProgress) {
    onProgress?.('Cargando inventario desde Sheets…');
    const invRows = await this.readSheet('Inventario');
    const { val, num } = this._helpers();
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

    const prods = await DB.getActiveProducts();
    for (const p of prods) await DB.recalcStock(p.id);
    onProgress?.('¡Estado cargado!');
  }
};
