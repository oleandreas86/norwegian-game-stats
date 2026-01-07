const sqlite3 = require('sqlite3').verbose();
const config = require('./config');
const fs = require('fs');
const path = require('path');

// Ensure database directory exists
const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(config.databasePath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS game_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appid INTEGER,
    player_count INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(appid, timestamp)
  )`);
  
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appid_timestamp ON game_stats (appid, timestamp)`);
});

module.exports = {
  insertStat: (appid, player_count, timestamp = null) => {
    return new Promise((resolve, reject) => {
      const query = timestamp 
        ? `INSERT OR IGNORE INTO game_stats (appid, player_count, timestamp) VALUES (?, ?, ?)`
        : `INSERT OR IGNORE INTO game_stats (appid, player_count) VALUES (?, ?)`;
      const params = timestamp ? [appid, player_count, timestamp] : [appid, player_count];
      
      db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  },
  getStats: (appid, start = null, end = null, limit = null) => {
    return new Promise((resolve, reject) => {
      let query = `SELECT player_count, timestamp FROM game_stats WHERE appid = ?`;
      const params = [appid];

      // Normalize timestamps to SQLite format: YYYY-MM-DD HH:MM:SS
      const normalize = (ts) => {
        if (!ts) return ts;
        return ts.replace('T', ' ').replace('Z', '').split('.')[0];
      };

      const nStart = normalize(start);
      const nEnd = normalize(end);

      if (nStart) {
        query += ` AND timestamp >= ?`;
        params.push(nStart);
      }
      if (nEnd) {
        query += ` AND timestamp <= ?`;
        params.push(nEnd);
      }

      query += ` ORDER BY timestamp DESC`;

      if (limit) {
        query += ` LIMIT ?`;
        params.push(limit);
      }

      db.all(query, params, (err, rows) => {
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
        SELECT appid, player_count, timestamp
        FROM game_stats
        WHERE id IN (
          SELECT MAX(id)
          FROM game_stats
          WHERE appid IN (${placeholders})
          GROUP BY appid
        )
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
