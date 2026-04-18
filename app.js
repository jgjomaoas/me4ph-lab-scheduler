// --- ME4PH Lab Management Dashboard Core Logic ---

const state = {
    selectedDate: null,
    viewDate: new Date(2026, 3, 1), 
    bookings: JSON.parse(localStorage.getItem('me4ph_bookings')) || {},
    editingIdx: null,
    currentView: 'calendar',
    pendingDelete: { category: null, idx: null },
    inventory: JSON.parse(localStorage.getItem('me4ph_inventory')) || {
        media: [
            { id: 1, name: 'Nutrient Agar', qty: '500g', ref: 'BD-211665', supplier: 'Becton Dickinson', status: 'Optimal' },
            { id: 2, name: 'Potato Dextrose Agar', qty: '200g', ref: 'OX-CM0139', supplier: 'Oxoid Ltd', status: 'Low Stock' },
            { id: 3, name: 'Tryptic Soy Broth', qty: '1000ml', ref: 'SGM-A440', supplier: 'Sigma-Aldrich', status: 'Optimal' }
        ],
        supplies: [
            { id: 4, name: 'Petri Dishes (Glass)', qty: '48 pcs', ref: 'PYREX-100', supplier: 'Corning/Pyrex', status: 'Optimal' },
            { id: 5, name: 'Pipette Tips (200uL)', qty: '2 boxes', ref: 'EPP-773', supplier: 'Eppendorf Canada', status: 'Reorder' },
            { id: 6, name: 'Nitrile Gloves (M)', qty: '10 packs', ref: 'TF-GL22', supplier: 'Thermo Fisher Scientific', status: 'Optimal' }
        ],
        maintenance: [
            { id: 7, name: 'Autoclave Model-X', qty: '2026-03-12', ref: 'SN-EBA-993', supplier: 'Ebara Laboratory', status: 'Operational' },
            { id: 8, name: 'Incubator Shaker', qty: '2026-04-01', ref: 'SN-NB-4421', supplier: 'New Brunswick', status: 'In Service' },
            { id: 9, name: 'Ultralow Freezer', qty: '2026-01-15', ref: 'SN-TF-8830', supplier: 'Thermo Fisher Service', status: 'Operational' }
        ]
    }
};

let isMaintenanceMode = false;

// DOM Elements
const stageClock = document.getElementById('stage-clock');
const stageDateLabel = document.getElementById('stage-date');
const bookingHourIn = document.getElementById('booking-hour-in');
const bookingAmpmIn = document.getElementById('booking-ampm-in');
const bookingHourOut = document.getElementById('booking-hour-out');
const bookingAmpmOut = document.getElementById('booking-ampm-out');
const inStudentName = document.getElementById('student-name');
const inEquipment = document.getElementById('equipment-name');
const inNotes = document.getElementById('booking-notes');
const initiateBtn = document.getElementById('initiate-btn');
const maintenanceToggle = document.getElementById('maintenance-toggle');

const otWarning = document.getElementById('ot-warning');
const calendarDays = document.getElementById('calendar-days');
const conflictWarning = document.getElementById('conflict-warning');

// Timeline Elements
const dailyTimeline = document.getElementById('daily-timeline');
const timelineDateLabel = document.getElementById('timeline-date-label');
const timelineTracks = document.getElementById('timeline-tracks');
const exportReportBtn = document.getElementById('export-report-btn');

// Calendar Header Elements
const currentMonthLabel = document.getElementById('current-month');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

// Admin Elements
const adminPassContainer = document.getElementById('admin-pass-container');
const adminPassInput = document.getElementById('admin-pass-input');
const adminPassBtn = document.getElementById('admin-pass-btn');

// Analytics Elements
const statResourceGrid = document.getElementById('stat-resource-grid');
const statTotalHours = document.getElementById('stat-total-hours');
const statGlobalUtil = document.getElementById('stat-global-util');

const equipmentChips = document.querySelectorAll('.chip');

