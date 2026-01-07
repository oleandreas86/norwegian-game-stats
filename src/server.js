const express = require('express');
const cron = require('node-cron');
const config = require('./config');
const db = require('./db');
const collectAll = require('./collector');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoints
app.get('/api/games', (req, res) => {
  res.json(config.games);
});

app.get('/api/stats/:appid', async (req, res) => {
  try {
    const { start, end, limit } = req.query;
    // Default limit only if no range is specified (4320 points = 30 days at 10 min intervals)
    const defaultLimit = (start || end) ? undefined : 4320;
    const stats = await db.getStats(
      req.params.appid, 
      start, 
      end, 
      limit ? parseInt(limit) : defaultLimit
    );
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/latest', async (req, res) => {
  try {
    const latest = await db.getLatestStats();
    // Sort by player count descending
    latest.sort((a, b) => b.player_count - a.player_count);
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leaderboards', async (req, res) => {
  try {
    const current = await db.getLatestStats();
    const peaks = await db.getHistoricalPeaks();
    
    // Sort current by player count descending
    current.sort((a, b) => b.player_count - a.player_count);

    res.json({
      current,
      peaks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  
  // Schedule collection
  cron.schedule(config.collectionInterval, () => {
    collectAll();
  });
  
  // Initial collection if DB is empty (optional)
  collectAll();
});
