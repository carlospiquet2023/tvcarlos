import { apiJson } from '../api-client.js';
import { byId, clear, element, icon, setButtonContent } from '../dom.js';
import { adminState, ENDPOINTS, jsonRequest } from './core.js';
import { actionButton, confirmRemoval, renderEmpty, setBusy, showToast } from './ui.js';

let latestTeacherCredentials = null;

export function createTeacherAdminController({ navigate, onMutation }) {
    function initialize() {
        byId('teacher-form').addEventListener('submit', saveTeacher);
        byId('teacher-cancel-btn').addEventListener('click', cancelEditing);
        byId('teacher-copy-credentials-btn').addEventListener('click', () => {
            if (latestTeacherCredentials) copyTeacherCredentials(latestTeacherCredentials.teacher, latestTeacherCredentials.password);
        });
    }

    async function load() {
        adminState.teachers = await apiJson(ENDPOINTS.teachers);
        renderRoomChecklist();
        renderTeachers();
        updateCounters();
    }

    function renderRoomChecklist(selectedIds = []) {
        const container = byId('teacher-room-checklist');
        if (!adminState.privateRooms.length) {
            renderEmpty(container, 'Crie uma sala privada antes de cadastrar professores.');
            return;
        }
        clear(container);
        adminState.privateRooms.forEach((room) => {
            const label = element('label', { className: 'teacher-room-option' });
            const checkbox = element('input', { attributes: { type: 'checkbox', value: room.id } });
            checkbox.checked = selectedIds.includes(room.id);
            const copy = element('span');
            copy.append(
                element('strong', { text: room.title }),
                element('small', { text: `ID ${room.roomCode}` }),
            );
            label.append(checkbox, copy);
            container.append(label);
        });
    }

    function renderTeachers() {
        const container = byId('teacher-list');
        if (!adminState.teachers.length) {
            renderEmpty(container, 'Nenhum professor cadastrado.');
            return;
        }
        clear(container);
        adminState.teachers.forEach((teacher) => container.append(renderTeacherRow(teacher)));
    }

    function renderTeacherRow(teacher) {
        const rooms = teacher.roomIds.map((roomId) => adminState.privateRooms.find((room) => room.id === roomId)?.title).filter(Boolean);
        const content = element('div', { className: 'resource-main' });
        content.append(
            element('strong', { text: teacher.username }),
            element('p', { text: rooms.length ? rooms.join(', ') : 'Nenhuma sala liberada' }),
            element('small', { text: 'Acesso somente ao Espaço do Professor' }),
        );

        const actions = element('div', { className: 'resource-actions' });
        actions.append(
            actionButton('fa-regular fa-pen-to-square', 'Editar salas', () => startEditing(teacher)),
            actionButton('fa-solid fa-key', 'Gerar nova senha', () => rotatePassword(teacher)),
            actionButton('fa-regular fa-trash-can', 'Remover professor', () => removeTeacher(teacher), { danger: true }),
        );

        const row = element('article', { className: 'resource-row' });
        const badge = element('span', { className: 'resource-index' });
        badge.append(icon('fa-solid fa-chalkboard-user'));
        row.append(badge, content, actions);
        return row;
    }

    function updateCounters() {
        byId('nav-teacher-count').textContent = String(adminState.teachers.length);
        byId('teacher-list-count').textContent = `${adminState.teachers.length} ${adminState.teachers.length === 1 ? 'professor' : 'professores'}`;
    }

    async function saveTeacher(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const editing = adminState.editing.teachers;
        setBusy(form, true);
        try {
            const payload = { username: byId('teacher-username-input').value.trim(), roomIds: selectedRoomIds() };
            if (editing) {
                await apiJson(`${ENDPOINTS.teachers}/${encodeURIComponent(editing)}`, jsonRequest('PUT', { roomIds: payload.roomIds }));
                hideCredentials();
            } else {
                const response = await apiJson(ENDPOINTS.teachers, jsonRequest('POST', payload));
                latestTeacherCredentials = response;
                showCredentials(response.teacher, response.password);
            }
            cancelEditing();
            await Promise.all([load(), onMutation()]);
            showToast(editing ? 'Professor atualizado' : 'Professor criado', editing ? 'Salas liberadas atualizadas.' : 'Copie as credenciais para enviar ao professor.');
        } catch (error) {
            showToast('Não foi possível salvar o professor', error.message, 'error');
        } finally {
            setBusy(form, false);
        }
    }

    function selectedRoomIds() {
        return [...byId('teacher-room-checklist').querySelectorAll('input[type="checkbox"]:checked')].map((checkbox) => checkbox.value);
    }

    function startEditing(teacher) {
        adminState.editing.teachers = teacher.id;
        byId('teacher-username-input').value = teacher.username;
        byId('teacher-username-input').disabled = true;
        byId('teacher-form-title').textContent = 'Editar professor';
        setButtonContent(byId('teacher-submit-btn'), 'fa-solid fa-floppy-disk', 'Salvar salas');
        byId('teacher-cancel-btn').classList.remove('hidden');
        renderRoomChecklist(teacher.roomIds);
        hideCredentials();
        navigate('teachers');
    }

    function cancelEditing() {
        adminState.editing.teachers = null;
        byId('teacher-form').reset();
        byId('teacher-username-input').disabled = false;
        byId('teacher-form-title').textContent = 'Criar professor';
        setButtonContent(byId('teacher-submit-btn'), 'fa-solid fa-plus', 'Criar professor');
        byId('teacher-cancel-btn').classList.add('hidden');
        renderRoomChecklist();
    }

    async function rotatePassword(teacher) {
        if (!(await confirmRemoval(`Gerar uma nova senha para “${teacher.username}”?`))) return;
        try {
            const response = await apiJson(`${ENDPOINTS.teachers}/${encodeURIComponent(teacher.id)}/rotate-password`, { method: 'POST' });
            latestTeacherCredentials = response;
            showCredentials(response.teacher, response.password);
            showToast('Senha gerada', 'Copie a nova senha antes de sair desta tela.');
        } catch (error) {
            showToast('Não foi possível gerar senha', error.message, 'error');
        }
    }

    async function removeTeacher(teacher) {
        if (!(await confirmRemoval(`Remover o professor “${teacher.username}”?`))) return;
        try {
            await apiJson(`${ENDPOINTS.teachers}/${encodeURIComponent(teacher.id)}`, { method: 'DELETE' });
            await Promise.all([load(), onMutation()]);
            showToast('Professor removido', 'O acesso foi encerrado.');
        } catch (error) {
            showToast('Falha ao remover professor', error.message, 'error');
        }
    }

    function showCredentials(teacher, password) {
        byId('teacher-credential-username').textContent = teacher.username;
        byId('teacher-credential-password').textContent = password;
        byId('teacher-credential-link').textContent = `${location.origin}/professor.html`;
        byId('teacher-credentials').classList.remove('hidden');
    }

    function hideCredentials() {
        byId('teacher-credentials').classList.add('hidden');
    }

    async function copyTeacherCredentials(teacher, password) {
        const text = `Espaço do Professor TV Carlos\nUsuário: ${teacher.username}\nSenha: ${password}\nLink: ${location.origin}/professor.html`;
        try {
            await navigator.clipboard.writeText(text);
            showToast('Credenciais copiadas', 'Envie somente ao professor autorizado.');
        } catch (error) {
            showToast('Não foi possível copiar', error.message, 'error');
        }
    }

    return { initialize, load, renderRoomChecklist, renderTeachers, updateCounters };
}
