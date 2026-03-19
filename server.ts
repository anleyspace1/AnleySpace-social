import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import db from "./src/lib/db"; // Removed .js extension
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

console.log("SERVER: Initializing...");

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

let supabase: any = null;
if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log("SERVER: Supabase client initialized");
  } catch (err) {
    console.error("SERVER: Failed to initialize Supabase client:", err);
  }
} else {
  console.warn("SERVER: Supabase environment variables missing. Some features may not work.");
}

async function syncGroupMessages(groupId: string) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('timestamp', { ascending: true })
      .limit(100);

    if (error) {
      if (error.code === '42P01') {
        console.warn('Supabase table "group_messages" does not exist. Skipping sync.');
      } else {
        console.error('Supabase fetch error in syncGroupMessages:', error.code, error.message);
      }
      return;
    }

    if (data && data.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO group_messages (id, group_id, user_id, username, text, timestamp, type, audio_url, image_url) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          text = excluded.text,
          timestamp = excluded.timestamp,
          type = excluded.type,
          audio_url = excluded.audio_url,
          image_url = excluded.image_url
      `);
      
      const transaction = db.transaction((messages) => {
        for (const msg of messages) {
          stmt.run(msg.id, msg.group_id, msg.user_id, msg.username, msg.text, msg.timestamp, msg.type, msg.audio_url, msg.image_url);
        }
      });
      
      transaction(data);
    }
  } catch (err) {
    console.error('Error in syncGroupMessages:', err);
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;
  const logFile = path.join(process.cwd(), 'server.log');
  const logToFile = (msg: string) => {
    fs.appendFileSync(logFile, `${msg} - ${new Date().toISOString()}\n`);
  };

  console.log(`SERVER: NODE_ENV is ${process.env.NODE_ENV}`);
  logToFile(`SERVER: NODE_ENV is ${process.env.NODE_ENV}`);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Request logging middleware
  app.use((req, res, next) => {
    logToFile(`SERVER: ${req.method} ${req.url}`);
    if (req.method === 'POST') {
      logToFile(`SERVER: Body: ${JSON.stringify(req.body)}`);
    }
    next();
  });

  // API Endpoints
  app.get("/api/health", (req, res) => {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    res.json({ status: "ok", userCount: userCount.count });
  });

  app.get("/api/user/:id", async (req, res) => {
    logToFile(`SERVER: Fetching user ${req.params.id}`);
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    
    if (!user) {
      logToFile(`SERVER: User ${req.params.id} not found in local DB, checking Supabase`);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', req.params.id)
          .single();
        
        if (data) {
          user = {
            id: data.id,
            username: data.username,
            avatar: data.avatar_url,
            full_name: data.full_name,
            bio: data.bio,
            coins: data.coins || 0,
            followers_count: data.followers_count || 0,
            following_count: data.following_count || 0
          };
          // Sync back to local DB for cache
          db.prepare(`
            INSERT INTO users (id, username, avatar, full_name, bio, coins, followers_count, following_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              username = excluded.username,
              avatar = excluded.avatar,
              full_name = excluded.full_name,
              bio = excluded.bio,
              coins = excluded.coins,
              followers_count = excluded.followers_count,
              following_count = excluded.following_count
          `).run(user.id, user.username, user.avatar, user.full_name, user.bio, user.coins, user.followers_count, user.following_count);
        }
      } catch (e) {
        logToFile(`SERVER: Supabase user fetch error: ${e}`);
      }
    }
    
    if (!user) {
      logToFile(`SERVER: User ${req.params.id} not found anywhere`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  });

  app.get("/api/debug/users", (req, res) => {
    const users = db.prepare('SELECT * FROM users').all();
    res.json(users);
  });

  app.post("/api/users/sync", async (req, res) => {
    const { id, username, avatar, full_name, bio } = req.body;
    logToFile(`SERVER: Sync request for ${username} (${id})`);
    if (!id || !username) return res.status(400).json({ error: 'Missing id or username' });
    
    try {
      const result = db.prepare(`
        INSERT INTO users (id, username, avatar, full_name, bio) 
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          username = excluded.username,
          avatar = excluded.avatar,
          full_name = excluded.full_name,
          bio = COALESCE(excluded.bio, users.bio)
      `).run(id, username, avatar, full_name, bio);
      logToFile(`SERVER: Sync successful for ${username}, changes: ${result.changes}`);

      // Sync to Supabase profiles
      try {
        await supabase.from('profiles').upsert({
          id,
          username,
          avatar_url: avatar,
          full_name,
          bio,
          display_name: full_name || username
        });
      } catch (e) {
        logToFile(`SERVER: Supabase profile sync error: ${e}`);
      }
      
      res.json({ success: true });
    } catch (err) {
      logToFile(`SERVER: Sync error: ${err}`);
      res.status(500).json({ error: 'Failed to sync user' });
    }
  });

  app.get("/api/users/search", (req, res) => {
    const { q } = req.query;
    logToFile(`SERVER: Search request for "${q}"`);
    if (!q) return res.json([]);
    
    const users = db.prepare(`
      SELECT id, username, full_name, avatar, followers_count, following_count 
      FROM users 
      WHERE username LIKE ? OR full_name LIKE ?
      LIMIT 20
    `).all(`%${q}%`, `%${q}%`);
    logToFile(`SERVER: Search results count: ${users.length}`);
    res.json(users);
  });

  app.post("/api/users/follow", async (req, res) => {
    const { followerId, followingId } = req.body;
    logToFile(`SERVER: Follow request from ${followerId} to ${followingId}`);
    if (!followerId || !followingId) return res.status(400).json({ error: 'Missing IDs' });

    try {
      const transaction = db.transaction(() => {
        const result = db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(followerId, followingId);
        logToFile(`SERVER: Follow insert result changes: ${result.changes}`);
        
        if (result.changes > 0) {
          db.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?').run(followerId);
          db.prepare('UPDATE users SET followers_count = followers_count + 1 WHERE id = ?').run(followingId);
        }
      });
      transaction();

      // Sync to Supabase
      try {
        await supabase.from('follows').upsert({
          follower_id: followerId,
          following_id: followingId
        });
        
        // Update counts in profiles if they exist
        await supabase.rpc('increment_following_count', { user_id: followerId });
        await supabase.rpc('increment_followers_count', { user_id: followingId });
      } catch (e) {
        logToFile(`SERVER: Supabase follow sync error: ${e}`);
      }

      res.json({ success: true });
    } catch (err) {
      logToFile(`SERVER: Follow error: ${err}`);
      res.status(500).json({ error: 'Failed to follow' });
    }
  });

  app.post("/api/users/unfollow", async (req, res) => {
    const { followerId, followingId } = req.body;
    logToFile(`SERVER: Unfollow request from ${followerId} to ${followingId}`);
    if (!followerId || !followingId) return res.status(400).json({ error: 'Missing IDs' });

    try {
      const transaction = db.transaction(() => {
        const result = db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(followerId, followingId);
        logToFile(`SERVER: Unfollow delete result changes: ${result.changes}`);
        
        if (result.changes > 0) {
          db.prepare('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?').run(followerId);
          db.prepare('UPDATE users SET followers_count = MAX(0, followers_count - 1) WHERE id = ?').run(followingId);
        }
      });
      transaction();

      // Sync to Supabase
      try {
        await supabase.from('follows')
          .delete()
          .eq('follower_id', followerId)
          .eq('following_id', followingId);
          
        await supabase.rpc('decrement_following_count', { user_id: followerId });
        await supabase.rpc('decrement_followers_count', { user_id: followingId });
      } catch (e) {
        logToFile(`SERVER: Supabase unfollow sync error: ${e}`);
      }

      res.json({ success: true });
    } catch (err) {
      logToFile(`SERVER: Unfollow error: ${err}`);
      res.status(500).json({ error: 'Failed to unfollow' });
    }
  });

  app.get("/api/users/:id/following/:targetId", async (req, res) => {
    const { id, targetId } = req.params;
    try {
      // Try Supabase first
      const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', id)
        .eq('following_id', targetId)
        .maybeSingle();
      
      if (data) {
        return res.json({ isFollowing: true });
      }
    } catch (e) {
      logToFile(`SERVER: Supabase follow check error: ${e}`);
    }
    
    // Fallback to SQLite
    const follow = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(id, targetId);
    res.json({ isFollowing: !!follow });
  });

  app.post("/api/users/sync-all", async (req, res) => {
    logToFile('SERVER: Sync-all request');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*');
      
      if (error) {
        logToFile(`SERVER: Supabase fetch error in sync-all: ${error.message}`);
        throw error;
      }
      
      if (data) {
        logToFile(`SERVER: Syncing ${data.length} users from Supabase`);
        console.log(`DEBUG: Found ${data.length} profiles in Supabase`);
        data.forEach(u => console.log(`DEBUG: Profile: ${u.username} (${u.id})`));
        
        const stmt = db.prepare(`
          INSERT INTO users (id, username, avatar, full_name, bio) 
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            username = excluded.username,
            avatar = excluded.avatar,
            full_name = excluded.full_name,
            bio = COALESCE(excluded.bio, users.bio)
        `);
        
        const transaction = db.transaction((users) => {
          for (const user of users) {
            stmt.run(user.id, user.username, user.avatar_url, user.display_name || user.full_name, user.bio);
          }
        });
        
        transaction(data);
        logToFile('SERVER: Sync-all successful');
      } else {
        logToFile('SERVER: No data returned from Supabase in sync-all');
      }
      res.json({ success: true, count: data?.length || 0 });
    } catch (err) {
      logToFile(`SERVER: Sync-all error: ${err}`);
      res.status(500).json({ error: 'Failed to sync all users' });
    }
  });

  app.post("/api/user/:id/verify", (req, res) => {
    db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/transactions/:userId", (req, res) => {
    const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC').all(req.params.userId);
    res.json(txs);
  });

  // Live Streaming Endpoints
  app.post("/api/lives/start", async (req, res) => {
    const { userId, channelName } = req.body;
    const id = uuidv4();
    
    try {
      const { data, error } = await supabase
        .from('lives')
        .insert({
          id,
          user_id: userId,
          channel_name: channelName,
          status: 'active',
          viewer_count: 0
        })
        .select()
        .single();
      
      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error('Error starting live:', err);
      res.status(500).json({ error: 'Failed to start live session' });
    }
  });

  app.post("/api/lives/:id/end", async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase
        .from('lives')
        .update({ status: 'ended' })
        .eq('id', id);
      
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      console.error('Error ending live:', err);
      res.status(500).json({ error: 'Failed to end live session' });
    }
  });

  app.post("/api/lives/:id/join", async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    try {
      // Add to live_viewers
      await supabase.from('live_viewers').insert({
        live_id: id,
        user_id: userId
      });

      // Increment viewer count
      const { data: live } = await supabase.from('lives').select('viewer_count').eq('id', id).single();
      await supabase.from('lives').update({ viewer_count: (live?.viewer_count || 0) + 1 }).eq('id', id);

      res.json({ success: true });
    } catch (err) {
      console.error('Error joining live:', err);
      res.status(500).json({ error: 'Failed to join live session' });
    }
  });

  app.post("/api/lives/:id/leave", async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    try {
      // Remove from live_viewers
      await supabase.from('live_viewers').delete().eq('live_id', id).eq('user_id', userId);

      // Decrement viewer count
      const { data: live } = await supabase.from('lives').select('viewer_count').eq('id', id).single();
      const newCount = Math.max(0, (live?.viewer_count || 1) - 1);
      await supabase.from('lives').update({ viewer_count: newCount }).eq('id', id);

      res.json({ success: true });
    } catch (err) {
      console.error('Error leaving live:', err);
      res.status(500).json({ error: 'Failed to leave live session' });
    }
  });

  app.post("/api/lives/:id/gift", async (req, res) => {
    const { id } = req.params;
    const { senderId, receiverId, coins } = req.body;
    try {
      // 1. Record gift
      await supabase.from('live_gifts').insert({
        live_id: id,
        sender_id: senderId,
        receiver_id: receiverId,
        coins
      });

      // 2. Update balances in local DB (and ideally Supabase)
      db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(coins, senderId);
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(coins, receiverId);

      res.json({ success: true });
    } catch (err) {
      console.error('Error sending gift:', err);
      res.status(500).json({ error: 'Failed to send gift' });
    }
  });

  app.post("/api/lives/:id/message", async (req, res) => {
    const { id } = req.params;
    const { userId, message } = req.body;
    try {
      const { data, error } = await supabase
        .from('live_messages')
        .insert({
          live_id: id,
          user_id: userId,
          message
        })
        .select('*, profiles(username, avatar_url)')
        .single();
      
      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error('Error sending live message:', err);
      res.status(500).json({ error: 'Failed to send live message' });
    }
  });

  app.get("/api/groups", async (req, res) => {
    try {
      const { data, error } = await supabase.from('groups').select('*');
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      logToFile(`SERVER: Supabase groups fetch error: ${err}`);
      const groups = db.prepare('SELECT * FROM groups').all();
      res.json(groups);
    }
  });

  app.get("/api/groups/joined/:userId", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('*, group_members!inner(user_id)')
        .eq('group_members.user_id', req.params.userId);
      
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      logToFile(`SERVER: Supabase joined groups fetch error: ${err}`);
      const groups = db.prepare(`
        SELECT g.* FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
      `).all(req.params.userId);
      res.json(groups);
    }
  });

  app.get("/api/groups/:id", (req, res) => {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    
    const members = db.prepare(`
      SELECT gm.user_id as id, u.username, u.avatar, gm.role 
      FROM group_members gm 
      LEFT JOIN users u ON gm.user_id = u.id 
      WHERE gm.group_id = ?
    `).all(req.params.id);

    const activeCall = db.prepare("SELECT * FROM calls WHERE group_id = ? AND status = 'active'").get(req.params.id);
    let isSpeaker = false;
    if (activeCall && req.query.userId) {
      const speaker = db.prepare('SELECT * FROM call_speakers WHERE call_id = ? AND user_id = ?').get(activeCall.id, req.query.userId);
      isSpeaker = !!speaker;
    }
    
    res.json({ ...group, members, activeCall: activeCall ? { ...activeCall, isSpeaker } : null });
  });

  app.get("/api/groups/:groupId/messages", async (req, res) => {
    const { groupId } = req.params;
    try {
      await syncGroupMessages(groupId);
      const messages = db.prepare('SELECT * FROM group_messages WHERE group_id = ? ORDER BY timestamp ASC LIMIT 100').all(groupId);
      res.json(messages);
    } catch (err) {
      console.error('Error in GET /api/groups/:groupId/messages:', err);
      const messages = db.prepare('SELECT * FROM group_messages WHERE group_id = ? ORDER BY timestamp ASC LIMIT 100').all(groupId);
      res.json(messages);
    }
  });

  app.post("/api/groups", async (req, res) => {
    const { name, description, image, type, creatorId } = req.body;
    const id = uuidv4();
    
    try {
      db.prepare('INSERT INTO groups (id, name, description, image, type, creator_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, name, description, image || `https://picsum.photos/seed/${id}/400/200`, type || 'Public', creatorId);
      
      db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
        .run(id, creatorId, 'admin');

      // Sync to Supabase
      // First try to sync the group itself (ignore error if table doesn't exist)
      try {
        await supabase.from('groups').upsert({
          id,
          name,
          description,
          image: image || `https://picsum.photos/seed/${id}/400/200`,
          type: type || 'Public',
          creator_id: creatorId
        });
      } catch (e) {
        // Table might not exist, that's fine
      }

      const { error } = await supabase.from('group_members').upsert({
        group_id: id,
        user_id: creatorId,
        role: 'admin'
      });
      
      if (error) {
        if (error.code === '42P01') {
          console.warn('Supabase table "group_members" does not exist. Skipping sync.');
        } else {
          console.error('Supabase group_members sync error (create):', error.code, error.message);
        }
      }
        
      res.json({ id, name, description });
    } catch (err) {
      console.error('Error creating group:', err);
      res.status(500).json({ error: 'Failed to create group' });
    }
  });

  app.post("/api/groups/:id/join", async (req, res) => {
    const { userId } = req.body;
    const groupId = req.params.id;
    
    try {
      db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
        .run(groupId, userId, 'member');
      
      // Sync to Supabase
      const { error } = await supabase.from('group_members').upsert({
        group_id: groupId,
        user_id: userId,
        role: 'member'
      });

      if (error) {
        if (error.code === '42P01') {
          console.warn('Supabase table "group_members" does not exist. Skipping sync.');
        } else {
          console.error('Supabase group_members sync error (join):', error.code, error.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Error joining group:', err);
      res.status(400).json({ error: 'Already a member or group not found' });
    }
  });

  app.post("/api/groups/:id/leave", async (req, res) => {
    const { userId } = req.body;
    const groupId = req.params.id;
    
    try {
      db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
        .run(groupId, userId);
      
      // Also sync to Supabase
      const { error } = await supabase.from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);
        
      if (error) {
        if (error.code === '42P01') {
          console.warn('Supabase table "group_members" does not exist. Skipping sync.');
        } else {
          console.error('Supabase group_members sync error (leave):', error.code, error.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'Failed to leave group' });
    }
  });

  app.post("/api/groups/:id/invite", async (req, res) => {
    const { username, userId, avatar } = req.body;
    const groupId = req.params.id;
    
    let user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    
    if (!user && userId) {
      try {
        db.prepare('INSERT OR IGNORE INTO users (id, username, avatar) VALUES (?, ?, ?)')
          .run(userId, username, avatar);
        user = { id: userId };
      } catch (e) {
        console.error('Error syncing user during invite:', e);
      }
    }
    
    if (!user) return res.status(404).json({ error: 'User not found. Please ensure the user has logged in at least once.' });
    
    try {
      db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
        .run(groupId, user.id, 'member');
      
      // Also sync to Supabase
      // Ensure user has a profile in Supabase first to avoid FK errors
      try {
        await supabase.from('profiles').upsert({
          id: user.id,
          username: username,
          avatar_url: avatar,
          display_name: username
        });
      } catch (e) {
        // Table might not exist or other error
      }

      const { error } = await supabase.from('group_members').upsert({
        group_id: groupId,
        user_id: user.id,
        role: 'member'
      });
      
      if (error) {
        if (error.code === '42P01') {
          console.warn('Supabase table "group_members" does not exist. Skipping sync.');
        } else {
          console.error('Supabase group_members sync error (invite):', error.code, error.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'User is already a member' });
    }
  });

  app.get("/api/groups/:id/posts", (req, res) => {
    try {
      const posts = db.prepare(`
        SELECT * FROM group_posts 
        WHERE group_id = ? 
        ORDER BY created_at DESC
      `).all(req.params.id);
      res.json(posts);
    } catch (err) {
      console.error('Error fetching group posts:', err);
      res.status(500).json({ error: 'Failed to fetch group posts' });
    }
  });

  app.post("/api/groups/:id/posts", (req, res) => {
    const { userId, username, avatar, content, imageUrl } = req.body;
    const groupId = req.params.id;
    const id = uuidv4();
    
    try {
      db.prepare(`
        INSERT INTO group_posts (id, group_id, user_id, username, avatar, content, image_url) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, groupId, userId, username, avatar, content, imageUrl || null);
      
      res.json({ success: true, id });
    } catch (err) {
      console.error('Error creating group post:', err);
      res.status(500).json({ error: 'Failed to create group post' });
    }
  });

  app.put("/api/groups/:id", async (req, res) => {
    const { image, cover_image, name, description } = req.body;
    const groupId = req.params.id;
    
    try {
      const updates: string[] = [];
      const params: any[] = [];
      
      if (image !== undefined) { updates.push('image = ?'); params.push(image); }
      if (cover_image !== undefined) { updates.push('cover_image = ?'); params.push(cover_image); }
      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      
      if (updates.length > 0) {
        params.push(groupId);
        db.prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        
        // Sync to Supabase
        try {
          const supabaseUpdate: any = {};
          if (image !== undefined) supabaseUpdate.image = image;
          if (cover_image !== undefined) supabaseUpdate.cover_image = cover_image;
          if (name !== undefined) supabaseUpdate.name = name;
          if (description !== undefined) supabaseUpdate.description = description;
          
          await supabase.from('groups').update(supabaseUpdate).eq('id', groupId);
        } catch (e) {
          console.error('Supabase group update sync error:', e);
        }
      }
      
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating group:', err);
      res.status(500).json({ error: 'Failed to update group' });
    }
  });

  app.post("/api/calls/start", async (req, res) => {
    console.log('Starting call:', req.body);
    const { hostId, type, groupId } = req.body;
    const id = uuidv4();
    try {
      db.prepare('INSERT INTO calls (id, host_id, type, group_id) VALUES (?, ?, ?, ?)').run(id, hostId, type, groupId || null);
      db.prepare('INSERT INTO call_speakers (call_id, user_id) VALUES (?, ?)').run(id, hostId);
      
      // Sync to Supabase
      try {
        await supabase.from('calls').upsert({
          id,
          host_id: hostId,
          type,
          group_id: groupId || null,
          status: 'active'
        });
        await supabase.from('call_speakers').upsert({
          call_id: id,
          user_id: hostId
        });
      } catch (e) {
        logToFile(`SERVER: Supabase call start sync error: ${e}`);
      }

      console.log('Call started successfully:', id);
      res.json({ id, hostId, type, capacity: 20 });
    } catch (err) {
      console.error('Error starting call:', err);
      res.status(500).json({ error: 'Failed to start call' });
    }
  });

  app.post("/api/calls/:id/upgrade", async (req, res) => {
    const { hostId, capacity, cost } = req.body;
    const callId = req.params.id;
    
    try {
      const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(hostId);
      if (!user || user.coins < cost) {
        return res.status(400).json({ error: 'Insufficient coins' });
      }
      
      db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(cost, hostId);
      db.prepare('UPDATE calls SET capacity = ? WHERE id = ?').run(capacity, callId);
      
      // Record transaction
      db.prepare('INSERT INTO transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)')
        .run(uuidv4(), hostId, 'withdrawal', cost, `Call upgrade to ${capacity} participants`);
      
      // Sync to Supabase
      try {
        await supabase.rpc('decrement_coins', { user_id: hostId, amount: cost });
        await supabase.from('calls').update({ capacity }).eq('id', callId);
        await supabase.from('transactions').insert({
          id: uuidv4(),
          user_id: hostId,
          type: 'withdrawal',
          amount: -cost,
          description: `Call upgrade to ${capacity} participants`
        });
      } catch (e) {
        logToFile(`SERVER: Supabase call upgrade sync error: ${e}`);
      }
        
      res.json({ success: true, newCapacity: capacity });
    } catch (err) {
      res.status(500).json({ error: 'Failed to upgrade call' });
    }
  });

  app.post("/api/calls/:id/end", async (req, res) => {
    try {
      db.prepare("UPDATE calls SET status = 'ended' WHERE id = ?").run(req.params.id);
      
      // Sync to Supabase
      try {
        await supabase.from('calls').update({ status: 'ended' }).eq('id', req.params.id);
      } catch (e) {
        logToFile(`SERVER: Supabase call end sync error: ${e}`);
      }
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to end call' });
    }
  });

  app.get("/api/live-calls", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('calls')
        .select('*, profiles!host_id(username), groups(name, image)')
        .eq('is_live', true)
        .eq('status', 'active');
      
      if (error) throw error;
      
      const liveCalls = (data || []).map(c => ({
        ...c,
        host_username: c.profiles?.username || 'Unknown',
        group_name: c.groups?.name || (c.profiles?.username + "'s Live Call"),
        group_image: c.groups?.image || `https://picsum.photos/seed/${c.host_id}/400/200`
      }));
      
      res.json(liveCalls);
    } catch (err) {
      logToFile(`SERVER: Supabase live-calls fetch error: ${err}`);
      const liveCalls = db.prepare(`
        SELECT c.*, u.username as host_username, 
               COALESCE(g.name, u.username || '''s Live Call') as group_name, 
               COALESCE(g.image, 'https://picsum.photos/seed/' || u.id || '/400/200') as group_image
        FROM calls c
        JOIN users u ON c.host_id = u.id
        LEFT JOIN groups g ON u.id = g.creator_id
        WHERE c.is_live = 1 AND c.status = 'active'
        GROUP BY c.id
      `).all();
      res.json(liveCalls);
    }
  });

  app.get("/api/streams", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('streams')
        .select('*, profiles!streamer_id(username, avatar_url)')
        .eq('status', 'live')
        .order('viewer_count', { ascending: false });
      
      if (error) throw error;
      
      const streams = (data || []).map(s => ({
        ...s,
        streamer_username: s.profiles?.username || 'Unknown',
        streamer_avatar: s.profiles?.avatar_url || null
      }));
      
      if (streams.length === 0) {
        return res.json([
          { id: 's1', viewer_count: 1200, streamer_id: 'u2', streamer_username: 'sarah_j', title: 'Morning Yoga & Meditation', category: 'fitness' },
          { id: 's2', viewer_count: 850, streamer_id: 'u3', streamer_username: 'tech_guru', title: 'Building a SaaS in 24h', category: 'tech' },
          { id: 's3', viewer_count: 3400, streamer_id: 'u4', streamer_username: 'alex_vibe', title: 'Late Night DJ Set 🎧', category: 'music' },
          { id: 's4', viewer_count: 150, streamer_id: 'u5', streamer_username: 'nature_lover', title: 'Exploring the Amazon', category: 'education' },
        ]);
      }
      res.json(streams);
    } catch (err) {
      logToFile(`SERVER: Supabase streams fetch error: ${err}`);
      const streams = db.prepare(`
        SELECT s.*, u.username as streamer_username, u.avatar as streamer_avatar
        FROM streams s
        JOIN users u ON s.streamer_id = u.id
        WHERE s.status = 'live'
        ORDER BY s.viewer_count DESC
      `).all();
      res.json(streams);
    }
  });

  app.post("/api/calls/:id/go-live", async (req, res) => {
    const callId = req.params.id;
    const streamId = uuidv4();
    
    try {
      db.prepare('UPDATE calls SET is_live = 1, stream_id = ? WHERE id = ?').run(streamId, callId);
      
      const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId);
      db.prepare("INSERT INTO streams (id, streamer_id, status) VALUES (?, ?, ?)")
        .run(streamId, call.host_id, 'live');
      
      // Sync to Supabase
      try {
        await supabase.from('calls').update({ is_live: true, stream_id: streamId }).eq('id', callId);
        await supabase.from('streams').insert({
          id: streamId,
          streamer_id: call.host_id,
          status: 'live'
        });
      } catch (e) {
        logToFile(`SERVER: Supabase go-live sync error: ${e}`);
      }
        
      res.json({ success: true, streamId });
    } catch (err) {
      res.status(500).json({ error: 'Failed to go live' });
    }
  });

  app.post("/api/calls/:id/request-join", (req, res) => {
    const { userId, amount } = req.body;
    const callId = req.params.id;
    
    const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
    if (!user || user.coins < amount) {
      return res.status(400).json({ error: 'Insufficient coins' });
    }
    
    // Deduct coins
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(amount, userId);
    
    const requestId = uuidv4();
    db.prepare('INSERT INTO join_requests (id, call_id, user_id, amount) VALUES (?, ?, ?, ?)')
      .run(requestId, callId, userId, amount);
      
    res.json({ success: true, requestId });
  });

  app.post("/api/calls/:id/respond-join", (req, res) => {
    const { requestId, status } = req.body;
    const callId = req.params.id;
    
    const request = db.prepare('SELECT * FROM join_requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    
    db.prepare('UPDATE join_requests SET status = ? WHERE id = ?').run(status, requestId);
    
    if (status === 'accepted') {
      // Add as speaker
      db.prepare('INSERT OR IGNORE INTO call_speakers (call_id, user_id) VALUES (?, ?)').run(callId, request.user_id);
      
      // Revenue split (70% host, 30% platform)
      const call = db.prepare('SELECT host_id FROM calls WHERE id = ?').get(callId);
      const hostPayout = Math.floor(request.amount * 0.7);
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(hostPayout, call.host_id);
      
      // Record transaction for host
      db.prepare('INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
        .run(uuidv4(), call.host_id, hostPayout, 'support', 'Speaker join commission');
    } else if (status === 'declined') {
      // Refund user
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(request.amount, request.user_id);
    }
    
    res.json({ success: true });
  });

  app.get("/api/calls/:id/requests", (req, res) => {
    const requests = db.prepare(`
      SELECT jr.*, u.username 
      FROM join_requests jr
      JOIN users u ON jr.user_id = u.id
      WHERE jr.call_id = ? AND jr.status = 'pending'
    `).all(req.params.id);
    res.json(requests);
  });

  app.get("/api/inventory/:userId", (req, res) => {
    const products = db.prepare('SELECT * FROM products WHERE seller_id = ?').all(req.params.userId);
    res.json(products);
  });

  app.post("/api/live-selling/start", (req, res) => {
    const { streamerId, productIds } = req.body;
    const sessionId = uuidv4();
    
    db.prepare('INSERT INTO live_selling_sessions (id, streamer_id) VALUES (?, ?)').run(sessionId, streamerId);
    
    const insertProduct = db.prepare('INSERT INTO live_session_products (session_id, product_id) VALUES (?, ?)');
    for (const pid of productIds) {
      insertProduct.run(sessionId, pid);
    }
    
    res.json({ sessionId });
  });

  app.get("/api/live-selling/:sessionId/products", (req, res) => {
    const products = db.prepare(`
      SELECT p.* FROM products p
      JOIN live_session_products lsp ON p.id = lsp.product_id
      WHERE lsp.session_id = ?
    `).all(req.params.sessionId);
    res.json(products);
  });

  app.post("/api/live-selling/buy", (req, res) => {
    const { buyerId, productId, sessionId, paymentMethod } = req.body;
    
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product || product.stock <= 0) {
      return res.status(400).json({ error: 'Product out of stock' });
    }

    const buyer = db.prepare('SELECT * FROM users WHERE id = ?').get(buyerId);
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' });

    // Payment validation
    if (paymentMethod === 'coins' && buyer.coins < product.price) {
      return res.status(400).json({ error: 'Insufficient coins' });
    }
    if (paymentMethod === 'wallet' && buyer.usd_balance < product.price) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    // Process payment
    if (paymentMethod === 'coins') {
      db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(product.price, buyerId);
    } else if (paymentMethod === 'wallet') {
      db.prepare('UPDATE users SET usd_balance = usd_balance - ? WHERE id = ?').run(product.price, buyerId);
    }
    // Card payment simulated as success

    // Update stock
    db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ?').run(productId);

    // Commission split (10% platform, 90% seller)
    const commission = product.price * 0.1;
    const payout = product.price * 0.9;
    
    db.prepare('UPDATE users SET usd_balance = usd_balance + ? WHERE id = ?').run(payout, product.seller_id);

    // Record order
    const orderId = uuidv4();
    db.prepare(`
      INSERT INTO orders (id, buyer_id, seller_id, product_id, session_id, amount, payment_method, platform_commission, seller_payout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, buyerId, product.seller_id, productId, sessionId, product.price, paymentMethod, commission, payout);

    res.json({ success: true, orderId, newStock: product.stock - 1 });
  });

  app.get("/api/orders/:sellerId", (req, res) => {
    const orders = db.prepare(`
      SELECT o.*, p.title as product_title, u.username as buyer_username
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.buyer_id = u.id
      WHERE o.seller_id = ?
      ORDER BY o.created_at DESC
    `).all(req.params.sellerId);
    res.json(orders);
  });

  // Marketplace Endpoints
  app.get("/api/marketplace/products", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, profiles(username)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const products = (data || []).map(p => ({
        ...p,
        seller_username: p.profiles?.username || 'Unknown'
      }));
      
      res.json(products);
    } catch (err) {
      logToFile(`SERVER: Supabase products fetch error: ${err}`);
      const products = db.prepare(`
        SELECT p.*, u.username as seller_username
        FROM products p
        JOIN users u ON p.seller_id = u.id
        ORDER BY p.id DESC
      `).all();
      res.json(products);
    }
  });

  app.get("/api/marketplace/products/:id", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, profiles(username)')
        .eq('id', req.params.id)
        .single();
      
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Product not found' });
      
      const product = {
        ...data,
        seller_username: data.profiles?.username || 'Unknown'
      };
      
      res.json(product);
    } catch (err) {
      logToFile(`SERVER: Supabase product fetch error: ${err}`);
      const product = db.prepare(`
        SELECT p.*, u.username as seller_username
        FROM products p
        JOIN users u ON p.seller_id = u.id
        WHERE p.id = ?
      `).get(req.params.id);
      
      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json(product);
    }
  });

  app.post("/api/marketplace/products", async (req, res) => {
    const { title, price, category, location, image, sellerId, description, stock } = req.body;
    logToFile(`SERVER: Creating product ${title}, image length: ${image?.length || 0}`);
    const id = uuidv4();
    
    try {
      db.prepare('INSERT INTO products (id, title, price, category, location, image, seller_id, description, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, title, price, category, location, image, sellerId, description || '', stock || 10);
      
      // Sync to Supabase
      try {
        const { error: syncError } = await supabase.from('products').upsert({
          id,
          title,
          price,
          category,
          location,
          image,
          seller_id: sellerId,
          description: description || '',
          stock: stock || 10
        });
        if (syncError) logToFile(`SERVER: Supabase product sync error: ${syncError.message}`);
      } catch (e) {
        logToFile(`SERVER: Supabase product sync exception: ${e}`);
      }
      
      res.json({ id, title, price });
    } catch (err) {
      logToFile(`SERVER: Create product error: ${err}`);
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  app.post("/api/marketplace/buy", async (req, res) => {
    const { buyerId, productId } = req.body;
    
    try {
      // Get product from Supabase if possible, otherwise SQLite
      let product;
      try {
        const { data } = await supabase.from('products').select('*').eq('id', productId).single();
        product = data;
      } catch (e) {}
      
      if (!product) {
        product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
      }

      if (!product || product.stock <= 0) {
        return res.status(400).json({ error: 'Product out of stock' });
      }

      // Get buyer
      let buyer;
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', buyerId).single();
        buyer = data;
      } catch (e) {}
      
      if (!buyer) {
        buyer = db.prepare('SELECT * FROM users WHERE id = ?').get(buyerId);
      }

      if (!buyer) return res.status(404).json({ error: 'Buyer not found' });

      // Check coins (assuming coins are in profiles or users)
      const buyerCoins = buyer.coins || 0;
      if (buyerCoins < product.price) {
        return res.status(400).json({ error: 'Insufficient coins' });
      }

      // Process payment
      db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(product.price, buyerId);
      db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ?').run(productId);
      
      const commission = product.price * 0.1;
      const payout = product.price * 0.9;
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(payout, product.seller_id);

      const orderId = uuidv4();
      db.prepare(`
        INSERT INTO orders (id, buyer_id, seller_id, product_id, amount, payment_method, platform_commission, seller_payout)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(orderId, buyerId, product.seller_id, productId, product.price, 'coins', commission, payout);

      // Sync to Supabase
      try {
        await supabase.rpc('decrement_coins', { user_id: buyerId, amount: product.price });
        await supabase.rpc('increment_coins', { user_id: product.seller_id, amount: payout });
        await supabase.from('products').update({ stock: product.stock - 1 }).eq('id', productId);
        await supabase.from('orders').insert({
          id: orderId,
          buyer_id: buyerId,
          seller_id: product.seller_id,
          product_id: productId,
          amount: product.price,
          payment_method: 'coins',
          platform_commission: commission,
          seller_payout: payout
        });
      } catch (e) {
        logToFile(`SERVER: Supabase buy sync error: ${e}`);
      }

      res.json({ success: true, orderId, newStock: product.stock - 1 });
    } catch (err) {
      logToFile(`SERVER: Buy error: ${err}`);
      res.status(500).json({ error: 'Failed to process purchase' });
    }
  });

  // Reels Endpoints
  app.get("/api/reels", (req, res) => {
    const reels = db.prepare(`
      SELECT r.*, u.username, u.avatar
      FROM reels r
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
    `).all();
    res.json(reels);
  });

  // Stories API
  app.get("/api/stories", async (req, res) => {
    const now = new Date().toISOString();
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .gt('expires_at', now)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        return res.json(data);
      }
      
      // Fallback to SQLite if Supabase returns nothing
      const stories = db.prepare(`
        SELECT * FROM stories 
        WHERE expires_at > ? 
        ORDER BY created_at DESC
      `).all(now);
      res.json(stories);
    } catch (err) {
      logToFile(`SERVER: Supabase stories fetch error: ${err}`);
      try {
        const stories = db.prepare(`
          SELECT * FROM stories 
          WHERE expires_at > ? 
          ORDER BY created_at DESC
        `).all(now);
        res.json(stories);
      } catch (dbErr) {
        logToFile(`SERVER: DB stories fetch error: ${dbErr}`);
        res.json([]);
      }
    }
  });

  app.post("/api/stories", async (req, res) => {
    const { userId, username, avatar, imageUrl } = req.body;
    if (!userId || !imageUrl) return res.status(400).json({ error: 'Missing required fields' });

    logToFile(`SERVER: Creating story for ${username}, image length: ${imageUrl.length}`);
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    try {
      db.prepare(`
        INSERT INTO stories (id, user_id, username, avatar, image_url, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, username, avatar, imageUrl, createdAt, expiresAt);
      
      // Sync to Supabase
      try {
        await supabase.from('stories').upsert({
          id,
          user_id: userId,
          username,
          avatar,
          image_url: imageUrl,
          created_at: createdAt,
          expires_at: expiresAt
        });
      } catch (e) {
        logToFile(`SERVER: Supabase story sync error: ${e}`);
      }

      res.json({ success: true, id });
    } catch (err) {
      logToFile(`SERVER: Create story error: ${err}`);
      res.status(500).json({ error: 'Failed to create story' });
    }
  });

  app.post("/api/reels", (req, res) => {
    const { userId, url, thumbnail, caption, soundTitle, soundArtist } = req.body;
    const id = uuidv4();
    
    try {
      db.prepare(`
        INSERT INTO reels (id, user_id, url, thumbnail, caption, sound_title, sound_artist)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, url, thumbnail || url, caption || '', soundTitle || null, soundArtist || null);
      
      res.json({ success: true, id });
    } catch (err) {
      console.error('Reel upload error:', err);
      res.status(500).json({ error: 'Failed to save reel' });
    }
  });

  // Game Sessions State
  const activeGames = new Map<string, any>();
  const socketToRoom = new Map<string, string>();
  const hostSockets = new Set<string>();

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join_live", (streamId) => {
      socket.join(streamId);
      socketToRoom.set(socket.id, streamId);
      db.prepare('UPDATE streams SET viewer_count = viewer_count + 1 WHERE id = ?').run(streamId);
      console.log(`Socket ${socket.id} joined live stream ${streamId}`);
    });

    socket.on("join_group", (groupId) => {
      socket.join(`group_${groupId}`);
      console.log(`Socket ${socket.id} joined group ${groupId}`);
      
      // Sync messages from Supabase to SQLite before sending history
      syncGroupMessages(groupId).then(() => {
        const history = db.prepare('SELECT * FROM group_messages WHERE group_id = ? ORDER BY timestamp ASC LIMIT 100').all(groupId);
        socket.emit("group_history", history);
      }).catch(err => {
        console.error('Error syncing group messages on join:', err);
        // Still send what we have in local DB
        const history = db.prepare('SELECT * FROM group_messages WHERE group_id = ? ORDER BY timestamp ASC LIMIT 100').all(groupId);
        socket.emit("group_history", history);
      });
    });

    socket.on("send_group_message", async (data) => {
      const { groupId, userId, username, text, type, audioUrl, imageUrl } = data;
      
      // Check membership
      const membership = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
      if (!membership) {
        console.warn(`User ${userId} attempted to send message to group ${groupId} without being a member.`);
        return;
      }

      const messageId = uuidv4();
      const timestamp = new Date().toISOString();

      // Save to local DB
      try {
        db.prepare('INSERT INTO group_messages (id, group_id, user_id, username, text, timestamp, type, audio_url, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(messageId, groupId, userId, username, text, timestamp, type || 'text', audioUrl || null, imageUrl || null);
        
        // Sync to Supabase
        supabase.from('group_messages').upsert({
          id: messageId,
          group_id: groupId,
          user_id: userId,
          username,
          text,
          timestamp,
          type: type || 'text',
          audio_url: audioUrl || null,
          image_url: imageUrl || null
        }).then(({ error }) => {
          if (error) {
            if (error.code === '42P01') {
              console.warn('Supabase table "group_messages" does not exist. Skipping sync.');
            } else {
              console.error('Supabase group_messages sync error:', error.code, error.message);
            }
          }
        });

        // Broadcast to group
        io.to(`group_${groupId}`).emit("group_message", {
          id: messageId,
          group_id: groupId,
          user_id: userId,
          username,
          text,
          timestamp,
          type: type || 'text',
          audio_url: audioUrl || null,
          image_url: imageUrl || null
        });
      } catch (err) {
        console.error('Error saving group message:', err);
      }
    });

    socket.on("start_stream", (data) => {
      const { streamId, streamerId, title, category } = data;
      socketToRoom.set(socket.id, streamId);
      hostSockets.add(socket.id);
      db.prepare("INSERT OR REPLACE INTO streams (id, streamer_id, title, category, status, started_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
        .run(streamId, streamerId, title || 'Live Stream', category || 'General', 'live');
      console.log(`Stream ${streamId} started by ${streamerId} in category ${category}`);
    });

    socket.on("end_stream", (data) => {
      const { streamId } = data;
      db.prepare("UPDATE streams SET status = ?, ended_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
        .run('ended', streamId);
      
      const summary = db.prepare('SELECT * FROM streams WHERE id = ?').get(streamId);
      io.to(streamId).emit("stream_ended", { streamId, summary });
      hostSockets.delete(socket.id);
      console.log(`Stream ${streamId} ended`);
    });

    socket.on("live_selling:purchase", (data) => {
      const { streamId, productId, buyerName, productTitle } = data;
      // Broadcast to everyone in the stream
      io.to(streamId).emit("live_selling:alert", { buyerName, productTitle });
      io.to(streamId).emit("live_selling:stock_update", { productId });
    });

    socket.on("send_comment", (data) => {
      const { streamId, user, text } = data;
      io.to(streamId).emit("call:new_message", { username: user, text });
    });

    socket.on("send_gift", (data) => {
      const { streamId, user, giftName, icon, animation } = data;
      io.to(streamId).emit("call:new_gift", { id: Date.now(), username: user, giftName, icon, animation });
    });

    socket.on("send_reaction", (data) => {
      const { streamId } = data;
      io.to(streamId).emit("call:new_reaction", { streamId });
    });

    // 1) Coin Rain War
    socket.on("start_coin_rain", (data) => {
      const { streamerId, streamId } = data;
      const cost = 50;

      const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(streamerId);
      if (user && user.coins >= cost) {
        db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(cost, streamerId);
        db.prepare('INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
          .run(uuidv4(), streamerId, -cost, 'game_start', 'Started Coin Rain War');

        const gameId = uuidv4();
        const game = {
          id: gameId,
          type: 'coin_rain',
          streamerId,
          scores: new Map(),
          endTime: Date.now() + 30000
        };
        activeGames.set(gameId, game);

        io.to(streamId).emit("game_started", { 
          gameType: 'coin_rain', 
          gameId, 
          duration: 30,
          streamerName: 'Streamer' 
        });

        setTimeout(() => {
          // End game and find winner
          const scores = Array.from(game.scores.entries()).sort((a, b) => b[1] - a[1]);
          const winner = scores[0];
          if (winner) {
            const [winnerId, score] = winner;
            const reward = 100;
            db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(reward, winnerId);
            db.prepare('INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
              .run(uuidv4(), winnerId, reward, 'game_win', 'Won Coin Rain War');

            const winnerUser = db.prepare('SELECT username FROM users WHERE id = ?').get(winnerId);
            io.to(streamId).emit("game_ended", { 
              gameType: 'coin_rain', 
              winner: winnerUser?.username || 'Unknown', 
              reward 
            });
          }
          activeGames.delete(gameId);
        }, 30000);
      } else {
        socket.emit("error", "Insufficient coins to start game");
      }
    });

    socket.on("catch_coin", (data) => {
      const { gameId, userId, streamId } = data;
      const game = activeGames.get(gameId);
      if (game && Date.now() < game.endTime) {
        const currentScore = game.scores.get(userId) || 0;
        game.scores.set(userId, currentScore + 1);
        
        // Broadcast real-time leaderboard
        const leaderboard = Array.from(game.scores.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([uid, score]) => {
            const u = db.prepare('SELECT username FROM users WHERE id = ?').get(uid);
            return { username: u?.username || 'Anonymous', score };
          });
        
        io.to(streamId).emit("leaderboard_update", { gameId, leaderboard });
      }
    });

    // 2) Secret Gift Bomb
    socket.on("start_gift_bomb", (data) => {
      const { streamerId, streamId } = data;
      const gameId = uuidv4();
      const game = {
        id: gameId,
        type: 'gift_bomb',
        streamerId,
        contributions: new Map(),
        target: 500, // Total coins needed to unlock
        current: 0
      };
      activeGames.set(gameId, game);
      io.to(streamId).emit("game_started", { gameType: 'gift_bomb', gameId, target: 500 });
    });

    socket.on("contribute_gift_bomb", (data) => {
      const { gameId, userId, amount, streamId } = data;
      const game = activeGames.get(gameId);
      if (game) {
        const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
        if (user && user.coins >= amount) {
          db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(amount, userId);
          db.prepare('INSERT INTO transactions (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
            .run(uuidv4(), userId, -amount, 'gift', 'Contributed to Gift Bomb');

          game.current += amount;
          const userContrib = game.contributions.get(userId) || 0;
          game.contributions.set(userId, userContrib + amount);

          io.to(streamId).emit("gift_bomb_update", { gameId, current: game.current, target: game.target });

          if (game.current >= game.target) {
            const topContributor = Array.from(game.contributions.entries()).sort((a, b) => (b[1] as number) - (a[1] as number))[0] as any;
            if (topContributor) {
              const [winnerId] = topContributor;
              const winnerUser = db.prepare('SELECT username FROM users WHERE id = ?').get(winnerId);
              
              // Prize logic
              const reward = 200;
              db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(reward, winnerId);
              
              io.to(streamId).emit("game_ended", { 
                gameType: 'gift_bomb', 
                winner: winnerUser?.username || 'Unknown', 
                prize: '200 Coins & VIP Badge' 
              });
              activeGames.delete(gameId);
            }
          }
        }
      }
    });

    // 3) Power Duel
    socket.on("start_power_duel", (data) => {
      const { streamerId, streamId, opponentId } = data;
      const gameId = uuidv4();
      const game = {
        id: gameId,
        type: 'power_duel',
        streamerId,
        opponentId,
        streamerScore: 0,
        opponentScore: 0,
        endTime: Date.now() + 15000
      };
      activeGames.set(gameId, game);
      io.to(streamId).emit("game_started", { gameType: 'power_duel', gameId, streamerId, opponentId });

      setTimeout(() => {
        const winnerId = game.streamerScore > game.opponentScore ? game.streamerId : game.opponentId;
        const loserId = winnerId === game.streamerId ? game.opponentId : game.streamerId;
        
        const cost = 30;
        db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(cost, loserId);
        db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(cost, winnerId);
        
        const winnerUser = db.prepare('SELECT username FROM users WHERE id = ?').get(winnerId);
        io.to(streamId).emit("game_ended", { gameType: 'power_duel', winner: winnerUser?.username || 'Unknown' });
        activeGames.delete(gameId);
      }, 15000);
    });

    socket.on("duel_tap", (data) => {
      const { gameId, userId, streamId } = data;
      const game = activeGames.get(gameId);
      if (game && Date.now() < game.endTime) {
        if (userId === game.streamerId) game.streamerScore++;
        else if (userId === game.opponentId) game.opponentScore++;
        io.to(streamId).emit("duel_update", { 
          gameId, 
          streamerScore: game.streamerScore, 
          opponentScore: game.opponentScore 
        });
      }
    });

    // 4) Live Kingdom
    const kingdoms = new Map(); // streamId -> { kingdomA: 0, kingdomB: 0 }
    socket.on("start_live_kingdom", (data) => {
      const { streamId } = data;
      kingdoms.set(streamId, { kingdomA: 0, kingdomB: 0 });
      io.to(streamId).emit("game_started", { gameType: 'live_kingdom', gameId: uuidv4() });
    });

    socket.on("kingdom_support", (data) => {
      const { streamId, kingdom, amount, userId } = data;
      const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
      if (user && user.coins >= amount) {
        db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(amount, userId);
        
        const streamKingdoms = kingdoms.get(streamId) || { kingdomA: 0, kingdomB: 0 };
        streamKingdoms[kingdom] += amount;
        kingdoms.set(streamId, streamKingdoms);

        let dominant = '';
        if (streamKingdoms.kingdomA > streamKingdoms.kingdomB) dominant = 'kingdomA';
        else if (streamKingdoms.kingdomB > streamKingdoms.kingdomA) dominant = 'kingdomB';
        
        io.to(streamId).emit("kingdom_update", { 
          kingdomA: streamKingdoms.kingdomA, 
          kingdomB: streamKingdoms.kingdomB,
          dominant
        });
      }
    });

    // Group Chat Events (Consolidated above)


    socket.on("join_direct_chat", (data) => {
      const { userId, targetId } = data;
      const roomId = [userId, targetId].sort().join('_');
      socket.join(`direct_${roomId}`);
      
      // Send message history
      const history = db.prepare('SELECT * FROM direct_messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY timestamp ASC LIMIT 50')
        .all(userId, targetId, targetId, userId);
      socket.emit("direct_history", history);
    });

    socket.on("send_direct_message", (data) => {
      const { senderId, receiverId, text, type, audioUrl, imageUrl } = data;
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();
      const roomId = [senderId, receiverId].sort().join('_');

      // Save to DB
      db.prepare('INSERT INTO direct_messages (id, sender_id, receiver_id, text, timestamp, type, audio_url, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(messageId, senderId, receiverId, text, timestamp, type || 'text', audioUrl || null, imageUrl || null);

      // Broadcast to room
      io.to(`direct_${roomId}`).emit("direct_message", {
        id: messageId,
        sender_id: senderId,
        receiver_id: receiverId,
        text,
        timestamp,
        type: type || 'text',
        audio_url: audioUrl || null,
        image_url: imageUrl || null
      });
    });

    // Call Signaling
    socket.on('call:join', (data) => {
      const { callId, userId, username } = data;
      socket.join(`call:${callId}`);
      socket.to(`call:${callId}`).emit('call:user_joined', { userId, username, socketId: socket.id });
    });

    socket.on('call:started', (data) => {
      const { groupId, callId, hostId, type } = data;
      io.to(`group_${groupId}`).emit('call:started', { callId, hostId, type });
    });

    socket.on('call:ended', (data) => {
      const { groupId, callId } = data;
      io.to(`group_${groupId}`).emit('call:ended', { callId });
    });

    socket.on('call:signal', (data) => {
      const { to, signal, from } = data;
      io.to(to).emit('call:signal', { signal, from });
    });

    socket.on('call:leave', (data) => {
      const { callId, userId } = data;
      socket.leave(`call:${callId}`);
      
      // Remove from speakers
      db.prepare('DELETE FROM call_speakers WHERE call_id = ? AND user_id = ?').run(callId, userId);
      
      const call = db.prepare('SELECT host_id FROM calls WHERE id = ?').get(callId);
      if (call && call.host_id === userId) {
        // End call if host leaves
        db.prepare("UPDATE calls SET status = 'ended' WHERE id = ?").run(callId);
        io.to(`call:${callId}`).emit('call:ended', { callId });
      } else {
        socket.to(`call:${callId}`).emit('call:user_left', { userId });
      }
    });

    socket.on('call:go_live', (data) => {
      const { callId, streamId } = data;
      io.to(`call:${callId}`).emit('call:is_live', { streamId });
    });

    socket.on('register_user', (userId) => {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    socket.on('call:initiate', (data) => {
      const { targetId, callerId, callerName, callerAvatar, type, callId } = data;
      io.to(`user_${targetId}`).emit('call:incoming', {
        callerId,
        callerName,
        callerAvatar,
        type,
        callId
      });
    });

    socket.on('call:respond', (data) => {
      const { callerId, response, callId } = data;
      io.to(`user_${callerId}`).emit('call:response', {
        response,
        callId
      });
    });

    socket.on('call:end', (data) => {
      const { targetId, callId } = data;
      io.to(`user_${targetId}`).emit('call:ended', { callId });
    });

    socket.on('call:request_join', (data) => {
      const { callId, requestId, userId, username, amount } = data;
      const call = db.prepare('SELECT host_id FROM calls WHERE id = ?').get(callId);
      // Send to host only (or broadcast to call room if host is there)
      io.to(`call:${callId}`).emit('call:new_request', { requestId, userId, username, amount });
    });

    socket.on('call:respond_join', (data) => {
      const { callId, requestId, userId, status } = data;
      
      if (status === 'accepted') {
        db.prepare('INSERT OR IGNORE INTO call_speakers (call_id, user_id) VALUES (?, ?)').run(callId, userId);
      }
      
      db.prepare('UPDATE join_requests SET status = ? WHERE id = ?').run(status, requestId);
      io.to(`call:${callId}`).emit('call:request_resolved', { requestId, userId, status });
    });

    // 5) Mystery Spin Storm
    socket.on("start_spin_storm", (data) => {
      const { streamId } = data;
      const gameId = uuidv4();
      io.to(streamId).emit("game_started", { gameType: 'spin_storm', gameId, duration: 10 });
      
      setTimeout(() => {
        // In a real app, we'd track participants. For now, pick a random viewer or just end.
        io.to(streamId).emit("game_ended", { 
          gameType: 'spin_storm', 
          winner: 'Everyone!',
          prize: 'Mystery Box' 
        });
      }, 10000);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      const streamId = socketToRoom.get(socket.id);
      if (streamId) {
        if (hostSockets.has(socket.id)) {
          // End stream if host disconnects
          db.prepare("UPDATE streams SET status = ?, ended_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
            .run('ended', streamId);
          const summary = db.prepare('SELECT * FROM streams WHERE id = ?').get(streamId);
          io.to(streamId).emit("stream_ended", { streamId, summary });
          hostSockets.delete(socket.id);
        } else {
          // Decrement viewer count if viewer disconnects
          db.prepare('UPDATE streams SET viewer_count = MAX(0, viewer_count - 1) WHERE id = ?').run(streamId);
        }
        socketToRoom.delete(socket.id);
      }
    });
  });

// Delete group post
app.delete('/api/groups/:groupId/posts/:postId', (req, res) => {
  const { groupId, postId } = req.params;
  try {
    db.prepare('DELETE FROM group_posts WHERE id = ? AND group_id = ?').run(postId, groupId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting group post:', err);
    res.status(500).json({ error: 'Failed to delete group post' });
  }
});

// Update group post
app.put('/api/groups/:groupId/posts/:postId', (req, res) => {
  const { groupId, postId } = req.params;
  const { content, imageUrl } = req.body;
  try {
    db.prepare('UPDATE group_posts SET content = ?, image_url = ? WHERE id = ? AND group_id = ?')
      .run(content, imageUrl, postId, groupId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating group post:', err);
    res.status(500).json({ error: 'Failed to update group post' });
  }
});

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("SERVER: Fatal error during startup:", err);
  process.exit(1);
});
