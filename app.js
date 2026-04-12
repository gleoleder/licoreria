// ═══════════════════════════════════════════════════════════════
//  APP — POS Licores & Bebidas
// ═══════════════════════════════════════════════════════════════

// ── Estado global ──────────────────────────────────────────────
let cart       = [];          // { product, barcode, qty, lineTotal }
let editProdId = null;        // id del producto en edición
let adjProdId  = null;        // id del producto en ajuste stock
let lastSaleId = null;        // último ID de venta para ticket
let payMethod  = 'efectivo';

// ── Helpers ────────────────────────────────────────────────────
const fmt = n => `Bs ${Number(n).toFixed(2)}`;
const fmtN = n => Number(n).toFixed(2);

// ── Google Sheets sync ─────────────────────────────────────────
const SHEETS = {
  url()  { return (typeof SHEETS_URL !== 'undefined' ? SHEETS_URL : '') || ''; },
  async send(action, data) {
    const url = this.url();
    if (!url) return;
    try {
      // URLSearchParams → application/x-www-form-urlencoded
      // Es el único encoding que Apps Script lee de forma confiable en e.parameter
      const params = new URLSearchParams();
      params.append('action', action);
      params.append('data', JSON.stringify(data));
      await fetch(url, { method: 'POST', mode: 'no-cors', body: params });
    } catch (e) {
      console.warn('Sheets sync error:', e);
    }
  },
  async syncProducts() {
    const prods = await DB.getActiveProducts();
    await this.send('syncProducts', prods);
  }
};

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast show ${type}`;
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.remove('show'), 3000);
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function clockTick() {
  const el = document.getElementById('headerClock');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  }
}

// ── Navegación ─────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${view}`).classList.add('active');
      if (view === 'productos')    renderProducts();
      if (view === 'inventario')  renderInventory();
      if (view === 'ventas')      renderSales();
      if (view === 'estadisticas') renderStats();
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  POS — Carrito
// ═══════════════════════════════════════════════════════════════

function cartTotal() { return cart.reduce((s, i) => s + i.lineTotal, 0); }
function cartUnits() { return cart.reduce((s, i) => s + i.qty * i.barcode.multiplier, 0); }

function unitPrice(item) {
  return item.customPrice !== undefined ? item.customPrice : item.product.price;
}

function addToCart(product, barcode) {
  const existing = cart.find(i => i.product.id === product.id && i.barcode.code === barcode.code);
  if (existing) {
    existing.qty++;
    existing.lineTotal = existing.qty * unitPrice(existing);
  } else {
    cart.push({ product, barcode, qty: 1, lineTotal: product.price });
  }
  renderCart();
}

function setItemPrice(idx, newPrice) {
  const price = parseFloat(newPrice);
  if (isNaN(price) || price < 0) return;
  cart[idx].customPrice = price;
  cart[idx].lineTotal   = cart[idx].qty * price;
  renderCart();
}

function removeFromCart(idx) {
  cart.splice(idx, 1);
  renderCart();
}

function changeQty(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) { removeFromCart(idx); return; }
  cart[idx].lineTotal = cart[idx].qty * unitPrice(cart[idx]);
  renderCart();
}

function renderCart() {
  const list = document.getElementById('cartList');
  if (cart.length === 0) {
    list.innerHTML = `<div class="cart-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="1.5" style="filter:drop-shadow(0 0 8px var(--amber));opacity:.85">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <polyline points="1 1 5 1 7.68 14.39 4.5 17H21"/>
        <path d="M7.68 14.39L20 14l-1.7-8H6"/>
      </svg><p>Sin productos</p></div>`;
  } else {
    list.innerHTML = cart.map((item, idx) => {
      const isPack = item.barcode.multiplier > 1;
      const packBadge = isPack
        ? `<span class="ci-pack-badge">📦 ${item.barcode.label} · ${item.barcode.multiplier} und.</span>`
        : '';
      const hasDiscount = item.customPrice !== undefined && item.customPrice < item.product.price;
      const discountBadge = hasDiscount
        ? `<span class="ci-discount-badge">↓ Rebaja</span>` : '';
      const currentPrice = unitPrice(item);
      return `<div class="cart-item">
        <div>
          <div class="ci-name">${item.product.name}${packBadge}${discountBadge}</div>
          <div class="ci-meta">
            ${hasDiscount ? `<span style="text-decoration:line-through;color:var(--text3)">${fmt(item.product.price)}</span> → ` : ''}${fmt(currentPrice)} × ${item.qty}
            · ${item.qty * item.barcode.multiplier} ${item.product.base_unit}(s)
          </div>
        </div>
        <div>
          <div class="ci-controls">
            <button class="ci-qty-btn" onclick="changeQty(${idx},-1)">−</button>
            <span class="ci-qty">${item.qty}</span>
            <button class="ci-qty-btn" onclick="changeQty(${idx},1)">+</button>
            <button class="ci-remove" onclick="removeFromCart(${idx})" title="Quitar">✕</button>
          </div>
          <div class="ci-price" onclick="editItemPrice(${idx}, this)" title="Clic para cambiar precio" style="cursor:pointer">${fmt(item.lineTotal)}</div>
        </div>
      </div>`;
    }).join('');
  }

  const total = cartTotal();
  document.getElementById('posSubtotal').textContent  = fmt(total);
  document.getElementById('posTotal').textContent     = fmt(total);
  document.getElementById('posItemCount').textContent = `${cart.length} ítem(s)`;
  document.getElementById('posUnitsCount').textContent = `${cartUnits()} unidades`;
  updateChange();
}

