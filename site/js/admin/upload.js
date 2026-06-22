import { apiFetch } from '../api-client.js';
import { byId } from '../dom.js';

export function bindUpload({ fileId, targetId, statusId, endpoint, valueKey, onComplete, onError }) {
    byId(fileId).addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const status = byId(statusId);
        status.textContent = `Enviando ${file.name}…`;
        status.dataset.state = 'loading';
        const body = new FormData();
        body.append('file', file);
        try {
            const response = await apiFetch(endpoint, { method: 'POST', body });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error?.message || 'Falha no upload.');
            const target = byId(targetId);
            target.value = payload[valueKey];
            target.dispatchEvent(new Event('input', { bubbles: true }));
            status.textContent = 'Upload concluído e validado.';
            status.dataset.state = 'success';
            onComplete?.(file);
        } catch (error) {
            status.textContent = error.message;
            status.dataset.state = 'error';
            onError?.(error);
        } finally {
            event.target.value = '';
        }
    });
}
