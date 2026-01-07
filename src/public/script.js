async function init() {
    const gamesResponse = await fetch('/api/games');
    const games = await gamesResponse.json();

    const latestResponse = await fetch('/api/latest');
    const latestStats = await latestResponse.json();

    const leaderboardsResponse = await fetch('/api/leaderboards');
    const leaderboards = await leaderboardsResponse.json();

    const latestStatsDiv = document.getElementById('latest-stats');
    const chartContainer = document.getElementById('chart-container');

    // Populate Leaderboards
    populateLeaderboard('current-leaderboard', leaderboards.current, games, 'player_count');
    populateLeaderboard('peak-leaderboard', leaderboards.peaks, games, 'peak_player_count');

    games.forEach(game => {
        const stat = latestStats.find(s => s.appid === game.id);
        const playerCount = stat ? stat.player_count : 'N/A';

        // Create game card
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <h3>${game.name}</h3>
            <div class="player-count">${playerCount.toLocaleString()}</div>
            <p>Players Online</p>
        `;
        latestStatsDiv.appendChild(card);

        // Create chart wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-wrapper';
        wrapper.innerHTML = `
            <h3>${game.name} - Players Over Time</h3>
            <canvas id="chart-${game.id}"></canvas>
        `;
        chartContainer.appendChild(wrapper);

        // Fetch and render chart
        renderChart(game.id, game.name);
    });
}

function populateLeaderboard(tableId, data, games, countKey) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';
    
    data.forEach((item, index) => {
        const game = games.find(g => g.id === item.appid);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${game ? game.name : 'Unknown'}</td>
            <td>${item[countKey].toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });
}

async function renderChart(appid, name) {
    const response = await fetch(`/api/stats/${appid}`);
    const stats = await response.json();

    const ctx = document.getElementById(`chart-${appid}`).getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: stats.map(s => new Date(s.timestamp).toLocaleTimeString()),
            datasets: [{
                label: 'Players Online',
                data: stats.map(s => s.player_count),
                borderColor: '#66c0f4',
                backgroundColor: 'rgba(102, 192, 244, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Time' }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Players' },
                    beginAtZero: true
                }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
