// ═══════════════════════════════════════════════════════
//  POS Licorería v2 — Lógica principal
// ═══════════════════════════════════════════════════════

// ── Constantes ────────────────────────────────────────
const CAT_ORDER = ['cerveza','bebida','vino','licor','singani','refresco','cigarrillo','extra'];
const CAT_NAMES = {
  cerveza:'Cervezas', bebida:'Bebidas Preparadas', vino:'Vinos',
  licor:'Licores & Spirits', singani:'Singani', refresco:'Refrescos',
  cigarrillo:'Cigarrillos', extra:'Extras'
};
const TIPOS_MOV = [
  { v:'entrada',    l:'Entrada — nueva compra (crea lote FIFO)' },
  { v:'ajuste_pos', l:'Ajuste positivo' },
  { v:'ajuste_neg', l:'Ajuste negativo / merma' }
];

// ── Iconos SVG ────────────────────────────────────────
const SVG = {
  cart:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>`,
  package:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  barchart: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
  banknote: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  trending: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  camera:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  trash:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
  x:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  receipt:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2V4a2 2 0 00-2-2z"/><line x1="16" y1="8" x2="8" y2="8"/><line x1="16" y1="12" x2="8" y2="12"/><line x1="11" y1="16" x2="8" y2="16"/></svg>`,
  qr:       `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/><rect x="14" y="14" width="3" height="3" fill="currentColor" stroke="none"/></svg>`,
  clear:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`,
  scan:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`,
  plus:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  empty:    `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>`,
  print:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  edit:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  tag:      `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  warn:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

// ── Estado global ─────────────────────────────────────
let cart       = [];
let editProdId = null;
let adjProdId  = null;
let lastSaleId = null;
let payMethod  = 'efectivo';
let invSort    = { col: 'name', dir: 1 };
const collapsedCats = new Set();

// ── Helpers ───────────────────────────────────────────
const fmt  = n => `Bs ${Number(n).toFixed(2)}`;
const fmtN = n => Number(n).toFixed(2);
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-BO') : '—';

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast show ${type}`;
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 3200);
}
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function setStatus(state, msg) {
  const el = document.getElementById('sheetsStatus');
  el.className = `sheets-status ${state}`;
  el.textContent = msg;
}

function populateCatSelect(sel, selected) {
  sel.innerHTML = CAT_ORDER.map(c =>
    `<option value="${c}"${c === selected ? ' selected':''}>${CAT_NAMES[c]}</option>`
  ).join('');
}

// ── Reloj ─────────────────────────────────────────────
function tickClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'});
}

