// ═══════════════════════════════════════════════════════
//  POS Licorería — Google Apps Script
//
//  INSTRUCCIONES:
//  1. Abrir el Google Sheet → Extensiones → Apps Script
//  2. Borrar todo lo que hay y pegar este código completo
//  3. Implementar → Nueva implementación → Aplicación web
//     - Ejecutar como: Yo
//     - Acceso:        Cualquier usuario (incluso anónimo)
//  4. Copiar la URL generada y pegarla en config.js → APPS_SCRIPT_URL
//
//  CADA VEZ QUE SE MODIFICA EL SCRIPT:
//  Implementar → Administrar implementaciones → Editar → Nueva versión → Implementar
//
//  REGLA GENERAL DE ESCRITURA:
//  - Catalogo / Inventario → upsert por nombre (update si existe, append si es nuevo)
//  - Lotes      → append al agregar, update solo qty_remaining al vender
//  - Ventas     → append al vender · editVenta permite corregir una fila existente por ID
//  - Movimientos → solo append, NUNCA modificar
// ═══════════════════════════════════════════════════════

function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    var accion = data.accion;

    // Verificar que las hojas necesarias existen
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var hojas  = ss.getSheets().map(function(s) { return s.getName(); });
    var requeridas = ['Inventario','Catalogo','Lotes','Ventas','Movimientos'];
    for (var i = 0; i < requeridas.length; i++) {
      if (hojas.indexOf(requeridas[i]) === -1) {
        return respError('Hoja no encontrada: "' + requeridas[i] + '" — hojas existentes: ' + hojas.join(', '));
      }
    }

    if (accion === 'saveProduct')   return saveProduct(data);
    if (accion === 'deleteProduct') return deleteProduct(data);
    if (accion === 'addLote')       return addLote(data);
    if (accion === 'updateLote')    return updateLote(data);
    if (accion === 'editLote')      return editLote(data);
    if (accion === 'deleteLote')    return deleteLote(data);
    if (accion === 'addVenta')      return addVenta(data);
    if (accion === 'editVenta')     return editVenta(data);
    if (accion === 'deleteVenta')   return deleteVenta(data);
    if (accion === 'addMovimiento') return addMovimiento(data);

    return ok('accion desconocida: ' + accion);
  } catch (err) {
    return respError(err.toString());
  }
}

// ════════════════════════════════════════════════════════
//  PRODUCTO — upsert en Inventario y Catálogo
//  Busca la fila por nombre. Si existe → actualiza esa fila.
//  Si no existe → append. NUNCA borra ni reescribe otras filas.
// ════════════════════════════════════════════════════════
function saveProduct(d) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var fecha = d.fecha || new Date().toISOString();

  // ── Inventario: ID | Nombre | Categoría | Unidad | Costo Bs | Precio Bs | Stock | Stock mín. | Códigos ──
  // El stock viene calculado desde el cliente (post-FIFO), es la fuente más confiable
  var inv    = ss.getSheetByName('Inventario');
  var stock  = (d.stock !== undefined && d.stock !== '') ? d.stock : calcStockDesdeLotes(ss, d.name);
  var invRow = [d.id||'', d.name, d.category, d.base_unit,
                d.cost, d.price, stock, d.min_stock, d.barcodes||'[]'];
  var invNum = findRowByCol(inv, 1, d.name);  // col B = Nombre
  if (invNum > 0) {
    inv.getRange(invNum, 1, 1, invRow.length).setValues([invRow]);
  } else {
    inv.appendRow(invRow);
  }

  // ── Catálogo (col A = nombre, índice 0) ──
  var cat    = ss.getSheetByName('Catalogo');
  var catRow = [d.name, d.category, d.base_unit, d.price, d.cost, d.min_stock];
  var catNum = findRowByCol(cat, 0, d.name);  // col A
  if (catNum > 0) {
    cat.getRange(catNum, 1, 1, catRow.length).setValues([catRow]);
  } else {
    cat.appendRow(catRow);
  }

  return ok('producto guardado');
}

// ════════════════════════════════════════════════════════
//  PRODUCTO — eliminar fila exacta en Inventario y Catálogo
// ════════════════════════════════════════════════════════
function deleteProduct(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var inv    = ss.getSheetByName('Inventario');
  var invNum = findRowByCol(inv, 1, d.name);
  if (invNum > 0) inv.deleteRow(invNum);

  var cat    = ss.getSheetByName('Catalogo');
  var catNum = findRowByCol(cat, 0, d.name);
  if (catNum > 0) cat.deleteRow(catNum);

  return ok('producto eliminado');
}

