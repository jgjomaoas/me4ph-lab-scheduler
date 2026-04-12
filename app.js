// --- ME4PH Lab Management Dashboard Core Logic ---

const state = {
    isAuthenticated: false,
    currentTab: 'media',
    bookingTime: '08:00'
};

// DOM Elements
const stageClock = document.getElementById('stage-clock');
const bookingTimeInput = document.getElementById('booking-time');
const otWarning = document.getElementById('ot-warning');
const tabTriggers = document.querySelectorAll('.tab-trigger');
const inventoryLists = document.getElementById('inventory-lists');
const accessGate = document.getElementById('access-gate');
const supervisorPass = document.getElementById('supervisor-pass');
const authBtn = document.getElementById('auth-btn');

/**
 * Updates the digital clock in the dashboard header.
 */
function updateClock() {
    const now = new Date();
    if (stageClock) {
        stageClock.textContent = now.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
    }
}

/**
 * Handles the logic for the Overtime Warning.
 * Displays an amber warning if the selected time is 17:00 or later.
 */
function handleOTCheck() {
    const time = bookingTimeInput.value;
    const hour = parseInt(time.split(':')[0]);
    
    // logic: post-17:00 sessions require OT permit
    if (hour >= 17) {
        otWarning.classList.remove('hidden');
    } else {
        otWarning.classList.add('hidden');
    }
}

/**
 * Manages tab switching in the inventory module.
 */
function switchTab(tabId) {
    state.currentTab = tabId;
    
    // Update Trigger UI
    tabTriggers.forEach(trigger => {
        if (trigger.dataset.tab === tabId) {
            trigger.classList.add('active');
        } else {
            trigger.classList.remove('active');
        }
    });

    // Update Content Visibility
    const containers = ['media-list', 'reagents-list', 'supplies-list'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (id === `${tabId}-list`) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

/**
 * Handles supervisor authentication logic.
 */
function handleAuth() {
    const password = supervisorPass.value.trim();
    const targetPass = 'rdflores3'; // Hardcoded supervisor gate

    if (password === targetPass) {
        state.isAuthenticated = true;
        inventoryLists.classList.remove('locked-blur');
        accessGate.classList.add('hidden');
        showToast('System Unlocked. Supervisor access granted.', 'success');
    } else {
        supervisorPass.classList.add('shake');
        setTimeout(() => supervisorPass.classList.remove('shake'), 500);
        supervisorPass.value = '';
        showToast('Invalid Password. Authorization denied.', 'error');
    }
}

/**
 * Simple toast notification system.
 */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
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

// Event Listeners
if (bookingTimeInput) {
    bookingTimeInput.addEventListener('input', handleOTCheck);
}

tabTriggers.forEach(trigger => {
    trigger.addEventListener('click', () => switchTab(trigger.dataset.tab));
});

if (authBtn) {
    authBtn.addEventListener('click', handleAuth);
}

if (supervisorPass) {
    supervisorPass.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAuth();
    });
}

// Global "Shake" animation for errors
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .shake { animation: shake 0.4s ease-in-out; border-color: #ef4444 !important; }
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-8px); }
        75% { transform: translateX(8px); }
    }
`;
document.head.appendChild(style);

// Initialization
setInterval(updateClock, 1000);
updateClock();
handleOTCheck(); // Initial check for default value