// ═══════════════════════════════════════════════════════
//  NAVEGACIÓN
// ═══════════════════════════════════════════════════════
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${v}`).classList.add('active');
      if (v === 'productos')  renderProducts();
      if (v === 'inventario') renderInventory();
      if (v === 'ventas')     renderSales();
      if (v === 'reportes')   renderReports();
      if (v === 'pos') setTimeout(() => document.getElementById('scanInput').focus(), 50);
    });
  });
}

// ═══════════════════════════════════════════════════════
//  POS — CARRITO
// ═══════════════════════════════════════════════════════
function cartTotal() { return cart.reduce((s, i) => s + i.lineTotal, 0); }
function cartUnits() { return cart.reduce((s, i) => s + i.qty * i.barcode.multiplier, 0); }
function unitPrice(item) { return item.customPrice ?? item.product.price; }

function addToCart(product, barcode) {
  const ex = cart.find(i => i.product.id === product.id && i.barcode.code === barcode.code);
  if (ex) { ex.qty++; ex.lineTotal = ex.qty * unitPrice(ex); }
  else     cart.push({ product, barcode, qty: 1, lineTotal: product.price });
  renderCart();
}

function removeFromCart(idx) { cart.splice(idx, 1); renderCart(); }

function setQty(idx, val) {
  const q = parseFloat(val);
  if (isNaN(q) || q <= 0) return;
  cart[idx].qty      = q;
  cart[idx].lineTotal = q * unitPrice(cart[idx]);
  // Actualizar solo los totales derivados sin perder el foco del input
  const itemEl = document.querySelector(`.cart-item[data-idx="${idx}"]`);
  if (itemEl) {
    const item  = cart[idx];
    const price = unitPrice(item);
    const cost  = item.product.cost || 0;
    const units = q * item.barcode.multiplier;
    const gan   = (price - cost) * units;
    const pct   = price > 0 ? (gan / (price * units) * 100).toFixed(1) : '0.0';
    const el = itemEl.querySelector('.ci-total');
    const gEl = itemEl.querySelector('.ci-profit-row');
    if (el)  el.textContent = fmt(item.lineTotal);
    if (gEl) {
      gEl.textContent = `Ganancia  Bs ${gan.toFixed(2)}  ·  ${pct}%  ·  ${units} ${item.product.base_unit}`;
      gEl.style.color = gan >= 0 ? 'var(--green)' : 'var(--red)';
    }
  }
  const total = cartTotal();
  document.getElementById('cartCount').textContent   = `${cart.length} ítem(s)`;
  document.getElementById('posTotal').textContent    = fmt(total);
  document.getElementById('posSubtotal').textContent = fmt(total);
  updateChange();
}

function renderCart() {
  const list = document.getElementById('cartList');
  if (!cart.length) {
    list.innerHTML = `<div class="cart-empty">
      <div style="color:var(--border)">${SVG.empty}</div>
      <p style="color:var(--text3);margin-top:14px;font-size:.9rem">Carrito vacío</p>
    </div>`;
  } else {
    list.innerHTML = cart.map((item, idx) => {
      const price  = unitPrice(item);
      const cost   = item.product.cost || 0;
      const units  = item.qty * item.barcode.multiplier;
      const gan    = (price - cost) * units;
      const pct    = price > 0 ? (gan / (price * units) * 100).toFixed(1) : '0.0';
      const ganCol = gan >= 0 ? 'var(--green)' : 'var(--red)';
      const isPack = item.barcode.multiplier > 1;
      const hasDsc = item.customPrice !== undefined && item.customPrice < item.product.price;

      return `<div class="cart-item" data-idx="${idx}">
        <div class="ci-body">
          <div class="ci-name-row">
            <span class="ci-name">${item.product.name}</span>
            ${isPack ? `<span class="ci-badge ci-badge-pack">${SVG.package} ×${item.barcode.multiplier}</span>` : ''}
            ${hasDsc  ? `<span class="ci-badge ci-badge-disc">${SVG.tag} Precio especial</span>` : ''}
          </div>
          <div class="ci-calc-row">
            <span class="ci-price-wrap" onclick="openDiscountModal(${idx})" title="Clic para precio especial">
              ${hasDsc ? `<s class="ci-orig">${fmt(item.product.price)}</s>` : ''}
              <span class="ci-price-val">${fmt(price)}</span>
            </span>
            <span class="ci-sep">×</span>
            <input class="ci-qty-input" type="number" min="0.5" step="1" value="${item.qty}"
                   onchange="setQty(${idx}, +this.value)" onclick="this.select()">
            <span class="ci-sep">=</span>
            <span class="ci-total">${fmt(item.lineTotal)}</span>
          </div>
          <div class="ci-profit-row" style="color:${ganCol}">
            Ganancia  Bs ${gan.toFixed(2)}  ·  ${pct}%  ·  ${units} ${item.product.base_unit}
          </div>
        </div>
        <button class="ci-del" data-idx="${idx}" title="Mantén 3 segundos para eliminar">
          <div class="ci-del-fill"></div>
          <span class="ci-del-icon">${SVG.trash}</span>
        </button>
      </div>`;
    }).join('');
  }

  const total = cartTotal();
  document.getElementById('cartCount').textContent   = `${cart.length} ítem(s)`;
  document.getElementById('posTotal').textContent    = fmt(total);
  document.getElementById('posSubtotal').textContent = fmt(total);
  updateChange();
}

// ── Hold-to-delete en ítems del carrito ───────────────
function initCartDeleteHold() {
  const list = document.getElementById('cartList');
  let timer = null, raf = null, start = null, activeBtn = null;
  const HOLD = 3000;

  function cancel() {
    clearTimeout(timer); cancelAnimationFrame(raf);
    timer = raf = start = null;
    if (activeBtn) {
      activeBtn.classList.remove('holding');
      activeBtn.querySelector('.ci-del-fill').style.setProperty('--p', '0');
      activeBtn = null;
    }
  }
  function tick() {
    if (!start || !activeBtn) return;
    const p = Math.min((Date.now() - start) / HOLD, 1);
    activeBtn.querySelector('.ci-del-fill').style.setProperty('--p', p);
    if (p < 1) raf = requestAnimationFrame(tick);
  }

  list.addEventListener('pointerdown', e => {
    const btn = e.target.closest('.ci-del');
    if (!btn) return;
    e.preventDefault();
    activeBtn = btn;
    start = Date.now();
    btn.classList.add('holding');
    toast('Mantén presionado para eliminar', 'warn');
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => {
      const idx = parseInt(btn.dataset.idx);
      cancel();
      removeFromCart(idx);
    }, HOLD);
  });
  list.addEventListener('pointerup',     cancel);
  list.addEventListener('pointercancel', cancel);
  list.addEventListener('contextmenu',   e => { if (e.target.closest('.ci-del')) e.preventDefault(); });
}

// ── Descuento por ítem ─────────────────────────────────
function openDiscountModal(idx) {
  const item = cart[idx];
  document.getElementById('discProdName').textContent   = item.product.name;
  document.getElementById('discPrecioOrig').textContent = fmt(unitPrice(item));
  document.getElementById('discInput').value = '';
  openModal('modalDiscount');
  document.getElementById('discInput').focus();

  const btnOk = document.getElementById('btnDiscOk');
  const n = btnOk.cloneNode(true); btnOk.replaceWith(n);
  n.addEventListener('click', () => {
    const v = parseFloat(document.getElementById('discInput').value);
    if (!isNaN(v) && v >= 0) {
      cart[idx].customPrice = v;
      cart[idx].lineTotal   = cart[idx].qty * v;
    }
    closeModal('modalDiscount'); renderCart();
  });
  document.getElementById('btnDiscCancel').onclick = () => closeModal('modalDiscount');
}

// ── Cambio ─────────────────────────────────────────────
function updateChange() {
  const rec    = parseFloat(document.getElementById('cashReceived').value) || 0;
  const total  = cartTotal();
  const change = rec - total;
  const el     = document.getElementById('posChange');
  el.textContent = change >= 0 ? fmt(change) : 'Bs —';
  el.style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
}

// ── Scan / Búsqueda ────────────────────────────────────
function initScan() {
  const input = document.getElementById('scanInput');
  const suggs = document.getElementById('suggestions');
  let timer   = null;

  async function processScan(val) {
    val = val.trim();
    if (!val) return;
    // Intentar por código de barras primero
    const found = await DB.findByBarcode(val);
    if (found) {
      addToCart(found.product, found.barcode);
      toast(`${found.product.name} agregado`, 'success');
      input.value = ''; suggs.innerHTML = ''; return;
    }
    // Si no, buscar por nombre
    const results = await DB.searchProducts(val);
    renderSuggestions(results);
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (!v) { suggs.innerHTML = ''; return; }
    timer = setTimeout(() => processScan(input.value), 800);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(timer); processScan(input.value); }
    if (e.key === 'Escape') { input.value = ''; suggs.innerHTML = ''; }
  });
  document.getElementById('btnScanClear').addEventListener('click', () => {
    input.value = ''; suggs.innerHTML = ''; input.focus();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#scanArea')) suggs.innerHTML = '';
  });
}

function renderSuggestions(products) {
  const suggs = document.getElementById('suggestions');
  if (!products.length) { suggs.innerHTML = ''; return; }
  suggs.innerHTML = products.map(p => {
    const cls = p.stock <= 0 ? 'out' : p.stock <= p.min_stock ? 'low' : 'ok';
    const lbl = p.stock <= 0 ? 'Sin stock' : `${p.stock} ${p.base_unit}(s)`;
    return `<div class="sug-item" data-id="${p.id}">
      <div>
        <div class="sug-name">${p.name}</div>
        <div class="sug-meta">${CAT_NAMES[p.category] || p.category} · <span style="color:var(--${cls === 'ok' ? 'text3' : cls === 'low' ? 'amber' : 'red'})">${lbl}</span></div>
      </div>
      <span class="sug-price">${fmt(p.price)}</span>
    </div>`;
  }).join('');
  suggs.querySelectorAll('.sug-item').forEach(el => {
    el.addEventListener('click', () => {
      const p  = products.find(x => x.id === parseInt(el.dataset.id));
      if (!p) return;
      const bc = (p.barcodes || [])[0] || { code: '', multiplier: 1, label: 'Individual' };
      addToCart(p, bc);
      document.getElementById('scanInput').value = ''; suggs.innerHTML = '';
      toast(`${p.name} agregado`, 'success');
    });
  });
}

// ── Scanner cámara ─────────────────────────────────────
let scannerStream = null;
let scannerActive = false;

async function openScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Cámara no disponible en este navegador', 'error'); return;
  }
  openModal('modalScanner');
  const video  = document.getElementById('scannerVideo');
  const status = document.getElementById('scannerStatus');

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = scannerStream;
    scannerActive = true;

    if ('BarcodeDetector' in window) {
      status.textContent = 'Apunta al código de barras…';
      const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','code_128','code_39','qr_code','upc_a','upc_e'] });
      const loop = async () => {
        if (!scannerActive) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) {
            const code = codes[0].rawValue;
            closeScanner();
            const found = await DB.findByBarcode(code);
            if (found) {
              addToCart(found.product, found.barcode);
              toast(`${found.product.name} agregado`, 'success');
            } else {
              // Rellenar el input con el código para búsqueda manual
              document.getElementById('scanInput').value = code;
              toast(`Código ${code} — producto no encontrado. Verifica.`, 'warn');
            }
            return;
          }
        } catch (_) {}
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } else {
      status.textContent = 'BarcodeDetector no soportado. Ingresa el código manualmente.';
    }
  } catch (err) {
    status.textContent = `Error de cámara: ${err.message}`;
  }
}

function closeScanner() {
  scannerActive = false;
  if (scannerStream) { scannerStream.getTracks().forEach(t => t.stop()); scannerStream = null; }
  closeModal('modalScanner');
}

// ── Pago ───────────────────────────────────────────────
function initPayment() {
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); payMethod = btn.dataset.method;
      document.getElementById('cashSection').style.display = payMethod === 'efectivo' ? 'block' : 'none';
    });
  });
  document.getElementById('cashReceived').addEventListener('input', updateChange);
  document.querySelectorAll('.denom-btn[data-v]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById('cashReceived');
      inp.value = ((parseFloat(inp.value) || 0) + parseFloat(btn.dataset.v)).toFixed(2);
      updateChange();
    });
  });
  document.getElementById('denomExact').addEventListener('click', () => {
    document.getElementById('cashReceived').value = cartTotal().toFixed(2); updateChange();
  });
  document.getElementById('denomClear').addEventListener('click', () => {
    document.getElementById('cashReceived').value = ''; updateChange();
  });
  document.getElementById('btnClearCart').addEventListener('click', () => {
    if (cart.length && confirm('¿Vaciar el carrito?')) { cart = []; renderCart(); }
  });
  document.getElementById('btnPay').addEventListener('click', processSale);
}

async function processSale() {
  if (!cart.length) { toast('El carrito está vacío', 'error'); return; }
  const total = cartTotal();
  const rec   = parseFloat(document.getElementById('cashReceived').value) || 0;
  if (payMethod === 'efectivo' && rec < total) { toast('Monto insuficiente', 'error'); return; }

  // Verificar stock
  for (const item of cart) {
    const p      = await DB.getProduct(item.product.id);
    const needed = item.qty * item.barcode.multiplier;
    if ((p?.stock || 0) < needed) {
      toast(`Sin stock suficiente: ${p.name} (hay ${p.stock})`, 'error'); return;
    }
  }

  const saleItems = [];
  let totalCogs = 0;
  for (const item of cart) {
    const units = item.qty * item.barcode.multiplier;
    const cogs  = await DB.consumeFIFO(item.product.id, units);
    totalCogs  += cogs;
    const mov = {
      product_id:   item.product.id,
      product_name: item.product.name,
      date:         new Date().toISOString(),
      type:         'venta',
      qty:          -units,
      notes:        `Venta POS · ${item.barcode.label || 'individual'} × ${item.qty}`
    };
    await DB.addMovement(mov);
    Sheets.addMovimiento(mov);
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
    date:         new Date().toISOString(),
    items:        saleItems,
    total,
    total_cogs:   totalCogs,
    gross_profit: total - totalCogs,
    payment:      payMethod,
    received:     payMethod === 'efectivo' ? rec : total,
    change:       payMethod === 'efectivo' ? rec - total : 0
  };
  lastSaleId = await DB.addSale(sale);
  sale.id    = lastSaleId;
  Sheets.addVenta(sale);
  // Solo sincronizar los productos que cambiaron de stock en esta venta
  for (const item of saleItems) {
    const up = await DB.getProduct(item.product_id);
    if (up) Sheets.saveProduct(up);
  }
  Sheets.syncLotes();

  toast(`Venta registrada · ${fmt(total)}`, 'success');
  showTicket(sale);
  document.getElementById('btnLastTicket').style.display = 'inline-flex';
  cart = []; renderCart();
  document.getElementById('cashReceived').value = ''; updateChange();
}

// ── Ticket ─────────────────────────────────────────────
function showTicket(sale) {
  const d   = new Date(sale.date);
  const sep = '─'.repeat(36);
  let   txt = `POS LICORES & BEBIDAS\n${sep}\nFecha: ${d.toLocaleDateString('es-BO')}  Hora: ${d.toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'})}\nTicket #${sale.id}\n${sep}\n`;
  for (const i of sale.items) {
    const pack = i.multiplier > 1 ? ` [×${i.multiplier} ${i.barcode_label||'u.'}]` : '';
    txt += `${i.product_name}${pack}\n  ${i.qty} × Bs ${fmtN(i.price)} = Bs ${fmtN(i.lineTotal)}\n`;
  }
  txt += `${sep}\nTOTAL: Bs ${fmtN(sale.total)}\nPago: ${sale.payment.toUpperCase()}\n`;
  if (sale.payment === 'efectivo')
    txt += `Recibido: Bs ${fmtN(sale.received)}\nCambio:   Bs ${fmtN(sale.change)}\n`;
  txt += `${sep}\n¡Gracias por su compra!\n`;
  document.getElementById('ticketContent').textContent = txt;
  openModal('modalTicket');
}

