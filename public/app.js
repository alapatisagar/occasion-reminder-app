let state = {
  occasions: [],
  logs: [],
  settings: {},
  activeTab: 'dashboard'
};

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

document.addEventListener('DOMContentLoaded', () => {
  initApp();

  document.getElementById('occasionForm').addEventListener('submit', handleSaveOccasion);
  document.getElementById('settingsForm').addEventListener('submit', handleSaveSettings);
  document.getElementById('testSmtpBtn').addEventListener('click', handleTestSmtp);
  document.getElementById('triggerDispatcherBtn').addEventListener('click', handleTriggerAutoDispatch);
  document.getElementById('searchInput').addEventListener('input', renderOccasionsGrid);
  document.getElementById('filterType').addEventListener('change', renderOccasionsGrid);
});

async function initApp() {
  await Promise.all([
    fetchOccasions(),
    fetchLogs(),
    fetchSettings()
  ]);
  updateDashboardStats();
  renderDashboardTable();
  renderOccasionsGrid();
  renderLogsTable();
}

// -------------------------------------------------------------
// TAB NAVIGATION
// -------------------------------------------------------------
function switchTab(tabId) {
  state.activeTab = tabId;

  ['dashboard', 'occasions', 'logs', 'settings'].forEach(tab => {
    const viewEl = document.getElementById(`view-${tab}`);
    const tabBtn = document.getElementById(`tab-${tab}`);

    if (tab === tabId) {
      viewEl.classList.remove('hidden');
      tabBtn.className = 'py-4 px-2 active-tab transition flex items-center space-x-2';
    } else {
      viewEl.classList.add('hidden');
      tabBtn.className = 'py-4 px-2 text-slate-600 hover:text-indigo-600 transition flex items-center space-x-2';
    }
  });
}

