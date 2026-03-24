import express from "express";
import type { Request, Response } from "express";
import cors from 'cors';

type Gem = {
  id: string;
  name: string;
  creatorId: string;
  price: number;
  available_supply: number;
};

type Gift = {
  id: string;
  name: string;
  creatorId: string;
  price: number;
  available_supply: number;
  earnings_percent: number;
};

type AssetHolding = {
  id: string;
  userId: string;
  assetType: 'gem' | 'gift';
  assetId: string;
  assetName: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
};

type AssetTx = {
  id: string;
  userId: string;
  assetType: 'gem' | 'gift';
  assetId: string;
  assetName: string;
  action: 'buy' | 'sell' | 'transfer' | 'resell';
  quantity: number;
  amount: number;
  createdAt: number;
};

type RewardInfo = {
  points: number;
  estimatedReward: number;
};

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const gems: Gem[] = [
  { id: 'g1', name: 'Creator Gem Alpha', creatorId: 'u101', price: 120, available_supply: 2000 },
  { id: 'g2', name: 'Creator Gem Nova', creatorId: 'u102', price: 90, available_supply: 1500 },
  { id: 'g3', name: 'Creator Gem Pulse', creatorId: 'u103', price: 145, available_supply: 980 }
];

const gifts: Gift[] = [
  { id: 'gift1', name: 'Influencer Gift Star', creatorId: 'u201', price: 55, available_supply: 4000, earnings_percent: 12.5 },
  { id: 'gift2', name: 'Influencer Gift Crown', creatorId: 'u202', price: 100, available_supply: 3200, earnings_percent: 15.2 },
  { id: 'gift3', name: 'Influencer Gift Glow', creatorId: 'u203', price: 35, available_supply: 6200, earnings_percent: 8.8 }
];

const holdings: AssetHolding[] = [
  { id: 'h1', userId: 'u1', assetType: 'gem', assetId: 'g1', assetName: 'Creator Gem Alpha', quantity: 4, buyPrice: 100, currentPrice: 120 },
  { id: 'h2', userId: 'u1', assetType: 'gift', assetId: 'gift1', assetName: 'Influencer Gift Star', quantity: 8, buyPrice: 50, currentPrice: 55 },
  { id: 'h3', userId: 'u2', assetType: 'gem', assetId: 'g2', assetName: 'Creator Gem Nova', quantity: 10, buyPrice: 70, currentPrice: 90 }
];

const txs: AssetTx[] = [
  { id: 't1', userId: 'u1', assetType: 'gem', assetId: 'g1', assetName: 'Creator Gem Alpha', action: 'buy', quantity: 2, amount: 220, createdAt: Date.now() - 600000 },
  { id: 't2', userId: 'u2', assetType: 'gift', assetId: 'gift1', assetName: 'Influencer Gift Star', action: 'buy', quantity: 5, amount: 275, createdAt: Date.now() - 400000 },
  { id: 't3', userId: 'u1', assetType: 'gift', assetId: 'gift2', assetName: 'Influencer Gift Crown', action: 'resell', quantity: 1, amount: 95, createdAt: Date.now() - 200000 }
];

const rewards: Record<string, RewardInfo> = {
  u1: { points: 12400, estimatedReward: 186 },
  u2: { points: 6400, estimatedReward: 110 }
};

const userCoins: Record<string, number> = {
  u1: 12000,
  u2: 9800,
  u3: 5000
};

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureReward(userId: string): RewardInfo {
  if (!rewards[userId]) rewards[userId] = { points: 0, estimatedReward: 20 };
  return rewards[userId];
}

function ensureCoins(userId: string): number {
  if (typeof userCoins[userId] !== 'number') userCoins[userId] = 10000;
  return userCoins[userId];
}

function addPointsFromSpend(userId: string, spentCoins: number): void {
  const reward = ensureReward(userId);
  const add = Math.floor((spentCoins / 1000) * 50);
  reward.points += add;
  reward.estimatedReward = Math.min(200, Math.max(20, Math.round((reward.points / 10000) * 200)));
}

