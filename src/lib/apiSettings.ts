import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { normalizeOpenAIApiKey } from './apiKey';
import { DEFAULT_MODEL_ID, isModelId, MODEL_OPTIONS } from './modelConfig.mjs';

export type ChatApiMode = 'proxy' | 'direct';
export type ModelId = (typeof MODEL_OPTIONS)[number]['id'];

export type ChatApiSettings = {
  mode: ChatApiMode;
  modelId: ModelId;
  openAIApiKey: string | null;
};

const API_MODE_STORAGE_KEY = '@worldforge/api-mode/v1';
const MODEL_STORAGE_KEY = '@worldforge/model/v1';
const OPENAI_API_KEY_STORAGE_KEY = 'worldforge.openai-api-key.v1';

export function supportsDirectOpenAI(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

export async function loadChatApiSettings(): Promise<ChatApiSettings> {
  const [storedMode, storedModelId] = await Promise.all([
    AsyncStorage.getItem(API_MODE_STORAGE_KEY),
    AsyncStorage.getItem(MODEL_STORAGE_KEY),
  ]);
  const modelId = isModelId(storedModelId)
    ? storedModelId
    : DEFAULT_MODEL_ID;

  if (!supportsDirectOpenAI()) {
    return { mode: 'proxy', modelId, openAIApiKey: null };
  }

  const storedOpenAIApiKey = await SecureStore.getItemAsync(
    OPENAI_API_KEY_STORAGE_KEY,
  );
  const openAIApiKey = storedOpenAIApiKey
    ? normalizeOpenAIApiKey(storedOpenAIApiKey)
    : null;

  if (storedOpenAIApiKey && storedOpenAIApiKey !== openAIApiKey) {
    if (openAIApiKey) {
      await SecureStore.setItemAsync(
        OPENAI_API_KEY_STORAGE_KEY,
        openAIApiKey,
      );
    } else {
      await SecureStore.deleteItemAsync(OPENAI_API_KEY_STORAGE_KEY);
    }
  }

  const mode = storedMode === 'direct' && openAIApiKey ? 'direct' : 'proxy';

  return { mode, modelId, openAIApiKey };
}

export async function saveChatApiMode(mode: ChatApiMode): Promise<void> {
  await AsyncStorage.setItem(API_MODE_STORAGE_KEY, mode);
}

export async function saveModelId(modelId: ModelId): Promise<void> {
  await AsyncStorage.setItem(MODEL_STORAGE_KEY, modelId);
}

export async function saveOpenAIApiKey(apiKey: string): Promise<string> {
  if (!supportsDirectOpenAI()) {
    throw new Error('Direct OpenAI access is not available on the web.');
  }

  const normalizedApiKey = normalizeOpenAIApiKey(apiKey);
  if (!normalizedApiKey) {
    throw new Error('Enter an OpenAI API key.');
  }

  await SecureStore.setItemAsync(
    OPENAI_API_KEY_STORAGE_KEY,
    normalizedApiKey,
  );

  return normalizedApiKey;
}

export async function deleteOpenAIApiKey(): Promise<void> {
  if (supportsDirectOpenAI()) {
    await SecureStore.deleteItemAsync(OPENAI_API_KEY_STORAGE_KEY);
  }
}