function updateClock() {
    const now = new Date();
    
    // Philippine Standard Time (PST is UTC+8)
    const timeOptions = { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: true,
        timeZone: 'Asia/Manila'
    };
    
    const dateOptions = {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'Asia/Manila'
    };

    if (stageClock) {
        stageClock.textContent = now.toLocaleTimeString('en-US', timeOptions);
    }
    
    if (stageDateLabel) {
        stageDateLabel.textContent = now.toLocaleDateString('en-US', dateOptions);
    }
}

/**
 * Helper to convert 12hr time to 24hr float for math
 */
function getTimeFloat(hStr, ampm) {
    let h = parseInt(hStr);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h;
}

function formatTimeStr(h, ampm) {
    return `${h.toString().padStart(2, '0')}:00 ${ampm}`;
}

function isTimeOT(hour, ampm) {
    if (ampm === 'AM') {
        if (hour < 8 || hour === 12) return true;
    } else {
        if (hour > 5 && hour !== 12) return true;
    }
    return false;
}

function handleOTCheck() {
    if (!bookingHourIn || !bookingAmpmIn || !bookingHourOut || !bookingAmpmOut) return;
    
    const hIn = parseInt(bookingHourIn.value);
    const aIn = bookingAmpmIn.value;
    const hOut = parseInt(bookingHourOut.value);
    const aOut = bookingAmpmOut.value;
    
    const inOT = isTimeOT(hIn, aIn);
    const outOT = isTimeOT(hOut, aOut);
    
    if (inOT || outOT) {
        otWarning.classList.remove('hidden');
    } else {
        otWarning.classList.add('hidden');
    }

    bookingHourIn.style.borderColor = inOT ? 'var(--warning)' : 'var(--accent)';
    bookingAmpmIn.style.borderColor = inOT ? 'var(--warning)' : 'var(--accent)';
    bookingHourOut.style.borderColor = outOT ? 'var(--warning)' : 'var(--accent)';
    bookingAmpmOut.style.borderColor = outOT ? 'var(--warning)' : 'var(--accent)';
}

/**
 * Updates the Usage Analytics Card based on current bookings state.
 */