// ════════════════════════════════════════════════════════
//  LOTE — append solo si el ID no existe ya (evita duplicados)
//  Columnas: ID | Nombre | Fecha compra | Costo | Qty ini | Qty rest | Notas | Vencimiento
// ════════════════════════════════════════════════════════
function addLote(d) {
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lotes');
  var id     = String(d.id || '').trim();
  // Si el lote ya existe por ID, no duplicar — solo actualizar qty_remaining
  if (id) {
    var rowNum = findRowByCol(sheet, 0, id);
    if (rowNum > 0) {
      sheet.getRange(rowNum, 6).setValue(d.qty_remaining || 0);
      return ok('lote ' + id + ' ya existe — qty_remaining actualizado');
    }
  }
  sheet.appendRow([
    id, d.product_name||'', d.date||'',
    d.cost||0, d.qty_initial||0, d.qty_remaining||0, d.notes||'',
    d.expiry||''
  ]);
  return ok('lote agregado id=' + id);
}

// ════════════════════════════════════════════════════════
//  LOTE — editar todos los campos de una fila existente
//  Columnas: A=ID | B=Nombre | C=Fecha compra | D=Costo | E=Qty ini | F=Qty rest | G=Notas | H=Vencimiento
// ════════════════════════════════════════════════════════
function editLote(d) {
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lotes');
  var rowNum = findRowByCol(sheet, 0, String(d.id));
  if (rowNum < 0) {
    return respError('Lote "' + d.id + '" no encontrado en Lotes');
  }
  // Formatear fecha compra y vencimiento a dd/MM/yyyy si vienen como ISO
  function fmtIso(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  sheet.getRange(rowNum, 2).setValue(d.product_name  || '');  // B: Nombre
  sheet.getRange(rowNum, 3).setValue(fmtIso(d.date));          // C: Fecha compra
  sheet.getRange(rowNum, 4).setValue(d.cost           || 0);   // D: Costo/u
  sheet.getRange(rowNum, 5).setValue(d.qty_initial    || 0);   // E: Qty inicial
  sheet.getRange(rowNum, 6).setValue(d.qty_remaining  || 0);   // F: Qty restante
  sheet.getRange(rowNum, 7).setValue(d.notes          || '');  // G: Notas
  sheet.getRange(rowNum, 8).setValue(fmtIso(d.expiry));        // H: Vencimiento
  return ok('lote ' + d.id + ' editado');
}

// ════════════════════════════════════════════════════════
//  LOTE — eliminar fila por lot_uid (col A)
// ════════════════════════════════════════════════════════
function deleteLote(d) {
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lotes');
  var rowNum = findRowByCol(sheet, 0, String(d.id));
  if (rowNum < 0) {
    return respError('Lote con ID "' + d.id + '" no encontrado en la hoja Lotes');
  }
  sheet.deleteRow(rowNum);
  return ok('lote ' + d.id + ' eliminado');
}

// ════════════════════════════════════════════════════════
//  LOTE — actualizar SOLO qty_remaining de una fila existente
//  Busca por ID (col A) — identificador único por lote.
//  No toca ninguna otra columna ni ninguna otra fila.
// ════════════════════════════════════════════════════════
function updateLote(d) {
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lotes');
  var rowNum = -1;

  // Buscar por ID exacto (col A) — única forma segura con múltiples lotes
  if (d.id) {
    rowNum = findRowByCol(sheet, 0, String(d.id));
  }

  if (rowNum > 0) {
    sheet.getRange(rowNum, 6).setValue(d.qty_remaining); // col F = qty_remaining
    return ok('lote ' + d.id + ' actualizado → qty_remaining=' + d.qty_remaining);
  }
  return ok('lote id=' + d.id + ' no encontrado en Lotes');
}

// ════════════════════════════════════════════════════════
//  VENTA — solo append, nunca modifica filas existentes
//  ID | Fecha | Hora | Total Bs | COGS Bs | Ganancia Bs | Método | Ítems
// ════════════════════════════════════════════════════════
function addVenta(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ventas');

  // Fecha de la venta: la que eligió el usuario en el formulario (puede ser retroactiva)
  var dtVenta = new Date(d.date);
  var fecha   = Utilities.formatDate(dtVenta, Session.getScriptTimeZone(), 'dd/MM/yyyy');

  // Hora y ID: siempre el momento REAL del cobro (now), nunca la fecha del formulario
  // Así dos ventas distintas nunca tienen el mismo ID aunque compartan fecha de venta
  var now  = new Date();
  var hora = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');
  var id   = 'VTA-' + now.getTime().toString(36).toUpperCase()
             + '-' + Math.floor(Math.random() * 1000).toString(36).toUpperCase();

  sheet.appendRow([
    id, fecha, hora,
    d.total, d.total_cogs||0, d.gross_profit||0,
    d.payment, d.items||'[]'
  ]);
  return ok('venta registrada · id=' + id);
}

// ════════════════════════════════════════════════════════
//  VENTA — editar fila existente por ID (col A)
//  Busca la venta por ID y sobreescribe los campos editables.
//  ID | Fecha | Hora | Total Bs | COGS Bs | Ganancia Bs | Método | Ítems
// ════════════════════════════════════════════════════════
function editVenta(d) {
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ventas');
  var rowNum = findRowByCol(sheet, 0, String(d.id));   // busca por col A (ID)
  if (rowNum < 0) {
    return respError('Venta con ID "' + d.id + '" no encontrada en la hoja Ventas');
  }
  // Sobreescribir columnas B–H (2–8): Fecha | Hora | Total | COGS | Ganancia | Método | Ítems
  sheet.getRange(rowNum, 2).setValue(d.fecha        || '');   // B: Fecha dd/MM/yyyy
  sheet.getRange(rowNum, 3).setValue(d.hora         || '');   // C: Hora HH:MM
  sheet.getRange(rowNum, 4).setValue(d.total        || 0);    // D: Total Bs
  sheet.getRange(rowNum, 5).setValue(d.total_cogs   || 0);    // E: COGS Bs
  sheet.getRange(rowNum, 6).setValue(d.gross_profit || 0);    // F: Ganancia Bs
  sheet.getRange(rowNum, 7).setValue(d.payment      || '');   // G: Método
  sheet.getRange(rowNum, 8).setValue(d.items        || '[]'); // H: Ítems JSON
  return ok('venta ' + d.id + ' actualizada');
}

// ════════════════════════════════════════════════════════
//  VENTA — eliminar fila por ID (col A)
// ════════════════════════════════════════════════════════
function deleteVenta(d) {
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ventas');
  var rowNum = findRowByCol(sheet, 0, String(d.id));
  if (rowNum < 0) {
    return respError('Venta con ID "' + d.id + '" no encontrada');
  }
  sheet.deleteRow(rowNum);
  return ok('venta ' + d.id + ' eliminada');
}

// ════════════════════════════════════════════════════════
//  MOVIMIENTO — solo append, nunca modifica filas existentes
// ════════════════════════════════════════════════════════
function addMovimiento(d) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Movimientos');
  sheet.appendRow([
    d.date, d.product_name||'', d.type,
    d.qty, d.cost||0, d.notes||'', d.usuario||''
  ]);
  return ok('movimiento registrado');
}

