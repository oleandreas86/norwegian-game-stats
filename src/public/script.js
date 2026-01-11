let timeRange = { type: '30d', start: null, end: null };
let comparisonAppids = JSON.parse(localStorage.getItem('comparisonAppids') || '[]');

const COLORS = ['#66c0f4', '#f46666', '#66f466', '#f4f466', '#f466f4', '#66f4f4'];
const CHART_BG_COLOR = 'rgba(102, 192, 244, 0.1)';
const CHART_BORDER_COLOR = '#66c0f4';
const TEXT_COLOR = '#c5c3c0';
const GRID_COLOR = 'rgba(255, 255, 255, 0.1)';

const STEAM_SVG = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 .007c-.125 0-.252.004-.377.008L4.662 10.02c-.896-.036-1.742.368-2.235 1.096L0 12.871l5.248 2.162c.245-.075.502-.115.768-.115.53 0 1.026.16 1.442.433l3.522-5.087V10.2c0-2.522 2.044-4.566 4.566-4.566 2.521 0 4.565 2.044 4.565 4.566s-2.044 4.565-4.565 4.565c-.053 0-.106-.002-.158-.004l-5.115 3.511c.006.082.012.164.012.247 0 2.376-1.926 4.303-4.302 4.303-.508 0-1-.088-1.455-.25L5.732 24H12c6.627 0 12-5.373 12-12S18.627.007 12 .007zm3.442 8.358c1.012 0 1.832.82 1.832 1.833 0 1.012-.82 1.832-1.832 1.832s-1.832-.82-1.832-1.832c0-1.013.82-1.833 1.832-1.833z"/></svg>`;
const STEAMDB_SVG = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M2.5 19h19v2h-19zm4.5-4h3v3h-3zm5-5h3v8h-3zm5-5h3v13h-3z"/></svg>`;
const STAR_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
const TREND_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`;
const TAG_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;
const USERS_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
const MONEY_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;

let chartInstances = {};
let allGames = [];
let allMetadata = [];
let observer;

async function init() {
    // Set default dates for custom range
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    document.getElementById('start-date').value = thirtyDaysAgo.toISOString().slice(0, 16);
    document.getElementById('end-date').value = now.toISOString().slice(0, 16);

    const gamesResponse = await fetch('/api/games');
    allGames = await gamesResponse.json();
    allGames.sort((a, b) => a.name.localeCompare(b.name));

    // Filter out comparisonAppids that no longer exist in current config
    const originalCount = comparisonAppids.length;
    comparisonAppids = comparisonAppids.filter(id => allGames.some(g => g.id === id));
    if (comparisonAppids.length !== originalCount) {
        saveComparisonState();
    }

    const leaderboardsResponse = await fetch('/api/leaderboards');
    const leaderboards = await leaderboardsResponse.json();
    allMetadata = (leaderboards.metadata || []).map(m => {
        // Advanced Revenue Calculation: 
        // For paid games, we use (Initial Price * 0.8) as the average selling price.
        // For F2P games, we use a heuristic based on monetization markers (IAP, MMO, DLCs).
        let avgPrice = (m.initial_price || m.price || 0) * 0.8;
        
        if (m.is_free && avgPrice === 0) {
            avgPrice = 5; // Base ARPU (Average Revenue Per User) for indie F2P
            if (m.has_iap) avgPrice += 10;
            if (m.is_mmo) avgPrice += 25;
            avgPrice += (m.dlc_count || 0) * 2;
        }

        return {
            ...m,
            revenue: (m.estimated_sales || 0) * avgPrice
        };
    });

    // Populate Leaderboards
    populateLeaderboard('current-leaderboard', leaderboards.current, allGames, 'player_count');
    populateLeaderboard('peak-leaderboard', leaderboards.peaks, allGames, 'peak_player_count');
    
    if (leaderboards.metadata) {
        const sortedSales = [...allMetadata].sort((a, b) => b.estimated_sales - a.estimated_sales);
        populateLeaderboard('sales-leaderboard', sortedSales, allGames, 'estimated_sales');

        const sortedRevenue = [...allMetadata].sort((a, b) => b.revenue - a.revenue);
        populateLeaderboard('revenue-leaderboard', sortedRevenue, allGames, 'revenue');

        const sortedRatings = [...allMetadata]
            .filter(item => item.review_score !== null && item.reviews >= 10)
            .sort((a, b) => b.review_score - a.review_score || b.reviews - a.reviews);
        populateLeaderboard('rating-leaderboard', sortedRatings, allGames, 'review_score');
    }

    // Update Global Stats
    updateGlobalStats(leaderboards);

    // Setup controls
    document.getElementById('time-range-type').addEventListener('change', (e) => {
        timeRange.type = e.target.value;
        document.getElementById('custom-range-inputs').style.display = timeRange.type === 'custom' ? 'block' : 'none';
        refreshCharts();
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
    document.getElementById('game-search').addEventListener('input', (e) => filterGames(e.target.value));
    
    // Initialize Intersection Observer for lazy loading
    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const appid = entry.target.dataset.appid;
                const name = entry.target.dataset.name;
                if (appid && !chartInstances[appid]) {
                    renderGameChart(appid, name);
                }
            }
        });
    }, { rootMargin: '200px' });

    updateControlsUI();
    initializeChartGrid();
    refreshComparison();
}

function updateGlobalStats(leaderboards) {
    const current = leaderboards.current || [];
    const peaks = leaderboards.peaks || [];
    const metadata = leaderboards.metadata || [];
    
    const totalPlayers = current.reduce((sum, item) => sum + item.player_count, 0);
    
    const topGameItem = current.length > 0 ? current[0] : null;
    const topGame = topGameItem ? allGames.find(g => g.id === topGameItem.appid) : null;

    const sortedMetadata = [...metadata].sort((a, b) => b.estimated_sales - a.estimated_sales);
    const topSellerItem = sortedMetadata.length > 0 ? sortedMetadata[0] : null;
    const topSeller = topSellerItem ? allGames.find(g => g.id === topSellerItem.appid) : null;

    const metadataWithRevenue = metadata.map(m => {
        let avgPrice = (m.initial_price || m.price || 0) * 0.8;
        if (m.is_free && avgPrice === 0) {
            avgPrice = 5;
            if (m.has_iap) avgPrice += 10;
            if (m.is_mmo) avgPrice += 25;
            avgPrice += (m.dlc_count || 0) * 2;
        }
        return {
            ...m,
            revenue: (m.estimated_sales || 0) * avgPrice
        };
    });
    const sortedRevenue = [...metadataWithRevenue].sort((a, b) => b.revenue - a.revenue);
    const topRevenueItem = sortedRevenue.length > 0 ? sortedRevenue[0] : null;
    const topRevenue = topRevenueItem ? allGames.find(g => g.id === topRevenueItem.appid) : null;

    const peakGameItem = peaks.length > 0 ? peaks[0] : null;
    const peakGame = peakGameItem ? allGames.find(g => g.id === peakGameItem.appid) : null;

    const sortedRatings = [...metadata]
        .filter(item => item.review_score !== null && item.reviews >= 10)
        .sort((a, b) => b.review_score - a.review_score || b.reviews - a.reviews);
    const bestRatedItem = sortedRatings.length > 0 ? sortedRatings[0] : null;
    const bestRated = bestRatedItem ? allGames.find(g => g.id === bestRatedItem.appid) : null;

    document.getElementById('total-players').textContent = totalPlayers.toLocaleString();
    
    document.getElementById('top-game').textContent = topGame ? topGame.name : '-';
    document.getElementById('top-game-val').textContent = topGameItem ? `${topGameItem.player_count.toLocaleString()} Players` : '';

    document.getElementById('top-seller').textContent = topSeller ? topSeller.name : '-';
    document.getElementById('top-seller-val').textContent = topSellerItem ? `${formatSales(topSellerItem.estimated_sales)} Est. Owners` : '';

    document.getElementById('top-revenue').textContent = topRevenue ? topRevenue.name : '-';
    document.getElementById('top-revenue-val').textContent = topRevenueItem ? `${formatCurrency(topRevenueItem.revenue)} Est.` : '';

    document.getElementById('best-rated').textContent = bestRated ? bestRated.name : '-';
    document.getElementById('best-rated-val').textContent = bestRatedItem ? `${bestRatedItem.review_score}% (${bestRatedItem.reviews.toLocaleString()} reviews)` : '';

    document.getElementById('peak-record').textContent = peakGame ? peakGame.name : '-';
    document.getElementById('peak-record-val').textContent = peakGameItem ? `${peakGameItem.peak_player_count.toLocaleString()} Peak` : '';

    document.getElementById('total-games').textContent = allGames.length;
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
    return value.toLocaleString() + ' NOK';
}

function filterGames(query) {
    const q = query.toLowerCase();
    const wrappers = document.querySelectorAll('.chart-wrapper');
    wrappers.forEach(wrapper => {
        const name = (wrapper.dataset.name || '').toLowerCase();
        const developer = (wrapper.dataset.developer || '').toLowerCase();
        const release = (wrapper.dataset.release || '').toLowerCase();
        const store = (wrapper.dataset.store || '').toLowerCase();
        
        if (name.includes(q) || developer.includes(q) || release.includes(q) || store.includes(q)) {
            wrapper.style.display = 'flex';
        } else {
            wrapper.style.display = 'none';
        }
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const activeBtn = document.querySelector(`.tab-btn[onclick*="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    const activeTab = document.getElementById(`${tabId}-tab`);
    if (activeTab) activeTab.classList.add('active');
}