// ═══════════════════════════════════════════════════════
//  PRODUCTOS
// ═══════════════════════════════════════════════════════
async function renderProducts(filter = '') {
  const all   = await DB.getActiveProducts();
  const items = filter
    ? all.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()) || (p.category||'').includes(filter.toLowerCase()))
    : all;
  const grid  = document.getElementById('productsGrid');

  if (!items.length) {
    grid.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3)">
      Sin productos. Sincroniza el catálogo desde Sheets o crea uno nuevo.</div>`;
    return;
  }

  // Agrupar por categoría
  const groups = {};
  for (const p of items) {
    const c = p.category || 'extra';
    if (!groups[c]) groups[c] = [];
    groups[c].push(p);
  }
  const cats = [...CAT_ORDER.filter(c => groups[c]), ...Object.keys(groups).filter(c => !CAT_ORDER.includes(c))];

  grid.innerHTML = cats.map(cat => {
    const prods  = groups[cat];
    const name   = CAT_NAMES[cat] || cat;
    const isOpen = !collapsedCats.has(cat);
    return `<div class="cat-section">
      <div class="cat-header ${isOpen ? 'open' : ''}" onclick="toggleCat(this,'${cat}')">
        <span class="cat-badge cat-${cat}">${name}</span>
        <span class="cat-count">${prods.length} producto${prods.length!==1?'s':''}</span>
        <span class="cat-arrow">▶</span>
      </div>
      <div class="cat-grid ${isOpen ? '' : 'collapsed'}" style="max-height:${isOpen ? '9999px' : '0'}">
        ${prods.map(prodCardHtml).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleCat(el, cat) {
  const grid = el.nextElementSibling;
  const open = grid.classList.toggle('collapsed');
  el.classList.toggle('open', !open);
  grid.style.maxHeight = open ? '0' : '9999px';
  if (open) collapsedCats.add(cat); else collapsedCats.delete(cat);
}

function prodCardHtml(p) {
  const cls   = p.stock <= 0 ? 'out' : p.stock <= p.min_stock ? 'low' : 'ok';
  const lbl   = p.stock <= 0 ? 'Sin stock' : p.stock <= p.min_stock ? `Bajo: ${p.stock}` : `${p.stock}`;
  const bcSvg = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`;
  const bcs   = (p.barcodes || []).map(b => `<span title="${b.label}">${bcSvg} ${b.code}${b.multiplier>1?' ×'+b.multiplier:''}</span>`).join(' ');
  const alert = p.stock > 0 && p.stock <= p.min_stock ? 'alert' : '';
  return `<div class="prod-card ${alert}">
    <div class="prod-name">${p.name}</div>
    <div class="prod-barcodes">${bcs || '<span style="color:var(--text3)">Sin código de barras</span>'}</div>
    <div class="prod-footer">
      <span class="prod-price">${fmt(p.price)}</span>
      <span class="prod-stock ${cls}">${lbl} ${p.base_unit}(s)</span>
    </div>
    <div class="prod-actions">
      <button class="btn btn-ghost btn-sm" onclick="openEditProduct(${p.id})">${SVG.edit} Editar</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDelete(${p.id})">${SVG.trash}</button>
    </div>
  </div>`;
}

// ── Modal producto (nuevo / editar) ───────────────────
async function openNewProduct() {
  editProdId = null;
  document.getElementById('modalProdTitle').textContent = 'Nuevo Producto';
  populateCatSelect(document.getElementById('fpCat'), 'cerveza');
  document.getElementById('fpNombre').value   = '';
  document.getElementById('fpUnidad').value   = '';
  document.getElementById('fpPrecio').value   = '';
  document.getElementById('fpMinStock').value = '0';
  document.getElementById('fpCosto').value    = '';
  document.getElementById('fpCosto').readOnly = false;
  document.getElementById('fpCostoGroup').style.display = '';
  document.getElementById('fpLotesInfo').style.display  = 'none';
  document.getElementById('fpStockGroup').style.display = '';
  document.getElementById('fpStock').value    = '0';
  document.getElementById('fpMargen').style.display = 'none';
  document.getElementById('bcRows').innerHTML = '';
  _margenWatch(() => parseFloat(document.getElementById('fpCosto').value) || 0);
  openModal('modalProducto');
}

async function openEditProduct(id) {
  const p = await DB.getProduct(id);
  if (!p) return;
  editProdId = id;
  document.getElementById('modalProdTitle').textContent = 'Editar Producto';
  populateCatSelect(document.getElementById('fpCat'), p.category || 'extra');
  document.getElementById('fpNombre').value   = p.name;
  document.getElementById('fpUnidad').value   = p.base_unit;
  document.getElementById('fpPrecio').value   = p.price;
  document.getElementById('fpMinStock').value = p.min_stock;
  document.getElementById('fpStockGroup').style.display = 'none';

  // Lotes → costo
  const info = await DB.getLotsInfo(id);
  if (info.lots.length > 0) {
    const oldest = info.lots[0];
    document.getElementById('fpCosto').value    = oldest.cost.toFixed(2);
    document.getElementById('fpCosto').readOnly = true;
    document.getElementById('fpCostoGroup').style.display = 'none';
    const lines = info.lots.map((l, i) => {
      const fecha = fmtDate(l.date);
      return `<div class="lot-row ${i===0?'oldest':''}">
        <span class="lot-num">#${i+1}</span>
        <span class="lot-cost">Bs ${l.cost.toFixed(2)}/u</span>
        <span class="lot-qty">${l.qty_remaining} ud. ${i===0?'<b style="color:var(--cyan)">← próximo</b>':''}</span>
        <span class="lot-date">${fecha}</span>
      </div>`;
    }).join('');
    document.getElementById('fpLotesInfo').style.display = 'block';
    document.getElementById('fpLotesInfo').innerHTML = `
      <div class="lot-list-title">Lotes activos — el costo del primero calcula la ganancia</div>
      ${lines}
      ${info.lots.length > 1 ? `<div class="lot-notice">Promedio ponderado: Bs ${info.avgCost.toFixed(2)}/u</div>` : ''}`;
    _margenWatch(() => oldest.cost);
  } else {
    document.getElementById('fpCosto').value    = p.cost || '';
    document.getElementById('fpCosto').readOnly = false;
    document.getElementById('fpCostoGroup').style.display = '';
    document.getElementById('fpLotesInfo').style.display  = 'none';
    _margenWatch(() => parseFloat(document.getElementById('fpCosto').value) || 0);
  }

  document.getElementById('bcRows').innerHTML = '';
  (p.barcodes || []).forEach(bc => addBcRow(bc.code, bc.multiplier, bc.label));
  openModal('modalProducto');
}

function _margenWatch(costoFn) {
  const inp = document.getElementById('fpPrecio');
  const div = document.getElementById('fpMargen');
  const fn  = () => {
    const price = parseFloat(inp.value);
    const cost  = costoFn();
    if (!isNaN(price) && cost > 0) {
      const gan = price - cost;
      const pct = (gan / price * 100).toFixed(1);
      const col = gan >= 0 ? 'var(--green)' : 'var(--red)';
      div.style.display = 'block';
      div.innerHTML = `<span style="color:${col};font-size:.8rem">Ganancia: <b>Bs ${gan.toFixed(2)}</b> · Margen: <b>${pct}%</b> <span style="color:var(--text3)">(costo Bs ${cost.toFixed(2)})</span></span>`;
    } else {
      div.style.display = 'none';
    }
  };
  inp.removeEventListener('input', inp._mfn || null);
  inp._mfn = fn; inp.addEventListener('input', fn); fn();
}

function addBcRow(code = '', mult = 1, label = 'Individual') {
  const d = document.createElement('div'); d.className = 'bc-row';
  d.innerHTML = `
    <input class="form-input bc-code" placeholder="Código EAN-13, interno…" value="${code}">
    <input class="form-input bc-mult" type="number" min="1" value="${mult}" title="Unidades base por escaneo">
    <input class="form-input bc-lbl"  placeholder="Etiqueta" value="${label}">
    <button class="btn-rm" onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('bcRows').appendChild(d);
}

async function saveProduct() {
  const name  = document.getElementById('fpNombre').value.trim();
  const price = parseFloat(document.getElementById('fpPrecio').value);
  if (!name)               { toast('El nombre es obligatorio', 'error'); return; }
  if (isNaN(price)||price<=0) { toast('Precio inválido', 'error'); return; }

  const barcodes = [];
  document.querySelectorAll('.bc-row').forEach(row => {
    const code = row.querySelector('.bc-code').value.trim();
    const mult = parseInt(row.querySelector('.bc-mult').value) || 1;
    const lbl  = row.querySelector('.bc-lbl').value.trim() || 'Individual';
    if (code) barcodes.push({ code, multiplier: mult, label: lbl });
  });

  const fpCosto = document.getElementById('fpCosto');
  let stock = 0, cost = 0;

  if (editProdId) {
    const ex = await DB.getProduct(editProdId);
    stock = ex?.stock || 0;
    cost  = fpCosto.readOnly ? (ex?.cost || 0) : (parseFloat(fpCosto.value) || 0);
  } else {
    stock = parseInt(document.getElementById('fpStock').value) || 0;
    cost  = parseFloat(fpCosto.value) || 0;
  }

  const prod = {
    name,
    category:  document.getElementById('fpCat').value,
    base_unit: document.getElementById('fpUnidad').value.trim() || 'unidad',
    cost, price, stock,
    min_stock: parseInt(document.getElementById('fpMinStock').value) || 0,
    barcodes, active: true
  };
  if (editProdId) prod.id = editProdId;
  await DB.saveProduct(prod);
  Sheets.saveProduct(prod);
  closeModal('modalProducto');
  toast(editProdId ? 'Producto actualizado' : 'Producto creado', 'success');
  renderProducts(document.getElementById('prodSearch').value);
}

// ── Eliminar producto ──────────────────────────────────
function confirmDelete(id) {
  DB.getProduct(id).then(p => {
    if (!p) return;
    document.getElementById('delProdName').textContent = p.name;
    openModal('modalDelete');
    const btn = document.getElementById('btnHoldDelete');
    const bar = document.getElementById('holdBar');
    const lbl = document.getElementById('holdLabel');
    const HOLD = 4000;
    let timer = null, start = null, raf = null;

    function reset() {
      clearTimeout(timer); cancelAnimationFrame(raf);
      timer = start = raf = null;
      bar.style.width = '0%'; lbl.textContent = 'Mantén presionado 4s para eliminar';
    }
    function anim() {
      const pct = Math.min((Date.now()-start)/HOLD*100,100);
      bar.style.width = pct+'%';
      const s = Math.ceil((HOLD-(Date.now()-start))/1000);
      lbl.textContent = s>0 ? `Suelta para cancelar · ${s}s` : '¡Eliminando…!';
      if (Date.now()-start < HOLD) raf = requestAnimationFrame(anim);
    }
    function startHold() {
      start = Date.now(); raf = requestAnimationFrame(anim);
      timer = setTimeout(async () => {
        const lots = await DB.getLotsByProduct(id);
        for (const l of lots) await DB._delete('lots', l.id);
        await DB.deleteProduct(id);
        Sheets.deleteProd(p);
        Sheets.syncLotes();
        closeModal('modalDelete'); reset();
        toast(`"${p.name}" eliminado`, 'error');
        renderProducts(); renderInventory();
      }, HOLD);
    }
    const nb = btn.cloneNode(true); btn.replaceWith(nb);
    reset();
    nb.addEventListener('mousedown',  startHold);
    nb.addEventListener('touchstart', startHold, { passive: true });
    nb.addEventListener('mouseup',    reset);
    nb.addEventListener('mouseleave', reset);
    nb.addEventListener('touchend',   reset);
    nb.addEventListener('touchcancel',reset);
    document.getElementById('btnCancelDelete').onclick = () => { reset(); closeModal('modalDelete'); };
  });
}

// ═══════════════════════════════════════════════════════
//  INVENTARIO
// ═══════════════════════════════════════════════════════
function invSortKey(p, col) {
  if (col === 'name')      return p.name.toLowerCase();
  if (col === 'category')  return p.category.toLowerCase();
  if (col === 'base_unit') return (p.base_unit||'').toLowerCase();
  if (col === 'stock')     return p.stock;
  if (col === 'min_stock') return p.min_stock;
  if (col === 'status')    return p.stock<=0 ? 0 : p.stock<=p.min_stock ? 1 : 2;
  return '';
}

async function renderInventory(filter = '') {
  const all   = await DB.getActiveProducts();
  let   items = filter ? all.filter(p => p.name.toLowerCase().includes(filter.toLowerCase())) : all;

  items = [...items].sort((a, b) => {
    const va = invSortKey(a, invSort.col), vb = invSortKey(b, invSort.col);
    return va < vb ? -invSort.dir : va > vb ? invSort.dir : 0;
  });

  document.querySelectorAll('.th-sort').forEach(th => {
    th.classList.remove('asc','desc');
    if (th.dataset.col === invSort.col) th.classList.add(invSort.dir===1?'asc':'desc');
  });

  const tbody = document.getElementById('invBody');
  // Render diferencial sin parpadeo
  const existing = new Map();
  tbody.querySelectorAll('tr[data-pid]').forEach(tr => existing.set(tr.dataset.pid, tr));
  const frag = document.createDocumentFragment();

  for (const p of items) {
    const key = String(p.id);
    const sig = `${p.name}|${p.stock}|${p.min_stock}|${p.category}|${p.base_unit}`;
    let tr = existing.get(key); existing.delete(key);
    if (!tr) { tr = document.createElement('tr'); tr.dataset.pid = key; }
    if (tr.dataset.sig !== sig) {
      tr.dataset.sig = sig;
      const cls = p.stock <= 0 ? 'out' : p.stock <= p.min_stock ? 'low' : 'ok';
      const lbl = p.stock <= 0 ? 'Agotado' : p.stock <= p.min_stock ? 'Stock bajo' : 'OK';
      const col = p.stock <= 0 ? 'var(--red)' : p.stock <= p.min_stock ? 'var(--amber)' : 'var(--green)';
      tr.className = p.stock > 0 && p.stock <= p.min_stock ? 'alert-row' : '';
      tr.innerHTML = `
        <td><strong>${p.name}</strong></td>
        <td><span class="cat-badge cat-${p.category}" style="font-size:.7rem;padding:2px 7px">${CAT_NAMES[p.category]||p.category}</span></td>
        <td>${p.base_unit}</td>
        <td style="font-family:var(--mono);font-weight:700;color:${col}">${p.stock}</td>
        <td style="color:var(--text3)">${p.min_stock}</td>
        <td><span class="badge badge-${cls}">${lbl}</span></td>
        <td>
          <button class="btn-icon" onclick="openStockAdj(${p.id})">+ Stock</button>
          <button class="btn-icon" style="margin-left:4px" onclick="openEditProduct(${p.id})">✏</button>
        </td>`;
    }
    frag.appendChild(tr);
  }
  existing.forEach(tr => tr.remove());
  tbody.appendChild(frag);
}

// ── Ajuste de stock / lote FIFO ────────────────────────
async function openStockAdj(id = null) {
  adjProdId = null;
  const all = await DB.getActiveProducts();

  // Autocomplete producto
  const pinput = document.getElementById('adjProdInput');
  const plist  = document.getElementById('adjProdList');
  const phid   = document.getElementById('adjProdId');
  pinput.value = ''; phid.value = ''; plist.classList.remove('open');

  function renderPList(q) {
    const matches = q ? all.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())).slice(0,10) : all.slice(0,10);
    plist.innerHTML = matches.map(p => `<div class="ac-item" data-id="${p.id}" data-name="${p.name}">
      <span>${p.name}</span><span class="ac-sub">${p.stock} ${p.base_unit}(s)</span></div>`).join('');
    plist.classList.toggle('open', !!matches.length);
  }
  pinput.oninput  = () => renderPList(pinput.value);
  pinput.onfocus  = () => renderPList(pinput.value);
  plist.onclick   = async e => {
    const item = e.target.closest('.ac-item'); if (!item) return;
    pinput.value = item.dataset.name; phid.value = item.dataset.id;
    plist.classList.remove('open'); await loadAdjProduct(parseInt(item.dataset.id));
  };
  document.addEventListener('pointerdown', function cl(e) {
    if (!e.target.closest('#adjProdWrap')) { plist.classList.remove('open'); document.removeEventListener('pointerdown',cl); }
  });

  // Tipo de movimiento
  const tinput = document.getElementById('adjTipoInput');
  const tlist  = document.getElementById('adjTipoList');
  const thid   = document.getElementById('adjTipo');
  tinput.value = TIPOS_MOV[0].l; thid.value = TIPOS_MOV[0].v;
  tlist.innerHTML = TIPOS_MOV.map(t=>`<div class="ac-item" data-v="${t.v}">${t.l}</div>`).join('');
  tinput.onfocus  = () => tlist.classList.add('open');
  tlist.onclick   = e => {
    const item = e.target.closest('.ac-item'); if (!item) return;
    const t = TIPOS_MOV.find(x => x.v === item.dataset.v);
    tinput.value = t.l; thid.value = t.v; tlist.classList.remove('open');
    document.getElementById('adjCostoGroup').style.display = t.v === 'entrada' ? 'flex' : 'none';
  };
  document.addEventListener('pointerdown', function cl2(e) {
    if (!e.target.closest('#adjTipoWrap')) { tlist.classList.remove('open'); document.removeEventListener('pointerdown',cl2); }
  });

  document.getElementById('adjCostoGroup').style.display = 'flex';
  document.getElementById('adjCantidad').value = '';
  document.getElementById('adjCosto').value    = '';
  document.getElementById('adjNotas').value    = '';
  document.getElementById('adjLotsPreview').innerHTML = '';
  document.getElementById('adjProdGroup').style.display = id ? 'none' : 'flex';

  if (id) {
    const p = all.find(x => x.id === id);
    if (p) { pinput.value = p.name; phid.value = p.id; await loadAdjProduct(id); }
  }
  openModal('modalStock');
}

