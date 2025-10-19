// AUTOMATION SYSTEM - Automatic Message Triggers
let ipcRenderer;
try {
    const electron = require('electron');
    ipcRenderer = electron.ipcRenderer;
} catch (e) {
    console.error('Failed to load electron in automation-system.js:', e);
    if (window.ipcRenderer) {
        ipcRenderer = window.ipcRenderer;
    }
}

let automationRules = [];

// Load Automation Settings
window.loadAutomationSettings = async function() {
    automationRules = await ipcRenderer.invoke('get-automation-rules');

    // Load settings into form
    const birthdayRule = automationRules.find(r => r.trigger === 'birthday');
    if (birthdayRule) {
        document.getElementById('auto-birthday-enabled').checked = birthdayRule.active;
        document.getElementById('auto-birthday-template').value = birthdayRule.templateId || '';
        document.getElementById('auto-birthday-time').value = birthdayRule.settings?.time || '09:00';
    }

    const inactiveRule = automationRules.find(r => r.trigger === 'inactive');
    if (inactiveRule) {
        document.getElementById('auto-inactive-enabled').checked = inactiveRule.active;
        document.getElementById('auto-inactive-template').value = inactiveRule.templateId || '';
    }

    const welcomeRule = automationRules.find(r => r.trigger === 'welcome');
    if (welcomeRule) {
        document.getElementById('auto-welcome-enabled').checked = welcomeRule.active;
        document.getElementById('auto-welcome-template').value = welcomeRule.templateId || '';
        document.getElementById('auto-welcome-delay').value = welcomeRule.settings?.delay || '0';
    }

    const thankyouRule = automationRules.find(r => r.trigger === 'thankyou');
    if (thankyouRule) {
        document.getElementById('auto-thankyou-enabled').checked = thankyouRule.active;
        document.getElementById('auto-thankyou-template').value = thankyouRule.templateId || '';
        document.getElementById('auto-thankyou-delay').value = thankyouRule.settings?.delay || '0';
    }

    // Update template selects
    updateTemplateSelects();
}

// Save Automation Settings
window.saveAutomationSettings = async function() {
    // Birthday Rule
    const birthdayEnabled = document.getElementById('auto-birthday-enabled').checked;
    const birthdayTemplate = parseInt(document.getElementById('auto-birthday-template').value);
    const birthdayTime = document.getElementById('auto-birthday-time').value;

    if (birthdayEnabled && !birthdayTemplate) {
        await customAlerts.warning('Doğum günü mesajı için şablon seçmelisiniz!');
        return;
    }

    await saveOrUpdateRule('birthday', {
        trigger: 'birthday',
        templateId: birthdayTemplate,
        active: birthdayEnabled,
        settings: { time: birthdayTime }
    });

    // Inactive Rule
    const inactiveEnabled = document.getElementById('auto-inactive-enabled').checked;
    const inactiveTemplate = parseInt(document.getElementById('auto-inactive-template').value);

    if (inactiveEnabled && !inactiveTemplate) {
        await customAlerts.warning('Hatırlatma mesajı için şablon seçmelisiniz!');
        return;
    }

    await saveOrUpdateRule('inactive', {
        trigger: 'inactive',
        templateId: inactiveTemplate,
        active: inactiveEnabled,
        settings: {}
    });

    // Welcome Rule
    const welcomeEnabled = document.getElementById('auto-welcome-enabled').checked;
    const welcomeTemplate = parseInt(document.getElementById('auto-welcome-template').value);
    const welcomeDelay = document.getElementById('auto-welcome-delay').value;

    if (welcomeEnabled && !welcomeTemplate) {
        await customAlerts.warning('Hoş geldin mesajı için şablon seçmelisiniz!');
        return;
    }

    await saveOrUpdateRule('welcome', {
        trigger: 'welcome',
        templateId: welcomeTemplate,
        active: welcomeEnabled,
        settings: { delay: parseInt(welcomeDelay) }
    });

    // Thank You Rule
    const thankyouEnabled = document.getElementById('auto-thankyou-enabled').checked;
    const thankyouTemplate = parseInt(document.getElementById('auto-thankyou-template').value);
    const thankyouDelay = document.getElementById('auto-thankyou-delay').value;

    if (thankyouEnabled && !thankyouTemplate) {
        await customAlerts.warning('Teşekkür mesajı için şablon seçmelisiniz!');
        return;
    }

    await saveOrUpdateRule('thankyou', {
        trigger: 'thankyou',
        templateId: thankyouTemplate,
        active: thankyouEnabled,
        settings: { delay: parseInt(thankyouDelay) }
    });

    await customAlerts.success('Otomasyon ayarları kaydedildi!');
    await loadAutomationSettings();
}

async function saveOrUpdateRule(trigger, ruleData) {
    const existingRule = automationRules.find(r => r.trigger === trigger);

    if (existingRule) {
        await ipcRenderer.invoke('update-automation-rule', existingRule.id, ruleData);
    } else {
        await ipcRenderer.invoke('add-automation-rule', ruleData);
    }
}

