// CRM SYSTEM - Müşteri İlişkileri Yönetimi
let ipcRenderer;
try {
    const electron = require('electron');
    ipcRenderer = electron.ipcRenderer;
} catch (e) {
    console.error('Failed to load electron in crm-system.js:', e);
    if (window.ipcRenderer) {
        ipcRenderer = window.ipcRenderer;
    }
}

let currentCustomer = null;
let crmCustomers = [];

// Load CRM page
window.loadCRM = async function() {
    await window.loadCrmCustomersList();
}

// Show different CRM views
window.showCrmList = function() {
    document.getElementById('crm-list-view').style.display = 'block';
    document.getElementById('crm-dashboard-view').style.display = 'none';
    document.getElementById('crm-detail-view').style.display = 'none';
}

window.showCrmDashboard = function() {
    document.getElementById('crm-list-view').style.display = 'none';
    document.getElementById('crm-dashboard-view').style.display = 'block';
    document.getElementById('crm-detail-view').style.display = 'none';
    if (document.getElementById('crm-bulk-message-view')) {
        document.getElementById('crm-bulk-message-view').style.display = 'none';
    }
    loadCrmDashboardData();
}

window.showCrmBulkMessage = function() {
    document.getElementById('crm-list-view').style.display = 'none';
    document.getElementById('crm-dashboard-view').style.display = 'none';
    document.getElementById('crm-detail-view').style.display = 'none';
    document.getElementById('crm-bulk-message-view').style.display = 'block';
    loadBulkMessageView();
}

window.showCustomerDetail = async function(customerId) {
    currentCustomer = crmCustomers.find(c => c.id === customerId);
    if (!currentCustomer) return;

    document.getElementById('crm-list-view').style.display = 'none';
    document.getElementById('crm-dashboard-view').style.display = 'none';
    document.getElementById('crm-detail-view').style.display = 'block';

    // Load customer details
    await loadCustomerInfo();
    await loadCustomerOverview();
}

