import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

type LogFn = (message: string) => void;

export function registerAssetsSystem(app: Express, db: Database.Database, logToFile?: LogFn) {
  const log = (message: string) => {
    if (logToFile) logToFile(`ASSETS_SYSTEM: ${message}`);
  };

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_gems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      supply INTEGER NOT NULL DEFAULT 0,
      listed_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS influencer_gifts (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      title TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      earnings_percent REAL NOT NULL DEFAULT 0,
      available_quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      listed_for_sale INTEGER NOT NULL DEFAULT 0,
      avg_buy_price REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, asset_type, asset_id)
    );

    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price_per_unit REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_points (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      points INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets_creator_gems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      supply INTEGER NOT NULL DEFAULT 0,
      listed_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets_influencer_gifts (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      title TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      earnings_percent REAL NOT NULL DEFAULT 0,
      available_quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets_holdings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      asset_type TEXT NOT NULL, -- gem | gift
      asset_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      avg_buy_price REAL NOT NULL DEFAULT 0,
      current_price REAL NOT NULL DEFAULT 0,
      listed_for_sale INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, asset_type, asset_id)
    );

    CREATE TABLE IF NOT EXISTS assets_rewards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      points INTEGER NOT NULL DEFAULT 0,
      current_tier TEXT NOT NULL DEFAULT 'Bronze',
      eligibility_status TEXT NOT NULL DEFAULT 'locked',
      progress_percent REAL NOT NULL DEFAULT 0,
      estimated_reward REAL NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL, -- buy | list | sell | transfer | resell
      asset_type TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets_market_listings (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price_per_unit REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets_reward_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      points_snapshot INTEGER NOT NULL DEFAULT 0,
      activity_score REAL NOT NULL DEFAULT 0,
      reward_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'applied',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets_treasury (
      id TEXT PRIMARY KEY,
      holders_pool REAL NOT NULL DEFAULT 0,
      platform_pool REAL NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const seedGem = db.prepare(`
    INSERT OR IGNORE INTO assets_creator_gems (id, name, creator_id, price, supply, listed_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  seedGem.run('gem-u1', 'Anley Creator Gem', 'u1', 120, 10000, 1800);
  seedGem.run('gem-u2', 'Sarah Spark Gem', 'u2', 85, 7500, 1200);
  seedGem.run('gem-u3', 'Tech Guru Gem', 'u3', 210, 5200, 650);
  db.prepare(
    `
    INSERT OR IGNORE INTO creator_gems (id, name, creator_id, price, supply, listed_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run('gem-u1', 'Anley Creator Gem', 'u1', 120, 10000, 1800);
  db.prepare(
    `
    INSERT OR IGNORE INTO creator_gems (id, name, creator_id, price, supply, listed_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run('gem-u2', 'Sarah Spark Gem', 'u2', 85, 7500, 1200);
  db.prepare(
    `
    INSERT OR IGNORE INTO creator_gems (id, name, creator_id, price, supply, listed_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run('gem-u3', 'Tech Guru Gem', 'u3', 210, 5200, 650);

  const seedGift = db.prepare(`
    INSERT OR IGNORE INTO assets_influencer_gifts (id, creator_id, creator_name, title, price, earnings_percent, available_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  seedGift.run('gift-u1-star', 'u1', 'anley_official', 'Star Burst Gift', 55, 12.5, 5000);
  seedGift.run('gift-u4-crown', 'u4', 'alex_vibe', 'Vibe Crown Gift', 140, 18, 2000);
  seedGift.run('gift-u5-leaf', 'u5', 'nature_lover', 'Nature Leaf Gift', 35, 9.5, 9000);
  db.prepare(
    `
    INSERT OR IGNORE INTO influencer_gifts (id, creator_id, creator_name, title, price, earnings_percent, available_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run('gift-u1-star', 'u1', 'anley_official', 'Star Burst Gift', 55, 12.5, 5000);
  db.prepare(
    `
    INSERT OR IGNORE INTO influencer_gifts (id, creator_id, creator_name, title, price, earnings_percent, available_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run('gift-u4-crown', 'u4', 'alex_vibe', 'Vibe Crown Gift', 140, 18, 2000);
  db.prepare(
    `
    INSERT OR IGNORE INTO influencer_gifts (id, creator_id, creator_name, title, price, earnings_percent, available_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run('gift-u5-leaf', 'u5', 'nature_lover', 'Nature Leaf Gift', 35, 9.5, 9000);

  const seedReward = db.prepare(`
    INSERT OR IGNORE INTO assets_rewards (id, user_id, points, current_tier, eligibility_status, progress_percent, estimated_reward)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  seedReward.run(uuidv4(), 'u1', 11400, 'Gold', 'unlocked', 100, 185);
  seedReward.run(uuidv4(), 'u2', 2620, 'Bronze', 'locked', 26.2, 52);

  const ensureReward = db.prepare(`
    INSERT OR IGNORE INTO assets_rewards (id, user_id, points, current_tier, eligibility_status, progress_percent, estimated_reward)
    VALUES (?, ?, 0, 'Bronze', 'locked', 0, 0)
  `);

  db.prepare('INSERT OR IGNORE INTO assets_treasury (id, holders_pool, platform_pool) VALUES (?, 0, 0)').run('main');

  const normalizeUserId = (input?: unknown): string => {
    const value = typeof input === 'string' ? input.trim() : '';
    return value || 'u1';
  };

  const ensureLocalUser = (userId: string) => {
    db.prepare('INSERT OR IGNORE INTO users (id, username, coins) VALUES (?, ?, ?)').run(userId, userId, 20000);
    db.prepare('INSERT OR IGNORE INTO user_points (id, user_id, points) VALUES (?, ?, 0)').run(uuidv4(), userId);
  };

  const updateRewardState = (userId: string, pointsDelta: number) => {
    ensureReward.run(uuidv4(), userId);
    if (pointsDelta > 0) {
      db.prepare('UPDATE assets_rewards SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(pointsDelta, userId);
    }
    const row = db
      .prepare('SELECT points FROM assets_rewards WHERE user_id = ?')
      .get(userId) as { points: number } | undefined;
    const points = Number(row?.points || 0);
    const eligibility = points >= 10000 ? 'unlocked' : 'locked';
    const progress = Math.min(100, (points / 10000) * 100);
    const tier = points >= 20000 ? 'Platinum' : points >= 10000 ? 'Gold' : points >= 5000 ? 'Silver' : 'Bronze';
    const estimatedReward = Math.min(200, Math.round((points / 10000) * 200));
    db.prepare(
      `
      UPDATE assets_rewards
      SET current_tier = ?, eligibility_status = ?, progress_percent = ?, estimated_reward = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `
    ).run(tier, eligibility, progress, estimatedReward, userId);
  };

  const calculatePointsFromSpend = (coinsSpent: number) => Math.floor((Math.max(0, coinsSpent) / 1000) * 50);
  const addUserPoints = (userId: string, delta: number) => {
    ensureLocalUser(userId);
    if (delta > 0) {
      db.prepare('UPDATE user_points SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(delta, userId);
    }
  };

  const ensureDemoAssetsForUser = (userId: string) => {
    const existing = db.prepare('SELECT COUNT(*) AS c FROM user_assets WHERE user_id = ?').get(userId) as { c: number } | undefined;
    if (Number(existing?.c || 0) > 0) return;

    const gem = db.prepare('SELECT * FROM creator_gems ORDER BY created_at ASC LIMIT 1').get() as any;
    const gift = db.prepare('SELECT * FROM influencer_gifts ORDER BY created_at ASC LIMIT 1').get() as any;
    if (gem) {
      db.prepare(
        `
        INSERT OR IGNORE INTO user_assets (id, user_id, asset_type, asset_id, asset_name, price, quantity, listed_for_sale, avg_buy_price)
        VALUES (?, ?, 'gem', ?, ?, ?, 3, 0, ?)
      `
      ).run(uuidv4(), userId, gem.id, gem.name, gem.price, gem.price);
    }
    if (gift) {
      db.prepare(
        `
        INSERT OR IGNORE INTO user_assets (id, user_id, asset_type, asset_id, asset_name, price, quantity, listed_for_sale, avg_buy_price)
        VALUES (?, ?, 'gift', ?, ?, ?, 2, 0, ?)
      `
      ).run(uuidv4(), userId, gift.id, gift.title, gift.price, gift.price);
    }
  };

  const addTransaction = (input: {
    userId: string;
    action: string;
    assetType: string;
    assetId: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    metadata?: Record<string, unknown>;
  }) => {
    db.prepare(
      `
      INSERT INTO assets_transactions (id, user_id, action, asset_type, asset_id, quantity, unit_price, total_amount, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      uuidv4(),
      input.userId,
      input.action,
      input.assetType,
      input.assetId,
      input.quantity,
      input.unitPrice,
      input.totalAmount,
      JSON.stringify(input.metadata || {})
    );
  };

  const toHoldingView = db.prepare(`
    SELECT
      h.id,
      h.user_id,
      h.asset_type,
      h.asset_id,
      h.quantity,
      h.avg_buy_price,
      h.current_price,
      h.listed_for_sale,
      CASE
        WHEN h.asset_type = 'gem' THEN cg.name
        WHEN h.asset_type = 'gift' THEN ig.title
        ELSE h.asset_id
      END AS asset_name
    FROM assets_holdings h
    LEFT JOIN assets_creator_gems cg ON h.asset_type = 'gem' AND h.asset_id = cg.id
    LEFT JOIN assets_influencer_gifts ig ON h.asset_type = 'gift' AND h.asset_id = ig.id
    WHERE h.user_id = ?
    ORDER BY h.updated_at DESC
  `);

  app.get('/api/assets/gems', (_req, res) => {
    const gems = db
      .prepare(
        `
      SELECT id, name, creator_id, price, supply, listed_count
      FROM creator_gems
      ORDER BY price DESC
    `
      )
      .all();
    res.json(gems);
  });

  app.post('/api/assets/gems/buy', (req, res) => {
    const userId = normalizeUserId(req.body?.userId);
    const gemId = String(req.body?.gemId || '').trim();
    const quantity = Math.max(1, Number(req.body?.quantity) || 1);
    if (!gemId) return res.status(400).json({ error: 'gemId is required' });

    const gem = db.prepare('SELECT * FROM creator_gems WHERE id = ?').get(gemId) as any;
    if (!gem) return res.status(404).json({ error: 'Gem not found' });
    if (gem.supply < quantity) return res.status(400).json({ error: 'Not enough supply' });

    const totalAmount = Number(gem.price) * quantity;
    ensureLocalUser(userId);
    ensureLocalUser(String(gem.creator_id));
    const buyer = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number } | undefined;
    if (Number(buyer?.coins || 0) < totalAmount) {
      return res.status(400).json({ error: 'Insufficient coins' });
    }

    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(totalAmount, userId);
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(totalAmount, String(gem.creator_id));
    db.prepare('UPDATE creator_gems SET supply = supply - ? WHERE id = ?').run(quantity, gemId);
    db.prepare(
      `
      INSERT INTO user_assets (id, user_id, asset_type, asset_id, asset_name, price, quantity, listed_for_sale, avg_buy_price)
      VALUES (?, ?, 'gem', ?, ?, ?, ?, 0, ?)
      ON CONFLICT(user_id, asset_type, asset_id) DO UPDATE SET
        quantity = user_assets.quantity + excluded.quantity,
        avg_buy_price = ((user_assets.avg_buy_price * user_assets.quantity) + (excluded.avg_buy_price * excluded.quantity)) / (user_assets.quantity + excluded.quantity),
        price = excluded.price,
        updated_at = CURRENT_TIMESTAMP
    `
    ).run(uuidv4(), userId, gemId, gem.name, gem.price, quantity, gem.price);

    addTransaction({
      userId,
      action: 'buy',
      assetType: 'gem',
      assetId: gemId,
      quantity,
      unitPrice: Number(gem.price),
      totalAmount,
      metadata: { creatorId: gem.creator_id },
    });
    addUserPoints(userId, calculatePointsFromSpend(totalAmount));
    updateRewardState(userId, calculatePointsFromSpend(totalAmount));

    res.json({ success: true, totalAmount });
  });

  app.post('/api/assets/gems/list', (req, res) => {
    const userId = normalizeUserId(req.body?.userId);
    const gemId = String(req.body?.gemId || '').trim();
    const quantity = Math.max(1, Number(req.body?.quantity) || 1);
    if (!gemId) return res.status(400).json({ error: 'gemId is required' });

    const holding = db
      .prepare('SELECT * FROM user_assets WHERE user_id = ? AND asset_type = ? AND asset_id = ?')
      .get(userId, 'gem', gemId) as any;
    if (!holding || holding.quantity < quantity) return res.status(400).json({ error: 'Not enough gems owned' });

    const listPrice = Math.max(1, Number(req.body?.pricePerUnit) || Number(holding.current_price) || 1);
    db.prepare(
      `
      UPDATE user_assets
      SET listed_for_sale = listed_for_sale + ?, quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND asset_type = 'gem' AND asset_id = ? AND quantity >= ?
    `
    ).run(quantity, quantity, userId, gemId, quantity);
    db.prepare('UPDATE creator_gems SET listed_count = listed_count + ? WHERE id = ?').run(quantity, gemId);
    db.prepare(
      `
      INSERT INTO marketplace_listings (id, seller_id, asset_type, asset_id, asset_name, quantity, price_per_unit, status)
      VALUES (?, ?, 'gem', ?, ?, ?, ?, 'active')
    `
    ).run(uuidv4(), userId, gemId, holding.asset_name || gemId, quantity, listPrice);
    addTransaction({
      userId,
      action: 'list',
      assetType: 'gem',
      assetId: gemId,
      quantity,
      unitPrice: listPrice,
      totalAmount: 0,
    });

    res.json({ success: true });
  });

  app.get('/api/assets/gifts', (_req, res) => {
    const gifts = db
      .prepare(
        `
      SELECT id, creator_id, creator_name, title, price, earnings_percent, available_quantity
      FROM influencer_gifts
      ORDER BY earnings_percent DESC, price DESC
    `
      )
      .all();
    res.json(gifts);
  });

  app.post('/api/assets/gifts/buy', (req, res) => {
    const userId = normalizeUserId(req.body?.userId);
    const giftId = String(req.body?.giftId || '').trim();
    const quantity = Math.max(1, Number(req.body?.quantity) || 1);
    if (!giftId) return res.status(400).json({ error: 'giftId is required' });

    const gift = db.prepare('SELECT * FROM influencer_gifts WHERE id = ?').get(giftId) as any;
    if (!gift) return res.status(404).json({ error: 'Gift not found' });
    if (gift.available_quantity < quantity) return res.status(400).json({ error: 'Not enough inventory' });

    const totalAmount = Number(gift.price) * quantity;
    ensureLocalUser(userId);
    ensureLocalUser(String(gift.creator_id));
    const buyer = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number } | undefined;
    if (Number(buyer?.coins || 0) < totalAmount) {
      return res.status(400).json({ error: 'Insufficient coins' });
    }

    // 70/20/10 split.
    const creatorShare = totalAmount * 0.7;
    const holdersShare = totalAmount * 0.2;
    const platformShare = totalAmount * 0.1;
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(totalAmount, userId);
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(creatorShare, String(gift.creator_id));

    const currentHolders = db
      .prepare('SELECT user_id, quantity FROM user_assets WHERE asset_type = ? AND asset_id = ? AND quantity > 0')
      .all('gift', giftId) as Array<{ user_id: string; quantity: number }>;
    const totalHolderQty = currentHolders.reduce((sum, h) => sum + Number(h.quantity || 0), 0);
    if (totalHolderQty > 0) {
      for (const holder of currentHolders) {
        const holderPart = (holdersShare * Number(holder.quantity || 0)) / totalHolderQty;
        ensureLocalUser(holder.user_id);
        db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(holderPart, holder.user_id);
      }
    } else {
      db.prepare('UPDATE assets_treasury SET holders_pool = holders_pool + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(holdersShare, 'main');
    }
    db.prepare('UPDATE assets_treasury SET platform_pool = platform_pool + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(platformShare, 'main');

    db.prepare('UPDATE influencer_gifts SET available_quantity = available_quantity - ? WHERE id = ?').run(quantity, giftId);
    db.prepare(
      `
      INSERT INTO user_assets (id, user_id, asset_type, asset_id, asset_name, price, quantity, listed_for_sale, avg_buy_price)
      VALUES (?, ?, 'gift', ?, ?, ?, ?, 0, ?)
      ON CONFLICT(user_id, asset_type, asset_id) DO UPDATE SET
        quantity = user_assets.quantity + excluded.quantity,
        avg_buy_price = ((user_assets.avg_buy_price * user_assets.quantity) + (excluded.avg_buy_price * excluded.quantity)) / (user_assets.quantity + excluded.quantity),
        price = excluded.price,
        updated_at = CURRENT_TIMESTAMP
    `
    ).run(uuidv4(), userId, giftId, gift.title, gift.price, quantity, gift.price);
    addTransaction({
      userId,
      action: 'buy',
      assetType: 'gift',
      assetId: giftId,
      quantity,
      unitPrice: Number(gift.price),
      totalAmount,
      metadata: { creatorShare, holdersShare, platformShare },
    });
    addUserPoints(userId, calculatePointsFromSpend(totalAmount));
    updateRewardState(userId, calculatePointsFromSpend(totalAmount));

    res.json({ success: true, totalAmount });
  });

  app.post('/api/assets/gifts/resell', (req, res) => {
    const userId = normalizeUserId(req.body?.userId);
    const giftId = String(req.body?.giftId || '').trim();
    const quantity = Math.max(1, Number(req.body?.quantity) || 1);
    const resalePrice = Math.max(0, Number(req.body?.resalePrice) || 0);
    if (!giftId) return res.status(400).json({ error: 'giftId is required' });

    const holding = db
      .prepare('SELECT * FROM user_assets WHERE user_id = ? AND asset_type = ? AND asset_id = ?')
      .get(userId, 'gift', giftId) as any;
    if (!holding || holding.quantity < quantity) return res.status(400).json({ error: 'Not enough gifts owned' });

    db.prepare(
      `
      UPDATE user_assets
      SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND asset_type = 'gift' AND asset_id = ?
    `
    ).run(quantity, userId, giftId);
    db.prepare('UPDATE influencer_gifts SET available_quantity = available_quantity + ? WHERE id = ?').run(quantity, giftId);
    addTransaction({
      userId,
      action: 'resell',
      assetType: 'gift',
      assetId: giftId,
      quantity,
      unitPrice: resalePrice,
      totalAmount: resalePrice * quantity,
    });

    res.json({ success: true });
  });

  app.get('/api/assets/trending', (_req, res) => {
    const rows = db
      .prepare(
        `
      WITH recent AS (
        SELECT asset_type, asset_id, SUM(total_amount) AS volume_7d, SUM(quantity) AS tx_count_7d
        FROM assets_transactions
        WHERE datetime(created_at) >= datetime('now', '-7 day')
        GROUP BY asset_type, asset_id
      ),
      previous AS (
        SELECT asset_type, asset_id, SUM(total_amount) AS volume_prev_7d
        FROM assets_transactions
        WHERE datetime(created_at) < datetime('now', '-7 day')
          AND datetime(created_at) >= datetime('now', '-14 day')
        GROUP BY asset_type, asset_id
      )
      SELECT
        t.asset_type,
        t.asset_id,
        SUM(t.quantity) AS total_volume,
        (
          CASE
            WHEN COALESCE(previous.volume_prev_7d, 0) > 0
              THEN ((COALESCE(recent.volume_7d, 0) - previous.volume_prev_7d) / previous.volume_prev_7d) * 100.0
            ELSE 0
          END
        ) AS growth_percent,
        COALESCE(recent.tx_count_7d, 0) AS tx_count_7d
      FROM assets_transactions t
      LEFT JOIN user_assets h
        ON h.asset_type = t.asset_type AND h.asset_id = t.asset_id
      LEFT JOIN recent ON recent.asset_type = t.asset_type AND recent.asset_id = t.asset_id
      LEFT JOIN previous ON previous.asset_type = t.asset_type AND previous.asset_id = t.asset_id
      GROUP BY t.asset_type, t.asset_id
      ORDER BY tx_count_7d DESC, total_volume DESC
      LIMIT 10
    `
      )
      .all() as any[];

    const result = rows.map((row) => {
      const gem = row.asset_type === 'gem'
        ? (db.prepare('SELECT name FROM creator_gems WHERE id = ?').get(row.asset_id) as any)
        : null;
      const gift = row.asset_type === 'gift'
        ? (db.prepare('SELECT title FROM influencer_gifts WHERE id = ?').get(row.asset_id) as any)
        : null;
      return {
        ...row,
        asset_name: gem?.name || gift?.title || row.asset_id,
        growth_percent: Number(row.growth_percent || 0),
      };
    });

    res.json(result);
  });

  app.get('/api/assets/my-assets/:userId', (req, res) => {
    const userId = normalizeUserId(req.params.userId);
    ensureLocalUser(userId);
    ensureDemoAssetsForUser(userId);
    const holdings = db
      .prepare(
        `
      SELECT id, user_id, asset_type, asset_id, asset_name, quantity, avg_buy_price, price as current_price, listed_for_sale
      FROM user_assets
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `
      )
      .all(userId) as any[];
    const withProfitLoss = holdings.map((item) => {
      const costBasis = Number(item.avg_buy_price) * Number(item.quantity);
      const marketValue = Number(item.current_price) * Number(item.quantity);
      return {
        ...item,
        profit_loss: marketValue - costBasis,
      };
    });
    res.json(withProfitLoss);
  });

  app.post('/api/assets/my-assets/sell', (req, res) => {
    const userId = normalizeUserId(req.body?.userId);
    const assetType = String(req.body?.assetType || '').trim();
    const assetId = String(req.body?.assetId || '').trim();
    const quantity = Math.max(1, Number(req.body?.quantity) || 1);
    const sellPrice = Math.max(0, Number(req.body?.sellPrice) || 0);

    ensureLocalUser(userId);
    const listingId = String(req.body?.listingId || '').trim();
    const holding = db
      .prepare('SELECT * FROM user_assets WHERE user_id = ? AND asset_type = ? AND asset_id = ?')
      .get(userId, assetType, assetId) as any;
    // If listingId is provided, this endpoint acts as buyer checkout from assets marketplace.
    if (listingId) {
      const listing = db
        .prepare('SELECT * FROM marketplace_listings WHERE id = ? AND status = ?')
        .get(listingId, 'active') as any;
      if (!listing) return res.status(404).json({ error: 'Listing not found' });
      if (listing.quantity < quantity) return res.status(400).json({ error: 'Listing quantity too low' });
      const totalAmount = Number(listing.price_per_unit) * quantity;
      const buyer = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number } | undefined;
      if (Number(buyer?.coins || 0) < totalAmount) return res.status(400).json({ error: 'Insufficient coins' });

      ensureLocalUser(String(listing.seller_id));
      db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(totalAmount, userId);
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(totalAmount, String(listing.seller_id));

      db.prepare(
        `
        INSERT INTO user_assets (id, user_id, asset_type, asset_id, asset_name, price, quantity, listed_for_sale, avg_buy_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(user_id, asset_type, asset_id) DO UPDATE SET
          quantity = user_assets.quantity + excluded.quantity,
          avg_buy_price = ((user_assets.avg_buy_price * user_assets.quantity) + (excluded.avg_buy_price * excluded.quantity)) / (user_assets.quantity + excluded.quantity),
          price = excluded.price,
          updated_at = CURRENT_TIMESTAMP
      `
      ).run(
        uuidv4(),
        userId,
        listing.asset_type,
        listing.asset_id,
        listing.asset_name || listing.asset_id,
        listing.price_per_unit,
        quantity,
        listing.price_per_unit
      );

      db.prepare(
        `
        UPDATE marketplace_listings
        SET quantity = quantity - ?, status = CASE WHEN quantity - ? <= 0 THEN 'sold' ELSE 'active' END, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(quantity, quantity, listingId);

      addTransaction({
        userId,
        action: 'buy_listing',
        assetType: listing.asset_type,
        assetId: listing.asset_id,
        quantity,
        unitPrice: Number(listing.price_per_unit),
        totalAmount,
        metadata: { listingId, sellerId: listing.seller_id },
      });
      addTransaction({
        userId: String(listing.seller_id),
        action: 'sell_listing',
        assetType: listing.asset_type,
        assetId: listing.asset_id,
        quantity,
        unitPrice: Number(listing.price_per_unit),
        totalAmount,
        metadata: { listingId, buyerId: userId },
      });
      updateRewardState(userId, calculatePointsFromSpend(totalAmount));
      return res.json({ success: true, totalAmount });
    }

    if (!holding || holding.quantity < quantity) return res.status(400).json({ error: 'Not enough assets owned' });
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(sellPrice * quantity, userId);
    db.prepare('UPDATE user_assets SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset_type = ? AND asset_id = ?').run(quantity, userId, assetType, assetId);
    addTransaction({
      userId,
      action: 'sell',
      assetType,
      assetId,
      quantity,
      unitPrice: sellPrice,
      totalAmount: sellPrice * quantity,
    });
    res.json({ success: true });
  });

  app.post('/api/assets/my-assets/transfer', (req, res) => {
    const fromUserId = normalizeUserId(req.body?.fromUserId);
    const toUserId = normalizeUserId(req.body?.toUserId);
    const assetType = String(req.body?.assetType || '').trim();
    const assetId = String(req.body?.assetId || '').trim();
    const quantity = Math.max(1, Number(req.body?.quantity) || 1);
    if (!assetType || !assetId) return res.status(400).json({ error: 'assetType and assetId are required' });

    const fromHolding = db
      .prepare('SELECT * FROM user_assets WHERE user_id = ? AND asset_type = ? AND asset_id = ?')
      .get(fromUserId, assetType, assetId) as any;
    if (!fromHolding || fromHolding.quantity < quantity) return res.status(400).json({ error: 'Not enough assets owned' });

    db.prepare(
      `
      UPDATE user_assets
      SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND asset_type = ? AND asset_id = ?
    `
    ).run(quantity, fromUserId, assetType, assetId);

    db.prepare(
      `
      INSERT INTO user_assets (id, user_id, asset_type, asset_id, asset_name, price, quantity, listed_for_sale, avg_buy_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(user_id, asset_type, asset_id) DO UPDATE SET
        quantity = user_assets.quantity + excluded.quantity,
        price = excluded.price,
        updated_at = CURRENT_TIMESTAMP
    `
    ).run(
      uuidv4(),
      toUserId,
      assetType,
      assetId,
      fromHolding.asset_name || assetId,
      fromHolding.price || 0,
      quantity,
      fromHolding.avg_buy_price || fromHolding.price || 0
    );

    addTransaction({
      userId: fromUserId,
      action: 'transfer',
      assetType,
      assetId,
      quantity,
      unitPrice: 0,
      totalAmount: 0,
      metadata: { toUserId },
    });

    res.json({ success: true });
  });

  app.get('/api/assets/marketplace', (_req, res) => {
    const listings = db
      .prepare(
        `
      SELECT l.*, 
        l.asset_name
      FROM marketplace_listings l
      WHERE l.status = 'active' AND l.quantity > 0
      ORDER BY l.created_at DESC
    `
      )
      .all();
    res.json(listings);
  });

  app.get('/api/assets/rewards/:userId', (req, res) => {
    const userId = normalizeUserId(req.params.userId);
    ensureReward.run(uuidv4(), userId);
    const reward = db
      .prepare(
        `
      SELECT points, current_tier, eligibility_status, progress_percent, estimated_reward
      FROM assets_rewards
      WHERE user_id = ?
    `
      )
      .get(userId);
    const pointsRow = db.prepare('SELECT points FROM user_points WHERE user_id = ?').get(userId) as { points: number } | undefined;
    const points = Number(pointsRow?.points || 0);
    const eligibility_status = points >= 10000 ? 'unlocked' : 'locked';
    const progress_percent = Math.min(100, (points / 10000) * 100);
    const estimated_reward = Math.min(200, Math.round((points / 10000) * 200));
    const logs = db
      .prepare(
        `
      SELECT id, reward_amount, activity_score, points_snapshot, created_at
      FROM assets_reward_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `
      )
      .all(userId);
    res.json({
      ...(reward as object),
      points,
      eligibility_status,
      progress_percent,
      estimated_reward,
      logs,
    });
  });

  app.post('/api/assets/rewards/:userId/claim', (req, res) => {
    const userId = normalizeUserId(req.params.userId);
    ensureLocalUser(userId);
    updateRewardState(userId, 0);
    const row = db
      .prepare('SELECT points, eligibility_status FROM assets_rewards WHERE user_id = ?')
      .get(userId) as { points: number; eligibility_status: string } | undefined;
    if (!row || row.eligibility_status !== 'unlocked') {
      return res.status(400).json({ error: 'Rewards locked until 10,000 points' });
    }

    const activity = db
      .prepare(
        `
      SELECT COALESCE(SUM(total_amount), 0) AS spend_30d, COUNT(*) AS tx_30d
      FROM assets_transactions
      WHERE user_id = ? AND datetime(created_at) >= datetime('now', '-30 day')
    `
      )
      .get(userId) as { spend_30d: number; tx_30d: number };

    const activityScore = Math.min(1, (Number(activity.spend_30d || 0) / 25000) + (Number(activity.tx_30d || 0) / 100));
    const rewardAmount = Math.min(200, Math.round(activityScore * 200));
    if (rewardAmount <= 0) return res.status(400).json({ error: 'No reward available yet' });

    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(rewardAmount, userId);
    db.prepare('UPDATE assets_treasury SET platform_pool = MAX(0, platform_pool - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(rewardAmount, 'main');
    db.prepare(
      `
      INSERT INTO assets_reward_logs (id, user_id, points_snapshot, activity_score, reward_amount, status)
      VALUES (?, ?, ?, ?, ?, 'applied')
    `
    ).run(uuidv4(), userId, Number(row.points || 0), activityScore, rewardAmount);
    res.json({ success: true, rewardAmount });
  });

  app.get('/api/assets/overview', (req, res) => {
    const userId = normalizeUserId(req.query.userId);
    ensureReward.run(uuidv4(), userId);
    const reward = db
      .prepare(
        `
      SELECT points, current_tier, eligibility_status, progress_percent, estimated_reward
      FROM assets_rewards WHERE user_id = ?
    `
      )
      .get(userId);

    ensureLocalUser(userId);
    ensureDemoAssetsForUser(userId);
    const totals = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(quantity), 0) AS total_assets,
        COALESCE(SUM(price * quantity), 0) AS estimated_value
      FROM user_assets
      WHERE user_id = ?
    `
      )
      .get(userId) as { total_assets: number; estimated_value: number };
    const pointsRow = db.prepare('SELECT points FROM user_points WHERE user_id = ?').get(userId) as { points: number } | undefined;
    const points = Number(pointsRow?.points || 0);
    const rewardStatus = points < 10000 ? 'locked' : 'unlocked';
    res.json({
      total_assets: Number(totals?.total_assets || 0),
      estimated_value: Number(totals?.estimated_value || 0),
      reward_points: points,
      reward_status: rewardStatus,
      listings_count: Number(
        (
          db
            .prepare('SELECT COUNT(*) AS c FROM marketplace_listings WHERE status = ?')
            .get('active') as { c: number } | undefined
        )?.c || 0
      ),
      treasury: db.prepare('SELECT holders_pool, platform_pool FROM assets_treasury WHERE id = ?').get('main'),
    });
  });

  log('Routes initialized');
}