// Trigger Automations (called from various places)
async function triggerWelcomeMessage(customerId) {
    const rule = automationRules.find(r => r.trigger === 'welcome' && r.active);
    if (!rule || !rule.templateId) return;

    const customer = await ipcRenderer.invoke('get-customer', customerId);
    if (!customer) return;

    const stats = await ipcRenderer.invoke('get-customer-stats', customerId);
    const customerWithStats = { ...customer, ...stats };

    const template = messageTemplates.find(t => t.id === rule.templateId);
    if (!template) return;

    const message = replaceTemplateVariables(template.content, customerWithStats);

    // Delay if configured
    const delay = rule.settings?.delay || 0;

    setTimeout(async () => {
        // Send via WhatsApp and/or Email
        if (template.type === 'whatsapp' || template.type === 'both') {
            if (customer.phone) {
                await sendWhatsAppMessage(customerWithStats, message);
            }
        }

        if (template.type === 'email' || template.type === 'both') {
            if (customer.email) {
                await ipcRenderer.invoke('add-message-history', {
                    customerId: customer.id,
                    templateId: template.id,
                    type: 'email',
                    content: message,
                    status: 'sent'
                });
            }
        }
    }, delay * 60 * 1000); // Convert minutes to milliseconds
}

async function triggerThankYouMessage(customerId) {
    const rule = automationRules.find(r => r.trigger === 'thankyou' && r.active);
    if (!rule || !rule.templateId) return;

    const customer = await ipcRenderer.invoke('get-customer', customerId);
    if (!customer) return;

    const stats = await ipcRenderer.invoke('get-customer-stats', customerId);
    const customerWithStats = { ...customer, ...stats };

    const template = messageTemplates.find(t => t.id === rule.templateId);
    if (!template) return;

    const message = replaceTemplateVariables(template.content, customerWithStats);

    // Delay if configured
    const delay = rule.settings?.delay || 0;

    setTimeout(async () => {
        // Send via WhatsApp and/or Email
        if (template.type === 'whatsapp' || template.type === 'both') {
            if (customer.phone) {
                await sendWhatsAppMessage(customerWithStats, message);
            }
        }

        if (template.type === 'email' || template.type === 'both') {
            if (customer.email) {
                await ipcRenderer.invoke('add-message-history', {
                    customerId: customer.id,
                    templateId: template.id,
                    type: 'email',
                    content: message,
                    status: 'sent'
                });
            }
        }
    }, delay * 60 * 1000);
}

// Check for automations periodically (can be called on app startup)
async function checkAutomations() {
    await checkBirthdayAutomations();
    await checkInactiveCustomerAutomations();
}

async function checkBirthdayAutomations() {
    const rule = automationRules.find(r => r.trigger === 'birthday' && r.active);
    if (!rule || !rule.templateId) return;

    // Get all customers
    const customers = await ipcRenderer.invoke('get-customers');

    // Check if today is anyone's birthday
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    for (const customer of customers) {
        if (!customer.birthDate) continue;

        const birthDate = new Date(customer.birthDate);
        const birthMonth = birthDate.getMonth() + 1;
        const birthDay = birthDate.getDate();

        if (birthMonth === todayMonth && birthDay === todayDay) {
            // It's their birthday! Send message
            const stats = await ipcRenderer.invoke('get-customer-stats', customer.id);
            const customerWithStats = { ...customer, ...stats };

            const template = messageTemplates.find(t => t.id === rule.templateId);
            if (!template) continue;

            const message = replaceTemplateVariables(template.content, customerWithStats, {
                discountCode: 'DOGUMGUNU20'
            });

            // Send message
            if (template.type === 'whatsapp' || template.type === 'both') {
                if (customer.phone) {
                    await sendWhatsAppMessage(customerWithStats, message);
                }
            }

            if (template.type === 'email' || template.type === 'both') {
                if (customer.email) {
                    await ipcRenderer.invoke('add-message-history', {
                        customerId: customer.id,
                        templateId: template.id,
                        type: 'email',
                        content: message,
                        status: 'sent'
                    });
                }
            }
        }
    }
}

async function checkInactiveCustomerAutomations() {
    const rule = automationRules.find(r => r.trigger === 'inactive' && r.active);
    if (!rule || !rule.templateId) return;

    // Get customers with stats
    const customers = await ipcRenderer.invoke('get-customers-with-stats');

    // Filter customers who are at risk (30+ days without purchase)
    const riskCustomers = customers.filter(c => c.segment === 'Risk');

    for (const customer of riskCustomers) {
        // Check if we already sent a message recently
        const recentMessages = await ipcRenderer.invoke('get-message-history', customer.id);
        const lastReminderMessage = recentMessages
            .filter(m => m.templateId === rule.templateId)
            .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))[0];

        // Don't spam - only send once per month
        if (lastReminderMessage) {
            const daysSinceLastMessage = Math.floor(
                (Date.now() - new Date(lastReminderMessage.sentAt).getTime()) / (1000 * 60 * 60 * 24)
            );
            if (daysSinceLastMessage < 30) continue;
        }

        const template = messageTemplates.find(t => t.id === rule.templateId);
        if (!template) continue;

        const message = replaceTemplateVariables(template.content, customer, {
            discountCode: 'GELDINIZ15'
        });

        // Send message
        if (template.type === 'whatsapp' || template.type === 'both') {
            if (customer.phone) {
                await sendWhatsAppMessage(customer, message);
            }
        }

        if (template.type === 'email' || template.type === 'both') {
            if (customer.email) {
                await ipcRenderer.invoke('add-message-history', {
                    customerId: customer.id,
                    templateId: template.id,
                    type: 'email',
                    content: message,
                    status: 'sent'
                });
            }
        }
    }
}

// Run automation checks daily
setInterval(checkAutomations, 24 * 60 * 60 * 1000); // Once per day

// Also check on startup
setTimeout(checkAutomations, 5000); // 5 seconds after app starts