function editItemPrice(idx, el) {
  if (el.querySelector('input')) return;
  const item    = cart[idx];
  const current = unitPrice(item);

  // Rellenar datos del modal
  document.getElementById('confirmProdName').textContent  = item.product.name;
  document.getElementById('confirmPrecioOrig').textContent = `Bs ${current.toFixed(2)}`;
  openModal('modalConfirmRebaja');

  function startEdit() {
    closeModal('modalConfirmRebaja');
    // Re-buscar el elemento por idx (el DOM pudo cambiar)
    const priceEls = document.querySelectorAll('.ci-price');
    const target   = priceEls[idx] || el;
    target.innerHTML = `<input class="ci-price-input" type="number" value="${current}" min="0" step="0.5" style="width:90px">`;
    const input      = target.querySelector('input');
    if (!input) return;
    input.focus();
    input.select();
    function applyPrice() {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val >= 0) setItemPrice(idx, val);
      else renderCart();
    }
    input.addEventListener('blur',    applyPrice);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); applyPrice(); }
      if (e.key === 'Escape') { renderCart(); }
    });
  }

  // Limpiar listeners anteriores clonando botones
  const okBtn     = document.getElementById('btnConfirmOk');
  const cancelBtn = document.getElementById('btnConfirmCancel');
  const okNew     = okBtn.cloneNode(true);
  const cancelNew = cancelBtn.cloneNode(true);
  okBtn.replaceWith(okNew);
  cancelBtn.replaceWith(cancelNew);

  okNew.addEventListener('click', startEdit);
  cancelNew.addEventListener('click', () => closeModal('modalConfirmRebaja'));
}

function updateChange() {
  const received = parseFloat(document.getElementById('cashReceived').value) || 0;
  const total    = cartTotal();
  const change   = received - total;
  document.getElementById('posChange').textContent = change >= 0 ? fmt(change) : 'Bs —';
  document.getElementById('posChange').style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
}

// ── Scan / Búsqueda ────────────────────────────────────────────
function initScan() {
  const input = document.getElementById('scanInput');
  const suggs = document.getElementById('searchSuggestions');
  let scanTimer = null;

  async function processScan(val) {
    val = val.trim();
    if (!val) return;
    const found = await DB.findByBarcode(val);
    if (found) {
      addToCart(found.product, found.barcode);
      toast(`${found.product.name}${found.barcode.label ? ' — ' + found.barcode.label : ''} agregado`, 'success');
      input.value = '';
      suggs.innerHTML = '';
      return;
    }
    const results = await DB.searchProducts(val);
    renderSuggestions(results);
  }

  input.addEventListener('input', () => {
    clearTimeout(scanTimer);
    const val = input.value.trim();
    if (!val) { suggs.innerHTML = ''; return; }
    // Auto-disparar 1.5 segundos después de dejar de escribir
    scanTimer = setTimeout(() => processScan(input.value), 1500);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(scanTimer); processScan(input.value); }
  });

  document.getElementById('btnScanClear').addEventListener('click', () => {
    clearTimeout(scanTimer);
    input.value = ''; suggs.innerHTML = ''; input.focus();
  });

  document.addEventListener('click', e => {
    if (!suggs.contains(e.target) && e.target !== input) suggs.innerHTML = '';
  });
}

function renderSuggestions(products) {
  const suggs = document.getElementById('searchSuggestions');
  if (!products.length) { suggs.innerHTML = ''; return; }
  suggs.innerHTML = products.map(p => {
    const stockBadge = p.stock <= 0 ? '<span style="color:var(--red);font-size:.7rem">SIN STOCK</span>'
      : p.stock <= p.min_stock ? `<span style="color:var(--amber);font-size:.7rem">Stock: ${p.stock}</span>`
      : `<span style="color:var(--text3);font-size:.7rem">Stock: ${p.stock}</span>`;
    return `<div class="suggestion-item" data-id="${p.id}">
      <div>
        <div class="sug-name">${p.name}</div>
        <div class="sug-meta">${p.base_unit} · ${p.category} ${stockBadge}</div>
      </div>
      <span class="sug-price">${fmt(p.price)}</span>
    </div>`;
  }).join('');

  suggs.querySelectorAll('.suggestion-item').forEach(el => {
    el.addEventListener('click', async () => {
      const p = products.find(x => x.id === parseInt(el.dataset.id));
      if (!p) return;
      // Usar primer barcode (individual) por defecto
      const bc = (p.barcodes || [])[0] || { code: '', multiplier: 1, label: 'Individual' };
      addToCart(p, bc);
      document.getElementById('scanInput').value = '';
      suggs.innerHTML = '';
      toast(`${p.name} agregado`, 'success');
    });
  });
}

// ── Pago ───────────────────────────────────────────────────────
function initPayment() {
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      payMethod = btn.dataset.method;
      document.getElementById('cashSection').style.display =
        payMethod === 'efectivo' ? 'block' : 'none';
    });
  });

  document.getElementById('cashReceived').addEventListener('input', updateChange);

  // Botones de denominación
  document.querySelectorAll('.denom-btn[data-v]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('cashReceived');
      const cur   = parseFloat(input.value) || 0;
      input.value = (cur + parseFloat(btn.dataset.v)).toFixed(2);
      updateChange();
    });
  });
  document.getElementById('denomExact').addEventListener('click', () => {
    const input = document.getElementById('cashReceived');
    input.value = cartTotal().toFixed(2);
    updateChange();
  });
  document.getElementById('denomClear').addEventListener('click', () => {
    const input = document.getElementById('cashReceived');
    input.value = '';
    updateChange();
  });

  document.getElementById('btnClearCart').addEventListener('click', () => {
    if (!cart.length) return;
    if (confirm('¿Vaciar el carrito?')) { cart = []; renderCart(); }
  });

  document.getElementById('btnPay').addEventListener('click', processSale);
}

