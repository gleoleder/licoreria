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

  // ── Verificar acceso desde hoja Usuarios ──────────────
  //  Hoja "Usuarios": col A = Email | col B = Nombre | col C = Activo (si/no)
  async checkUserAccess(email) {
    try {
      const rows = await this.readSheet('Usuarios');
      const { val } = this._helpers();
      return rows.slice(1).some(row => {
        const rowEmail = val(row, 0).toLowerCase();
        const activo   = val(row, 2).toLowerCase();
        return rowEmail === email.toLowerCase() && activo !== 'no';
      });
    } catch (e) {
      console.warn('[Sheets] No se pudo leer hoja Usuarios:', e);
      return false;
    }
  },

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

  // ── Inventario + Catálogo: upsert por nombre ──────────
  //  Inventario:  ID | Nombre | Categoría | Unidad | Costo | Precio | Stock | Stock mín. | Barcodes
  //  Catálogo:   Nombre | Categoría | Unidad | Precio Bs | Costo Bs | Stock mín.
  async saveProduct(p) {
    // Inventario
    const invRow = [[p.id||'', p.name, p.category, p.base_unit, p.cost, p.price, p.stock, p.min_stock, JSON.stringify(p.barcodes||[])]];
    const invNum = await this._findRow('Inventario', 1, p.name);
    if (invNum > 0) {
      await this._write('PUT',
        `/values/Inventario!A${invNum}:I${invNum}?valueInputOption=USER_ENTERED`,
        { range: `Inventario!A${invNum}:I${invNum}`, majorDimension: 'ROWS', values: invRow }
      );
    } else {
      await this._write('POST',
        `/values/Inventario!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { range: 'Inventario!A:I', majorDimension: 'ROWS', values: invRow }
      );
    }

    // Catálogo (misma lógica, columnas distintas, nombre en col 0)
    const catRow = [[p.name, p.category, p.base_unit, p.price, p.cost, p.min_stock]];
    const catNum = await this._findRow('Catalogo', 0, p.name);
    if (catNum > 0) {
      await this._write('PUT',
        `/values/Catalogo!A${catNum}:F${catNum}?valueInputOption=USER_ENTERED`,
        { range: `Catalogo!A${catNum}:F${catNum}`, majorDimension: 'ROWS', values: catRow }
      );
    } else {
      await this._write('POST',
        `/values/Catalogo!A:F:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { range: 'Catalogo!A:F', majorDimension: 'ROWS', values: catRow }
      );
    }
  },

  // ── Inventario + Catálogo: eliminar fila por nombre ───
  async deleteProd(p) {
    // Obtener sheetIds en paralelo
    const [invSheetId, catSheetId] = await Promise.all([
      this._getSheetId('Inventario'),
      this._getSheetId('Catalogo')
    ]);
    const [invNum, catNum] = await Promise.all([
      this._findRow('Inventario', 1, p.name),
      this._findRow('Catalogo',   0, p.name)
    ]);

    const requests = [];
    if (invNum > 0) requests.push({
      deleteDimension: { range: { sheetId: invSheetId, dimension: 'ROWS', startIndex: invNum - 1, endIndex: invNum } }
    });
    if (catNum > 0) requests.push({
      deleteDimension: { range: { sheetId: catSheetId, dimension: 'ROWS', startIndex: catNum - 1, endIndex: catNum } }
    });
    if (!requests.length) return;

    // Borrar de mayor a menor índice para no desplazar filas
    requests.sort((a, b) => b.deleteDimension.range.startIndex - a.deleteDimension.range.startIndex);
    await this._write('POST', ':batchUpdate', { requests });
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

  // ── Carga unificada: Catálogo + Inventario + Lotes ───
  //
  //  Catálogo   → fuente de verdad para definiciones (nombre, precio, categoría…)
  //               Editar aquí = cambios visibles en la app al recargar
  //  Inventario → fuente de verdad para stock actual y barcodes
  //  Lotes      → FIFO para costeo
  //
  //  Flujo: lee Catálogo (lista maestra) → cruza con Inventario para stock
  //         → si un producto está en Catálogo pero no en Inventario, stock = 0
  //         → si un producto está en Inventario pero no en Catálogo, se ignora
  async loadFromSheets(onProgress) {
    onProgress?.('Leyendo catálogo…');
    const { val, num, date } = this._helpers();

    // 1. Catálogo: definiciones de productos
    const catRows  = await this.readSheet('Catalogo');
    const catProds = catRows.slice(1).filter(r => r[0]).map(row => ({
      name:      val(row, 0),
      category:  (val(row, 1) || 'extra').toLowerCase(),
      base_unit: val(row, 2) || 'unidad',
      price:     num(row, 3),
      cost:      num(row, 4),
      min_stock: num(row, 5)
    }));
    if (!catProds.length) throw new Error('Catálogo vacío en Sheets');

    // 2. Inventario: stock + barcodes (por nombre, clave insensible a mayúsculas)
    onProgress?.('Leyendo inventario…');
    const stockMap    = {};   // nombre.lower → stock
    const barcodesMap = {};   // nombre.lower → barcodes[]
    try {
      const invRows = await this.readSheet('Inventario');
      for (const row of invRows.slice(1).filter(r => r[1])) {
        const key = val(row, 1).toLowerCase();
        stockMap[key] = num(row, 6);
        try { barcodesMap[key] = JSON.parse(val(row, 8) || '[]'); } catch (_) {}
      }
    } catch (_) { /* Inventario puede estar vacío la primera vez */ }

    // 3. Reconstruir DB local fusionando ambas hojas
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

    // 4. Lotes FIFO
    onProgress?.('Cargando lotes FIFO…');
    try {
      const lotRows = await this.readSheet('Lotes');
      const { val: lv, num: ln, date: ld } = this._helpers();
      for (const row of lotRows.slice(1).filter(r => r[1])) {
        const prod = await DB.getProductByName(lv(row, 1));
        if (!prod) continue;
        await DB._add('lots', {
          product_id:    prod.id,
          date:          ld(row, 2) || new Date().toISOString(),
          cost:          ln(row, 3),
          qty_initial:   ln(row, 4),
          qty_remaining: ln(row, 5),
          notes:         lv(row, 6) || ''
        });
      }
      const prods = await DB.getActiveProducts();
      for (const p of prods) await DB.recalcStock(p.id);
    } catch (_) { /* sin lotes */ }

    onProgress?.('¡Listo!');
  },

  // Aliases para compatibilidad con llamadas existentes en app.js
  loadCatalogo(onProgress) { return this.loadFromSheets(onProgress); },
  loadState(onProgress)    { return this.loadFromSheets(onProgress); }
};
