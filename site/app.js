import './js/client-guard.js';
import { createBrandingController } from './js/public/branding-controller.js';
import { INTERVALS } from './js/public/config.js';
import { createNavigationController } from './js/public/navigation-controller.js';
import { createPartnerController } from './js/public/partner-controller.js';
import { createPlayerController } from './js/public/player-controller.js';
import { createPrivateRoomController } from './js/public/private-room-controller.js';
import { createScheduleController } from './js/public/schedule-controller.js';
import { createBroadcastState } from './js/public/state.js';
import { createTickerController } from './js/public/ticker-controller.js';

const state = createBroadcastState();
let player;

const schedule = createScheduleController({
    state,
    onSelectLinear: () => player.returnToLinear(),
    onSelectProgram: (program) => player.playProgram(program),
});

player = createPlayerController({ state, onPlaybackChange: () => { schedule.render(); ticker.update(); } });
const branding = createBrandingController({
    state,
    onBrandingChange: () => {
        player.refreshPresentation();
        schedule.render();
        ticker.update();
    },
});
const navigation = createNavigationController();
const partners = createPartnerController();
const privateRoom = createPrivateRoomController();
const ticker = createTickerController({ state });
let liveTimer;

async function initialize() {
    player.initialize();
    navigation.initialize();
    privateRoom.initialize();
    ticker.start();
    await branding.load();

    await Promise.allSettled([
        schedule.load(),
        navigation.load(),
        partners.load(),
        player.checkLive(),
    ]);

    liveTimer = window.setInterval(player.checkLive, INTERVALS.liveProbe);
}

function shutdown() {
    window.clearInterval(liveTimer);
    ticker.stop();
    player.destroy();
}

window.addEventListener('DOMContentLoaded', initialize, { once: true });
window.addEventListener('pagehide', shutdown, { once: true });
