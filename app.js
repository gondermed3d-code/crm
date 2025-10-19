let ipcRenderer;
try {
    const electron = require('electron');
    ipcRenderer = electron.ipcRenderer;
} catch (e) {
    console.error('Failed to load electron in app.js:', e);
    if (window.ipcRenderer) {
        ipcRenderer = window.ipcRenderer;
    }
}

// Global state
let cart = [];
let products = [];
let currentStream = null;

// CRM Submenu Toggle
window.toggleCrmSubmenu = function(event) {
    event.stopPropagation();
    const submenu = document.getElementById('crm-submenu');
    if (submenu.style.display === 'none') {
        submenu.style.display = 'block';
    } else {
        submenu.style.display = 'none';
    }
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const page = item.dataset.page;
        const view = item.dataset.view;

        // Update active nav
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        // Update active page
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const pageElement = document.getElementById(`${page}-page`);
        if (pageElement) {
            pageElement.classList.add('active');
        }

        // Load page data
        if (page === 'dashboard') loadDashboard();
        if (page === 'products') loadProducts();
        if (page === 'customers') loadCustomers();
        if (page === 'crm') {
            loadCRM();
            // Show specific view if specified
            if (view === 'dashboard') {
                if (typeof showCrmDashboard === 'function') showCrmDashboard();
            } else if (view === 'bulk-message') {
                if (typeof showCrmBulkMessage === 'function') showCrmBulkMessage();
            } else {
                if (typeof showCrmList === 'function') showCrmList();
            }
        }
        if (page === 'barcode-generator') loadBarcodeGenerator();
        if (page === 'sales') loadSales();
        if (page === 'stock') loadStock();
        if (page === 'reports') loadReports();
        if (page === 'settings') loadSettings();

        // Re-enable search inputs when returning to POS page
        if (page === 'pos' && typeof reEnableSearchInputs === 'function') {
            setTimeout(reEnableSearchInputs, 100);
        }
    });
});

// POS Functions
document.getElementById('pos-barcode-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchProductByBarcode();
    }
});

async function searchProductByBarcode() {
    const barcode = document.getElementById('pos-barcode-input').value.trim();
    if (!barcode) return;

    const product = await ipcRenderer.invoke('get-product-by-barcode', barcode);

    if (product) {
        addToCart(product);
        document.getElementById('pos-barcode-input').value = '';

        // Focus'u geri getir
        setTimeout(() => {
            const quickSearchInput = document.getElementById('quick-search-input');
            if (quickSearchInput) {
                quickSearchInput.focus();
            }
        }, 100);
    } else {
        await customAlerts.error('Ürün bulunamadı!');
        // Hata durumunda da focus'u geri getir
        setTimeout(() => {
            document.getElementById('pos-barcode-input').focus();
        }, 100);
    }
}

async function addToCart(product) {
    const existingItem = cart.find(item => item.id === product.id);

    if (existingItem) {
        if (existingItem.quantity < product.stock) {
            existingItem.quantity++;
        } else {
            await customAlerts.warning('Stokta yeterli ürün yok!');
            return;
        }
    } else {
        if (product.stock > 0) {
            cart.push({
                id: product.id,
                barcode: product.barcode,
                name: product.name,
                price: product.price, // Kuruş cinsinden geliyor
                quantity: 1,
                stock: product.stock,
                vatRate: product.vatRate || 0 // KDV oranı
            });
        } else {
            await customAlerts.warning('Bu ürün stokta yok!');
            return;
        }
    }

    updateCartDisplay();
    showLastProduct(product);

    // Immediately re-enable search inputs after adding to cart
    setTimeout(() => {
        if (typeof reEnableSearchInputs === 'function') {
            reEnableSearchInputs();
        }
    }, 50);
}

function updateCartDisplay() {
    const cartItemsDiv = document.getElementById('cart-items');
    const cartTotalSpan = document.getElementById('cart-total');

    if (cart.length === 0) {
        cartItemsDiv.innerHTML = '<p style="color: #999;">Sepet boş</p>';
        cartTotalSpan.textContent = '0,00';
        return;
    }

    let html = '';
    let total = 0;

    cart.forEach((item, index) => {
        const formattedPrice = formatPriceTR(item.price);
        const itemTotal = item.price * item.quantity; // Kuruş cinsinden
        const formattedItemTotal = formatPriceTR(itemTotal);
        total += itemTotal;

        html += `
            <div class="cart-item">
                <div>
                    <strong>${item.name}</strong><br>
                    <small>${formattedPrice} ₺ x ${item.quantity}</small>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <button class="btn btn-secondary" style="padding: 5px 10px;" onclick="changeQuantity(${index}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button class="btn btn-secondary" style="padding: 5px 10px;" onclick="changeQuantity(${index}, 1)">+</button>
                    <strong>${formattedItemTotal} ₺</strong>
                    <button class="btn btn-danger" style="padding: 5px 10px;" onclick="removeFromCart(${index})">×</button>
                </div>
            </div>
        `;
    });

    cartItemsDiv.innerHTML = html;
    cartTotalSpan.textContent = formatPriceTR(total);
}