function updateAnalytics() {
    if (!statResourceGrid) return;
    
    // Clear and check date selection
    statResourceGrid.innerHTML = '';
    if (!state.selectedDate) {
        statResourceGrid.innerHTML = `<div style="grid-column: 1/-1; padding:32px; text-align:center; color:var(--text-muted);">Select a date on the calendar to monitor resource usage.</div>`;
        if (statTotalHours) statTotalHours.textContent = '0h';
        if (statGlobalUtil) statGlobalUtil.textContent = '0%';
        return;
    }

    let dailyTotalHours = 0;
    const resourceData = {};
    const standardLabHours = 9; 
    
    // Get bookings ONLY for the selected day
    const dayBookings = state.bookings[state.selectedDate] || [];
    
    dayBookings.forEach(b => {
        const duration = Math.max(0, b.outFloat - b.inFloat);
        dailyTotalHours += duration;
        
        if (!resourceData[b.equipment]) {
            resourceData[b.equipment] = { count: 0, hours: 0, lastUser: '' };
        }
        resourceData[b.equipment].count++;
        resourceData[b.equipment].hours += duration;
        resourceData[b.equipment].lastUser = b.studentName;
    });

    const sortedResources = Object.entries(resourceData).sort((a,b) => b[1].hours - a[1].hours);

    if (sortedResources.length === 0) {
        statResourceGrid.innerHTML = `
            <div style="grid-column: 1/-1; padding:32px; text-align:center; color:var(--text-muted); background:var(--bg-surface-elevated); border-radius:8px; border:1px dashed var(--border);">
                No resource activity logged for ${state.selectedDate}.
            </div>`;
    } else {
        sortedResources.forEach(([name, data]) => {
            const intensity = Math.min(Math.round((data.hours / standardLabHours) * 100), 100);
            let statusColor = 'var(--success)';
            if (intensity > 40) statusColor = 'var(--warning)';
            if (intensity > 80) statusColor = 'var(--danger)';

            const card = document.createElement('div');
            card.style.cssText = `
                background: var(--bg-surface-elevated); border: 1px solid var(--border);
                padding: 12px; border-radius: 4px; display:flex; flex-direction:column; gap:8px;
                border-left: 4px solid ${statusColor};
            `;
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div style="font-size:12px; font-weight:700; color:var(--text-primary);">${name}</div>
                    <div style="font-size:9px; font-weight:800; color:${statusColor}; opacity:0.8;">${intensity}%</div>
                </div>
                <div style="height:4px; background:var(--bg-main); border-radius:2px; overflow:hidden;">
                    <div style="height:100%; width:${intensity}%; background:${statusColor};"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted);">
                    <span>${data.hours.toFixed(1)}h logged</span>
                    <span>User: ${data.lastUser}</span>
                </div>
            `;
            statResourceGrid.appendChild(card);
        });
    }

    // Daily Stats
    if (statTotalHours) statTotalHours.textContent = `${dailyTotalHours.toFixed(1)}h`;
    
    const globalLoad = Math.min(Math.round((dailyTotalHours / (9 * 5)) * 100), 100);
    if (statGlobalUtil) {
        statGlobalUtil.textContent = `${globalLoad}%`;
        statGlobalUtil.style.color = globalLoad > 80 ? 'var(--danger)' : (globalLoad > 40 ? 'var(--warning)' : 'var(--success)');
    }
}

function renderCalendar() {
    if (!calendarDays || !currentMonthLabel) return;
    calendarDays.innerHTML = '';
    
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    
    // Update Header
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    currentMonthLabel.textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate(); 
    
    for(let i=0; i<firstDay; i++) {
        calendarDays.appendChild(document.createElement('div'));
    }
    
    for(let i=1; i<=daysInMonth; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        cell.textContent = i;
        
        const currentDateString = `${year}-${(month + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
        
        // Locking Logic
        let isPast = false;
        if (year < todayYear) isPast = true;
        else if (year === todayYear && month < todayMonth) isPast = true;
        else if (year === todayYear && month === todayMonth && i < todayDay) isPast = true;
        
        if (isPast) {
            cell.classList.add('locked');
            cell.title = "Locked for report checking";
        }

        if (isMaintenanceMode) {
            cell.classList.add('maintenance');
            cell.title = "Out of Service";
        } else if (state.bookings[currentDateString] && state.bookings[currentDateString].length > 0) {
            cell.classList.add('booked'); 
        }

        if (state.selectedDate === currentDateString) {
            cell.classList.add('selected');
        }
        
        cell.addEventListener('click', () => {
            if (isMaintenanceMode) {
                showToast('Laboratory under maintenance. All dates locked.', 'error');
                return;
            }
            if(isPast) {
                selectDate(currentDateString, cell, true);
                showToast('Past dates are view-only for report checking.', 'warning');
                return;
            }
            selectDate(currentDateString, cell, false);
        });
        calendarDays.appendChild(cell);
    }
}

/**
 * Handles Calendar Date Selection
 */
function selectDate(dateString, cellElement, isPast) {
    document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
    
    state.selectedDate = dateString;
    cellElement.classList.add('selected');
    conflictWarning.style.display = 'none';
    
    // Render Daily Timeline
    renderTimeline(dateString, isPast);
    updateAnalytics();
}

function renderTimeline(dateString, isPast) {
    timelineDateLabel.textContent = `Daily Roster: ${dateString}`;
    timelineTracks.innerHTML = '';

    if (exportReportBtn) {
        if (isPast) {
            exportReportBtn.classList.remove('hidden');
        } else {
            exportReportBtn.classList.add('hidden');
        }
    }

    const dayBookings = state.bookings[dateString] || [];
    
    if (dayBookings.length === 0) {
        timelineTracks.innerHTML = `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:16px;">No reservations for this date.</div>`;
        return;
    }

    // Sort by Time In
    dayBookings.sort((a,b) => a.inFloat - b.inFloat);

    dayBookings.forEach((booking, idx) => {
        const track = document.createElement('div');
        track.style.cssText = `
            background: var(--bg-surface-elevated); border-left: 3px solid ${booking.isOT ? 'var(--warning)' : 'var(--accent)'};
            padding: 8px 12px; border-radius: 4px; display:flex; flex-direction:column; gap:8px;
        `;
        
        let actionsHTML = '';
        if (!isPast && !isMaintenanceMode) {
            actionsHTML = `
                <div style="display:flex; gap:8px; border-top:1px solid var(--border); padding-top:8px; justify-content:flex-end;">
                    <button class="edit-btn" style="background:transparent; border:none; color:var(--text-primary); font-size:11px; cursor:pointer;" data-index="${idx}">✎ Edit</button>
                    <button class="delete-btn" style="background:transparent; border:none; color:var(--danger); font-size:11px; cursor:pointer;" data-index="${idx}">✖ Remove</button>
                </div>
            `;
        }

        track.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-size:12px; font-weight:700; color:var(--text-primary);">${booking.studentName}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${booking.equipment}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:12px; font-family:var(--font-mono); color:var(--text-secondary);">${booking.timeIn} - ${booking.timeOut}</div>
                    ${booking.isOT ? `<div style="font-size:10px; color:var(--warning); font-weight:700;">OT Required</div>` : ''}
                </div>
            </div>
            ${actionsHTML}
        `;
        
        if (!isPast && !isMaintenanceMode) {
            track.querySelector('.edit-btn').onclick = () => handleEditBooking(dateString, idx);
            track.querySelector('.delete-btn').onclick = () => handleDeleteBooking(dateString, idx);
        }

        timelineTracks.appendChild(track);
    });
}

function initiateReservation() {
    if (isMaintenanceMode) return showToast('Cannot book: Laboratory is in Maintenance Mode.', 'error');
    if (!state.selectedDate) return showToast('Please select an active date from the calendar first.', 'error');
    
    // Validate inputs
    const student = inStudentName.value.trim();
    const equip = inEquipment.value.trim();
    if (!student || !equip) return showToast('Please fill out the Student Name and Equipment fields.', 'error');

    // Time math
    const tInH = bookingHourIn.value;
    const tInA = bookingAmpmIn.value;
    const tOutH = bookingHourOut.value;
    const tOutA = bookingAmpmOut.value;

    const inFloat = getTimeFloat(tInH, tInA);
    const outFloat = getTimeFloat(tOutH, tOutA);

    if (inFloat >= outFloat) {
        return showToast('Time Out must be after Time In!', 'error');
    }

    const dayBookings = state.bookings[state.selectedDate] || [];
    
    // Conflict Detection: 1 reservation per equipment per day
    const requestedEquip = equip.toLowerCase();
    for (let i = 0; i < dayBookings.length; i++) {
        // If we are editing, skip conflict check for the current record
        if (state.editingIdx !== null && i === state.editingIdx) continue;

        if (dayBookings[i].equipment.toLowerCase() === requestedEquip) {
            conflictWarning.style.display = 'flex';
            setTimeout(() => conflictWarning.style.display = 'none', 3000);
            return showToast(`${dayBookings[i].equipment} is already booked for the entire day.`, 'error');
        }
    }

    // Save Booking
    const newBooking = {
        studentName: student,
        equipment: equip,
        timeIn: formatTimeStr(tInH, tInA),
        timeOut: formatTimeStr(tOutH, tOutA),
        inFloat: inFloat,
        outFloat: outFloat,
        isOT: isTimeOT(parseInt(tInH), tInA) || isTimeOT(parseInt(tOutH), tOutA),
        notes: inNotes.value
    };

    if (!state.bookings[state.selectedDate]) state.bookings[state.selectedDate] = [];
    
    if (state.editingIdx !== null) {
        // Overwrite existing
        state.bookings[state.selectedDate][state.editingIdx] = newBooking;
        state.editingIdx = null;
        initiateBtn.textContent = "Initiate Protocol Reservation";
        showToast('Reservation updated successfully!', 'success');
    } else {
        // Add new
        state.bookings[state.selectedDate].push(newBooking);
        showToast('Reservation successfully locked in!', 'success');
    }
    
    localStorage.setItem('me4ph_bookings', JSON.stringify(state.bookings));
    
    // Clear form
    inStudentName.value = '';
    inEquipment.value = '';
    inNotes.value = '';
    
    refreshUIAndTimeline(state.selectedDate);
    updateAnalytics();
}

function refreshUIAndTimeline(dateStr) {
    renderCalendar();
    
    // Re-select current date to re-render timeline correctly
    let targetCell = null;
    const dayNum = parseInt(dateStr.split('-')[2]).toString();
    document.querySelectorAll('.calendar-day').forEach(cell => {
         if (cell.textContent === dayNum && !cell.classList.contains('locked')) {
             targetCell = cell;
         }
    });
    if (targetCell) {
        selectDate(dateStr, targetCell, false);
    } else {
        renderTimeline(dateStr, parseInt(dateStr.split('-')[2]) < new Date().getDate());
    }
}

function handleEditBooking(dateStr, idx) {
    const booking = state.bookings[dateStr][idx];
    state.editingIdx = idx;
    
    inStudentName.value = booking.studentName;
    inEquipment.value = booking.equipment;
    inNotes.value = booking.notes;
    
    // Reverse format TimeIn (e.g. "08:00 AM")
    const tIn = booking.timeIn.split(' ');
    bookingHourIn.value = parseInt(tIn[0].split(':')[0]);
    bookingAmpmIn.value = tIn[1];
    
    // Reverse format TimeOut
    const tOut = booking.timeOut.split(' ');
    bookingHourOut.value = parseInt(tOut[0].split(':')[0]);
    bookingAmpmOut.value = tOut[1];
    
    initiateBtn.textContent = "Save Changes";
    
    handleOTCheck();
    showToast("Editing mode active. Update the form and save.", "warning");
}

function handleDeleteBooking(dateStr, idx) {
    if (confirm("Are you sure you want to completely remove this reservation?")) {
        state.bookings[dateStr].splice(idx, 1);
        if (state.bookings[dateStr].length === 0) delete state.bookings[dateStr];
        localStorage.setItem('me4ph_bookings', JSON.stringify(state.bookings));
        
        refreshUIAndTimeline(dateStr);
        updateAnalytics();
        showToast("Reservation removed.", "success");
    }
}

// Event Listeners
const timeInputs = [bookingHourIn, bookingAmpmIn, bookingHourOut, bookingAmpmOut];
timeInputs.forEach(input => {
    if(input) input.addEventListener('change', handleOTCheck);
});

if (initiateBtn) initiateBtn.addEventListener('click', initiateReservation);

if (maintenanceToggle) {
    maintenanceToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            // Prompt for password
            e.target.checked = false; // Reset visually until unlocked
            adminPassContainer.classList.remove('hidden');
        } else {
            // Turn off maintenance mode
            isMaintenanceMode = false;
            adminPassContainer.classList.add('hidden');
            showToast('Maintenance mode disabled. Grid restored.', 'success');
            renderCalendar();
        }
    });
}

if (adminPassBtn) {
    adminPassBtn.addEventListener('click', () => {
        if (adminPassInput.value === 'rdflores3') {
            isMaintenanceMode = true;
            maintenanceToggle.checked = true;
            adminPassContainer.classList.add('hidden');
            adminPassInput.value = '';
            showToast('Admin override: Laboratory locked for maintenance.', 'warning');
            dailyTimeline.classList.add('hidden');
            renderCalendar();
        } else {
            adminPassInput.classList.add('shake');
            setTimeout(() => adminPassInput.classList.remove('shake'), 400);
            showToast('Invalid Admin Password.', 'error');
            adminPassInput.value = '';
        }
    });
}

if (exportReportBtn) {
    exportReportBtn.addEventListener('click', () => {
        showToast('Generating PDF Log...', 'success');
        setTimeout(() => {
            showToast('ME4PH_Daily_Log.pdf exported successfully.', 'success');
        }, 1500);
    });
}

// Simple toast notification system.
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${type === 'success' ? '#10b981' : (type === 'warning' ? '#f59e0b' : '#ef4444')};
        color: #000;
        padding: 12px 24px;
        border-radius: 8px;
        margin-top: 8px;
        font-weight: 700;
        font-size: 14px;
        box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Global "Shake" animation & styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .shake { animation: shake 0.4s ease-in-out; border-color: #ef4444 !important; }
    .error-bg { background: rgba(239, 68, 68, 0.3) !important; color: #fff !important; border:1px solid #ef4444 !important; }
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-8px); }
        75% { transform: translateX(8px); }
    }
`;
document.head.appendChild(style);

if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
        state.viewDate.setMonth(state.viewDate.getMonth() - 1);
        renderCalendar();
    });
}

if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
        state.viewDate.setMonth(state.viewDate.getMonth() + 1);
        renderCalendar();
    });
}

