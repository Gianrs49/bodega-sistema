document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const searchInput = document.getElementById('buscador');
    const resultsContainer = document.getElementById('resultado');
    const totalElement = document.getElementById('totalVentas');
    const salesLogBody = document.getElementById('salesLogBody');

    // Ticket Elements
    const ticketContainer = document.getElementById('ticket');
    const ticketList = document.getElementById('ticketList');
    const ticketTotalElement = document.getElementById('ticketTotal');
    const finalizeSaleBtn = document.getElementById('finalizeSale');

    // Modal Elements
    const saleModal = document.getElementById('saleModal');
    const modalProductName = document.getElementById('modalProductName');
    const modalStockValue = document.getElementById('modalStockValue');
    const modalUnit = document.getElementById('modalUnit');
    const saleQuantityInput = document.getElementById('saleQuantity');
    const confirmSaleBtn = document.getElementById('confirmSale');
    const cancelSaleBtn = document.getElementById('cancelSale');

    // URLs
    const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTXankf6y-mM8geqPo9FiHMGBjoyTOpwdDgCb4yuYdJcKuUcRE6Ajgj2BIT1dPHzDpnNBJiR7nKgAKA/pub?output=csv';
    const API_URL = 'https://script.google.com/macros/s/AKfycbzmVGri_eeFFsZPPQ1EljkI6u_o3GprN9ApygWXJ52wznxofOIvrDwgIdV8BiXSL3Mr-w/exec';

    // --- State ---
    let products = [];
    let cart = []; // Array of pending items
    let salesLog = [];
    let totalSoldDay = 0.00;

    let currentProductId = null;

    // --- Initialization ---
    init();

    function init() {
        console.log('Bodega POS System initializing (Cart Mode)...');
        // Update Modal Button Text
        confirmSaleBtn.textContent = 'Agregar al Ticket';

        loadData();
        setupEventListeners();
    }

    function setupEventListeners() {
        // Search
        searchInput.addEventListener('input', handleSearch);

        // Product Click (Delegation)
        resultsContainer.addEventListener('click', handleProductClick);

        // Modal Actions
        cancelSaleBtn.addEventListener('click', closeModal);
        confirmSaleBtn.addEventListener('click', addToCart); // Changed from processSale

        // Ticket Actions
        finalizeSaleBtn.addEventListener('click', finalizeSale);

        // Modal UX
        saleModal.addEventListener('click', (e) => {
            if (e.target === saleModal) closeModal();
        });
        saleQuantityInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addToCart();
        });
    }

    // --- Interaction Logic ---
    function handleProductClick(e) {
        const card = e.target.closest('.product-card');
        if (!card) return;

        const productId = card.dataset.id;
        if (productId) openModal(productId);
    }

    // --- Data Loading ---
    function loadData() {
        resultsContainer.innerHTML = '<div class="loading">Cargando inventario...</div>';

        Papa.parse(CSV_URL, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                if (results.data && results.data.length > 0) {
                    products = results.data.map((item, index) => normalizeProduct(item, index));
                    console.log('Productos cargados:', products.length);
                    resultsContainer.innerHTML = '';
                } else {
                    resultsContainer.innerHTML = '<div class="loading" style="color: #ef4444;">Error: Inventario vacío.</div>';
                }
            },
            error: function (err) {
                console.error('Error CSV:', err);
                resultsContainer.innerHTML = '<div class="loading" style="color: #ef4444;">Error de conexión.</div>';
            }
        });
    }

    function normalizeProduct(rawProduct, index) {
        const safeProduct = {};
        Object.keys(rawProduct).forEach(k => {
            safeProduct[k.trim().toLowerCase()] = rawProduct[k];
        });

        const rawPrice = safeProduct['precio'];
        const cleanPrice = typeof rawPrice === 'string' ? rawPrice.replace(/[^0-9.-]+/g, "") : rawPrice;

        const rawStock = safeProduct['stock'];
        const cleanStock = typeof rawStock === 'string' ? rawStock.replace(/,/g, ".") : rawStock;

        return {
            id: index,
            nombre: safeProduct['nombre'] || 'Sin Nombre',
            precio: parseFloat(cleanPrice) || 0,
            stock: parseFloat(cleanStock) || 0,
            unidad: safeProduct['unidad'] || '',
            originalObj: rawProduct
        };
    }

    // --- Search & Render ---
    function handleSearch(e) {
        const query = e.target.value.toLowerCase().trim();
        if (!products.length) return;

        if (query.length === 0) {
            resultsContainer.innerHTML = '';
            return;
        }

        const filtered = products.filter(product =>
            product.nombre.toLowerCase().includes(query)
        );

        renderResults(filtered);
    }

    function renderResults(items) {
        resultsContainer.innerHTML = '';
        if (items.length === 0) {
            resultsContainer.innerHTML = '<div class="loading">No encontrado.</div>';
            return;
        }

        items.forEach(product => {
            const isLowStock = product.stock < 5;
            const card = document.createElement('div');
            card.className = 'product-card';
            card.dataset.id = product.id;

            card.innerHTML = `
                <div class="product-info">
                    <h3>${product.nombre}</h3>
                    <div class="stock-info" id="stock-${product.id}">
                        ${getStockHtml(product)}
                    </div>
                </div>
                <div class="price">S/ ${product.precio.toFixed(2)}</div>
            `;
            resultsContainer.appendChild(card);
        });
    }

    function getStockHtml(product) {
        const isLowStock = product.stock < 5;
        const stockDisplay = formatStock(product.stock);
        let html = `Stock: <strong class="stock-val">${stockDisplay}</strong> <span class="unit">${product.unidad}</span>`;
        if (isLowStock) html += ` <span class="alert-badge">¡Reponer!</span>`;
        return html;
    }

    function formatStock(num) {
        return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
    }

    // --- Modal Logic ---
    function openModal(productId) {
        const product = products.find(p => p.id == productId);
        if (!product) return;

        currentProductId = productId;
        modalProductName.textContent = product.nombre;
        modalStockValue.textContent = formatStock(product.stock);
        modalUnit.textContent = product.unidad;
        saleQuantityInput.value = '';

        saleModal.style.display = 'flex';
        setTimeout(() => saleQuantityInput.focus(), 50);
    }

    function closeModal() {
        saleModal.style.display = 'none';
        currentProductId = null;
    }

    // --- Cart Logic (New) ---
    function addToCart() {
        if (currentProductId === null) return;
        const product = products.find(p => p.id == currentProductId);
        if (!product) return;

        const qty = parseFloat(saleQuantityInput.value);
        if (isNaN(qty) || qty <= 0) {
            alert('Cantidad inválida.');
            return;
        }

        // Add to Cart Array
        const subtotal = qty * product.precio;
        cart.push({
            product: product,
            qty: qty,
            subtotal: subtotal
        });

        // Visual Stock Update (Provisional)
        product.stock -= qty;
        updateProductCardUI(product);

        // Update Ticket UI
        renderTicket();

        closeModal();
    }

    function renderTicket() {
        if (cart.length > 0) {
            ticketContainer.style.display = 'flex';
        } else {
            ticketContainer.style.display = 'none';
            return;
        }

        // Render List
        ticketList.innerHTML = '';
        let totalTicket = 0;

        cart.forEach((item, index) => {
            totalTicket += item.subtotal;

            const li = document.createElement('li');
            li.className = 'ticket-item';
            li.innerHTML = `
                <div class="item-details">
                    <span>${item.product.nombre}</span>
                    <span style="color:var(--text-secondary)">x${formatStock(item.qty)}</span>
                </div>
                <strong>S/ ${item.subtotal.toFixed(2)}</strong>
            `;
            ticketList.appendChild(li);
        });

        ticketTotalElement.textContent = `Total: S/ ${totalTicket.toFixed(2)}`;
    }

    // --- Finalize Sale Logic ---
    async function finalizeSale() {
        if (cart.length === 0) return;

        if (!confirm(`¿Confirmar venta por S/ ${getCartTotal().toFixed(2)}?`)) return;

        const originalBtnText = finalizeSaleBtn.textContent;
        finalizeSaleBtn.textContent = 'Procesando...';
        finalizeSaleBtn.disabled = true;

        try {
            // Process all items
            // We'll map them to fetch promises
            const promises = cart.map(item => {
                const saleData = {
                    producto: item.product.nombre,
                    cantidad: item.qty,
                    total: item.subtotal
                };

                return fetch(API_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(saleData)
                });
            });

            await Promise.all(promises);

            // Success Update
            totalSoldDay += getCartTotal();

            // Move cart items to Sales Log
            cart.forEach(item => {
                salesLog.unshift({
                    product: item.product.nombre,
                    qty: item.qty,
                    total: item.subtotal,
                    time: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
                });
            });

            // Clear Cart
            cart = [];
            renderTicket(); // Will hide it

            updateSummaryPanel();
            updateSalesLogTable();

            alert('¡Venta Finalizada con Éxito!');

        } catch (err) {
            console.error(err);
            alert('Hubo un error de conexión al guardar algunas ventas. Verifica el Excel.');
        } finally {
            finalizeSaleBtn.textContent = originalBtnText;
            finalizeSaleBtn.disabled = false;
        }
    }

    function getCartTotal() {
        return cart.reduce((sum, item) => sum + item.subtotal, 0);
    }

    // --- UI Updates ---
    function updateSummaryPanel() {
        totalElement.textContent = `S/ ${totalSoldDay.toFixed(2)}`;
    }

    function updateSalesLogTable() {
        salesLogBody.innerHTML = '';
        salesLog.forEach(sale => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${sale.product}</td>
                <td>${formatStock(sale.qty)}</td>
                <td>S/ ${sale.total.toFixed(2)}</td>
                <td style="color: var(--text-secondary);">${sale.time}</td>
            `;
            salesLogBody.appendChild(row);
        });
    }

    function updateProductCardUI(product) {
        const stockContainer = document.getElementById(`stock-${product.id}`);
        if (stockContainer) {
            stockContainer.innerHTML = getStockHtml(product);
        }
    }
});
