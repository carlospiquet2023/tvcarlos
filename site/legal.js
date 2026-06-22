import './js/client-guard.js';

async function initializeLegalPage() {
    try {
        const response = await fetch(`/api/branding?t=${Date.now()}`);
        if (!response.ok) return;
        const branding = await response.json();
        const fields = { name: branding.legalName, email: branding.legalEmail, cnpj: branding.legalCnpj, city: branding.legalCity, phone: branding.legalPhone };
        Object.entries(fields).forEach(([key, value]) => {
            if (!value) return;
            document.querySelectorAll(`[data-legal="${key}"]`).forEach((node) => { node.textContent = value; });
        });
        document.getElementById('page-company').textContent = branding.companyName || 'TV Carlos';
        if (branding.logoUrl) {
            const logo = document.getElementById('page-logo');
            logo.src = branding.logoUrl;
            logo.classList.remove('hidden');
        }
    } catch { /* O conteúdo legal padrão permanece disponível. */ }
}

initializeLegalPage();
