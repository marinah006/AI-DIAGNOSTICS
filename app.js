// app.js - Main Application Controller
import { supabase } from './supabaseClient.js';
import { runDiagnosticAnalysis } from './ai-service.js';
import { payWithPaystack } from './payment.js';

// Application State
let currentUser = null;
let userRole = 'user'; // 'user' or 'admin'
let isAuthSignUp = false;
let revenueChart = null;
let faultsChart = null;

// Guest Diagnosis Counter Key
const GUEST_DIAGNOSIS_KEY = 'fixai_guest_diag_count';

// -------------------------------------------------------------
// GLOBAL WINDOW EXPORTS (Declared directly to prevent ReferenceError)
// -------------------------------------------------------------

// Tab Switching Navigation Controller with Auth Protection
window.switchTab = function(tabName) {
  // Protect database routes for unauthenticated users
  const protectedRoutes = ['intake', 'tickets', 'inventory', 'billing', 'admin'];
  if (!currentUser && protectedRoutes.includes(tabName)) {
    alert('Please sign in to access workshop database operations.');
    window.switchTab('auth');
    return;
  }

  const views = ['auth', 'intake', 'diagnostics', 'tickets', 'inventory', 'billing', 'admin'];
  views.forEach(v => {
    const section = document.getElementById(`view-${v}`);
    if (section) {
      if (v === tabName) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    }
  });

  if (tabName === 'tickets' && currentUser) loadTickets();
  if (tabName === 'inventory' && currentUser) loadInventory();
  if (tabName === 'billing' && currentUser) loadBillingTickets();
  if (tabName === 'admin' && currentUser && userRole === 'admin') loadAdminDashboard();
};

window.toggleAuthModal = function() {
  window.switchTab('auth');
};

window.toggleAuthMode = function() {
  isAuthSignUp = !isAuthSignUp;
  const title = document.getElementById('auth-title');
  const submitBtn = document.getElementById('auth-submit-btn');
  const toggleBtn = document.getElementById('auth-toggle-btn');

  if (isAuthSignUp) {
    title.textContent = 'Register Account';
    submitBtn.textContent = 'Create Account';
    toggleBtn.textContent = 'Already have an account? Sign In';
  } else {
    title.textContent = 'Sign In';
    submitBtn.textContent = 'Sign In';
    toggleBtn.textContent = 'Need an account? Register';
  }
};

window.triggerAIDiagnosis = async function() {
  // Check guest diagnostic usage limit
  if (!currentUser) {
    const guestUsed = getGuestDiagnosisCount();
    if (guestUsed >= 1) {
      alert('You have used your 1 free guest diagnostic check. Please sign in or create an account to run unlimited AI diagnostics.');
      window.toggleAuthModal();
      return;
    }
  }

  const deviceCategory = document.getElementById('diag-device-type').value;
  const symptomsText = document.getElementById('diag-symptoms').value.trim();
  const outputContainer = document.getElementById('ai-output');

  if (!symptomsText) return alert('Please enter observed symptoms or error codes.');

  outputContainer.innerHTML = `<div class="animate-pulse text-accent font-semibold">Running AI diagnostic engine...</div>`;

  try {
    const resultHtml = await runDiagnosticAnalysis(deviceCategory, symptomsText);
    outputContainer.innerHTML = resultHtml;
    
    if (currentUser) {
      await supabase.from('diagnostics_log').insert([
        { user_id: currentUser.id, device_category: deviceCategory, symptoms: symptomsText }
      ]);
    } else {
      incrementGuestDiagnosisCount();
    }
  } catch (err) {
    outputContainer.innerHTML = `<p class="text-red-500">Diagnostic error: ${err.message}</p>`;
  }
};

window.calculateInvoiceTotal = function() {
  const labor = parseFloat(document.getElementById('bill-labor').value) || 0;
  const parts = parseFloat(document.getElementById('bill-parts').value) || 0;
  const subtotal = labor + parts;

  document.getElementById('inv-subtotal').textContent = `KES ${subtotal.toLocaleString()}`;
  document.getElementById('inv-total').textContent = `KES ${subtotal.toLocaleString()}`;
};

