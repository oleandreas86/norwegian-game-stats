const sqlite3 = require('sqlite3').verbose();
const config = require('./config');

const db = new sqlite3.Database(config.databasePath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS game_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appid INTEGER,
    player_count INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_appid_timestamp ON game_stats (appid, timestamp)`);
});

module.exports = {
  insertStat: (appid, player_count, timestamp = null) => {
    return new Promise((resolve, reject) => {
      const query = timestamp 
        ? `INSERT INTO game_stats (appid, player_count, timestamp) VALUES (?, ?, ?)`
        : `INSERT INTO game_stats (appid, player_count) VALUES (?, ?)`;
      const params = timestamp ? [appid, player_count, timestamp] : [appid, player_count];
      
      db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  },
  getStats: (appid, limit = 144) => { // Default to ~24 hours if polled every 10 mins
    return new Promise((resolve, reject) => {
      db.all(`SELECT player_count, timestamp FROM game_stats WHERE appid = ? ORDER BY timestamp DESC LIMIT ?`, [appid, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.reverse());
      });
    });
  },
  getStatCount: (appid) => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM game_stats WHERE appid = ?`, [appid], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  },
  getLatestStats: () => {
    return new Promise((resolve, reject) => {
      const gameIds = config.games.map(g => g.id);
      if (gameIds.length === 0) return resolve([]);
      
      const placeholders = gameIds.map(() => '?').join(',');
      db.all(`
        SELECT s1.appid, s1.player_count, s1.timestamp
        FROM game_stats s1
        INNER JOIN (
          SELECT appid, MAX(timestamp) as max_ts
          FROM game_stats
          WHERE appid IN (${placeholders})
          GROUP BY appid
        ) s2 ON s1.appid = s2.appid AND s1.timestamp = s2.max_ts
      `, gameIds, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  getHistoricalPeaks: () => {
    return new Promise((resolve, reject) => {
      const gameIds = config.games.map(g => g.id);
      if (gameIds.length === 0) return resolve([]);

      const placeholders = gameIds.map(() => '?').join(',');
      db.all(`
        SELECT appid, MAX(player_count) as peak_player_count
        FROM game_stats
        WHERE appid IN (${placeholders})
        GROUP BY appid
        ORDER BY peak_player_count DESC
      `, gameIds, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};
