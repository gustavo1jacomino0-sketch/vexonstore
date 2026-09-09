(function () {
  'use strict';

  const STORAGE_PREFIX = 'vexon_store_v2';
  let activeScope = getScope();
  let favorites = loadSet('favorites');
  let cart = loadCart();

  function getScope() {
    try {
      const user = window.vexonSupabase && window.vexonSupabase.auth;
      // Scope is refreshed by auth state changes below. Guest data remains available.
      return localStorage.getItem(STORAGE_PREFIX + '_scope') || 'guest';
    } catch (_) {
      return 'guest';
    }
  }

  function scopeKey(kind) {
    return STORAGE_PREFIX + '_' + activeScope + '_' + kind;
  }

  function loadSet(kind) {
    try {
      const raw = JSON.parse(localStorage.getItem(scopeKey(kind)) || '[]');
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(scopeKey('cart')) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (_) {
      return {};
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
    const map = {};
    productCards().forEach(card => {
      const p = getProductFromCard(card);
      if (p) map[p.id] = p;
    });
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + '_products') || '{}');
      Object.assign(saved, map);
      localStorage.setItem(STORAGE_PREFIX + '_products', JSON.stringify(saved));
      return saved;
    } catch (_) {
      return map;
    }
  }

  function savedProducts() {
    try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + '_products') || '{}'); }
    catch (_) { return {}; }
  }

  function formatBRL(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
        return `<article class="vexon-drawer-item"><img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}"><div class="vexon-drawer-info"><strong>${escapeHtml(p.name)}</strong><span>${formatBRL(p.price)}</span><div class="vexon-drawer-actions"><button type="button" data-add-cart="${escapeAttr(p.id)}">Adicionar ao carrinho</button><button type="button" class="icon-btn" data-remove-favorite="${escapeAttr(p.id)}" aria-label="Remover favorito">×</button></div></div></article>`;
      }
      const qty = Number(cart[id]?.quantity || 0);
      return `<article class="vexon-drawer-item"><img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}"><div class="vexon-drawer-info"><strong>${escapeHtml(p.name)}</strong><span>${formatBRL(p.price)}</span><div class="vexon-qty"><button type="button" data-qty="${escapeAttr(p.id)}" data-delta="-1">−</button><b>${qty}</b><button type="button" data-qty="${escapeAttr(p.id)}" data-delta="1">+</button><button type="button" class="icon-btn" data-remove-cart="${escapeAttr(p.id)}" aria-label="Remover do carrinho">×</button></div></div></article>`;
    }).join('');

    footer.hidden = false;
    if (mode === 'favorites') {
      footer.innerHTML = `<button type="button" class="vexon-drawer-primary" data-switch-cart>Ver carrinho</button>`;
    } else {
      footer.innerHTML = `<div class="vexon-total"><span>Total</span><strong>${formatBRL(cartTotal())}</strong></div><button type="button" class="vexon-drawer-primary" data-checkout>Finalizar compra</button><small>Pagamento seguro pelo Mercado Pago.</small>`;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function escapeAttr(value) { return escapeHtml(value); }

  function toggleFavorite(id) {
    id = String(id);
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
    const current = Number(cart[id]?.quantity || 0);
    cart[id] = { quantity: Math.max(1, current + Number(quantity || 1)), price: p.price, name: p.name, image: p.image };
    saveState();
    updateHeaderCounters();
    showToast(p.name + ' adicionado ao carrinho');
    if (document.querySelector('[data-shop-drawer]')?.classList.contains('is-open')) renderDrawer();
  }

  function changeQty(id, delta) {
    id = String(id);
    if (!cart[id]) return;
    cart[id].quantity = Number(cart[id].quantity || 0) + Number(delta || 0);
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
    updateHeaderCounters();
    updateFavoriteButtons();
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
    if (scope === activeScope) return;
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
      guestFavs.forEach(id => favorites.add(String(id)));
      const guestCart = JSON.parse(localStorage.getItem(STORAGE_PREFIX + '_guest_cart') || '{}');
      Object.entries(guestCart).forEach(([id, item]) => {
        cart[id] = cart[id] || item;
        cart[id].quantity = Number(cart[id].quantity || 0) + Number(item.quantity || 0);
      });
      saveState();
    } catch (_) {}
  }


  async function iniciarCheckoutMercadoPago(button) {
    const supabase = window.vexonSupabase;

    if (!supabase?.auth) {
      showToast('Supabase não está disponível. Recarregue a página.');
      return;
    }

    if (!cartCount()) {
      showToast('Seu carrinho está vazio.');
      return;
    }

    const originalText = button?.textContent || 'Finalizar compra';

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

      const products = allProductSnapshots();

      const items = Object.entries(cart)
        .filter(([, item]) => Number(item?.quantity || 0) > 0)
        .map(([id, item]) => {
          const product = products[id] || {};

          const productName =
            product.name ||
            item.name ||
            'Produto Vexon';

          const unitPrice = Number(
            product.price ?? item.price ?? 0
          );

          if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
            throw new Error(
              `Preço inválido para o produto "${productName}".`
            );
          }

          const quantity = Math.max(
            1,
            Math.floor(Number(item.quantity || 1))
          );

          return {
            id: String(id),
            title: String(productName),
            quantity,
            unit_price: Number(unitPrice.toFixed(2)),
            currency_id: 'BRL'
          };
        });

      if (!items.length) {
        showToast('Seu carrinho está vazio.');
        return;
      }

      const name =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        'Cliente Vexon';

      const externalReference =
        'VEXON-' +
        Date.now() +
        '-' +
        String(user.id)
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 12);

      const { data, error } =
        await supabase.functions.invoke(
          'create-payment',
          {
            body: {
              items,
              payer: {
                email: user.email,
                name
              },
              external_reference: externalReference
            }
          }
        );

      if (error) {
        throw new Error(
          error.message ||
          'Não foi possível criar o pagamento.'
        );
      }

      const checkoutUrl =
        data?.init_point ||
        data?.sandbox_init_point;

      if (!checkoutUrl) {
        console.error(
          'Resposta da create-payment:',
          data
        );

        throw new Error(
          'O Mercado Pago não retornou o checkout.'
        );
      }

      closeDrawer();
      window.location.assign(checkoutUrl);

    } catch (error) {
      console.error(
        'Erro no checkout Mercado Pago:',
        error
      );

      showToast(
        error?.message ||
        'Não foi possível iniciar o pagamento.'
      );

    } finally {
      if (button && document.body.contains(button)) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  function boot() {
    setupDrawer();
    addDataHooks();
    setupInteractions();
    refresh();
    syncScopeWithAuth();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();