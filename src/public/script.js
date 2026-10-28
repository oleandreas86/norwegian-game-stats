let timeRange = { type: '30d', start: null, end: null };
let comparisonAppids = loadComparisonState();

const COLORS = ['#66c0f4', '#f5a623', '#7ed957', '#e86fd1', '#ff6b6b', '#a78bfa'];
const CHART_BORDER_COLOR = '#66c0f4';
const TEXT_COLOR = '#8f9bab';
const GRID_COLOR = 'rgba(255, 255, 255, 0.06)';

// Legacy (unhashed) Steam CDN paths still resolve for nearly every app; used when the collector
// hasn't stored the hashed asset URLs yet, and for the logo which the store API doesn't expose.
const STEAM_ASSETS = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps';

const STEAM_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 .007c-.125 0-.252.004-.377.008L4.662 10.02c-.896-.036-1.742.368-2.235 1.096L0 12.871l5.248 2.162c.245-.075.502-.115.768-.115.53 0 1.026.16 1.442.433l3.522-5.087V10.2c0-2.522 2.044-4.566 4.566-4.566 2.521 0 4.565 2.044 4.565 4.566s-2.044 4.565-4.565 4.565c-.053 0-.106-.002-.158-.004l-5.115 3.511c.006.082.012.164.012.247 0 2.376-1.926 4.303-4.302 4.303-.508 0-1-.088-1.455-.25L5.732 24H12c6.627 0 12-5.373 12-12S18.627.007 12 .007zm3.442 8.358c1.012 0 1.832.82 1.832 1.833 0 1.012-.82 1.832-1.832 1.832s-1.832-.82-1.832-1.832c0-1.013.82-1.833 1.832-1.833z"/></svg>`;
const STEAMDB_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2.5 19h19v2h-19zm4.5-4h3v3h-3zm5-5h3v8h-3zm5-5h3v13h-3z"/></svg>`;
const PLUS_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
const CHECK_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>`;

let chartInstances = {};
let pendingCharts = new Set();
let allGames = [];
let allMetadata = [];
let metadataById = new Map();
let currentById = new Map();
let peakById = new Map();
let libraryFilter = 'all';
let observer;

async function init() {
    // Set default dates for custom range
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    document.getElementById('start-date').value = toLocalInputValue(thirtyDaysAgo);
    document.getElementById('end-date').value = toLocalInputValue(now);

    const [gamesResponse, leaderboardsResponse] = await Promise.all([
        fetch('/api/games'),
        fetch('/api/leaderboards')
    ]);
    allGames = await gamesResponse.json();
    allGames.sort((a, b) => a.name.localeCompare(b.name));
    const leaderboards = await leaderboardsResponse.json();

    // Filter out comparisonAppids that no longer exist in current config
    const originalCount = comparisonAppids.length;
    comparisonAppids = comparisonAppids.filter(id => allGames.some(g => g.id === id));
    if (comparisonAppids.length !== originalCount) {
        saveComparisonState();
    }

    allMetadata = (leaderboards.metadata || []).map(m => ({ ...m, revenue: estimateRevenue(m) }));
    metadataById = new Map(allMetadata.map(m => [m.appid, m]));
    currentById = new Map((leaderboards.current || []).map(c => [c.appid, c.player_count]));
    peakById = new Map((leaderboards.peaks || []).map(p => [p.appid, p.peak_player_count]));

    // Only rows with collected review data take part in sales/revenue/rating rankings
    const withSales = allMetadata.filter(m => m.estimated_sales !== null && m.estimated_sales !== undefined);
    const rankings = {
        current: leaderboards.current || [],
        peak: leaderboards.peaks || [],
        sales: [...withSales].sort((a, b) => b.estimated_sales - a.estimated_sales),
        revenue: [...withSales].sort((a, b) => b.revenue - a.revenue),
        rating: withSales
            .filter(item => item.review_score !== null && item.reviews >= 10)
            .sort((a, b) => b.review_score - a.review_score || b.reviews - a.reviews)
    };

    populateLeaderboard('current-leaderboard', rankings.current, 'player_count');
    populateLeaderboard('peak-leaderboard', rankings.peak, 'peak_player_count');
    populateLeaderboard('sales-leaderboard', rankings.sales, 'estimated_sales');
    populateLeaderboard('revenue-leaderboard', rankings.revenue, 'revenue');
    populateLeaderboard('rating-leaderboard', rankings.rating, 'review_score');

    updateSpotlight(rankings.current);
    updateGlobalStats(rankings);
    setupControls();

    // Lazily render charts as cards scroll into view
    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const appid = entry.target.dataset.appid;
                if (appid && !chartInstances[appid] && !pendingCharts.has(appid)) {
                    renderGameChart(appid);
                }
            }
        });
    }, { rootMargin: '300px' });

    updateControlsUI();
    initializeChartGrid();
    applyLibraryView();
    refreshComparison();
}

function setupControls() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.range-btn').forEach(b => b.classList.toggle('active', b === btn));
            timeRange.type = btn.dataset.range;
            document.getElementById('custom-range-inputs').hidden = timeRange.type !== 'custom';
            if (timeRange.type === 'custom') {
                timeRange.start = document.getElementById('start-date').value;
                timeRange.end = document.getElementById('end-date').value;
            }
            refreshCharts();
        });
    });

    document.getElementById('start-date').addEventListener('change', (e) => {
        timeRange.start = e.target.value;
        if (timeRange.type === 'custom') refreshCharts();
    });

    document.getElementById('end-date').addEventListener('change', (e) => {
        timeRange.end = e.target.value;
        if (timeRange.type === 'custom') refreshCharts();
    });

    document.getElementById('compare-selector').addEventListener('change', (e) => {
        if (e.target.value) {
            toggleComparison(e.target.value);
            e.target.value = ''; // Reset to placeholder
        }
    });
    document.getElementById('clear-comparison-btn').addEventListener('click', clearComparison);

    document.getElementById('game-search').addEventListener('input', applyLibraryView);
    document.getElementById('sort-select').addEventListener('change', applyLibraryView);
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            libraryFilter = chip.dataset.filter;
            document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
            applyLibraryView();
        });
    });

    document.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('click', () => {
            switchTab(card.dataset.stat);
            document.getElementById('leaderboards').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // Delegated handlers for dynamically rendered rows and cards
    document.addEventListener('click', (e) => {
        const compareBtn = e.target.closest('[data-compare]');
        if (compareBtn) {
            toggleComparison(compareBtn.dataset.compare);
            return;
        }
        const gotoBtn = e.target.closest('[data-goto]');
        if (gotoBtn) {
            scrollToGame(parseInt(gotoBtn.dataset.goto));
        }
    });

    // Swap broken artwork for a styled fallback instead of a broken-image icon
    document.addEventListener('error', (e) => {
        const img = e.target;
        if (img.tagName !== 'IMG') return;
        img.classList.add('img-missing');
        if (img.id === 'spotlight-logo') {
            img.hidden = true;
            document.getElementById('spotlight-name').hidden = false;
        }
    }, true);
}

function estimateRevenue(m) {
    // For paid games, we use (Initial Price * 0.8) as the average selling price.
    // For F2P games, we use a heuristic based on monetization markers (IAP, MMO, DLCs).
    let avgPrice = (m.initial_price || m.price || 0) * 0.8;

    if (m.is_free && avgPrice === 0) {
        avgPrice = 5; // Base ARPU (Average Revenue Per User) for indie F2P
        if (m.has_iap) avgPrice += 10;
        if (m.is_mmo) avgPrice += 25;
        avgPrice += (m.dlc_count || 0) * 2;
    }

    return (m.estimated_sales || 0) * avgPrice;
}

function art(appid, kind) {
    const meta = metadataById.get(appid) || {};
    switch (kind) {
        case 'hero': return meta.hero_image || `${STEAM_ASSETS}/${appid}/library_hero.jpg`;
        case 'logo': return `${STEAM_ASSETS}/${appid}/logo.png`;
        default: return meta.header_image || `${STEAM_ASSETS}/${appid}/header.jpg`;
    }
}

function findGame(appid) {
    return allGames.find(g => g.id === appid);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function toLocalInputValue(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function scoreClass(score) {
    if (score === null || score === undefined) return '';
    if (score >= 70) return 'score-positive';
    if (score >= 40) return 'score-mixed';
    return 'score-negative';
}

function badgesFor(game, short = false) {
    let badges = '';
    if (game.release === 'Upcoming') badges += '<span class="badge badge-upcoming">Upcoming</span>';
    if (game.release === 'Early Access') badges += `<span class="badge badge-early-access">${short ? 'EA' : 'Early Access'}</span>`;
    if ((game.store || '').startsWith('Delisted')) badges += '<span class="badge badge-delisted">Delisted</span>';
    return badges;
}

function priceLabel(meta) {
    if (!meta) return '';
    if (meta.is_free) return 'Free';
    if (meta.price) return `${Math.round(meta.price)} NOK`;
    return '';
}

function updateSpotlight(current) {
    const section = document.getElementById('spotlight');
    const totalPlayers = current.reduce((sum, item) => sum + item.player_count, 0);
    document.getElementById('total-players').textContent = totalPlayers.toLocaleString();
    document.getElementById('total-games').textContent = allGames.length;

    const topItem = current.find(item => findGame(item.appid));
    section.classList.remove('is-loading');
    if (!topItem) {
        section.classList.add('is-empty');
        document.getElementById('spotlight-name').textContent = 'Waiting for data';
        return;
    }

    const game = findGame(topItem.appid);
    const meta = metadataById.get(game.id);

    const bg = document.getElementById('spotlight-bg');
    bg.style.backgroundImage = `url("${art(game.id, 'hero')}"), url("${art(game.id, 'header')}")`;

    const name = document.getElementById('spotlight-name');
    name.textContent = game.name;

    const logo = document.getElementById('spotlight-logo');
    logo.alt = game.name;
    logo.onload = () => {
        logo.hidden = false;
        name.classList.add('visually-hidden');
    };
    logo.src = art(game.id, 'logo');

    const metaParts = [game.developer];
    if (meta && meta.review_score !== null && meta.review_score !== undefined) {
        metaParts.push(`${meta.review_score}% positive`);
    }
    const price = priceLabel(meta);
    if (price) metaParts.push(price);
    document.getElementById('spotlight-meta').textContent = metaParts.join(' · ');

    document.getElementById('spotlight-players').textContent = topItem.player_count.toLocaleString();
    document.getElementById('spotlight-steam').href = `https://store.steampowered.com/app/${game.id}`;
    document.getElementById('spotlight-view').onclick = () => scrollToGame(game.id);
}

