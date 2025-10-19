const { app, BrowserWindow, ipcMain, dialog } = require('electron');

const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const extract = require('extract-zip');

// Suppress error messages in console
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// Disable GPU acceleration (moved inside app.whenReady if needed)

let mainWindow;
let dbPath;
let db = {
  products: [],
  sales: [],
  sale_items: [],
  customers: [],
  campaigns: [],
  // CRM Tables
  customer_notes: [], // { id, customerId, note, createdAt }
  customer_tags: [], // { id, customerId, tag }
  customer_reminders: [], // { id, customerId, title, date, completed }
  message_templates: [], // { id, name, category, type, content, active }
  message_history: [], // { id, customerId, templateId, type, content, status, sentAt }
  automation_rules: [], // { id, trigger, templateId, active, settings }
  settings: {
    storeName: 'Barkod POS Sistemi',
    storeAddress: '',
    storePhone: '',
    storeTaxNumber: '',
    receiptFooter: 'Bizi tercih ettiğiniz için teşekkürler!',
    lowStockThreshold: 10,
    theme: 'light',
    autoBackup: true,
    currency: 'TRY',
    currencySymbol: '₺',
    // KDV Rates (customizable)
    vatRate1: 0,
    vatRate2: 1,
    vatRate3: 10,
    vatRate4: 20,
    vatName1: 'İstisna',
    vatName2: 'Temel Gıda',
    vatName3: 'İndirimli',
    vatName4: 'Genel',
    defaultVatRate: 20,
    // SMTP Settings (for email)
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    // Keyboard Shortcuts (customizable)
    keyboardShortcuts: {
      goToSales: 'F1',
      addProduct: 'F2',
      addCustomer: 'F3',
      completeSale: 'F4',
      refreshDashboard: 'F5',
      closeModal: 'Escape',
      focusSearch: 'Control+f',
      saveForm: 'Control+s'
    }
  }
};

