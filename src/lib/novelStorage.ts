import AsyncStorage from '@react-native-async-storage/async-storage';

import { Novel, NovelMessage } from '../types/novel';

const NOVELS_STORAGE_KEY = '@worldforge/novels/v1';
const LEGACY_CHATS_STORAGE_KEY = '@worldforge/chats/v1';

function isNovelMessage(value: unknown): value is NovelMessage {
  if (!value || typeof value !== 'object') return false;

  const message = value as Partial<NovelMessage>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    (message.isSetup === undefined || typeof message.isSetup === 'boolean')
  );
}

function isNovel(value: unknown): value is Novel {
  if (!value || typeof value !== 'object') return false;

  const novel = value as Partial<Novel>;
  return (
    typeof novel.id === 'string' &&
    typeof novel.title === 'string' &&
    typeof novel.setting === 'string' &&
    typeof novel.plot === 'string' &&
    typeof novel.createdAt === 'string' &&
    typeof novel.updatedAt === 'string' &&
    Array.isArray(novel.messages) &&
    novel.messages.every(isNovelMessage)
  );
}

type LegacyChat = Omit<Novel, 'setting' | 'plot'>;

function isLegacyChat(value: unknown): value is LegacyChat {
  if (!value || typeof value !== 'object') return false;

  const chat = value as Partial<LegacyChat>;
  return (
    typeof chat.id === 'string' &&
    typeof chat.title === 'string' &&
    typeof chat.createdAt === 'string' &&
    typeof chat.updatedAt === 'string' &&
    Array.isArray(chat.messages) &&
    chat.messages.every(isNovelMessage)
  );
}

function newestFirst(first: Novel, second: Novel) {
  return second.updatedAt.localeCompare(first.updatedAt);
}

export async function loadNovels(): Promise<Novel[]> {
  const storedNovels = await AsyncStorage.getItem(NOVELS_STORAGE_KEY);
  if (storedNovels) {
    const parsed: unknown = JSON.parse(storedNovels);
    if (!Array.isArray(parsed)) {
      throw new Error('Saved novels have an invalid format.');
    }
    return parsed.filter(isNovel).sort(newestFirst);
  }

  const storedChats = await AsyncStorage.getItem(LEGACY_CHATS_STORAGE_KEY);
  if (!storedChats) return [];

  const parsedChats: unknown = JSON.parse(storedChats);
  if (!Array.isArray(parsedChats)) {
    throw new Error('Saved chats have an invalid format.');
  }

  const migratedNovels = parsedChats.filter(isLegacyChat).map((chat) => ({
    ...chat,
    setting: 'Imported from an earlier WorldForge conversation.',
    plot: 'Continue the saved story from where it left off.',
  }));

  if (migratedNovels.length > 0) {
    await AsyncStorage.setItem(
      NOVELS_STORAGE_KEY,
      JSON.stringify(migratedNovels),
    );
  }

  return migratedNovels.sort(newestFirst);
}

export async function saveNovels(novels: Novel[]): Promise<void> {
  await AsyncStorage.setItem(NOVELS_STORAGE_KEY, JSON.stringify(novels));
}