function setStatCard(prefix, item, subText) {
    const game = item ? findGame(item.appid) : null;
    document.getElementById(prefix).textContent = game ? game.name : '-';
    document.getElementById(`${prefix}-val`).textContent = game ? subText : '';
    const artEl = document.getElementById(`${prefix}-art`);
    if (game) artEl.style.backgroundImage = `url("${art(game.id, 'hero')}"), url("${art(game.id, 'header')}")`;
}

function updateGlobalStats(rankings) {
    const topSeller = rankings.sales[0];
    setStatCard('top-seller', topSeller, topSeller ? `${formatSales(topSeller.estimated_sales)} owners` : '');

    const topRevenue = rankings.revenue[0];
    setStatCard('top-revenue', topRevenue, topRevenue ? `${formatCurrency(topRevenue.revenue)}` : '');

    const bestRated = rankings.rating[0];
    setStatCard('best-rated', bestRated, bestRated ? `${bestRated.review_score}% · ${bestRated.reviews.toLocaleString()} reviews` : '');

    const peak = rankings.peak.find(item => findGame(item.appid));
    setStatCard('peak-record', peak, peak ? `${peak.peak_player_count.toLocaleString()} players` : '');
}

function formatSales(sales) {
    if (sales >= 1000000) return (sales / 1000000).toFixed(1) + 'M';
    if (sales >= 1000) return (sales / 1000).toFixed(0) + 'K';
    return sales.toLocaleString();
}

