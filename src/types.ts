export type User = {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  coins: number;
  followers: number;
  following: number;
  isVerified?: boolean;
};

export type Video = {
  id: string;
  url: string;
  thumbnail: string;
  user: Partial<User>;
  caption: string;
  coins: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  isLive?: boolean;
  viewerCount?: string;
  tags?: string[];
  sound?: {
    title: string;
    artist: string;
  } | null;
};

export type Product = {
  id: string;
  title: string;
  description?: string;
  price: number;
  location: string;
  image: string;
  /** Optional extra gallery URLs when provided by API / DB (e.g. JSON array). */
  images?: string[];
  /** Some APIs use this alias for multiple images. */
  image_urls?: string[];
  category: string;
  seller: Partial<User>;
  stock?: number;
  /** Marketplace listing views (Supabase `marketplace.view_count`). */
  view_count?: number;
  /** Supabase `marketplace.user_id` (seller); used for owner-only actions. */
  user_id?: string;
  /** DB `marketplace.is_featured` (raw); use for admin/analytics; UI uses effective `is_featured`. */
  is_featured_raw?: boolean;
  /** Effective featured (raw flag + `featured_until` window). Used by UI. */
  is_featured?: boolean;
  featured_until?: string | null;
};

export type Message = {
  id: string;
  senderId: string;
  /** DM recipient (from `receiver_id`) — used to scope seen-state updates to the open thread */
  receiverId?: string;
  content: string;
  timestamp: string;
  /** Normalized UI kind; DB may store `audio` while legacy code still uses `voice` */
  type: 'text' | 'image' | 'video' | 'voice' | 'audio' | 'story_reply';
  /** Optional raw DB `message_type` when present (does not replace `type`) */
  message_type?: string;
  audioUrl?: string;
  imageUrl?: string;
  /** Story being replied to (DM story reply) */
  storyId?: string;
  storyMedia?: string;
  storyMediaType?: string | null;
  /** When current user is sender: false = Delivered, true = Seen by other party */
  isSeen?: boolean;
  /** Marketplace DM offer (from `messages.offer_price` / `offer_status`) */
  offer_price?: number;
  offer_status?: string;
};

export type Chat = {
  id: string;
  user: User;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  online?: boolean;
};

export type Post = {
  id: string;
  image?: string;
  videoUrl?: string;
  user: Partial<User>;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  timestamp: string;
};

export type Transaction = {
  id: string;
  type: 'earn' | 'send' | 'receive' | 'withdraw' | 'exchange';
  amount: number;
  description: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
};