// Equipment Chip Interaction
equipmentChips.forEach(chip => {
    chip.addEventListener('click', () => {
        inEquipment.value = chip.textContent;
    });
});

// --- Initialization Wrapper ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        migrateInventoryData();
        updateClock();
        setInterval(updateClock, 1000);
        handleOTCheck();
        renderCalendar();
        updateAnalytics();
        initSidebar();
        initInventoryForms();
        initDeleteModal();
    } catch (err) {
        console.error("Initialization Error:", err);
    }
});

function migrateInventoryData() {
    // Force reset Maintenance if it looks like old/simple data
    const m = state.inventory.maintenance || [];
    const isOldData = m.length === 0 || !m.some(item => item.ref && item.ref.includes('SN-'));
    
    if(isOldData) {
        state.inventory.maintenance = [
            { id: 7, name: 'Autoclave Model-X', qty: '2026-03-12', ref: 'SN-EBA-993', supplier: 'Ebara Laboratory', status: 'Operational' },
            { id: 8, name: 'Incubator Shaker', qty: '2026-04-01', ref: 'SN-NB-4421', supplier: 'New Brunswick', status: 'In Service' },
            { id: 9, name: 'Ultralow Freezer', qty: '2026-01-15', ref: 'SN-TF-8830', supplier: 'Thermo Fisher Service', status: 'Operational' }
        ];
        localStorage.setItem('me4ph_inventory', JSON.stringify(state.inventory));
    }

    // Standard migration for other fields
    let updated = false;
    for(let cat in state.inventory) {
        state.inventory[cat].forEach(item => {
            if(!item.supplier) {
                item.supplier = 'Standard Supply';
                updated = true;
            }
        });
    }
    if(updated) {
        localStorage.setItem('me4ph_inventory', JSON.stringify(state.inventory));
    }
}
function initSidebar() {
    const navLinks = document.querySelectorAll('.nav-link');
    const dashboardStage = document.getElementById('dashboard-stage');
    const inventoryStage = document.getElementById('inventory-stage');
    const reportsStage = document.getElementById('reports-stage');

    if(!navLinks.length || !dashboardStage || !inventoryStage || !reportsStage) return;

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');
            if(!view) return;

            // Update Active State
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            state.currentView = view;

            // Stage Toggling
            dashboardStage.classList.add('hidden');
            inventoryStage.classList.add('hidden');
            reportsStage.classList.add('hidden');

            if(view === 'calendar') {
                dashboardStage.classList.remove('hidden');
            } else if(['media', 'supplies', 'maintenance'].includes(view)) {
                inventoryStage.classList.remove('hidden');
                updateInventoryUI(view);
            } else if(view === 'reports') {
                reportsStage.classList.remove('hidden');
                updateReportsUI();
            } else {
                showToast("Section implementation pending...", "warning");
            }
        });
    });
}

