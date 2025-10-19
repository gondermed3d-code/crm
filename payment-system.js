// Enhanced Payment System with Change Calculation and Receipt Printing

let currentSaleTotal = 0;
let receivedAmount = 0;

// Show change calculation for cash payment
function showChangeCalculation() {
    // Hide payment method buttons
    document.getElementById('payment-method-buttons').style.display = 'none';

    // Show change calculation section
    document.getElementById('change-calculation').style.display = 'block';
    document.getElementById('confirm-cash-payment').style.display = 'block';

    // Focus on input
    setTimeout(() => {
        document.getElementById('received-amount').focus();
    }, 100);
}

// Calculate change in real-time
function calculateChange() {
    const receivedTL = parseFloat(document.getElementById('received-amount').value) || 0;
    const received = Math.round(receivedTL * 100); // TL'yi kuruşa çevir
    const total = currentSaleTotal; // Zaten kuruş cinsinden

    if (receivedTL === 0) {
        document.getElementById('change-display').style.display = 'none';
        document.getElementById('insufficient-warning').style.display = 'none';
        return;
    }

    if (received < total) {
        // Insufficient amount
        document.getElementById('change-display').style.display = 'none';
        document.getElementById('insufficient-warning').style.display = 'block';
    } else {
        // Calculate change
        const change = received - total; // Kuruş cinsinden
        const formattedChange = formatPriceTR(change);
        document.getElementById('change-amount').textContent = formattedChange + ' ₺';
        document.getElementById('change-display').style.display = 'block';
        document.getElementById('insufficient-warning').style.display = 'none';
    }
}

// Back to payment method selection
function backToPaymentMethods() {
    document.getElementById('payment-method-buttons').style.display = 'block';
    document.getElementById('change-calculation').style.display = 'none';
    document.getElementById('confirm-cash-payment').style.display = 'none';
    document.getElementById('received-amount').value = '';
    document.getElementById('change-display').style.display = 'none';
    document.getElementById('insufficient-warning').style.display = 'none';
}

// Confirm cash payment (with change calculation)
async function confirmCashPayment() {
    const receivedTL = parseFloat(document.getElementById('received-amount').value) || 0;
    const received = Math.round(receivedTL * 100); // TL'yi kuruşa çevir
    const total = currentSaleTotal; // Zaten kuruş cinsinden

    if (received < total) {
        showNotification('error', '❌ Hata!', ['Alınan tutar yetersiz!']);
        return;
    }

    const change = received - total; // Kuruş cinsinden

    // Process payment with change info
    await processPayment('Nakit', received, change);
}

// Process payment (unified for all payment methods)
async function processPayment(paymentMethod, received = 0, change = 0) {
    // Calculate total with VAT (kuruş cinsinden)
    const vatCalc = calculateCartVAT(cart);
    const total = vatCalc.grandTotal; // Kuruş cinsinden

    const saleData = {
        total: total / 100, // Backend'e TL olarak gönder (backend tekrar kuruşa çevirir)
        subtotal: vatCalc.subtotal,
        totalVAT: vatCalc.totalVAT,
        vatBreakdown: vatCalc.vatBreakdown,
        paymentMethod: paymentMethod,
        items: cart.map(item => ({
            productId: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price / 100, // Backend'e TL olarak gönder
            vatRate: item.vatRate || 0
        })),
        changeMoney: paymentMethod === 'Nakit' && received > 0 ? {
            received: received / 100, // TL olarak
            change: change / 100 // TL olarak
        } : null
    };

    const result = await ipcRenderer.invoke('create-sale', saleData);

    if (result.success) {
        // Close payment modal
        closePaymentModal();

        // Show success notification
        const formattedTotal = formatPriceTR(total);
        const messages = [
            `Toplam: ${formattedTotal} ₺`,
            `Ödeme: ${paymentMethod}`
        ];

        if (paymentMethod === 'Nakit' && received > 0) {
            const formattedReceived = formatPriceTR(received);
            messages.push(`Alınan: ${formattedReceived} ₺`);
            if (change > 0) {
                const formattedChange = formatPriceTR(change);
                messages.push(`💰 Para Üstü: ${formattedChange} ₺`);
            }
        }

        messages.push(`Satış No: #${result.saleId}`);
        messages.push(`📊 Ciro güncellendi!`);

        showNotification('success', '✅ Satış Tamamlandı!', messages);

        // Print receipt automatically
        const settings = await ipcRenderer.invoke('get-settings');
        const totalInTL = total / 100; // Kuruştan TL'ye
        const receiptData = {
            saleId: result.saleId,
            total: totalInTL,
            paymentMethod: paymentMethod,
            items: cart.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price / 100 // Kuruştan TL'ye
            })),
            date: new Date(),
            changeMoney: saleData.changeMoney
        };

        // Auto-print receipt (user can choose to print or close)
        printReceipt(receiptData, settings);

        // Clear cart
        cart = [];
        updateCartDisplay();
        document.getElementById('last-product-info').innerHTML = '<p style="color: #999;">Henüz ürün eklenmedi</p>';

        // Reload dashboard
        loadDashboard();

        // Reload sales page if it's open
        const salesPage = document.getElementById('sales-page');
        if (salesPage && salesPage.classList.contains('active')) {
            loadSales();
        }
    } else {
        showNotification('error', '❌ Hata!', ['Satış kaydedilemedi: ' + result.error]);
    }
}

// Update selectPaymentMethod to use new system
async function selectPaymentMethod(paymentMethod) {
    await processPayment(paymentMethod);
}

// Modified completeSale to store total (with VAT)
async function completeSale() {
    if (cart.length === 0) {
        await customAlerts.warning('Sepet boş!');
        return;
    }

    // Calculate total with VAT (kuruş cinsinden)
    const vatCalc = calculateCartVAT(cart);
    currentSaleTotal = vatCalc.grandTotal; // Kuruş cinsinden

    // Show payment modal
    const formattedTotal = formatPriceTR(currentSaleTotal);
    document.getElementById('payment-total').textContent = formattedTotal + ' ₺';
    document.getElementById('payment-modal').classList.add('active');

    // Reset modal state
    backToPaymentMethods();
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.remove('active');
    backToPaymentMethods();
}