async function loadAdjProduct(pid) {
  const p = await DB.getProduct(pid);
  if (!p) return;
  adjProdId = pid;
  document.getElementById('adjModalTitle').textContent = `Stock · ${p.name}`;
  document.getElementById('adjStockActual').textContent = `${p.stock} ${p.base_unit}(s)`;

  const info = await DB.getLotsInfo(pid);
  const prev = document.getElementById('adjLotsPreview');
  const last = info.lots[info.lots.length - 1];
  document.getElementById('adjCosto').value = last?.cost ?? (p.cost || '');

  if (info.lots.length) {
    prev.innerHTML = `<div class="lot-list-title">Lotes activos (FIFO)</div>` +
      info.lots.map((l,i) => `<div class="lot-row ${i===0?'oldest':''}">
        <span class="lot-num">#${i+1}</span>
        <span class="lot-cost">Bs ${l.cost.toFixed(2)}/u</span>
        <span class="lot-qty">${l.qty_remaining} ud.${i===0?' ← próximo':''}</span>
        <span class="lot-date">${fmtDate(l.date)}</span>
      </div>`).join('') +
      `<div class="lot-notice">Nuevo lote se creará independiente con el costo que ingreses.</div>`;
  } else {
    prev.innerHTML = `<div class="lot-notice">Sin lotes — este será el primero para este producto.</div>`;
  }
}

