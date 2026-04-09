// --- ME4PH Lab Flexible Calendar Engine ---

// Supabase Configuration
const SUPABASE_URL = 'https://mjwcvjbwzhdlmwqbcaju.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qd2N2amJ3emhkbG13cWJjYWp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MzQsImV4cCI6MjA5MTI2MTUzNH0.lmiAWkaAyqe1kG3-npTN7k2mu1Qbk7yEAU3P3MFXNIg';

// Initialize Supabase Client safely
let db = null;
try {
    if (window.supabase && window.supabase.createClient) {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.warn('Supabase failed to initialize:', e);
}

let state = {
    currentDate: new Date(2026, 3, 1), // April 2026
    selectedDate: null,
    bookings: {},
    maintenance: [
        { name: "Confocal Microscope", icon: "🔬", status: "online", notes: "Calibration completed [2026-04-05]", supplier: "Leica Microsystems" },
        { name: "PCR Thermal Cycler", icon: "🧬", status: "online", notes: "Stable performance detected.", supplier: "Bio-Rad" },
        { name: "Mass Spectrometer v2", icon: "⚗️", status: "offline", notes: "Vacuum pump maintenance in progress.", supplier: "Waters Corp", eta: "Tomorrow 09:00" },
        { name: "Ultra-Low Freezer", icon: "❄️", status: "online", notes: "Temperature: -80.2°C [Nominal]", supplier: "Eppendorf" }
    ],
    media: [
        { name: "DMEM High Glucose", icon: "🧫", status: "In Stock", supplier: "Thermo Fisher", notes: "Batch #4422, Exp: 2026-12" },
        { name: "FBS (Certified)", icon: "🧪", status: "Almost Consumed", supplier: "Gibco", notes: "Only 50ml remaining in bottle A." }
    ],
    reagents: [
        { name: "PBS 10X", icon: "🧴", status: "In Stock", supplier: "Sigma-Aldrich", notes: "Store at room temp." },
        { name: "Trypsin-EDTA", icon: "🧪", status: "Low Stock", supplier: "Corning", notes: "Order more for next month." }
    ],
    supplies: [],
    theme: 'dark'
};

// DOM Elements
const monthYearDisplay = document.getElementById('month-year-display');
const calendarGrid = document.getElementById('calendar-grid');
const clockDisplay = document.getElementById('digital-clock');
const bookingModal = document.getElementById('booking-modal');
const bookingForm = document.getElementById('booking-form');
const dateDisplay = document.getElementById('date-display');
const resourceInput = document.getElementById('resource-input');
const maintenanceModal = document.getElementById('maintenance-modal');
const maintenanceForm = document.getElementById('maintenance-form');
const reportIssueBtn = document.getElementById('report-issue-btn');
const maintenanceGrid = document.getElementById('maintenance-grid');
const confirmModal = document.getElementById('confirm-modal');
const toastContainer = document.getElementById('toast-container');

// New Inventory Elements
const mediaGrid = document.getElementById('media-grid');
const reagentsGrid = document.getElementById('reagents-grid');
const suppliesGrid = document.getElementById('supplies-grid');
const mediaModal = document.getElementById('media-modal');
const reagentsModal = document.getElementById('reagents-modal');
const suppliesModal = document.getElementById('supplies-modal');
const mediaForm = document.getElementById('media-form');
const reagentsForm = document.getElementById('reagents-form');
const suppliesForm = document.getElementById('supplies-form');

// --- Utilities ---
function formatTo12Hr(time24) {
    if (!time24) return "";
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

function initTimePicker(containerId, initialTime = "08:00") {
    const container = document.getElementById(containerId);
    if (!container) return;

    const [initH, initM] = initialTime.split(':');
    const h = parseInt(initH);
    const m = initM;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;

    container.innerHTML = `
        <select class="tp-input tp-hour">
            ${Array.from({length: 12}, (_, i) => `<option value="${i+1}" ${h12 === i+1 ? 'selected' : ''}>${i+1}</option>`).join('')}
        </select>
        <span>:</span>
        <select class="tp-input tp-min">
            ${Array.from({length: 60}, (_, i) => `<option value="${String(i).padStart(2, '0')}" ${m === String(i).padStart(2, '0') ? 'selected' : ''}>${String(i).padStart(2, '0')}</option>`).join('')}
        </select>
        <select class="tp-input tp-ampm">
            <option value="AM" ${ampm === 'AM' ? 'selected' : ''}>AM</option>
            <option value="PM" ${ampm === 'PM' ? 'selected' : ''}>PM</option>
        </select>
    `;
}

function getTimePickerValue(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return "00:00";
    let h = parseInt(container.querySelector('.tp-hour').value);
    const m = container.querySelector('.tp-min').value;
    const ampm = container.querySelector('.tp-ampm').value;

    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;

    return `${String(h).padStart(2, '0')}:${m}`;
}

let pendingDeleteId = null;
let pendingDeleteCategory = null; // 'maintenance', 'media', 'reagents', 'booking'
let pendingDeleteDateKey = null; // for bookings

async function init() {
    updateStatus('Connecting...', 'warning');

    if (!db) {
        console.warn('Supabase not initialized. Using local storage fallback.');
        loadStateLocal();
    } else {
        await fetchFullState();
    }

    applyTheme(state.theme);
    renderCalendar();
    renderMaintenance();
    renderInventory('media');
    renderInventory('reagents');
    renderInventory('supplies');
    updateClock();
    setInterval(updateClock, 1000);
    setupEventListeners();
    setupRealtimeSubscriptions();
    initTimePicker('start-time-picker', '08:00');
    initTimePicker('end-time-picker', '17:00');
}

function updateStatus(text, type = 'success') {
    const statusText = document.getElementById('status-text');
    const statusPulse = document.getElementById('status-pulse');
    if (statusText) statusText.textContent = text;
    if (statusPulse) {
        statusPulse.className = `pulse-dot ${type === 'success' ? 'green' : (type === 'warning' ? 'yellow' : 'red')}`;
    }
}

function applyTheme(theme) {
    state.theme = theme;
    document.body.classList.toggle('light-theme', theme === 'light');

    // Update Header Toggle UI
    const toggleBtn = document.getElementById('header-theme-toggle');
    if (toggleBtn) {
        const icon = toggleBtn.querySelector('.icon');
        const label = toggleBtn.querySelector('.label');
        if (theme === 'light') {
            icon.textContent = '☀️';
            label.textContent = 'Daylight Mode';
        } else {
            icon.textContent = '🌙';
            label.textContent = 'Midnight Mode';
        }
    }
    saveStateLocal();
}

function updateClock() {
    const now = new Date();
    clockDisplay.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

    }
    renderAgenda(todayKey);
}

function renderAgenda(dateKey) {
    const agendaList = document.getElementById('agenda-list');
    const agendaDateLabel = document.getElementById('agenda-date-label');
    if (!agendaList) return;

    const dayBookings = state.bookings[dateKey] || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateKey);
    const isPast = targetDate < today;

    // Format label
    const dateObj = new Date(dateKey);
    agendaDateLabel.textContent = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    if (dayBookings.length === 0) {
        agendaList.innerHTML = `<div class="empty-agenda">No reservations for ${dateKey === formatDateKey(new Date()) ? 'today' : 'this date'}.</div>`;
        return;
    }

    // Sort by start time
    const sorted = [...dayBookings].sort((a, b) => a.start_time.localeCompare(b.start_time));

    agendaList.innerHTML = '';
    sorted.forEach((booking) => {
        const item = document.createElement('div');
        item.className = `agenda-item ${isPast ? 'locked-entry' : ''}`;

        item.innerHTML = `
            ${!isPast ? `<button class="remove-btn" data-category="booking" data-id="${booking.id}" data-datekey="${dateKey}" title="Cancel Reservation">×</button>` : ''}
            <span class="agenda-time">${formatTo12Hr(booking.start_time)} - ${formatTo12Hr(booking.end_time)}</span>
            <span class="agenda-resource">${booking.resource}</span>
            <span class="agenda-user">${booking.user_name}</span>
        `;
        agendaList.appendChild(item);
    });
}

