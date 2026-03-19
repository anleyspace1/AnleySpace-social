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
  category: string;
  seller: Partial<User>;
  stock?: number;
};

export type Message = {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'video' | 'voice';
  audioUrl?: string;
  imageUrl?: string;
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