async function saveStockAdj() {
  if (!adjProdId) { toast('Selecciona un producto', 'error'); return; }
  const tipo = document.getElementById('adjTipo').value;
  const qty  = parseInt(document.getElementById('adjCantidad').value);
  const nota = document.getElementById('adjNotas').value.trim();
  const p    = await DB.getProduct(adjProdId);
  if (!qty || qty <= 0) { toast('Cantidad inválida', 'error'); return; }

  if (tipo === 'entrada') {
    const costo = parseFloat(document.getElementById('adjCosto').value);
    if (isNaN(costo) || costo < 0) { toast('Ingresa el costo de adquisición', 'error'); return; }
    await DB.addLot({ product_id: adjProdId, date: new Date().toISOString(), cost: costo, qty_initial: qty, qty_remaining: qty, notes: nota });
    const mov = { product_id: adjProdId, product_name: p.name, date: new Date().toISOString(), type: 'entrada', qty, notes: `Lote FIFO · Bs ${costo}/u · ${nota}` };
    await DB.addMovement(mov); Sheets.addMovimiento(mov);
    toast(`Lote creado: ${qty} uds. a Bs ${costo}/u`, 'success');
  } else {
    const delta = tipo === 'ajuste_neg' ? -qty : qty;
    await DB.updateStock(adjProdId, delta);
    const mov = { product_id: adjProdId, product_name: p.name, date: new Date().toISOString(), type: tipo, qty: delta, notes: nota };
    await DB.addMovement(mov); Sheets.addMovimiento(mov);
    toast('Stock ajustado', 'success');
  }
  // Sync solo el producto afectado + lotes si hubo entrada
  const updProd = await DB.getProduct(adjProdId);
  if (updProd) Sheets.saveProduct(updProd);
  if (tipo === 'entrada') Sheets.syncLotes();
  closeModal('modalStock');
  renderInventory(document.getElementById('invSearch').value);
}