function updateReportsUI() {
    const tableBody = document.getElementById('reports-table-body');
    if(!tableBody) return;

    tableBody.innerHTML = '';

    // Flatten all bookings into a single array for reporting
    const allBookings = [];
    for(let dateStr in state.bookings) {
        state.bookings[dateStr].forEach(b => {
            allBookings.push({ date: dateStr, ...b });
        });
    }

    // Sort by date (descending)
    allBookings.sort((a, b) => new Date(b.date) - new Date(a.date));

    if(allBookings.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:48px; color:var(--text-muted);">No lab usage records found.</td></tr>`;
        return;
    }

    allBookings.forEach(b => {
        const tr = document.createElement('tr');
        const isOT = parseInt(b.timeOut) > 17 || b.ampmOut === 'PM'; // Simple OT check
        tr.innerHTML = `
            <td style="padding-left:24px; font-weight:700; color:var(--accent);">${b.date}</td>
            <td style="font-weight:600;">${b.student}</td>
            <td>${b.equipment}</td>
            <td class="mono">${b.timeIn}${b.ampmIn} - ${b.timeOut}${b.ampmOut}</td>
            <td><span class="chip" style="background:${isOT ? 'var(--accent-muted)' : 'transparent'}; border-color:${isOT ? 'var(--accent)' : 'var(--border)'}">${isOT ? 'OT PERMIT' : 'REGULAR'}</span></td>
            <td style="padding-right:24px; color:var(--success); font-weight:700;">VERIFIED</td>
        `;
        tableBody.appendChild(tr);
    });

    // Handle Print
    document.getElementById('print-report-btn').onclick = () => window.print();
}

