import Database from 'better-sqlite3';
const db = new Database('anleyspace.db');
const follows = db.prepare('SELECT * FROM follows').all();
console.log('FOLLOWS TABLE:', JSON.stringify(follows, null, 2));
const users = db.prepare('SELECT id, username, followers_count, following_count FROM users').all();
console.log('USERS COUNTS:', JSON.stringify(users, null, 2));
