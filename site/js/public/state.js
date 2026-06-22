import { DEFAULT_BRANDING } from './config.js';

export function createBroadcastState() {
    return {
        programs: [],
        branding: { ...DEFAULT_BRANDING },
        currentSource: null,
        activeProgram: null,
        isLiveOnline: false,
    };
}

export function isOnDemand(state) {
    return state.currentSource === 'vod' || state.currentSource === 'youtube';
}
