import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ShoppingBag, 
  Search, 
  Filter, 
  Heart, 
  MapPin, 
  Plus,
  ChevronRight,
  Coins,
  X,
  Camera,
  CheckCircle2,
  AlertCircle,
  PlaySquare,
  Grid,
  Image as ImageIcon,
  Eye
} from 'lucide-react';
import { Product, Video, Post } from '../types';

import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { apiUrl } from '../lib/apiOrigin';
import {
  fetchMarketplaceTableRowsAsApiProducts,
  mapMarketplaceRowsToProducts,
} from '../lib/marketplaceRemote';
import { resolveMarketplaceListingImageUrl } from '../lib/marketplaceImage';
import { fetchSavedMarketplaceProductIds, setSavedMarketplaceProduct } from '../lib/savedMarketplace';
import { ResponsiveImage } from '../components/ResponsiveImage';

export default function MarketplacePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  /** Ignore bogus params from `?location=${undefined}` and empty strings so the grid is not cleared on Vercel. */
  const locationFilter = React.useMemo(() => {
    const raw = searchParams.get('location');
    if (raw == null) return null;
    const t = raw.trim();
    if (!t || t === 'undefined' || t === 'null') return null;
    return t;
  }, [searchParams]);

  const [products, setProducts] = useState<Product[]>([]);
  const [reels, setReels] = useState<Video[]>([]);
  const [activeTab, setActiveTab] = useState<'products' | 'reels' | 'posts'>('products');
  const [userCoins, setUserCoins] = useState(0);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [buyStatus, setBuyStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [savedProductIds, setSavedProductIds] = useState<Set<string>>(new Set());

  const closePostModal = () => {
    setIsPostModalOpen(false);
    setSelectedImages([]);
  };

  useEffect(() => {
    fetchProducts();
    fetchReels();
    if (user) {
      fetchUser();
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) {
      setSavedProductIds(new Set());
      return;
    }
    let cancelled = false;
    fetchSavedMarketplaceProductIds(user.id).then((ids) => {
      if (!cancelled) setSavedProductIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const toggleSaveProduct = async (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    if (!user?.id) {
      alert('Please log in to save items');
      return;
    }
    const willSave = !savedProductIds.has(productId);
    try {
      await setSavedMarketplaceProduct(user.id, productId, willSave);
      setSavedProductIds((prev) => {
        const next = new Set(prev);
        if (willSave) next.add(productId);
        else next.delete(productId);
        return next;
      });
    } catch (err) {
      console.error('[Marketplace] save toggle', err);
    }
  };

  const marketplacePostsGrid = React.useMemo((): Post[] => {
    return products
      .filter((p) => !!p.id && !!(p as { seller_id?: string }).seller_id)
      .map((p) => {
        const sellerUsername =
          p.seller?.username ||
          String((p as { seller_username?: string }).seller_username || '').trim() ||
          'seller';
        return {
          id: p.id,
          image: p.image || `https://picsum.photos/seed/${p.id}/400/400`,
          caption: p.title || '',
          likes: 0,
          comments: 0,
          shares: 0,
          timestamp: String((p as { created_at?: string }).created_at || ''),
          user: { username: sellerUsername, avatar: '' },
        } satisfies Post;
      });
  }, [products]);

  const fetchReels = async () => {
    try {
      const res = await fetch(apiUrl('/api/marketplace/products'));
      const ct = res.headers.get('content-type') || '';
      let raw: unknown;
      try {
        if (!ct.includes('application/json')) raw = null;
        else raw = await res.json();
      } catch {
        raw = null;
      }
      console.log('REELS DATA:', raw);
      let data: Record<string, unknown>[] = [];
      if (res.ok && Array.isArray(raw)) data = raw as Record<string, unknown>[];
      if (!data.length) data = await fetchMarketplaceTableRowsAsApiProducts();
      if (!data.length) {
        setReels([]);
        return;
      }
      const formattedReels: Video[] = data
        .map((p) => {
          const id = String(p.id ?? '');
          if (!id || !String((p as { seller_id?: string }).seller_id ?? '').trim()) return null;
          const thumb = resolveMarketplaceListingImageUrl(String(p.image ?? '').trim());
          const sellerUsername = String(
            (p as { seller_username?: string }).seller_username ||
              (p as { seller?: { username?: string } }).seller?.username ||
              'seller'
          );
          return {
            id,
            url: '',
            thumbnail: thumb || '',
            user: {
              username: sellerUsername,
              avatar: '',
            },
            caption: String((p as { title?: string }).title ?? ''),
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            coins: Number((p as { price?: number }).price) || 0,
            sound: null,
          } satisfies Video;
        })
        .filter((v): v is Video => v !== null);
      setReels(formattedReels);
    } catch (err) {
      console.log('REELS DATA:', null);
      console.log('marketplace error:', err);
      const direct = await fetchMarketplaceTableRowsAsApiProducts();
      if (!direct.length) {
        setReels([]);
        return;
      }
      const formattedReels: Video[] = direct
        .map((p) => {
          const id = String(p.id ?? '');
          if (!id || !String((p as { seller_id?: string }).seller_id ?? '').trim()) return null;
          const thumb = resolveMarketplaceListingImageUrl(String(p.image ?? '').trim());
          const sellerUsername = String(
            (p as { seller_username?: string }).seller_username ||
              (p as { seller?: { username?: string } }).seller?.username ||
              'seller'
          );
          return {
            id,
            url: '',
            thumbnail: thumb || '',
            user: {
              username: sellerUsername,
              avatar: '',
            },
            caption: String((p as { title?: string }).title ?? ''),
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            coins: Number((p as { price?: number }).price) || 0,
            sound: null,
          } satisfies Video;
        })
        .filter((v): v is Video => v !== null);
      setReels(formattedReels);
    }
  };

  const fetchProducts = async () => {
    const apiEndpoint = apiUrl('/api/marketplace/products');
    console.log('[Marketplace][diag] fetchProducts start', {
      hostname: typeof window !== 'undefined' ? window.location.hostname : 'ssr',
      apiEndpoint,
      supabaseConfigured: isSupabaseConfigured,
    });
    try {
      const res = await fetch(apiEndpoint);
      const ct = res.headers.get('content-type') || '';
      let payload: unknown;
      try {
        if (!ct.includes('application/json')) payload = null;
        else payload = await res.json();
      } catch (parseErr) {
        console.log('marketplace error:', parseErr);
        payload = null;
      }
      console.log('[Marketplace][diag] API /marketplace/products', {
        ok: res.ok,
        status: res.status,
        contentType: ct,
        looksLikeJson: ct.includes('application/json'),
        payloadType: Array.isArray(payload) ? 'array' : payload == null ? 'null' : typeof payload,
        payloadLength: Array.isArray(payload) ? payload.length : null,
      });
      console.log('MARKETPLACE PRODUCTS:', payload);
      let list: Record<string, unknown>[] = [];
      if (res.ok && Array.isArray(payload)) {
        list = payload as Record<string, unknown>[];
      }
      if (!list.length) {
        list = await fetchMarketplaceTableRowsAsApiProducts();
      }
      console.log('Marketplace rows (merged list length):', list.length);
      if (!list.length) {
        if (!res.ok) console.log('marketplace error:', (payload as { error?: string })?.error ?? res.statusText);
        else if (!Array.isArray(payload)) console.log('marketplace error:', 'Expected array of products');
        console.log('[Marketplace] No rows after API + Supabase fallback', { supabaseConfigured: isSupabaseConfigured });
        setProducts([]);
        return;
      }
      const mapped = mapMarketplaceRowsToProducts(list);
      if (list.length > 0 && mapped.length === 0) {
        console.warn('[Marketplace][diag] mapMarketplaceRowsToProducts removed all rows', {
          sampleRow: list[0],
        });
      }
      console.log('[Marketplace] Fetched rows → products', {
        supabaseConfigured: isSupabaseConfigured,
        rawRowCount: list.length,
        afterMapCount: mapped.length,
        idsSample: mapped.slice(0, 5).map((p) => p.id),
      });
      setProducts(mapped);
    } catch (err) {
      console.log('marketplace error:', err);
      const direct = await fetchMarketplaceTableRowsAsApiProducts();
      const mappedCatch = direct.length ? mapMarketplaceRowsToProducts(direct) : [];
      console.log('[Marketplace] Catch fallback', {
        supabaseConfigured: isSupabaseConfigured,
        rawRowCount: direct.length,
        afterMapCount: mappedCatch.length,
        idsSample: mappedCatch.slice(0, 5).map((p) => p.id),
      });
      setProducts(mappedCatch);
    }
  };

  const fetchUser = async () => {
    if (!user) return;
    try {
      const res = await fetch(apiUrl(`/api/user/${user.id}`));
      const data = await res.json();
      if (data.coins !== undefined) {
        setUserCoins(data.coins);
      }
    } catch (err) {
      console.error("Error fetching user:", err);
    }
  };

  const categories = [
    { name: 'All', icon: '🛍️' },
    { name: 'Electronics', icon: '📱' },
    { name: 'Vehicles', icon: '🚗' },
    { name: 'Property', icon: '🏠' },
    { name: 'Apparel', icon: '👕' },
    { name: 'Home', icon: '🛋️' },
  ];

  const filteredProducts = products.filter((p) => {
    const matchesSearch = (p.title || '').toLowerCase().includes((searchQuery || '').toLowerCase());
    // Remote rows often have no category; still show them unless a specific category is set on the product and it differs.
    const cat = String(p.category || '').trim();
    const matchesCategory =
      activeCategory === 'All' || !cat || cat === activeCategory;
    const ploc = (p.location || '').trim().toLowerCase();
    const lf = (locationFilter || '').trim().toLowerCase();
    const matchesLocation = !lf || !ploc || ploc.includes(lf);
    return matchesSearch && matchesCategory && matchesLocation;
  });

  const handleLocationClick = (location: string) => {
    setSearchParams({ location });
  };

  const clearLocationFilter = () => {
    setSearchParams({});
  };

  const handleBuy = async (product: Product) => {
    if (!user) {
      alert('Please log in to buy items');
      return;
    }
    if (userCoins < product.price) {
      setBuyStatus('error');
      return;
    }

    setBuyStatus('processing');
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
        setBuyStatus('success');
        fetchUser();
        fetchProducts();
        setTimeout(() => {
          setIsBuyModalOpen(false);
          setBuyStatus('idle');
          setSelectedProduct(null);
        }, 2000);
      } else {
        setBuyStatus('error');
      }
    } catch (err) {
      console.error("Error buying product:", err);
      setBuyStatus('error');
    }
  };

  const handlePostProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    
    let finalImageUrl = `https://picsum.photos/seed/${Date.now()}/400/400`;

    // Same upload + public URL flow as Home feed post images (`feed/{userId}/...` in `posts` bucket)
    if (selectedImages.length > 0) {
      try {
        const file = selectedImages[0];
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const filePath = `feed/${user.id}/${safeName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage.from('posts').upload(filePath, file);

        if (uploadError) {
          if (uploadError.message.includes('Bucket not found')) {
            console.log('marketplace error:', 'Storage bucket "posts" not found. Create a public "posts" bucket in Supabase.');
          } else {
            console.log('marketplace error:', uploadError);
          }
        } else {
          const uploadedPath = uploadData?.path ?? filePath;
          const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(uploadedPath);
          console.log('PRODUCT IMAGE URL:', publicUrl);
          finalImageUrl = publicUrl;
        }
      } catch (err) {
        console.log('marketplace error:', err);
      }
    }
    
    const payload = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      price: Number(formData.get('price')),
      category: formData.get('category') as string,
      location: formData.get('location') as string,
      stock: Number(formData.get('stock')) || 1,
      image: finalImageUrl,
      sellerId: user.id
    };

    try {
      const res = await fetch(apiUrl('/api/marketplace/products'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      console.log('marketplace data:', body);
      if (!res.ok) {
        console.log('marketplace error:', (body as { error?: string })?.error ?? res.statusText);
        return;
      }
      fetchProducts();
      closePostModal();
    } catch (err) {
      console.log('marketplace error:', err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto pb-12 overflow-x-hidden"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 px-4 lg:px-0 pt-4 lg:pt-0">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black mb-2 tracking-tight">Marketplace</h1>
          <div className="flex items-center gap-2 text-indigo-600 font-bold bg-indigo-50 dark:bg-indigo-900/20 w-fit px-3 py-1 rounded-full text-sm">
            <Coins size={16} />
            <span>{(userCoins || 0).toLocaleString()} Coins Available</span>
          </div>
          {locationFilter && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-sm text-gray-500">Items in: <span className="font-bold text-indigo-600">{locationFilter}</span></span>
              <button 
                onClick={clearLocationFilter}
                className="text-[10px] uppercase tracking-wider font-bold bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search marketplace..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-900 border-none rounded-2xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
            />
          </div>
          <button 
            onClick={() => setIsPostModalOpen(true)}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all whitespace-nowrap shadow-lg shadow-indigo-500/20 active:scale-95"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">List Item</span>
            <span className="sm:hidden">List</span>
          </button>
          <button className="p-3 rounded-2xl bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="flex gap-8 border-b border-gray-100 dark:border-gray-800 mb-8 px-4 lg:px-0">
        <button 
          onClick={() => setActiveTab('products')}
          className={cn(
            "flex items-center gap-2 py-4 border-b-2 transition-all",
            activeTab === 'products' ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Grid size={18} />
          <span className="font-bold text-sm uppercase tracking-wider">Products</span>
        </button>
        <button 
          onClick={() => setActiveTab('reels')}
          className={cn(
            "flex items-center gap-2 py-4 border-b-2 transition-all",
            activeTab === 'reels' ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <PlaySquare size={18} />
          <span className="font-bold text-sm uppercase tracking-wider">Reels</span>
        </button>
        <button 
          onClick={() => setActiveTab('posts')}
          className={cn(
            "flex items-center gap-2 py-4 border-b-2 transition-all",
            activeTab === 'posts' ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <ImageIcon size={18} />
          <span className="font-bold text-sm uppercase tracking-wider">Posts</span>
        </button>
      </div>

      {activeTab === 'products' ? (
        <>
          <div className="flex items-center gap-2 mb-8 overflow-x-auto no-scrollbar px-4 lg:px-0">
            {categories.map((cat) => (
              <button 
                key={cat.name}
                onClick={() => setActiveCategory(cat.name)}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-2xl whitespace-nowrap font-bold transition-all text-sm border-2",
                  activeCategory === cat.name
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/20' 
                    : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                )}
              >
                <span className="text-lg">{cat.icon}</span>
                {cat.name}
              </button>
            ))}
          </div>

          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6 px-4 lg:px-0">
              {filteredProducts.map((product) => (
                <motion.div 
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-gray-900 rounded-3xl overflow-hidden border border-gray-100 dark:border-gray-800 group flex flex-col shadow-sm hover:shadow-xl hover:border-indigo-500/30 transition-all duration-300"
                >
                  <div 
                    className="aspect-[1/1] relative overflow-hidden cursor-pointer"
                    onClick={() => navigate(`/marketplace/product/${product.id}`)}
                  >
                    <ResponsiveImage 
                      src={product.image || `https://picsum.photos/seed/${product.id}/400/400`} 
                      alt={product.title} 
                      width={400}
                      height={400}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                    {product.is_featured ? (
                      <div className="absolute top-2 left-2 z-[1] rounded-lg border border-amber-400/40 bg-black/60 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-200 backdrop-blur-sm">
                        ⭐ Featured
                      </div>
                    ) : null}
                    <div className="absolute top-2 right-2 flex flex-col gap-2">
                      <button 
                        type="button"
                        aria-label={savedProductIds.has(product.id) ? 'Unsave' : 'Save'}
                        onClick={(e) => void toggleSaveProduct(e, product.id)}
                        className={cn(
                          'w-9 h-9 bg-white/90 dark:bg-black/90 backdrop-blur-md rounded-full flex items-center justify-center transition-colors shadow-md',
                          savedProductIds.has(product.id)
                            ? 'text-red-500'
                            : 'text-gray-600 dark:text-white hover:text-red-500'
                        )}
                      >
                        <Heart size={16} className={savedProductIds.has(product.id) ? 'fill-current' : ''} />
                      </button>
                    </div>
                    <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md text-white px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10">
                      {product.category}
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex flex-col mb-3">
                      <h3 
                        className="font-bold text-base leading-tight cursor-pointer hover:text-indigo-600 transition-colors line-clamp-1 mb-1"
                        onClick={() => navigate(`/marketplace/product/${product.id}`)}
                      >
                        {product.title}
                      </h3>
                      <div className="flex items-center gap-1.5 text-indigo-600 font-black text-lg">
                        <Coins size={16} />
                        <span>{(product.price || 0).toLocaleString()}</span>
                      </div>
                      <p className="flex items-center gap-1 text-gray-400 text-[10px] font-medium mt-1">
                        <Eye size={11} className="shrink-0 opacity-80" aria-hidden />
                        <span>{(product.view_count ?? 0).toLocaleString()} views</span>
                      </p>
                    </div>
                    
                    <div 
                      className="flex items-center gap-1.5 text-gray-400 text-xs mb-4 cursor-pointer hover:text-indigo-600 transition-colors w-fit font-medium"
                      onClick={() => handleLocationClick(product.location)}
                    >
                      <MapPin size={12} />
                      <span className="truncate">{(product.location || '').split(',')[0] || '—'}</span>
                    </div>
                    
                    <div className="mt-auto">
                      <button 
                        onClick={() => {
                          setSelectedProduct(product);
                          setIsBuyModalOpen(true);
                        }}
                        className="w-full bg-indigo-600 text-white py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-500/10"
                      >
                        Buy Now
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-400">
                <ShoppingBag size={40} />
              </div>
              <h3 className="text-xl font-bold mb-2">No items found</h3>
              <p className="text-gray-500 max-w-xs mx-auto">Try adjusting your search or filters to find what you're looking for.</p>
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('All');
                  clearLocationFilter();
                }}
                className="mt-6 text-indigo-600 font-bold hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </>
      ) : activeTab === 'reels' ? (
        reels.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6 px-4 lg:px-0">
          {reels.map((video, i) => (
            <motion.div 
              key={video.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => navigate(`/marketplace/product/${video.id}`)}
              className="aspect-[9/16] bg-white dark:bg-gray-900 rounded-3xl overflow-hidden group cursor-pointer relative shadow-sm hover:shadow-xl hover:border-indigo-500/30 transition-all duration-300 border border-gray-100 dark:border-gray-800"
            >
              <ResponsiveImage 
                src={video.thumbnail} 
                alt={video.caption || 'Product'} 
                width={400}
                height={600}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex items-center gap-2 text-white mb-2">
                  <div className="w-6 h-6 rounded-full overflow-hidden border border-white/20 bg-indigo-600 flex items-center justify-center shrink-0">
                    {video.user.avatar ? (
                      <ResponsiveImage src={video.user.avatar} alt="" width={50} height={50} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-black">{(video.user.username || '?').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <span className="text-xs font-bold truncate">@{video.user.username}</span>
                </div>
                <div className="flex items-center gap-3 text-white/90 text-[10px] font-bold">
                  <div className="flex items-center gap-1">
                    <Coins size={12} />
                    {(video.coins || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-400">
              <PlaySquare size={40} />
            </div>
            <h3 className="text-xl font-bold mb-2">No product videos yet</h3>
            <p className="text-gray-500 max-w-xs mx-auto">
              Listings with real product images appear here. Add a product with a photo in the Products tab.
            </p>
          </div>
        )
      ) : marketplacePostsGrid.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6 px-4 lg:px-0">
          {marketplacePostsGrid.map((post, i) => (
            <motion.div 
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => navigate(`/marketplace/product/${post.id}`)}
              className="aspect-square bg-white dark:bg-gray-900 rounded-3xl overflow-hidden group cursor-pointer relative shadow-sm hover:shadow-xl hover:border-indigo-500/30 transition-all duration-300 border border-gray-100 dark:border-gray-800"
            >
              <ResponsiveImage 
                src={post.image!} 
                alt={post.caption || 'Product'} 
                width={500}
                height={500}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-4 left-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-2 text-white mb-1">
                  <div className="w-5 h-5 rounded-full overflow-hidden border border-white/20 bg-indigo-600 flex items-center justify-center shrink-0">
                    {post.user.avatar ? (
                      <ResponsiveImage src={post.user.avatar} alt="" width={50} height={50} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[8px] font-black">{(post.user.username || '?').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold truncate">@{post.user.username}</span>
                </div>
                <div className="flex items-center gap-1 text-white/90 text-[10px] font-bold">
                  <Coins size={10} />
                  {(products.find((x) => x.id === post.id)?.price ?? 0).toLocaleString()}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-400">
            <ImageIcon size={40} />
          </div>
          <h3 className="text-xl font-bold mb-2">No marketplace listings yet</h3>
          <p className="text-gray-500 max-w-xs mx-auto">
            Products with a real Supabase image and seller appear here. List an item from the Products tab.
          </p>
        </div>
      )}

      {/* Post Product Modal */}
      <AnimatePresence>
        {isPostModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closePostModal}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-3xl lg:rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 p-5 md:p-8 max-h-[90vh] flex flex-col"
              >
                <div className="flex items-center justify-between mb-4 md:mb-6 flex-shrink-0">
                  <h2 className="text-xl md:text-2xl font-bold">List New Item</h2>
                  <button onClick={closePostModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handlePostProduct} className="space-y-4 md:space-y-6 overflow-y-auto pr-2 -mr-2 custom-scrollbar flex-1 pb-6">
                  <div className="flex-shrink-0">
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      className="hidden" 
                      multiple 
                      accept="image/*"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setSelectedImages(prev => [...prev, ...files].slice(0, 5));
                      }}
                    />
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="h-20 md:h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl md:rounded-3xl flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 cursor-pointer hover:border-indigo-500 transition-colors group"
                    >
                      {selectedImages.length > 0 ? (
                        <div className="flex items-center gap-2 overflow-x-auto p-2 w-full justify-center no-scrollbar">
                          {selectedImages.map((file, i) => (
                            <div key={i} className="relative w-12 h-12 md:w-16 md:h-16 rounded-lg overflow-hidden flex-shrink-0">
                              <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedImages(prev => prev.filter((_, index) => index !== i));
                                }}
                                className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                          {selectedImages.length < 5 && (
                            <div className="w-12 h-12 md:w-16 md:h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400">
                              <Plus size={16} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <Camera size={20} className="text-gray-400 mb-1 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-bold text-gray-500">Add Product Photos</span>
                          <p className="text-[9px] text-gray-400 mt-0.5">Up to 5 photos</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 md:space-y-4">
                    <div>
                      <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 md:mb-2 block">Item Title</label>
                      <input 
                        name="title"
                        required
                        placeholder="e.g. iPhone 15 Pro Max - Unlocked"
                        className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-xl md:rounded-2xl py-3 md:py-4 px-4 md:px-5 focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 md:mb-2 block">Description</label>
                      <textarea 
                        name="description"
                        required
                        rows={3}
                        placeholder="Describe your item's condition..."
                        className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-xl md:rounded-2xl py-3 md:py-4 px-4 md:px-5 focus:ring-2 focus:ring-indigo-500 transition-all font-medium resize-none text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                      <div>
                        <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 md:mb-2 block">Price (Coins)</label>
                        <div className="relative">
                          <Coins className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-indigo-500" size={16} />
                          <input 
                            name="price"
                            type="number"
                            required
                            placeholder="0"
                            className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-xl md:rounded-2xl py-3 md:py-4 pl-10 md:pl-12 pr-4 md:pr-5 focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 md:mb-2 block">Stock</label>
                        <input 
                          name="stock"
                          type="number"
                          defaultValue={1}
                          min={1}
                          className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-xl md:rounded-2xl py-3 md:py-4 px-4 md:px-5 focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                      <div>
                        <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 md:mb-2 block">Category</label>
                        <div className="relative">
                          <select 
                            name="category"
                            className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-xl md:rounded-2xl py-3 md:py-4 px-4 md:px-5 focus:ring-2 focus:ring-indigo-500 transition-all appearance-none font-medium text-sm"
                          >
                            {categories.filter(c => c.name !== 'All').map(c => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                          <ChevronRight size={16} className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 md:mb-2 block">Location</label>
                        <div className="relative">
                          <MapPin className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                          <input 
                            name="location"
                            required
                            placeholder="City, State"
                            className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-xl md:rounded-2xl py-3 md:py-4 pl-10 md:pl-12 pr-4 md:pr-5 focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 pb-4 flex-shrink-0">
                    <button 
                      type="submit"
                      className="w-full bg-indigo-600 text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 active:scale-[0.98] text-sm"
                    >
                      List Item Now
                    </button>
                    <p className="text-[9px] md:text-[10px] text-center text-gray-400 mt-3 md:mt-4 px-4 md:px-8 leading-relaxed">
                      By listing this item, you agree to our Marketplace Terms of Service and Community Guidelines.
                    </p>
                  </div>
                </form>
              </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Buy Confirmation Modal */}
      <AnimatePresence>
        {isBuyModalOpen && selectedProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => buyStatus === 'idle' && setIsBuyModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 p-8 text-center"
            >
              {buyStatus === 'idle' && (
                <>
                  <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShoppingBag className="text-indigo-600" size={40} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Confirm Purchase</h2>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">
                    Are you sure you want to buy <span className="font-bold text-gray-900 dark:text-white">{selectedProduct.title}</span>?
                  </p>
                  
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-3xl p-6 mb-8">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-500">Price</span>
                      <div className="flex items-center gap-1 font-bold text-indigo-600">
                        <Coins size={16} />
                        <span>{(selectedProduct.price || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-gray-500">Your Balance</span>
                      <div className="flex items-center gap-1 font-bold">
                        <Coins size={16} />
                        <span>{(userCoins || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button 
                      onClick={() => setIsBuyModalOpen(false)}
                      className="flex-1 py-4 rounded-2xl font-bold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => handleBuy(selectedProduct)}
                      className="flex-1 py-4 rounded-2xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20"
                    >
                      Confirm
                    </button>
                  </div>
                </>
              )}

              {buyStatus === 'processing' && (
                <div className="py-12">
                  <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                  <h2 className="text-2xl font-bold mb-2">Processing...</h2>
                  <p className="text-gray-500">Securing your item</p>
                </div>
              )}

              {buyStatus === 'success' && (
                <div className="py-12">
                  <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="text-green-600" size={40} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Purchase Successful!</h2>
                  <p className="text-gray-500">The item is now yours</p>
                </div>
              )}

              {buyStatus === 'error' && (
                <div className="py-12">
                  <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="text-red-600" size={40} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Insufficient Coins</h2>
                  <p className="text-gray-500 mb-8">You need more coins to complete this purchase.</p>
                  <button 
                    onClick={() => setIsBuyModalOpen(false)}
                    className="w-full py-4 rounded-2xl font-bold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

