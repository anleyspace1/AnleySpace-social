export interface CreatorGem {
  id: string;
  name: string;
  creator_id: string;
  price: number;
  supply: number;
  listed_count: number;
}

export interface InfluencerGift {
  id: string;
  creator_id: string;
  creator_name: string;
  title: string;
  price: number;
  earnings_percent: number;
  available_quantity: number;
}

export interface TrendingAsset {
  asset_type: string;
  asset_id: string;
  asset_name: string;
  total_volume: number;
  growth_percent: number;
}

export interface OwnedAsset {
  id: string;
  user_id: string;
  asset_type: string;
  asset_id: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number;
  listed_for_sale: number;
  asset_name: string;
  profit_loss: number;
}

export interface RewardState {
  points: number;
  current_tier: string;
  eligibility_status: 'locked' | 'unlocked' | string;
  progress_percent: number;
  estimated_reward: number;
  logs?: Array<{
    id: string;
    reward_amount: number;
    activity_score: number;
    points_snapshot: number;
    created_at: string;
  }>;
}

export interface AssetsOverview {
  total_assets: number;
  estimated_value: number;
  reward_points: number;
  reward_status: string;
  listings_count: number;
  treasury: {
    holders_pool: number;
    platform_pool: number;
  };
}

export interface MarketplaceListing {
  id: string;
  seller_id: string;
  asset_type: string;
  asset_id: string;
  quantity: number;
  price_per_unit: number;
  status: string;
  asset_name: string;
}

const useHttpAssetsApi = String(import.meta.env.VITE_USE_ASSETS_HTTP || '').toLowerCase() === 'true';

const mockDb = {
  gems: [
    { id: 'g1', name: 'Creator Gem Alpha', creator_id: 'u101', price: 120, supply: 2000, listed_count: 120 },
    { id: 'g2', name: 'Creator Gem Nova', creator_id: 'u102', price: 95, supply: 1400, listed_count: 80 },
  ] as CreatorGem[],
  gifts: [
    { id: 'gift1', creator_id: 'u201', creator_name: 'mila', title: 'Star Gift', price: 55, earnings_percent: 12.5, available_quantity: 4200 },
    { id: 'gift2', creator_id: 'u202', creator_name: 'karo', title: 'Crown Gift', price: 90, earnings_percent: 14.2, available_quantity: 3100 },
  ] as InfluencerGift[],
  holdings: [
    {
      id: 'h1',
      user_id: 'u1',
      asset_type: 'gem',
      asset_id: 'g1',
      quantity: 3,
      avg_buy_price: 100,
      current_price: 120,
      listed_for_sale: 0,
      asset_name: 'Creator Gem Alpha',
      profit_loss: 60,
    },
  ] as OwnedAsset[],
  rewards: {} as Record<string, RewardState>,
  listings: [
    {
      id: 'l1',
      seller_id: 'u2',
      asset_type: 'gift',
      asset_id: 'gift1',
      quantity: 2,
      price_per_unit: 58,
      status: 'active',
      asset_name: 'Star Gift',
    },
  ] as MarketplaceListing[],
};

function ensureReward(userId: string): RewardState {
  if (!mockDb.rewards[userId]) {
    mockDb.rewards[userId] = {
      points: 6400,
      current_tier: 'Bronze',
      eligibility_status: 'locked',
      progress_percent: 64,
      estimated_reward: 128,
      logs: [],
    };
  }
  return mockDb.rewards[userId];
}

