const axios = require('axios');
const config = require('./config');
const db = require('./db');

async function fetchPlayerCount(appid) {
  try {
    const url = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`;
    const response = await axios.get(url);
    if (response.data && response.data.response && response.data.response.result === 1) {
      return response.data.response.player_count;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching player count for ${appid}:`, error.message);
    return null;
  }
}

async function backfillHistory(appid) {
  try {
    console.log(`Backfilling history for ${appid}...`);
    const url = `https://steamcharts.com/app/${appid}/chart-data.json`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (Array.isArray(response.data)) {
      for (const [timestamp, count] of response.data) {
        const date = new Date(timestamp).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
        await db.insertStat(appid, count, date);
      }
      console.log(`Successfully backfilled ${response.data.length} records for ${appid}`);
    }
  } catch (error) {
    console.warn(`Could not backfill history for ${appid}: ${error.message}`);
  }
}

async function collectAll() {
  console.log(`[${new Date().toISOString()}] Starting collection...`);
  for (const game of config.games) {
    if (!game.id) {
      console.warn(`Skipping game with missing ID: ${game.name}`);
      continue;
    }

    // Check if we need to backfill
    const countRecords = await db.getStatCount(game.id);
    if (countRecords < 50) {
      await backfillHistory(game.id);
      // Wait a bit after backfill to be nice to SteamCharts
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const count = await fetchPlayerCount(game.id);
    if (count !== null) {
      await db.insertStat(game.id, count);
      console.log(`Collected ${game.name} (${game.id}): ${count}`);
    }
    // Respectful delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log(`[${new Date().toISOString()}] Collection finished.`);
}

if (require.main === module) {
  collectAll();
}

module.exports = collectAll;
