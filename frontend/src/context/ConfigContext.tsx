import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';

interface PlatformConfig {
    appTimezone: string;
    platformName: string;
    namePart1: string;
    namePart2: string;
    nameColor1: string;
    nameColor2: string;
    primaryColor: string;
    accentColor: string;
    logoUrl: string | null;
    bannerUrl: string | null;
    forumPunishmentEnabled: boolean;
    attendanceEnabled: boolean;
}

interface ConfigContextType {
    config: PlatformConfig;
    setConfig: React.Dispatch<React.SetStateAction<PlatformConfig>>;
    refreshConfig: () => Promise<void>;
}

const defaultConfig: PlatformConfig = {
    appTimezone: 'America/Sao_Paulo',
    platformName: 'EduVault',
    namePart1: 'Edu',
    namePart2: 'Vault',
    nameColor1: '#e50914',
    nameColor2: '#172033',
    primaryColor: '#6366f1',
    accentColor: '#ec4899',
    logoUrl: null,
    bannerUrl: null,
    forumPunishmentEnabled: false,
    attendanceEnabled: false
};

const ConfigContext = createContext<ConfigContextType>({
    config: defaultConfig,
    setConfig: () => { },
    refreshConfig: async () => { }
});

const API_BASE_URL = import.meta.env.VITE_API_URL?.trim() || '';

/**
 * Converte hex (#rrggbb) para { r, g, b }
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean, 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}

function relativeLuminance(hex: string): number {
    const { r, g, b } = hexToRgb(hex);
    const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string): number {
    const first = relativeLuminance(foreground);
    const second = relativeLuminance(background);
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Escurece uma cor hex por uma porcentagem (0–1)
 */
function darkenHex(hex: string, amount: number): string {
    const { r, g, b } = hexToRgb(hex);
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const nr = clamp(r * (1 - amount));
    const ng = clamp(g * (1 - amount));
    const nb = clamp(b * (1 - amount));
    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

/**
 * Clareia uma cor hex por uma porcentagem (0–1)
 */
function lightenHex(hex: string, amount: number): string {
    const { r, g, b } = hexToRgb(hex);
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const nr = clamp(r + (255 - r) * amount);
    const ng = clamp(g + (255 - g) * amount);
    const nb = clamp(b + (255 - b) * amount);
    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

/**
 * Mantem a identidade configuravel sem permitir texto ilegivel. Cores usadas
 * como texto ou fundo de acao sao escurecidas apenas quando nao atingem AA.
 */
function darkenUntilContrast(hex: string, background: string, target = 4.5): string {
    let candidate = hex;
    for (let step = 0; step < 20 && contrastRatio(candidate, background) < target; step += 1) {
        candidate = darkenHex(candidate, 0.08);
    }
    return candidate;
}

function applyTheme(currentConfig: PlatformConfig) {
    const root = document.documentElement;
    const primary = currentConfig.primaryColor || '#6366f1';
    const accent = currentConfig.accentColor || '#ec4899';
    const { r, g, b } = hexToRgb(primary);
    const accentRgb = hexToRgb(accent);
    const primaryAction = darkenUntilContrast(primary, '#ffffff');
    const primaryInk = darkenUntilContrast(primary, '#ffffff');
    const accentInk = darkenUntilContrast(accent, '#ffffff');

    root.style.setProperty('--primary', primary);
    root.style.setProperty('--primary-color', primary);
    root.style.setProperty('--primary-hover', darkenHex(primary, 0.15));
    root.style.setProperty('--primary-color-dark', darkenHex(primary, 0.15));
    root.style.setProperty('--primary-glow', `rgba(${r}, ${g}, ${b}, 0.4)`);
    root.style.setProperty('--primary-soft', `rgba(${r}, ${g}, ${b}, 0.12)`);
    root.style.setProperty('--primary-color-light', `rgba(${r}, ${g}, ${b}, 0.12)`);
    root.style.setProperty('--primary-light', lightenHex(primary, 0.3));
    root.style.setProperty('--primary-action', primaryAction);
    root.style.setProperty('--primary-action-hover', darkenHex(primaryAction, 0.12));
    root.style.setProperty('--primary-ink', primaryInk);
    root.style.setProperty('--on-primary-action', '#ffffff');
    root.style.setProperty('--accent-pink', accent);
    root.style.setProperty('--accent-ink', accentInk);
    root.style.setProperty('--accent-pink-glow', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.3)`);
    document.title = currentConfig.platformName || 'EduVault';
}

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<PlatformConfig>(defaultConfig);

    const fetchConfig = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/config/public`);
            const data = {
                appTimezone: response.data.appTimezone || defaultConfig.appTimezone,
                platformName: response.data.platformName || defaultConfig.platformName,
                namePart1: response.data.namePart1 || defaultConfig.namePart1,
                namePart2: response.data.namePart2 || defaultConfig.namePart2,
                nameColor1: response.data.nameColor1 || defaultConfig.nameColor1,
                nameColor2: response.data.nameColor2 || defaultConfig.nameColor2,
                primaryColor: response.data.primaryColor || defaultConfig.primaryColor,
                accentColor: response.data.accentColor || defaultConfig.accentColor,
                logoUrl: response.data.logoUrl || null,
                bannerUrl: response.data.bannerUrl || null,
                forumPunishmentEnabled: response.data.forumPunishmentEnabled ?? false,
                attendanceEnabled: response.data.attendanceEnabled ?? false
            };
            setConfig(data);
        } catch (error) {
            console.error('Erro ao carregar configurações de branding:', error);
            setConfig(defaultConfig);
        }
    }, []);

    useEffect(() => {
        void fetchConfig();
    }, [fetchConfig]);

    useEffect(() => {
        applyTheme(config);
    }, [config]);

    return (
        <ConfigContext.Provider value={{ config, setConfig, refreshConfig: fetchConfig }}>
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => useContext(ConfigContext);
