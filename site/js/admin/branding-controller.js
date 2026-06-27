import { apiJson } from '../api-client.js';
import { byId } from '../dom.js';
import { adminState, ENDPOINTS, jsonRequest } from './core.js';
import { bindUpload } from './upload.js';
import { setBusy, showToast } from './ui.js';

const FIELDS = Object.freeze({
    'company-name-input': 'companyName', 'tagline-input': 'tagline', 'watermark-input': 'watermarkText',
    'logo-text-input': 'logoText', 'logo-url-input': 'logoUrl', 'background-url-input': 'backgroundUrl',
    'schedule-title-input': 'scheduleTitle',
    'ticker-label-input': 'tickerLabel', 'partner-label-input': 'partnerLabel', 'live-title-input': 'liveTitle',
    'live-source-input': 'liveSource', 'live-youtube-url-input': 'liveYoutubeUrl',
    'live-desc-input': 'liveDescription', 'loop-title-input': 'loopTitle', 'loop-desc-input': 'loopDescription',
    'legal-name-input': 'legalName', 'legal-email-input': 'legalEmail', 'legal-cnpj-input': 'legalCnpj',
    'legal-city-input': 'legalCity', 'legal-phone-input': 'legalPhone',
});

export function createBrandingAdminController({ onMutation }) {
    function initialize() {
        const form = byId('branding-form');
        form.addEventListener('input', () => {
            byId('branding-save-state').textContent = 'Alterações ainda não salvas';
            updatePreview();
            updateLiveSourceFields();
        });
        byId('live-source-input').addEventListener('change', updateLiveSourceFields);
        form.addEventListener('submit', save);
        bindUpload({
            fileId: 'logo-file-upload', targetId: 'logo-url-input', statusId: 'logo-upload-status',
            endpoint: '/api/upload/image', valueKey: 'url',
            onComplete: (file) => showToast('Logo enviado', file.name),
            onError: (error) => showToast('Falha no upload', error.message, 'error'),
        });
        bindUpload({
            fileId: 'background-file-upload', targetId: 'background-url-input', statusId: 'background-upload-status',
            endpoint: '/api/upload/image', valueKey: 'url',
            onComplete: (file) => showToast('Fundo enviado', file.name),
            onError: (error) => showToast('Falha no upload do fundo', error.message, 'error'),
        });
    }

    async function load() {
        adminState.branding = await apiJson(ENDPOINTS.branding);
        Object.entries(FIELDS).forEach(([id, key]) => { byId(id).value = adminState.branding[key] || ''; });
        byId('branding-save-state').textContent = 'Nenhuma alteração pendente';
        updateLiveSourceFields();
        updatePreview();
    }

    async function save(event) {
        event.preventDefault();
        const form = event.currentTarget;
        setBusy(form, true);
        const payload = Object.fromEntries(Object.entries(FIELDS).map(([id, key]) => [key, byId(id).value.trim()]));
        if (payload.liveSource !== 'youtube') payload.liveYoutubeUrl = '';
        try {
            adminState.branding = await apiJson(ENDPOINTS.branding, jsonRequest('PUT', payload));
            byId('branding-save-state').textContent = 'Configurações salvas';
            await onMutation();
            showToast('Marca e sinal atualizados', 'A configuração pública foi persistida.');
        } catch (error) {
            showToast('Não foi possível salvar as configurações', error.message, 'error');
        } finally {
            setBusy(form, false);
        }
    }

    function updatePreview() {
        const url = byId('logo-url-input').value.trim();
        const image = byId('brand-preview-image');
        const text = byId('brand-preview-text');
        text.textContent = byId('company-name-input').value.trim() || byId('logo-text-input').value.trim() || 'TV Carlos';
        image.classList.toggle('hidden', !url);
        text.classList.toggle('hidden', Boolean(url));
        if (url) image.src = url;
        image.onerror = () => { image.classList.add('hidden'); text.classList.remove('hidden'); };
    }

    function updateLiveSourceFields() {
        const source = byId('live-source-input').value;
        const input = byId('live-youtube-url-input');
        const group = byId('live-youtube-url-group');
        const usesYouTube = source === 'youtube';
        input.required = false;
        input.disabled = !usesYouTube;
        group.style.opacity = usesYouTube ? '1' : '.58';
    }

    return { initialize, load };
}
