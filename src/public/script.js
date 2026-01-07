let timeRange = { type: '30d', start: null, end: null };
let comparisonAppids = JSON.parse(localStorage.getItem('comparisonAppids') || '[]');

const COLORS = ['#66c0f4', '#f46666', '#66f466', '#f4f466', '#f466f4', '#66f4f4'];
const CHART_BG_COLOR = 'rgba(102, 192, 244, 0.1)';
const CHART_BORDER_COLOR = '#66c0f4';
const TEXT_COLOR = '#c5c3c0';
const GRID_COLOR = 'rgba(255, 255, 255, 0.1)';

let chartInstances = {};
let allGames = [];
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

    const leaderboardsResponse = await fetch('/api/leaderboards');
    const leaderboards = await leaderboardsResponse.json();

    // Populate Leaderboards
    populateLeaderboard('current-leaderboard', leaderboards.current, allGames, 'player_count');
    populateLeaderboard('peak-leaderboard', leaderboards.peaks, allGames, 'peak_player_count');

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
    const totalPlayers = current.reduce((sum, item) => sum + item.player_count, 0);
    
    const topGameItem = current.length > 0 ? current[0] : null;
    const topGame = topGameItem ? allGames.find(g => g.id === topGameItem.appid) : null;

    const peakGameItem = peaks.length > 0 ? peaks[0] : null;
    const peakGame = peakGameItem ? allGames.find(g => g.id === peakGameItem.appid) : null;

    document.getElementById('total-players').textContent = totalPlayers.toLocaleString();
    document.getElementById('top-game').textContent = topGame ? topGame.name : '-';
    document.getElementById('peak-record').textContent = peakGame ? peakGame.name : '-';
    document.getElementById('total-games').textContent = allGames.length;
}

function filterGames(query) {
    const q = query.toLowerCase();
    const wrappers = document.querySelectorAll('.chart-wrapper');
    wrappers.forEach(wrapper => {
        const name = (wrapper.dataset.name || '').toLowerCase();
        const developer = (wrapper.dataset.developer || '').toLowerCase();
        if (name.includes(q) || developer.includes(q)) {
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
    
    data.forEach((item, index) => {
        const game = games.find(g => g.id === item.appid);
        const isComparing = comparisonAppids.includes(item.appid);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="rank-cell">${index + 1}</td>
            <td>
                <div class="game-name">${game ? game.name : 'Unknown'}</div>
                <div class="game-studio">${game ? game.developer : ''}</div>
            </td>
            <td class="count-cell">
                <div class="count-flex">
                    <span>${item[countKey].toLocaleString()}</span>
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
        const tag = document.createElement('div');
        tag.className = 'comparison-tag';
        tag.style.backgroundColor = COLORS[index % COLORS.length] + '33';
        tag.style.borderColor = COLORS[index % COLORS.length];
        
        tag.innerHTML = `
            <span>${game ? game.name : 'Unknown'}</span>
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
            btn.textContent = 'Comparing';
        } else {
            btn.classList.remove('active');
            btn.textContent = 'Compare';
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
        wrapper.innerHTML = `
            <div class="chart-header">
                <div class="title-container">
                    <h3>${game.name}</h3>
                    <div class="game-studio">${game.developer}</div>
                </div>
                <button class="compare-toggle ${isComparing ? 'active' : ''}" 
                        data-appid="${game.id}" 
                        onclick="toggleComparison(${game.id})">
                    ${isComparing ? 'Comparing' : 'Compare'}
                </button>
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

    const comparisonSection = document.getElementById('comparison-section');
    if (comparisonAppids.length > 0) {
        comparisonSection.style.display = 'block';
        renderComparisonChart();
    } else {
        comparisonSection.style.display = 'none';
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
        legend: { display: !!title, labels: { color: TEXT_COLOR } },
        tooltip: { 
            backgroundColor: 'rgba(23, 26, 33, 0.9)', 
            titleColor: CHART_BORDER_COLOR, 
            bodyColor: TEXT_COLOR,
            mode: 'index',
            intersect: false
        }
    },
    scales: {
        x: { 
            type: 'time', 
            grid: { color: GRID_COLOR },
            ticks: { color: TEXT_COLOR }
        },
        y: { 
            beginAtZero: true, 
            grid: { color: GRID_COLOR },
            ticks: { color: TEXT_COLOR }
        }
    }
});

async function renderGameChart(appid, name) {
    const params = getRangeParams();
    const response = await fetch(`/api/stats/${appid}?${params.toString()}`);
    const stats = await response.json();

    const canvas = document.getElementById(`chart-${appid}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (stats.length === 0) {
        ctx.fillStyle = TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.fillText('No data for this period', canvas.width/2, canvas.height/2);
        return;
    }

    chartInstances[appid] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Players',
                data: stats.map(s => ({ x: parseDate(s.timestamp), y: s.player_count })),
                borderColor: CHART_BORDER_COLOR,
                backgroundColor: CHART_BG_COLOR,
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 5
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
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 5,
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
