import AsyncStorage from '@react-native-async-storage/async-storage';

import { Chat, ChatMessage } from '../types/chat';

const CHATS_STORAGE_KEY = '@worldforge/chats/v1';

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;

  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
  );
}

function isChat(value: unknown): value is Chat {
  if (!value || typeof value !== 'object') return false;

  const chat = value as Partial<Chat>;
  return (
    typeof chat.id === 'string' &&
    typeof chat.title === 'string' &&
    typeof chat.createdAt === 'string' &&
    typeof chat.updatedAt === 'string' &&
    Array.isArray(chat.messages) &&
    chat.messages.every(isChatMessage)
  );
}

export async function loadChats(): Promise<Chat[]> {
  const storedChats = await AsyncStorage.getItem(CHATS_STORAGE_KEY);
  if (!storedChats) return [];

  const parsed: unknown = JSON.parse(storedChats);
  if (!Array.isArray(parsed)) {
    throw new Error('Saved chats have an invalid format.');
  }

  return parsed.filter(isChat).sort((first, second) =>
    second.updatedAt.localeCompare(first.updatedAt),
  );
}

export async function saveChats(chats: Chat[]): Promise<void> {
  await AsyncStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats));
}