async function processSale() {
  if (!cart.length) { toast('El carrito está vacío', 'error'); return; }

  const total    = cartTotal();
  const received = parseFloat(document.getElementById('cashReceived').value) || 0;

  if (payMethod === 'efectivo' && received < total) {
    toast('Monto recibido insuficiente', 'error'); return;
  }

  // Verificar stock
  for (const item of cart) {
    const p      = await DB.getProduct(item.product.id);
    const needed = item.qty * item.barcode.multiplier;
    if ((p.stock || 0) < needed) {
      toast(`Stock insuficiente: ${p.name} (disponible: ${p.stock})`, 'error');
      return;
    }
  }

  // Consumir stock vía FIFO y calcular COGS por ítem
  const saleItems = [];
  let   totalCogs = 0;

  for (const item of cart) {
    const units = item.qty * item.barcode.multiplier;
    const { cogs } = await DB.consumeFIFO(item.product.id, units);
    totalCogs += cogs;

    const mov = {
      product_id: item.product.id,
      date:       new Date().toISOString(),
      type:       'venta',
      qty:        -units,
      notes:      `Venta POS — ${item.barcode.label || 'individual'} × ${item.qty}`
    };
    await DB.addMovement(mov);
    SHEETS.send('addMovement', mov);

    saleItems.push({
      product_id:    item.product.id,
      product_name:  item.product.name,
      barcode_code:  item.barcode.code,
      barcode_label: item.barcode.label,
      multiplier:    item.barcode.multiplier,
      qty:           item.qty,
      units,
      price:         unitPrice(item),
      lineTotal:     item.lineTotal,
      item_cogs:     cogs,
      item_profit:   item.lineTotal - cogs
    });
  }

  const sale = {
    date:       new Date().toISOString(),
    items:      saleItems,
    subtotal:   total,
    total,
    total_cogs: totalCogs,
    gross_profit: total - totalCogs,
    payment:    payMethod,
    received:   payMethod === 'efectivo' ? received : total,
    change:     payMethod === 'efectivo' ? received - total : 0
  };

  lastSaleId = await DB.addSale(sale);
  SHEETS.send('addSale', { ...sale, id: lastSaleId }); // sync en segundo plano
  toast(`Venta registrada · ${fmt(total)}`, 'success');

  // Mostrar ticket
  showTicket({ ...sale, id: lastSaleId });
  document.getElementById('btnLastTicket').style.display = 'block';

  cart = [];
  renderCart();
  document.getElementById('cashReceived').value = '';
  updateChange();
}

// ── Ticket ─────────────────────────────────────────────────────
function showTicket(sale) {
  const d    = new Date(sale.date);
  const hora = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  const fecha= d.toLocaleDateString('es-BO');
  const sep  = '─'.repeat(36);

  let lines = `POS LICORES & BEBIDAS\n${sep}\nFecha: ${fecha}  Hora: ${hora}\nTicket #${sale.id}\n${sep}\n`;

  for (const item of sale.items) {
    const packInfo = item.multiplier > 1 ? ` [${item.barcode_label} · ${item.multiplier} und.]` : '';
    lines += `${item.product_name}${packInfo}\n`;
    lines += `  ${item.qty} × Bs ${fmtN(item.price)} = Bs ${fmtN(item.lineTotal)}\n`;
    if (item.multiplier > 1) lines += `  (${item.units} ${item.barcode_label || 'unidades'} descontadas)\n`;
  }

  lines += `${sep}\nTOTAL: Bs ${fmtN(sale.total)}\n`;
  lines += `Pago: ${sale.payment.toUpperCase()}\n`;
  if (sale.payment === 'efectivo') {
    lines += `Recibido: Bs ${fmtN(sale.received)}\nCambio:   Bs ${fmtN(sale.change)}\n`;
  }
  lines += `${sep}\n¡Gracias por su compra!\n`;

  document.getElementById('ticketContent').textContent = lines;
  openModal('modalTicket');
}

// ─────────────────────────────────────────────────────────────
//  PRODUCTOS
// ─────────────────────────────────────────────────────────────

// Orden y nombres de categorías
const CAT_ORDER = ['cerveza','bebida','vino','licor','singani','refresco','cigarrillo','extra'];
const CAT_NAMES = {
  cerveza:'Cervezas', bebida:'Bebidas Preparadas', vino:'Vinos',
  licor:'Licores & Spirits', singani:'Singani', refresco:'Refrescos',
  cigarrillo:'Cigarrillos', extra:'Extras'
};
// Estado de secciones colapsadas (persiste durante la sesión)
const collapsedCats = new Set();