// Load CRM Customers List (Global to allow refreshing from other modules)
window.loadCrmCustomersList = async function() {
    if (!ipcRenderer) {
        console.error('ipcRenderer not available');
        return;
    }

    crmCustomers = await ipcRenderer.invoke('get-customers-with-stats');

    console.log('📊 CRM: Yüklenen müşteri sayısı:', crmCustomers.length);
    console.log('📊 CRM: Müşteri verileri:', crmCustomers);

    const tbody = document.querySelector('#crm-customers-table tbody');

    if (!tbody) {
        console.error('❌ CRM tablosu bulunamadı!');
        return;
    }

    if (crmCustomers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #999;">Henüz müşteri eklenmedi</td></tr>';
        return;
    }

    let html = '';
    crmCustomers.forEach(customer => {
        const totalSpent = formatNumberTR(customer.totalSpent / 100, 2);
        const lastPurchase = customer.lastPurchase
            ? new Date(customer.lastPurchase).toLocaleDateString('tr-TR')
            : 'Hiç alışveriş yok';

        // Segment renkleri
        let segmentColor = '#999';
        if (customer.segment === 'VIP') segmentColor = '#f59e0b';
        else if (customer.segment === 'Düzenli') segmentColor = '#10b981';
        else if (customer.segment === 'Risk') segmentColor = '#ef4444';
        else if (customer.segment === 'Yeni') segmentColor = '#3b82f6';

        html += `
            <tr>
                <td>${customer.name}</td>
                <td>${customer.phone || '-'}</td>
                <td>${customer.email || '-'}</td>
                <td>${customer.totalPurchases}</td>
                <td>${totalSpent} ₺</td>
                <td>${lastPurchase}</td>
                <td>${customer.loyaltyPoints || 0}</td>
                <td><span style="background: ${segmentColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">${customer.segment}</span></td>
                <td>
                    <button class="btn btn-primary" style="padding: 5px 10px;" onclick="showCustomerDetail(${customer.id})">Detay</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// CRM Search
document.getElementById('crm-search-input')?.addEventListener('input', (e) => {
    const search = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#crm-customers-table tbody tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
});

// Load CRM Dashboard Data
async function loadCrmDashboardData() {
    const customers = await ipcRenderer.invoke('get-customers-with-stats');

    // Top 10 spenders
    const topSpenders = customers
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);

    let topSpendersHtml = '<ol style="color: white;">';
    topSpenders.forEach(c => {
        topSpendersHtml += `<li>${c.name} - ${formatNumberTR(c.totalSpent / 100, 2)} ₺</li>`;
    });
    topSpendersHtml += '</ol>';
    document.getElementById('top-spenders-list').innerHTML = topSpendersHtml;

    // Most loyal (frequent purchasers)
    const loyalCustomers = customers
        .sort((a, b) => b.totalPurchases - a.totalPurchases)
        .slice(0, 10);

    let loyalHtml = '<ol style="color: white;">';
    loyalCustomers.forEach(c => {
        loyalHtml += `<li>${c.name} - ${c.totalPurchases} alışveriş</li>`;
    });
    loyalHtml += '</ol>';
    document.getElementById('loyal-customers-list').innerHTML = loyalHtml;

    // Risk customers (haven't shopped in 30+ days)
    const riskCustomers = customers.filter(c => c.segment === 'Risk').slice(0, 10);
    let riskHtml = '<ul style="color: white;">';
    if (riskCustomers.length === 0) {
        riskHtml += '<li>Risk altında müşteri yok</li>';
    } else {
        riskCustomers.forEach(c => {
            riskHtml += `<li>${c.name}</li>`;
        });
    }
    riskHtml += '</ul>';
    document.getElementById('risk-customers-list').innerHTML = riskHtml;

    // New customers (added in last 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const newCustomers = customers.filter(c =>
        c.createdAt && new Date(c.createdAt).getTime() > thirtyDaysAgo
    ).slice(0, 10);

    let newHtml = '<ul style="color: white;">';
    if (newCustomers.length === 0) {
        newHtml += '<li>Son 30 günde yeni müşteri yok</li>';
    } else {
        newCustomers.forEach(c => {
            newHtml += `<li>${c.name}</li>`;
        });
    }
    newHtml += '</ul>';
    document.getElementById('new-customers-list').innerHTML = newHtml;

    // Segment distribution
    const segments = { VIP: 0, 'Düzenli': 0, Yeni: 0, Risk: 0 };
    customers.forEach(c => {
        if (segments.hasOwnProperty(c.segment)) {
            segments[c.segment]++;
        }
    });

    let distHtml = '<div style="display: flex; justify-content: space-around; margin-top: 20px;">';
    Object.entries(segments).forEach(([segment, count]) => {
        const percentage = customers.length > 0 ? ((count / customers.length) * 100).toFixed(1) : 0;
        distHtml += `
            <div style="text-align: center;">
                <div style="font-size: 32px; font-weight: bold; color: #667eea;">${count}</div>
                <div style="font-size: 14px; color: #666;">${segment}</div>
                <div style="font-size: 12px; color: #999;">${percentage}%</div>
            </div>
        `;
    });
    distHtml += '</div>';
    document.getElementById('segment-distribution').innerHTML = distHtml;
}

// Customer Detail Functions
async function loadCustomerInfo() {
    if (!currentCustomer) return;

    const segmentColors = {
        'VIP': '#f59e0b',
        'Düzenli': '#10b981',
        'Risk': '#ef4444',
        'Yeni': '#3b82f6'
    };

    const html = `
        <div style="margin-top: 15px;">
            <p><strong>Ad Soyad:</strong> ${currentCustomer.name}</p>
            <p><strong>Telefon:</strong> ${currentCustomer.phone || '-'}</p>
            <p><strong>Email:</strong> ${currentCustomer.email || '-'}</p>
            <p><strong>Adres:</strong> ${currentCustomer.address || '-'}</p>
            <p><strong>Segment:</strong> <span style="background: ${segmentColors[currentCustomer.segment]}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px;">${currentCustomer.segment}</span></p>
            <p><strong>Sadakat Puanı:</strong> ${currentCustomer.loyaltyPoints || 0}</p>
        </div>
    `;

    document.getElementById('customer-detail-info').innerHTML = html;

    // Update WhatsApp button
    const whatsappBtn = document.getElementById('whatsapp-btn');
    if (currentCustomer.phone) {
        whatsappBtn.disabled = false;
        whatsappBtn.setAttribute('data-phone', currentCustomer.phone);
    } else {
        whatsappBtn.disabled = true;
    }
}

async function loadCustomerOverview() {
    if (!currentCustomer) return;

    const stats = await ipcRenderer.invoke('get-customer-stats', currentCustomer.id);

    const html = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <div style="font-size: 24px; font-weight: bold; color: #667eea;">${stats.totalPurchases}</div>
                <div style="font-size: 14px; color: #666;">Toplam Alışveriş</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <div style="font-size: 24px; font-weight: bold; color: #667eea;">${formatNumberTR(stats.totalSpent / 100, 2)} ₺</div>
                <div style="font-size: 14px; color: #666;">Toplam Harcama</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <div style="font-size: 24px; font-weight: bold; color: #667eea;">${formatNumberTR(stats.averageBasket / 100, 2)} ₺</div>
                <div style="font-size: 14px; color: #666;">Ortalama Sepet</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <div style="font-size: 18px; font-weight: bold; color: #667eea;">${stats.lastPurchase ? new Date(stats.lastPurchase).toLocaleDateString('tr-TR') : 'Hiç'}</div>
                <div style="font-size: 14px; color: #666;">Son Alışveriş</div>
            </div>
        </div>
    `;

    document.getElementById('customer-overview-stats').innerHTML = html;
}

// Switch Customer Tabs
window.switchCustomerTab = function(tabName) {
    // Hide all tabs
    document.querySelectorAll('.customer-tab').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // Show selected tab
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    event.target.classList.add('active');

    // Load tab content
    if (tabName === 'purchases') loadCustomerPurchases();
    else if (tabName === 'notes') loadCustomerNotes();
    else if (tabName === 'reminders') loadCustomerReminders();
    else if (tabName === 'messages') loadCustomerMessages();
}

// Load Customer Purchases
async function loadCustomerPurchases() {
    if (!currentCustomer) return;

    const allSales = await ipcRenderer.invoke('get-sales');
    const customerSales = allSales.filter(sale => sale.customerId === currentCustomer.id);

    if (customerSales.length === 0) {
        document.getElementById('customer-purchases-list').innerHTML = '<p style="color: #999;">Henüz alışveriş yok</p>';
        return;
    }

    let html = '<div style="max-height: 400px; overflow-y: auto;">';
    customerSales.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(sale => {
        html += `
            <div style="padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; background: #f8f9fa;">
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <strong>${new Date(sale.date).toLocaleDateString('tr-TR')}</strong>
                        <div style="font-size: 12px; color: #666;">ID: ${sale.id}</div>
                    </div>
                    <div style="font-size: 18px; font-weight: bold; color: #667eea;">
                        ${formatNumberTR(sale.total / 100, 2)} ₺
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';

    document.getElementById('customer-purchases-list').innerHTML = html;
}

// Customer Notes
async function loadCustomerNotes() {
    if (!currentCustomer) return;

    const notes = await ipcRenderer.invoke('get-customer-notes', currentCustomer.id);

    if (notes.length === 0) {
        document.getElementById('customer-notes-list').innerHTML = '<p style="color: #999;">Henüz not eklenmedi</p>';
        return;
    }

    let html = '<div style="max-height: 400px; overflow-y: auto;">';
    notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(note => {
        html += `
            <div style="padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; background: #f8f9fa;">
                <div style="display: flex; justify-content: space-between;">
                    <div style="flex: 1;">
                        <div style="font-size: 14px; color: #333; margin-bottom: 5px;">${note.note}</div>
                        <div style="font-size: 12px; color: #999;">${new Date(note.createdAt).toLocaleString('tr-TR')}</div>
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="deleteNote(${note.id})">Sil</button>
                </div>
            </div>
        `;
    });
    html += '</div>';

    document.getElementById('customer-notes-list').innerHTML = html;
}

window.showAddNoteModal = function() {
    document.getElementById('note-text').value = '';
    document.getElementById('note-modal').classList.add('active');
}

window.saveNote = async function(e) {
    e.preventDefault();
    if (!currentCustomer) return;

    const note = document.getElementById('note-text').value;
    await ipcRenderer.invoke('add-customer-note', currentCustomer.id, note);

    closeModal('note-modal');
    await loadCustomerNotes();
    await customAlerts.success('Not eklendi!');
}

window.deleteNote = async function(noteId) {
    const confirmed = await customConfirm('Bu notu silmek istediğinize emin misiniz?');
    if (!confirmed) return;

    await ipcRenderer.invoke('delete-customer-note', noteId);
    await loadCustomerNotes();
    await customAlerts.success('Not silindi!');
}

// Customer Reminders
async function loadCustomerReminders() {
    if (!currentCustomer) return;

    const reminders = await ipcRenderer.invoke('get-customer-reminders', currentCustomer.id);

    if (reminders.length === 0) {
        document.getElementById('customer-reminders-list').innerHTML = '<p style="color: #999;">Henüz hatırlatıcı eklenmedi</p>';
        return;
    }

    let html = '<div style="max-height: 400px; overflow-y: auto;">';
    reminders.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(reminder => {
        const isCompleted = reminder.completed;
        html += `
            <div style="padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; background: ${isCompleted ? '#e8f5e9' : '#f8f9fa'};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="font-size: 14px; color: #333; ${isCompleted ? 'text-decoration: line-through;' : ''}">${reminder.title}</div>
                        <div style="font-size: 12px; color: #999;">${new Date(reminder.date).toLocaleDateString('tr-TR')}</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn ${isCompleted ? 'btn-secondary' : 'btn-success'} btn-sm" onclick="toggleReminder(${reminder.id}, ${!isCompleted})">
                            ${isCompleted ? '↶' : '✓'}
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteReminder(${reminder.id})">Sil</button>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';

    document.getElementById('customer-reminders-list').innerHTML = html;
}

window.showAddReminderModal = function() {
    document.getElementById('reminder-title').value = '';
    document.getElementById('reminder-date').value = '';
    document.getElementById('reminder-modal').classList.add('active');
}

window.saveReminder = async function(e) {
    e.preventDefault();
    if (!currentCustomer) return;

    const title = document.getElementById('reminder-title').value;
    const date = document.getElementById('reminder-date').value;

    await ipcRenderer.invoke('add-customer-reminder', currentCustomer.id, title, date);

    closeModal('reminder-modal');
    await loadCustomerReminders();
    await customAlerts.success('Hatırlatıcı eklendi!');
}

window.toggleReminder = async function(reminderId, completed) {
    await ipcRenderer.invoke('update-customer-reminder', reminderId, { completed });
    await loadCustomerReminders();
}

window.deleteReminder = async function(reminderId) {
    const confirmed = await customConfirm('Bu hatırlatıcıyı silmek istediğinize emin misiniz?');
    if (!confirmed) return;

    await ipcRenderer.invoke('delete-customer-reminder', reminderId);
    await loadCustomerReminders();
    await customAlerts.success('Hatırlatıcı silindi!');
}

// Customer Messages History
async function loadCustomerMessages() {
    if (!currentCustomer) return;

    const messages = await ipcRenderer.invoke('get-message-history', currentCustomer.id);

    if (messages.length === 0) {
        document.getElementById('customer-messages-list').innerHTML = '<p style="color: #999;">Henüz mesaj gönderilmedi</p>';
        return;
    }

    let html = '<div style="max-height: 400px; overflow-y: auto;">';
    messages.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)).forEach(msg => {
        const statusIcon = msg.status === 'sent' ? '✅' : '❌';
        const typeIcon = msg.type === 'whatsapp' ? '📱' : msg.type === 'email' ? '📧' : '📱📧';

        html += `
            <div style="padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; background: #f8f9fa;">
                <div style="display: flex; justify-content: between; margin-bottom: 8px;">
                    <div style="font-size: 12px; color: #666;">
                        ${typeIcon} ${new Date(msg.sentAt).toLocaleString('tr-TR')} ${statusIcon}
                    </div>
                </div>
                <div style="font-size: 13px; color: #333; white-space: pre-wrap;">${msg.content.substring(0, 150)}${msg.content.length > 150 ? '...' : ''}</div>
            </div>
        `;
    });
    html += '</div>';

    document.getElementById('customer-messages-list').innerHTML = html;
}

// WhatsApp Integration
window.openWhatsApp = function() {
    if (!currentCustomer || !currentCustomer.phone) {
        customAlerts.warning('Müşterinin telefon numarası yok!');
        return;
    }

    // Clean phone number and format for WhatsApp
    let phone = currentCustomer.phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
        phone = '90' + phone.substring(1);
    } else if (!phone.startsWith('90')) {
        phone = '90' + phone;
    }

    const url = `https://wa.me/${phone}`;
    require('electron').shell.openExternal(url);
}

// Close modal utility
window.closeModal = function(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

window.showSendEmailModal = function() {
    if (typeof window.parent_showSendEmailModal === 'function') {
        window.parent_showSendEmailModal();
    }
}

// ============== BULK MESSAGE VIEW ==============

function loadBulkMessageView() {
    // Update customer counts
    const allCount = crmCustomers.length;
    const vipCount = crmCustomers.filter(c => c.segment === 'VIP').length;
    const regularCount = crmCustomers.filter(c => c.segment === 'Düzenli').length;
    const newCount = crmCustomers.filter(c => c.segment === 'Yeni').length;
    const riskCount = crmCustomers.filter(c => c.segment === 'Risk').length;

    document.getElementById('all-count').textContent = `${allCount} kişi`;
    document.getElementById('vip-count').textContent = `${vipCount} kişi`;
    document.getElementById('regular-count').textContent = `${regularCount} kişi`;
    document.getElementById('new-count').textContent = `${newCount} kişi`;
    document.getElementById('risk-count').textContent = `${riskCount} kişi`;

    // Load template select
    loadTemplateSelectForBulk();

    // Add template preview listener
    const templateSelect = document.getElementById('bulk-template-select');
    if (templateSelect) {
        templateSelect.addEventListener('change', updateBulkMessagePreview);
    }
}

async function loadTemplateSelectForBulk() {
    if (!ipcRenderer) {
        console.error('ipcRenderer not available');
        return;
    }

    try {
        const templates = await ipcRenderer.invoke('get-message-templates');
        const select = document.getElementById('bulk-template-select');

        if (!select) return;

        // Clear existing options except first
        select.innerHTML = '<option value="">Şablon seçin...</option>';

        templates.filter(t => t.active).forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = `${template.name} (${template.category})`;
            option.dataset.content = template.content;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load templates:', error);
    }
}

function updateBulkMessagePreview() {
    const select = document.getElementById('bulk-template-select');
    const preview = document.getElementById('bulk-message-preview');

    if (!select || !preview) return;

    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.dataset.content) {
        // Show preview with sample data
        const sampleContent = selectedOption.dataset.content
            .replace(/{musteri_adi}/g, '[Müşteri Adı]')
            .replace(/{telefon}/g, '[Telefon]')
            .replace(/{email}/g, '[Email]')
            .replace(/{toplam_harcama}/g, '[Toplam Harcama]')
            .replace(/{son_alisveris}/g, '[Son Alışveriş]')
            .replace(/{puan}/g, '[Puan]')
            .replace(/{indirim_kodu}/g, '[İndirim Kodu]')
            .replace(/{magaza_adi}/g, '[Mağaza Adı]')
            .replace(/{tarih}/g, new Date().toLocaleDateString('tr-TR'));

        preview.textContent = sampleContent;
    } else {
        preview.textContent = 'Şablon seçilmedi...';
    }
}

window.sendBulkMessages = async function(event) {
    event.preventDefault();

    if (!ipcRenderer) {
        alert('Mesaj gönderimi şu anda kullanılamıyor');
        return;
    }

    // Get selected target
    const target = document.querySelector('input[name="bulk-target"]:checked').value;

    // Get selected template
    const templateId = parseInt(document.getElementById('bulk-template-select').value);
    if (!templateId) {
        alert('Lütfen bir mesaj şablonu seçin');
        return;
    }

    // Get message types
    const messageTypes = Array.from(document.querySelectorAll('input[name="message-type"]:checked'))
        .map(cb => cb.value);

    if (messageTypes.length === 0) {
        alert('Lütfen en az bir mesaj tipi seçin (WhatsApp veya Email)');
        return;
    }

    // Filter customers by target
    let targetCustomers = [];
    if (target === 'all') {
        targetCustomers = crmCustomers;
    } else if (target === 'vip') {
        targetCustomers = crmCustomers.filter(c => c.segment === 'VIP');
    } else if (target === 'regular') {
        targetCustomers = crmCustomers.filter(c => c.segment === 'Düzenli');
    } else if (target === 'new') {
        targetCustomers = crmCustomers.filter(c => c.segment === 'Yeni');
    } else if (target === 'risk') {
        targetCustomers = crmCustomers.filter(c => c.segment === 'Risk');
    }

    if (targetCustomers.length === 0) {
        alert('Seçilen kategoride müşteri bulunamadı');
        return;
    }

    // Confirm
    const confirmMsg = `${targetCustomers.length} kişiye mesaj gönderilecek. Emin misiniz?`;
    if (!confirm(confirmMsg)) {
        return;
    }

    // Get template
    try {
        const templates = await ipcRenderer.invoke('get-message-templates');
        const template = templates.find(t => t.id === templateId);

        if (!template) {
            alert('Şablon bulunamadı');
            return;
        }

        let successCount = 0;
        let failCount = 0;

        // Send messages
        for (const customer of targetCustomers) {
            try {
                // Replace variables in template
                const message = template.content
                    .replace(/{musteri_adi}/g, customer.name || 'Müşteri')
                    .replace(/{telefon}/g, customer.phone || '')
                    .replace(/{email}/g, customer.email || '')
                    .replace(/{toplam_harcama}/g, formatNumberTR((customer.totalSpent || 0) / 100, 2) + ' ₺')
                    .replace(/{son_alisveris}/g, customer.lastPurchase ? new Date(customer.lastPurchase).toLocaleDateString('tr-TR') : 'Hiç')
                    .replace(/{puan}/g, customer.loyaltyPoints || 0)
                    .replace(/{indirim_kodu}/g, '')
                    .replace(/{magaza_adi}/g, 'Mağazamız')
                    .replace(/{tarih}/g, new Date().toLocaleDateString('tr-TR'));

                // Send via selected channels
                if (messageTypes.includes('whatsapp') && customer.phone) {
                    // Open WhatsApp Web
                    let phone = customer.phone.replace(/[^0-9]/g, '');
                    if (phone.startsWith('0')) {
                        phone = '90' + phone.substring(1);
                    }
                    const encodedMessage = encodeURIComponent(message);
                    const url = `https://wa.me/${phone}?text=${encodedMessage}`;

                    // Open in external browser
                    if (typeof require !== 'undefined') {
                        try {
                            const { shell } = require('electron');
                            shell.openExternal(url);

                            // Save to message history
                            await ipcRenderer.invoke('add-message-history', {
                                customerId: customer.id,
                                templateId: templateId,
                                type: 'whatsapp',
                                content: message,
                                status: 'sent'
                            });
                        } catch (e) {
                            console.error('Failed to open WhatsApp:', e);
                        }
                    }

                    // Small delay between messages
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }

                successCount++;
            } catch (error) {
                console.error('Failed to send message to customer:', customer.id, error);
                failCount++;
            }
        }

        alert(`✅ Mesaj gönderimi tamamlandı!\n\nBaşarılı: ${successCount}\nBaşarısız: ${failCount}`);
    } catch (error) {
        console.error('Bulk message send failed:', error);
        alert('Mesaj gönderilirken hata oluştu: ' + error.message);
    }
}

// Helper function for Turkish number formatting
function formatNumberTR(number, decimals = 2) {
    return number.toLocaleString('tr-TR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}
