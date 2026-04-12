// ═══════════════════════════════════════════════════════════════
//  POS Licorería — Google Apps Script
//  Pega este código en: Google Sheets → Extensiones → Apps Script
//  Luego: Implementar → Nueva implementación → Web App
//    · Ejecutar como: Yo (mi cuenta)
//    · Quién tiene acceso: Cualquier persona
//  Copia la URL y pégala en POS → Configuración
// ═══════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const action = e.parameter.action;
    const data   = JSON.parse(e.parameter.data || '{}');
    const ss     = SpreadsheetApp.getActiveSpreadsheet();

    if      (action === 'addSale')       addSale(ss, data);
    else if (action === 'syncProducts')  syncProducts(ss, data);
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

  const headers = ['ID','Nombre','Categoría','Unidad','Costo adq. Bs','Precio venta Bs','Stock'];
  sh.appendRow(headers);
  sh.getRange(1,1,1,headers.length)
    .setFontWeight('bold').setBackground('#0D1117').setFontColor('#00E5CC');
  sh.setFrozenRows(1);

  for (const p of products) {
    sh.appendRow([p.id, p.name, p.category, p.base_unit, p.cost, p.price, p.stock]);
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
