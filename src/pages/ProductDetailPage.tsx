import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  Heart, 
  Share2, 
  MapPin, 
  Coins, 
  ShieldCheck, 
  MessageCircle,
  ShoppingBag,
  ChevronRight,
  Star,
  Eye
} from 'lucide-react';
import { Product } from '../types';
import { cn } from '../lib/utils';
import { apiUrl } from '../lib/apiOrigin';
import { productImagePublicUrl } from '../lib/marketplaceImage';
import {
  fetchMarketplaceTableRowsAsApiProducts,
  fetchSingleProductAsApiShape,
  mapMarketplaceRowsToProducts,
} from '../lib/marketplaceRemote';
import { isProductSavedInMarketplace, setSavedMarketplaceProduct } from '../lib/savedMarketplace';
import { incrementMarketplaceView } from '../lib/incrementMarketplaceView';
import { MOCK_USER } from '../constants';
import { useAuth } from '../contexts/AuthContext';

export default function ProductDetailPage() {
  const { id } = useParams();
  console.log("ProductDetailPage mounted", { routeParamId: id });
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);

  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [isProductSaved, setIsProductSaved] = useState(false);
  /** Lowercase listing id — one increment per successful load for that listing. */
  const viewIncrementedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    viewIncrementedKeyRef.current = null;
  }, [id]);

  useEffect(() => {
    fetchProduct();
  }, [id]);

  useEffect(() => {
    if (product) {
      fetchRelatedProducts();
    }
  }, [product]);

  useEffect(() => {
    if (!user?.id || !product?.id) {
      setIsProductSaved(false);
      return;
    }
    let cancelled = false;
    isProductSavedInMarketplace(user.id, product.id).then((v) => {
      if (!cancelled) setIsProductSaved(v);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, product?.id]);

  useEffect(() => {
    console.log('[VIEW EFFECT TRIGGER]', {
      productId: product?.id,
      routeId: id,
    });

    if (!product || !product.id || !id) return;

    const pid = String(product.id).toLowerCase();

    if (viewIncrementedKeyRef.current === pid) {
      console.log('[VIEW] skipped (already incremented)', pid);
      return;
    }

    viewIncrementedKeyRef.current = pid;

    console.log('[VIEW] increment start', pid);

    incrementMarketplaceView(product.id)
      .then((res) => {
        if (!res?.ok) {
          console.warn('[VIEW] increment failed', res?.error);
          return;
        }

        console.log('[VIEW] increment success');

        setProduct((prev) =>
          prev ? { ...prev, view_count: (prev.view_count || 0) + 1 } : prev
        );
      })
      .catch((err) => {
        console.warn('[VIEW] increment error', err);
      });
  }, [product, id]);

  const fetchProduct = async () => {
    try {
      const res = await fetch(apiUrl(`/api/marketplace/products/${id}`));
      const ct = res.headers.get('content-type') || '';
      let payload: unknown;
      try {
        if (!ct.includes('application/json')) payload = null;
        else payload = await res.json();
      } catch (parseErr) {
        console.log('marketplace error:', parseErr);
        payload = null;
      }
      console.log('marketplace data:', payload);
      let data = payload as Record<string, unknown> | null;
      if (!res.ok || !data || (data as { error?: string }).error) {
        const direct = id ? await fetchSingleProductAsApiShape(id) : null;
        data = direct;
      }
      if (!data || (data as { error?: string }).error) {
        console.log('marketplace error:', (payload as { error?: string })?.error ?? res.statusText);
        setProduct(null);
        return;
      }
      const sellerId = String((data as { seller_id?: string }).seller_id ?? '').trim();
      setProduct({
        ...(data as Product),
        seller: {
          username: (data.seller_username as string) || 'seller',
          ...(sellerId ? { id: sellerId } : {}),
        },
      } as Product);
    } catch (err) {
      console.log('marketplace error:', err);
      const direct = id ? await fetchSingleProductAsApiShape(id) : null;
      if (direct && !(direct as { error?: string }).error) {
        const sid = String((direct as { seller_id?: string }).seller_id ?? '').trim();
        setProduct({
          ...(direct as Product),
          seller: {
            username: (direct.seller_username as string) || 'seller',
            ...(sid ? { id: sid } : {}),
          },
        } as Product);
      } else {
        setProduct(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedProducts = async () => {
    try {
      const res = await fetch(apiUrl('/api/marketplace/products'));
      const ct = res.headers.get('content-type') || '';
      let payload: unknown;
      try {
        if (!ct.includes('application/json')) payload = null;
        else payload = await res.json();
      } catch (parseErr) {
        console.log('marketplace error:', parseErr);
        payload = null;
      }
      console.log('marketplace data:', payload);
      let list: Record<string, unknown>[] = [];
      if (res.ok && Array.isArray(payload)) {
        list = payload as Record<string, unknown>[];
      }
      if (!list.length) {
        list = await fetchMarketplaceTableRowsAsApiProducts();
      }
      console.log('Marketplace rows (related list length):', list.length);
      const products = mapMarketplaceRowsToProducts(list);
      const filtered = products
        .filter((p) => p.location === product?.location && p.id !== product?.id)
        .slice(0, 4);
      setRelatedProducts(filtered);
    } catch (err) {
      console.log('marketplace error:', err);
      try {
        const direct = await fetchMarketplaceTableRowsAsApiProducts();
        const products = mapMarketplaceRowsToProducts(direct);
        const filtered = products
          .filter((p) => p.location === product?.location && p.id !== product?.id)
          .slice(0, 4);
        setRelatedProducts(filtered);
      } catch {
        setRelatedProducts([]);
      }
    }
  };

  const handleBuy = async () => {
    if (!product || !user) {
      if (!user) alert('Please log in to buy items');
      return;
    }
    setBuying(true);
    try {
      const res = await fetch(apiUrl('/api/marketplace/buy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerId: user.id,
          productId: product.id
        })
      });
      
      if (res.ok) {
        alert('Purchase successful!');
        navigate('/marketplace');
      } else {
        const data = await res.json();
        alert(data.error || 'Purchase failed');
      }
    } catch (err) {
      console.error("Error buying product:", err);
      alert('Purchase failed');
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <h2 className="text-2xl font-bold mb-4">Product not found</h2>
        <button 
          onClick={() => navigate('/marketplace')}
          className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold"
        >
          Back to Marketplace
        </button>
      </div>
    );
  }

  const mainImageUrl = productImagePublicUrl(product.image) || `https://picsum.photos/seed/${product.id}/800/800`;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto p-4 lg:p-6 pb-24"
    >
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors mb-4 group"
      >
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-bold text-sm">Back to Marketplace</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Images Section */}
        <div className="lg:col-span-7 space-y-4">
          <div className="aspect-square rounded-[2.5rem] overflow-hidden bg-gray-100 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl relative group">
            <img 
              src={mainImageUrl} 
              alt={product.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
            />
            <button
              type="button"
              aria-label={isProductSaved ? 'Unsave' : 'Save'}
              onClick={async (e) => {
                e.stopPropagation();
                if (!user?.id || !product?.id) {
                  alert('Please log in to save items');
                  return;
                }
                const next = !isProductSaved;
                try {
                  await setSavedMarketplaceProduct(user.id, product.id, next);
                  setIsProductSaved(next);
                } catch (err) {
                  console.error('[ProductDetail] save toggle', err);
                }
              }}
              className={cn(
                'absolute top-4 right-4 w-10 h-10 bg-white/90 dark:bg-black/90 backdrop-blur-md rounded-full flex items-center justify-center transition-colors shadow-md',
                isProductSaved ? 'text-red-500' : 'text-gray-600 dark:text-white hover:text-red-500'
              )}
            >
              <Heart size={20} className={isProductSaved ? 'fill-current' : ''} />
            </button>
            <div className="absolute top-4 left-4 flex flex-col gap-2">
              <span className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20">
                {product.category}
              </span>
              {product.stock && product.stock > 0 ? (
                <span className="bg-emerald-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20">
                  {product.stock} In Stock
                </span>
              ) : (
                <span className="bg-red-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20">
                  Out of Stock
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 cursor-pointer hover:opacity-80 transition-opacity shadow-sm">
                <img src={`https://picsum.photos/seed/prod${i}${product.id}/200/200`} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>

        {/* Product Info Section */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="mb-6">
            <div className="flex items-center justify-between items-start mb-4">
              <div className="flex items-center gap-2 text-indigo-600 font-black text-3xl">
                <Coins size={28} />
                <span>{product.price.toLocaleString()}</span>
              </div>
              <div 
                onClick={() => {
                  const loc = (product.location || '').trim();
                  navigate(loc ? `/marketplace?location=${encodeURIComponent(loc)}` : '/marketplace');
                }}
                className="flex items-center gap-1 text-gray-400 font-medium text-sm cursor-pointer hover:text-indigo-600 transition-colors group"
              >
                <MapPin size={16} className="group-hover:scale-110 transition-transform" />
                <span className="group-hover:underline">{product.location}</span>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-sm font-medium mb-4">
              <Eye size={16} className="shrink-0 opacity-80" aria-hidden />
              <span>{(product.view_count ?? 0).toLocaleString()} views</span>
            </p>
            
            <h1 className="text-2xl lg:text-3xl font-black mb-3 leading-tight tracking-tight">{product.title}</h1>
            
            <div className="mb-6">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Description</h4>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">
                {product.description || "This is a premium item in excellent condition. Perfect for anyone looking for quality and value. Includes all original accessories and packaging."}
              </p>
            </div>

            {/* Location Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Location</h4>
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(product.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-indigo-600 font-bold hover:underline"
                >
                  Open in Maps
                </a>
              </div>
              <div className="aspect-video rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 relative group flex flex-col items-center justify-center p-4 text-center">
                <MapPin size={24} className="text-indigo-600 mb-2" />
                <p className="text-sm font-bold text-gray-900 dark:text-white">{product.location}</p>
                <p className="text-xs text-gray-500 mt-1">Location details provided by seller</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Buyer Protection Card */}
              <div className="flex items-center gap-3 p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100/50 dark:border-indigo-900/20">
                <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-100">Buyer Protection</h4>
                  <p className="text-xs text-indigo-600/80">Your purchase is protected by AnleySpace</p>
                </div>
              </div>

              {/* Seller Card */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm">
                <div 
                  onClick={() => navigate(`/profile/${product.seller.username}`)}
                  className="flex items-center gap-3 mb-4 cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-100 dark:border-gray-800">
                    <img src={`https://picsum.photos/seed/${product.seller.username}/100/100`} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base group-hover:text-indigo-600 transition-colors">@{product.seller.username}</h4>
                    <div className="flex items-center gap-0.5 text-yellow-500">
                      <Star size={12} className="fill-current" />
                      <Star size={12} className="fill-current" />
                      <Star size={12} className="fill-current" />
                      <Star size={12} className="fill-current" />
                      <Star size={12} className="fill-current" />
                      <span className="text-[10px] text-gray-500 ml-1">(48 reviews)</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const sellerId = product.seller?.id?.trim();
                    if (sellerId) {
                      navigate(
                        `/messages?seller=${encodeURIComponent(sellerId)}&product=${encodeURIComponent(product.id)}`
                      );
                      return;
                    }
                    const u = product.seller?.username?.trim();
                    if (u) navigate(`/messages?user=${encodeURIComponent(u)}`);
                    else navigate('/messages');
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-gray-50 dark:bg-gray-800/50 py-3 rounded-xl font-bold hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-gray-900 dark:text-white border border-gray-100 dark:border-gray-800 text-sm"
                >
                  <MessageCircle size={18} />
                  Message Seller
                </button>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6">
            <button 
              onClick={handleBuy}
              disabled={buying || !product.stock || product.stock <= 0}
              className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingBag size={24} />
              {buying ? 'Processing...' : `Buy Now for ${product.price.toLocaleString()} Coins`}
            </button>
          </div>
        </div>
      </div>

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <div className="mt-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black">More from this area</h2>
            <button 
              onClick={() => {
                  const loc = (product.location || '').trim();
                  navigate(loc ? `/marketplace?location=${encodeURIComponent(loc)}` : '/marketplace');
                }}
              className="text-sm text-indigo-600 font-bold hover:underline flex items-center gap-1"
            >
              See all
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {relatedProducts.map((p) => (
              <div 
                key={p.id}
                onClick={() => navigate(`/marketplace/product/${p.id}`)}
                className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm cursor-pointer group"
              >
                <div className="aspect-square overflow-hidden">
                  <img src={productImagePublicUrl(p.image) || `https://picsum.photos/seed/${p.id}/400/400`} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-3">
                  <h4 className="font-bold text-sm truncate mb-1">{p.title}</h4>
                  <div className="flex items-center gap-1 text-indigo-600 font-black text-sm">
                    <Coins size={14} />
                    <span>{p.price.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