// -------------------------------------------------------------
// ALERT / NOTIFICATION BANNER
// -------------------------------------------------------------
function showAlert(message, type = 'success') {
  const banner = document.getElementById('alertBanner');
  const content = document.getElementById('alertContent');

  const styles = {
    success: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    error: 'bg-rose-50 text-rose-800 border border-rose-200',
    info: 'bg-indigo-50 text-indigo-800 border border-indigo-200'
  };

  const icons = {
    success: '<i class="fa-solid fa-circle-check text-emerald-600 text-lg"></i>',
    error: '<i class="fa-solid fa-circle-xmark text-rose-600 text-lg"></i>',
    info: '<i class="fa-solid fa-circle-info text-indigo-600 text-lg"></i>'
  };

  content.className = `p-4 rounded-xl text-sm flex justify-between items-center shadow-sm ${styles[type] || styles.info}`;
  content.innerHTML = `
    <div class="flex items-center space-x-3">
      ${icons[type]}
      <span class="font-medium">${escapeHtml(message)}</span>
    </div>
    <button onclick="document.getElementById('alertBanner').classList.add('hidden')" class="opacity-60 hover:opacity-100 text-lg px-2">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  banner.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  setTimeout(() => {
    banner.classList.add('hidden');
  }, 6000);
}

// Helper to sanitize text rendering
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -------------------------------------------------------------
// API FETCHERS
// -------------------------------------------------------------
async function fetchOccasions() {
  try {
    const res = await fetch('/api/occasions');
    state.occasions = await res.json();
  } catch (err) {
    console.error('Error fetching occasions:', err);
  }
}

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    state.logs = await res.json();
  } catch (err) {
    console.error('Error fetching logs:', err);
  }
}

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    state.settings = await res.json();

    document.getElementById('setting_sender_name').value = state.settings.sender_name || '';
    document.getElementById('setting_smtp_host').value = state.settings.smtp_host || '';
    document.getElementById('setting_smtp_port').value = state.settings.smtp_port || '';
    document.getElementById('setting_smtp_user').value = state.settings.smtp_user || '';
    document.getElementById('setting_smtp_pass').value = state.settings.smtp_pass || '';
  } catch (err) {
    console.error('Error fetching settings:', err);
  }
}

// -------------------------------------------------------------
// DASHBOARD STATS & TABLES
// -------------------------------------------------------------
function updateDashboardStats() {
  const total = state.occasions.length;
  const currentMonth = new Date().getMonth() + 1;

  const thisMonthCount = state.occasions.filter(o => o.date_month === currentMonth).length;
  const sentSuccessCount = state.logs.filter(l => l.status === 'SUCCESS').length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statThisMonth').textContent = thisMonthCount;
  document.getElementById('statSent').textContent = sentSuccessCount;
}

function renderDashboardTable() {
  const tbody = document.getElementById('dashboardTableBody');
  if (state.occasions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-12 text-center text-slate-400">
          <i class="fa-solid fa-calendar-xmark text-3xl mb-2 block"></i>
          No scheduled occasions found. Click "Add New Occasion" to get started!
        </td>
      </tr>
    `;
    return;
  }

  const sorted = [...state.occasions].sort((a, b) => {
    if (a.date_month !== b.date_month) return a.date_month - b.date_month;
    return a.date_day - b.date_day;
  });

  tbody.innerHTML = sorted.map(occ => {
    const monthStr = monthNames[occ.date_month - 1];
    const isToday = isOccasionToday(occ.date_month, occ.date_day);

    const badgeColor = isToday 
      ? 'bg-amber-100 text-amber-800 font-bold border border-amber-300' 
      : 'bg-slate-100 text-slate-700';

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4 font-medium text-slate-900">
          <div>${escapeHtml(occ.recipient_name)}</div>
          <div class="text-xs text-slate-400">${escapeHtml(occ.recipient_email)}</div>
        </td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
            ${occ.occasion_type === 'Birthday' ? '🎂 Birthday' : (occ.occasion_type === 'Anniversary' ? '❤️ Anniversary' : '🎉 Custom')}
          </span>
        </td>
        <td class="px-6 py-4 font-medium text-slate-700">
          ${monthStr} ${occ.date_day} ${occ.year ? `(${occ.year})` : ''}
        </td>
        <td class="px-6 py-4">
          <span class="px-2.5 py-1 rounded-full text-xs ${badgeColor}">
            ${isToday ? '🔥 Today!' : 'Scheduled'}
          </span>
        </td>
        <td class="px-6 py-4 text-right space-x-2">
          <button onclick="handleSendNow(${occ.id})" title="Send Direct Test Message Now" class="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg transition font-medium">
            <i class="fa-solid fa-paper-plane mr-1"></i> Send Now
          </button>
          <button onclick="openOccasionModal(${occ.id})" class="text-slate-400 hover:text-slate-600 px-2 py-1">
            <i class="fa-solid fa-pen"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function isOccasionToday(m, d) {
  const now = new Date();
  return (now.getMonth() + 1) === m && now.getDate() === d;
}

// -------------------------------------------------------------
// OCCASIONS GRID
// -------------------------------------------------------------
function renderOccasionsGrid() {
  const grid = document.getElementById('occasionsGrid');
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const filter = document.getElementById('filterType').value;

  const filtered = state.occasions.filter(o => {
    const matchesSearch = o.recipient_name.toLowerCase().includes(search) || o.recipient_email.toLowerCase().includes(search);
    const matchesFilter = filter === 'ALL' || o.occasion_type === filter;
    return matchesSearch && matchesFilter;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
        <i class="fa-solid fa-folder-open text-4xl mb-3 block text-slate-300"></i>
        No occasions match your criteria.
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(occ => {
    const monthStr = monthNames[occ.date_month - 1];
    return `
      <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4">
        <div class="space-y-3">
          <div class="flex justify-between items-start">
            <span class="px-3 py-1 rounded-full text-xs font-bold ${occ.occasion_type === 'Birthday' ? 'bg-pink-50 text-pink-700' : 'bg-purple-50 text-purple-700'}">
              ${occ.occasion_type}
            </span>
            <div class="text-right">
              <span class="text-sm font-bold text-slate-900">${monthStr} ${occ.date_day}</span>
              ${occ.year ? `<span class="text-xs text-slate-400 block">${occ.year}</span>` : ''}
            </div>
          </div>
          <div>
            <h4 class="text-base font-bold text-slate-900">${escapeHtml(occ.recipient_name)}</h4>
            <p class="text-xs text-slate-500">${escapeHtml(occ.recipient_email)}</p>
          </div>
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 line-clamp-3 italic">
            "${escapeHtml(occ.custom_message)}"
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
          <button onclick="handleSendNow(${occ.id})" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl transition font-medium flex items-center space-x-1.5 shadow-sm">
            <i class="fa-solid fa-paper-plane text-[10px]"></i>
            <span>Send Test Now</span>
          </button>
          <div class="space-x-1">
            <button onclick="openOccasionModal(${occ.id})" class="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button onclick="handleDeleteOccasion(${occ.id})" class="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-50 transition">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// SENT LOGS TABLE
// -------------------------------------------------------------
function renderLogsTable() {
  const tbody = document.getElementById('logsTableBody');
  if (state.logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-12 text-center text-slate-400">
          No messages have been sent yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.logs.map(log => {
    const isSuccess = log.status === 'SUCCESS';
    const statusClass = isSuccess ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
          ${new Date(log.sent_at).toLocaleString()}
        </td>
        <td class="px-6 py-4 font-medium text-slate-900">
          <div>${escapeHtml(log.recipient_name)}</div>
          <div class="text-xs text-slate-400">${escapeHtml(log.recipient_email)}</div>
        </td>
        <td class="px-6 py-4 text-xs text-slate-600">
          ${escapeHtml(log.occasion_type)}
        </td>
        <td class="px-6 py-4">
          <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}">
            ${log.status}
          </span>
        </td>
        <td class="px-6 py-4 text-xs text-slate-600 max-w-xs truncate">
          ${escapeHtml(log.details)}
        </td>
      </tr>
    `;
  }).join('');
}

// -------------------------------------------------------------
// MODAL & HANDLERS
// -------------------------------------------------------------
function openOccasionModal(id = null) {
  const modal = document.getElementById('occasionModal');
  const form = document.getElementById('occasionForm');
  form.reset();

  if (id) {
    const occ = state.occasions.find(o => o.id === id);
    if (occ) {
      document.getElementById('modalTitle').textContent = 'Edit Scheduled Occasion';
      document.getElementById('occasion_id').value = occ.id;
      document.getElementById('recipient_name').value = occ.recipient_name;
      document.getElementById('recipient_email').value = occ.recipient_email;
      document.getElementById('recipient_phone').value = occ.recipient_phone || '';
      document.getElementById('occasion_type').value = occ.occasion_type;
      document.getElementById('date_month').value = occ.date_month;
      document.getElementById('date_day').value = occ.date_day;
      document.getElementById('custom_message').value = occ.custom_message;
    }
  } else {
    document.getElementById('modalTitle').textContent = 'Add Scheduled Occasion';
    document.getElementById('occasion_id').value = '';
    document.getElementById('custom_message').value = 'Wishing you the happiest {occasion}, {name}! May your day be filled with endless joy and wonderful moments!';
  }

  modal.classList.remove('hidden');
}

function closeOccasionModal() {
  document.getElementById('occasionModal').classList.add('hidden');
}

async function handleSaveOccasion(e) {
  e.preventDefault();
  const id = document.getElementById('occasion_id').value;

  const payload = {
    recipient_name: document.getElementById('recipient_name').value,
    recipient_email: document.getElementById('recipient_email').value,
    recipient_phone: document.getElementById('recipient_phone').value,
    occasion_type: document.getElementById('occasion_type').value,
    date_month: document.getElementById('date_month').value,
    date_day: document.getElementById('date_day').value,
    custom_message: document.getElementById('custom_message').value
  };

  const url = id ? `/api/occasions/${id}` : '/api/occasions';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save');

    closeOccasionModal();
    showAlert(id ? 'Occasion updated successfully!' : 'New occasion added to schedule!', 'success');
    await initApp();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function handleDeleteOccasion(id) {
  if (!confirm('Are you sure you want to delete this scheduled occasion?')) return;

  try {
    const res = await fetch(`/api/occasions/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete');

    showAlert('Occasion deleted', 'info');
    await initApp();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function handleSendNow(id) {
  showAlert('Sending message directly to recipient...', 'info');
  try {
    const res = await fetch(`/api/send-now/${id}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send');

    showAlert(data.message, 'success');
    await fetchLogs();
    updateDashboardStats();
    renderLogsTable();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function handleTriggerAutoDispatch() {
  showAlert('Running automated background dispatcher check...', 'info');
  try {
    const res = await fetch('/api/trigger-dispatch', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed auto-dispatcher');

    const summary = data.summary;
    showAlert(`Auto-dispatcher complete! Matched: ${summary.totalMatched}, Sent: ${summary.sentCount}, Skipped: ${summary.skippedCount}, Failed: ${summary.failedCount}`, 'success');
    await fetchLogs();
    updateDashboardStats();
    renderLogsTable();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const payload = {
    sender_name: document.getElementById('setting_sender_name').value,
    smtp_host: document.getElementById('setting_smtp_host').value,
    smtp_port: document.getElementById('setting_smtp_port').value,
    smtp_user: document.getElementById('setting_smtp_user').value,
    smtp_pass: document.getElementById('setting_smtp_pass').value
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save settings');

    showAlert('Email settings saved successfully!', 'success');
    await fetchSettings();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function handleTestSmtp() {
  showAlert('Testing SMTP connection...', 'info');
  try {
    const res = await fetch('/api/test-smtp', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'SMTP test failed');

    showAlert(data.message, 'success');
  } catch (err) {
    showAlert(err.message, 'error');
  }
}