// Initialize database
function initDatabase() {
  dbPath = path.join(app.getPath('userData'), 'barcode-pos-data.json');

  // Load existing data if file exists
  if (fs.existsSync(dbPath)) {
    try {
      const data = fs.readFileSync(dbPath, 'utf8');
      const loadedDb = JSON.parse(data);

      // Merge with default structure to ensure all fields exist
      db = {
        products: loadedDb.products || [],
        sales: loadedDb.sales || [],
        sale_items: loadedDb.sale_items || [],
        customers: loadedDb.customers || [],
        campaigns: loadedDb.campaigns || [],
        // CRM Tables
        customer_notes: loadedDb.customer_notes || [],
        customer_tags: loadedDb.customer_tags || [],
        customer_reminders: loadedDb.customer_reminders || [],
        message_templates: loadedDb.message_templates || [],
        message_history: loadedDb.message_history || [],
        automation_rules: loadedDb.automation_rules || [],
        settings: {
          ...db.settings,
          ...loadedDb.settings
        }
      };
    } catch (error) {
      console.error('Error loading database:', error);
      // Use empty db if file is corrupted
    }
  } else {
    // Initialize with empty data
    saveDatabase();
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  // Always open DevTools for debugging
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper to generate IDs
function generateId(array) {
  if (array.length === 0) return 1;
  return Math.max(...array.map(item => item.id)) + 1;
}

// IPC Handlers for database operations

// Products
ipcMain.handle('get-products', async () => {
  return db.products.sort((a, b) => a.name.localeCompare(b.name));
});

ipcMain.handle('get-product-by-barcode', async (event, barcode) => {
  return db.products.find(p => p.barcode === barcode);
});

ipcMain.handle('get-product-by-id', async (event, id) => {
  return db.products.find(p => p.id === id);
});

ipcMain.handle('add-product', async (event, product) => {
  try {
    // Check if barcode already exists
    if (db.products.find(p => p.barcode === product.barcode)) {
      return { success: false, error: 'Bu barkod zaten mevcut!' };
    }

    const newProduct = {
      id: generateId(db.products),
      barcode: product.barcode,
      name: product.name,
      price: Math.round(parseFloat(product.price) * 100), // Kuruş cinsinden sakla
      stock: parseInt(product.stock) || 0,
      category: product.category || '',
      vatRate: parseInt(product.vatRate) || 0, // KDV oranı
      created_at: new Date().toISOString()
    };

    db.products.push(newProduct);
    saveDatabase();
    return { success: true, id: newProduct.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-product', async (event, id, product) => {
  try {
    const index = db.products.findIndex(p => p.id === id);
    if (index === -1) {
      return { success: false, error: 'Ürün bulunamadı!' };
    }

    // Check if barcode is being changed and if it already exists
    if (product.barcode !== db.products[index].barcode) {
      if (db.products.find(p => p.barcode === product.barcode && p.id !== id)) {
        return { success: false, error: 'Bu barkod başka bir üründe kullanılıyor!' };
      }
    }

    db.products[index] = {
      ...db.products[index],
      barcode: product.barcode,
      name: product.name,
      price: Math.round(parseFloat(product.price) * 100), // Kuruş cinsinden sakla
      stock: parseInt(product.stock),
      category: product.category || '',
      vatRate: parseInt(product.vatRate) || 0 // KDV oranı
    };

    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-product', async (event, id) => {
  try {
    db.products = db.products.filter(p => p.id !== id);
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-stock', async (event, productId, quantity) => {
  try {
    const product = db.products.find(p => p.id === productId);
    if (!product) {
      return { success: false, error: 'Ürün bulunamadı!' };
    }

    product.stock += quantity;
    if (product.stock < 0) product.stock = 0;

    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Sales
ipcMain.handle('create-sale', async (event, saleData) => {
  try {
    const saleId = generateId(db.sales);

    const sale = {
      id: saleId,
      total: Math.round(parseFloat(saleData.total) * 100), // Kuruş cinsinden sakla
      payment_method: saleData.paymentMethod,
      created_at: new Date().toISOString()
    };

    db.sales.push(sale);

    // Add sale items and update stock
    for (const item of saleData.items) {
      const saleItem = {
        id: generateId(db.sale_items),
        sale_id: saleId,
        product_id: item.productId,
        quantity: parseInt(item.quantity),
        price: Math.round(parseFloat(item.price) * 100) // Kuruş cinsinden sakla
      };

      db.sale_items.push(saleItem);

      // Update product stock
      const product = db.products.find(p => p.id === item.productId);
      if (product) {
        product.stock -= item.quantity;
        if (product.stock < 0) product.stock = 0;
      }
    }

    saveDatabase();
    return { success: true, saleId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-sales', async () => {
  const salesWithCount = db.sales.map(sale => {
    const items = db.sale_items.filter(item => item.sale_id === sale.id);
    return {
      ...sale,
      item_count: items.length
    };
  });

  return salesWithCount.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
});

ipcMain.handle('get-sale-details', async (event, saleId) => {
  const items = db.sale_items.filter(item => item.sale_id === saleId);

  return items.map(item => {
    const product = db.products.find(p => p.id === item.product_id);
    return {
      ...item,
      product_name: product ? product.name : 'Bilinmeyen Ürün',
      barcode: product ? product.barcode : '-'
    };
  });
});

// Get all sale items (for reports)
ipcMain.handle('get-sale-items', async () => {
  return db.sale_items || [];
});

// Customers
ipcMain.handle('get-customers', async () => {
  return db.customers.sort((a, b) => a.name.localeCompare(b.name));
});

ipcMain.handle('get-customer', async (event, customerId) => {
  return db.customers.find(c => c.id === customerId);
});

ipcMain.handle('add-customer', async (event, customer) => {
  try {
    const newCustomer = {
      id: generateId(db.customers),
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      birthDate: customer.birthDate || null,
      debt: 0, // veresiye
      loyaltyPoints: 0,
      createdAt: new Date().toISOString(),
      created_at: new Date().toISOString() // Backward compatibility
    };

    db.customers.push(newCustomer);
    saveDatabase();
    return { success: true, id: newCustomer.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-customer', async (event, id, customer) => {
  try {
    const index = db.customers.findIndex(c => c.id === id);
    if (index === -1) {
      return { success: false, error: 'Müşteri bulunamadı!' };
    }

    db.customers[index] = {
      ...db.customers[index],
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || ''
    };

    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-customer', async (event, id) => {
  try {
    db.customers = db.customers.filter(c => c.id !== id);
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-customer-debt', async (event, customerId, amount) => {
  try {
    const customer = db.customers.find(c => c.id === customerId);
    if (!customer) {
      return { success: false, error: 'Müşteri bulunamadı!' };
    }

    customer.debt += amount;
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Campaigns
ipcMain.handle('get-campaigns', async () => {
  return db.campaigns.filter(c => c.active);
});

ipcMain.handle('add-campaign', async (event, campaign) => {
  try {
    const newCampaign = {
      id: generateId(db.campaigns),
      name: campaign.name,
      type: campaign.type, // 'percentage', 'fixed', 'buy_x_get_y'
      value: campaign.value,
      active: true,
      created_at: new Date().toISOString()
    };

    db.campaigns.push(newCampaign);
    saveDatabase();
    return { success: true, id: newCampaign.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-campaign', async (event, id) => {
  try {
    db.campaigns = db.campaigns.filter(c => c.id !== id);
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Settings
ipcMain.handle('get-settings', async () => {
  return db.settings;
});

ipcMain.handle('update-settings', async (event, settings) => {
  try {
    db.settings = { ...db.settings, ...settings };
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Backup - ZIP ile tarihli yedekleme
ipcMain.handle('create-backup', async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(app.getPath('userData'), 'backups');

    // Backup klasörünü oluştur
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const zipPath = path.join(backupDir, `backup-${timestamp}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        // Son 10 yedeği sakla, eskilerini sil
        const files = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
          .map(f => ({
            name: f,
            time: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
            path: path.join(backupDir, f)
          }))
          .sort((a, b) => b.time - a.time);

        // Eski yedekleri sil (son 10'u sakla)
        files.slice(10).forEach(f => {
          try {
            fs.unlinkSync(f.path);
          } catch (err) {
            console.error('Eski yedek silinemedi:', err);
          }
        });

        resolve({ success: true, backupPath: zipPath, fileName: `backup-${timestamp}.zip` });
      });

      archive.on('error', (err) => {
        reject({ success: false, error: err.message });
      });

      archive.pipe(output);

      // Veritabanı dosyasını ZIP'e ekle
      archive.append(JSON.stringify(db, null, 2), { name: 'barcode-pos-data.json' });

      archive.finalize();
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Yedekleri listele
ipcMain.handle('list-backups', async () => {
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups');

    if (!fs.existsSync(backupDir)) {
      return { success: true, backups: [] };
    }

    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
      .map(f => {
        const stats = fs.statSync(path.join(backupDir, f));
        return {
          name: f,
          path: path.join(backupDir, f),
          size: stats.size,
          date: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    return { success: true, backups };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Yedek geri yükle
ipcMain.handle('restore-backup', async (event, backupPath) => {
  try {
    const tempDir = path.join(app.getPath('userData'), 'temp-restore');

    // Geçici klasörü temizle/oluştur
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // ZIP'i çıkart
    await extract(backupPath, { dir: tempDir });

    // JSON dosyasını oku
    const restoredDataPath = path.join(tempDir, 'barcode-pos-data.json');
    if (!fs.existsSync(restoredDataPath)) {
      throw new Error('Yedek dosyası geçersiz!');
    }

    const restoredData = JSON.parse(fs.readFileSync(restoredDataPath, 'utf8'));

    // Veritabanını güncelle
    db = {
      products: restoredData.products || [],
      sales: restoredData.sales || [],
      sale_items: restoredData.sale_items || [],
      customers: restoredData.customers || [],
      campaigns: restoredData.campaigns || [],
      // CRM Tables
      customer_notes: restoredData.customer_notes || [],
      customer_tags: restoredData.customer_tags || [],
      customer_reminders: restoredData.customer_reminders || [],
      message_templates: restoredData.message_templates || [],
      message_history: restoredData.message_history || [],
      automation_rules: restoredData.automation_rules || [],
      settings: {
        ...db.settings,
        ...restoredData.settings
      }
    };

    // Ana veritabanı dosyasını kaydet
    saveDatabase();

    // Geçici klasörü temizle
    fs.rmSync(tempDir, { recursive: true });

    return { success: true, message: 'Yedek başarıyla geri yüklendi!' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Yedek dosyası seç (dialog ile)
ipcMain.handle('select-backup-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Yedek Dosyası Seç',
      filters: [
        { name: 'Yedek Dosyaları', extensions: ['zip'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return { success: true, filePath: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Delete backup file
ipcMain.handle('delete-backup', async (event, backupPath) => {
  try {
    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'Yedek dosyası bulunamadı' };
    }

    fs.unlinkSync(backupPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Reset all database data
ipcMain.handle('reset-database', async () => {
  try {
    // Clear all data
    db.products = [];
    db.sales = [];
    db.sale_items = [];
    db.customers = [];
    db.campaigns = [];

    // Reset settings to default
    db.settings = {
      storeName: 'Barkod POS Sistemi',
      storeAddress: '',
      storePhone: '',
      storeTaxNumber: '',
      receiptFooter: 'Bizi tercih ettiğiniz için teşekkürler!',
      lowStockThreshold: 10,
      theme: 'light',
      autoBackup: true,
      currency: 'TRY',
      currencySymbol: '₺',
      vatRate1: 0,
      vatRate2: 1,
      vatRate3: 10,
      vatRate4: 20,
      vatName1: 'İstisna',
      vatName2: 'Temel Gıda',
      vatName3: 'İndirimli',
      vatName4: 'Genel',
      defaultVatRate: 20,
      keyboardShortcuts: {
        goToSales: 'F1',
        addProduct: 'F2',
        addCustomer: 'F3',
        completeSale: 'F4',
        refreshDashboard: 'F5',
        closeModal: 'Escape',
        focusSearch: 'Control+f',
        saveForm: 'Control+s'
      }
    };

    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Clear sales history only
ipcMain.handle('clear-sales-history', async () => {
  try {
    db.sales = [];
    db.sale_items = [];
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// CRM IPC HANDLERS
// ============================================

// Customer Notes
ipcMain.handle('get-customer-notes', async (event, customerId) => {
  return db.customer_notes.filter(note => note.customerId === customerId);
});

ipcMain.handle('add-customer-note', async (event, customerId, note) => {
  const newNote = {
    id: Date.now(),
    customerId,
    note,
    createdAt: new Date().toISOString()
  };
  db.customer_notes.push(newNote);
  saveDatabase();
  return newNote;
});

ipcMain.handle('delete-customer-note', async (event, noteId) => {
  db.customer_notes = db.customer_notes.filter(note => note.id !== noteId);
  saveDatabase();
  return { success: true };
});

// Customer Tags
ipcMain.handle('get-customer-tags', async (event, customerId) => {
  return db.customer_tags.filter(tag => tag.customerId === customerId);
});

ipcMain.handle('add-customer-tag', async (event, customerId, tag) => {
  const newTag = {
    id: Date.now(),
    customerId,
    tag
  };
  db.customer_tags.push(newTag);
  saveDatabase();
  return newTag;
});

ipcMain.handle('delete-customer-tag', async (event, tagId) => {
  db.customer_tags = db.customer_tags.filter(tag => tag.id !== tagId);
  saveDatabase();
  return { success: true };
});

// Customer Reminders
ipcMain.handle('get-customer-reminders', async (event, customerId) => {
  return db.customer_reminders.filter(reminder => reminder.customerId === customerId);
});

ipcMain.handle('add-customer-reminder', async (event, customerId, title, date) => {
  const newReminder = {
    id: Date.now(),
    customerId,
    title,
    date,
    completed: false
  };
  db.customer_reminders.push(newReminder);
  saveDatabase();
  return newReminder;
});

ipcMain.handle('update-customer-reminder', async (event, reminderId, updates) => {
  const reminder = db.customer_reminders.find(r => r.id === reminderId);
  if (reminder) {
    Object.assign(reminder, updates);
    saveDatabase();
    return reminder;
  }
  return null;
});

ipcMain.handle('delete-customer-reminder', async (event, reminderId) => {
  db.customer_reminders = db.customer_reminders.filter(r => r.id !== reminderId);
  saveDatabase();
  return { success: true };
});

// Message Templates
ipcMain.handle('get-message-templates', async () => {
  return db.message_templates;
});

ipcMain.handle('get-message-template', async (event, templateId) => {
  return db.message_templates.find(t => t.id === templateId);
});

ipcMain.handle('add-message-template', async (event, template) => {
  const newTemplate = {
    id: Date.now(),
    ...template,
    createdAt: new Date().toISOString()
  };
  db.message_templates.push(newTemplate);
  saveDatabase();
  return newTemplate;
});

ipcMain.handle('update-message-template', async (event, templateId, updates) => {
  const template = db.message_templates.find(t => t.id === templateId);
  if (template) {
    Object.assign(template, updates);
    saveDatabase();
    return template;
  }
  return null;
});

ipcMain.handle('delete-message-template', async (event, templateId) => {
  db.message_templates = db.message_templates.filter(t => t.id !== templateId);
  saveDatabase();
  return { success: true };
});

// Message History
ipcMain.handle('get-message-history', async (event, customerId) => {
  if (customerId) {
    return db.message_history.filter(msg => msg.customerId === customerId);
  }
  return db.message_history;
});

ipcMain.handle('add-message-history', async (event, message) => {
  const newMessage = {
    id: Date.now(),
    ...message,
    sentAt: new Date().toISOString()
  };
  db.message_history.push(newMessage);
  saveDatabase();
  return newMessage;
});

// Automation Rules
ipcMain.handle('get-automation-rules', async () => {
  return db.automation_rules;
});

ipcMain.handle('add-automation-rule', async (event, rule) => {
  const newRule = {
    id: Date.now(),
    ...rule,
    createdAt: new Date().toISOString()
  };
  db.automation_rules.push(newRule);
  saveDatabase();
  return newRule;
});

ipcMain.handle('update-automation-rule', async (event, ruleId, updates) => {
  const rule = db.automation_rules.find(r => r.id === ruleId);
  if (rule) {
    Object.assign(rule, updates);
    saveDatabase();
    return rule;
  }
  return null;
});

ipcMain.handle('delete-automation-rule', async (event, ruleId) => {
  db.automation_rules = db.automation_rules.filter(r => r.id !== ruleId);
  saveDatabase();
  return { success: true };
});

// Get customer purchase statistics
ipcMain.handle('get-customer-stats', async (event, customerId) => {
  const customerSales = db.sales.filter(sale => sale.customerId === customerId);
  const totalPurchases = customerSales.length;
  const totalSpent = customerSales.reduce((sum, sale) => sum + (sale.total || 0), 0);
  const lastPurchase = customerSales.length > 0
    ? customerSales.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date
    : null;

  return {
    totalPurchases,
    totalSpent,
    lastPurchase,
    averageBasket: totalPurchases > 0 ? totalSpent / totalPurchases : 0
  };
});

// Get all customers with stats for CRM
ipcMain.handle('get-customers-with-stats', async () => {
  const customersWithStats = db.customers.map(customer => {
    const customerSales = db.sales.filter(sale => sale.customerId === customer.id);
    const totalPurchases = customerSales.length;
    const totalSpent = customerSales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const lastPurchase = customerSales.length > 0
      ? customerSales.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date
      : null;

    // Calculate segment
    let segment = 'Yeni';
    if (!lastPurchase) {
      segment = 'Yeni';
    } else {
      const daysSinceLastPurchase = Math.floor((Date.now() - new Date(lastPurchase)) / (1000 * 60 * 60 * 24));
      if (daysSinceLastPurchase > 30) {
        segment = 'Risk';
      } else if (totalSpent >= 10000 * 100) { // 10000 TL in kuruş
        segment = 'VIP';
      } else if (totalPurchases >= 3) {
        segment = 'Düzenli';
      }
    }

    return {
      ...customer,
      totalPurchases,
      totalSpent,
      lastPurchase,
      segment,
      loyaltyPoints: customer.loyaltyPoints || 0
    };
  });

  return customersWithStats;
});
