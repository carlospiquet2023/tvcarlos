const BLOCKED_KEY_COMBINATIONS = [
    (event) => event.key === 'F12',
    (event) => event.ctrlKey && event.shiftKey && ['I', 'J', 'C'].includes(event.key.toUpperCase()),
    (event) => event.ctrlKey && event.key.toUpperCase() === 'U',
];

let noticeTimer;

function showGuardNotice() {
    let notice = document.getElementById('client-guard-notice');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'client-guard-notice';
        notice.className = 'client-guard-notice';
        notice.setAttribute('role', 'status');
        notice.setAttribute('aria-live', 'polite');
        notice.textContent = 'Atalho indisponível nesta interface.';
        document.body.append(notice);
    }

    notice.classList.add('visible');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove('visible'), 1800);
}

document.addEventListener('keydown', (event) => {
    if (!BLOCKED_KEY_COMBINATIONS.some((matches) => matches(event))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showGuardNotice();
}, { capture: true });

document.addEventListener('contextmenu', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    showGuardNotice();
}, { capture: true });
