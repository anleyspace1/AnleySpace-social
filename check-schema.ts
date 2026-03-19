import Database from 'better-sqlite3';
const db = new Database('anleyspace.db');
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
console.log('USERS SCHEMA:', schema.sql);
const followsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='follows'").get();
console.log('FOLLOWS SCHEMA:', followsSchema.sql);
