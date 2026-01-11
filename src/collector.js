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
    const allTimeUrl = `https://store.steampowered.com/appreviews/${appid}?json=1&num_per_page=0&purchase_type=all&language=all`;
    const allTimeResponse = await axios.get(allTimeUrl);
    
    const recentUrl = `https://store.steampowered.com/appreviews/${appid}?json=1&num_per_page=0&purchase_type=all&language=all&day_range=30`;
    const recentResponse = await axios.get(recentUrl);

    let result = {
      total_reviews: null,
      review_score: null,
      review_score_desc: null,
      recent_review_score: null,
      recent_review_score_desc: null,
      recent_reviews: null
    };

    if (allTimeResponse.data && allTimeResponse.data.success === 1) {
      const summary = allTimeResponse.data.query_summary;
      result.total_reviews = summary.total_reviews;
      result.review_score = summary.total_reviews > 0 
        ? Math.round((summary.total_positive / summary.total_reviews) * 100) 
        : null;
      result.review_score_desc = summary.review_score_desc;
    }

    if (recentResponse.data && recentResponse.data.success === 1) {
      const summary = recentResponse.data.query_summary;
      result.recent_reviews = summary.total_reviews;
      result.recent_review_score = summary.total_reviews > 0 
        ? Math.round((summary.total_positive / summary.total_reviews) * 100) 
        : null;
      result.recent_review_score_desc = summary.review_score_desc;
    }

    return result;
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
      const reviewData = await fetchReviews(game.id);
      const appDetails = await fetchAppDetails(game.id);

      if (reviewData && reviewData.total_reviews !== null) {
        const reviews = reviewData.total_reviews;
        let multiplier = 15; // Base multiplier adjusted for language=all and purchase_type=all

        let finalPrice = null;
        let initialPrice = null;
        let discountPercent = 0;
        let isFree = false;
        let dlcCount = 0;
        let hasIap = false;
        let isMmo = false;

        if (appDetails) {
          isFree = appDetails.is_free;
          dlcCount = appDetails.dlc ? appDetails.dlc.length : 0;
          
          if (appDetails.categories) {
            hasIap = appDetails.categories.some(c => c.id === 35);
            if (!isMmo) {
              isMmo = appDetails.categories.some(c => c.id === 20); // MMO category
            }
          }

          if (appDetails.genres) {
            if (!isMmo) {
              isMmo = appDetails.genres.some(g => g.description === 'Massively Multiplayer');
            }
          }

          if (appDetails.price_overview) {
            finalPrice = appDetails.price_overview.final / 100;
            initialPrice = appDetails.price_overview.initial / 100;
            discountPercent = appDetails.price_overview.discount_percent;
          }

          let priceFactor = 1.0;
          if (isFree) {
            priceFactor = 1.5; // Free games have higher variance
          } else if (initialPrice !== null) {
            // Use initial price for a more stable estimation category
            if (initialPrice < 150) priceFactor = 2.3;
            else if (initialPrice < 350) priceFactor = 1.8;
            else priceFactor = 1.0;
          }

          let yearFactor = 1.0;
          if (appDetails.release_date && appDetails.release_date.date) {
            const yearMatch = appDetails.release_date.date.match(/\d{4}/);
            if (yearMatch) {
              const year = parseInt(yearMatch[0]);
              if (year >= 2024) yearFactor = 1.1; // Steam reviews are very frequent now
              else if (year >= 2020) yearFactor = 1.5;
              else if (year >= 2017) yearFactor = 2.2;
              else if (year >= 2014) yearFactor = 3.5;
              else yearFactor = 5.0; // Older games have much higher ratios
            }
          }

          let specialFactor = 1.0;
          if (isMmo && isFree) {
            specialFactor = 2.2; // F2P MMOs have unique retention patterns
          }

          multiplier = 15 * priceFactor * yearFactor * specialFactor;
        }

        const estimatedSales = Math.round(reviews * multiplier);
        
        await db.updateMetadata(
          game.id, 
          reviews, 
          estimatedSales,
          reviewData.review_score,
          reviewData.review_score_desc,
          reviewData.recent_review_score,
          reviewData.recent_review_score_desc,
          reviewData.recent_reviews,
          finalPrice,
          initialPrice,
          discountPercent,
          isFree ? 1 : 0,
          dlcCount,
          hasIap ? 1 : 0,
          isMmo ? 1 : 0
        );
        console.log(`Updated metadata for ${game.name}: ${reviews} reviews (${reviewData.review_score}%), ~${estimatedSales} owners`);
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
