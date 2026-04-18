// --- ME4PH Lab Management Dashboard Core Logic ---

const state = {
    selectedDate: null,
    viewDate: new Date(2026, 3, 1), // Default to April 2026 for now
    bookings: JSON.parse(localStorage.getItem('me4ph_bookings')) || {},
    editingIdx: null
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
const statTotalBookings = document.getElementById('stat-total-bookings');
const statPeakItem = document.getElementById('stat-peak-item');
const statUtilPercent = document.getElementById('stat-util-percent');
const statUtilBar = document.getElementById('stat-util-bar');

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
    if (!statTotalBookings) return;
    
    let total = 0;
    const equipCounts = {};
    
    Object.values(state.bookings).forEach(dayList => {
        total += dayList.length;
        dayList.forEach(b => {
            equipCounts[b.equipment] = (equipCounts[b.equipment] || 0) + 1;
        });
    });

    statTotalBookings.textContent = total;

    // Peak Equipment
    let peak = "N/A";
    let max = 0;
    for (const [name, count] of Object.entries(equipCounts)) {
        if (count > max) {
            max = count;
            peak = name;
        }
    }
    statPeakItem.textContent = peak;

    // Simulated Utilization (assume 50 total slots per month is '100%')
    const utilVal = Math.min(Math.round((total / 50) * 100), 100);
    statUtilPercent.textContent = `${utilVal}%`;
    statUtilBar.style.width = `${utilVal}%`;
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
}

function renderTimeline(dateString, isPast) {
    dailyTimeline.classList.remove('hidden');
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

// Initialization
setInterval(updateClock, 1000);
updateClock();
handleOTCheck();
renderCalendar();
updateAnalytics();
