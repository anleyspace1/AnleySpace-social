import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../contexts/AuthContext';
import { assetsApi, type MarketplaceListing, type OwnedAsset } from '../api';

export default function MyAssetsPage() {
  const { user } = useAuth();
  const userId = user?.id || 'u1';
  const [items, setItems] = useState<OwnedAsset[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    const [myAssets, market] = await Promise.all([assetsApi.getMyAssets(userId), assetsApi.getMarketplaceListings()]);
    setItems(myAssets);
    setListings(market.filter((l) => l.seller_id !== userId));
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 7000);
    return () => clearInterval(timer);
  }, [userId]);

  const onSell = async (asset: OwnedAsset) => {
    try {
      setBusyId(asset.id + 'sell');
      await assetsApi.sellAsset({
        userId,
        assetType: asset.asset_type,
        assetId: asset.asset_id,
        quantity: 1,
        sellPrice: Number(asset.current_price),
      });
      await load();
    } finally {
      setBusyId('');
    }
  };

  const onTransfer = async (asset: OwnedAsset) => {
    try {
      setBusyId(asset.id + 'transfer');
      await assetsApi.transferAsset({
        fromUserId: userId,
        toUserId: 'u2',
        assetType: asset.asset_type,
        assetId: asset.asset_id,
        quantity: 1,
      });
      await load();
    } finally {
      setBusyId('');
    }
  };

  const onBuyListing = async (listing: MarketplaceListing) => {
    try {
      setBusyId(listing.id + 'buyListing');
      await assetsApi.buyListing({
        userId,
        listingId: listing.id,
        quantity: 1,
        assetType: listing.asset_type,
        assetId: listing.asset_id,
      });
      await load();
    } finally {
      setBusyId('');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto pb-12 px-4 lg:px-0">
      <h1 className="text-3xl text-white font-bold tracking-tight mb-6">My Assets</h1>
      <div className="space-y-3">
        {items.map((asset) => (
          <div key={asset.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-white font-bold">{asset.asset_name}</p>
                <p className="text-xs text-gray-400 uppercase">{asset.asset_type}</p>
                <p className="text-sm mt-1">Owned: {asset.quantity}</p>
                <p className={`text-sm ${asset.profit_loss >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  Profit/Loss: {asset.profit_loss >= 0 ? '+' : ''}{Number(asset.profit_loss).toFixed(2)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === asset.id + 'sell'}
                  onClick={() => onSell(asset)}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition text-sm font-bold text-white disabled:opacity-60"
                >
                  Sell
                </button>
                <button
                  type="button"
                  disabled={busyId === asset.id + 'transfer'}
                  onClick={() => onTransfer(asset)}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition text-sm font-bold text-white disabled:opacity-60"
                >
                  Transfer
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-sm text-gray-400 mt-4">
          You do not own assets yet. Buy from Creator Gems, Influencer Gifts, or marketplace listings below.
        </div>
      )}

      <h2 className="text-xl text-white font-bold tracking-tight mt-8 mb-4">Assets Marketplace</h2>
      <div className="space-y-3">
        {listings.map((listing) => (
          <div key={listing.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex items-center justify-between gap-4 hover:scale-105 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
            <div>
              <p className="text-white font-bold">{listing.asset_name}</p>
              <p className="text-xs uppercase text-gray-400">{listing.asset_type}</p>
              <p className="text-sm text-gray-400">Qty: {listing.quantity}</p>
            </div>
            <div className="text-right">
              <p className="font-bold mb-2">{Number(listing.price_per_unit).toLocaleString()} Coins</p>
              <button
                type="button"
                disabled={busyId === listing.id + 'buyListing'}
                onClick={() => onBuyListing(listing)}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl px-4 py-2 hover:opacity-90 transition text-sm font-bold text-white disabled:opacity-60"
              >
                Buy
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
