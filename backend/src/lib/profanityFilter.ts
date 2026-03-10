/**
 * profanityFilter.ts — Filtro local de palavras ofensivas (PT-BR)
 *
 * Detecta xingamentos, termos racistas, homofóbicos e ofensivos.
 * Lida com variações comuns (letras por números, pontos entre letras).
 * Retorna a palavra detectada e a severidade (LIGHT, MEDIUM, SEVERE).
 */

type Severity = 'LIGHT' | 'MEDIUM' | 'SEVERE';

interface PatternEntry {
    pattern: RegExp;
    severity: Severity;
    label: string; // nome legível para mostrar ao aluno
}

// Termos ofensivos em português (mantido como regex patterns para cobrir variações)
const OFFENSIVE_PATTERNS: PatternEntry[] = [
    // ─── LIGHT: xingamentos gerais ───
    { pattern: /\bp[u\*@]t[a4@]\b/i, severity: 'LIGHT', label: 'puta' },
    { pattern: /\bp[u\*@]t[o0]\b/i, severity: 'LIGHT', label: 'puto' },
    { pattern: /\bput[a4]r[i1][a4]\b/i, severity: 'LIGHT', label: 'putaria' },
    { pattern: /\bc[a4]r[a4]lh[o0]\b/i, severity: 'LIGHT', label: 'caralho' },
    { pattern: /\bf[o0]d[a4aei]\b/i, severity: 'LIGHT', label: 'foda' },
    { pattern: /\bf[o0]d[a4]-?s[e3]\b/i, severity: 'LIGHT', label: 'foda-se' },
    { pattern: /\bfil[h]?[o0a4]\s*d[a4]\s*p[u\*@]t[a4]\b/i, severity: 'MEDIUM', label: 'filho da puta' },
    { pattern: /\bfdp\b/i, severity: 'MEDIUM', label: 'fdp' },
    { pattern: /\bm[e3]rd[a4]\b/i, severity: 'LIGHT', label: 'merda' },
    { pattern: /\bc[a4]c[e3]t[e3]\b/i, severity: 'LIGHT', label: 'cacete' },
    { pattern: /\bb[o0]st[a4]\b/i, severity: 'LIGHT', label: 'bosta' },
    { pattern: /\barr[o0]mb[a4]d[o0a4]\b/i, severity: 'MEDIUM', label: 'arrombado' },
    { pattern: /\bb[u\*]c[e3]t[a4]\b/i, severity: 'MEDIUM', label: 'buceta' },
    { pattern: /\bidi[o0]t[a4]\b/i, severity: 'LIGHT', label: 'idiota' },
    { pattern: /\bimb[e3]c[i1]l\b/i, severity: 'LIGHT', label: 'imbecil' },
    { pattern: /\bcr[e3]t[i1]n[o0a4]\b/i, severity: 'LIGHT', label: 'cretino' },
    { pattern: /\bb[a4]b[a4]c[a4]\b/i, severity: 'LIGHT', label: 'babaca' },
    { pattern: /\bv[a4]g[a4]bund[o0a4]\b/i, severity: 'LIGHT', label: 'vagabundo' },
    { pattern: /\bc[u\*]z[a4a@]([o0]|[a4a@])?\b/i, severity: 'MEDIUM', label: 'cuzão' },
    { pattern: /\bp[o0]rr[a4]\b/i, severity: 'LIGHT', label: 'porra' },
    { pattern: /\bdesgraç[a4]d[o0a4]\b/i, severity: 'MEDIUM', label: 'desgraçado' },
    { pattern: /\binfern[o0]\b/i, severity: 'LIGHT', label: 'inferno' },
    { pattern: /\btr[o0]ux[a4]\b/i, severity: 'LIGHT', label: 'trouxa' },
    { pattern: /\botári[o0a4]\b/i, severity: 'LIGHT', label: 'otário' },
    { pattern: /\bpir[a4]nh[a4]\b/i, severity: 'MEDIUM', label: 'piranha' },
    { pattern: /\bv[a4]d[i1][a4]\b/i, severity: 'MEDIUM', label: 'vadia' },

    // ─── SEVERE: Racismo / preconceito racial ───
    { pattern: /\bn[e3]gr[o0a4]\s*(immund|fedid|nojent|suj|lixo|safad|desgraç|maldid|fei)/i, severity: 'SEVERE', label: 'termo racista' },
    { pattern: /\bpr[e3]t[o0a4]\s*(immund|fedid|nojent|suj|lixo|safad|desgraç|maldid|fei)/i, severity: 'SEVERE', label: 'termo racista' },
    { pattern: /\bm[a4]c[a4]c[o0a4]\b/i, severity: 'SEVERE', label: 'macaco (racial)' },
    { pattern: /\bcr[i1][o0]ul[o0a4]\b/i, severity: 'SEVERE', label: 'crioulo' },
    { pattern: /\bn[e3]g[o0a4]\s*safad/i, severity: 'SEVERE', label: 'termo racista' },
    { pattern: /\bpr[e3]t[o0a4]\s*safad/i, severity: 'SEVERE', label: 'termo racista' },

    // ─── SEVERE: Homofobia ───
    { pattern: /\bvi[a4]d[o0]\b/i, severity: 'SEVERE', label: 'viado' },
    { pattern: /\bvi[a4]d[i1]nh[o0]\b/i, severity: 'SEVERE', label: 'viadinho' },
    { pattern: /\bb[i1]ch[a4]\b/i, severity: 'SEVERE', label: 'bicha' },
    { pattern: /\bs[a4]pat[a4a@o0]\b/i, severity: 'SEVERE', label: 'sapatão' },
    { pattern: /\btr[a4]v[e3]c[o0]\b/i, severity: 'SEVERE', label: 'traveco' },
    { pattern: /\bm[a4]ric[a4]\b/i, severity: 'SEVERE', label: 'marica' },
    { pattern: /\bmar[i1]c[o0]n[a4]\b/i, severity: 'SEVERE', label: 'maricona' },

    // ─── SEVERE: Capacitismo ───
    { pattern: /\br[e3]t[a4]rd[a4]d[o0a4]\b/i, severity: 'MEDIUM', label: 'retardado' },
    { pattern: /\bm[o0]ng[o0]l[o0a4]?\b/i, severity: 'SEVERE', label: 'mongol' },
    { pattern: /\bal[e3]ij[a4]d[o0a4]\b/i, severity: 'MEDIUM', label: 'aleijado' },

    // ─── SEVERE: Ameaças / violência ───
    { pattern: /\bv[o0]u\s*t[e3]\s*m[a4]t[a4]r\b/i, severity: 'SEVERE', label: 'ameaça de morte' },
    { pattern: /\bm[o0]rr[a4]\b/i, severity: 'SEVERE', label: 'morra' },
    { pattern: /\bs[e3]\s*m[a4]t[a4]\b/i, severity: 'SEVERE', label: 'ameaça' },
];