// ═══════════════════════════════════════════════════════
//  VENTAS
// ═══════════════════════════════════════════════════════
async function renderSales(dateStr = '') {
  const d     = dateStr || new Date().toISOString().split('T')[0];
  const sales = await DB.getSalesByDate(d);
  let effTotal = 0, effCount = 0, qrTotal = 0, qrCount = 0, dayTotal = 0;
  for (const s of sales) {
    dayTotal += s.total;
    if (s.payment === 'efectivo') { effTotal += s.total; effCount++; }
    else                           { qrTotal  += s.total; qrCount++;  }
  }
  document.getElementById('vTotalDia').textContent    = fmt(dayTotal);
  document.getElementById('vCountDia').textContent    = `${sales.length} venta${sales.length!==1?'s':''}`;
  document.getElementById('vCashTotal').textContent   = fmt(effTotal);
  document.getElementById('vCashCount').textContent   = `${effCount} op.`;
  document.getElementById('vQrTotal').textContent     = fmt(qrTotal);
  document.getElementById('vQrCount').textContent     = `${qrCount} op.`;

  const tbody = document.getElementById('salesBody');
  if (!sales.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:30px">Sin ventas para esta fecha</td></tr>`;
    return;
  }
  tbody.innerHTML = [...sales].reverse().map(s => {
    const hora = new Date(s.date).toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'});
    const met  = { efectivo:'💵 Efectivo', qr:'📱 QR' }[s.payment] || s.payment;
    return `<tr>
      <td style="color:var(--text3);font-family:var(--mono)">#${s.id}</td>
      <td>${hora}</td>
      <td style="color:var(--text2)">${s.items?.length||0} ítem(s)</td>
      <td style="font-family:var(--mono);font-weight:700;color:var(--amber)">${fmt(s.total)}</td>
      <td>${met}</td>
      <td><button class="btn-icon" onclick="showSaleTicket(${s.id})">🧾</button></td>
    </tr>`;
  }).join('');
}