window.initiatePaystackPayment = function() {
  if (!currentUser) return window.toggleAuthModal();

  const ticketId = document.getElementById('bill-ticket-select').value;
  const labor = parseFloat(document.getElementById('bill-labor').value) || 0;
  const parts = parseFloat(document.getElementById('bill-parts').value) || 0;
  const total = labor + parts;

  if (!ticketId) return alert('Please select a job ticket first.');
  if (total <= 0) return alert('Invoice total must be greater than zero.');

  const email = currentUser?.email || 'customer@example.com';
  
  payWithPaystack(email, total, async (response) => {
    alert(`Payment Successful! Reference: ${response.reference}`);
    await supabase.from('invoices').insert([
      { ticket_id: ticketId, labor_fee: labor, parts_fee: parts, total_amount: total, payment_status: 'Paid', paystack_ref: response.reference }
    ]);
    loadTickets();
  });
};

window.openAddStockModal = async function() {
  if (userRole !== 'admin') return alert('Admin access required.');
  
  const itemName = prompt('Enter Spare Part Name:');
  if (!itemName) return;
  const sellingPrice = parseFloat(prompt('Enter Selling Price (KES):')) || 0;
  const stockQty = parseInt(prompt('Enter Initial Quantity:'), 10) || 1;

  const { error } = await supabase.from('inventory').insert([
    { item_name: itemName, selling_price: sellingPrice, stock_quantity: stockQty }
  ]);

  if (error) alert(`Failed to add stock: ${error.message}`);
  else {
    alert('Stock item added successfully!');
    loadInventory();
  }
};

window.handleSignOut = async function() {
  await supabase.auth.signOut();
  currentUser = null;
  userRole = 'user';
  updateUIForLoggedOutUser();
};

// -------------------------------------------------------------
// APPLICATION INITIALIZATION & CORE LOGIC
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  updateGuestTryBadge();
  await checkSession();
});

function setupEventListeners() {
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', handleAuthSubmit);
  }

  const intakeForm = document.getElementById('intake-form');
  if (intakeForm) {
    intakeForm.addEventListener('submit', handleIntakeSubmit);
  }
}

async function checkSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      currentUser = session.user;
      await fetchUserRole();
      updateUIForAuthenticatedUser();
    } else {
      updateUIForLoggedOutUser();
    }
  } catch (err) {
    console.warn('Supabase auth session check offline or unconfigured. Defaulting to guest mode.', err);
    updateUIForLoggedOutUser();
  }
}

async function fetchUserRole() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching role:', error);
    }
    userRole = data?.role || 'user';
  } catch (err) {
    userRole = 'user';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  if (isAuthSignUp) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return alert(`Registration Error: ${error.message}`);
    
    if (data.user) {
      await supabase.from('profiles').insert([
        { id: data.user.id, email: email, role: 'user' }
      ]);
    }
    alert('Registration successful! Please sign in.');
    window.toggleAuthMode();
  } else {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(`Sign In Error: ${error.message}`);
    
    currentUser = data.user;
    await fetchUserRole();
    updateUIForAuthenticatedUser();
  }
}

function updateUIForAuthenticatedUser() {
  document.getElementById('view-auth').classList.add('hidden');
  document.getElementById('user-info').classList.remove('hidden');
  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('user-role-badge').textContent = userRole;

  const guestBadge = document.getElementById('guest-try-badge');
  if (guestBadge) guestBadge.classList.add('hidden');

  const authBtn = document.getElementById('auth-btn');
  authBtn.textContent = 'Sign Out';
  authBtn.onclick = window.handleSignOut;

  const navAdmin = document.getElementById('nav-admin');
  const addStockBtn = document.getElementById('add-stock-btn');

  if (userRole === 'admin') {
    navAdmin.classList.remove('hidden');
    if (addStockBtn) addStockBtn.classList.remove('hidden');
  } else {
    navAdmin.classList.add('hidden');
    if (addStockBtn) addStockBtn.classList.add('hidden');
  }

  loadInitialData();
}