/**
 * Normaliza texto removendo acentos, substituindo números comuns por letras,
 * e removendo pontos/espaços inseridos entre letras para burlar filtro.
 */
function normalize(text: string): string {
    return text
        // Remove acentos
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        // Números → letras (bypass comum)
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a')
        .replace(/5/g, 's')
        .replace(/7/g, 't')
        .replace(/\$/g, 's')
        .replace(/@/g, 'a')
        // Remove pontos e underscores entre letras (p.u.t.a → puta)
        .replace(/(\w)[._](\w)/g, '$1$2');
}

export interface FilterResult {
    blocked: boolean;
    flagged: boolean;
    severity?: 'LIGHT' | 'MEDIUM' | 'SEVERE';
    matchedWord?: string;
    reason?: string;
}

/**
 * Analisa o texto e retorna se deve ser bloqueado, a palavra encontrada e a severidade.
 */
export function checkProfanity(text: string): FilterResult {
    const normalized = normalize(text);

    for (const entry of OFFENSIVE_PATTERNS) {
        if (entry.pattern.test(normalized) || entry.pattern.test(text)) {
            return {
                blocked: true,
                flagged: true,
                severity: entry.severity,
                matchedWord: entry.label,
                reason: `Mensagem contém termos inadequados: "${entry.label}"`
            };
        }
    }

    return { blocked: false, flagged: false };
}
