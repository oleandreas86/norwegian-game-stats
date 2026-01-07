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

async function fetchReviews(appid) {
  try {
    const url = `https://store.steampowered.com/appreviews/${appid}?json=1&num_per_page=0&purchase_type=all&language=all`;
    const response = await axios.get(url);
    if (response.data && response.data.success === 1) {
      return response.data.query_summary.total_reviews;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching reviews for ${appid}:`, error.message);
    return null;
  }
}

async function fetchAppDetails(appid) {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=no`;
    const response = await axios.get(url);
    if (response.data && response.data[appid] && response.data[appid].success) {
      return response.data[appid].data;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching app details for ${appid}:`, error.message);
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

let isCollecting = false;

async function collectAll() {
  if (isCollecting) {
    console.log(`[${new Date().toISOString()}] Collection already in progress, skipping...`);
    return;
  }
  isCollecting = true;
  
  try {
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

      // Collect review metadata
      const reviews = await fetchReviews(game.id);
      const appDetails = await fetchAppDetails(game.id);

      if (reviews !== null) {
        let multiplier = 30; // Default fallback if appDetails missing

        if (appDetails) {
          let priceFactor = 1.0;
          if (appDetails.is_free) {
            priceFactor = 0.9; // Free games often have more reviews per owner (lower multiplier)
          } else if (appDetails.price_overview) {
            const price = appDetails.price_overview.final / 100; // in NOK
            if (price < 100) priceFactor = 1.5;
            else if (price < 300) priceFactor = 1.2;
            else priceFactor = 1.0;
          }

          let yearFactor = 1.0;
          if (appDetails.release_date && appDetails.release_date.date) {
            const yearMatch = appDetails.release_date.date.match(/\d{4}/);
            if (yearMatch) {
              const year = parseInt(yearMatch[0]);
              if (year >= 2024) yearFactor = 1.0;
              else if (year >= 2020) yearFactor = 1.2;
              else if (year >= 2015) yearFactor = 1.4;
              else yearFactor = 1.7; // Older games had fewer reviews per owner (higher multiplier)
            }
          }

          let specialFactor = 1.0;
          if (appDetails.genres && appDetails.genres.some(g => g.description === 'Massively Multiplayer')) {
            specialFactor = 2.0; // MMOs have much higher player-to-review ratios
          }

          multiplier = 25 * priceFactor * yearFactor * specialFactor;
        }

        const estimatedSales = Math.round(reviews * multiplier);
        await db.updateMetadata(game.id, reviews, estimatedSales);
        console.log(`Updated metadata for ${game.name}: ${reviews} reviews (multiplier ${multiplier.toFixed(1)}x), ~${estimatedSales} owners`);
      }

      // Respectful delay between requests
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    console.log(`[${new Date().toISOString()}] Collection finished.`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Collection failed:`, error.message);
  } finally {
    isCollecting = false;
  }
}

if (require.main === module) {
  collectAll();
}

module.exports = collectAll;