// ════════════════════════════════════════════════════════
//  HELPER — calcular stock real sumando qty_remaining de Lotes
//  Hoja Lotes: col B(1)=Nombre | col F(5)=qty_remaining
// ════════════════════════════════════════════════════════
function calcStockDesdeLotes(ss, productName) {
  var sheet = ss.getSheetByName('Lotes');
  var data  = sheet.getDataRange().getValues();
  var total = 0;
  var name  = String(productName).trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === name) {
      var qty = parseFloat(data[i][5]) || 0;
      if (qty > 0) total += qty;
    }
  }
  return total;
}

// ════════════════════════════════════════════════════════
//  HELPER — buscar número de fila (1-based) por valor de columna
//  Ignora la fila 1 (cabecera). Devuelve -1 si no encuentra.
// ════════════════════════════════════════════════════════
function findRowByCol(sheet, colIndex, value) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]).trim().toLowerCase() === String(value).trim().toLowerCase()) {
      return i + 1;
    }
  }
  return -1;
}

// ════════════════════════════════════════════════════════
//  HELPERS de respuesta
// ════════════════════════════════════════════════════════
function ok(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, msg: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
function respError(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════
//  FUNCIÓN DE PRUEBA — ejecutar desde el editor de Apps Script
// ════════════════════════════════════════════════════════
function testAddVenta() {
  var e = {
    postData: {
      contents: JSON.stringify({
        accion:       'addVenta',
        date:         new Date().toISOString(),
        total:        50,
        payment:      'efectivo',
        total_cogs:   30,
        gross_profit: 20,
        received:     50,
        change:       0,
        items:        '[]',
        usuario:      'MIUSHA'
      })
    }
  };
  Logger.log(doPost(e).getContent());
}