function productCardHtml(p) {
  const stockClass = p.stock <= 0 ? 'stock-out' : p.stock <= p.min_stock ? 'stock-low' : 'stock-ok';
  const stockLabel = p.stock <= 0 ? 'Sin stock' : p.stock <= p.min_stock
    ? `⚠ ${p.stock} ${p.base_unit}s` : `✓ ${p.stock} ${p.base_unit}s`;
  const bcHtml = (p.barcodes || []).map(b =>
    `<span title="${b.label}">🔲 ${b.code} (×${b.multiplier})</span>`).join('');
  const alertClass = p.stock > 0 && p.stock <= p.min_stock ? 'stock-alert-card' : '';
  return `<div class="product-card ${alertClass}">
    <div class="pc-header">
      <span class="pc-name">${p.name}</span>
    </div>
    <div class="pc-barcodes">${bcHtml || '<span style="color:var(--text3)">Sin código</span>'}</div>
    <div class="pc-footer">
      <span class="pc-price">${fmt(p.price)}</span>
      <span class="pc-stock ${stockClass}">${stockLabel}</span>
    </div>
    <div class="pc-actions">
      <button class="btn-icon-sm" onclick="openEditProduct(${p.id})">✏ Editar</button>
      <button class="btn-icon-sm" style="color:var(--red)" onclick="deleteProduct(${p.id})">🗑 Eliminar</button>
    </div>
  </div>`;
}