function formatCurrency(value) {
    if (value >= 1000000000) return (value / 1000000000).toFixed(2) + 'B NOK';
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M NOK';
    if (value >= 1000) return (value / 1000).toFixed(0) + 'K NOK';
    return Math.round(value).toLocaleString() + ' NOK';
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const active = btn.dataset.tab === tabId;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabId}-tab`);
    });
}

function compareButton(appid, extraClass = '') {
    const active = comparisonAppids.includes(appid);
    return `<button class="compare-btn ${extraClass} ${active ? 'active' : ''}" type="button" data-compare="${appid}"
                aria-pressed="${active}" title="${active ? 'Remove from comparison' : 'Add to comparison'}">
                ${active ? CHECK_SVG : PLUS_SVG}<span class="compare-label">${active ? 'Comparing' : 'Compare'}</span>
            </button>`;
}

function populateLeaderboard(listId, data, countKey) {
    const list = document.getElementById(listId);
    list.innerHTML = '';

    const rows = data.filter(item => findGame(item.appid));
    if (rows.length === 0) {
        list.innerHTML = '<li class="lb-empty">No data collected yet.</li>';
        return;
    }
    const maxValue = Math.max(...rows.map(item => item[countKey] || 0), 1);

    rows.forEach((item, index) => {
        const game = findGame(item.appid);
        const meta = metadataById.get(item.appid);
        const rank = index + 1;

        let displayValue = (item[countKey] || 0).toLocaleString();
        let subValue = '';
        let title = '';
        let barWidth = (item[countKey] || 0) / maxValue * 100;

        if (countKey === 'estimated_sales') {
            displayValue = formatSales(item.estimated_sales);
            if (item.review_score !== null) subValue = `${item.review_score}% · ${item.reviews.toLocaleString()} reviews`;
            const multiplier = item.reviews > 0 ? (item.estimated_sales / item.reviews).toFixed(1) : '0';
            title = `Based on ${item.reviews.toLocaleString()} reviews (multiplier ${multiplier}x)`;
        } else if (countKey === 'revenue') {
            displayValue = formatCurrency(item.revenue);
            title = 'Estimated gross revenue before Steam cut and regional adjustments';
        } else if (countKey === 'review_score') {
            displayValue = `${item.review_score}%`;
            subValue = `${item.reviews.toLocaleString()} reviews`;
            title = item.review_score_desc || '';
            barWidth = item.review_score;
        }

        const price = priceLabel(meta);
        const onSale = meta && !meta.is_free && meta.discount_percent > 0;
        const priceTag = price ? `<span class="price-tag ${onSale ? 'sale' : ''}">${onSale ? `-${meta.discount_percent}% ` : ''}${price}</span>` : '';

        const row = document.createElement('li');
        row.className = `lb-row ${rank <= 3 ? `top-${rank}` : ''}`;
        row.innerHTML = `
            <span class="lb-rank">${rank}</span>
            <img class="lb-thumb" src="${art(game.id, 'header')}" alt="" loading="lazy" width="92" height="43">
            <div class="lb-main">
                <button class="lb-name" type="button" data-goto="${game.id}" title="Show ${escapeHtml(game.name)}">${escapeHtml(game.name)}</button>
                <div class="lb-sub"><span class="lb-studio">${escapeHtml(game.developer)}</span>${badgesFor(game, true)}${priceTag}</div>
                <div class="lb-bar ${countKey === 'review_score' ? scoreClass(item.review_score) : ''}"><span style="width:${barWidth.toFixed(1)}%"></span></div>
            </div>
            <div class="lb-value" title="${escapeHtml(title)}">
                <span>${displayValue}</span>
                ${subValue ? `<small>${subValue}</small>` : ''}
            </div>
            ${compareButton(game.id, 'icon-only')}
        `;
        list.appendChild(row);
    });
}

function updateControlsUI() {
    const container = document.getElementById('comparison-list');
    container.innerHTML = '';
    document.getElementById('clear-comparison-btn').hidden = comparisonAppids.length === 0;

    comparisonAppids.forEach((appid, index) => {
        const game = findGame(appid);
        if (!game) return;

        const color = COLORS[index % COLORS.length];
        const tag = document.createElement('div');
        tag.className = 'comparison-tag';
        tag.style.setProperty('--tag-color', color);
        tag.innerHTML = `
            <img src="${art(appid, 'header')}" alt="" loading="lazy">
            <span>${escapeHtml(game.name)}</span>
            <button type="button" data-compare="${appid}" title="Remove ${escapeHtml(game.name)}" aria-label="Remove ${escapeHtml(game.name)}">×</button>
        `;
        container.appendChild(tag);
    });

    updateComparisonSelector();
}

function updateComparisonSelector() {
    const selector = document.getElementById('compare-selector');
    if (!selector) return;

    selector.innerHTML = '<option value="" disabled selected>+ Add a game to compare…</option>';
    selector.disabled = comparisonAppids.length >= COLORS.length;

    allGames.forEach(game => {
        if (!comparisonAppids.includes(game.id)) {
            const option = document.createElement('option');
            option.value = game.id;
            option.textContent = `${game.name} (${game.developer})`;
            selector.appendChild(option);
        }
    });
}

function loadComparisonState() {
    try {
        const parsed = JSON.parse(localStorage.getItem('comparisonAppids') || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveComparisonState() {
    try {
        localStorage.setItem('comparisonAppids', JSON.stringify(comparisonAppids));
    } catch {
        // Storage unavailable (private mode); comparison just won't persist
    }
}

function toggleComparison(appid) {
    appid = parseInt(appid);
    const index = comparisonAppids.indexOf(appid);
    if (index === -1) {
        if (comparisonAppids.length >= COLORS.length) {
            showToast(`You can compare up to ${COLORS.length} games at once`);
            return;
        }
        comparisonAppids.push(appid);
        const game = findGame(appid);
        if (game) showToast(`Added ${game.name} to comparison`);
    } else {
        comparisonAppids.splice(index, 1);
    }

    saveComparisonState();
    updateControlsUI();
    refreshComparison();
    updateToggleButtons();
}

function updateToggleButtons() {
    document.querySelectorAll('.compare-btn').forEach(btn => {
        const appid = parseInt(btn.dataset.compare);
        const active = comparisonAppids.includes(appid);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active);
        btn.title = active ? 'Remove from comparison' : 'Add to comparison';
        btn.innerHTML = `${active ? CHECK_SVG : PLUS_SVG}<span class="compare-label">${active ? 'Comparing' : 'Compare'}</span>`;
    });
}

function clearComparison() {
    comparisonAppids = [];
    saveComparisonState();
    updateControlsUI();
    updateToggleButtons();
    refreshComparison();
}

let toastTimer;
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function scrollToGame(appid) {
    let card = document.querySelector(`.game-card[data-appid="${appid}"]`);
    if (!card) return;

    if (card.hidden) {
        // Reset filters so the requested game is visible
        document.getElementById('game-search').value = '';
        libraryFilter = 'all';
        document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
        applyLibraryView();
    }

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('flash');
    void card.offsetWidth; // restart animation
    card.classList.add('flash');
}

function statBlock(label, valueHtml, extraClass = '') {
    return `<div class="game-stat ${extraClass}"><span class="label">${label}</span><span class="value">${valueHtml}</span></div>`;
}

function initializeChartGrid() {
    const grid = document.getElementById('individual-charts-grid');
    grid.innerHTML = '';

    for (const game of allGames) {
        const meta = metadataById.get(game.id);
        const players = currentById.get(game.id);
        const card = document.createElement('article');
        card.className = 'game-card';
        card.dataset.appid = game.id;
        card.dataset.name = game.name;
        card.dataset.developer = game.developer;
        card.dataset.release = game.release || '';
        card.dataset.store = game.store || '';

        const hasReviews = meta && meta.review_score !== null && meta.review_score !== undefined;
        let reviewHtml = '-';
        if (hasReviews) {
            reviewHtml = `<span class="${scoreClass(meta.review_score)}">${meta.review_score}%</span><small>${escapeHtml(meta.review_score_desc || '')}</small>`;
        }
        let recentHtml = '';
        if (meta && meta.recent_review_score !== null && meta.recent_review_score !== undefined) {
            recentHtml = `<small title="${(meta.recent_reviews || 0).toLocaleString()} reviews in the last 30 days">Recent <span class="${scoreClass(meta.recent_review_score)}">${meta.recent_review_score}%</span></small>`;
        }
        const hasSales = meta && meta.estimated_sales;

        // Steam-style price tag on the artwork
        let priceTag = '';
        const price = priceLabel(meta);
        if (meta && !meta.is_free && meta.discount_percent > 0 && meta.price) {
            priceTag = `<span class="art-price sale"><span class="discount">-${meta.discount_percent}%</span><s>${Math.round(meta.initial_price)}</s> ${escapeHtml(price)}</span>`;
        } else if (price) {
            priceTag = `<span class="art-price">${escapeHtml(price)}</span>`;
        }

        const liveBadge = players
            ? `<span class="art-live"><span class="live-dot"></span>${players.toLocaleString()} playing</span>`
            : '';

        card.innerHTML = `
            <div class="game-art">
                <img src="${art(game.id, 'header')}" alt="" loading="lazy" width="460" height="215">
                <span class="art-fallback">${escapeHtml(game.name)}</span>
                <div class="art-badges">${badgesFor(game)}</div>
                ${liveBadge}
                ${priceTag}
            </div>
            <div class="game-body">
                <div class="game-title-row">
                    <div class="game-title">
                        <h3>${escapeHtml(game.name)}</h3>
                        <div class="game-studio">${escapeHtml(game.developer)}</div>
                    </div>
                    <div class="game-links">
                        <a href="https://store.steampowered.com/app/${game.id}" target="_blank" rel="noopener" class="icon-link" title="View on Steam" aria-label="${escapeHtml(game.name)} on Steam">${STEAM_SVG}</a>
                        <a href="https://steamdb.info/app/${game.id}/" target="_blank" rel="noopener" class="icon-link" title="View on SteamDB" aria-label="${escapeHtml(game.name)} on SteamDB">${STEAMDB_SVG}</a>
                    </div>
                </div>
                ${hasReviews || hasSales ? `
                <div class="game-stats-row">
                    ${statBlock('Rating', reviewHtml + recentHtml)}
                    ${statBlock('Owners <span>est.</span>', hasSales ? formatSales(meta.estimated_sales) : '-')}
                    ${statBlock('Revenue <span>NOK</span>', hasSales ? formatSales(Math.round(meta.revenue)) : '-')}
                </div>` : ''}
                <div class="chart-container game-chart" id="chart-box-${game.id}">
                    <div class="chart-skeleton"></div>
                </div>
                ${compareButton(game.id, 'wide')}
            </div>
        `;
        grid.appendChild(card);
        observer.observe(card);
    }
}

function sortValue(game, key) {
    const meta = metadataById.get(game.id) || {};
    switch (key) {
        case 'owners': return meta.estimated_sales || 0;
        case 'rating': return meta.reviews >= 10 ? (meta.review_score || 0) * 1e7 + meta.reviews : -1;
        default: return currentById.get(game.id) || 0;
    }
}

function applyLibraryView() {
    const q = document.getElementById('game-search').value.trim().toLowerCase();
    const sortKey = document.getElementById('sort-select').value;
    const grid = document.getElementById('individual-charts-grid');

    const games = [...allGames];
    if (sortKey !== 'name') {
        games.sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey) || a.name.localeCompare(b.name));
    }

    let visible = 0;
    for (const game of games) {
        const card = grid.querySelector(`.game-card[data-appid="${game.id}"]`);
        if (!card) continue;

        const haystack = `${game.name} ${game.developer} ${game.release || ''} ${game.store || ''}`.toLowerCase();
        const matchesFilter = libraryFilter === 'all' || game.release === libraryFilter;
        const show = matchesFilter && haystack.includes(q);
        card.hidden = !show;
        if (show) visible++;
        grid.appendChild(card); // re-append in sorted order
    }

    document.getElementById('library-count').textContent = visible === allGames.length ? allGames.length : `${visible} / ${allGames.length}`;
    document.getElementById('no-results').hidden = visible > 0;
}

function refreshCharts() {
    // Clear all chart instances and re-render
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    refreshComparison();

    // The intersection observer will trigger re-rendering of visible individual charts
    document.querySelectorAll('.game-card').forEach(card => {
        observer.unobserve(card);
        observer.observe(card);
    });
}

function refreshComparison() {
    if (chartInstances['comparison']) {
        chartInstances['comparison'].destroy();
        delete chartInstances['comparison'];
    }

    const hasGames = comparisonAppids.length > 0;
    document.getElementById('no-comparison-placeholder').hidden = hasGames;
    document.getElementById('comparison-chart-wrapper').hidden = !hasGames;
    if (hasGames) renderComparisonChart();
}

function getRangeParams() {
    const params = new URLSearchParams();
    if (timeRange.type === '24h') {
        params.append('start', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    } else if (timeRange.type === '7d') {
        params.append('start', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    } else if (timeRange.type === '30d') {
        params.append('start', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    } else if (timeRange.type === 'custom') {
        if (timeRange.start) {
            const d = new Date(timeRange.start);
            if (!isNaN(d.getTime())) params.append('start', d.toISOString());
        }
        if (timeRange.end) {
            const d = new Date(timeRange.end);
            if (!isNaN(d.getTime())) params.append('end', d.toISOString());
        }
    }
    return params;
}

const parseDate = (ts) => new Date(ts.replace(' ', 'T') + 'Z').getTime();

const getChartOptions = (showLegend) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
        intersect: false,
        mode: 'index',
        axis: 'x'
    },
    plugins: {
        legend: {
            display: showLegend,
            position: 'top',
            align: 'end',
            labels: {
                color: TEXT_COLOR,
                font: { family: 'Inter', size: 11, weight: '600' },
                boxWidth: 8,
                boxHeight: 8,
                usePointStyle: true,
                padding: 14
            }
        },
        tooltip: {
            backgroundColor: 'rgba(12, 17, 23, 0.96)',
            titleColor: '#fff',
            titleFont: { family: 'Inter', size: 12, weight: '600' },
            bodyColor: '#c7d0db',
            bodyFont: { family: 'Inter', size: 12 },
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 10,
            mode: 'index',
            intersect: false,
            usePointStyle: true,
            boxPadding: 6,
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) label += ': ';
                    if (context.parsed.y !== null) {
                        label += context.parsed.y.toLocaleString();
                    }
                    return label;
                }
            }
        }
    },
    scales: {
        x: {
            type: 'time',
            grid: { display: false },
            border: { display: false },
            ticks: {
                color: TEXT_COLOR,
                font: { family: 'Inter', size: 10 },
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 6
            }
        },
        y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: GRID_COLOR },
            ticks: {
                color: TEXT_COLOR,
                font: { family: 'Inter', size: 10 },
                maxTicksLimit: 4,
                callback: (value) => {
                    if (value >= 1000000) return (value / 1000000) + 'M';
                    if (value >= 1000) return (value / 1000) + 'K';
                    return value;
                }
            }
        }
    }
});

async function renderGameChart(appid) {
    pendingCharts.add(appid);
    try {
        const params = getRangeParams();
        const response = await fetch(`/api/stats/${appid}?${params.toString()}`);
        const stats = await response.json();

        const box = document.getElementById(`chart-box-${appid}`);
        if (!box) return;

        if (stats.length === 0) {
            const game = findGame(parseInt(appid));
            const meta = metadataById.get(parseInt(appid));
            const upcoming = game && game.release === 'Upcoming';
            const description = meta && meta.short_description
                ? `<p class="chart-empty-desc">${escapeHtml(meta.short_description)}</p>` : '';
            box.innerHTML = `
                <div class="chart-empty">
                    <strong>${upcoming ? 'Not released yet' : 'No player data for this period'}</strong>
                    ${description}
                </div>`;
            return;
        }

        box.innerHTML = '<canvas></canvas>';
        const ctx = box.querySelector('canvas').getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, 0, 160);
        gradient.addColorStop(0, 'rgba(102, 192, 244, 0.35)');
        gradient.addColorStop(1, 'rgba(102, 192, 244, 0)');

        chartInstances[appid] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Players',
                    data: stats.map(s => ({ x: parseDate(s.timestamp), y: s.player_count })),
                    borderColor: CHART_BORDER_COLOR,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: CHART_BORDER_COLOR,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: getChartOptions(false)
        });
    } finally {
        pendingCharts.delete(appid);
    }
}

async function renderComparisonChart() {
    const allRoundedTimes = new Set();
    const step = 10 * 60 * 1000;
    const params = getRangeParams();
    const appids = [...comparisonAppids];

    const results = await Promise.all(appids.map(appid =>
        fetch(`/api/stats/${appid}?${params.toString()}`).then(r => r.json())
    ));

    // A newer refresh started while we were fetching; let it draw instead
    if (appids.join() !== comparisonAppids.join() || chartInstances['comparison']) return;

    const allStatsData = [];
    results.forEach((stats, i) => {
        if (stats.length === 0) return;
        const gameStatsMap = {};
        for (const s of stats) {
            const roundedT = Math.round(parseDate(s.timestamp) / step) * step;
            gameStatsMap[roundedT] = s.player_count;
            allRoundedTimes.add(roundedT);
        }
        allStatsData.push({ appid: appids[i], colorIndex: i, gameStatsMap });
    });

    const wrapper = document.getElementById('comparison-chart-wrapper');
    if (allRoundedTimes.size === 0) {
        wrapper.innerHTML = '<div class="chart-empty"><strong>No player data for this period</strong></div>';
        return;
    }
    wrapper.innerHTML = '<canvas id="comparison-chart"></canvas>';
    const ctx = document.getElementById('comparison-chart').getContext('2d');

    const sortedTimes = Array.from(allRoundedTimes).sort((a, b) => a - b);
    const datasets = allStatsData.map(({ appid, colorIndex, gameStatsMap }) => {
        const game = findGame(appid);
        const color = COLORS[colorIndex % COLORS.length];
        return {
            label: game ? game.name : `AppID ${appid}`,
            data: sortedTimes.map(t => gameStatsMap[t] ?? null),
            borderColor: color,
            backgroundColor: color + '22',
            borderWidth: 2,
            fill: false,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBorderWidth: 2,
            spanGaps: true
        };
    });

    chartInstances['comparison'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedTimes,
            datasets
        },
        options: getChartOptions(true)
    });
}

document.addEventListener('DOMContentLoaded', init);