app.get('/api/assets/gems', (_req: Request, res: Response) => {
  res.json({
    success: true,
    items: gems
  });
});

app.post('/api/assets/gifts/buy', (req: Request, res: Response) => {
  const { userId, giftId, quantity } = req.body as { userId: string; giftId: string; quantity?: number };
  const qty = Math.max(1, Number(quantity || 1));
  const gift = gifts.find((g) => g.id === giftId);

  if (!userId || !gift) return res.status(400).json({ success: false, error: 'Invalid buy payload' });
  if (gift.available_supply < qty) return res.status(400).json({ success: false, error: 'Not enough supply' });

  const total = gift.price * qty;
  const coins = ensureCoins(userId);
  if (coins < total) return res.status(400).json({ success: false, error: 'Insufficient coins' });

  userCoins[userId] = coins - total;
  gift.available_supply -= qty;
  addPointsFromSpend(userId, total);

  const existing = holdings.find((h) => h.userId === userId && h.assetType === 'gift' && h.assetId === gift.id);
  if (existing) {
    existing.quantity += qty;
    existing.currentPrice = gift.price;
  } else {
    holdings.push({
      id: id('h'),
      userId,
      assetType: 'gift',
      assetId: gift.id,
      assetName: gift.name,
      quantity: qty,
      buyPrice: gift.price,
      currentPrice: gift.price
    });
  }

  txs.push({
    id: id('t'),
    userId,
    assetType: 'gift',
    assetId: gift.id,
    assetName: gift.name,
    action: 'buy',
    quantity: qty,
    amount: total,
    createdAt: Date.now()
  });

  res.json({ success: true, message: 'Gift purchased', totalSpent: total, remainingCoins: userCoins[userId] });
});

app.post('/api/assets/gifts/resell', (req: Request, res: Response) => {
  const { userId, giftId, quantity } = req.body as { userId: string; giftId: string; quantity?: number };
  const qty = Math.max(1, Number(quantity || 1));
  const gift = gifts.find((g) => g.id === giftId);
  const own = holdings.find((h) => h.userId === userId && h.assetType === 'gift' && h.assetId === giftId);

  if (!userId || !gift || !own) return res.status(400).json({ success: false, error: 'Invalid resell payload' });
  if (own.quantity < qty) return res.status(400).json({ success: false, error: 'Not enough gift quantity' });

  const saleValue = Math.round(gift.price * 0.95 * qty);
  own.quantity -= qty;
  gift.available_supply += qty;
  userCoins[userId] = ensureCoins(userId) + saleValue;

  txs.push({
    id: id('t'),
    userId,
    assetType: 'gift',
    assetId: gift.id,
    assetName: gift.name,
    action: 'resell',
    quantity: qty,
    amount: saleValue,
    createdAt: Date.now()
  });

  res.json({ success: true, message: 'Gift resold', credited: saleValue, newCoins: userCoins[userId] });
});

app.get('/api/assets/trending', (_req: Request, res: Response) => {
  const map = new Map<string, { assetId: string; assetName: string; buys: number; recentAt: number; volume: number }>();

  for (const t of txs) {
    const key = `${t.assetType}:${t.assetId}`;
    const prev = map.get(key) || { assetId: t.assetId, assetName: t.assetName, buys: 0, recentAt: 0, volume: 0 };
    if (t.action === 'buy') prev.buys += t.quantity;
    prev.recentAt = Math.max(prev.recentAt, t.createdAt);
    prev.volume += t.quantity;
    map.set(key, prev);
  }

  const items = [...map.values()]
    .sort((a, b) => (b.buys - a.buys) || (b.recentAt - a.recentAt))
    .slice(0, 10);

  res.json({ success: true, items });
});

