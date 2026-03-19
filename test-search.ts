import Database from 'better-sqlite3';
const db = new Database('anleyspace.db');
const q = 'anley';
const query = `%${q}%`;
const users = db.prepare(`
  SELECT id, username, full_name, avatar, followers_count, following_count 
  FROM users 
  WHERE username LIKE ? OR full_name LIKE ?
  LIMIT 20
`).all(query, query);
console.log('SEARCH RESULTS for "anley":', JSON.stringify(users, null, 2));
