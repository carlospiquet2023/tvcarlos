export function clear(element) {
    element.replaceChildren();
}

export function byId(id, root = document) {
    return root.getElementById(id);
}

export function requiredElement(id, root = document) {
    const node = byId(id, root);
    if (!node) throw new Error(`Elemento obrigatório ausente: #${id}`);
    return node;
}

export function element(tag, { className, text, title, attributes = {} } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    if (title) node.title = title;
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    return node;
}

export function icon(className) {
    return element('i', { className });
}

export function setButtonContent(button, iconClass, label) {
    button.replaceChildren(icon(iconClass), document.createTextNode(` ${label}`));
}