async function renderProducts(filter = '') {
  const all   = await DB.getActiveProducts();
  const items = filter
    ? all.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()) ||
                      (p.category||'').toLowerCase().includes(filter.toLowerCase()))
    : all;
  const grid  = document.getElementById('productsGrid');

  if (!items.length) {
    grid.innerHTML = `<div style="color:var(--text3);padding:40px;text-align:center">
      Sin productos. Crea uno con "+ Nuevo producto" o importa el catálogo.</div>`;
    return;
  }

  // Agrupar por categoría
  const groups = {};
  for (const p of items) {
    const cat = p.category || 'extra';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  }

  // Ordenar: primero las del orden predefinido, luego cualquier otra
  const cats = [
    ...CAT_ORDER.filter(c => groups[c]),
    ...Object.keys(groups).filter(c => !CAT_ORDER.includes(c))
  ];

  grid.innerHTML = cats.map(cat => {
    const prods    = groups[cat];
    const name     = CAT_NAMES[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
    const isOpen   = !collapsedCats.has(cat);
    return `
    <div class="cat-section">
      <div class="cat-section-header ${isOpen ? 'is-open' : ''}" onclick="toggleCatSection(this,'${cat}')">
        <span class="pc-cat cat-${cat}" style="margin:0">${name}</span>
        <span class="cat-section-count">${prods.length} producto${prods.length !== 1 ? 's' : ''}</span>
        <span class="cat-section-arrow">▶</span>
      </div>
      <div class="cat-section-grid ${isOpen ? '' : 'collapsed'}">
        ${prods.map(p => productCardHtml(p)).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleCatSection(headerEl, cat) {
  const section = headerEl.closest('.cat-section');
  const gridEl  = section.querySelector('.cat-section-grid');
  const isNowOpen = gridEl.classList.toggle('collapsed');  // collapsed = cerrado
  headerEl.classList.toggle('is-open', !isNowOpen);
  if (isNowOpen) collapsedCats.add(cat);
  else            collapsedCats.delete(cat);
}

function openNewProduct() {
  editProdId = null;
  document.getElementById('modalProdTitle').textContent = 'Nuevo Producto';
  document.getElementById('fpNombre').value   = '';
  document.getElementById('fpCategoria').value = 'cerveza';
  document.getElementById('fpUnidad').value   = '';
  document.getElementById('fpCosto').value    = '';
  document.getElementById('fpPrecio').value   = '';
  document.getElementById('fpStock').value    = '0';
  document.getElementById('fpStockMin').value = '0';
  document.getElementById('barcodesList').innerHTML = '';
  openModal('modalProducto');
}

async function openEditProduct(id) {
  const p = await DB.getProduct(id);
  if (!p) return;
  editProdId = id;
  document.getElementById('modalProdTitle').textContent = 'Editar Producto';
  document.getElementById('fpNombre').value    = p.name;
  document.getElementById('fpCategoria').value = p.category;
  document.getElementById('fpUnidad').value    = p.base_unit;
  document.getElementById('fpCosto').value     = p.cost;
  document.getElementById('fpPrecio').value    = p.price;
  document.getElementById('fpStock').value     = p.stock;
  document.getElementById('fpStockMin').value  = p.min_stock;
  // Cargar códigos de barras
  const bl = document.getElementById('barcodesList');
  bl.innerHTML = '';
  (p.barcodes || []).forEach(bc => addBarcodeRow(bc.code, bc.multiplier, bc.label));
  openModal('modalProducto');
}

function addBarcodeRow(code = '', multiplier = 1, label = 'Individual') {
  const div = document.createElement('div');
  div.className = 'barcode-row';
  div.innerHTML = `
    <input type="text" class="form-input bc-code" placeholder="Código de barras (EAN-13, interno...)" value="${code}">
    <input type="number" class="form-input bc-mult" min="1" step="1" value="${multiplier}" title="Unidades base por escaneo">
    <input type="text" class="form-input bc-label" placeholder="Etiqueta" value="${label}">
    <button class="btn-rm-barcode" onclick="this.parentElement.remove()">✕</button>
  `;
  document.getElementById('barcodesList').appendChild(div);
}

async function saveProduct() {
  const name  = document.getElementById('fpNombre').value.trim();
  const price = parseFloat(document.getElementById('fpPrecio').value);
  if (!name)      { toast('El nombre es obligatorio', 'error'); return; }
  if (isNaN(price) || price <= 0) { toast('Precio inválido', 'error'); return; }

  const barcodes = [];
  document.querySelectorAll('.barcode-row').forEach(row => {
    const code = row.querySelector('.bc-code').value.trim();
    const mult = parseInt(row.querySelector('.bc-mult').value) || 1;
    const lbl  = row.querySelector('.bc-label').value.trim();
    if (code) barcodes.push({ code, multiplier: mult, label: lbl });
  });

  const prod = {
    name,
    category:   document.getElementById('fpCategoria').value,
    base_unit:  document.getElementById('fpUnidad').value.trim() || 'unidad',
    cost:       parseFloat(document.getElementById('fpCosto').value)  || 0,
    price,
    stock:      parseInt(document.getElementById('fpStock').value)    || 0,
    min_stock:  parseInt(document.getElementById('fpStockMin').value) || 0,
    barcodes,
    active:     true
  };

  if (editProdId) prod.id = editProdId;
  await DB.saveProduct(prod);
  closeModal('modalProducto');
  toast(editProdId ? 'Producto actualizado' : 'Producto creado', 'success');
  renderProducts(document.getElementById('prodSearch').value);
}

function deleteProduct(id) {
  DB.getProduct(id).then(p => {
    if (!p) return;

    // Paso 1
    document.getElementById('eliminarProdName1').textContent = p.name;
    openModal('modalEliminar1');

    const ok1     = document.getElementById('btnEliminar1Ok');
    const cancel1 = document.getElementById('btnEliminar1Cancel');
    const ok1New  = ok1.cloneNode(true);
    const c1New   = cancel1.cloneNode(true);
    ok1.replaceWith(ok1New); cancel1.replaceWith(c1New);

    c1New.addEventListener('click', () => closeModal('modalEliminar1'));
    ok1New.addEventListener('click', () => {
      closeModal('modalEliminar1');

      // Paso 2
      document.getElementById('eliminarProdName2').textContent = p.name;
      openModal('modalEliminar2');

      const ok2     = document.getElementById('btnEliminar2Ok');
      const cancel2 = document.getElementById('btnEliminar2Cancel');
      const ok2New  = ok2.cloneNode(true);
      const c2New   = cancel2.cloneNode(true);
      ok2.replaceWith(ok2New); cancel2.replaceWith(c2New);

      c2New.addEventListener('click', () => closeModal('modalEliminar2'));

      // Pulsación prolongada de 5 segundos
      const HOLD_MS   = 5000;
      const progress  = document.getElementById('holdProgress');
      const label     = document.getElementById('holdLabel');
      let   holdTimer = null;
      let   startTime = null;
      let   rafId     = null;

      function resetHold() {
        clearTimeout(holdTimer);
        cancelAnimationFrame(rafId);
        holdTimer = null; startTime = null;
        progress.style.width = '0%';
        progress.style.transition = 'none';
        label.textContent = 'Mantén presionado 5s';
      }

      function animateHold() {
        const elapsed = Date.now() - startTime;
        const pct     = Math.min((elapsed / HOLD_MS) * 100, 100);
        progress.style.width = pct + '%';
        const secs = Math.ceil((HOLD_MS - elapsed) / 1000);
        label.textContent = secs > 0 ? `Suelta para cancelar · ${secs}s` : '¡Eliminando!';
        if (elapsed < HOLD_MS) rafId = requestAnimationFrame(animateHold);
      }

      function startHold() {
        startTime = Date.now();
        rafId = requestAnimationFrame(animateHold);
        holdTimer = setTimeout(async () => {
          await DB.deleteProduct(id);
          closeModal('modalEliminar2');
          resetHold();
          toast(`"${p.name}" eliminado`, 'error');
          renderProducts();
        }, HOLD_MS);
      }

      ok2New.addEventListener('mousedown',  startHold);
      ok2New.addEventListener('touchstart', startHold, { passive: true });
      ok2New.addEventListener('mouseup',    resetHold);
      ok2New.addEventListener('mouseleave', resetHold);
      ok2New.addEventListener('touchend',   resetHold);
      ok2New.addEventListener('touchcancel',resetHold);
    });
  });
}

// ─────────────────────────────────────────────────────────────
//  INVENTARIO
// ─────────────────────────────────────────────────────────────

async function renderInventory(filter = '') {
  const all   = await DB.getActiveProducts();
  const items = filter ? all.filter(p => p.name.toLowerCase().includes(filter.toLowerCase())) : all;
  const tbody = document.getElementById('invBody');

  tbody.innerHTML = items.map(p => {
    const stockClass  = p.stock <= 0 ? 'badge-out' : p.stock <= p.min_stock ? 'badge-low' : 'badge-ok';
    const stockLabel  = p.stock <= 0 ? 'Agotado' : p.stock <= p.min_stock ? 'Stock bajo' : 'OK';
    const rowAlert = p.stock <= p.min_stock ? 'stock-alert-row' : '';
    return `<tr class="${rowAlert}">
      <td><strong>${p.name}</strong></td>
      <td>${p.category}</td>
      <td>${p.base_unit}</td>
      <td style="font-family:var(--mono);font-weight:600;color:${p.stock <= 0 ? 'var(--red)' : p.stock <= p.min_stock ? 'var(--amber)' : 'var(--green)'}">${p.stock}</td>
      <td style="color:var(--text3)">${p.min_stock}</td>
      <td><span class="badge-status ${stockClass}">${stockLabel}</span></td>
      <td>
        <button class="btn-icon-sm" onclick="openEditProduct(${p.id})">✏</button>
      </td>
    </tr>`;
  }).join('');
}

async function openStockAdj(id = null) {
  // Poblar selector de productos
  const all = await DB.getActiveProducts();
  const sel = document.getElementById('stockProductoId');
  sel.innerHTML = all.map(p =>
    `<option value="${p.id}">${p.name} — stock: ${p.stock} ${p.base_unit}(s)</option>`
  ).join('');

  // Si viene un id específico, preseleccionarlo; si no, dejar libre elección
  if (id) sel.value = id;

  const productoGroup = document.getElementById('stockProductoGroup');
  productoGroup.style.display = 'flex';

  async function loadProductData() {
    const pid = parseInt(sel.value);
    const p   = await DB.getProduct(pid);
    if (!p) return;
    adjProdId = pid;
    document.getElementById('modalStockTitle').textContent = `Stock · ${p.name}`;
    document.getElementById('stockCosto').value    = p.cost || '';
    document.getElementById('stockActualVal').textContent = `${p.stock} ${p.base_unit}(s)`;

    const info = await DB.getLotsInfo(pid);
    const prev = document.getElementById('lotsPreview');
    if (info.lots.length > 0) {
      prev.innerHTML = `<div class="lots-title">Lotes activos (FIFO):</div>` +
        info.lots.map(l => {
          const d = new Date(l.date).toLocaleDateString('es-BO');
          return `<div class="lot-row">
            <span>${d}</span>
            <span>Costo: <strong>Bs ${l.cost.toFixed(2)}</strong></span>
            <span>${l.qty_remaining} uds. restantes</span>
          </div>`;
        }).join('') +
        `<div class="lot-avg">Costo promedio ponderado: <strong>Bs ${info.avgCost.toFixed(2)}/ud.</strong></div>`;
    } else {
      prev.innerHTML = '';
    }
  }

  sel.onchange = loadProductData;
  await loadProductData();

  document.getElementById('stockTipo').value     = 'entrada';
  document.getElementById('stockCantidad').value = '';
  document.getElementById('stockNotas').value    = '';

  const costoGroup = document.getElementById('stockCostoGroup');
  document.getElementById('stockTipo').onchange = e => {
    costoGroup.style.display = e.target.value === 'entrada' ? 'flex' : 'none';
  };
  costoGroup.style.display = 'flex';

  openModal('modalStock');
}

async function saveStockAdj() {
  const tipo = document.getElementById('stockTipo').value;
  const qty  = parseInt(document.getElementById('stockCantidad').value);
  const nota = document.getElementById('stockNotas').value.trim();

  if (!qty || qty <= 0) { toast('Cantidad inválida', 'error'); return; }

  if (tipo === 'entrada') {
    // Crear lote FIFO con costo de adquisición
    const costo = parseFloat(document.getElementById('stockCosto').value);
    if (isNaN(costo) || costo < 0) { toast('Ingresa el costo de adquisición', 'error'); return; }
    await DB.addLot({
      product_id:    adjProdId,
      date:          new Date().toISOString(),
      cost:          costo,
      qty_initial:   qty,
      qty_remaining: qty,
      notes:         nota
    });
    await DB.addMovement({ product_id: adjProdId, date: new Date().toISOString(), type: 'entrada', qty, notes: `Lote FIFO · Costo Bs ${costo}/ud. · ${nota}` });
    toast(`Lote creado: ${qty} uds. a Bs ${costo}/ud.`, 'success');
  } else {
    const delta = tipo === 'ajuste_neg' ? -qty : qty;
    await DB.updateStock(adjProdId, delta);
    await DB.addMovement({ product_id: adjProdId, date: new Date().toISOString(), type: tipo, qty: delta, notes: nota });
    toast('Stock ajustado', 'success');
  }

  closeModal('modalStock');
  renderInventory(document.getElementById('invSearch').value);
}

// ─────────────────────────────────────────────────────────────
//  VENTAS
// ─────────────────────────────────────────────────────────────

// Denominaciones de billetes/monedas bolivianos
const DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10];

function corteDeBilletes(total) {
  // Redondear a centavos para evitar errores de coma flotante
  let rem = Math.round(total * 100);
  const result = [];
  for (const d of DENOMS) {
    const dc  = Math.round(d * 100);
    const qty = Math.floor(rem / dc);
    result.push({ denom: d, qty, subtotal: qty * d });
    rem -= qty * dc;
  }
  return result;
}

async function renderSales(dateStr = '') {
  const d     = dateStr || new Date().toISOString().split('T')[0];
  const sales = await DB.getSalesByDate(d);
  const tbody = document.getElementById('salesBody');

  // Totales por método
  let totalEfectivo = 0, countEfectivo = 0;
  let totalQr       = 0, countQr       = 0;
  let totalDia      = 0;
  for (const s of sales) {
    totalDia += s.total;
    if (s.payment === 'efectivo') { totalEfectivo += s.total; countEfectivo++; }
    if (s.payment === 'qr')       { totalQr       += s.total; countQr++;       }
  }

  // Actualizar chips superiores
  document.getElementById('ventasDaySummary').textContent =
    `${sales.length} ventas · ${fmt(totalDia)}`;

  // Panel resumen
  document.getElementById('vsmTotal').textContent     = fmt(totalDia);
  document.getElementById('vsmCount').textContent     = `${sales.length} venta${sales.length !== 1 ? 's' : ''}`;
  document.getElementById('vsmCash').textContent      = fmt(totalEfectivo);
  document.getElementById('vsmCashCount').textContent = `${countEfectivo} venta${countEfectivo !== 1 ? 's' : ''}`;
  document.getElementById('vsmQr').textContent        = fmt(totalQr);
  document.getElementById('vsmQrCount').textContent   = `${countQr} venta${countQr !== 1 ? 's' : ''}`;

  if (!sales.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text3);padding:30px;text-align:center">Sin ventas para esta fecha</td></tr>`;
    return;
  }

  tbody.innerHTML = [...sales].reverse().map(s => {
    const hora = new Date(s.date).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    const methodLabel = { efectivo: '💵 Efectivo', qr: '📱 QR' }[s.payment] || s.payment;
    return `<tr>
      <td style="color:var(--text3);font-family:var(--mono)">#${s.id}</td>
      <td>${hora}</td>
      <td style="color:var(--text2)">${s.items.length} ítem(s)</td>
      <td style="font-family:var(--mono);font-weight:700;color:var(--amber)">${fmt(s.total)}</td>
      <td>${methodLabel}</td>
      <td><button class="btn-icon-sm" onclick="showSaleTicket(${s.id})">🧾 Ticket</button></td>
    </tr>`;
  }).join('');
}

async function showSaleTicket(id) {
  const s = await DB.getSale(id);
  if (s) showTicket(s);
}

// ─────────────────────────────────────────────────────────────
//  ESTADÍSTICAS
// ─────────────────────────────────────────────────────────────

async function renderStats() {
  const desde = document.getElementById('statsFechaDesde').value;
  const hasta = document.getElementById('statsFechaHasta').value;
  if (!desde || !hasta) return;

  const sales = await DB.getSalesByRange(desde, hasta);
  const stats = await DB.getStats(sales);

  // KPIs — con counter animado
  animateCounter(document.getElementById('kpiRevenue'),  stats.revenue,      'Bs ', 2, 900);
  animateCounter(document.getElementById('kpiCogs'),     stats.cogs,         'Bs ', 2, 900);
  animateCounter(document.getElementById('kpiProfit'),   Math.abs(stats.grossProfit), stats.grossProfit < 0 ? '-Bs ' : 'Bs ', 2, 900);
  document.getElementById('kpiSalesCount').textContent = `${stats.salesCount} ventas · ${stats.unitsSold} unidades`;
  document.getElementById('kpiUnits').textContent      = `Costo de mercancía vendida`;
  document.getElementById('kpiMargin').textContent     = `Margen bruto: ${stats.margin.toFixed(1)}%`;

  const profitEl = document.getElementById('kpiProfit');
  profitEl.style.color = stats.grossProfit >= 0 ? 'var(--green)' : 'var(--red)';

  // Tabla productos
  const tbody = document.getElementById('statsBody');
  if (!stats.topProducts.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text3);padding:20px;text-align:center">Sin ventas en este período</td></tr>`;
  } else {
    tbody.innerHTML = stats.topProducts.map(p => {
      const marginColor = p.margin >= 30 ? 'var(--green)' : p.margin >= 15 ? 'var(--amber)' : 'var(--red)';
      return `<tr>
        <td><strong>${p.name}</strong></td>
        <td style="font-family:var(--mono)">${p.units}</td>
        <td style="font-family:var(--mono);color:var(--amber)">${fmt(p.revenue)}</td>
        <td style="font-family:var(--mono);color:var(--text2)">${fmt(p.cogs)}</td>
        <td style="font-family:var(--mono);font-weight:700;color:${p.profit >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(p.profit)}</td>
        <td><span style="font:700 .85rem var(--mono);color:${marginColor}">${p.margin.toFixed(1)}%</span></td>
      </tr>`;
    }).join('');
  }

  // Tabla lotes activos
  const allProducts = await DB.getActiveProducts();
  const allLots     = await DB.getLots();
  const activeLots  = allLots.filter(l => l.qty_remaining > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const lotsBody = document.getElementById('lotsBody');
  if (!activeLots.length) {
    lotsBody.innerHTML = `<tr><td colspan="6" style="color:var(--text3);padding:20px;text-align:center">Sin lotes activos</td></tr>`;
  } else {
    lotsBody.innerHTML = activeLots.map(l => {
      const prod  = allProducts.find(p => p.id === l.product_id);
      const fecha = new Date(l.date).toLocaleDateString('es-BO');
      const valor = l.qty_remaining * l.cost;
      return `<tr>
        <td><strong>${prod ? prod.name : '—'}</strong></td>
        <td style="color:var(--text2)">${fecha}</td>
        <td style="font-family:var(--mono);color:var(--amber)">Bs ${l.cost.toFixed(2)}</td>
        <td style="font-family:var(--mono)">${l.qty_remaining} <span style="color:var(--text3);font-size:.75rem">/ ${l.qty_initial} inicial</span></td>
        <td style="font-family:var(--mono);color:var(--text2)">Bs ${valor.toFixed(2)}</td>
        <td style="color:var(--text3);font-size:.82rem">${l.notes || '—'}</td>
      </tr>`;
    }).join('');
  }
}

// ─────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────

async function init() {
  await DB.open();
  await DB.seedIfEmpty();

  initNav();
  initScan();
  initPayment();
  renderCart();
  clockTick();
  setInterval(clockTick, 30000);

  // Fecha de ventas: hoy por defecto
  const fechaInput = document.getElementById('ventasFecha');
  fechaInput.value = new Date().toISOString().split('T')[0];
  fechaInput.addEventListener('change', e => renderSales(e.target.value));

  // Estadísticas: este mes por defecto
  const hoy   = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
  const hasta = hoy.toISOString().split('T')[0];
  document.getElementById('statsFechaDesde').value = desde;
  document.getElementById('statsFechaHasta').value = hasta;
  document.getElementById('btnStatsFilter').addEventListener('click', renderStats);

  // Búsquedas
  document.getElementById('prodSearch').addEventListener('input', e => renderProducts(e.target.value));
  document.getElementById('invSearch').addEventListener('input', e => renderInventory(e.target.value));

  // Sincronizar catálogo desde Google Sheets (hoja "Catalogo")
  // Lee el CSV público del sheet — no usa Apps Script (evita el problema de CORS/redirect)
  document.getElementById('btnSyncSheets').addEventListener('click', async () => {
    const sheetId = (typeof SHEETS_ID !== 'undefined' ? SHEETS_ID : '').trim();
    if (!sheetId) {
      toast('Agrega SHEETS_ID en config.js con el ID de tu Google Sheet', 'error');
      return;
    }
    const btn = document.getElementById('btnSyncSheets');
    btn.disabled = true;
    btn.textContent = '☁ Sincronizando...';
    try {
      // gviz/tq con tqx=out:csv devuelve CSV directo con soporte CORS
      // Requiere que el Sheet esté compartido como "Cualquier persona puede ver"
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Catalogo`;
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csv = await res.text();

      // Parsear CSV (maneja comillas y comas dentro de campos)
      const parseCSV = text => {
        const lines = text.trim().split('\n');
        return lines.slice(1).map(line => {
          const cols = [];
          let cur = '', inQ = false;
          for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
            else cur += ch;
          }
          cols.push(cur.trim());
          return cols;
        }).filter(r => r[0]);
      };

      const rows = parseCSV(csv);
      if (rows.length === 0) {
        toast('La hoja "Catalogo" está vacía', 'error');
        return;
      }

      let added = 0, updated = 0;
      for (const r of rows) {
        const p = {
          name:      r[0] || '',
          category:  (r[1] || 'extra').toLowerCase().trim(),
          base_unit: r[2] || 'unidad',
          price:     parseFloat(r[3]) || 0,
          cost:      parseFloat(r[4]) || 0,
          stock_min: parseFloat(r[5]) || 0
        };
        if (!p.name) continue;
        const existing = await DB.getProductByName(p.name);
        if (existing) {
          await DB.updateProduct({ ...existing, ...p, id: existing.id });
          updated++;
        } else {
          await DB.addProduct({ ...p, barcodes: [], stock: 0, active: true });
          added++;
        }
      }
      toast(`☁ ${added} nuevos · ${updated} actualizados`, 'success');
      renderProducts();
      renderInventory();
    } catch (err) {
      toast('Error al sincronizar: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '☁ Sincronizar desde Sheets';
    }
  });

  // Google Sheets: URL configurada en config.js

  // Botones producto
  document.getElementById('btnNuevoProducto').addEventListener('click', openNewProduct);
  document.getElementById('btnAddBarcode').addEventListener('click', () => addBarcodeRow());
  document.getElementById('btnSaveProd').addEventListener('click', saveProduct);
  document.getElementById('btnCancelProd').addEventListener('click', () => closeModal('modalProducto'));
  document.getElementById('modalProdClose').addEventListener('click', () => closeModal('modalProducto'));

  // Botones stock
  document.getElementById('btnEntradaStock').addEventListener('click', () => openStockAdj());
  document.getElementById('btnSaveStock').addEventListener('click', saveStockAdj);
  document.getElementById('btnCancelStock').addEventListener('click', () => closeModal('modalStock'));
  document.getElementById('modalStockClose').addEventListener('click', () => closeModal('modalStock'));

  // Ticket
  document.getElementById('btnLastTicket').addEventListener('click', async () => {
    if (lastSaleId) { const s = await DB.getSale(lastSaleId); showTicket(s); }
  });
  document.getElementById('modalTicketClose').addEventListener('click', () => closeModal('modalTicket'));
  document.getElementById('btnCloseTicket').addEventListener('click', () => closeModal('modalTicket'));
  document.getElementById('btnPrintTicket').addEventListener('click', () => window.print());

  // Cerrar modales con Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('modalProducto');
      closeModal('modalStock');
      closeModal('modalTicket');
    }
  });

  // Focus en scan al volver a POS
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === 'pos') setTimeout(() => document.getElementById('scanInput').focus(), 50);
    });
  });
}

document.addEventListener('DOMContentLoaded', init);

// ── Ripple en botones ──────────────────────────────────────────
document.addEventListener('pointerdown', e => {
  const btn = e.target.closest('.btn-primary, .btn-ghost, .btn-sm, .nav-btn, .pay-btn');
  if (!btn) return;
  const r   = btn.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2;
  const rip  = document.createElement('span');
  rip.className = 'ripple';
  rip.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size/2}px;top:${e.clientY - r.top - size/2}px`;
  btn.appendChild(rip);
  rip.addEventListener('animationend', () => rip.remove());
});

// ── KPI counter animado ────────────────────────────────────────
function animateCounter(el, target, prefix = '', decimals = 2, duration = 900) {
  const start = performance.now();
  const from  = 0;
  function tick(now) {
    const t   = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const val  = from + (target - from) * ease;
    el.textContent = prefix + val.toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = prefix + target.toFixed(decimals);
  }
  requestAnimationFrame(tick);
}

// Tooltips de columnas — toggle al hacer click (soporte móvil)
document.addEventListener('click', e => {
  const tip = e.target.closest('.th-tip');
  if (tip) {
    const wasActive = tip.classList.contains('active');
    document.querySelectorAll('.th-tip.active').forEach(t => t.classList.remove('active'));
    if (!wasActive) tip.classList.add('active');
    e.stopPropagation();
    return;
  }
  document.querySelectorAll('.th-tip.active').forEach(t => t.classList.remove('active'));
});

// ─────────────────────────────────────────────────────────────
//  INTRO — traza letra por letra como plumín, luego vuela al header
// ─────────────────────────────────────────────────────────────