async function removeBooking(id, dateKey) {
    updateStatus('Syncing...', 'warning');
    const { error } = await db.from('bookings').delete().eq('id', id);
    if (!error) {
        showToast('Reservation cancelled');
        updateStatus('Synced', 'success');
    } else {
        console.error('Supabase error:', JSON.stringify(error)); showToast('Sync Failed: ' + (error?.message || 'Unknown'), 'error');
        updateStatus('Error', 'red');
    }
}

function renderMaintenance() {
    if (!maintenanceGrid) return;
    maintenanceGrid.innerHTML = '';

    state.maintenance.forEach((item) => {
        const card = document.createElement('div');
        card.className = `status-card glass ${item.status === 'offline' ? 'maintenance' : ''}`;

        const statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1);
        const statusClass = item.status === 'online' ? 'online' : 'offline';

        card.innerHTML = `
            <div class="status-header">
                <span class="status-tag ${statusClass}">${statusLabel}</span>
                <div class="header-actions">
                    <span class="equipment-icon">${item.icon}</span>
                    <button class="remove-btn" data-category="maintenance" data-id="${item.id}" title="Remove Equipment">×</button>
                </div>
            </div>
            <h3>${item.name}</h3>
            <p class="supplier-text"><strong>Supplier:</strong> ${item.supplier || 'Internal / Not Specified'}</p>
            <p class="notes-text">${item.notes}</p>
            ${item.eta ? `<p class="eta">Expected Up: ${item.eta}</p>` : ''}
        `;
        maintenanceGrid.appendChild(card);
    });
}

