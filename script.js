/**
 * SISTEMA DE VENTAS - CORE V3.0
 * Arquitectura: Search-Based Cart System
 */

// --- CONFIG ---
const API_URL = 'https://script.google.com/macros/s/AKfycbzmVGri_eeFFsZPPQ1EljkI6u_o3GprN9ApygWXJ52wznxofOIvrDwgIdV8BiXSL3Mr-w/exec';

document.addEventListener('DOMContentLoaded', () => {

    // --- STATE ---
    let inventory = []; // Base de datos local (solo lectura)
    let cart = [];      // Carrito de compras (mutable)
    let isProcessing = false;

    // --- DOM REFS ---
    const ui = {
        input: document.getElementById('searchInput'),
        results: document.getElementById('searchResults'),
        cartBody: document.getElementById('cartBody'),
        grandTotal: document.getElementById('grandTotal'),
        btnCheckout: document.getElementById('btnCheckout'),
        status: document.getElementById('statusIndicator'),
        overlay: document.getElementById('checkoutOverlay'),
        overlayText: document.getElementById('overlayText'),
        overlaySubtext: document.getElementById('overlaySubtext')
    };

    // --- INIT ---
    initSystem();

    function initSystem() {
        console.log('Iniciando Sistema de Ventas...');
        fetchInventory();
        setupListeners();
    }

    // --- 1. DATA FETCHING (SILENT) ---
    async function fetchInventory() {
        try {
            ui.status.textContent = 'Sincronizando productos...';
            // Usamos fetch GET simple. Si el script soporta CSV, genial. 
            // Si el URL es de un exec, esperamos JSON. 
            // Para robustez máxima si no sabemos el formato exacto del endpoint 'exec',
            // asumiremos que se comporta como una API JSON estándar si le haces GET.
            const res = await fetch(API_URL);
            const data = await res.json();

            // Normalizar
            const raw = Array.isArray(data) ? data : (data.data || []);
            inventory = raw.map(normalizeData);

            ui.status.textContent = `🟢 Inventario listo (${inventory.length} prods)`;
            ui.input.placeholder = `🔍 Buscar entre ${inventory.length} productos...`;

        } catch (err) {
            console.error(err);
            ui.status.innerHTML = `<span style="color:red">Error de conexión. Recarga la página.</span>`;
            // Fallback: Si falla el GET, asumimos que tal vez es csv (pero la URL es user-provided exec).
            // No podemos hacer mucho más sin internet.
        }
    }

    function normalizeData(item) {
        // Adaptador flexible para keys
        const k = (key) => {
            const match = Object.keys(item).find(x => x.toLowerCase() === key);
            return match ? item[match] : null;
        };

        return {
            nombre: k('nombre') || k('producto') || 'Sin Nombre',
            precio: parseFloat(k('precio')) || 0,
            stock: parseFloat(k('stock')) || 0,
            id: k('id') || Math.random().toString(36).substr(2, 9) // ID temporal si no hay
        };
    }

    // --- 2. SEARCH LOGIC ---
    function setupListeners() {
        // Búsqueda en tiempo real
        ui.input.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (term.length < 2) {
                ui.results.style.display = 'none';
                return;
            }

            const hits = inventory.filter(p => p.nombre.toLowerCase().includes(term));
            renderDropdown(hits);
        });

        // Click fuera para cerrar dropdown
        document.addEventListener('click', (e) => {
            if (!ui.input.contains(e.target) && !ui.results.contains(e.target)) {
                ui.results.style.display = 'none';
            }
        });

        // Checkout Button
        ui.btnCheckout.addEventListener('click', processCheckoutQueue);
    }

    function renderDropdown(products) {
        ui.results.innerHTML = '';

        if (products.length === 0) {
            ui.results.style.display = 'none';
            return;
        }

        products.slice(0, 10).forEach(product => { // Max 10 results
            const div = document.createElement('div');
            div.className = 'result-item';

            // Logic for Low Stock Red Color
            const stockClass = product.stock < 5 ? 'res-stock low-stock' : 'res-stock';

            div.innerHTML = `
                <div class="res-info">
                    <div class="res-name">${product.nombre}</div>
                    <div class="${stockClass}">Stock: ${product.stock}</div>
                </div>
                <div class="res-price">S/ ${product.precio.toFixed(2)}</div>
            `;

            div.onclick = () => {
                addToCart(product);
                ui.input.value = ''; // Clear search
                ui.input.focus();
                ui.results.style.display = 'none';
            };

            ui.results.appendChild(div);
        });

        ui.results.style.display = 'block';
    }

    // --- 3. CART LOGIC (THE HEART) ---
    function addToCart(product) {
        const existing = cart.find(c => c.nombre === product.nombre);

        if (existing) {
            existing.qty++;
        } else {
            cart.push({
                ...product, // Clonar datos
                qty: 1
            });
        }

        renderCart();
    }

    function renderCart() {
        ui.cartBody.innerHTML = '';
        let total = 0;

        if (cart.length === 0) {
            ui.cartBody.innerHTML = '<tr class="empty-cart-msg"><td colspan="5">El carrito está vacío</td></tr>';
            ui.btnCheckout.disabled = true;
            ui.grandTotal.textContent = 'S/ 0.00';
            return;
        }

        ui.btnCheckout.disabled = false;

        cart.forEach((item, index) => {
            const lineTotal = item.precio * item.qty;
            total += lineTotal;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.nombre}</td>
                <td>S/ ${item.precio.toFixed(2)}</td>
                <td>
                    <input type="number" class="qty-input" 
                           value="${item.qty}" min="1" 
                           onchange="window.updateQty(${index}, this.value)">
                </td>
                <td><strong>S/ ${lineTotal.toFixed(2)}</strong></td>
                <td>
                    <button class="btn-delete" onclick="window.removeCartItem(${index})">🗑️</button>
                </td>
            `;
            ui.cartBody.appendChild(tr);
        });

        ui.grandTotal.textContent = `S/ ${total.toFixed(2)}`;

        // Exponer globales para onclick en HTML
        window.updateQty = (idx, val) => {
            const v = parseFloat(val);
            if (v > 0) {
                cart[idx].qty = v;
                renderCart();
            }
        };

        window.removeCartItem = (idx) => {
            cart.splice(idx, 1);
            renderCart();
        };
    }

    // --- 4. ASYNC CHECKOUT QUEUE ---
    async function processCheckoutQueue() {
        if (!confirm(`¿Confirmar cobro por total de ${ui.grandTotal.textContent}?`)) return;

        // BLOCK UI
        ui.overlay.classList.remove('hidden');
        isProcessing = true;

        const totalItems = cart.length;
        let processed = 0;
        let errors = 0;

        // SERIAL QUEUE LOOP (Uno por uno)
        // Por seguridad, Google Sheets prefiere serie a paralelo si no está optimizado el lock.
        for (const item of cart) {
            ui.overlayText.textContent = `Procesando ${processed + 1} de ${totalItems}...`;
            ui.overlaySubtext.textContent = `Enviando: ${item.nombre}`;

            try {
                const payload = {
                    action: 'venta',
                    producto: item.nombre,
                    cantidad: item.qty,
                    total: item.precio * item.qty
                };

                await fetch(API_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                // Pequeña pausa para no saturar Apps Script (rate limiting)
                await new Promise(r => setTimeout(r, 500));

            } catch (err) {
                console.error('Error enviando item:', item, err);
                errors++;
            }
            processed++;
        }

        // FINISH
        ui.overlayText.textContent = '¡Venta Finalizada!';

        if (errors > 0) {
            ui.overlaySubtext.textContent = `Hubo ${errors} errores, revise el Excel.`;
        } else {
            ui.overlaySubtext.textContent = 'Todo se guardó correctamente.';
        }

        setTimeout(() => {
            ui.overlay.classList.add('hidden');
            cart = [];
            renderCart();
            ui.input.focus();
            isProcessing = false;
        }, 1500);
    }

});
