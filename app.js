(() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbxsbK1pNHCDhBWgc65Ft4UKTwAwOYU7rBogPtQzj6VTTaQLPsjOfpGububuDKQXpNou/exec";
  const FALLBACK_URL = "data/products.json";
  const WA_NUMBER = "573112473836";
  const IMAGE_DIR = "imagenes/";
  const CART_KEY = "decoboom-cart-v1";

  const els = {
    grid: document.getElementById("grid"),
    search: document.getElementById("search"),
    catSelect: document.getElementById("catSelect"),
    resultCount: document.getElementById("resultCount"),
    openCart: document.getElementById("openCart"),
    closeCart: document.getElementById("closeCart"),
    overlay: document.getElementById("cartOverlay"),
    cart: document.getElementById("cart"),
    cartItems: document.getElementById("cartItems"),
    cartCount: document.getElementById("cartCount"),
    cartTotal: document.getElementById("cartTotal"),
    waCheckout: document.getElementById("waCheckout"),
    waGeneral: document.getElementById("waGeneral"),
    custName: document.getElementById("custName"),
    custCity: document.getElementById("custCity"),
    custNote: document.getElementById("custNote"),
    toast: document.getElementById("toast"),
  };

  const cop = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

  let products = [];
  let cart = loadCart();
  let toastTimer = 0;

  function pick(obj, keys, fallback = "") {
    for (const key of keys) {
      if (obj[key] != null && String(obj[key]).trim() !== "") return obj[key];
    }
    return fallback;
  }

  function parsePrice(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    const raw = String(value ?? "").replace(/[^\d.,-]/g, "").trim();
    if (!raw) return 0;
    if (raw.includes(",") && raw.includes(".")) {
      return Math.round(Number(raw.replace(/\./g, "").replace(",", ".")) || 0);
    }
    if (raw.includes(".")) {
      const parts = raw.split(".");
      if (parts.at(-1).length === 3) return Math.round(Number(parts.join("")) || 0);
    }
    return Math.round(Number(raw.replace(",", ".")) || 0);
  }

  function isSoldOut(estado) {
    return /agotado|sin\s*stock|no\s*disponible/i.test(String(estado || ""));
  }

  function imageSrc(filename) {
    const name = String(filename || "").trim();
    if (!name) return "";
    if (/^https?:\/\//i.test(name)) return name;
    if (name.startsWith("imagenes/")) return name;
    return IMAGE_DIR + name.replace(/^\/+/, "");
  }

  function normalize(raw) {
    const estado = String(pick(raw, ["estado", "Estado", "status", "disponibilidad"], "Disponible"));
    return {
      sku: String(pick(raw, ["sku", "SKU", "ID_Unico", "id_unico", "id"], "")),
      ref: String(pick(raw, ["ref", "referencia", "Referencia_Fabrica", "referencia_fabrica"], "SIN_REF")),
      name: String(pick(raw, ["name", "nombre", "Nombre_Producto", "nombre_producto", "producto"], "Producto")),
      price: parsePrice(pick(raw, ["price", "precio", "Precio"], 0)),
      estado,
      soldOut: isSoldOut(estado),
      categoria: String(pick(raw, ["categoria", "Categoria", "category", "categoría"], "Juguetes")),
      descripcion: String(pick(raw, ["descripcion", "Descripcion", "description"], "")),
      imagen: imageSrc(pick(raw, ["imagen", "image", "image_new", "imagen_url", "Nombre_Imagen", "nombre_imagen", "foto"], "")),
    };
  }

  function unwrapPayload(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    return data.products || data.data || data.items || data.rows || [];
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (!text || text.trim().startsWith("<")) throw new Error("Respuesta no JSON");
      return JSON.parse(text);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadProducts() {
    try {
      const remote = unwrapPayload(await fetchJson(API_URL)).map(normalize);
      if (remote.length) return remote;
      throw new Error("API vacía");
    } catch (err) {
      console.warn("API no disponible, usando catálogo local.", err);
      return unwrapPayload(await fetchJson(FALLBACK_URL)).map(normalize);
    }
  }

  function fillCategories() {
    const cats = [...new Set(products.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    const frag = document.createDocumentFragment();
    const all = document.createElement("option");
    all.value = "Todos";
    all.textContent = "Todas las categorías";
    frag.appendChild(all);
    for (const cat of cats) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      frag.appendChild(opt);
    }
    els.catSelect.replaceChildren(frag);
  }

  function matches(product, query, cat) {
    if (cat && cat !== "Todos" && product.categoria !== cat) return false;
    if (!query) return true;
    const hay = `${product.name} ${product.sku} ${product.ref} ${product.categoria}`.toLowerCase();
    return hay.includes(query);
  }

  function renderGrid() {
    const query = els.search.value.trim().toLowerCase();
    const cat = els.catSelect.value;
    const list = products.filter((p) => matches(p, query, cat));
    els.resultCount.textContent = `${list.length} producto${list.length === 1 ? "" : "s"}`;

    if (!list.length) {
      els.grid.innerHTML = `<div class="empty-state">No encontramos productos con ese filtro.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const p of list) {
      const card = document.createElement("article");
      card.className = "card" + (p.soldOut ? " sold" : "");
      card.innerHTML = `
        <div class="card-media">
          <img src="${escapeAttr(p.imagen)}" alt="${escapeAttr(p.name)}" loading="lazy" decoding="async">
          <span class="badge${p.soldOut ? " sold" : ""}">${p.soldOut ? "AGOTADO" : "Disponible"}</span>
        </div>
        <div class="card-body">
          <span class="card-cat">${escapeHtml(p.categoria)}</span>
          <h3>${escapeHtml(p.name)}</h3>
          <div class="card-meta">${escapeHtml(p.sku)}${p.ref && p.ref !== "SIN_REF" ? " · Ref " + escapeHtml(p.ref) : ""}</div>
          <div class="card-price">${formatMoney(p.price)}</div>
          <button class="add" type="button" data-sku="${escapeAttr(p.sku)}" ${p.soldOut ? "disabled" : ""}>
            ${p.soldOut ? "No disponible" : "Agregar al carrito"}
          </button>
        </div>`;
      frag.appendChild(card);
    }
    els.grid.replaceChildren(frag);
  }

  function formatMoney(n) {
    return "COP $ " + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function addToCart(sku) {
    const product = products.find((p) => p.sku === sku);
    if (!product || product.soldOut) return;
    cart[sku] = (cart[sku] || 0) + 1;
    saveCart();
    renderCart();
    showToast(`${product.name} agregado`);
  }

  function setQty(sku, qty) {
    if (qty <= 0) delete cart[sku];
    else cart[sku] = qty;
    saveCart();
    renderCart();
  }

  function cartEntries() {
    return Object.entries(cart)
      .map(([sku, qty]) => ({ product: products.find((p) => p.sku === sku), qty }))
      .filter((row) => row.product && row.qty > 0);
  }

  function cartTotal() {
    return cartEntries().reduce((sum, row) => sum + row.product.price * row.qty, 0);
  }

  function renderCart() {
    const rows = cartEntries();
    const count = rows.reduce((sum, row) => sum + row.qty, 0);
    els.cartCount.textContent = String(count);
    els.cartTotal.textContent = formatMoney(cartTotal());
    els.waCheckout.disabled = rows.length === 0;

    if (!rows.length) {
      els.cartItems.innerHTML = `<p class="empty">Tu carrito está vacío.</p>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const { product, qty } of rows) {
      const row = document.createElement("div");
      row.className = "cart-row";
      row.innerHTML = `
        <img src="${escapeAttr(product.imagen)}" alt="">
        <div>
          <h4>${escapeHtml(product.name)}</h4>
          <div class="sku">${escapeHtml(product.sku)}</div>
          <div class="qty">
            <button type="button" data-act="minus" data-sku="${escapeAttr(product.sku)}" aria-label="Quitar uno">−</button>
            <span>${qty}</span>
            <button type="button" data-act="plus" data-sku="${escapeAttr(product.sku)}" aria-label="Agregar uno">+</button>
            <button type="button" data-act="remove" data-sku="${escapeAttr(product.sku)}" aria-label="Eliminar">✕</button>
          </div>
        </div>
        <div class="line">${formatMoney(product.price * qty)}</div>`;
      frag.appendChild(row);
    }
    els.cartItems.replaceChildren(frag);
  }

  function openCart() {
    els.cart.classList.add("open");
    els.overlay.hidden = false;
    requestAnimationFrame(() => els.overlay.classList.add("open"));
    els.cart.setAttribute("aria-hidden", "false");
    els.openCart.setAttribute("aria-expanded", "true");
    els.closeCart.focus();
  }

  function closeCart() {
    els.cart.classList.remove("open");
    els.overlay.classList.remove("open");
    els.cart.setAttribute("aria-hidden", "true");
    els.openCart.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      if (!els.cart.classList.contains("open")) els.overlay.hidden = true;
    }, 320);
  }

  function buildWhatsAppMessage() {
    const rows = cartEntries();
    const lines = ["Hola DecoBoom J&C, quiero hacer este pedido:", ""];
    for (const { product, qty } of rows) {
      const sub = product.price * qty;
      lines.push(`• ${qty}x ${product.sku} — ${product.name} — ${formatMoney(product.price)} c/u = ${formatMoney(sub)}`);
    }
    lines.push("", `Total: ${formatMoney(cartTotal())}`);
    const name = els.custName.value.trim();
    const city = els.custCity.value.trim();
    const note = els.custNote.value.trim();
    if (name) lines.push(`Nombre: ${name}`);
    if (city) lines.push(`Entrega: ${city}`);
    if (note) lines.push(`Notas: ${note}`);
    return lines.join("\n");
  }

  function openWhatsApp(message) {
    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener");
  }

  function showToast(text) {
    els.toast.textContent = text;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  function debounce(fn, wait) {
    let t = 0;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  els.grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".add");
    if (!btn || btn.disabled) return;
    addToCart(btn.dataset.sku);
  });

  els.cartItems.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-sku]");
    if (!btn) return;
    const sku = btn.dataset.sku;
    const current = cart[sku] || 0;
    if (btn.dataset.act === "plus") setQty(sku, current + 1);
    if (btn.dataset.act === "minus") setQty(sku, current - 1);
    if (btn.dataset.act === "remove") setQty(sku, 0);
  });

  els.search.addEventListener("input", debounce(renderGrid, 80));
  els.search.addEventListener("search", renderGrid);
  els.search.addEventListener("change", renderGrid);
  els.catSelect.addEventListener("change", renderGrid);
  els.openCart.addEventListener("click", openCart);
  els.closeCart.addEventListener("click", closeCart);
  els.overlay.addEventListener("click", closeCart);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCart();
  });

  els.waCheckout.addEventListener("click", () => {
    if (!cartEntries().length) return;
    openWhatsApp(buildWhatsAppMessage());
  });

  els.waGeneral.addEventListener("click", (e) => {
    e.preventDefault();
    openWhatsApp("Hola DecoBoom, quiero hacer un pedido.");
  });

  loadProducts()
    .then((list) => {
      products = list.filter((p) => p.sku);
      fillCategories();
      renderGrid();
      renderCart();
    })
    .catch((err) => {
      console.error(err);
      els.grid.innerHTML = `<div class="empty-state">No se pudo cargar el catálogo. Revisa la conexión o el archivo local.</div>`;
    });
})();
