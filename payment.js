// payment.js - Paystack Payment Gateway Integration

// Replace with your actual Paystack Public Key (test or live)
const PAYSTACK_PUBLIC_KEY = 'pk_test_YOUR_PAYSTACK_PUBLIC_KEY_HERE';

/**
 * Initiates Paystack Inline Checkout Popup
 * @param {string} userEmail - Customer or logged-in user email address
 * @param {number} amountInKES - Total amount in KES
 * @param {function} onSuccessCallback - Function executed upon successful payment
 */
export function payWithPaystack(userEmail, amountInKES, onSuccessCallback) {
  if (typeof PaystackPop === 'undefined') {
    alert('Paystack SDK failed to load. Check your internet connection.');
    return;
  }

  // Paystack expects amount in sub-units (e.g., Kobo/Cents: KES 100 = 10000)
  const amountInSubUnits = Math.round(amountInKES * 100);

  const handler = PaystackPop.setup({
    key: PAYSTACK_PUBLIC_KEY,
    email: userEmail,
    amount: amountInSubUnits,
    currency: 'KES',
    ref: 'FIXAI_' + Math.floor(Math.random() * 1000000000 + 1),
    onClose: function () {
      alert('Payment window closed without completing transaction.');
    },
    callback: function (response) {
      if (typeof onSuccessCallback === 'function') {
        onSuccessCallback(response);
      }
    }
  });

  handler.openIframe();
}