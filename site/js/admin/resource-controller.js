import { apiJson } from '../api-client.js';
import { byId, clear, element, icon, setButtonContent } from '../dom.js';
import { getYouTubeVideoId } from '../media-source.js';
import { adminState, ENDPOINTS, jsonRequest } from './core.js';
import { bindUpload } from './upload.js';
import { actionButton, confirmRemoval, renderEmpty, setBusy, showToast } from './ui.js';

const renderers = {};
const loaders = {};

export function createResourceController({ navigate, onMutation }) {
    renderers.programs = renderPrograms;
    renderers.news = renderNews;
    renderers.partners = renderPartners;
    renderers.headerLinks = renderHeaderLinks;
    loaders.programs = () => load('programs');
    loaders.news = () => load('news');
    loaders.partners = () => load('partners');
    loaders.headerLinks = () => load('headerLinks');

    function initialize() {
        bindForms();
        bindRssForm();
        bindPreviews();
        bindUploads();
    }

    async function load(type) {
        const result = await apiJson(ENDPOINTS[type]);
        adminState[type] = type === 'programs' ? result.items : result;
        renderers[type]();
        updateCounters();
    }

    function loadAll() {
        return Promise.all(Object.keys(loaders).map((type) => load(type)));
    }

    function resourceActions(type, item, index, total) {
        const actions = element('div', { className: 'resource-actions' });
        actions.append(
            actionButton('fa-solid fa-arrow-up', 'Mover para cima', () => move(type, index, -1), { disabled: index === 0 }),
            actionButton('fa-solid fa-arrow-down', 'Mover para baixo', () => move(type, index, 1), { disabled: index === total - 1 }),
            actionButton('fa-regular fa-pen-to-square', 'Editar', () => startEditing(type, item)),
            actionButton('fa-regular fa-trash-can', 'Remover', () => remove(type, item), { danger: true }),
        );
        return actions;
    }

    function renderPrograms() {
        const container = byId('active-programs-list');
        if (!adminState.programs.length) return renderEmpty(container, 'Nenhum vídeo cadastrado.');
        clear(container);
        adminState.programs.forEach((program, index) => {
            const content = element('div', { className: 'resource-main' });
            const youtube = Boolean(getYouTubeVideoId(program.video));
            const type = element('small', { className: 'resource-type' });
            type.append(icon(youtube ? 'fa-brands fa-youtube' : 'fa-regular fa-circle-play'), document.createTextNode(youtube ? ' YouTube' : ' Vídeo próprio/URL'));
            content.append(element('strong', { text: program.title }), element('p', { text: program.description || 'Sem descrição' }), type);
            const row = element('article', { className: 'resource-row' });
            row.append(indexBadge(index), content, resourceActions('programs', program, index, adminState.programs.length));
            container.append(row);
        });
    }

    function renderNews() {
        const container = byId('active-news-list');
        if (!adminState.news.length) return renderEmpty(container, 'Nenhuma notícia ativa no rodapé.');
        clear(container);
        adminState.news.forEach((item, index) => {
            const content = element('div', { className: 'resource-main' });
            content.append(element('strong', { text: item.text }), element('small', { text: `${item.text.length} caracteres` }));
            const row = element('article', { className: 'resource-row' });
            row.append(indexBadge(index), content, resourceActions('news', item, index, adminState.news.length));
            container.append(row);
        });
    }

    function renderPartners() {
        const container = byId('active-partners-list');
        if (!adminState.partners.length) return renderEmpty(container, 'Nenhum parceiro ativo.');
        clear(container);
        adminState.partners.forEach((partner, index) => {
            const thumbnail = element('span', { className: 'resource-thumbnail' });
            const image = element('img', { attributes: { src: partner.logoUrl, alt: '' } });
            image.addEventListener('error', () => image.replaceWith(icon('fa-regular fa-image')), { once: true });
            thumbnail.append(image);
            const content = element('div', { className: 'resource-main' });
            content.append(element('strong', { text: `${String(index + 1).padStart(2, '0')} · ${partner.name}` }), element('p', { text: partner.destinationUrl || 'Sem link comercial' }));
            const row = element('article', { className: 'resource-row' });
            row.append(thumbnail, content, resourceActions('partners', partner, index, adminState.partners.length));
            container.append(row);
        });
    }

    function renderHeaderLinks() {
        const container = byId('active-header-links-list');
        if (!adminState.headerLinks.length) return renderEmpty(container, 'Nenhum botão configurado.');
        clear(container);
        adminState.headerLinks.forEach((link, index) => {
            const content = element('div', { className: 'resource-main' });
            content.append(element('strong', { text: `${String(index + 1).padStart(2, '0')} · ${link.name}` }), element('p', { text: link.url }));
            const row = element('article', { className: 'resource-row' });
            row.append(indexBadge(index), content, resourceActions('headerLinks', link, index, adminState.headerLinks.length));
            container.append(row);
        });
    }

    function indexBadge(index) {
        return element('span', { className: 'resource-index', text: String(index + 1).padStart(2, '0') });
    }

    function updateCounters() {
        const values = { programs: adminState.programs.length, news: adminState.news.length, partners: adminState.partners.length };
        const metadata = { programs: ['program', 'vídeo'], news: ['news', 'notícia'], partners: ['partner', 'parceiro'] };
        Object.entries(values).forEach(([key, value]) => {
            const [prefix, noun] = metadata[key];
            byId(`stat-${key}`).textContent = String(value);
            byId(`${prefix}-list-count`).textContent = `${value} ${value === 1 ? noun : `${noun}s`}`;
            byId(`nav-${prefix}-count`).textContent = String(value);
        });
        byId('nav-header-link-count').textContent = String(adminState.headerLinks.length);
        byId('header-link-list-count').textContent = `${adminState.headerLinks.length} de 4`;
        byId('header-link-submit-btn').disabled = adminState.headerLinks.length >= 4 && !adminState.editing.headerLinks;
    }

    async function move(type, index, direction) {
        const items = [...adminState[type]];
        const target = index + direction;
        if (target < 0 || target >= items.length) return;
        [items[index], items[target]] = [items[target], items[index]];
        adminState[type] = items;
        renderers[type]();
        try {
            await apiJson(`${ENDPOINTS[type]}/order`, jsonRequest('PUT', { ids: items.map((item) => item.id) }));
            await onMutation();
            showToast('Ordem atualizada', 'A página pública seguirá esta sequência.');
        } catch (error) {
            showToast('Não foi possível ordenar', error.message, 'error');
            await load(type);
        }
    }

    function startEditing(type, item) {
        adminState.editing[type] = item.id;
        if (type === 'programs') {
            byId('program-title').value = item.title;
            byId('program-category').value = item.category || '';
            byId('program-desc').value = item.description || '';
            byId('program-video').value = item.video;
            configureEditForm('program', 'Editar vídeo', 'Salvar alterações');
            byId('program-video').dispatchEvent(new Event('input'));
            navigate('programs');
        } else if (type === 'news') {
            byId('news-input').value = item.text;
            configureEditForm('news', 'Editar notícia', 'Salvar alteração');
            updateNewsCount();
            navigate('ticker');
        } else if (type === 'partners') {
            byId('partner-name-input').value = item.name;
            byId('partner-logo-input').value = item.logoUrl;
            byId('partner-destination-input').value = item.destinationUrl || '';
            configureEditForm('partner', 'Editar parceiro', 'Salvar parceiro');
            updatePartnerPreview();
            navigate('partners');
        } else {
            byId('header-link-name-input').value = item.name;
            byId('header-link-url-input').value = item.url;
            configureEditForm('header-link', 'Editar botão', 'Salvar botão');
            byId('header-link-submit-btn').disabled = false;
            navigate('navigation');
        }
    }

    function configureEditForm(prefix, title, button) {
        byId(`${prefix}-form-title`).textContent = title;
        setButtonContent(byId(`${prefix}-submit-btn`), 'fa-solid fa-floppy-disk', button);
        byId(`${prefix}-cancel-btn`).classList.remove('hidden');
    }

    function cancelEditing(type) {
        adminState.editing[type] = null;
        const definitions = {
            programs: ['add-program-form', 'program', 'Adicionar vídeo', 'Adicionar vídeo', 'fa-solid fa-plus'],
            news: ['add-news-form', 'news', 'Publicar notícia', 'Publicar no giro', 'fa-solid fa-paper-plane'],
            partners: ['add-partner-form', 'partner', 'Adicionar parceiro', 'Adicionar parceiro', 'fa-solid fa-plus'],
            headerLinks: ['add-header-link-form', 'header-link', 'Adicionar botão', 'Adicionar botão', 'fa-solid fa-plus'],
        };
        const [formId, prefix, title, button, buttonIcon] = definitions[type];
        byId(formId).reset();
        byId(`${prefix}-form-title`).textContent = title;
        setButtonContent(byId(`${prefix}-submit-btn`), buttonIcon, button);
        byId(`${prefix}-cancel-btn`).classList.add('hidden');
        if (type === 'programs') byId('program-video').dispatchEvent(new Event('input'));
        if (type === 'news') updateNewsCount();
        if (type === 'partners') updatePartnerPreview();
        updateCounters();
    }

    async function remove(type, item) {
        const descriptions = {
            news: `a notícia “${item.text}”`, programs: `o vídeo “${item.title}”`,
            partners: `o parceiro “${item.name}”`, headerLinks: `o botão “${item.name}”`,
        };
        if (!(await confirmRemoval(`Deseja realmente remover ${descriptions[type]}? Essa ação será auditada.`))) return;
        try {
            await apiJson(`${ENDPOINTS[type]}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
            await Promise.all([load(type), onMutation()]);
            showToast('Item removido', 'A página pública já recebeu a atualização.');
        } catch (error) {
            showToast('Falha ao remover', error.message, 'error');
        }
    }

    function bindForms() {
        bindForm('programs', 'add-program-form', () => ({ title: byId('program-title').value.trim(), category: byId('program-category').value.trim() || null, description: byId('program-desc').value.trim(), video: byId('program-video').value.trim() }), ['Vídeo adicionado', 'Vídeo atualizado']);
        bindForm('news', 'add-news-form', () => ({ text: byId('news-input').value.trim() }), ['Notícia publicada', 'Notícia atualizada']);
        bindForm('partners', 'add-partner-form', () => ({ name: byId('partner-name-input').value.trim(), logoUrl: byId('partner-logo-input').value.trim(), destinationUrl: byId('partner-destination-input').value.trim() }), ['Parceiro adicionado', 'Parceiro atualizado']);
        bindForm('headerLinks', 'add-header-link-form', () => ({ name: byId('header-link-name-input').value.trim(), url: byId('header-link-url-input').value.trim() }), ['Botão adicionado', 'Botão atualizado']);
        byId('program-cancel-btn').addEventListener('click', () => cancelEditing('programs'));
        byId('news-cancel-btn').addEventListener('click', () => cancelEditing('news'));
        byId('partner-cancel-btn').addEventListener('click', () => cancelEditing('partners'));
        byId('header-link-cancel-btn').addEventListener('click', () => cancelEditing('headerLinks'));
    }

    function bindForm(type, formId, payloadFactory, [createdMessage, updatedMessage]) {
        byId(formId).addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const editing = adminState.editing[type];
            setBusy(form, true);
            try {
                await apiJson(editing ? `${ENDPOINTS[type]}/${editing}` : ENDPOINTS[type], jsonRequest(editing ? 'PUT' : 'POST', payloadFactory()));
                cancelEditing(type);
                await Promise.all([load(type), onMutation()]);
                showToast(editing ? updatedMessage : createdMessage, 'A página pública foi sincronizada.');
            } catch (error) {
                showToast(`Não foi possível salvar ${type === 'news' ? 'a notícia' : 'o item'}`, error.message, 'error');
            } finally {
                setBusy(form, false);
                updateCounters();
            }
        });
    }

    function bindRssForm() {
        const form = byId('rss-news-form');
        if (!form) return;
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            setBusy(form, true);
            try {
                const payload = { ...adminState.branding, rssNewsUrl: byId('rss-news-url-input').value.trim() };
                adminState.branding = await apiJson(ENDPOINTS.branding, jsonRequest('PUT', payload));
                await onMutation();
                showToast('URL do RSS salva', 'A fonte de notícias foi atualizada na TV pública.');
            } catch (error) {
                showToast('Não foi possível salvar', error.message, 'error');
            } finally {
                setBusy(form, false);
            }
        });
    }

    function bindPreviews() {
        byId('news-input').addEventListener('input', updateNewsCount);
        byId('partner-logo-input').addEventListener('input', updatePartnerPreview);
        byId('program-video').addEventListener('input', updateProgramSource);
    }

    function updateNewsCount() {
        byId('news-char-count').textContent = String(byId('news-input').value.length);
    }

    function updatePartnerPreview() {
        const url = byId('partner-logo-input').value.trim();
        const image = byId('partner-preview-image');
        const placeholder = byId('partner-preview-placeholder');
        image.classList.toggle('hidden', !url);
        placeholder.classList.toggle('hidden', Boolean(url));
        if (url) image.src = url;
        image.onerror = () => { image.classList.add('hidden'); placeholder.classList.remove('hidden'); };
    }

    function updateProgramSource() {
        const input = byId('program-video');
        const status = byId('program-source-status');
        const value = input.value.trim();
        const youtubeId = getYouTubeVideoId(value);
        const youtubeHost = /(?:youtube(?:-nocookie)?\.com|youtu\.be)/i.test(value);
        input.setCustomValidity(youtubeHost && !youtubeId ? 'Informe uma URL válida de vídeo do YouTube.' : '');
        const [message, stateName] = !value ? ['Aceita vídeo enviado, URL HTTPS e links do YouTube.', '']
            : youtubeId ? [`YouTube reconhecido · ID ${youtubeId}`, 'success']
                : youtubeHost ? ['URL do YouTube inválida ou sem ID de vídeo.', 'error']
                    : ['Fonte própria ou URL HTTPS direta.', 'success'];
        status.textContent = message;
        status.dataset.state = stateName;
    }

    function bindUploads() {
        const success = (file) => showToast('Upload concluído', file.name);
        const failure = (error) => showToast('Falha no upload', error.message, 'error');
        bindUpload({ fileId: 'partner-logo-upload', targetId: 'partner-logo-input', statusId: 'partner-logo-upload-status', endpoint: '/api/upload/image', valueKey: 'url', onComplete: success, onError: failure });
        bindUpload({ fileId: 'program-video-upload', targetId: 'program-video', statusId: 'program-video-upload-status', endpoint: '/api/upload/video', valueKey: 'filename', onComplete: success, onError: failure });
    }

    return { initialize, load, loadAll, updateCounters };
}
