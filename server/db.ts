import Database from 'better-sqlite3';

// Using a file-based DB for persistence
const db = new Database('cineswipe.db', {
  verbose: process.env.NODE_ENV !== 'production' ? console.log : undefined,
});

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    interaction_type TEXT NOT NULL, -- 'like' or 'reject'
    media_data TEXT NOT NULL, -- JSON string of the media object
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, media_id, media_type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export default db;