function updateUIForLoggedOutUser() {
  document.getElementById('user-info').classList.add('hidden');
  
  const navAdmin = document.getElementById('nav-admin');
  if (navAdmin) navAdmin.classList.add('hidden');

  const authBtn = document.getElementById('auth-btn');
  authBtn.textContent = 'Sign In';
  authBtn.onclick = window.toggleAuthModal;

  const guestBadge = document.getElementById('guest-try-badge');
  if (guestBadge) guestBadge.classList.remove('hidden');
  updateGuestTryBadge();

  window.switchTab('diagnostics');
}

function getGuestDiagnosisCount() {
  return parseInt(localStorage.getItem(GUEST_DIAGNOSIS_KEY) || '0', 10);
}

function incrementGuestDiagnosisCount() {
  const current = getGuestDiagnosisCount();
  localStorage.setItem(GUEST_DIAGNOSIS_KEY, (current + 1).toString());
  updateGuestTryBadge();
}

function updateGuestTryBadge() {
  const badgeCount = document.getElementById('guest-tries-count');
  if (badgeCount) {
    const used = getGuestDiagnosisCount();
    const remaining = Math.max(0, 1 - used);
    badgeCount.textContent = remaining;
  }
}

async function loadInitialData() {
  await Promise.all([loadTickets(), loadInventory(), loadBillingTickets()]);
}

async function handleIntakeSubmit(e) {
  e.preventDefault();
  if (!currentUser) return window.toggleAuthModal();

  const custName = document.getElementById('cust-name').value;
  const custPhone = document.getElementById('cust-phone').value;
  const custEmail = document.getElementById('cust-email').value;
  
  const deviceType = document.getElementById('device-type').value;
  const deviceModel = document.getElementById('device-model').value;
  const deviceSerial = document.getElementById('device-serial').value;
  const deviceSymptoms = document.getElementById('device-symptoms').value;

  try {
    let { data: customer, error: custErr } = await supabase
      .from('customers')
      .insert([{ full_name: custName, phone: custPhone, email: custEmail }])
      .select()
      .single();

    if (custErr) throw custErr;

    let { data: device, error: devErr } = await supabase
      .from('devices')
      .insert([{ customer_id: customer.id, device_type: deviceType, model: deviceModel, serial_number: deviceSerial }])
      .select()
      .single();

    if (devErr) throw devErr;

    const { error: ticketErr } = await supabase
      .from('job_cards')
      .insert([{ customer_id: customer.id, device_id: device.id, symptoms: deviceSymptoms, status: 'Received' }]);

    if (ticketErr) throw ticketErr;

    alert('Device intake registered successfully!');
    document.getElementById('intake-form').reset();
    window.switchTab('tickets');
  } catch (err) {
    alert(`Intake failed: ${err.message}`);
  }
}

