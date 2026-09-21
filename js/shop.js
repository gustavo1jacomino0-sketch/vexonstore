(function () {
  'use strict';

  const STORAGE_PREFIX = 'vexon_store_v2';
  // Never display a previous user's cart before the current session is known.
  let activeScope = 'guest';
  let checkoutBusy = false;
  let favorites = loadSet('favorites');
  let cart = loadCart();

  const STOCK_ENDPOINT = 'https://npivsnxqvoezopfckxne.supabase.co/functions/v1/bling-stock';
  const STOCK_CACHE_KEY = STORAGE_PREFIX + '_stock_cache';
  const STOCK_CACHE_MS = 60 * 1000;
  let stockBySku = new Map();
  let stockState = 'loading';
  let stockPromise = null;

  function scopeKey(kind) {
    return STORAGE_PREFIX + '_' + activeScope + '_' + kind;
  }

  function loadSet(kind) {
    try {
      const raw = JSON.parse(localStorage.getItem(scopeKey(kind)) || '[]');
      return new Set(Array.isArray(raw) ? raw.filter(id => Object.hasOwn(window.VEXON_CATALOG || {}, id)).slice(0,100) : []);
    } catch (_) {
      return new Set();
    }
  }

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(scopeKey('cart')) || '{}');
      const clean = Object.create(null);
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [id, item] of Object.entries(raw)) {
          if (Object.hasOwn(window.VEXON_CATALOG || {}, id) && Number.isSafeInteger(item?.quantity) && item.quantity > 0) clean[id] = { quantity: Math.min(20,item.quantity) };
        }
      }
      return clean;
    } catch (_) {
      return Object.create(null);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(scopeKey('favorites'), JSON.stringify([...favorites]));
      localStorage.setItem(scopeKey('cart'), JSON.stringify(cart));
    } catch (_) {}
  }

  function productCards() {
    return [...document.querySelectorAll('[data-product-id]')];
  }

  function getProductFromCard(card) {
    if (!card) return null;
    const id = card.dataset.productId;
    if (!id) return null;
    const image = card.querySelector('img');
    return {
      id,
      name: card.dataset.productName || card.querySelector('h3,h4')?.textContent.trim() || 'Produto Vexon',
      description: card.dataset.productDescription || card.querySelector('p')?.textContent.trim() || '',
      price: Number(card.dataset.productPrice || 0),
      image: image ? new URL(image.getAttribute('src'), window.location.href).href : '',
      page: window.location.href
    };
  }

  function allProductSnapshots() {
    return savedProducts();
  }

  function savedProducts() {
    const map = Object.create(null);
    const base = new URL(window.location.pathname.includes('/pages/') ? '../' : './', window.location.href);
    for (const [id,p] of Object.entries(window.VEXON_CATALOG || {})) {
      if (p.active) map[id] = { id, name:p.name, price:p.price_cents/100, image:new URL(p.image,base).href };
    }
    return map;
  }

  function formatBRL(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function makeSku(name) {
    const clean = String(name || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toUpperCase();
    return clean ? 'VEX-' + clean : '';
  }

  function stockForProduct(id) {
    const product = window.VEXON_CATALOG?.[String(id)];
    if (!product) return null;
    const sku = makeSku(product.name);
    return stockBySku.get(sku) || null;
  }

  function availableStock(id) {
    const row = stockForProduct(id);
    if (!row) return null;
    const value = Number(row.quantidade_disponivel);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
  }

  function applyStockPayload(payload) {
    const next = new Map();
    const rows = Array.isArray(payload?.produtos) ? payload.produtos : [];
    for (const row of rows) {
      const sku = String(row?.sku || '').trim().toUpperCase();
      const qty = Number(row?.quantidade_disponivel);
      if (!/^VEX-[A-Z0-9-]{1,120}$/.test(sku) || !Number.isFinite(qty)) continue;
      next.set(sku, {
        sku,
        quantidade_disponivel: Math.max(0, Math.floor(qty)),
        em_estoque: Boolean(row?.em_estoque) && qty > 0
      });
    }
    stockBySku = next;
    stockState = 'ready';
  }

  function readStockCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(STOCK_CACHE_KEY) || 'null');
      if (!cached || !Number.isFinite(cached.savedAt) || Date.now() - cached.savedAt > STOCK_CACHE_MS) return false;
      if (!cached.data?.ok || !Array.isArray(cached.data?.produtos)) return false;
      applyStockPayload(cached.data);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function loadStock(options = {}) {
    const force = Boolean(options.force);
    if (!force && stockState === 'ready') return true;
    if (!force && readStockCache()) { updateStockUi(); return true; }
    if (stockPromise && !force) return stockPromise;

    stockState = 'loading';
    updateStockUi();

    const request = (async () => {
      try {
        const response = await fetch(STOCK_ENDPOINT, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('stock_http_' + response.status);
        const data = await response.json();
        if (data?.ok !== true || !Array.isArray(data?.produtos)) throw new Error('stock_payload_invalid');
        applyStockPayload(data);
        try { sessionStorage.setItem(STOCK_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data })); } catch (_) {}
        updateStockUi();
        if (document.querySelector('[data-shop-drawer]')?.classList.contains('is-open')) renderDrawer();
        return true;
      } catch (_) {
        stockState = 'error';
        updateStockUi();
        if (document.querySelector('[data-shop-drawer]')?.classList.contains('is-open')) renderDrawer();
        return false;
      } finally {
        stockPromise = null;
      }
    })();

    stockPromise = request;
    return request;
  }

  function stockLabel(id) {
    if (stockState === 'loading') return { text: 'Consultando estoque...', className: 'is-loading' };
    if (stockState !== 'ready') return { text: 'Estoque temporariamente indisponível', className: 'is-error' };
    const qty = availableStock(id);
    if (qty === null) return { text: 'Estoque não localizado', className: 'is-error' };
    if (qty <= 0) return { text: 'Esgotado', className: 'is-out' };
    if (qty <= 5) return { text: `Últimas ${qty} ${qty === 1 ? 'unidade' : 'unidades'}`, className: 'is-low' };
    return { text: `${qty} unidades em estoque`, className: 'is-available' };
  }

  function updateStockUi() {
    productCards().forEach(card => {
      const id = String(card.dataset.productId || '');
      const product = window.VEXON_CATALOG?.[id];
      if (!product) return;

      let badge = card.querySelector('[data-stock-status]');
      if (!badge) {
        badge = document.createElement('div');
        badge.dataset.stockStatus = '';
        badge.className = 'vexon-stock-status';
        const addButton = card.querySelector('[data-add-cart]');
        if (addButton) addButton.before(badge);
        else card.appendChild(badge);
      }

      const status = stockLabel(id);
      badge.textContent = status.text;
      badge.className = 'vexon-stock-status ' + status.className;

      const qty = availableStock(id);
      card.dataset.stockQuantity = qty === null ? '' : String(qty);

      const addButton = card.querySelector('[data-add-cart]');
      if (!addButton) return;

      const available = product.active && stockState === 'ready' && Number.isSafeInteger(qty) && qty > 0;
      addButton.disabled = !available;
      addButton.setAttribute('aria-disabled', available ? 'false' : 'true');
      if (!product.active) addButton.textContent = 'Indisponível';
      else if (stockState === 'loading') addButton.textContent = 'Consultando estoque...';
      else if (stockState !== 'ready' || qty === null) addButton.textContent = 'Estoque indisponível';
      else if (qty <= 0) addButton.textContent = 'Esgotado';
      else addButton.textContent = 'Adicionar ao carrinho';
    });
  }

  function cartStockIssue() {
    if (stockState !== 'ready') return 'Não foi possível confirmar o estoque agora.';
    const products = savedProducts();
    for (const [id, item] of Object.entries(cart)) {
      const qty = Number(item?.quantity || 0);
      if (qty <= 0) continue;
      const available = availableStock(id);
      if (!Number.isSafeInteger(available)) return `Estoque de ${products[id]?.name || 'um produto'} indisponível.`;
      if (available <= 0) return `${products[id]?.name || 'Produto'} está esgotado.`;
      if (qty > available) return `${products[id]?.name || 'Produto'}: somente ${available} ${available === 1 ? 'unidade disponível' : 'unidades disponíveis'}.`;
    }
    return '';
  }

  function cartCount() {
    return Object.values(cart).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  function cartTotal() {
    const products = savedProducts();
    return Object.entries(cart).reduce((sum, [id, item]) => {
      return sum + (Number(products[id]?.price || item.price || 0) * Number(item.quantity || 0));
    }, 0);
  }

  function updateHeaderCounters() {
    const favCount = favorites.size;
    const cCount = cartCount();
    document.querySelectorAll('[data-favorites-count]').forEach(el => el.textContent = favCount);
    document.querySelectorAll('[data-cart-count]').forEach(el => el.textContent = cCount);
    document.querySelectorAll('[data-cart-total]').forEach(el => el.textContent = formatBRL(cartTotal()));
  }

  function updateFavoriteButtons() {
    document.querySelectorAll('[data-favorite-product]').forEach(btn => {
      const active = favorites.has(String(btn.dataset.favoriteProduct));
      btn.classList.toggle('is-favorite', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.setAttribute('aria-label', active ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
      btn.querySelector('[data-heart-icon]')?.replaceChildren(document.createTextNode(active ? '♥' : '♡'));
    });
  }

  function showToast(message) {
    let toast = document.querySelector('.vexon-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'vexon-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function openDrawer(type) {
    const drawer = document.querySelector('[data-shop-drawer]');
    if (!drawer) return;
    drawer.dataset.mode = type;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    renderDrawer();
    document.body.classList.add('vexon-drawer-open');
  }

  function closeDrawer() {
    const drawer = document.querySelector('[data-shop-drawer]');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('vexon-drawer-open');
  }

  function renderDrawer() {
    const drawer = document.querySelector('[data-shop-drawer]');
    if (!drawer) return;
    const mode = drawer.dataset.mode || 'cart';
    const products = savedProducts();
    const ids = mode === 'favorites' ? [...favorites] : Object.keys(cart).filter(id => Number(cart[id]?.quantity) > 0);
    const list = drawer.querySelector('[data-drawer-list]');
    const title = drawer.querySelector('[data-drawer-title]');
    const footer = drawer.querySelector('[data-drawer-footer]');
    title.textContent = mode === 'favorites' ? 'Seus favoritos' : 'Seu carrinho';

    if (!ids.length) {
      list.innerHTML = `<div class="vexon-empty"><div class="vexon-empty-icon">${mode === 'favorites' ? '♡' : '🛒'}</div><strong>${mode === 'favorites' ? 'Nenhum favorito ainda' : 'Seu carrinho está vazio'}</strong><p>${mode === 'favorites' ? 'Clique no coração de um produto para salvá-lo aqui.' : 'Adicione produtos para começar sua compra.'}</p><button type="button" data-close-drawer>Continuar comprando</button></div>`;
      footer.hidden = true;
      return;
    }

    list.innerHTML = ids.map(id => {
      const p = products[id];
      if (!p) return '';
      if (mode === 'favorites') {
        const available = availableStock(id);
        const canAdd = stockState === 'ready' && Number.isSafeInteger(available) && available > 0;
        const stockText = stockLabel(id).text;
        return `<article class="vexon-drawer-item"><img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}"><div class="vexon-drawer-info"><strong>${escapeHtml(p.name)}</strong><span>${formatBRL(p.price)}</span><small class="vexon-drawer-stock">${escapeHtml(stockText)}</small><div class="vexon-drawer-actions"><button type="button" data-add-cart="${escapeAttr(p.id)}" ${canAdd ? '' : 'disabled'}>${canAdd ? 'Adicionar ao carrinho' : 'Indisponível'}</button><button type="button" class="icon-btn" data-remove-favorite="${escapeAttr(p.id)}" aria-label="Remover favorito">×</button></div></div></article>`;
      }
      const qty = Number(cart[id]?.quantity || 0);
      const available = availableStock(id);
      const canIncrease = stockState === 'ready' && Number.isSafeInteger(available) && qty < Math.min(20, available);
      const stockText = stockLabel(id).text;
      return `<article class="vexon-drawer-item"><img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}"><div class="vexon-drawer-info"><strong>${escapeHtml(p.name)}</strong><span>${formatBRL(p.price)}</span><small class="vexon-drawer-stock">${escapeHtml(stockText)}</small><div class="vexon-qty"><button type="button" data-qty="${escapeAttr(p.id)}" data-delta="-1">−</button><b>${qty}</b><button type="button" data-qty="${escapeAttr(p.id)}" data-delta="1" ${canIncrease ? '' : 'disabled'}>+</button><button type="button" class="icon-btn" data-remove-cart="${escapeAttr(p.id)}" aria-label="Remover do carrinho">×</button></div></div></article>`;
    }).join('');

    footer.hidden = false;
    if (mode === 'favorites') {
      footer.innerHTML = `<button type="button" class="vexon-drawer-primary" data-switch-cart>Ver carrinho</button>`;
    } else {
      const issue = cartStockIssue();
      footer.innerHTML = `<div class="vexon-total"><span>Total</span><strong>${formatBRL(cartTotal())}</strong></div>${issue ? `<small class="vexon-stock-warning">${escapeHtml(issue)}</small>` : ''}<button type="button" class="vexon-drawer-primary" data-checkout ${issue ? 'disabled' : ''}>Finalizar compra</button><small>Pagamento seguro pelo Mercado Pago.</small>`;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function escapeAttr(value) { return escapeHtml(value); }

  function toggleFavorite(id) {
    id = String(id);
    if (!Object.hasOwn(window.VEXON_CATALOG || {}, id)) return;
    if (favorites.has(id)) {
      favorites.delete(id);
      showToast('Removido dos favoritos');
    } else {
      favorites.add(id);
      showToast('Adicionado aos favoritos');
    }
    allProductSnapshots();
    saveState();
    updateHeaderCounters();
    updateFavoriteButtons();
    if (document.querySelector('[data-shop-drawer]')?.classList.contains('is-open')) renderDrawer();
  }

  function addToCart(id, quantity) {
    id = String(id);
    const products = allProductSnapshots();
    const p = products[id];
    if (!p) return;
    if (stockState !== 'ready') { showToast('Aguarde a confirmação do estoque.'); return; }
    const available = availableStock(id);
    if (!Number.isSafeInteger(available) || available <= 0) { showToast('Produto esgotado.'); return; }
    const current = Number(cart[id]?.quantity || 0);
    const requested = current + Number(quantity || 1);
    const limit = Math.min(20, available);
    if (requested > limit) {
      showToast(`Quantidade máxima disponível: ${limit}.`);
      return;
    }
    cart[id] = { quantity: Math.max(1, requested) };
    saveState();
    updateHeaderCounters();
    showToast(p.name + ' adicionado ao carrinho');
    if (document.querySelector('[data-shop-drawer]')?.classList.contains('is-open')) renderDrawer();
  }

  function changeQty(id, delta) {
    id = String(id);
    if (!cart[id]) return;
    if (![1,-1].includes(delta)) return;
    if (delta === 1) {
      if (stockState !== 'ready') { showToast('Aguarde a confirmação do estoque.'); return; }
      const available = availableStock(id);
      const current = Number(cart[id].quantity || 0);
      if (!Number.isSafeInteger(available) || current >= Math.min(20, available)) {
        showToast(Number.isSafeInteger(available) ? `Quantidade máxima disponível: ${Math.min(20, available)}.` : 'Estoque indisponível.');
        return;
      }
    }
    cart[id].quantity = Math.min(20, Number(cart[id].quantity || 0) + delta);
    if (cart[id].quantity <= 0) delete cart[id];
    saveState();
    updateHeaderCounters();
    renderDrawer();
  }

  function removeCart(id) {
    delete cart[String(id)];
    saveState();
    updateHeaderCounters();
    renderDrawer();
  }

  function removeFavorite(id) {
    favorites.delete(String(id));
    saveState();
    updateHeaderCounters();
    updateFavoriteButtons();
    renderDrawer();
  }

  function setupDrawer() {
    if (document.querySelector('[data-shop-drawer]')) return;
    const el = document.createElement('aside');
    el.className = 'vexon-drawer';
    el.dataset.shopDrawer = '';
    el.dataset.mode = 'cart';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="vexon-drawer-backdrop" data-close-drawer></div><section class="vexon-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="vexon-drawer-title"><header class="vexon-drawer-header"><h2 id="vexon-drawer-title" data-drawer-title>Seu carrinho</h2><button type="button" class="icon-btn" data-close-drawer aria-label="Fechar">×</button></header><div class="vexon-drawer-list" data-drawer-list></div><footer class="vexon-drawer-footer" data-drawer-footer></footer></section>`;
    document.body.appendChild(el);
  }

  function setupInteractions() {
    document.addEventListener('click', event => {
      const target = event.target.closest?.('[data-shop-action],[data-favorite-product],[data-add-cart],[data-qty],[data-remove-cart],[data-remove-favorite],[data-close-drawer],[data-switch-cart],[data-checkout]');
      if (!target) return;
      if (target.dataset.shopAction === 'favorites') return openDrawer('favorites');
      if (target.dataset.shopAction === 'cart') return openDrawer('cart');
      if (target.dataset.favoriteProduct) return toggleFavorite(target.dataset.favoriteProduct);
      if (target.dataset.addCart) { addToCart(target.dataset.addCart, 1); return; }
      if (target.dataset.qty) { changeQty(target.dataset.qty, Number(target.dataset.delta || 0)); return; }
      if (target.dataset.removeCart) { removeCart(target.dataset.removeCart); return; }
      if (target.dataset.removeFavorite) { removeFavorite(target.dataset.removeFavorite); return; }
      if (target.dataset.closeDrawer !== undefined) return closeDrawer();
      if (target.dataset.switchCart !== undefined) return openDrawer('cart');
      if (target.dataset.checkout !== undefined) {
        iniciarCheckoutMercadoPago(target);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeDrawer();
    });

    document.querySelectorAll('[data-shop-search]').forEach(input => {
      input.addEventListener('input', () => filterProducts(input.value));
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); filterProducts(input.value); }
      });
    });
    document.querySelectorAll('[data-shop-search-button]').forEach(btn => btn.addEventListener('click', () => {
      const input = document.querySelector('[data-shop-search]');
      filterProducts(input?.value || '');
      input?.focus();
    }));
  }

  function filterProducts(query) {
    const q = String(query || '').trim().toLowerCase();
    let visible = 0;
    productCards().forEach(card => {
      const text = (card.dataset.productName + ' ' + card.dataset.productDescription).toLowerCase();
      const match = !q || text.includes(q);
      const scene = card.closest('.scene-3d') || card.parentElement;
      scene.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    let note = document.querySelector('[data-search-empty]');
    if (!q || visible) { note?.remove(); return; }
    const container = document.querySelector('[data-product-grid]') || productCards()[0]?.parentElement;
    if (!container) return;
    note = document.createElement('div');
    note.dataset.searchEmpty = '';
    note.className = 'vexon-search-empty';
    note.textContent = 'Nenhum produto encontrado para “' + query + '”.';
    container.appendChild(note);
  }

  function addDataHooks() {
    document.querySelectorAll('button[aria-label="Ver favoritos"]').forEach(btn => btn.dataset.shopAction = 'favorites');
    document.querySelectorAll('button[aria-label="Ver carrinho"]').forEach(btn => btn.dataset.shopAction = 'cart');
    document.querySelectorAll('input[type="search"]').forEach(input => input.dataset.shopSearch = '');
    document.querySelectorAll('button[aria-label="Buscar"]').forEach(btn => btn.dataset.shopSearchButton = '');

    document.querySelectorAll('[data-favorite-product]').forEach(btn => {
      if (!btn.querySelector('[data-heart-icon]')) {
        btn.innerHTML = '<span data-heart-icon aria-hidden="true">♡</span>';
      }
    });
  }

  function refresh() {
    addDataHooks();
    allProductSnapshots();
    productCards().forEach(card => {
      const product = window.VEXON_CATALOG?.[card.dataset.productId];
      if (!product) return;
      card.dataset.productPrice = String(product.price_cents / 100);
      const price = card.querySelector('.text-lg.font-extrabold');
      if (price) price.textContent = formatBRL(product.price_cents / 100);
    });
    updateStockUi();
    updateHeaderCounters();
    updateFavoriteButtons();
    if (document.querySelector('[data-shop-drawer]')?.classList.contains('is-open')) renderDrawer();
  }

  async function syncScopeWithAuth() {
    if (!window.vexonSupabase?.auth) return;
    try {
      const { data } = await window.vexonSupabase.auth.getSession();
      setScope(data.session?.user?.id || 'guest');
      window.vexonSupabase.auth.onAuthStateChange((_event, session) => setScope(session?.user?.id || 'guest'));
    } catch (_) {}
  }

  function setScope(scope) {
    scope = scope || 'guest';
    if (scope === activeScope) { refresh(); return; }
    const previousScope = activeScope;
    activeScope = String(scope);
    try { localStorage.setItem(STORAGE_PREFIX + '_scope', activeScope); } catch (_) {}
    favorites = loadSet('favorites');
    cart = loadCart();
    // When a user logs in for the first time, preserve guest selections instead of losing them.
    if (previousScope === 'guest' && activeScope !== 'guest') {
      mergeGuestIntoCurrent();
    }
    refresh();
  }

  function mergeGuestIntoCurrent() {
    try {
      const guestFavs = new Set(JSON.parse(localStorage.getItem(STORAGE_PREFIX + '_guest_favorites') || '[]'));
      guestFavs.forEach(id => { if (Object.hasOwn(window.VEXON_CATALOG || {}, id)) favorites.add(id); });
      const guestCart = JSON.parse(localStorage.getItem(STORAGE_PREFIX + '_guest_cart') || '{}');
      Object.entries(guestCart).forEach(([id, item]) => {
        if (!Object.hasOwn(window.VEXON_CATALOG || {}, id) || !Number.isSafeInteger(item?.quantity) || item.quantity < 1) return;
        cart[id] = { quantity: Math.min(20, (cart[id]?.quantity || 0) + item.quantity) };
      });
      saveState();
      localStorage.removeItem(STORAGE_PREFIX + '_guest_favorites');
      localStorage.removeItem(STORAGE_PREFIX + '_guest_cart');
    } catch (_) {}
  }


  async function iniciarCheckoutMercadoPago(button) {
    if (checkoutBusy) return;
    const supabase = window.vexonSupabase;

    if (!supabase?.auth) {
      showToast('Supabase não está disponível. Recarregue a página.');
      return;
    }

    if (!cartCount()) {
      showToast('Seu carrinho está vazio.');
      return;
    }

    const stockOk = await loadStock({ force: true });
    if (!stockOk) {
      showToast('Não foi possível confirmar o estoque. Tente novamente.');
      return;
    }
    const stockIssue = cartStockIssue();
    if (stockIssue) {
      showToast(stockIssue);
      renderDrawer();
      return;
    }

    const originalText = button?.textContent || 'Finalizar compra';
    checkoutBusy = true;

    if (button) {
      button.disabled = true;
      button.textContent = 'Preparando pagamento...';
    }

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const user = sessionData?.session?.user;

      if (!user?.email) {
        showToast('Entre na sua conta para continuar.');

        const authUrl = new URL('/auth.html', window.location.origin);
        authUrl.searchParams.set(
          'redirect',
          window.location.pathname + window.location.search
        );

        window.location.href = authUrl.toString();
        return;
      }

      setScope(user.id);
      const items = Object.entries(cart)
        .filter(([, item]) => Number(item?.quantity || 0) > 0)
        .map(([id, item]) => ({ id, quantity: item.quantity }))
        .sort((a,b) => a.id.localeCompare(b.id));

      if (!items.length) {
        showToast('Seu carrinho está vazio.');
        return;
      }

      const signature = JSON.stringify(items), key = STORAGE_PREFIX + '_checkout_' + user.id;
      let operation;
      try { operation = JSON.parse(sessionStorage.getItem(key)); } catch (_) {}
      if (!operation || operation.signature !== signature || !/^[a-f0-9-]{36}$/i.test(operation.id || '')) {
        operation = { signature, id: crypto.randomUUID() };
        sessionStorage.setItem(key, JSON.stringify(operation));
      }

      const { data, error } =
        await supabase.functions.invoke(
          'create-payment',
          {
            body: {
              items, request_id: operation.id
            }
          }
        );

      if (error) {
        let message = 'Não foi possível iniciar o pagamento. Tente novamente.';
        try { const result = await error.context?.json(); if (typeof result?.error === 'string') message = result.error.slice(0,220); } catch (_) {}
        throw new Error(message);
      }

      const checkoutUrl = new URL(data?.checkout_url);
      if (checkoutUrl.protocol !== 'https:' || !['www.mercadopago.com.br','sandbox.mercadopago.com.br'].includes(checkoutUrl.hostname) || checkoutUrl.port || checkoutUrl.username || checkoutUrl.password || !checkoutUrl.pathname.startsWith('/checkout/')) throw new Error('Endereço de pagamento inválido.');
      sessionStorage.setItem('vexon_last_order', String(data.order_id));

      closeDrawer();
      window.location.assign(checkoutUrl.href);

    } catch (error) {
      showToast(
        error?.message ||
        'Não foi possível iniciar o pagamento.'
      );

    } finally {
      checkoutBusy = false;
      if (button && document.body.contains(button)) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  function boot() {
    console.log('VEXON SHOP INICIOU');
    setupDrawer();
    addDataHooks();
    setupInteractions();
    refresh();
    syncScopeWithAuth();
    loadStock();
    console.log('VEXON CHAMANDO ESTOQUE');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
