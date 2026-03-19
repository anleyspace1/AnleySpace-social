import { User, Video, Product, Chat } from './types';

export const MOCK_USER: User = {
  id: 'u1',
  username: 'anley_creator',
  displayName: 'AnleySpace',
  avatar: 'https://picsum.photos/seed/anley/200/200',
  bio: 'Content Creator | Let\'s grow together! 🚀',
  coins: 750,
  followers: 1500,
  following: 980,
  isVerified: true,
};

export const MOCK_VIDEOS: Video[] = [
  {
    id: 'v1',
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: 'https://picsum.photos/seed/v1/400/600',
    user: {
      username: 'dance_queen',
      avatar: 'https://picsum.photos/seed/user1/100/100',
    },
    caption: 'Epic Summer Vibes! 🌟✨ #SummerVibe #Dance #Music #Vibe #AnleySpace',
    coins: 24400,
    likes: 12500,
    comments: 1200,
    shares: 5800,
    saves: 3200,
    tags: ['Dance', 'Music', 'Vibe', 'Summer', 'Energy'],
  },
  {
    id: 'v2',
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnail: 'https://picsum.photos/seed/v2/400/600',
    user: {
      username: 'nature_lover',
      avatar: 'https://picsum.photos/seed/user2/100/100',
    },
    caption: 'Nature is beautiful 🌿 #Nature #Peace #Travel #Adventure #AnleySpace',
    coins: 12500,
    likes: 8400,
    comments: 450,
    shares: 1200,
    saves: 900,
    tags: ['Nature', 'Travel', 'Peace', 'Forest', 'Relax'],
  },
  {
    id: 'v3',
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnail: 'https://picsum.photos/seed/v3/400/600',
    user: {
      username: 'tech_guru',
      avatar: 'https://picsum.photos/seed/tech/100/100',
    },
    caption: 'New tech unboxing! 📱🔥 #Tech #Unboxing #Gadgets #Future #AnleySpace',
    coins: 8900,
    likes: 4200,
    comments: 230,
    shares: 800,
    saves: 1500,
    tags: ['Tech', 'Gadgets', 'Unboxing', 'Review', 'Future'],
  },
  {
    id: 'v4',
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    thumbnail: 'https://picsum.photos/seed/v4/400/600',
    user: {
      username: 'travel_bug',
      avatar: 'https://picsum.photos/seed/travel/100/100',
    },
    caption: 'Road trip across the country! 🚗💨 #Travel #RoadTrip #Adventure #AnleySpace',
    coins: 15600,
    likes: 9800,
    comments: 670,
    shares: 2100,
    saves: 4300,
    tags: ['Travel', 'Adventure', 'RoadTrip', 'Car', 'Explore'],
  },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    title: 'iPhone 15 Pro - 256GB',
    price: 999,
    location: 'San Francisco, CA',
    image: 'https://picsum.photos/seed/iphone/400/400',
    category: 'Electronics',
    seller: { username: 'tech_store' },
  },
  {
    id: 'p2',
    title: '2021 Mountain Bike',
    price: 450,
    location: 'Oakland, CA',
    image: 'https://picsum.photos/seed/bike/400/400',
    category: 'Vehicles',
    seller: { username: 'cycle_pro' },
  },
  {
    id: 'p3',
    title: 'Mid-Century Modern Chair',
    price: 120,
    location: 'San Jose, CA',
    image: 'https://picsum.photos/seed/chair/400/400',
    category: 'Home',
    seller: { username: 'decor_hub' },
  },
];

export const MOCK_CHATS: Chat[] = [
  {
    id: 'c1',
    user: {
      id: 'u2',
      username: 'emily_j',
      displayName: 'Emily Johnson',
      avatar: 'https://picsum.photos/seed/emily/100/100',
      bio: '',
      coins: 0,
      followers: 0,
      following: 0,
    },
    lastMessage: 'Hey, how are you?',
    timestamp: '10:30 AM',
    unreadCount: 2,
    online: true,
  },
  {
    id: 'c2',
    user: {
      id: 'u3',
      username: 'mark_d',
      displayName: 'Mark Davis',
      avatar: 'https://picsum.photos/seed/mark/100/100',
      bio: '',
      coins: 0,
      followers: 0,
      following: 0,
    },
    lastMessage: 'Did you see the new video?',
    timestamp: 'Yesterday',
    unreadCount: 0,
    online: false,
  },
];

export const MOCK_SOUNDS = [
  { id: 's1', title: 'Summer Vibes', artist: 'Lofi Girl', duration: '0:30', cover: 'https://picsum.photos/seed/sound1/100/100', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 's2', title: 'Midnight City', artist: 'M83', duration: '0:45', cover: 'https://picsum.photos/seed/sound2/100/100', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 's3', title: 'Blinding Lights', artist: 'The Weeknd', duration: '0:15', cover: 'https://picsum.photos/seed/sound3/100/100', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 's4', title: 'Levitating', artist: 'Dua Lipa', duration: '1:00', cover: 'https://picsum.photos/seed/sound4/100/100', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: 's5', title: 'Stay', artist: 'The Kid LAROI & Justin Bieber', duration: '0:20', cover: 'https://picsum.photos/seed/sound5/100/100', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: 's6', title: 'Heat Waves', artist: 'Glass Animals', duration: '0:35', cover: 'https://picsum.photos/seed/sound6/100/100', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
];