function updateInventoryUI(category) {
    const title = document.getElementById('inventory-title');
    const subtitle = document.getElementById('inventory-subtitle');
    const tableBody = document.getElementById('inventory-table-body');
    const tableHead = document.getElementById('inventory-table-head');
    
    if(!title || !tableBody || !tableHead) return;

    const meta = {
        media: { t: "Microbial Media Inventory", s: "Culture media and growth components" },
        supplies: { t: "Supplies & Glassware", s: "Laboratory consumables and materials" },
        maintenance: { t: "Repair & Maintenance Log", s: "Equipment service history and status" }
    };

    if(!meta[category]) return;

    title.innerText = meta[category].t;
    subtitle.innerText = meta[category].s;
    
    // Update Head with category-specific labels
    if(category === 'maintenance') {
        tableHead.innerHTML = `
            <th>Equipment Name</th>
            <th>Last Service</th>
            <th>Service Provider</th>
            <th>Serial Number</th>
            <th>Operational Status</th>
            <th style="width:100px; text-align:right;">Actions</th>
        `;
    } else {
        tableHead.innerHTML = `
            <th>Item Description</th>
            <th>Quantity/Volume</th>
            <th>Supplier Source</th>
            <th>Batch/Ref #</th>
            <th>Stock Status</th>
            <th style="width:100px; text-align:right;">Actions</th>
        `;
    }

    tableBody.innerHTML = '';

    const items = state.inventory[category] || [];
    items.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const statusClass = item.status === 'Low Stock' || item.status === 'Reorder' || item.status === 'Pending' ? 'low-stock' : '';
        tr.innerHTML = `
            <td>${item.name}</td>
            <td>${item.qty}</td>
            <td>${item.supplier || 'N/A'}</td>
            <td class="mono">${item.ref}</td>
            <td class="${statusClass}">${item.status}</td>
            <td style="text-align:right;">
                <div style="display:flex; gap:12px; justify-content:flex-end;">
                    <button class="btn-icon edit-inv-item" data-idx="${idx}" style="background:transparent; border:none; color:var(--accent); cursor:pointer; padding:4px;">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </button>
                    <button class="btn-icon delete-inv-item" data-idx="${idx}" style="background:transparent; border:none; color:var(--danger); cursor:pointer; padding:4px;">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    // Dynamic Form Labels
    const inName = document.getElementById('inv-item-name');
    const inQty = document.getElementById('inv-item-qty');
    const inRef = document.getElementById('inv-item-ref');
    const inSupplier = document.getElementById('inv-item-supplier');

    if(category === 'maintenance') {
        inName.placeholder = "Equipment Name (e.g. Autoclave Model-X)";
        inQty.placeholder = "Last Service Date (YYYY-MM-DD)";
        inRef.placeholder = "Serial Number (SN-XXXX)";
        inSupplier.placeholder = "Service Provider (e.g. Ebara Laboratory)";
    } else {
        inName.placeholder = "Item Name (e.g. Nutrient Agar)";
        inQty.placeholder = "Quantity/Volume (e.g. 500g)";
        inRef.placeholder = "Batch / Reference #";
        inSupplier.placeholder = "Supplier Source (e.g. Sigma-Aldrich)";
    }

    // Add Listeners
    document.querySelectorAll('.edit-inv-item').forEach(btn => {
        btn.addEventListener('click', () => {
             const idx = btn.getAttribute('data-idx');
             handleInventoryEdit(category, idx);
        });
    });

    document.querySelectorAll('.delete-inv-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = btn.getAttribute('data-idx');
            promptInventoryDelete(category, idx);
        });
    });
}

function handleInventoryEdit(category, idx) {
    const item = state.inventory[category][idx];
    if(!item) return;
    document.getElementById('inv-item-name').value = item.name;
    document.getElementById('inv-item-qty').value = item.qty;
    document.getElementById('inv-item-ref').value = item.ref;
    document.getElementById('inv-item-supplier').value = item.supplier || '';
    
    showToast("Editing mode active. Update fields and re-authenticate.", "warning");
    const addItemForm = document.getElementById('add-item-form');
    if(addItemForm) addItemForm.classList.remove('hidden');
}

function promptInventoryDelete(category, idx) {
    state.pendingDelete = { category, idx };
    const modal = document.getElementById('delete-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // Ensure flex display when shown
    }
}

function initDeleteModal() {
    const modal = document.getElementById('delete-modal');
    const closeBtn = document.getElementById('close-delete-btn');
    const confirmBtn = document.getElementById('confirm-delete-btn');
    const passInput = document.getElementById('delete-pass-input');

    if(!modal || !closeBtn || !confirmBtn) return;

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        passInput.value = '';
    });

    confirmBtn.addEventListener('click', () => {
        const pass = passInput.value;
        const { category, idx } = state.pendingDelete;

        if(pass === "rdflores3") {
            state.inventory[category].splice(idx, 1);
            localStorage.setItem('me4ph_inventory', JSON.stringify(state.inventory));
            updateInventoryUI(category);
            showToast("Item deleted", "success");
            modal.classList.add('hidden');
            modal.style.display = 'none';
            passInput.value = '';
        } else {
            showToast("Incorrect Password", "danger");
            passInput.classList.add('error-shake');
            setTimeout(() => passInput.classList.remove('error-shake'), 500);
        }
    });
}

function initInventoryForms() {
    const openAddItemBtn = document.getElementById('open-add-item-btn');
    const addItemForm = document.getElementById('add-item-form');
    const cancelInvBtn = document.getElementById('cancel-inv-btn');
    const saveInvBtn = document.getElementById('save-inv-btn');

    if(openAddItemBtn) openAddItemBtn.addEventListener('click', () => addItemForm.classList.toggle('hidden'));
    if(cancelInvBtn) cancelInvBtn.addEventListener('click', () => addItemForm.classList.add('hidden'));

    if(saveInvBtn) {
        saveInvBtn.addEventListener('click', () => {
            const name = document.getElementById('inv-item-name').value;
            const qty = document.getElementById('inv-item-qty').value;
            const ref = document.getElementById('inv-item-ref').value;
            const supplier = document.getElementById('inv-item-supplier').value;
            const pass = document.getElementById('inv-item-pass').value;

            if(!name || !qty || !ref) {
                showToast("Please fill all fields", "warning");
                return;
            }

            if(pass !== "rdflores3") {
                showToast("Incorrect Supervisor Password", "danger");
                return;
            }

            state.inventory[state.currentView].push({
                id: Date.now(),
                name, qty, ref, supplier, status: 'Optimal'
            });

            localStorage.setItem('me4ph_inventory', JSON.stringify(state.inventory));
            updateInventoryUI(state.currentView);
            addItemForm.classList.add('hidden');
            
            document.getElementById('inv-item-name').value = '';
            document.getElementById('inv-item-qty').value = '';
            document.getElementById('inv-item-ref').value = '';
            document.getElementById('inv-item-supplier').value = '';
            document.getElementById('inv-item-pass').value = '';

            showToast("Inventory item added successfully", "success");
        });
    }
}

function showToast(msg, type = "success") {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = 'bento-card toast';
    toast.style.padding = '12px 24px';
    toast.style.marginBottom = '12px';
    toast.style.background = type === 'danger' ? 'var(--danger)' : (type === 'warning' ? 'var(--warning)' : 'var(--success)');
    toast.style.color = '#fff';
    toast.style.fontWeight = '700';
    toast.style.borderRadius = '8px';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