async function loadTickets() {
  const tbody = document.getElementById('tickets-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Loading job cards...</td></tr>`;

  const { data: tickets, error } = await supabase
    .from('job_cards')
    .select(`id, status, symptoms, created_at, customers(full_name), devices(device_type, model)`)
    .order('created_at', { ascending: false });

  if (error || !tickets || tickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">No active job cards found.</td></tr>`;
    return;
  }

  tbody.innerHTML = tickets.map(t => `
    <tr class="hover:bg-slate-50">
      <td class="p-3 font-mono font-bold text-xs">#${t.id.slice(0, 8)}</td>
      <td class="p-3">${t.customers?.full_name || 'N/A'}</td>
      <td class="p-3">${t.devices?.device_type || ''} - ${t.devices?.model || ''}</td>
      <td class="p-3">
        <span class="px-2 py-1 rounded text-xs font-semibold ${getStatusBadgeClass(t.status)}">${t.status}</span>
      </td>
      <td class="p-3">
        <select onchange="updateTicketStatus('${t.id}', this.value)" class="border rounded p-1 text-xs">
          <option value="Received" ${t.status === 'Received' ? 'selected' : ''}>Received</option>
          <option value="Diagnosed" ${t.status === 'Diagnosed' ? 'selected' : ''}>Diagnosed</option>
          <option value="In Repair" ${t.status === 'In Repair' ? 'selected' : ''}>In Repair</option>
          <option value="Quality Testing" ${t.status === 'Quality Testing' ? 'selected' : ''}>Quality Testing</option>
          <option value="Ready" ${t.status === 'Ready' ? 'selected' : ''}>Ready for Pickup</option>
          <option value="Closed" ${t.status === 'Closed' ? 'selected' : ''}>Closed</option>
        </select>
      </td>
    </tr>
  `).join('');
}

window.updateTicketStatus = async function(ticketId, newStatus) {
  const { error } = await supabase
    .from('job_cards')
    .update({ status: newStatus })
    .eq('id', ticketId);

  if (error) alert(`Failed to update status: ${error.message}`);
};

function getStatusBadgeClass(status) {
  switch (status) {
    case 'Received': return 'bg-slate-100 text-slate-700';
    case 'Diagnosed': return 'bg-blue-100 text-blue-800';
    case 'In Repair': return 'bg-purple-100 text-purple-800';
    case 'Quality Testing': return 'bg-yellow-100 text-yellow-800';
    case 'Ready': return 'bg-green-100 text-green-800';
    default: return 'bg-slate-200 text-slate-800';
  }
}

async function loadInventory() {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Loading inventory...</td></tr>`;

  const { data: items, error } = await supabase
    .from('inventory')
    .select('*')
    .order('item_name', { ascending: true });

  if (error || !items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">No inventory items cataloged.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr class="hover:bg-slate-50">
      <td class="p-3 font-semibold">${item.item_name}</td>
      <td class="p-3 text-xs text-slate-600">${item.compatible_devices || 'Universal'}</td>
      <td class="p-3 font-mono">${item.stock_quantity}</td>
      <td class="p-3 font-mono">${Number(item.selling_price).toLocaleString()}</td>
      <td class="p-3">
        ${item.stock_quantity <= item.reorder_level 
          ? `<span class="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-700 font-bold uppercase">Low Stock</span>`
          : `<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 font-bold uppercase">In Stock</span>`
        }
      </td>
    </tr>
  `).join('');
}

async function loadBillingTickets() {
  const select = document.getElementById('bill-ticket-select');
  if (!select) return;
  select.innerHTML = `<option value="">Select Job Ticket...</option>`;

  const { data: tickets } = await supabase
    .from('job_cards')
    .select(`id, customers(full_name), devices(model)`)
    .neq('status', 'Closed');

  if (tickets) {
    tickets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `#${t.id.slice(0, 6)} - ${t.customers?.full_name || 'N/A'} (${t.devices?.model || ''})`;
      select.appendChild(opt);
    });
  }
}

async function loadAdminDashboard() {
  const { data: invoices } = await supabase.from('invoices').select('total_amount').eq('payment_status', 'Paid');
  const revenue = invoices?.reduce((acc, curr) => acc + (curr.total_amount || 0), 0) || 0;
  
  const { count: jobCount } = await supabase.from('job_cards').select('*', { count: 'exact', head: true }).neq('status', 'Closed');
  const { count: diagCount } = await supabase.from('diagnostics_log').select('*', { count: 'exact', head: true });
  const { count: lowStockCount } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).lte('stock_quantity', 2);

  document.getElementById('stat-revenue').textContent = `KES ${revenue.toLocaleString()}`;
  document.getElementById('stat-jobs').textContent = jobCount || 0;
  document.getElementById('stat-diagnostics').textContent = diagCount || 0;
  document.getElementById('stat-low-stock').textContent = lowStockCount || 0;

  renderCharts();
}

function renderCharts() {
  const ctxRev = document.getElementById('chart-revenue')?.getContext('2d');
  if (ctxRev) {
    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(ctxRev, {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Revenue (KES)',
          data: [12000, 19000, 15000, 25000, 22000, 30000, 28000],
          borderColor: '#7C3AED',
          backgroundColor: 'rgba(124, 58, 237, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  const ctxFaults = document.getElementById('chart-faults')?.getContext('2d');
  if (ctxFaults) {
    if (faultsChart) faultsChart.destroy();
    faultsChart = new Chart(ctxFaults, {
      type: 'doughnut',
      data: {
        labels: ['Power/PMIC', 'Display/Digitizer', 'Storage/OS', 'Thermal/Cooling', 'Other'],
        datasets: [{
          data: [35, 25, 20, 12, 8],
          backgroundColor: ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#64748B']
        }]
      },
      options: { responsive: true }
    });
  }
}