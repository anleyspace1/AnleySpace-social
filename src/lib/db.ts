import Database from 'better-sqlite3';
import { join } from 'path';

const db = new Database('anleyspace.db');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    full_name TEXT,
    coins INTEGER DEFAULT 1000,
    usd_balance REAL DEFAULT 0.0,
    is_vip INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 0,
    avatar TEXT,
    followers_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    bio TEXT
  );
`);

console.log('DB: Initialized anleyspace.db');
const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
console.log(`DB: Current user count: ${count?.count || 0}`);

db.exec(`
  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT,
    following_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY(follower_id) REFERENCES users(id),
    FOREIGN KEY(following_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    price REAL,
    category TEXT,
    location TEXT,
    image TEXT,
    seller_id TEXT,
    stock INTEGER DEFAULT 10,
    FOREIGN KEY(seller_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS live_selling_sessions (
    id TEXT PRIMARY KEY,
    streamer_id TEXT,
    status TEXT DEFAULT 'active', -- 'active', 'ended'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(streamer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS live_session_products (
    session_id TEXT,
    product_id TEXT,
    PRIMARY KEY (session_id, product_id),
    FOREIGN KEY(session_id) REFERENCES live_selling_sessions(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    buyer_id TEXT,
    seller_id TEXT,
    product_id TEXT,
    session_id TEXT,
    amount REAL,
    payment_method TEXT, -- 'coins', 'wallet', 'card'
    platform_commission REAL,
    seller_payout REAL,
    status TEXT DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(buyer_id) REFERENCES users(id),
    FOREIGN KEY(seller_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    amount INTEGER,
    type TEXT, -- 'game_start', 'game_win', 'game_loss', 'gift', 'support'
    description TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    game_type TEXT,
    streamer_id TEXT,
    status TEXT, -- 'active', 'completed'
    winner_id TEXT,
    reward INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS streams (
    id TEXT PRIMARY KEY,
    streamer_id TEXT,
    title TEXT,
    category TEXT,
    status TEXT, -- 'live', 'ended'
    viewer_count INTEGER DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    FOREIGN KEY(streamer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_messages (
    id TEXT PRIMARY KEY,
    group_id TEXT,
    user_id TEXT,
    username TEXT,
    text TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT DEFAULT 'text',
    audio_url TEXT,
    image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS direct_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT,
    receiver_id TEXT,
    text TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT DEFAULT 'text',
    audio_url TEXT,
    image_url TEXT,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    image TEXT,
    cover_image TEXT,
    type TEXT, -- 'Public', 'Private'
    creator_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS group_posts (
    id TEXT PRIMARY KEY,
    group_id TEXT,
    user_id TEXT,
    username TEXT,
    avatar TEXT,
    content TEXT,
    image_url TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(group_id) REFERENCES groups(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT,
    user_id TEXT,
    role TEXT DEFAULT 'member', -- 'creator', 'admin', 'member'
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    group_id TEXT,
    host_id TEXT,
    type TEXT, -- 'audio', 'video'
    capacity INTEGER DEFAULT 20,
    status TEXT DEFAULT 'active', -- 'active', 'ended'
    is_live INTEGER DEFAULT 0,
    stream_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS call_speakers (
    call_id TEXT,
    user_id TEXT,
    PRIMARY KEY (call_id, user_id),
    FOREIGN KEY(call_id) REFERENCES calls(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS join_requests (
    id TEXT PRIMARY KEY,
    call_id TEXT,
    user_id TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
    amount INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(call_id) REFERENCES calls(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reels (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    url TEXT,
    thumbnail TEXT,
    caption TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    sound_title TEXT,
    sound_artist TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reel_likes (
    reel_id TEXT,
    user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (reel_id, user_id),
    FOREIGN KEY(reel_id) REFERENCES reels(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reel_comments (
    id TEXT PRIMARY KEY,
    reel_id TEXT,
    user_id TEXT,
    text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(reel_id) REFERENCES reels(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reel_views (
    reel_id TEXT,
    user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (reel_id, user_id),
    FOREIGN KEY(reel_id) REFERENCES reels(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    username TEXT,
    avatar TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS story_replies (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    from_user_id TEXT,
    from_username TEXT,
    body TEXT NOT NULL,
    receiver_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS story_views (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    viewer_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (story_id, viewer_id),
    FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    actor_id TEXT,
    story_id TEXT,
    entity_id TEXT,
    message TEXT,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add columns if they don't exist (for existing databases)
try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN full_name TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN followers_count INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN following_count INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE streams ADD COLUMN title TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE streams ADD COLUMN category TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE group_messages ADD COLUMN type TEXT DEFAULT 'text'"); } catch (e) {}
try { db.exec("ALTER TABLE group_messages ADD COLUMN audio_url TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE group_messages ADD COLUMN image_url TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE group_posts ADD COLUMN shares INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE groups ADD COLUMN cover_image TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE calls ADD COLUMN group_id TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE stories ADD COLUMN media_url TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE stories ADD COLUMN media_type TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE story_replies ADD COLUMN receiver_id TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE notifications ADD COLUMN entity_id TEXT"); } catch (e) {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS story_views (
      id TEXT PRIMARY KEY,
      story_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (story_id, viewer_id),
      FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE
    );
  `);
} catch (e) {}

// Seed mock groups
const seedGroup = db.prepare('INSERT OR IGNORE INTO groups (id, name, description, image, type, creator_id) VALUES (?, ?, ?, ?, ?, ?)');
seedGroup.run('travel', 'Travel Lovers', 'A group for people who love to travel.', 'https://picsum.photos/seed/travel/400/200', 'Public', 'u1');
seedGroup.run('music', 'Music Hub', 'Share your favorite tunes and discover new music.', 'https://picsum.photos/seed/music/400/200', 'Public', 'u1');
seedGroup.run('fitness', 'Fitness Club', 'Get fit and stay healthy with our community.', 'https://picsum.photos/seed/fitness/400/200', 'Public', 'u1');
seedGroup.run('gaming', 'Gaming World', 'The ultimate place for gamers to connect.', 'https://picsum.photos/seed/gaming/400/200', 'Public', 'u1');

const seedMember = db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)');
seedMember.run('travel', 'u1', 'creator');
seedMember.run('music', 'u1', 'creator');
seedMember.run('fitness', 'u1', 'creator');
seedMember.run('gaming', 'u1', 'creator');
seedMember.run('travel', 'u2', 'member');

// Seed mock user if not exists
const seedUser = db.prepare('INSERT OR IGNORE INTO users (id, username, coins, usd_balance, avatar) VALUES (?, ?, ?, ?, ?)');
seedUser.run('u1', 'anley_official', 5000, 150.50, 'https://picsum.photos/seed/anley/100/100');
seedUser.run('u2', 'sarah_j', 1500, 45.00, 'https://picsum.photos/seed/sarah/100/100');
seedUser.run('u3', 'tech_guru', 2000, 80.00, 'https://picsum.photos/seed/tech/100/100');
seedUser.run('u4', 'alex_vibe', 3000, 120.00, 'https://picsum.photos/seed/alex/100/100');
seedUser.run('u5', 'nature_lover', 1000, 30.00, 'https://picsum.photos/seed/nature/100/100');

// Seed mock products
const seedProduct = db.prepare('INSERT OR IGNORE INTO products (id, title, price, category, location, image, seller_id, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
seedProduct.run('p1', 'iPhone 15 Pro', 999.00, 'Electronics', 'San Francisco, CA', 'https://picsum.photos/seed/iphone/400/400', 'u1', 5);
seedProduct.run('p2', 'Vintage Leather Jacket', 120.00, 'Apparel', 'New York, NY', 'https://picsum.photos/seed/jacket/400/400', 'u1', 10);
seedProduct.run('p3', 'Tesla Model 3', 35000.00, 'Vehicles', 'Austin, TX', 'https://picsum.photos/seed/tesla/400/400', 'u1', 2);
seedProduct.run('p4', 'Modern Sofa', 450.00, 'Home', 'Los Angeles, CA', 'https://picsum.photos/seed/sofa/400/400', 'u1', 8);

export default db;
