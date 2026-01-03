// Default topic taxonomy - broad categories
export const DEFAULT_TOPICS: { name: string; keywords: string[] }[] = [
  {
    name: 'Cryptocurrency',
    keywords: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'blockchain', 'defi', 'nft', 'altcoin', 'hodl', 'wallet', 'mining'],
  },
  {
    name: 'Stocks & Investing',
    keywords: ['stock', 'invest', 'dividend', 'portfolio', 'etf', 'nasdaq', 'sp500', 's&p', 'trading', 'bull', 'bear', 'market'],
  },
  {
    name: 'Real Estate',
    keywords: ['real estate', 'property', 'mortgage', 'rental', 'landlord', 'housing', 'reit', 'flip', 'airbnb'],
  },
  {
    name: 'Side Hustles',
    keywords: ['side hustle', 'passive income', 'freelance', 'gig', 'dropshipping', 'affiliate', 'monetize', 'income stream'],
  },
  {
    name: 'Watches & Luxury',
    keywords: ['rolex', 'watch', 'omega', 'patek', 'audemars', 'luxury', 'timepiece', 'horology', 'collector'],
  },
  {
    name: 'Artificial Intelligence',
    keywords: ['ai', 'artificial intelligence', 'machine learning', 'chatgpt', 'llm', 'openai', 'claude', 'automation', 'neural'],
  },
  {
    name: 'Gaming',
    keywords: ['gaming', 'gamer', 'esports', 'twitch', 'steam', 'playstation', 'xbox', 'nintendo', 'pc gaming'],
  },
  {
    name: 'Fitness & Health',
    keywords: ['fitness', 'gym', 'workout', 'health', 'nutrition', 'diet', 'protein', 'muscle', 'cardio', 'weight loss'],
  },
  {
    name: 'Personal Finance',
    keywords: ['budget', 'savings', 'debt', 'fire', 'retire', 'financial', 'money management', 'credit', 'loan'],
  },
  {
    name: 'Entrepreneurship',
    keywords: ['startup', 'entrepreneur', 'business', 'founder', 'saas', 'bootstrap', 'venture', 'scale', 'mvp'],
  },
  {
    name: 'Career & Jobs',
    keywords: ['career', 'job', 'resume', 'interview', 'salary', 'remote work', 'wfh', 'promotion', 'linkedin'],
  },
  {
    name: 'Fashion',
    keywords: ['fashion', 'style', 'outfit', 'designer', 'clothing', 'streetwear', 'sneaker', 'brand'],
  },
  {
    name: 'Cars & Automotive',
    keywords: ['car', 'automotive', 'tesla', 'ev', 'electric vehicle', 'supercar', 'jdm', 'modified'],
  },
  {
    name: 'Travel',
    keywords: ['travel', 'vacation', 'flight', 'hotel', 'destination', 'backpack', 'nomad', 'explore'],
  },
  {
    name: 'Content Creation',
    keywords: ['youtube', 'content creator', 'influencer', 'subscriber', 'viral', 'algorithm', 'monetization', 'sponsor'],
  },
];

// Motivation patterns for classification
export const MOTIVATION_PATTERNS: Record<string, RegExp[]> = {
  wealth_accumulation: [
    /invest|profit|passive income|money|rich|wealth|roi|gains/i,
    /financial freedom|make money|side hustle|income stream/i,
    /millionaire|billionaire|net worth|compound/i,
  ],
  status_signaling: [
    /luxury|exclusive|rare|limited edition|premium|elite/i,
    /flex|show off|collection|authentic|genuine/i,
    /prestigious|high.end|upscale|vip/i,
  ],
  community_belonging: [
    /community|together|we all|join us|tribe|fam|gang/i,
    /support each other|one of us|belong/i,
    /family|brothers|sisters|squad/i,
  ],
  identity_expression: [
    /who i am|my style|represents me|personal|authentic self/i,
    /express|identity|unique|individual/i,
    /aesthetic|vibe|personality/i,
  ],
  knowledge_expertise: [
    /learn|how to|guide|tutorial|explained|understand/i,
    /master|expert|deep dive|analysis/i,
    /research|study|discover|knowledge/i,
  ],
  entertainment_escapism: [
    /fun|amazing|incredible|wow|crazy|wild/i,
    /enjoy|entertaining|hilarious|awesome/i,
    /escape|relax|chill|unwind/i,
  ],
  security_stability: [
    /safe|secure|protect|long.term|stable|reliable/i,
    /insurance|savings|peace of mind|risk.free/i,
    /emergency fund|backup|safety net/i,
  ],
};

// App defaults
export const DEFAULT_SETTINGS: Partial<import('./types').AppSettings> = {
  collectionIntervalMinutes: 30,
  subreddits: ['cryptocurrency', 'wallstreetbets', 'stocks', 'sidehustle', 'entrepreneur'],
  searchQueries: [],
};
