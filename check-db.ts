import Database from 'better-sqlite3';
const db = new Database('anleyspace.db');
const users = db.prepare('SELECT id, username FROM users').all();
console.log('USERS IN DB:', JSON.stringify(users, null, 2));
const follows = db.prepare('SELECT * FROM follows').all();
console.log('FOLLOWS IN DB:', JSON.stringify(follows, null, 2));
