
export interface WordEntry {
  word: string;
  translation: string;
  definition: string;
  example: string;
  addedAt: number;
  level: 'learning' | 'mastered' | 'achieved';
  targets?: string[];
  videoId?: string; // Track which video this word belongs to
  contextStart?: number; // The timestamp of the segment where this was captured
  occurrenceIndex?: number; // The index of the word in that segment
}

export interface VideoLesson {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  transcript: TranscriptItem[];
  language: string;
  status?: 'learning' | 'achieved';
}

export interface TranscriptItem {
  start: number;
  duration: number;
  text: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export enum View {
  EXPLORE = 'explore',
  WATCH = 'watch',
  LEARN = 'learn',
  PLAY = 'play',
  DAO = 'dao'
}

export type GameType = 'quiz' | 'juggle' | 'typing' | 'shorts';

export type SubscriptionType = 'Free' | 'Pro' | 'Lifetime';

export interface UserProfile {
  name: string;
  email: string;
  subscription: SubscriptionType;
  joinedAt: number;
  nativeLanguage: string;
  learningLanguage: string;
}

export interface Language {
  code: string;
  name: string;
  flag: string;
}

export interface TargetTask {
  id: string;
  name: string;
  description: string;
  words: string[];
  author?: string;
  category?: 'Exam' | 'Travel' | 'Business' | 'Lifestyle' | 'Community';
  downloads?: number;
  isInstalled?: boolean;
  createdAt?: number;
  maintainedBy?: string; // Wallet address or ID
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'jp', name: 'Japanese', flag: '🇯🇵' },
  { code: 'kr', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
];
