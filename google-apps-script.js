// ═══════════════════════════════════════════════════════════════
//  POS Licorería — Google Apps Script
//  Pega este código en: Google Sheets → Extensiones → Apps Script
//  Luego: Implementar → Nueva implementación → Web App
//    · Ejecutar como: Yo (mi cuenta)
//    · Quién tiene acceso: Cualquier persona
//  Copia la URL y pégala en POS → Configuración
// ═══════════════════════════════════════════════════════════════

// ── Leer catálogo de productos (GET) ────────────────────────
// El POS llama: fetch(url + '?action=getProducts')
// La hoja "Catalogo" debe tener esta cabecera en la fila 1:
//   A: Nombre | B: Categoría | C: Unidad | D: Precio Bs | E: Costo Bs | F: Stock mín.
// Categorías válidas: cerveza, bebida, vino, licor, singani, refresco, cigarrillo, extra
function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'getProducts') {
      let sh = ss.getSheetByName('Catalogo');
      if (!sh) {
        // Crear la hoja con cabecera de ejemplo si no existe
        sh = ss.insertSheet('Catalogo');
        const headers = ['Nombre','Categoría','Unidad','Precio Bs','Costo Bs','Stock mín.'];
        sh.appendRow(headers);
        sh.getRange(1,1,1,headers.length)
          .setFontWeight('bold').setBackground('#0D1117').setFontColor('#00E5CC');
        sh.setFrozenRows(1);
        return ContentService
          .createTextOutput(JSON.stringify([]))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const rows = sh.getDataRange().getValues();
      const products = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue; // fila vacía
        products.push({
          name:      String(r[0]).trim(),
          category:  String(r[1]).trim().toLowerCase() || 'extra',
          base_unit: String(r[2]).trim() || 'unidad',
          price:     parseFloat(r[3]) || 0,
          cost:      parseFloat(r[4]) || 0,
          stock_min: parseFloat(r[5]) || 0
        });
      }
      return ContentService
        .createTextOutput(JSON.stringify(products))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const action = e.parameter.action;
    const data   = JSON.parse(e.parameter.data || '{}');
    const ss     = SpreadsheetApp.getActiveSpreadsheet();

    if      (action === 'addSale')       addSale(ss, data);
    else if (action === 'syncProducts')  syncProducts(ss, data);
    else if (action === 'syncLots')      syncLots(ss, data);
    else if (action === 'addMovement')   addMovement(ss, data);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Ventas ──────────────────────────────────────────────────
function addSale(ss, sale) {
  let sh = ss.getSheetByName('Ventas');
  if (!sh) {
    sh = ss.insertSheet('Ventas');
    const headers = ['ID','Fecha','Hora','Total Bs','COGS Bs','Ganancia Bs','Método','Ítems'];
    sh.appendRow(headers);
    sh.getRange(1,1,1,headers.length)
      .setFontWeight('bold').setBackground('#0D1117').setFontColor('#00E5CC');
    sh.setFrozenRows(1);
  }
  const d     = new Date(sale.date);
  const tz    = 'America/La_Paz';
  const fecha = Utilities.formatDate(d, tz, 'dd/MM/yyyy');
  const hora  = Utilities.formatDate(d, tz, 'HH:mm');
  const items = (sale.items || [])
    .map(i => `${i.qty}× ${i.product_name} (Bs ${i.lineTotal.toFixed(2)})`)
    .join(' | ');

  sh.appendRow([
    sale.id, fecha, hora,
    sale.total        || 0,
    sale.total_cogs   || 0,
    sale.gross_profit || 0,
    sale.payment,
    items
  ]);
}

// ── Productos ────────────────────────────────────────────────
function syncProducts(ss, products) {
  let sh = ss.getSheetByName('Productos');
  if (!sh) sh = ss.insertSheet('Productos');
  sh.clearContents();

  const headers = ['ID','Nombre','Categoría','Unidad','Costo adq. Bs','Precio venta Bs','Stock','Códigos'];
  sh.appendRow(headers);
  sh.getRange(1,1,1,headers.length)
    .setFontWeight('bold').setBackground('#0D1117').setFontColor('#00E5CC');
  sh.setFrozenRows(1);

  for (const p of products) {
    const codigosJson = JSON.stringify(p.barcodes || []);
    sh.appendRow([p.id, p.name, p.category, p.base_unit, p.cost, p.price, p.stock, codigosJson]);
  }
}

// ── Lotes FIFO ───────────────────────────────────────────────
// Reemplaza la hoja "Lotes" con el estado actual completo
// Columnas: ID_Lote | Fecha_creacion | Producto | Fecha | Costo/ud | Inicial | Restante | Notas
function syncLots(ss, lots) {
  let sh = ss.getSheetByName('Lotes');
  if (!sh) sh = ss.insertSheet('Lotes');
  sh.clearContents();
  const headers = ['ID_Lote','Fecha_creacion','Producto','Fecha_compra','Costo_ud_Bs','Qty_inicial','Qty_restante','Notas'];
  sh.appendRow(headers);
  sh.getRange(1,1,1,headers.length)
    .setFontWeight('bold').setBackground('#0D1117').setFontColor('#00E5CC');
  sh.setFrozenRows(1);
  for (const l of lots) {
    sh.appendRow([
      l.id || '',
      new Date().toISOString(),
      l.product_name || '',
      l.date || '',
      l.cost || 0,
      l.qty_initial || 0,
      l.qty_remaining || 0,
      l.notes || ''
    ]);
  }
}

// ── Movimientos de inventario ────────────────────────────────
function addMovement(ss, mov) {
  let sh = ss.getSheetByName('Movimientos');
  if (!sh) {
    sh = ss.insertSheet('Movimientos');
    const headers = ['Fecha','Producto ID','Tipo','Cantidad','Notas'];
    sh.appendRow(headers);
    sh.getRange(1,1,1,headers.length)
      .setFontWeight('bold').setBackground('#0D1117').setFontColor('#00E5CC');
    sh.setFrozenRows(1);
  }
  const fecha = Utilities.formatDate(
    new Date(mov.date), 'America/La_Paz', 'dd/MM/yyyy HH:mm'
  );
  sh.appendRow([fecha, mov.product_id, mov.type, mov.qty, mov.notes || '']);
}