async function changeQuantity(index, change) {
    const item = cart[index];
    const newQuantity = item.quantity + change;

    if (newQuantity <= 0) {
        removeFromCart(index);
        return;
    }

    if (newQuantity > item.stock) {
        await customAlerts.warning('Stokta yeterli ürün yok!');
        return;
    }

    item.quantity = newQuantity;
    updateCartDisplay();
}

async function increaseQuantity(index) {
    const item = cart[index];
    if (item.quantity < item.stock) {
        item.quantity++;
        updateCartDisplay();
    } else {
        await customAlerts.warning('Stokta yeterli ürün yok!');
    }
}

async function decreaseQuantity(index) {
    const item = cart[index];
    if (item.quantity > 1) {
        item.quantity--;
        updateCartDisplay();
    } else {
        // If quantity is 1, remove from cart
        const confirmed = await customConfirm('Ürünü sepetten çıkarmak istiyor musunuz?', '🗑️ Ürün Çıkar');
        if (confirmed) {
            removeFromCart(index);
            smartFocus();
        } else {
            smartFocus(); // İptal edildiğinde de focus
        }
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartDisplay();
}

async function clearCart() {
    if (cart.length === 0) return;

    const confirmed = await customConfirm.clear('Sepeti');

    if (confirmed) {
        cart = [];
        updateCartDisplay();
        document.getElementById('last-product-info').innerHTML = '<p style="color: #999;">Henüz ürün eklenmedi</p>';
        smartFocus();
    } else {
        smartFocus(); // İptal edildiğinde de focus
    }
}

function showLastProduct(product) {
    const div = document.getElementById('last-product-info');
    const formattedPrice = formatPriceTR(product.price); // Türk formatı
    div.innerHTML = `
        <h3>${product.name}</h3>
        <p><strong>Barkod:</strong> ${product.barcode}</p>
        <p><strong>Fiyat:</strong> ${formattedPrice} ₺</p>
        <p><strong>Stok:</strong> ${product.stock}</p>
        <p><strong>KDV:</strong> %${product.vatRate || 0}</p>
    `;
}

// Payment functions moved to payment-system.js

// Product Management
async function loadProducts() {
    products = await ipcRenderer.invoke('get-products');
    const tbody = document.querySelector('#products-table tbody');

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">Henüz ürün eklenmedi</td></tr>';
        return;
    }

    let html = '';
    products.forEach(product => {
        const vatRate = product.vatRate || 0;
        const formattedPrice = formatPriceTR(product.price); // Türk formatı
        html += `
            <tr>
                <td>${product.barcode}</td>
                <td>${product.name}</td>
                <td>${formattedPrice} ₺</td>
                <td>${formatNumberTR(product.stock, 0)}</td>
                <td>${product.category || '-'}</td>
                <td><span style="background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">%${vatRate}</span></td>
                <td>
                    <button class="btn btn-primary" style="padding: 5px 10px;" onclick="editProduct(${product.id})">Düzenle</button>
                    <button class="btn btn-danger" style="padding: 5px 10px;" onclick="deleteProduct(${product.id})">Sil</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function showAddProductModal() {
    document.getElementById('product-modal-title').textContent = 'Yeni Ürün Ekle';
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('product-modal').classList.add('active');
    // Auto-focus handled by global MutationObserver
}

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    const formattedPrice = formatPriceTR(product.price); // Türk formatı
    document.getElementById('product-modal-title').textContent = 'Ürün Düzenle';
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-barcode').value = product.barcode;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-price').value = formattedPrice;
    document.getElementById('product-stock').value = product.stock;
    document.getElementById('product-category').value = product.category || '';
    document.getElementById('product-vat-rate').value = product.vatRate || 0;
    document.getElementById('product-modal').classList.add('active');
    // Auto-focus handled by global MutationObserver
}

function closeProductModal() {
    document.getElementById('product-modal').classList.remove('active');
}

async function saveProduct(event) {
    event.preventDefault();

    const id = document.getElementById('product-id').value;
    const priceInput = document.getElementById('product-price').value;
    const priceInTL = parseNumberTR(priceInput); // Türk formatından parse et

    const productData = {
        barcode: document.getElementById('product-barcode').value,
        name: document.getElementById('product-name').value,
        price: priceInTL, // TL olarak gönder, backend kuruşa çevirir
        stock: parseInt(document.getElementById('product-stock').value),
        category: document.getElementById('product-category').value,
        vatRate: parseInt(document.getElementById('product-vat-rate').value)
    };

    let result;
    if (id) {
        result = await ipcRenderer.invoke('update-product', parseInt(id), productData);
    } else {
        result = await ipcRenderer.invoke('add-product', productData);
    }

    if (result.success) {
        await customAlerts.success('Ürün başarıyla kaydedildi!');
        closeProductModal();
        loadProducts();
    } else {
        await customAlerts.error('Hata: ' + result.error);
    }
}

async function deleteProduct(id) {
    // Ürün bilgisini al
    const product = products.find(p => p.id === id);
    const productName = product ? product.name : 'Bu ürün';

    const confirmed = await customConfirm.delete(productName);

    if (!confirmed) {
        smartFocus();
        return;
    }

    const result = await ipcRenderer.invoke('delete-product', id);

    if (result.success) {
        showNotification('success', '✅ Başarılı!', ['Ürün silindi']);
        loadProducts();
        smartFocus();
    } else {
        showNotification('error', '❌ Hata!', ['Ürün silinemedi: ' + result.error]);
        smartFocus();
    }
}

// Barcode Scanner
let barcodeDetector = null;

async function startCamera() {
    try {
        const video = document.getElementById('scanner-video');
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        video.srcObject = currentStream;

        // Start scanning
        if ('BarcodeDetector' in window) {
            barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39'] });
            scanBarcode();
        } else {
            // Fallback to ZXing
            scanBarcodeZXing();
        }
    } catch (error) {
        await customAlerts.error('Kameraya erişilemedi: ' + error.message);
    }
}

async function scanBarcode() {
    if (!currentStream) return;

    const video = document.getElementById('scanner-video');

    try {
        const barcodes = await barcodeDetector.detect(video);

        if (barcodes.length > 0) {
            const barcode = barcodes[0].rawValue;
            handleScannedBarcode(barcode);
        } else {
            requestAnimationFrame(scanBarcode);
        }
    } catch (error) {
        requestAnimationFrame(scanBarcode);
    }
}

function scanBarcodeZXing() {
    const codeReader = new ZXing.BrowserBarcodeReader();
    const video = document.getElementById('scanner-video');

    const scan = () => {
        if (!currentStream) return;

        codeReader.decodeFromVideoElement(video, (result, error) => {
            if (result) {
                handleScannedBarcode(result.text);
            } else {
                requestAnimationFrame(scan);
            }
        });
    };

    scan();
}

async function handleScannedBarcode(barcode) {
    const resultDiv = document.getElementById('scanner-result');
    resultDiv.innerHTML = `<p style="color: #48bb78; font-weight: bold;">Barkod Okundu: ${barcode}</p>`;

    const product = await ipcRenderer.invoke('get-product-by-barcode', barcode);

    if (product) {
        const formattedPrice = formatPriceTR(product.price);
        resultDiv.innerHTML += `
            <div class="card" style="margin-top: 10px;">
                <h3>${product.name}</h3>
                <p><strong>Fiyat:</strong> ${formattedPrice} ₺</p>
                <p><strong>Stok:</strong> ${formatNumberTR(product.stock, 0)}</p>
                <button class="btn btn-success" onclick="addScannedToCart('${barcode}')">Sepete Ekle</button>
            </div>
        `;
    } else {
        resultDiv.innerHTML += '<p style="color: #f56565;">Ürün bulunamadı!</p>';
    }

    stopCamera();
}

async function addScannedToCart(barcode) {
    const product = await ipcRenderer.invoke('get-product-by-barcode', barcode);
    if (product) {
        addToCart(product);
        // Switch to POS page
        document.querySelector('[data-page="pos"]').click();
    }
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}

// Sales History
async function loadSales() {
    const sales = await ipcRenderer.invoke('get-sales');
    const tbody = document.querySelector('#sales-table tbody');

    if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">Henüz satış kaydı yok</td></tr>';
        return;
    }

    let html = '';
    sales.forEach(sale => {
        const date = new Date(sale.created_at).toLocaleString('tr-TR');
        const formattedTotal = formatPriceTR(sale.total); // Türk formatı
        html += `
            <tr>
                <td>${date}</td>
                <td>${formatNumberTR(sale.item_count, 0)}</td>
                <td>${formattedTotal} ₺</td>
                <td>${sale.payment_method || '-'}</td>
                <td>
                    <button class="btn btn-primary" style="padding: 5px 10px;" onclick="viewSaleDetails(${sale.id})">Detay</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function viewSaleDetails(saleId) {
    const items = await ipcRenderer.invoke('get-sale-details', saleId);

    let message = 'Satış Detayları:\n\n';
    items.forEach(item => {
        const formattedPrice = formatPriceTR(item.price);
        const formattedTotal = formatPriceTR(item.quantity * item.price);
        message += `${item.product_name} (${item.barcode})\n`;
        message += `  ${item.quantity} x ${formattedPrice} ₺ = ${formattedTotal} ₺\n\n`;
    });

    await customAlert(message, '📋 Satış Detayları', 'info');
}

// Stock Management
async function loadStock() {
    const products = await ipcRenderer.invoke('get-products');
    const tbody = document.querySelector('#stock-table tbody');

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">Henüz ürün eklenmedi</td></tr>';
        return;
    }

    let html = '';
    products.forEach(product => {
        let statusClass = 'status-in-stock';
        let statusText = 'Stokta';

        if (product.stock === 0) {
            statusClass = 'status-out-of-stock';
            statusText = 'Tükendi';
        } else if (product.stock < 10) {
            statusClass = 'status-low-stock';
            statusText = 'Az Kaldı';
        }

        html += `
            <tr>
                <td>${product.name}</td>
                <td>${product.barcode}</td>
                <td>${product.stock}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn btn-primary" style="padding: 5px 10px;" onclick="updateStock(${product.id}, '${product.name}', ${product.stock})">Stok Güncelle</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function updateStock(productId, productName) {
    const quantity = prompt(`${productName}\n\nEklenecek/Çıkarılacak miktar girin (eklemek için pozitif, çıkarmak için negatif):`, '0');

    if (quantity === null) return;

    const qty = parseInt(quantity);
    if (isNaN(qty)) {
        alert('Geçerli bir sayı girin!');
        return;
    }

    const result = await ipcRenderer.invoke('update-stock', productId, qty);

    if (result.success) {
        alert('Stok güncellendi!');
        loadStock();
    } else {
        alert('Hata: ' + result.error);
    }
}

// Dashboard Functions
async function loadDashboard() {
    const products = await ipcRenderer.invoke('get-products');
    const sales = await ipcRenderer.invoke('get-sales');

    // Update stats
    document.getElementById('stats-total-products').textContent = products.length;
    document.getElementById('stats-total-sales').textContent = sales.length;

    // Calculate low stock
    const lowStock = products.filter(p => p.stock < 10 && p.stock > 0).length;
    document.getElementById('stats-low-stock').textContent = lowStock;

    // Calculate revenue (Türk formatı)
    const revenueInKurus = sales.reduce((sum, sale) => sum + sale.total, 0);
    document.getElementById('stats-revenue').textContent = formatPriceTR(revenueInKurus) + ' ₺';

    // Load recent sales
    const tbody = document.querySelector('#dashboard-sales-table tbody');
    if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999;">Henüz satış kaydı yok</td></tr>';
        return;
    }

    let html = '';
    sales.slice(0, 5).forEach(sale => {
        const date = new Date(sale.created_at).toLocaleString('tr-TR');
        const formattedTotal = formatPriceTR(sale.total);
        html += `
            <tr>
                <td>${date}</td>
                <td>${formatNumberTR(sale.item_count, 0)}</td>
                <td>${formattedTotal} ₺</td>
                <td>${sale.payment_method || '-'}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Barcode Generator Functions
async function loadBarcodeGenerator() {
    const products = await ipcRenderer.invoke('get-products');
    const select = document.getElementById('barcode-product-select');

    select.innerHTML = '<option value="">Ürün seçin...</option>';
    products.forEach(product => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = `${product.name} (${product.barcode})`;
        option.dataset.barcode = product.barcode;
        option.dataset.name = product.name;
        select.appendChild(option);
    });
}

function selectProductForBarcode() {
    const select = document.getElementById('barcode-product-select');
    const option = select.options[select.selectedIndex];

    if (option.value) {
        document.getElementById('barcode-input').value = option.dataset.barcode;
        document.getElementById('barcode-text').value = option.dataset.name;
        generateBarcodePreview();
    }
}

function generateBarcodePreview() {
    const barcode = document.getElementById('barcode-input').value;
    const text = document.getElementById('barcode-text').value;
    const format = document.getElementById('barcode-format').value;

    if (!barcode) {
        document.getElementById('barcode-preview').innerHTML = '<p style="color: #999;">Barkod burada görünecek</p>';
        return;
    }

    try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, barcode, {
            format: format,
            displayValue: true,
            text: text || barcode,
            width: 2,
            height: 100,
            fontSize: 14
        });

        document.getElementById('barcode-preview').innerHTML = '';
        document.getElementById('barcode-preview').appendChild(svg);
    } catch (error) {
        document.getElementById('barcode-preview').innerHTML = `<p style="color: #f56565;">Hata: ${error.message}</p>`;
    }
}

async function downloadBarcode() {
    const barcode = document.getElementById('barcode-input').value;
    const text = document.getElementById('barcode-text').value;
    const format = document.getElementById('barcode-format').value;

    if (!barcode) {
        await customAlerts.warning('Lütfen önce barkod girin!');
        return;
    }

    try {
        const canvas = document.getElementById('barcode-canvas');
        JsBarcode(canvas, barcode, {
            format: format,
            displayValue: true,
            text: text || barcode,
            width: 2,
            height: 100,
            fontSize: 14
        });

        // Download as PNG
        const link = document.createElement('a');
        link.download = `barkod-${barcode}.png`;
        link.href = canvas.toDataURL();
        link.click();

        await customAlerts.success('Barkod indirildi!');
    } catch (error) {
        await customAlerts.error('Hata: ' + error.message);
    }
}

async function printBarcode() {
    const barcode = document.getElementById('barcode-input').value;
    const text = document.getElementById('barcode-text').value;
    const format = document.getElementById('barcode-format').value;
    const quantity = parseInt(document.getElementById('barcode-quantity').value) || 1;

    if (!barcode) {
        await customAlerts.warning('Lütfen önce barkod girin!');
        return;
    }

    try {
        const printWindow = window.open('', '', 'width=800,height=600');
        const html = `
            <html>
            <head>
                <title>Barkod Yazdır</title>
                <style>
                    body {
                        padding: 20px;
                        font-family: Arial, sans-serif;
                    }
                    .barcode-container {
                        display: inline-block;
                        margin: 15px;
                        padding: 10px;
                        border: 1px dashed #ccc;
                        text-align: center;
                        page-break-inside: avoid;
                    }
                    .barcode-item {
                        margin: 10px 0;
                    }
                    h3 {
                        margin: 10px 0;
                        font-size: 16px;
                    }
                    @media print {
                        .barcode-container {
                            border: none;
                        }
                    }
                </style>
            </head>
            <body>
                <h2 style="text-align: center;">Barkod Yazdırma (${quantity} Adet)</h2>
                <div id="barcodes"></div>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                <script>
                    const container = document.getElementById('barcodes');
                    for (let i = 0; i < ${quantity}; i++) {
                        const div = document.createElement('div');
                        div.className = 'barcode-container';
                        div.innerHTML = '<svg class="barcode-item"></svg><h3>${text || barcode}</h3>';
                        container.appendChild(div);

                        JsBarcode(div.querySelector('.barcode-item'), "${barcode}", {
                            format: "${format}",
                            displayValue: true,
                            width: 2,
                            height: 80,
                            fontSize: 14
                        });
                    }
                    setTimeout(function(){window.print();}, 800);
                </script>
            </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    } catch (error) {
        await customAlerts.error('Hata: ' + error.message);
    }
}

async function generateAllBarcodes() {
    const products = await ipcRenderer.invoke('get-products');

    if (products.length === 0) {
        await customAlerts.info('Henüz ürün yok!');
        return;
    }

    const previewDiv = document.getElementById('bulk-barcode-preview');
    previewDiv.innerHTML = '<h3>Tüm Barkodlar</h3>';

    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write('<html><head><title>Tüm Barkodlar</title>');
    printWindow.document.write('<style>body{padding:20px;}.barcode-item{page-break-inside:avoid;margin:20px;text-align:center;display:inline-block;}</style>');
    printWindow.document.write('</head><body>');

    products.forEach((product, index) => {
        const priceInTL = product.price / 100; // Kuruştan TL'ye çevir
        printWindow.document.write(`<div class="barcode-item"><div id="barcode-${index}"></div><p>${product.name} - ${priceInTL.toFixed(2)} ₺</p></div>`);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, product.barcode, {
            format: 'CODE128',
            displayValue: true,
            text: product.name,
            width: 2,
            height: 80,
            fontSize: 12
        });

        const container = document.createElement('div');
        container.style.cssText = 'display:inline-block;margin:10px;text-align:center;';
        container.appendChild(svg);

        const priceLabel = document.createElement('p');
        priceLabel.textContent = `${product.name} - ${priceInTL.toFixed(2)} ₺`;
        container.appendChild(priceLabel);

        previewDiv.appendChild(container);
    });

    printWindow.document.write('<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>');
    printWindow.document.write('<script>');
    products.forEach((product, index) => {
        printWindow.document.write(`JsBarcode("#barcode-${index}", "${product.barcode}", {format: "CODE128", displayValue: true, text: "${product.name}", width: 2, height: 80, fontSize: 12});`);
    });
    printWindow.document.write('setTimeout(function(){window.print();}, 1000);');
    printWindow.document.write('</script>');
    printWindow.document.write('</body></html>');
    printWindow.document.close();
}

// Close modal when clicking outside (MOVED UP - removing duplicate)
// Stop camera function (MOVED UP - removing duplicate)

// Notification system
function showNotification(type, title, messages) {
    // Remove existing notifications
    const existing = document.querySelectorAll('.notification');
    existing.forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icon = type === 'success' ? '✅' : '❌';

    let html = `
        <span class="close-notification" onclick="this.parentElement.remove()">×</span>
        <h3>${icon} ${title}</h3>
    `;

    messages.forEach(msg => {
        html += `<p>${msg}</p>`;
    });

    notification.innerHTML = html;
    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('hiding');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Yedekleme Fonksiyonları
async function createBackup() {
    const btn = document.getElementById('create-backup-btn');
    const statusDiv = document.getElementById('backup-status');

    btn.disabled = true;
    btn.textContent = 'Yedekleniyor...';
    statusDiv.innerHTML = '<p style="color: #667eea;">Yedek oluşturuluyor...</p>';

    try {
        const result = await ipcRenderer.invoke('create-backup');

        if (result.success) {
            statusDiv.innerHTML = `<p style="color: #48bb78;">✓ Yedek başarıyla oluşturuldu: ${result.fileName}</p>`;
            loadBackupList();
        } else {
            statusDiv.innerHTML = `<p style="color: #f56565;">✗ Hata: ${result.error}</p>`;
        }
    } catch (error) {
        statusDiv.innerHTML = `<p style="color: #f56565;">✗ Hata: ${error.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Yedek Oluştur';
    }
}

async function loadBackupList() {
    const result = await ipcRenderer.invoke('list-backups');
    const listDiv = document.getElementById('backup-list');

    if (!result.success || result.backups.length === 0) {
        listDiv.innerHTML = '<p style="color: #999;">Henüz yedek yok</p>';
        return;
    }

    let html = '<div style="max-height: 300px; overflow-y: auto;">';
    result.backups.forEach(backup => {
        const date = new Date(backup.date).toLocaleString('tr-TR');
        const sizeKB = (backup.size / 1024).toFixed(2);
        html += `
            <div style="background: #f5f5f5; padding: 10px; margin-bottom: 10px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${backup.name}</strong><br>
                    <small>${date} - ${sizeKB} KB</small>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-primary" style="padding: 5px 10px;" onclick="restoreBackup('${backup.path.replace(/\\/g, '\\\\')}')">📥 Geri Yükle</button>
                    <button class="btn btn-danger" style="padding: 5px 10px;" onclick="deleteBackup('${backup.path.replace(/\\/g, '\\\\')}')">🗑️ Sil</button>
                </div>
            </div>
        `;
    });
    html += '</div>';

    listDiv.innerHTML = html;
}

async function restoreBackup(backupPath) {
    const confirmed = await customConfirm.warning(
        'Bu yedeği geri yüklemek istediğinizden emin misiniz?\n\nMevcut veriler yedeğin içeriğiyle değiştirilecektir.',
        '📥 Yedek Geri Yükle'
    );

    if (!confirmed) {
        smartFocus();
        return;
    }

    const statusDiv = document.getElementById('backup-status');
    statusDiv.innerHTML = '<p style="color: #667eea;">Yedek geri yükleniyor...</p>';

    try {
        const result = await ipcRenderer.invoke('restore-backup', backupPath);

        if (result.success) {
            statusDiv.innerHTML = '<p style="color: #48bb78;">✓ Yedek başarıyla geri yüklendi! Sayfa yenileniyor...</p>';

            // Sayfayı yenile
            setTimeout(() => {
                location.reload();
            }, 1500);
        } else {
            statusDiv.innerHTML = `<p style="color: #f56565;">✗ Hata: ${result.error}</p>`;
        }
    } catch (error) {
        statusDiv.innerHTML = `<p style="color: #f56565;">✗ Hata: ${error.message}</p>`;
    }
}

async function selectAndRestoreBackup() {
    const statusDiv = document.getElementById('backup-status');

    try {
        const fileResult = await ipcRenderer.invoke('select-backup-file');

        if (fileResult.canceled) {
            return;
        }

        if (!fileResult.success) {
            statusDiv.innerHTML = `<p style="color: #f56565;">✗ Hata: ${fileResult.error}</p>`;
            return;
        }

        await restoreBackup(fileResult.filePath);
    } catch (error) {
        statusDiv.innerHTML = `<p style="color: #f56565;">✗ Hata: ${error.message}</p>`;
    }
}

// Delete backup file
async function deleteBackup(backupPath) {
    const confirmed = await customConfirm.danger(
        'Bu yedeği silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz!',
        '🗑️ Yedek Sil'
    );

    if (!confirmed) {
        smartFocus();
        return;
    }

    const result = await ipcRenderer.invoke('delete-backup', backupPath);

    if (result.success) {
        showNotification('success', '✅ Başarılı!', ['Yedek dosyası silindi!']);
        loadBackupList();
        smartFocus();
    } else {
        showNotification('error', '❌ Hata!', ['Yedek silinemedi: ' + result.error]);
        smartFocus();
    }
}

// Reset entire database
async function resetDatabase() {
    const confirmation1 = await customConfirm.danger(
        '⚠️ DİKKAT! Tüm verileri sıfırlamak üzeresiniz!\n\nBu işlem:\n• Tüm ürünleri\n• Tüm satışları\n• Tüm müşterileri\n• Tüm kampanyaları\n\nKalıcı olarak silecektir. Devam etmek istiyor musunuz?',
        '🔴 VERİTABANI SIFIRLA'
    );

    if (!confirmation1) {
        smartFocus();
        return;
    }

    const confirmation2 = await customConfirm.danger(
        '🔴 SON UYARI!\n\nBu işlem GERİ ALINAMAZ!\n\nDevam etmeden önce yedek aldığınızdan emin olun.\n\nGerçekten tüm verileri sıfırlamak istiyor musunuz?',
        '🔴 ONAYLAYIN'
    );

    if (!confirmation2) {
        smartFocus();
        return;
    }

    const result = await ipcRenderer.invoke('reset-database');

    if (result.success) {
        showNotification('success', '✅ Tamamlandı!', [
            'Veritabanı sıfırlandı!',
            'Tüm veriler temizlendi.',
            'Sayfa yenileniyor...'
        ]);

        // Reload app after 2 seconds
        setTimeout(() => {
            location.reload();
        }, 2000);
    } else {
        showNotification('error', '❌ Hata!', ['Veritabanı sıfırlanamadı: ' + result.error]);
    }
}

// Clear sales history
async function clearSalesHistory() {
    const confirmation1 = await customConfirm.danger(
        '⚠️ DİKKAT! Tüm satış geçmişini silmek üzeresiniz!\n\nBu işlem:\n• Tüm satış kayıtlarını\n• Tüm satış detaylarını\n\nKalıcı olarak silecektir. Devam etmek istiyor musunuz?',
        '🔴 SATIŞ GEÇMİŞİNİ SİL'
    );

    if (!confirmation1) {
        smartFocus();
        return;
    }

    const confirmation2 = await customConfirm.danger(
        '🔴 SON UYARI!\n\nBu işlem GERİ ALINAMAZ!\n\nÖnce yedek almanızı öneririz.\n\nGerçekten satış geçmişini silmek istiyor musunuz?',
        '🔴 ONAYLAYIN'
    );

    if (!confirmation2) {
        smartFocus();
        return;
    }

    const result = await ipcRenderer.invoke('clear-sales-history');

    if (result.success) {
        showNotification('success', '✅ Temizlendi!', [
            'Satış geçmişi silindi!',
            'Tüm satış kayıtları temizlendi.'
        ]);

        // Reload sales page
        loadSales();
        // Reload dashboard to update stats
        loadDashboard();
    } else {
        showNotification('error', '❌ Hata!', ['Satış geçmişi silinemedi: ' + result.error]);
    }
}

// Settings sayfası yüklendiğinde yedek listesini ve para birimi ayarlarını yükle
async function loadSettings() {
    loadBackupList();

    // Para birimi ayarlarını yükle
    try {
        const settings = await ipcRenderer.invoke('get-settings');

        // Para birimi seçimini ayarla
        if (settings.currency) {
            const currencySelect = document.getElementById('settings-currency');
            if (currencySelect) {
                currencySelect.value = settings.currency;
            }
        }

        // Sayı formatı seçimini ayarla
        if (settings.numberFormat) {
            const numberFormatSelect = document.getElementById('settings-number-format');
            if (numberFormatSelect) {
                numberFormatSelect.value = settings.numberFormat;
            }
        }

        // Diğer ayarları da yükle
        if (settings.storeName) document.getElementById('settings-store-name').value = settings.storeName;
        if (settings.storeAddress) document.getElementById('settings-store-address').value = settings.storeAddress;
        if (settings.storePhone) document.getElementById('settings-store-phone').value = settings.storePhone;
        if (settings.storeTaxNumber) document.getElementById('settings-tax-number').value = settings.storeTaxNumber;
        if (settings.receiptFooter) document.getElementById('settings-receipt-footer').value = settings.receiptFooter;
        if (settings.lowStockThreshold) document.getElementById('settings-low-stock').value = settings.lowStockThreshold;

    } catch (error) {
        console.error('Ayarlar yüklenirken hata:', error);
    }
}

// User menu (basit versiyon)
async function showUserMenu() {
    await customAlert('Kullanıcı menüsü yakında eklenecek!\n\n- Profil Ayarları\n- Şifre Değiştir\n- Çıkış Yap', '👤 Kullanıcı Menüsü', 'info');
}

// Stok badge'ini güncelle
async function updateLowStockBadge() {
    const products = await ipcRenderer.invoke('get-products');
    const lowStockCount = products.filter(p => p.stock < 10 && p.stock > 0).length;
    const badge = document.getElementById('low-stock-badge');

    // Null check - badge element yoksa çık
    if (!badge) {
        console.warn('⚠️ low-stock-badge element not found');
        return;
    }

    if (lowStockCount > 0) {
        badge.textContent = lowStockCount;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

// Akıllı focus - hangi sayfadaysa o sayfanın ana input'una focus yapar
function smartFocus(delay = 100) {
    setTimeout(() => {
        // Hangi sayfa aktif?
        const activePage = document.querySelector('.page.active');
        if (!activePage) return;

        const pageId = activePage.id;

        // Sayfa bazında focus
        switch(pageId) {
            case 'pos-page':
                const quickSearch = document.getElementById('quick-search-input');
                if (quickSearch) quickSearch.focus();
                break;
            case 'products-page':
                // Ürünler sayfası - yeni ürün modal'ı açıksa oraya, değilse arama
                const productSearch = document.querySelector('#products-page input[type="text"]');
                if (productSearch) productSearch.focus();
                break;
            case 'customers-page':
                const customerSearch = document.querySelector('#customers-page input[type="text"]');
                if (customerSearch) customerSearch.focus();
                break;
            case 'settings-page':
                const settingsInput = document.querySelector('#settings-page input:not([type="hidden"])');
                if (settingsInput) settingsInput.focus();
                break;
            default:
                // Varsayılan: POS sayfasına dön
                const posSearch = document.getElementById('quick-search-input');
                if (posSearch) posSearch.focus();
        }
    }, delay);
}

// Search input'ları yeniden etkinleştir ve focus
function reEnableSearchInputs() {
    const quickSearchInput = document.getElementById('quick-search-input');
    const barcodeInput = document.getElementById('pos-barcode-input');

    // Input'ları etkinleştir
    if (quickSearchInput) {
        quickSearchInput.disabled = false;
        quickSearchInput.style.pointerEvents = 'auto';
    }

    if (barcodeInput) {
        barcodeInput.disabled = false;
        barcodeInput.style.pointerEvents = 'auto';
    }

    // POS sayfasındaysa quick search'e focus
    const posPage = document.getElementById('pos-page');
    if (posPage && posPage.classList.contains('active') && quickSearchInput) {
        setTimeout(() => {
            quickSearchInput.focus();
        }, 100);
    }
}

// Initialize - Load dashboard on startup
loadDashboard();
loadProducts();
updateLowStockBadge();
// updateVatOptions customer-functions.js'den sonra çalışacak
if (typeof updateVatOptions === 'function') {
    updateVatOptions(); // KDV seçeneklerini yükle
}

// Badge'i her 30 saniyede güncelle
setInterval(updateLowStockBadge, 30000);

// Sayfa yüklendiğinde POS sayfasındaki search input'a focus
window.addEventListener('load', () => {
    setTimeout(() => {
        const posPage = document.getElementById('pos-page');
        const quickSearchInput = document.getElementById('quick-search-input');
        if (posPage && posPage.classList.contains('active') && quickSearchInput) {
            quickSearchInput.focus();
        }
    }, 500);
});

// Excel Export for Products
async function exportProductsToExcel() {
    try {
        const products = await ipcRenderer.invoke('get-products');

        if (products.length === 0) {
            showNotification('warning', '⚠️ Uyarı!', ['Henüz ürün bulunmuyor']);
            return;
        }

        // CSV formatında oluştur (Excel ile açılabilir)
        let csv = '\uFEFF'; // UTF-8 BOM for Turkish characters
        csv += 'Barkod,Ürün Adı,Fiyat,Stok,Kategori,KDV Oranı\n';

        products.forEach(product => {
            const price = (product.price / 100).toFixed(2);
            csv += `"${product.barcode}","${product.name}","${price}","${product.stock}","${product.category || '-'}","${product.vatRate || 0}%"\n`;
        });

        // Blob oluştur ve indir
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `urunler_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        showNotification('success', '✅ Başarılı!', ['Ürün listesi Excel formatında indirildi']);
    } catch (error) {
        showNotification('error', '❌ Hata!', ['Excel indirilemedi: ' + error.message]);
    }
}

// PDF Export for Products
async function exportProductsToPDF() {
    try {
        const products = await ipcRenderer.invoke('get-products');

        if (products.length === 0) {
            showNotification('warning', '⚠️ Uyarı!', ['Henüz ürün bulunmuyor']);
            return;
        }

        // PDF yazdırma penceresi oluştur
        const printWindow = window.open('', '', 'width=800,height=600');

        let tableRows = '';
        products.forEach(product => {
            const price = formatPrice(product.price);
            tableRows += `
                <tr>
                    <td>${product.barcode}</td>
                    <td>${product.name}</td>
                    <td>${price}</td>
                    <td>${product.stock}</td>
                    <td>${product.category || '-'}</td>
                    <td>${product.vatRate || 0}%</td>
                </tr>
            `;
        });

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Ürün Listesi</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                    }
                    h1 {
                        text-align: center;
                        color: #333;
                    }
                    .info {
                        text-align: center;
                        margin-bottom: 20px;
                        color: #666;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 10px;
                        text-align: left;
                    }
                    th {
                        background-color: #667eea;
                        color: white;
                    }
                    tr:nth-child(even) {
                        background-color: #f9f9f9;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 30px;
                        color: #999;
                        font-size: 12px;
                    }
                    @media print {
                        body { margin: 10px; }
                    }
                </style>
            </head>
            <body>
                <h1>📦 ÜRÜN LİSTESİ</h1>
                <div class="info">
                    <p>Tarih: ${new Date().toLocaleDateString('tr-TR')}</p>
                    <p>Toplam Ürün: ${products.length}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Barkod</th>
                            <th>Ürün Adı</th>
                            <th>Fiyat</th>
                            <th>Stok</th>
                            <th>Kategori</th>
                            <th>KDV Oranı</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
                <div class="footer">
                    <p>Barkod POS Sistemi - ${new Date().toLocaleString('tr-TR')}</p>
                </div>
            </body>
            </html>
        `);

        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
        }, 250);

        showNotification('success', '✅ Başarılı!', ['PDF yazdırma penceresi açıldı']);
    } catch (error) {
        showNotification('error', '❌ Hata!', ['PDF oluşturulamadı: ' + error.message]);
    }
}

// ==================== GLOBAL AUTO-FOCUS SİSTEMİ ====================
// Modal/Dialog açıldığında otomatik focus
const focusObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
                // Modal açıldı mı kontrol et
                if (node.classList && node.classList.contains('modal') && node.classList.contains('active')) {
                    autoFocusModal(node);
                }
                // İçinde active modal var mı kontrol et
                if (node.querySelector) {
                    const activeModal = node.querySelector('.modal.active');
                    if (activeModal) {
                        autoFocusModal(activeModal);
                    }
                }
            }
        });

        // Class değişikliklerini izle
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const target = mutation.target;
            if (target.classList.contains('modal') && target.classList.contains('active')) {
                autoFocusModal(target);
            }
        }
    });
});

// Modal'a otomatik focus
function autoFocusModal(modal) {
    setTimeout(() => {
        // İlk focusable elementi bul
        const focusable = modal.querySelector(
            'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
        );
        if (focusable) {
            focusable.focus();
            console.log('✅ Auto-focus:', focusable.id || focusable.name || 'input');
        }
    }, 150);
}

// Observer'ı başlat
focusObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
});

// Sayfa değişikliklerinde focus
document.addEventListener('click', (e) => {
    // Eğer dialog/alert/confirm kapatıldıysa
    setTimeout(() => {
        if (!document.querySelector('.modal.active')) {
            smartFocus(200);
        }
    }, 100);
});

console.log('✅ Global Auto-Focus System Active');
