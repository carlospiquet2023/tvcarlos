import { clear, element, requiredElement } from '../dom.js';
import { CAPITALS, INTERVALS, WEATHER_ENDPOINT, RSS_NEWS_ENDPOINT } from './config.js';
import { fetchJson } from './request.js';

export function createTickerController() {
    const ticker = requiredElement('news-ticker');
    const clock = requiredElement('brasilia-clock');
    const capitals = CAPITALS.map((capital) => ({ ...capital }));
    let clockTimer;
    let refreshTimer;

    function start() {
        updateClock();
        void refresh();
        clockTimer = window.setInterval(updateClock, INTERVALS.clock);
        refreshTimer = window.setInterval(refresh, INTERVALS.contentRefresh);
        window.addEventListener('resize', synchronizeSpeed, { passive: true });
    }

    async function refresh() {
        const [weather, manualNews, rssNews] = await Promise.allSettled([
            fetchJson(WEATHER_ENDPOINT),
            fetchJson('/api/news'),
            fetchJson(RSS_NEWS_ENDPOINT)
        ]);

        if (weather.status === 'fulfilled' && Array.isArray(weather.value)) {
            weather.value.forEach((item, index) => {
                const value = item?.current_weather?.temperature;
                if (capitals[index] && Number.isFinite(value)) capitals[index].temp = Math.round(value);
            });
        }

        const items = [];
        if (manualNews.status === 'fulfilled' && Array.isArray(manualNews.value)) {
            items.push(...manualNews.value);
        }
        
        if (rssNews.status === 'fulfilled' && rssNews.value?.items) {
            const fetchedItems = rssNews.value.items.slice(0, 5).map(item => `[Plantão] ${item.title}`);
            items.push(...fetchedItems);
        }

        renderNews(items);
    }

    function renderNews(items) {
        clear(ticker);
        if (!items.length) {
            ticker.append(element('span', { text: '• TV CARLOS - PROGRAMAÇÃO CONTÍNUA 24H' }));
        } else {
            items.forEach((item) => ticker.append(element('span', { className: 'ticker-news-item', text: `• 📢 ${String(item.text || item).toUpperCase()}` })));
        }
        synchronizeSpeed();
    }

    function updateClock() {
        const capital = capitals[Math.floor(Date.now() / 5_000) % capitals.length];
        let time;
        try {
            time = new Intl.DateTimeFormat('pt-BR', { timeZone: capital.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
        } catch {
            time = new Date().toTimeString().slice(0, 5);
        }
        clock.replaceChildren(
            element('span', { className: 'clock-uf', text: capital.uf }),
            element('span', { className: 'clock-temp', text: `${capital.temp}°C` }),
            element('span', { className: 'clock-time-val', text: time }),
        );
    }

    function synchronizeSpeed() {
        requestAnimationFrame(() => {
            const distance = Math.max(ticker.scrollWidth, ticker.parentElement?.clientWidth || 0);
            ticker.style.setProperty('--ticker-duration', `${Math.min(58, Math.max(14, distance / 78)).toFixed(2)}s`);
        });
    }

    function stop() {
        window.clearInterval(clockTimer);
        window.clearInterval(refreshTimer);
        window.removeEventListener('resize', synchronizeSpeed);
    }

    return { start, refresh, renderNews, stop };
}
