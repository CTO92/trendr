import { getDatabaseWrapper } from '../database';

interface ExtractedTopic {
  topicId: string;
  topicName: string;
  confidence: number;
  mentions: number;
}

interface TopicRow {
  id: string;
  name: string;
  keywords: string;
}

export class TopicExtractor {
  private topicsCache: Map<string, { id: string; name: string; keywords: string[] }> = new Map();
  private cacheLoadedAt: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private loadTopicsCache(): void {
    const now = Date.now();
    if (this.topicsCache.size > 0 && now - this.cacheLoadedAt < this.CACHE_TTL) {
      return;
    }

    const db = getDatabaseWrapper();
    const stmt = db.prepare('SELECT id, name, keywords FROM topics');
    const rows = stmt.all() as unknown as TopicRow[];

    this.topicsCache.clear();
    for (const row of rows) {
      const keywords = row.keywords ? JSON.parse(row.keywords) : [];
      this.topicsCache.set(row.id, {
        id: row.id,
        name: row.name,
        keywords,
      });
    }
    this.cacheLoadedAt = now;
  }

  extractTopics(text: string): ExtractedTopic[] {
    this.loadTopicsCache();

    const normalizedText = text.toLowerCase();
    const extractedTopics: ExtractedTopic[] = [];

    for (const [topicId, topic] of this.topicsCache) {
      let matchCount = 0;

      // Check each keyword
      for (const keyword of topic.keywords) {
        // Use word boundary matching for more accurate detection
        const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'gi');
        const matches = normalizedText.match(regex);
        if (matches) {
          matchCount += matches.length;
        }
      }

      if (matchCount > 0) {
        // Calculate confidence based on number of keyword matches
        // More matches = higher confidence, capped at 1.0
        const confidence = Math.min(matchCount * 0.2, 1.0);

        extractedTopics.push({
          topicId,
          topicName: topic.name,
          confidence,
          mentions: matchCount,
        });
      }
    }

    // Sort by confidence descending
    extractedTopics.sort((a, b) => b.confidence - a.confidence);

    // Return top 5 topics to avoid noise
    return extractedTopics.slice(0, 5);
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Extract motivations from text
  extractMotivations(text: string): { motivation: string; score: number }[] {
    const normalizedText = text.toLowerCase();
    const motivations: { motivation: string; score: number }[] = [];

    const patterns: Record<string, RegExp[]> = {
      wealth_accumulation: [
        /\b(invest|profit|passive income|money|rich|wealth|roi|gains)\b/gi,
        /\b(financial freedom|make money|side hustle|income stream)\b/gi,
        /\b(millionaire|billionaire|net worth|compound)\b/gi,
      ],
      status_signaling: [
        /\b(luxury|exclusive|rare|limited edition|premium|elite)\b/gi,
        /\b(flex|show off|collection|authentic|genuine)\b/gi,
        /\b(prestigious|high.end|upscale|vip)\b/gi,
      ],
      community_belonging: [
        /\b(community|together|we all|join us|tribe|fam)\b/gi,
        /\b(support each other|one of us|belong)\b/gi,
        /\b(family|brothers|sisters|squad)\b/gi,
      ],
      identity_expression: [
        /\b(who i am|my style|represents me|personal|authentic self)\b/gi,
        /\b(express|identity|unique|individual)\b/gi,
        /\b(aesthetic|vibe|personality)\b/gi,
      ],
      knowledge_expertise: [
        /\b(learn|how to|guide|tutorial|explained|understand)\b/gi,
        /\b(master|expert|deep dive|analysis)\b/gi,
        /\b(research|study|discover|knowledge)\b/gi,
      ],
      entertainment_escapism: [
        /\b(fun|amazing|incredible|wow|crazy|wild)\b/gi,
        /\b(enjoy|entertaining|hilarious|awesome)\b/gi,
        /\b(escape|relax|chill|unwind)\b/gi,
      ],
      security_stability: [
        /\b(safe|secure|protect|long.term|stable|reliable)\b/gi,
        /\b(insurance|savings|peace of mind|risk.free)\b/gi,
        /\b(emergency fund|backup|safety net)\b/gi,
      ],
    };

    for (const [motivation, regexes] of Object.entries(patterns)) {
      let matchCount = 0;

      for (const regex of regexes) {
        const matches = normalizedText.match(regex);
        if (matches) {
          matchCount += matches.length;
        }
      }

      if (matchCount > 0) {
        motivations.push({
          motivation,
          score: Math.min(matchCount * 0.15, 1.0),
        });
      }
    }

    motivations.sort((a, b) => b.score - a.score);
    return motivations;
  }
}
