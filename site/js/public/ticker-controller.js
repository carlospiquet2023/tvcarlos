import { clear, element, requiredElement } from '../dom.js';
import { CAPITALS, INTERVALS, WEATHER_ENDPOINT } from './config.js';
import { fetchJson } from './request.js';

export function createTickerController({ state }) {
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

    async function fetchRssFeed(url) {
        let targetUrl = url;
        if (targetUrl.includes('api.rss2json.com')) {
            const match = targetUrl.match(/rss_url=([^&]+)/);
            if (match) targetUrl = `https://api.allorigins.win/raw?url=${match[1]}`;
        }
        
        try {
            if (targetUrl.includes('api.rss2json.com')) {
                const data = await fetchJson(targetUrl);
                return data?.items?.map(item => `[Plantão] ${item.title}`) || [];
            }
            
            const response = await fetch(targetUrl + (targetUrl.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
            const text = await response.text();
            
            let xmlText = text;
            try { const json = JSON.parse(text); if (json.contents) xmlText = json.contents; } catch (e) {}
            
            const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
            const items = Array.from(doc.querySelectorAll('item')).slice(0, 15);
            return items.map(item => `[Plantão] ${item.querySelector('title')?.textContent}`).filter(t => t && t !== '[Plantão] undefined');
        } catch (error) {
            console.error('RSS Fetch error:', error);
            return [];
        }
    }

    async function refresh() {
        const promises = [
            fetchJson(WEATHER_ENDPOINT),
            fetchJson('/api/news')
        ];
        
        if (state.branding.rssNewsUrl) {
            promises.push(fetchRssFeed(state.branding.rssNewsUrl));
        }

        const results = await Promise.allSettled(promises);
        const [weather, manualNews, rssNews] = results;

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
        
        if (rssNews && rssNews.status === 'fulfilled' && Array.isArray(rssNews.value)) {
            items.push(...rssNews.value);
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