function refreshHoldingPnL(userId: string) {
  mockDb.holdings = mockDb.holdings.map((h) => {
    if (h.user_id !== userId) return h;
    const profitLoss = (h.current_price - h.avg_buy_price) * h.quantity;
    return { ...h, profit_loss: profitLoss };
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function requestOrMock<T>(url: string, init?: RequestInit, fallback: () => T): Promise<T> {
  if (!useHttpAssetsApi) return fallback();
  try {
    return await request<T>(url, init);
  } catch {
    return fallback();
  }
}

export const assetsApi = {
  getGems: () => requestOrMock<CreatorGem[]>('/api/assets/gems', undefined, () => mockDb.gems),
  buyGem: (payload: { userId: string; gemId: string; quantity: number }) =>
    requestOrMock<{ success: boolean; totalAmount: number }>(
      '/api/assets/gems/buy',
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      },
      () => {
        const gem = mockDb.gems.find((g) => g.id === payload.gemId);
        if (!gem) return { success: false, totalAmount: 0 };
        gem.supply = Math.max(0, gem.supply - payload.quantity);
        const existing = mockDb.holdings.find((h) => h.user_id === payload.userId && h.asset_type === 'gem' && h.asset_id === payload.gemId);
        if (existing) {
          existing.quantity += payload.quantity;
          existing.current_price = gem.price;
        } else {
          mockDb.holdings.push({
            id: `h-${Date.now()}`,
            user_id: payload.userId,
            asset_type: 'gem',
            asset_id: payload.gemId,
            quantity: payload.quantity,
            avg_buy_price: gem.price,
            current_price: gem.price,
            listed_for_sale: 0,
            asset_name: gem.name,
            profit_loss: 0,
          });
        }
        const rw = ensureReward(payload.userId);
        rw.points += Math.floor(((gem.price * payload.quantity) / 1000) * 50);
        rw.progress_percent = Math.min(100, (rw.points / 10000) * 100);
        rw.eligibility_status = rw.points >= 10000 ? 'unlocked' : 'locked';
        rw.estimated_reward = Math.min(200, Math.round((rw.progress_percent / 100) * 200));
        refreshHoldingPnL(payload.userId);
        return { success: true, totalAmount: gem.price * payload.quantity };
      }
    ),
  listGem: (payload: { userId: string; gemId: string; quantity: number }) =>
    requestOrMock<{ success: boolean }>(
      '/api/assets/gems/list',
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      },
      () => {
        const hold = mockDb.holdings.find((h) => h.user_id === payload.userId && h.asset_type === 'gem' && h.asset_id === payload.gemId);
        if (!hold || hold.quantity < payload.quantity) return { success: false };
        hold.quantity -= payload.quantity;
        hold.listed_for_sale += payload.quantity;
        mockDb.listings.push({
          id: `l-${Date.now()}`,
          seller_id: payload.userId,
          asset_type: 'gem',
          asset_id: payload.gemId,
          quantity: payload.quantity,
          price_per_unit: hold.current_price,
          status: 'active',
          asset_name: hold.asset_name,
        });
        return { success: true };
      }
    ),
  getGifts: () => requestOrMock<InfluencerGift[]>('/api/assets/gifts', undefined, () => mockDb.gifts),
  buyGift: (payload: { userId: string; giftId: string; quantity: number }) =>
    requestOrMock<{ success: boolean; totalAmount: number }>(
      '/api/assets/gifts/buy',
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      },
      () => {
        const gift = mockDb.gifts.find((g) => g.id === payload.giftId);
        if (!gift) return { success: false, totalAmount: 0 };
        gift.available_quantity = Math.max(0, gift.available_quantity - payload.quantity);
        const existing = mockDb.holdings.find((h) => h.user_id === payload.userId && h.asset_type === 'gift' && h.asset_id === payload.giftId);
        if (existing) existing.quantity += payload.quantity;
        else {
          mockDb.holdings.push({
            id: `h-${Date.now()}`,
            user_id: payload.userId,
            asset_type: 'gift',
            asset_id: payload.giftId,
            quantity: payload.quantity,
            avg_buy_price: gift.price,
            current_price: gift.price,
            listed_for_sale: 0,
            asset_name: gift.title,
            profit_loss: 0,
          });
        }
        refreshHoldingPnL(payload.userId);
        return { success: true, totalAmount: gift.price * payload.quantity };
      }
    ),
  resellGift: (payload: { userId: string; giftId: string; quantity: number; resalePrice: number }) =>
    requestOrMock<{ success: boolean }>(
      '/api/assets/gifts/resell',
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      },
      () => ({ success: true })
    ),
  getTrending: () =>
    requestOrMock<TrendingAsset[]>('/api/assets/trending', undefined, () => {
      const volume = new Map<string, TrendingAsset>();
      mockDb.holdings.forEach((h) => {
        const key = `${h.asset_type}:${h.asset_id}`;
        const current = volume.get(key);
        if (current) {
          current.total_volume += h.quantity;
        } else {
          volume.set(key, {
            asset_type: h.asset_type,
            asset_id: h.asset_id,
            asset_name: h.asset_name,
            total_volume: h.quantity,
            growth_percent: h.avg_buy_price > 0 ? ((h.current_price - h.avg_buy_price) / h.avg_buy_price) * 100 : 0,
          });
        }
      });
      return [...volume.values()].sort((a, b) => b.total_volume - a.total_volume);
    }),
  getMyAssets: (userId: string) =>
    requestOrMock<OwnedAsset[]>(`/api/assets/my-assets/${encodeURIComponent(userId)}`, undefined, () => {
      const mine = mockDb.holdings.filter((h) => h.user_id === userId);
      if (mine.length === 0) {
        mockDb.holdings.push({
          id: `h-${Date.now()}`,
          user_id: userId,
          asset_type: 'gem',
          asset_id: 'g2',
          quantity: 2,
          avg_buy_price: 90,
          current_price: 95,
          listed_for_sale: 0,
          asset_name: 'Creator Gem Nova',
          profit_loss: 10,
        });
      }
      return mockDb.holdings.filter((h) => h.user_id === userId);
    }),
  sellAsset: (payload: { userId: string; assetType: string; assetId: string; quantity: number; sellPrice: number }) =>
    requestOrMock<{ success: boolean }>(
      '/api/assets/my-assets/sell',
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      },
      () => {
        const hold = mockDb.holdings.find((h) => h.user_id === payload.userId && h.asset_type === payload.assetType && h.asset_id === payload.assetId);
        if (!hold || hold.quantity < payload.quantity) return { success: false };
        hold.quantity -= payload.quantity;
        refreshHoldingPnL(payload.userId);
        return { success: true };
      }
    ),
  transferAsset: (payload: { fromUserId: string; toUserId: string; assetType: string; assetId: string; quantity: number }) =>
    requestOrMock<{ success: boolean }>(
      '/api/assets/my-assets/transfer',
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      },
      () => ({ success: true })
    ),
  getRewards: (userId: string) =>
    requestOrMock<RewardState>(`/api/assets/rewards/${encodeURIComponent(userId)}`, undefined, () => ensureReward(userId)),
  claimRewards: (userId: string) =>
    requestOrMock<{ success: boolean; rewardAmount: number }>(
      `/api/assets/rewards/${encodeURIComponent(userId)}/claim`,
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      },
      () => {
        const rw = ensureReward(userId);
        const amount = rw.eligibility_status === 'unlocked' ? Math.max(20, rw.estimated_reward) : 0;
        if (amount > 0) {
          rw.logs = [{ id: `log-${Date.now()}`, reward_amount: amount, activity_score: 0.7, points_snapshot: rw.points, created_at: new Date().toISOString() }, ...(rw.logs || [])];
        }
        return { success: amount > 0, rewardAmount: amount };
      }
    ),
  getOverview: (userId: string) =>
    requestOrMock<AssetsOverview>(`/api/assets/overview?userId=${encodeURIComponent(userId)}`, undefined, () => {
      const rw = ensureReward(userId);
      const mine = mockDb.holdings.filter((h) => h.user_id === userId);
      return {
        total_assets: mine.reduce((s, i) => s + i.quantity, 0),
        estimated_value: mine.reduce((s, i) => s + i.current_price * i.quantity, 0),
        reward_points: rw.points,
        reward_status: rw.eligibility_status,
        listings_count: mockDb.listings.filter((l) => l.status === 'active').length,
        treasury: { holders_pool: 0, platform_pool: 0 },
      };
    }),
  getMarketplaceListings: () => requestOrMock<MarketplaceListing[]>('/api/assets/marketplace', undefined, () => mockDb.listings),
  buyListing: (payload: { userId: string; listingId: string; quantity: number; assetType: string; assetId: string }) =>
    requestOrMock<{ success: boolean; totalAmount?: number }>(
      '/api/assets/my-assets/sell',
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: payload.userId,
        listingId: payload.listingId,
        quantity: payload.quantity,
        assetType: payload.assetType,
        assetId: payload.assetId,
        sellPrice: 0,
      }),
      },
      () => {
        const listing = mockDb.listings.find((l) => l.id === payload.listingId && l.status === 'active');
        if (!listing || listing.quantity < payload.quantity) return { success: false };
        listing.quantity -= payload.quantity;
        if (listing.quantity <= 0) listing.status = 'sold';
        mockDb.holdings.push({
          id: `h-${Date.now()}`,
          user_id: payload.userId,
          asset_type: listing.asset_type,
          asset_id: listing.asset_id,
          quantity: payload.quantity,
          avg_buy_price: listing.price_per_unit,
          current_price: listing.price_per_unit,
          listed_for_sale: 0,
          asset_name: listing.asset_name,
          profit_loss: 0,
        });
        refreshHoldingPnL(payload.userId);
        return { success: true, totalAmount: listing.price_per_unit * payload.quantity };
      }
    ),
};
