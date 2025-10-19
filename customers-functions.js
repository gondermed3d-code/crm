// MÜŞTERİ, RAPORLAR VE AYARLAR FONKSİYONLARI
// Bu dosyayı app.js'in sonuna kopyalayın

// Customer Management
let customers = [];

async function loadCustomers() {
    customers = await ipcRenderer.invoke('get-customers');
    const tbody = document.querySelector('#customers-table tbody');

    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #999;">Henüz müşteri eklenmedi</td></tr>';
        return;
    }

    let html = '';
    customers.forEach(customer => {
        const debtColor = customer.debt > 0 ? 'color: #f56565;' : 'color: #48bb78;';
        const formattedDebt = formatNumberTR(customer.debt, 2);
        html += `
            <tr>
                <td>${customer.name}</td>
                <td>${customer.phone || '-'}</td>
                <td>${customer.email || '-'}</td>
                <td style="${debtColor}">${formattedDebt} ₺</td>
                <td>${customer.loyaltyPoints || 0}</td>
                <td>
                    <button class="btn btn-primary" style="padding: 5px 10px;" onclick="editCustomer(${customer.id})">Düzenle</button>
                    <button class="btn btn-danger" style="padding: 5px 10px;" onclick="deleteCustomer(${customer.id})">Sil</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function showAddCustomerModal() {
    document.getElementById('customer-modal-title').textContent = 'Yeni Müşteri Ekle';
    document.getElementById('customer-form').reset();
    document.getElementById('customer-id').value = '';
    document.getElementById('customer-modal').classList.add('active');
    // Auto-focus handled by global MutationObserver in app.js
}

function editCustomer(id) {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    document.getElementById('customer-modal-title').textContent = 'Müşteri Düzenle';
    document.getElementById('customer-id').value = customer.id;
    document.getElementById('customer-name').value = customer.name;
    document.getElementById('customer-phone').value = customer.phone || '';
    document.getElementById('customer-email').value = customer.email || '';
    document.getElementById('customer-address').value = customer.address || '';

    // Set birth date if it exists
    if (customer.birthDate) {
        document.getElementById('customer-birth-date').value = customer.birthDate;
    } else {
        document.getElementById('customer-birth-date').value = '';
    }

    document.getElementById('customer-modal').classList.add('active');
    // Auto-focus handled by global MutationObserver in app.js
}

function closeCustomerModal() {
    document.getElementById('customer-modal').classList.remove('active');
}

async function saveCustomer(event) {
    event.preventDefault();

    const id = document.getElementById('customer-id').value;
    const customerData = {
        name: document.getElementById('customer-name').value,
        phone: document.getElementById('customer-phone').value,
        email: document.getElementById('customer-email').value,
        address: document.getElementById('customer-address').value,
        birthDate: document.getElementById('customer-birth-date')?.value || null
    };

    let result;
    if (id) {
        result = await ipcRenderer.invoke('update-customer', parseInt(id), customerData);
    } else {
        result = await ipcRenderer.invoke('add-customer', customerData);
    }

    if (result.success) {
        showNotification('success', '✅ Başarılı!', ['Müşteri kaydedildi!']);
        closeCustomerModal();

        // Refresh BOTH customer list and CRM list
        await loadCustomers();

        // Also refresh CRM if it exists and is loaded
        if (typeof loadCrmCustomersList === 'function') {
            try {
                await loadCrmCustomersList();
            } catch (e) {
                console.log('CRM list not available or not loaded');
            }
        }
    } else {
        showNotification('error', '❌ Hata!', ['Müşteri kaydedilemedi: ' + result.error]);
    }
}

async function deleteCustomer(id) {
    const confirmed = await customConfirm.delete('Bu müşteri');

    if (!confirmed) {
        if (typeof smartFocus === 'function') smartFocus();
        return;
    }

    const result = await ipcRenderer.invoke('delete-customer', id);

    if (result.success) {
        showNotification('success', '✅ Silindi!', ['Müşteri silindi!']);

        // Refresh BOTH customer list and CRM list
        await loadCustomers();

        // Also refresh CRM if it exists and is loaded
        if (typeof window.loadCrmCustomersList === 'function') {
            try {
                await window.loadCrmCustomersList();
            } catch (e) {
                console.log('CRM list not available or not loaded');
            }
        }

        if (typeof smartFocus === 'function') smartFocus();
    } else {
        showNotification('error', '❌ Hata!', [result.error]);
        if (typeof smartFocus === 'function') smartFocus();
    }
}

// Reports
async function loadReports() {
    // Call the advanced reports function from advanced-reports.js
    if (typeof loadAdvancedReports === 'function') {
        await loadAdvancedReports();
    } else {
        console.error('loadAdvancedReports function not found!');
    }
}

// Settings
async function loadSettings() {
    const settings = await ipcRenderer.invoke('get-settings');

    document.getElementById('settings-store-name').value = settings.storeName || '';
    document.getElementById('settings-store-address').value = settings.storeAddress || '';
    document.getElementById('settings-store-phone').value = settings.storePhone || '';
    document.getElementById('settings-tax-number').value = settings.storeTaxNumber || '';
    document.getElementById('settings-receipt-footer').value = settings.receiptFooter || '';
    document.getElementById('settings-low-stock').value = settings.lowStockThreshold || 10;

    // Para birimi
    document.getElementById('settings-currency').value = settings.currency || 'TRY';

    // KDV oranları ve isimleri
    document.getElementById('vat-rate-1').value = settings.vatRate1 || 0;
    document.getElementById('vat-rate-2').value = settings.vatRate2 || 1;
    document.getElementById('vat-rate-3').value = settings.vatRate3 || 10;
    document.getElementById('vat-rate-4').value = settings.vatRate4 || 20;
    document.getElementById('vat-name-1').value = settings.vatName1 || 'İstisna';
    document.getElementById('vat-name-2').value = settings.vatName2 || 'Temel Gıda';
    document.getElementById('vat-name-3').value = settings.vatName3 || 'İndirimli';
    document.getElementById('vat-name-4').value = settings.vatName4 || 'Genel';
}

async function saveSettings(event) {
    event.preventDefault();

    const currency = document.getElementById('settings-currency').value;
    const currencySymbols = {
        'TRY': '₺',
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'JPY': '¥'
    };

    // Sayı formatı
    const numberFormat = document.getElementById('settings-number-format').value;

    const settingsData = {
        storeName: document.getElementById('settings-store-name').value,
        storeAddress: document.getElementById('settings-store-address').value,
        storePhone: document.getElementById('settings-store-phone').value,
        storeTaxNumber: document.getElementById('settings-tax-number').value,
        receiptFooter: document.getElementById('settings-receipt-footer').value,
        lowStockThreshold: parseInt(document.getElementById('settings-low-stock').value),
        // Para birimi
        currency: currency,
        currencySymbol: currencySymbols[currency] || '₺',
        numberFormat: numberFormat || 'tr', // Sayı formatı
        // KDV oranları ve isimleri
        vatRate1: parseInt(document.getElementById('vat-rate-1').value) || 0,
        vatRate2: parseInt(document.getElementById('vat-rate-2').value) || 1,
        vatRate3: parseInt(document.getElementById('vat-rate-3').value) || 10,
        vatRate4: parseInt(document.getElementById('vat-rate-4').value) || 20,
        vatName1: document.getElementById('vat-name-1').value || 'İstisna',
        vatName2: document.getElementById('vat-name-2').value || 'Temel Gıda',
        vatName3: document.getElementById('vat-name-3').value || 'İndirimli',
        vatName4: document.getElementById('vat-name-4').value || 'Genel'
    };

    const result = await ipcRenderer.invoke('update-settings', settingsData);

    if (result.success) {
        showNotification('success', '✅ Kaydedildi!', ['Ayarlar güncellendi!', 'Sayfa yenileniyor...']);
        // KDV seçeneklerini güncelle
        updateVatOptions();
        // Para birimi değişti, sayfayı yenile
        setTimeout(() => {
            location.reload();
        }, 1500);
    } else {
        showNotification('error', '❌ Hata!', [result.error]);
    }
}

// KDV seçeneklerini güncelle
async function updateVatOptions() {
    const settings = await ipcRenderer.invoke('get-settings');
    const vatSelect = document.getElementById('product-vat-rate');

    if (vatSelect) {
        vatSelect.innerHTML = `
            <option value="${settings.vatRate1}">%${settings.vatRate1} - ${settings.vatName1}</option>
            <option value="${settings.vatRate2}">%${settings.vatRate2} - ${settings.vatName2}</option>
            <option value="${settings.vatRate3}">%${settings.vatRate3} - ${settings.vatName3}</option>
            <option value="${settings.vatRate4}">%${settings.vatRate4} - ${settings.vatName4}</option>
        `;
    }
}