function renderInventory(category) {
    const grid = document.getElementById(`${category}-grid`);
    if (!grid) return;
    grid.innerHTML = '';

    state[category].forEach((item) => {
        const card = document.createElement('div');
        const statusClass = item.status.toLowerCase().replace(/ /g, '-');
        card.className = `status-card glass inventory-card ${statusClass}`;

        card.innerHTML = `
            <div class="status-header">
                <span class="status-tag tag-${statusClass}">${item.status}</span>
                <div class="header-actions">
                    <span class="equipment-icon">${item.icon}</span>
                    <button class="remove-btn" data-category="${category}" data-id="${item.id}" title="Remove Item">×</button>
                </div>
            </div>
            <h3>${item.name}</h3>
            <p class="supplier-text"><strong>Supplier:</strong> ${item.supplier || 'Not Specified'}</p>
            ${category === 'supplies' ? `<p class="unit-cost">&#8369; ${item.unit_cost || '0.00'}</p>` : ''}
            <p class="notes-text">${item.notes || item.quantity || ''}</p>
        `;
        grid.appendChild(card);
    });
}

function removeMaintenance(id) {
    const item = state.maintenance.find(i => i.id === id);
    if (!item) return;
    pendingDeleteId = id;
    pendingDeleteCategory = 'maintenance';
    const msg = document.getElementById('confirm-message');
    msg.textContent = `Are you sure you want to remove ${item.name} from the diagnostics log?`;
    confirmModal.classList.add('active');
}

function removeInventory(category, id) {
    const item = state[category].find(i => i.id === id);
    if (!item) return;
    pendingDeleteId = id;
    pendingDeleteCategory = category;
    const msg = document.getElementById('confirm-message');
    msg.textContent = `Are you sure you want to remove ${item.name} from ${category}?`;
    confirmModal.classList.add('active');
}

function removeBookingUI(dateKey, id) {
    const booking = (state.bookings[dateKey] || []).find(b => b.id === id);
    if (!booking) return;

    pendingDeleteId = id;
    pendingDeleteDateKey = dateKey;
    pendingDeleteCategory = 'booking';

    const msg = document.getElementById('confirm-message');
    msg.textContent = `Are you sure you want to cancel the reservation for ${booking.resource} on ${dateKey}?`;
    confirmModal.classList.add('active');
}

function showToast(message, type = 'success') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : '⚠️'}</span> ${message}`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function renderEventsForDay(dateKey) {
    const eventContainer = document.getElementById(`events-${dateKey}`);
    if (!eventContainer || !state.bookings[dateKey]) return;

    eventContainer.innerHTML = '';
    state.bookings[dateKey].forEach(booking => {
        const pill = document.createElement('div');
        pill.className = 'event-pill';
        // Display [Time] Name - Resource
        pill.textContent = `${formatTo12Hr(booking.start_time)} | ${booking.user_name}`;
        pill.title = `${booking.user_name} reserved ${booking.resource} from ${formatTo12Hr(booking.start_time)} to ${formatTo12Hr(booking.end_time)}`;
        eventContainer.appendChild(pill);
    });
}

function openBookingModal(date) {
    state.selectedDate = date;
    dateDisplay.value = date.toDateString();
    bookingModal.classList.add('active');
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function setupEventListeners() {
    document.getElementById('prev-month').addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('next-month').addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() + 1);
        renderCalendar();
    });

    // Navigation Switching
    const navDashboard = document.getElementById('nav-dashboard');
    const navMaintenance = document.getElementById('nav-maintenance');
    const scheduleView = document.getElementById('schedule-view');
    const maintenanceView = document.getElementById('maintenance-view');
    const pageTitle = document.getElementById('page-title');

    // Centralized Navigation Switching
    const navItems = {
        'nav-dashboard': { view: 'schedule-view', title: 'Laboratory Timeline' },
        'nav-media': { view: 'media-view', title: 'Media Inventory', render: () => renderInventory('media') },
        'nav-reagents': { view: 'reagents-view', title: 'Chemicals & Reagents', render: () => renderInventory('reagents') },
        'nav-supplies': { view: 'supplies-view', title: 'Supplies & Materials', render: () => renderInventory('supplies') },
        'nav-maintenance': { view: 'maintenance-view', title: 'Hardware Diagnostics', render: () => renderMaintenance() }
    };

    Object.keys(navItems).forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                // Update UI state
                Object.keys(navItems).forEach(key => {
                    document.getElementById(key).classList.remove('active');
                    document.getElementById(navItems[key].view).classList.add('hidden');
                });

                btn.classList.add('active');
                document.getElementById(navItems[id].view).classList.remove('hidden');
                document.getElementById('page-title').textContent = navItems[id].title;
                if (navItems[id].render) navItems[id].render();
            });
        }
    });

    // Modal Listeners
    const setupModal = (btnId, modalId, closeId, cancelId) => {
        const btn = document.getElementById(btnId);
        const modal = document.getElementById(modalId);
        if (btn) btn.addEventListener('click', () => modal.classList.add('active'));
        if (document.getElementById(closeId)) document.getElementById(closeId).addEventListener('click', () => modal.classList.remove('active'));
        if (document.getElementById(cancelId)) document.getElementById(cancelId).addEventListener('click', () => modal.classList.remove('active'));
    };

    setupModal('add-media-btn', 'media-modal', 'close-media-modal', 'cancel-media');
    setupModal('add-reagent-btn', 'reagents-modal', 'close-reagents-modal', 'cancel-reagent');
    setupModal('add-supply-btn', 'supplies-modal', 'close-supplies-modal', 'cancel-supply');
    setupModal('report-issue-btn', 'maintenance-modal', 'close-maintenance-modal', 'cancel-maintenance');

    // Theme Toggle Listener (Header Wrapper)
    const headerToggle = document.getElementById('header-theme-toggle');
    if (headerToggle) {
        headerToggle.addEventListener('click', () => {
            const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
            applyTheme(nextTheme);
            showToast(`Laboratory switched to ${nextTheme === 'dark' ? 'Midnight' : 'Daylight'} mode`);
        });
    }

    // Form Submissions
    mediaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        updateStatus('Syncing...', 'warning');
        const newItem = {
            name: document.getElementById('media-name').value,
            icon: document.getElementById('media-icon').value,
            status: document.getElementById('media-status').value,
            supplier: document.getElementById('media-supplier').value,
            notes: document.getElementById('media-notes').value
        };
        const { error } = await db.from('media').insert([newItem]);
        if (!error) {
            mediaModal.classList.remove('active');
            mediaForm.reset();
            showToast('Media Inventory Updated');
            updateStatus('Synced', 'success');
        } else {
            console.error('Supabase error:', JSON.stringify(error)); showToast('Sync Failed: ' + (error?.message || 'Unknown'), 'error');
            updateStatus('Error', 'red');
        }
    });

        }
    });

    suppliesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        updateStatus('Syncing...', 'warning');
        const newItem = {
            name: document.getElementById('supply-name').value,
            category: document.getElementById('supply-category').value,
            quantity: document.getElementById('supply-quantity').value,
            unit_cost: parseFloat(document.getElementById('supply-unit-cost').value) || 0,
            supplier: document.getElementById('supply-supplier').value
        };
        const { error } = await db.from('supplies').insert([newItem]);
        if (!error) {
            suppliesModal.classList.remove('active');
            suppliesForm.reset();
            showToast('Supply Catalog Updated');
            updateStatus('Synced', 'success');
        } else {
            console.error('Supabase error:', JSON.stringify(error)); showToast('Sync Failed: ' + (error?.message || 'Unknown'), 'error');
            updateStatus('Error', 'red');
        }
    });

    maintenanceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        updateStatus('Syncing...', 'warning');
        const newItem = {
            name: document.getElementById('maint-name').value,
            icon: document.getElementById('maint-icon').value,
            status: document.getElementById('maint-status').value,
            supplier: document.getElementById('maint-supplier').value,
            notes: document.getElementById('maint-notes').value
        };
        const { error } = await db.from('maintenance').insert([newItem]);
        if (!error) {
            maintenanceModal.classList.remove('active');
            maintenanceForm.reset();
            showToast('System Diagnostics Updated');
            updateStatus('Synced', 'success');
        } else {
            console.error('Supabase error:', JSON.stringify(error)); showToast('Sync Failed: ' + (error?.message || 'Unknown'), 'error');
            updateStatus('Error', 'red');
        }
    });

    // Global Event Delegation (for Deletion)
    document.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-btn');
        if (removeBtn) {
            const id = removeBtn.getAttribute('data-id');
            const category = removeBtn.getAttribute('data-category');

            if (category === 'maintenance') {
                removeMaintenance(id);
            } else if (category === 'booking') {
                const dateKey = removeBtn.getAttribute('data-datekey');
                removeBookingUI(dateKey, id);
            } else {
                removeInventory(category, id);
            }
        }
    });

    // Confirmation Modal Listeners
    document.getElementById('confirm-cancel').addEventListener('click', () => {
        confirmModal.classList.remove('active');
        pendingDeleteId = null;
        pendingDeleteCategory = null;
        pendingDeleteDateKey = null;
    });

    document.getElementById('confirm-yes').addEventListener('click', async () => {
        if (pendingDeleteId !== null && pendingDeleteCategory !== null) {
            updateStatus('Syncing...', 'warning');
            const table = pendingDeleteCategory === 'booking' ? 'bookings' : pendingDeleteCategory;
            const { error } = await db.from(table).delete().eq('id', pendingDeleteId);

            if (!error) {
                showToast('Item removed successfully');
                updateStatus('Synced', 'success');
            } else {
                console.error('Supabase error:', JSON.stringify(error)); showToast('Sync Failed: ' + (error?.message || 'Unknown'), 'error');
                updateStatus('Error', 'red');
            }
        }
        confirmModal.classList.remove('active');
        pendingDeleteId = null;
        pendingDeleteCategory = null;
        pendingDeleteDateKey = null;
    });

    document.getElementById('close-modal').addEventListener('click', () => bookingModal.classList.remove('active'));
    document.getElementById('cancel-booking').addEventListener('click', () => bookingModal.classList.remove('active'));

    // OT Requirement Check
    document.addEventListener('change', (e) => {
        if (e.target.closest('.time-picker select')) {
            checkOTRequirement();
        }
    });

    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        updateStatus('Syncing...', 'warning');

        const dateKey = formatDateKey(state.selectedDate);
        const startTime = getTimePickerValue('start-time-picker');
        const endTime = getTimePickerValue('end-time-picker');
        const studentName = document.getElementById('student-name').value;
        const resource = resourceInput.value;

        const newBooking = {
            date_key: dateKey,
            resource: resource,
            start_time: startTime,
            end_time: endTime,
            user_name: studentName
        };

        const { error } = await db.from('bookings').insert([newBooking]);
        if (!error) {
            showToast('Booking Successful');
            updateStatus('Synced', 'success');
            bookingModal.classList.remove('active');
            bookingForm.reset();
        } else {
            console.error('Supabase error:', JSON.stringify(error)); showToast('Sync Failed: ' + (error?.message || 'Unknown'), 'error');
            updateStatus('Error', 'red');
        }
    });
}