async function showSaleTicket(id) {
  const s = await DB.getSale(id); if (s) showTicket(s);
}

// ═══════════════════════════════════════════════════════
//  REPORTES
// ═══════════════════════════════════════════════════════
async function renderReports() {
  const desde = document.getElementById('repDesde').value;
  const hasta = document.getElementById('repHasta').value;
  if (!desde || !hasta) return;

  const sales = await DB.getSalesByRange(desde, hasta);
  const stats = await DB.getStats(sales);

  document.getElementById('repRevenue').textContent = fmt(stats.revenue);
  document.getElementById('repCogs').textContent    = fmt(stats.cogs);
  document.getElementById('repProfit').textContent  = fmt(stats.profit);
  document.getElementById('repProfit').style.color  = stats.profit >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('repMargin').textContent  = `Margen bruto: ${stats.margin.toFixed(1)}%`;
  document.getElementById('repCount').textContent   = `${stats.salesCount} ventas`;

  const tbody = document.getElementById('repBody');
  tbody.innerHTML = !stats.top.length
    ? `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">Sin datos en este período</td></tr>`
    : stats.top.map(p => {
        const mc = p.margin >= 30 ? 'var(--green)' : p.margin >= 15 ? 'var(--amber)' : 'var(--red)';
        return `<tr>
          <td><strong>${p.name}</strong></td>
          <td style="font-family:var(--mono)">${p.units}</td>
          <td style="font-family:var(--mono);color:var(--amber)">${fmt(p.revenue)}</td>
          <td style="font-family:var(--mono);font-weight:700;color:${p.profit>=0?'var(--green)':'var(--red)'}">${fmt(p.profit)}</td>
          <td><span style="font:700 .82rem var(--mono);color:${mc}">${p.margin.toFixed(1)}%</span></td>
        </tr>`;
      }).join('');

  // Lotes activos
  const allProds = await DB.getActiveProducts();
  const allLots  = (await DB.getLots()).filter(l=>l.qty_remaining>0).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const lotsBody = document.getElementById('repLotsBody');
  lotsBody.innerHTML = !allLots.length
    ? `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">Sin lotes activos</td></tr>`
    : allLots.map(l => {
        const pn = allProds.find(p=>p.id===l.product_id)?.name||'—';
        return `<tr>
          <td><strong>${pn}</strong></td>
          <td style="color:var(--text2)">${fmtDate(l.date)}</td>
          <td style="font-family:var(--mono);color:var(--amber)">Bs ${l.cost.toFixed(2)}</td>
          <td style="font-family:var(--mono)">${l.qty_remaining} <span style="color:var(--text3);font-size:.75rem">/ ${l.qty_initial}</span></td>
          <td style="font-family:var(--mono)">${fmt(l.qty_remaining*l.cost)}</td>
        </tr>`;
      }).join('');
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
async function init() {
  await DB.open();
  initNav();
  initScan();
  initPayment();
  initCartDeleteHold();
  renderCart();
  tickClock();
  setInterval(tickClock, 30000);

  // Ventas: fecha hoy
  const fv = document.getElementById('ventasFecha');
  fv.value = new Date().toISOString().split('T')[0];
  fv.addEventListener('change', e => renderSales(e.target.value));

  // Reportes: mes actual
  const hoy   = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
  document.getElementById('repDesde').value = desde;
  document.getElementById('repHasta').value = hoy.toISOString().split('T')[0];
  document.getElementById('btnRepFilter').addEventListener('click', renderReports);

  // Búsquedas
  document.getElementById('prodSearch').addEventListener('input', e => renderProducts(e.target.value));
  document.getElementById('invSearch').addEventListener('input', e => renderInventory(e.target.value));

  // Sort inventario
  document.querySelectorAll('.th-sort').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (invSort.col === col) invSort.dir *= -1; else { invSort.col = col; invSort.dir = 1; }
      renderInventory(document.getElementById('invSearch').value);
    });
  });

  // Botones productos
  document.getElementById('btnNuevo').addEventListener('click', openNewProduct);
  document.getElementById('btnAddBc').addEventListener('click', () => addBcRow());
  document.getElementById('btnSaveProd').addEventListener('click', saveProduct);
  document.getElementById('btnCancelProd').addEventListener('click', () => closeModal('modalProducto'));
  document.getElementById('modalProdX').addEventListener('click', () => closeModal('modalProducto'));

  // Botones stock
  document.getElementById('btnEntradaStock').addEventListener('click', () => openStockAdj());
  document.getElementById('btnSaveAdj').addEventListener('click', saveStockAdj);
  document.getElementById('btnCancelAdj').addEventListener('click', () => closeModal('modalStock'));
  document.getElementById('modalStockX').addEventListener('click', () => closeModal('modalStock'));

  // Ticket
  document.getElementById('btnLastTicket').addEventListener('click', async () => {
    if (lastSaleId) showTicket(await DB.getSale(lastSaleId));
  });
  document.getElementById('modalTicketX').addEventListener('click', () => closeModal('modalTicket'));
  document.getElementById('btnCloseTicket').addEventListener('click', () => closeModal('modalTicket'));
  document.getElementById('btnPrintTicket').addEventListener('click', () => window.print());

  // Scanner cámara
  document.getElementById('btnCamera').addEventListener('click', openScanner);
  document.getElementById('btnCancelScanner').addEventListener('click', closeScanner);
  document.getElementById('modalScannerX').addEventListener('click', closeScanner);

  // Discount modal
  document.getElementById('modalDiscountX').addEventListener('click', () => closeModal('modalDiscount'));

  // Escape cierra modales
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ['modalProducto','modalStock','modalTicket','modalScanner','modalDiscount','modalDelete'].forEach(closeModal);
  });

  // Ripple en botones
  document.addEventListener('pointerdown', e => {
    const btn = e.target.closest('.btn,.btn-primary,.btn-pay,.nav-btn');
    if (!btn) return;
    const r  = document.createElement('span'); r.className = 'ripple';
    const rc = btn.getBoundingClientRect();
    const sz = Math.max(rc.width, rc.height);
    r.style.cssText = `width:${sz}px;height:${sz}px;left:${e.clientX-rc.left-sz/2}px;top:${e.clientY-rc.top-sz/2}px`;
    btn.style.position = 'relative'; btn.style.overflow = 'hidden';
    btn.appendChild(r); setTimeout(() => r.remove(), 600);
  });

  // Iniciar autenticación OAuth (escritura en Sheets)
  Sheets.initAuth();

  // Auto-cargar y sincronizar desde Sheets
  async function syncFromSheets(silent = false) {
    if (!Sheets.isConfigured()) {
      setStatus('error', 'Sheets no configurado');
      const prods = await DB.getActiveProducts();
      if (prods.length) { renderProducts(); renderInventory(); }
      return;
    }
    if (!silent) setStatus('loading', 'Sincronizando…');
    try {
      // Primero: cargar desde Inventario (contiene los datos editados por el usuario)
      await Sheets.loadState();
      setStatus('ok', 'Sheets ✓');
      renderProducts(); renderInventory();
    } catch (err) {
      if (err.message === 'Inventario vacío en Sheets') {
        // Primera vez / Inventario vacío → usar Catalogo como base inicial
        try {
          await Sheets.loadCatalogo();
          setStatus('ok', 'Sheets ✓ (catálogo)');
          renderProducts(); renderInventory();
        } catch (err2) {
          setStatus('error', 'Sin conexión');
          const prods = await DB.getActiveProducts();
          if (prods.length) { renderProducts(); renderInventory(); }
        }
      } else {
        // Error de red u otro — usar datos locales sin borrar nada
        setStatus('error', 'Sin conexión');
        const prods = await DB.getActiveProducts();
        if (prods.length) { renderProducts(); renderInventory(); }
      }
    }
  }

  // Carga inicial
  setStatus('loading', 'Conectando…');
  await syncFromSheets();

  // Refresca automáticamente cada 5 minutos
  setInterval(() => syncFromSheets(true), 5 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