app.get('/api/assets/my-assets/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  const items = holdings
    .filter((h) => h.userId === userId && h.quantity > 0)
    .map((h) => ({
      id: h.id,
      assetName: h.assetName,
      quantity: h.quantity,
      buyPrice: h.buyPrice
    }));

  res.json({ success: true, items });
});

app.post('/api/assets/my-assets/sell', (req: Request, res: Response) => {
  const { userId, assetId, quantity } = req.body as { userId: string; assetId: string; quantity?: number };
  const qty = Math.max(1, Number(quantity || 1));
  const own = holdings.find((h) => h.userId === userId && h.assetId === assetId);

  if (!userId || !own) return res.status(400).json({ success: false, error: 'Invalid sell payload' });
  if (own.quantity < qty) return res.status(400).json({ success: false, error: 'Not enough quantity' });

  const total = Math.round(own.currentPrice * qty);
  own.quantity -= qty;
  userCoins[userId] = ensureCoins(userId) + total;

  txs.push({
    id: id('t'),
    userId,
    assetType: own.assetType,
    assetId: own.assetId,
    assetName: own.assetName,
    action: 'sell',
    quantity: qty,
    amount: total,
    createdAt: Date.now()
  });

  res.json({ success: true, soldFor: total, newCoins: userCoins[userId] });
});

app.post('/api/assets/my-assets/transfer', (req: Request, res: Response) => {
  const { fromUserId, toUserId, assetId, quantity } = req.body as {
    fromUserId: string;
    toUserId: string;
    assetId: string;
    quantity?: number;
  };
  const qty = Math.max(1, Number(quantity || 1));
  const from = holdings.find((h) => h.userId === fromUserId && h.assetId === assetId);

  if (!fromUserId || !toUserId || !from) return res.status(400).json({ success: false, error: 'Invalid transfer payload' });
  if (from.quantity < qty) return res.status(400).json({ success: false, error: 'Not enough quantity' });

  from.quantity -= qty;
  const to = holdings.find((h) => h.userId === toUserId && h.assetId === assetId && h.assetType === from.assetType);
  if (to) {
    to.quantity += qty;
  } else {
    holdings.push({
      id: id('h'),
      userId: toUserId,
      assetType: from.assetType,
      assetId: from.assetId,
      assetName: from.assetName,
      quantity: qty,
      buyPrice: from.buyPrice,
      currentPrice: from.currentPrice
    });
  }

  txs.push({
    id: id('t'),
    userId: fromUserId,
    assetType: from.assetType,
    assetId: from.assetId,
    assetName: from.assetName,
    action: 'transfer',
    quantity: qty,
    amount: 0,
    createdAt: Date.now()
  });

  res.json({ success: true, message: 'Transfer completed' });
});

app.get('/api/assets/rewards/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  const reward = ensureReward(userId);
  const status = reward.points >= 10000 ? 'Unlocked' : 'Locked';
  const progressPercent = Math.min(100, Math.round((reward.points / 10000) * 100));

  res.json({
    success: true,
    userId,
    points: reward.points,
    eligibility: status,
    progressPercent,
    estimatedReward: reward.estimatedReward
  });
});

app.get('/api/assets/overview', (req: Request, res: Response) => {
  const userId = String(req.query.userId || 'u1');
  const userItems = holdings.filter((h) => h.userId === userId && h.quantity > 0);
  const totalAssets = userItems.reduce((sum, i) => sum + i.quantity, 0);
  const estimatedValue = userItems.reduce((sum, i) => sum + (i.currentPrice * i.quantity), 0);
  const activeListings = txs.filter((t) => t.action === 'sell' && t.userId === userId).length;
  const reward = ensureReward(userId);

  res.json({
    success: true,
    userId,
    totalAssets,
    estimatedValue,
    activeListings,
    rewardStatus: reward.points < 10000 ? 'Locked' : 'Unlocked',
    points: reward.points
  });
});

app.listen(PORT, () => {
  console.log(`Assets backend running on http://localhost:${PORT}`);
});