function checkOTRequirement() {
    const startTime = getTimePickerValue('start-time-picker');
    const endTime = getTimePickerValue('end-time-picker');
    const otWarning = document.getElementById('ot-warning');

    if (!startTime || !endTime || !otWarning) return;

    // Check if any part of the session is after 17:00 (5:00 PM)
    const isOT = startTime >= '17:00' || (endTime > '17:00' || (endTime < '08:00' && endTime !== ''));

    otWarning.classList.toggle('hidden', !isOT);
}

async function fetchFullState() {
    updateStatus('Fetching...', 'warning');
    try {
        const [bookings, maintenance, media, reagents, supplies] = await Promise.all([
            db.from('bookings').select('*'),
            db.from('maintenance').select('*'),
            db.from('media').select('*'),
            db.from('reagents').select('*'),
            db.from('supplies').select('*')
        ]);

        state.bookings = {};
        bookings.data.forEach(b => {
            if (!state.bookings[b.date_key]) state.bookings[b.date_key] = [];
            state.bookings[b.date_key].push(b);
        });
        state.maintenance = maintenance.data;
        state.media = media.data;
        state.reagents = reagents.data;
        state.supplies = supplies.data || [];

        updateStatus('Synced', 'success');
    } catch (err) {
        updateStatus('Offline', 'red');
        loadStateLocal();
    }
}

function setupRealtimeSubscriptions() {
    if (!db) return;

    db.channel('lab_changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
            fetchFullState().then(() => {
                renderCalendar();
                renderMaintenance();
                renderInventory('media');
                renderInventory('reagents');
                renderInventory('supplies');
            });
        })
        .subscribe();
}

function saveStateLocal() {
    localStorage.setItem('me4ph_theme', state.theme);
}

function loadStateLocal() {
    const savedTheme = localStorage.getItem('me4ph_theme');
    if (savedTheme) state.theme = savedTheme;
}

init();