function populateLeaderboard(tableId, data, games, countKey) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';
    
    let rank = 1;
    data.forEach((item) => {
        const game = games.find(g => g.id === item.appid);
        if (!game) return; // Skip games that are no longer in config
        
        const isComparing = comparisonAppids.includes(item.appid);
        
        const metadata = allMetadata.find(m => m.appid === item.appid);
        let priceInfo = '';
        if (metadata) {
            if (metadata.is_free) {
                priceInfo = '<span class="price-tag">Free</span>';
            } else if (metadata.price) {
                if (metadata.discount_percent > 0) {
                    priceInfo = `<span class="price-tag sale">-${metadata.discount_percent}% ${Math.round(metadata.price)} NOK</span>`;
                } else {
                    priceInfo = `<span class="price-tag">${Math.round(metadata.price)} NOK</span>`;
                }
            }
        }

        let countTitle = '';
        let displayValue = item[countKey].toLocaleString();
        let subValue = '';

        if (countKey === 'estimated_sales' && item.reviews !== undefined) {
            const multiplier = item.reviews > 0 ? (item.estimated_sales / item.reviews).toFixed(1) : '0';
            countTitle = `${game.name}: Based on ${item.reviews.toLocaleString()} reviews (Multiplier: ${multiplier}x)`;
        } else if (countKey === 'revenue') {
            displayValue = formatCurrency(item.revenue);
            countTitle = `${game.name}: Estimated gross revenue before Steam cut and regional adjustments.`;
        } else if (countKey === 'review_score') {
            displayValue = `${item[countKey]}%`;
            subValue = `<div class="review-count-small">${item.reviews.toLocaleString()} reviews</div>`;
            countTitle = `${game.name}: ${item.review_score_desc || ''}`;
        }

        let badges = '';
        if (game.release === 'Upcoming') badges += '<span class="badge badge-upcoming">Upcoming</span> ';
        if (game.release === 'Early Access') badges += '<span class="badge badge-early-access">EA</span> ';
        if (game.store === 'Delisted/Retired') badges += '<span class="badge badge-delisted">Delisted</span> ';

        const row = document.createElement('tr');
        
        let scoreCell = '';
        if (tableId === 'sales-leaderboard') {
            const score = item.review_score !== null ? `${item.review_score}%` : '-';
            const scoreDesc = item.review_score_desc || '';
            const reviewCount = item.reviews !== null ? `<div class="review-count-small">${item.reviews.toLocaleString()} reviews</div>` : '';
            scoreCell = `<td class="score-cell" title="${scoreDesc}">${score}${reviewCount}</td>`;
        }

        row.innerHTML = `
            <td class="rank-cell">${rank++}</td>
            <td class="game-cell">
                <div class="game-name-flex">
                    <div class="game-name">${game.name} ${badges}</div>
                </div>
                <div class="game-studio-flex">
                    <span class="game-studio">${game.developer}</span>
                    ${priceInfo}
                </div>
            </td>
            ${scoreCell}
            <td class="count-cell">
                <div class="count-flex">
                    <span title="${countTitle}">${displayValue}${subValue}</span>
                    <button class="compare-btn-small ${isComparing ? 'active' : ''}" 
                            onclick="toggleComparison(${item.appid})" 
                            title="${isComparing ? 'Remove from comparison' : 'Add to comparison'}">
                        ${isComparing ? '➖' : '➕'}
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function updateControlsUI() {
    const container = document.getElementById('comparison-list');
    const actions = document.getElementById('comparison-actions');
    container.innerHTML = '';

    if (comparisonAppids.length > 0) {
        actions.style.display = 'flex';
    } else {
        actions.style.display = 'none';
    }

    comparisonAppids.forEach((appid, index) => {
        const game = allGames.find(g => g.id === appid);
        if (!game) return;

        const tag = document.createElement('div');
        tag.className = 'comparison-tag';
        tag.style.backgroundColor = COLORS[index % COLORS.length] + '33';
        tag.style.borderColor = COLORS[index % COLORS.length];
        
        tag.innerHTML = `
            <span>${game.name}</span>
            <button onclick="toggleComparison(${appid})" title="Remove">×</button>
        `;
        container.appendChild(tag);
    });

    updateComparisonSelector();
}

function updateComparisonSelector() {
    const selector = document.getElementById('compare-selector');
    if (!selector) return;

    // Reset with placeholder
    selector.innerHTML = '<option value="" disabled selected>Add game to compare...</option>';

    allGames.forEach(game => {
        if (!comparisonAppids.includes(game.id)) {
            const option = document.createElement('option');
            option.value = game.id;
            option.textContent = `${game.name} (${game.developer})`;
            selector.appendChild(option);
        }
    });
}

function saveComparisonState() {
    localStorage.setItem('comparisonAppids', JSON.stringify(comparisonAppids));
}

function toggleComparison(appid) {
    appid = parseInt(appid);
    const index = comparisonAppids.indexOf(appid);
    if (index === -1) {
        if (comparisonAppids.length >= COLORS.length) {
            alert('Maximum comparison projects reached (6)');
            return;
        }
        comparisonAppids.push(appid);
    } else {
        comparisonAppids.splice(index, 1);
    }
    
    saveComparisonState();
    updateControlsUI();
    refreshComparison();
    updateToggleButtons();
}

function updateToggleButtons() {
    // Update grid buttons
    document.querySelectorAll('.compare-toggle').forEach(btn => {
        const appid = parseInt(btn.dataset.appid);
        if (comparisonAppids.includes(appid)) {
            btn.classList.add('active');
            btn.innerHTML = '<span>➖</span> Comparing';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<span>➕</span> Compare';
        }
    });

    // Update leaderboard buttons
    document.querySelectorAll('.compare-btn-small').forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (!onclickAttr) return;
        const match = onclickAttr.match(/\d+/);
        if (!match) return;
        const appid = parseInt(match[0]);
        
        if (comparisonAppids.includes(appid)) {
            btn.classList.add('active');
            btn.textContent = '➖';
            btn.title = 'Remove from comparison';
        } else {
            btn.classList.remove('active');
            btn.textContent = '➕';
            btn.title = 'Add to comparison';
        }
    });
}

function clearComparison() {
    comparisonAppids = [];
    saveComparisonState();
    updateControlsUI();
    updateToggleButtons();
    refreshComparison();
}

function initializeChartGrid() {
    const individualGrid = document.getElementById('individual-charts-grid');
    individualGrid.innerHTML = '';
    
    for (const game of allGames) {
        const isComparing = comparisonAppids.includes(game.id);
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-wrapper';
        wrapper.dataset.appid = game.id;
        wrapper.dataset.name = game.name;
        wrapper.dataset.developer = game.developer;
        wrapper.dataset.release = game.release || '';
        wrapper.dataset.store = game.store || '';

        let badges = '';
        if (game.release === 'Upcoming') badges += '<span class="badge badge-upcoming">Upcoming</span> ';
        if (game.release === 'Early Access') badges += '<span class="badge badge-early-access">Early Access</span> ';
        if (game.store === 'Delisted/Retired') badges += '<span class="badge badge-delisted">Delisted</span> ';

        wrapper.innerHTML = `
            <div class="chart-header">
                <div class="title-container">
                    <div class="title-flex">
                        <h3>${game.name}</h3>
                        ${badges}
                        <div class="game-links">
                            <a href="https://store.steampowered.com/app/${game.id}" target="_blank" class="icon-link steam" title="View on Steam">${STEAM_SVG}</a>
                            <a href="https://steamdb.info/app/${game.id}/" target="_blank" class="icon-link steamdb" title="View on SteamDB">${STEAMDB_SVG}</a>
                        </div>
                    </div>
                    <div class="game-studio">${game.developer}</div>
                </div>
                <button class="compare-toggle ${isComparing ? 'active' : ''}" 
                        data-appid="${game.id}" 
                        onclick="toggleComparison(${game.id})">
                    ${isComparing ? '<span>➖</span> Comparing' : '<span>➕</span> Compare'}
                </button>
            </div>
            <div class="game-stats-row">
                <div class="game-stat">
                    <div class="stat-header">
                        ${STAR_SVG}
                        <span class="label">All-Time Score</span>
                    </div>
                    <span class="value" id="reviews-all-${game.id}">-</span>
                </div>
                <div class="game-stat">
                    <div class="stat-header">
                        ${TREND_SVG}
                        <span class="label">Recent Score</span>
                    </div>
                    <span class="value" id="reviews-recent-${game.id}">-</span>
                </div>
                <div class="game-stat">
                    <div class="stat-header">
                        ${TAG_SVG}
                        <span class="label">Price</span>
                    </div>
                    <span class="value" id="price-${game.id}">-</span>
                </div>
                <div class="game-stat">
                    <div class="stat-header">
                        ${USERS_SVG}
                        <span class="label">Est. Owners</span>
                    </div>
                    <span class="value" id="sales-${game.id}">-</span>
                </div>
                <div class="game-stat">
                    <div class="stat-header">
                        ${MONEY_SVG}
                        <span class="label">Est. Revenue</span>
                    </div>
                    <span class="value" id="revenue-${game.id}">-</span>
                </div>
            </div>
            <div class="chart-container">
                <canvas id="chart-${game.id}"></canvas>
            </div>
        `;
        individualGrid.appendChild(wrapper);
        observer.observe(wrapper);
    }
}

function refreshCharts() {
    // Clear all chart instances and re-render
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
    
    refreshComparison();
    
    // The intersection observer will trigger re-rendering of visible individual charts
    const wrappers = document.querySelectorAll('.chart-wrapper');
    wrappers.forEach(w => {
        // Force re-observation if already in view
        observer.unobserve(w);
        observer.observe(w);
    });
}

function refreshComparison() {
    if (chartInstances['comparison']) {
        chartInstances['comparison'].destroy();
        delete chartInstances['comparison'];
    }

    const placeholder = document.getElementById('no-comparison-placeholder');
    const chartWrapper = document.getElementById('comparison-chart-wrapper');

    if (comparisonAppids.length > 0) {
        if (placeholder) placeholder.style.display = 'none';
        if (chartWrapper) chartWrapper.style.display = 'flex';
        renderComparisonChart();
    } else {
        if (placeholder) placeholder.style.display = 'flex';
        if (chartWrapper) chartWrapper.style.display = 'none';
    }
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

const getChartOptions = (title) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { 
        intersect: false, 
        mode: 'index',
        axis: 'x'
    },
    plugins: {
        legend: { 
            display: !!title, 
            position: 'top',
            align: 'end',
            labels: { 
                color: TEXT_COLOR,
                font: { size: 11, weight: '600' },
                boxWidth: 12,
                boxHeight: 12,
                usePointStyle: true,
                padding: 15
            } 
        },
        tooltip: { 
            backgroundColor: 'rgba(23, 26, 33, 0.98)', 
            titleColor: CHART_BORDER_COLOR, 
            titleFont: { size: 13, weight: 'bold' },
            bodyColor: TEXT_COLOR,
            bodyFont: { size: 12 },
            borderColor: 'rgba(102, 192, 244, 0.2)',
            borderWidth: 1,
            padding: 14,
            cornerRadius: 12,
            mode: 'index',
            intersect: false,
            usePointStyle: true,
            boxPadding: 8,
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
            ticks: { 
                color: TEXT_COLOR, 
                font: { size: 10 },
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 7
            }
        },
        y: { 
            beginAtZero: true, 
            grid: { 
                color: GRID_COLOR,
                drawBorder: false,
                borderDash: [5, 5]
            },
            ticks: { 
                color: TEXT_COLOR, 
                font: { size: 10 },
                maxTicksLimit: 5,
                callback: (value) => {
                    if (value >= 1000000) return (value / 1000000) + 'M';
                    if (value >= 1000) return (value / 1000) + 'K';
                    return value;
                }
            }
        }
    }
});

async function renderGameChart(appid, name) {
    const params = getRangeParams();
    const response = await fetch(`/api/stats/${appid}?${params.toString()}`);
    const stats = await response.json();

    const canvas = document.getElementById(`chart-${appid}`);
    if (!canvas) return;

    // Update stats from metadata
    const metadata = allMetadata.find(m => m.appid == appid);
    if (metadata) {
        if (metadata.estimated_sales) {
            const salesEl = document.getElementById(`sales-${appid}`);
            if (salesEl) salesEl.textContent = metadata.estimated_sales.toLocaleString();
            
            const revenueEl = document.getElementById(`revenue-${appid}`);
            if (revenueEl) revenueEl.textContent = formatCurrency(metadata.revenue);
        }

        const priceEl = document.getElementById(`price-${appid}`);
        if (priceEl) {
            if (metadata.is_free) {
                priceEl.textContent = 'Free';
            } else if (metadata.price) {
                if (metadata.discount_percent > 0) {
                    priceEl.innerHTML = `<span class="sale-price">-${metadata.discount_percent}%</span> <span>${metadata.price.toFixed(0)} NOK</span> <span class="initial-price-small">${metadata.initial_price.toFixed(0)}</span>`;
                } else {
                    priceEl.textContent = `${metadata.price.toFixed(0)} NOK`;
                }
            } else {
                priceEl.textContent = '-';
            }
        }
    
        const allScoreEl = document.getElementById(`reviews-all-${appid}`);
        if (allScoreEl) {
            const score = metadata.review_score !== null ? `${metadata.review_score}%` : '-';
            const desc = metadata.review_score_desc || '';
            const count = metadata.reviews !== null ? `<div class="review-count">${metadata.reviews.toLocaleString()} reviews</div>` : '';
            allScoreEl.innerHTML = `<span>${score}</span>${desc ? `<span class="review-desc">${desc}</span>` : ''}${count}`;
        }

        const recentScoreEl = document.getElementById(`reviews-recent-${appid}`);
        if (recentScoreEl) {
            const score = metadata.recent_review_score !== null ? `${metadata.recent_review_score}%` : '-';
            const desc = metadata.recent_review_score_desc || '';
            const count = metadata.recent_reviews !== null ? `<div class="review-count">${metadata.recent_reviews.toLocaleString()} reviews</div>` : '';
            recentScoreEl.innerHTML = `<span>${score}</span>${desc ? `<span class="review-desc">${desc}</span>` : ''}${count}`;
        }
    }

    const ctx = canvas.getContext('2d');
    
    if (stats.length === 0) {
        ctx.fillStyle = TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.fillText('No data for this period', canvas.width/2, canvas.height/2);
        return;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(102, 192, 244, 0.25)');
    gradient.addColorStop(1, 'rgba(102, 192, 244, 0.02)');

    chartInstances[appid] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Players',
                data: stats.map(s => ({ x: parseDate(s.timestamp), y: s.player_count })),
                borderColor: CHART_BORDER_COLOR,
                backgroundColor: gradient,
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: CHART_BORDER_COLOR,
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2.5
            }]
        },
        options: getChartOptions(false)
    });
}

async function renderComparisonChart() {
    const allStatsData = [];
    const allRoundedTimes = new Set();
    const step = 10 * 60 * 1000;
    const params = getRangeParams();

    for (let i = 0; i < comparisonAppids.length; i++) {
        const appid = comparisonAppids[i];
        const response = await fetch(`/api/stats/${appid}?${params.toString()}`);
        const stats = await response.json();

        if (stats.length === 0) continue;

        const gameStatsMap = {};
        for (const s of stats) {
            const t = parseDate(s.timestamp);
            const roundedT = Math.round(t / step) * step;
            gameStatsMap[roundedT] = s.player_count;
            allRoundedTimes.add(roundedT);
        }
        allStatsData.push({ appid, gameStatsMap });
    }

    const canvas = document.getElementById('comparison-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (allRoundedTimes.size === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.fillText('No data for this period', canvas.width/2, canvas.height/2);
        return;
    }

    const sortedTimes = Array.from(allRoundedTimes).sort((a, b) => a - b);
    const datasets = allStatsData.map(({ appid, gameStatsMap }, i) => {
        const game = allGames.find(g => g.id === appid);
        return {
            label: game ? game.name : `AppID ${appid}`,
            data: sortedTimes.map(t => gameStatsMap[t] ?? null),
            borderColor: COLORS[i % COLORS.length],
            backgroundColor: COLORS[i % COLORS.length] + '22',
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
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
