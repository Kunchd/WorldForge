import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import Markdown, {
  type MarkdownStyleMap,
} from '@ronradtke/react-native-markdown-display';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  type ChatApiMode,
  type ModelId,
  deleteOpenAIApiKey,
  loadChatApiSettings,
  saveChatApiMode,
  saveModelId,
  saveOpenAIApiKey,
  supportsDirectOpenAI,
} from './src/lib/apiSettings';
import { normalizeOpenAIApiKey } from './src/lib/apiKey';
import { sendChat } from './src/lib/chatApi';
import {
  DEFAULT_MODEL_ID,
  MODEL_OPTIONS,
  modelLabel,
} from './src/lib/modelConfig.mjs';
import { loadNovels, saveNovels } from './src/lib/novelStorage';
import { buildStoryPrompt } from './src/lib/storyPrompt';
import { Novel, NovelMessage } from './src/types/novel';

const COLORS = {
  background: '#0D0C12',
  panel: '#17151E',
  raised: '#211E2A',
  border: '#332D40',
  text: '#F8F2E8',
  muted: '#AAA1B6',
  accent: '#F2B84B',
  accentDark: '#4A3514',
  rose: '#E88D9D',
  danger: '#FFB4AB',
  dangerBackground: '#3A1D20',
};

const COVER_COLORS = ['#733D5A', '#315C63', '#634A8B', '#8A5538', '#3D6650'];
type Screen = 'library' | 'create' | 'settings';
type NovelMenuMode = 'actions' | 'rename' | 'delete';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function deriveTitle(setting: string) {
  const phrase = setting.trim().split(/[.!?\n]/)[0].replace(/\s+/g, ' ');
  if (!phrase) return 'Untitled Chronicle';
  return phrase.length > 34 ? `${phrase.slice(0, 34).trimEnd()}…` : phrase;
}

function formatUpdatedAt(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function previewForNovel(novel: Novel) {
  const messages = novel.messages.filter((message) => !message.isSetup);
  const message = messages[messages.length - 1];
  return message
    ? message.content.replace(/\s+/g, ' ')
    : 'Your story is ready to begin.';
}

function coverColorFor(novel: Novel) {
  const seed = [...novel.id].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return COVER_COLORS[seed % COVER_COLORS.length];
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('library');
  const [novels, setNovels] = useState<Novel[]>([]);
  const [activeNovelId, setActiveNovelId] = useState<string | null>(null);
  const [novelMenuId, setNovelMenuId] = useState<string | null>(null);
  const [novelMenuMode, setNovelMenuMode] = useState<NovelMenuMode>('actions');
  const [renameDraft, setRenameDraft] = useState('');
  const [draft, setDraft] = useState('');
  const [novelTitle, setNovelTitle] = useState('');
  const [storySetting, setStorySetting] = useState('');
  const [storyPlot, setStoryPlot] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [persistenceVersion, setPersistenceVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [apiMode, setApiMode] = useState<ChatApiMode>('proxy');
  const [modelId, setModelId] = useState<ModelId>(DEFAULT_MODEL_ID);
  const [pendingModelId, setPendingModelId] = useState<ModelId | null>(null);
  const [openAIApiKey, setOpenAIApiKey] = useState<string | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [isSavingApiSettings, setIsSavingApiSettings] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [modelSettingsError, setModelSettingsError] = useState<string | null>(null);
  const [apiSettingsError, setApiSettingsError] = useState<string | null>(null);
  const [apiSettingsNotice, setApiSettingsNotice] = useState<string | null>(null);
  const listRef = useRef<FlatList<NovelMessage>>(null);
  const lastAutoScrolledUserIdRef = useRef<string | null>(null);
  const scrollRetryCountRef = useRef(0);
  const apiKeyInputRef = useRef<TextInput>(null);
  const isSwitchingApiModeRef = useRef(false);
  const storageWriteQueue = useRef<Promise<void>>(Promise.resolve());

  const activeNovel = novels.find((novel) => novel.id === activeNovelId) ?? null;
  const menuNovel = novels.find((novel) => novel.id === novelMenuId) ?? null;
  const visibleMessages =
    activeNovel?.messages.filter((message) => !message.isSetup) ?? [];
  const latestVisibleMessage = visibleMessages[visibleMessages.length - 1];

  useEffect(() => {
    let isMounted = true;
    Promise.allSettled([loadNovels(), loadChatApiSettings()]).then(
      ([novelsResult, settingsResult]) => {
        if (!isMounted) return;
        if (novelsResult.status === 'fulfilled') {
          setNovels(novelsResult.value);
        } else {
          const caughtError = novelsResult.reason;
          setPersistenceError(
            caughtError instanceof Error
              ? `Could not load saved novels: ${caughtError.message}`
              : 'Could not load saved novels.',
          );
        }
        if (settingsResult.status === 'fulfilled') {
          setApiMode(settingsResult.value.mode);
          setModelId(settingsResult.value.modelId);
          setOpenAIApiKey(settingsResult.value.openAIApiKey);
        } else {
          const caughtError = settingsResult.reason;
          setApiSettingsError(
            caughtError instanceof Error
              ? `Could not load API settings: ${caughtError.message}`
              : 'Could not load API settings.',
          );
        }
        setIsHydrating(false);
      },
    );
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isHydrating || persistenceVersion === 0) return;
    storageWriteQueue.current = storageWriteQueue.current
      .catch(() => undefined)
      .then(() => saveNovels(novels))
      .then(() => setPersistenceError(null))
      .catch((caughtError: unknown) => {
        setPersistenceError(
          caughtError instanceof Error
            ? `Could not save novels: ${caughtError.message}`
            : 'Could not save novels.',
        );
      });
  }, [isHydrating, novels, persistenceVersion]);

  useEffect(() => {
    if (!activeNovelId) return;
    const timer = setTimeout(
      () => listRef.current?.scrollToEnd({ animated: false }),
      80,
    );
    return () => clearTimeout(timer);
  }, [activeNovelId]);

  useEffect(() => {
    if (
      latestVisibleMessage?.role !== 'user' ||
      latestVisibleMessage.id === lastAutoScrolledUserIdRef.current
    ) {
      return;
    }

    lastAutoScrolledUserIdRef.current = latestVisibleMessage.id;
    scrollRetryCountRef.current = 0;
    listRef.current?.scrollToIndex({
      animated: true,
      index: visibleMessages.length - 1,
      viewPosition: 1,
    });
  }, [activeNovelId, latestVisibleMessage?.id, latestVisibleMessage?.role, visibleMessages.length]);

  function handleScrollToIndexFailed({
    averageItemLength,
    index,
  }: {
    averageItemLength: number;
    index: number;
  }) {
    if (scrollRetryCountRef.current >= 1) return;
    scrollRetryCountRef.current += 1;
    listRef.current?.scrollToOffset({
      animated: false,
      offset: averageItemLength * index,
    });
    setTimeout(
      () => listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 1 }),
      80,
    );
  }

  function updateNovels(updater: (current: Novel[]) => Novel[]) {
    setNovels(updater);
    setPersistenceVersion((current) => current + 1);
  }

  function updateNovel(novelId: string, updater: (novel: Novel) => Novel) {
    updateNovels((current) =>
      current
        .map((novel) => (novel.id === novelId ? updater(novel) : novel))
        .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
    );
  }

  function openNovelMenu(novel: Novel) {
    setNovelMenuId(novel.id);
    setRenameDraft(novel.title);
    setNovelMenuMode('actions');
  }

  function closeNovelMenu() {
    setNovelMenuId(null);
    setRenameDraft('');
    setNovelMenuMode('actions');
  }

  function handleRenameNovel() {
    const title = renameDraft.trim();
    if (!menuNovel || !title) return;

    updateNovel(menuNovel.id, (novel) => ({ ...novel, title }));
    closeNovelMenu();
  }

  function handleDeleteNovel() {
    if (!menuNovel) return;

    const novelId = menuNovel.id;
    updateNovels((current) =>
      current.filter((novel) => novel.id !== novelId),
    );
    if (activeNovelId === novelId) setActiveNovelId(null);
    closeNovelMenu();
  }

  function currentTransport() {
    return apiMode === 'direct' && openAIApiKey
      ? { type: 'openai' as const, apiKey: openAIApiKey, modelId }
      : { type: 'proxy' as const, modelId };
  }

  async function requestStoryReply(
    novelId: string,
    conversation: NovelMessage[],
  ) {
    setIsSending(true);
    setError(null);
    try {
      const reply = await sendChat(conversation, currentTransport());
      updateNovel(novelId, (novel) => ({
        ...novel,
        messages: [
          ...novel.messages,
          { id: createId('narrator'), role: 'assistant', content: reply },
        ],
        updatedAt: new Date().toISOString(),
      }));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleCreateNovel() {
    const setting = storySetting.trim();
    const plot = storyPlot.trim();
    if (!setting || !plot || isSending) return;
    const timestamp = new Date().toISOString();
    const setupMessage: NovelMessage = {
      id: createId('story-brief'),
      role: 'user',
      content: buildStoryPrompt({ setting, plot }),
      isSetup: true,
    };
    const novel: Novel = {
      id: createId('novel'),
      title: novelTitle.trim() || deriveTitle(setting),
      setting,
      plot,
      messages: [setupMessage],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    updateNovels((current) => [novel, ...current]);
    setActiveNovelId(novel.id);
    setScreen('library');
    setNovelTitle('');
    setStorySetting('');
    setStoryPlot('');
    void requestStoryReply(novel.id, novel.messages);
  }

  function handleSend() {
    const content = draft.trim();
    if (!content || isSending || !activeNovel) return;
    const userMessage: NovelMessage = {
      id: createId('player'),
      role: 'user',
      content,
    };
    const conversation = [...activeNovel.messages, userMessage];
    const novelId = activeNovel.id;
    setDraft('');
    updateNovel(novelId, (novel) => ({
      ...novel,
      messages: conversation,
      updatedAt: new Date().toISOString(),
    }));
    void requestStoryReply(novelId, conversation);
  }

  function handleGoLibrary() {
    if (isSending) return;
    setActiveNovelId(null);
    setScreen('library');
    setDraft('');
    setError(null);
  }

  async function handleUseProxy() {
    if (isSavingApiSettings || isSwitchingApiModeRef.current) return;
    if (apiMode === 'proxy') {
      setIsEditingApiKey(false);
      return;
    }
    isSwitchingApiModeRef.current = true;
    try {
      await saveChatApiMode('proxy');
      setApiMode('proxy');
      setIsEditingApiKey(false);
      setApiSettingsError(null);
      setApiSettingsNotice('New story turns will use the configured proxy.');
    } catch (caughtError) {
      setApiSettingsNotice(null);
      setApiSettingsError(
        caughtError instanceof Error ? caughtError.message : 'Could not save the API mode.',
      );
    } finally {
      isSwitchingApiModeRef.current = false;
    }
  }

  async function handleUseDirectOpenAI() {
    if (isSavingApiSettings || isSwitchingApiModeRef.current) return;
    if (!supportsDirectOpenAI()) {
      setApiSettingsNotice(null);
      setApiSettingsError(
        'Direct OpenAI access is available in the Android and iOS apps only.',
      );
      return;
    }
    if (!openAIApiKey) {
      setApiSettingsError(null);
      setApiSettingsNotice(null);
      setIsEditingApiKey(true);
      setTimeout(() => apiKeyInputRef.current?.focus(), 0);
      return;
    }
    if (apiMode === 'direct') return;
    isSwitchingApiModeRef.current = true;
    try {
      await saveChatApiMode('direct');
      setApiMode('direct');
      setApiSettingsError(null);
      setApiSettingsNotice('New story turns will be sent directly to OpenAI.');
    } catch (caughtError) {
      setApiSettingsNotice(null);
      setApiSettingsError(
        caughtError instanceof Error ? caughtError.message : 'Could not save the API mode.',
      );
    } finally {
      isSwitchingApiModeRef.current = false;
    }
  }

  async function handleSaveOpenAIKey() {
    if (isSavingApiSettings) return;
    const normalizedApiKey = normalizeOpenAIApiKey(apiKeyDraft);
    if (!normalizedApiKey) {
      setApiSettingsError('Enter an OpenAI API key.');
      return;
    }
    setIsSavingApiSettings(true);
    setApiSettingsError(null);
    setApiSettingsNotice(null);
    try {
      const savedApiKey = await saveOpenAIApiKey(normalizedApiKey);
      setOpenAIApiKey(savedApiKey);
      await saveChatApiMode('direct');
      setApiMode('direct');
      setApiKeyDraft('');
      setIsEditingApiKey(false);
      setApiSettingsNotice(
        'API key saved. New story turns will be sent directly to OpenAI.',
      );
    } catch (caughtError) {
      setApiSettingsError(
        caughtError instanceof Error ? caughtError.message : 'Could not save the API key.',
      );
    } finally {
      setIsSavingApiSettings(false);
    }
  }

  async function removeOpenAIKey() {
    setIsSavingApiSettings(true);
    setApiSettingsError(null);
    setApiSettingsNotice(null);
    try {
      await deleteOpenAIApiKey();
      await saveChatApiMode('proxy');
      setOpenAIApiKey(null);
      setApiMode('proxy');
      setApiKeyDraft('');
      setIsEditingApiKey(false);
      setApiSettingsNotice('API key removed. New turns will use the proxy.');
    } catch (caughtError) {
      setApiSettingsError(
        caughtError instanceof Error ? caughtError.message : 'Could not remove the API key.',
      );
    } finally {
      setIsSavingApiSettings(false);
    }
  }

  function handleRemoveOpenAIKey() {
    Alert.alert(
      'Remove OpenAI API key?',
      'WorldForge will switch back to the configured proxy.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void removeOpenAIKey() },
      ],
    );
  }

  async function handleSelectModel(nextModelId: ModelId) {
    if (isSavingModel || nextModelId === modelId) return;
    setPendingModelId(nextModelId);
    setIsSavingModel(true);
    setModelSettingsError(null);
    try {
      await saveModelId(nextModelId);
      setModelId(nextModelId);
    } catch (caughtError) {
      setModelSettingsError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not save the narrator model.',
      );
    } finally {
      setPendingModelId(null);
      setIsSavingModel(false);
    }
  }

  function renderModelSettings() {
    const selectedModelId = pendingModelId ?? modelId;
    return (
      <View style={styles.connectionCard}>
        <View style={styles.connectionHeadingRow}>
          <View style={styles.flex}>
            <Text style={styles.connectionTitle}>Narrator model</Text>
            <Text style={styles.connectionDescription}>
              Choose the storyteller used for every novel.
            </Text>
          </View>
          {isSavingModel ? <ActivityIndicator color={COLORS.accent} /> : null}
        </View>
        <View style={styles.modelOptions}>
          {MODEL_OPTIONS.map((option) => {
            const isSelected = selectedModelId === option.id;
            return (
              <Pressable
                accessibilityLabel={`${option.label}, ${option.detail}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                disabled={isSavingModel}
                key={option.id}
                onPress={() => void handleSelectModel(option.id)}
                style={({ pressed }) => [
                  styles.modelOption,
                  isSelected && styles.connectionOptionSelected,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={[styles.optionTitle, isSelected && styles.optionSelectedText]}>
                  {option.label}
                </Text>
                <Text style={styles.optionText}>
                  {option.detail}{option.id === DEFAULT_MODEL_ID ? ' · Default' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {modelSettingsError ? (
          <View style={styles.settingsError}>
            <Text style={styles.errorText}>{modelSettingsError}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  function renderApiSettings() {
    const directSupported = supportsDirectOpenAI();
    const hasApiKeyDraft = Boolean(normalizeOpenAIApiKey(apiKeyDraft));
    return (
      <View style={styles.connectionCard}>
        <View style={styles.connectionHeadingRow}>
          <View style={styles.flex}>
            <Text style={styles.connectionTitle}>AI connection</Text>
            <Text style={styles.connectionDescription}>
              Choose how WorldForge sends story requests.
            </Text>
          </View>
          {isSavingApiSettings ? <ActivityIndicator color={COLORS.accent} /> : null}
        </View>
        <View style={styles.connectionOptions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: apiMode === 'proxy' }}
            disabled={isSavingApiSettings}
            onPress={() => void handleUseProxy()}
            style={({ pressed }) => [
              styles.connectionOption,
              apiMode === 'proxy' && styles.connectionOptionSelected,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.optionTitle, apiMode === 'proxy' && styles.optionSelectedText]}>
              Server proxy
            </Text>
            <Text style={styles.optionText}>Uses the app service</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: apiMode === 'direct' }}
            disabled={isSavingApiSettings}
            onPress={() => void handleUseDirectOpenAI()}
            style={({ pressed }) => [
              styles.connectionOption,
              apiMode === 'direct' && styles.connectionOptionSelected,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.optionTitle, apiMode === 'direct' && styles.optionSelectedText]}>
              My API key
            </Text>
            <Text style={styles.optionText}>Connects to OpenAI</Text>
          </Pressable>
        </View>
        {!directSupported ? (
          <Text style={styles.hint}>
            Direct access is available in the Android and iOS apps. Web continues
            to use the proxy.
          </Text>
        ) : !openAIApiKey || isEditingApiKey ? (
          <View style={styles.apiKeyEditor}>
            <TextInput
              ref={apiKeyInputRef}
              accessibilityLabel="OpenAI API key"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              editable={!isSavingApiSettings}
              onChangeText={setApiKeyDraft}
              onSubmitEditing={() => void handleSaveOpenAIKey()}
              placeholder="OpenAI API key"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              style={styles.apiKeyInput}
              value={apiKeyDraft}
            />
            <View style={styles.apiKeyActions}>
              {openAIApiKey ? (
                <Pressable
                  onPress={() => {
                    setApiKeyDraft('');
                    setIsEditingApiKey(false);
                    setApiSettingsError(null);
                  }}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
              ) : null}
              <Pressable
                disabled={!hasApiKeyDraft || isSavingApiSettings}
                onPress={() => void handleSaveOpenAIKey()}
                style={[styles.saveButton, (!hasApiKeyDraft || isSavingApiSettings) && styles.buttonDisabled]}
              >
                <Text style={styles.darkButtonText}>Save & use key</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>
              Encrypted in this device&apos;s system storage and sent only to OpenAI
              in direct mode.
            </Text>
          </View>
        ) : (
          <View style={styles.savedKeyRow}>
            <View style={styles.flex}>
              <Text style={styles.savedKeyTitle}>API key saved securely</Text>
              <Text style={styles.hint}>Never sent to the WorldForge proxy.</Text>
            </View>
            <Pressable
              onPress={() => {
                setApiKeyDraft('');
                setIsEditingApiKey(true);
                setApiSettingsError(null);
                setApiSettingsNotice(null);
                setTimeout(() => apiKeyInputRef.current?.focus(), 0);
              }}
              style={styles.keyAction}
            >
              <Text style={styles.keyActionText}>Replace</Text>
            </Pressable>
            <Pressable onPress={handleRemoveOpenAIKey} style={styles.keyAction}>
              <Text style={styles.removeKeyText}>Remove</Text>
            </Pressable>
          </View>
        )}
        {apiSettingsError ? (
          <View style={styles.settingsError}><Text style={styles.errorText}>{apiSettingsError}</Text></View>
        ) : null}
        {apiSettingsNotice ? (
          <View style={styles.notice}><Text style={styles.noticeText}>{apiSettingsNotice}</Text></View>
        ) : null}
      </View>
    );
  }

  function renderLibrary() {
    return (
      <View style={styles.screen}>
        <View style={styles.homeHeader}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>WORLD FORGE</Text>
            <Text style={styles.homeTitle}>Your library</Text>
            <Text style={styles.homeSubtitle}>
              Step into a story, or forge a world of your own.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Open settings"
            onPress={() => setScreen('settings')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.iconButtonText}>⚙</Text>
          </Pressable>
        </View>
        {persistenceError ? (
          <View style={[styles.errorBanner, styles.homeError]}>
            <Text style={styles.errorText}>{persistenceError}</Text>
          </View>
        ) : null}
        {novels.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptySigil}><Text style={styles.emptyIcon}>✦</Text></View>
            <Text style={styles.emptyTitle}>Your next world awaits</Text>
            <Text style={styles.emptyText}>
              Describe a setting and its destiny. WorldForge will open the first
              scene and remember every choice you make.
            </Text>
            <Pressable
              onPress={() => setScreen('create')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.darkButtonText}>Forge your first novel</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            ListHeaderComponent={
              <View style={styles.libraryHeading}>
                <View>
                  <Text style={styles.sectionEyebrow}>CONTINUE READING</Text>
                  <Text style={styles.sectionTitle}>Interactive novels</Text>
                </View>
                <Text style={styles.novelCount}>{novels.length}</Text>
              </View>
            }
            contentContainerStyle={styles.novelGrid}
            data={novels}
            keyExtractor={(novel) => novel.id}
            numColumns={2}
            columnWrapperStyle={styles.novelRow}
            renderItem={({ item }) => (
              <Pressable
                accessibilityLabel={`Open ${item.title}`}
                accessibilityHint="Long press to rename or delete this novel"
                delayLongPress={450}
                onLongPress={() => openNovelMenu(item)}
                onPress={() => {
                  setActiveNovelId(item.id);
                  setError(null);
                }}
                style={({ pressed }) => [styles.novelCard, pressed && styles.cardPressed]}
              >
                <View style={[styles.novelCover, { backgroundColor: coverColorFor(item) }]}>
                  <View style={styles.coverGlow} />
                  <Text style={styles.coverMark}>✦</Text>
                  <Text numberOfLines={3} style={styles.coverTitle}>{item.title}</Text>
                  <Text style={styles.coverDate}>{formatUpdatedAt(item.updatedAt)}</Text>
                </View>
                <Text numberOfLines={2} style={styles.novelPreview}>{previewForNovel(item)}</Text>
              </Pressable>
            )}
          />
        )}
        {novels.length > 0 ? (
          <Pressable
            onPress={() => setScreen('create')}
            style={({ pressed }) => [styles.floatingButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.floatingButtonText}>＋ New novel</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  function renderNovelMenu() {
    if (!menuNovel) return null;

    const canRename = Boolean(renameDraft.trim());
    return (
      <Modal
        animationType="fade"
        onRequestClose={closeNovelMenu}
        statusBarTranslucent
        transparent
        visible
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalRoot}
        >
          <Pressable
            accessibilityLabel="Close novel options"
            accessibilityRole="button"
            onPress={closeNovelMenu}
            style={styles.modalBackdrop}
          />
          <View accessibilityViewIsModal style={styles.novelMenu}>
            {novelMenuMode === 'rename' ? (
              <>
                <Text style={styles.modalEyebrow}>RENAME NOVEL</Text>
                <Text style={styles.modalTitle}>Give this world a new name</Text>
                <TextInput
                  accessibilityLabel="Novel title"
                  autoFocus
                  maxLength={120}
                  onChangeText={setRenameDraft}
                  onSubmitEditing={handleRenameNovel}
                  placeholder="Novel title"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="done"
                  selectTextOnFocus
                  style={styles.renameInput}
                  value={renameDraft}
                />
                <View style={styles.modalButtonRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setNovelMenuMode('actions')}
                    style={({ pressed }) => [
                      styles.modalSecondaryButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canRename}
                    onPress={handleRenameNovel}
                    style={({ pressed }) => [
                      styles.modalPrimaryButton,
                      !canRename && styles.buttonDisabled,
                      pressed && canRename && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.darkButtonText}>Save name</Text>
                  </Pressable>
                </View>
              </>
            ) : novelMenuMode === 'delete' ? (
              <>
                <Text style={styles.modalEyebrow}>DELETE NOVEL</Text>
                <Text style={styles.modalTitle}>Delete this novel?</Text>
                <Text style={styles.modalBody}>
                  <Text style={styles.modalBodyEmphasis}>{menuNovel.title}</Text>
                  {' and its entire story will be permanently deleted. This cannot be undone.'}
                </Text>
                <View style={styles.modalButtonRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setNovelMenuMode('actions')}
                    style={({ pressed }) => [
                      styles.modalSecondaryButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleDeleteNovel}
                    style={({ pressed }) => [
                      styles.modalDeleteButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.modalDeleteButtonText}>Delete forever</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalEyebrow}>NOVEL OPTIONS</Text>
                <Text numberOfLines={2} style={styles.modalTitle}>{menuNovel.title}</Text>
                <View style={styles.modalActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setNovelMenuMode('rename')}
                    style={({ pressed }) => [styles.modalAction, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.modalActionTitle}>Rename novel</Text>
                    <Text style={styles.modalActionText}>Change the title shown in your library</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setNovelMenuMode('delete')}
                    style={({ pressed }) => [
                      styles.modalAction,
                      styles.modalDangerAction,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.modalDangerTitle}>Delete novel</Text>
                    <Text style={styles.modalActionText}>Permanently remove this story</Text>
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={closeNovelMenu}
                  style={({ pressed }) => [styles.modalCancelButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  function renderCreateNovel() {
    const canCreate = Boolean(storySetting.trim() && storyPlot.trim());
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <Header title="Forge a novel" onBack={() => setScreen('library')} />
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.formEyebrow}>NEW CHRONICLE</Text>
          <Text style={styles.formTitle}>What world will you enter?</Text>
          <Text style={styles.formIntro}>
            Give the narrator a setting and a path to follow. You’ll shape the
            details through your choices once the opening scene begins.
          </Text>
          <FieldLabel title="Title" help="Optional — we can name it for you" />
          <TextInput
            accessibilityLabel="Novel title"
            maxLength={80}
            onChangeText={setNovelTitle}
            placeholder="The Moonlit Archive"
            placeholderTextColor={COLORS.muted}
            style={styles.formInput}
            value={novelTitle}
          />
          <FieldLabel
            title="Story setting"
            help="Describe the era, genre, world, atmosphere, and who you are within it."
          />
          <TextInput
            accessibilityLabel="Story setting"
            maxLength={3000}
            multiline
            onChangeText={setStorySetting}
            placeholder="A floating academy above a storm-wrapped kingdom, where students bond with ancient constellations…"
            placeholderTextColor={COLORS.muted}
            style={[styles.formInput, styles.settingArea]}
            textAlignVertical="top"
            value={storySetting}
          />
          <FieldLabel
            title="Plot & progression"
            help="Outline the conflict, milestones, tone, and where the story should lead."
          />
          <TextInput
            accessibilityLabel="High-level plot and progression"
            maxLength={5000}
            multiline
            onChangeText={setStoryPlot}
            placeholder="Begin with the entrance trials, build a found-family cast, reveal the academy’s secret, and end with a choice that changes the sky…"
            placeholderTextColor={COLORS.muted}
            style={[styles.formInput, styles.plotArea]}
            textAlignVertical="top"
            value={storyPlot}
          />
          <View style={styles.promptNote}>
            <Text style={styles.promptMark}>✦</Text>
            <Text style={styles.promptText}>
              Your brief is placed into the WorldForge story prompt. The narrator
              will open on the first playable scene.
            </Text>
          </View>
          <Pressable
            disabled={!canCreate}
            onPress={handleCreateNovel}
            style={({ pressed }) => [
              styles.forgeButton,
              !canCreate && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.darkButtonText}>Begin the story　→</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderSettings() {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <Header title="Settings" onBack={() => setScreen('library')} />
        <ScrollView
          contentContainerStyle={styles.settingsContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.formEyebrow}>NARRATOR</Text>
          <Text style={styles.settingsTitle}>Narrator settings</Text>
          <Text style={styles.formIntro}>
            Pick a narrator and connection route. You can switch at any time
            without losing your library or story history.
          </Text>
          {renderModelSettings()}
          {renderApiSettings()}
          <View style={styles.privacyCard}>
            <Text style={styles.privacyTitle}>On-device library</Text>
            <Text style={styles.privacyText}>
              Novel briefs and story histories are saved locally on this device.
              API keys use protected system storage on iOS and Android.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderNovel() {
    if (!activeNovel) return null;
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.readerHeader}>
          <Pressable
            disabled={isSending}
            onPress={handleGoLibrary}
            style={[styles.headerButton, isSending && styles.buttonDisabled]}
          >
            <Text style={styles.headerButtonText}>‹ Library</Text>
          </Pressable>
          <View style={styles.readerHeading}>
            <Text numberOfLines={1} style={styles.readerTitle}>{activeNovel.title}</Text>
            <Text style={styles.readerSubtitle}>
              {modelLabel(modelId)} · {apiMode === 'direct' ? 'Direct OpenAI' : 'OpenAI via proxy'}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.chapterBar}>
          <Text style={styles.chapterBarText}>✦　YOUR STORY</Text>
        </View>
        <FlatList
          ref={listRef}
          contentContainerStyle={styles.messageList}
          data={visibleMessages}
          keyExtractor={(message) => message.id}
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={handleScrollToIndexFailed}
          renderItem={({ item }) =>
            item.role === 'user' ? (
              <View style={[styles.messageRow, styles.userMessageRow]}>
                <View style={[styles.messageBubble, styles.userBubble]}>
                  <Text style={[styles.messageLabel, styles.userMessageLabel]}>
                    YOUR CHOICE
                  </Text>
                  <Markdown colorScheme="dark" style={userMarkdownStyles}>
                    {item.content}
                  </Markdown>
                </View>
              </View>
            ) : (
              <View style={[styles.messageRow, styles.narratorPassage]}>
                <Markdown colorScheme="dark" style={markdownStyles}>
                  {item.content}
                </Markdown>
              </View>
            )
          }
          ListEmptyComponent={isSending ? (
            <View style={styles.openingState}>
              <Text style={styles.openingMark}>✦</Text>
              <Text style={styles.openingTitle}>Opening your world</Text>
              <Text style={styles.openingText}>The narrator is setting the first scene…</Text>
            </View>
          ) : null}
          ListFooterComponent={
            <>
              {isSending && visibleMessages.length > 0 ? (
                <View style={styles.typingBubble}>
                  <ActivityIndicator color={COLORS.accent} size="small" />
                  <Text style={styles.typingText}>The story unfolds…</Text>
                </View>
              ) : null}
              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                  {visibleMessages.length === 0 ? (
                    <Pressable
                      onPress={() => void requestStoryReply(activeNovel.id, activeNovel.messages)}
                      style={styles.retryButton}
                    >
                      <Text style={styles.retryButtonText}>Retry opening</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {persistenceError ? (
                <View style={styles.errorBanner}><Text style={styles.errorText}>{persistenceError}</Text></View>
              ) : null}
            </>
          }
        />
        <View style={styles.composerShell}>
          <TextInput
            accessibilityLabel="Your choice or action"
            editable={!isSending}
            maxLength={4000}
            multiline
            onChangeText={setDraft}
            onSubmitEditing={handleSend}
            placeholder="What do you do?"
            placeholderTextColor={COLORS.muted}
            returnKeyType="send"
            style={styles.composerInput}
            value={draft}
          />
          <Pressable
            disabled={!draft.trim() || isSending}
            onPress={handleSend}
            style={[styles.sendButton, (!draft.trim() || isSending) && styles.buttonDisabled]}
          >
            <Text style={styles.sendButtonText}>→</Text>
          </Pressable>
        </View>
        <Text style={styles.footerText}>Your choices shape this world. AI may occasionally lose the plot.</Text>
      </KeyboardAvoidingView>
    );
  }

  function renderScreen() {
    if (activeNovel) return renderNovel();
    if (screen === 'create') return renderCreateNovel();
    if (screen === 'settings') return renderSettings();
    return renderLibrary();
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        {isHydrating ? (
          <View style={styles.loadingScreen}>
            <Text style={styles.openingMark}>✦</Text>
            <ActivityIndicator color={COLORS.accent} size="large" />
            <Text style={styles.loadingText}>Opening your library…</Text>
          </View>
        ) : renderScreen()}
        {renderNovelMenu()}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.simpleHeader}>
      <Pressable onPress={onBack} style={styles.headerButton}>
        <Text style={styles.headerButtonText}>‹ Library</Text>
      </Pressable>
      <Text style={styles.simpleHeaderTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function FieldLabel({ title, help }: { title: string; help: string }) {
  return (
    <View style={styles.fieldLabel}>
      <Text style={styles.inputLabel}>{title}</Text>
      <Text style={styles.fieldHelp}>{help}</Text>
    </View>
  );
}

const markdownStyles: MarkdownStyleMap = {
  body: {
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 17,
    lineHeight: 28,
  },
  paragraph: {
    marginBottom: 12,
    marginTop: 0,
  },
  heading1: {
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    marginBottom: 10,
  },
  heading2: {
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 27,
    marginBottom: 8,
  },
  heading3: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    marginBottom: 6,
  },
  strong: { fontWeight: '800' },
  em: { fontStyle: 'italic' },
  link: { color: COLORS.accent, textDecorationLine: 'underline' },
  blockquote: {
    backgroundColor: '#17151E',
    borderColor: COLORS.accent,
    borderLeftWidth: 3,
    marginLeft: 0,
    marginVertical: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  bullet_list_icon: { color: COLORS.accent, marginLeft: 4, marginRight: 9 },
  ordered_list_icon: { color: COLORS.accent, marginLeft: 4, marginRight: 9 },
  code_inline: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    color: '#FFE0A3',
    fontSize: 14,
    padding: 0,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  code_block: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    marginVertical: 7,
    padding: 10,
  },
  fence: {
    borderColor: COLORS.border,
    marginVertical: 7,
  },
  fence_header: {
    backgroundColor: COLORS.background,
    borderBottomColor: COLORS.border,
  },
  hr: { backgroundColor: COLORS.border, marginVertical: 10 },
  table: { borderColor: COLORS.border, marginVertical: 7 },
  tr: { borderColor: COLORS.border },
  th: { backgroundColor: COLORS.background },
  text: { color: COLORS.text },
};

const userMarkdownStyles: MarkdownStyleMap = {
  ...markdownStyles,
  body: {
    ...markdownStyles.body,
    fontFamily: undefined,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  paragraph: {
    ...markdownStyles.paragraph,
    marginBottom: 0,
    textAlign: 'center',
  },
  text: { color: COLORS.text, textAlign: 'center' },
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  screen: { flex: 1 },
  flex: { flex: 1 },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.38 },
  loadingScreen: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center' },
  loadingText: { color: COLORS.muted, fontSize: 14 },
  homeHeader: {
    alignItems: 'center', borderBottomColor: COLORS.border, borderBottomWidth: 1,
    flexDirection: 'row', gap: 16, paddingBottom: 20, paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 22 : 12,
  },
  eyebrow: { color: COLORS.accent, fontSize: 10, fontWeight: '900', letterSpacing: 2.8 },
  homeTitle: {
    color: COLORS.text, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 34, fontWeight: '700', letterSpacing: -0.7, marginTop: 4,
  },
  homeSubtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  iconButton: {
    alignItems: 'center', backgroundColor: COLORS.panel, borderColor: COLORS.border,
    borderRadius: 15, borderWidth: 1, height: 46, justifyContent: 'center', width: 46,
  },
  iconButtonText: { color: COLORS.text, fontSize: 20 },
  emptyState: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 34 },
  emptySigil: {
    alignItems: 'center', backgroundColor: COLORS.accentDark, borderColor: '#76551E',
    borderRadius: 40, borderWidth: 1, height: 80, justifyContent: 'center',
    marginBottom: 22, width: 80,
  },
  emptyIcon: { color: COLORS.accent, fontSize: 34 },
  emptyTitle: {
    color: COLORS.text, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 25, fontWeight: '700', textAlign: 'center',
  },
  emptyText: {
    color: COLORS.muted, fontSize: 15, lineHeight: 23, marginTop: 10,
    maxWidth: 350, textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: COLORS.accent, borderRadius: 16, marginTop: 24,
    paddingHorizontal: 22, paddingVertical: 14,
  },
  darkButtonText: { color: '#241804', fontSize: 14, fontWeight: '900' },
  homeError: { marginHorizontal: 16, marginTop: 16 },
  novelGrid: { padding: 16, paddingBottom: 100 },
  libraryHeading: {
    alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between',
    paddingBottom: 16, paddingHorizontal: 2, paddingTop: 5,
  },
  sectionEyebrow: { color: COLORS.rose, fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: '700', marginTop: 4 },
  novelCount: { color: COLORS.muted, fontSize: 13 },
  novelRow: { gap: 12 },
  novelCard: { flex: 1, marginBottom: 20, maxWidth: '50%' },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  novelCover: {
    borderColor: '#FFFFFF20', borderRadius: 16, borderWidth: 1, height: 190,
    justifyContent: 'flex-end', overflow: 'hidden', padding: 14,
  },
  coverGlow: {
    backgroundColor: '#FFFFFF12', borderRadius: 80, height: 150,
    position: 'absolute', right: -45, top: -35, width: 150,
  },
  coverMark: { color: '#FFE5AC', fontSize: 22, left: 14, position: 'absolute', top: 12 },
  coverTitle: {
    color: '#FFF9F0', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 19, fontWeight: '800', lineHeight: 23,
  },
  coverDate: { color: '#FFFFFFB8', fontSize: 10, marginTop: 9 },
  novelPreview: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 9, paddingHorizontal: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    backgroundColor: '#000000A8', bottom: 0, left: 0, position: 'absolute',
    right: 0, top: 0,
  },
  novelMenu: {
    backgroundColor: COLORS.raised, borderColor: COLORS.border, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, borderWidth: 1, padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  modalEyebrow: { color: COLORS.rose, fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  modalTitle: {
    color: COLORS.text, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 22, fontWeight: '700', lineHeight: 28, marginTop: 6,
  },
  modalBody: { color: COLORS.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  modalBodyEmphasis: { color: COLORS.text, fontWeight: '800' },
  modalActions: { gap: 10, marginTop: 18 },
  modalAction: {
    backgroundColor: COLORS.panel, borderColor: COLORS.border, borderRadius: 14,
    borderWidth: 1, paddingHorizontal: 15, paddingVertical: 14,
  },
  modalDangerAction: { backgroundColor: COLORS.dangerBackground, borderColor: '#744049' },
  modalActionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  modalDangerTitle: { color: COLORS.danger, fontSize: 15, fontWeight: '800' },
  modalActionText: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  modalCancelButton: { alignItems: 'center', marginTop: 8, paddingVertical: 12 },
  renameInput: {
    backgroundColor: COLORS.background, borderColor: COLORS.accent, borderRadius: 14,
    borderWidth: 1, color: COLORS.text, fontSize: 16, marginTop: 18,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  modalButtonRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 14 },
  modalSecondaryButton: {
    alignItems: 'center', borderColor: COLORS.border, borderRadius: 13,
    borderWidth: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12,
  },
  modalSecondaryButtonText: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  modalPrimaryButton: {
    alignItems: 'center', backgroundColor: COLORS.accent, borderRadius: 13,
    justifyContent: 'center', paddingHorizontal: 17, paddingVertical: 12,
  },
  modalDeleteButton: {
    alignItems: 'center', backgroundColor: COLORS.dangerBackground,
    borderColor: COLORS.danger, borderRadius: 13, borderWidth: 1,
    justifyContent: 'center', paddingHorizontal: 17, paddingVertical: 12,
  },
  modalDeleteButtonText: { color: COLORS.danger, fontSize: 14, fontWeight: '900' },
  floatingButton: {
    alignSelf: 'center', backgroundColor: COLORS.accent, borderRadius: 24, bottom: 20,
    elevation: 7, paddingHorizontal: 20, paddingVertical: 13, position: 'absolute',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  floatingButtonText: { color: '#241804', fontSize: 14, fontWeight: '900' },
  simpleHeader: {
    alignItems: 'center', borderBottomColor: COLORS.border, borderBottomWidth: 1,
    flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 11,
    paddingHorizontal: 10, paddingTop: Platform.OS === 'android' ? 18 : 7,
  },
  headerButton: { minWidth: 78, paddingHorizontal: 8, paddingVertical: 10 },
  headerButtonText: { color: COLORS.accent, fontSize: 14, fontWeight: '800' },
  simpleHeaderTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  headerSpacer: { minWidth: 78 },
  formContent: { padding: 22, paddingBottom: 50 },
  formEyebrow: { color: COLORS.rose, fontSize: 10, fontWeight: '900', letterSpacing: 2.4 },
  formTitle: {
    color: COLORS.text, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 29, fontWeight: '700', lineHeight: 35, marginTop: 6,
  },
  formIntro: { color: COLORS.muted, fontSize: 14, lineHeight: 22, marginBottom: 10, marginTop: 10 },
  fieldLabel: { marginTop: 18 },
  inputLabel: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  fieldHelp: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  formInput: {
    backgroundColor: COLORS.panel, borderColor: COLORS.border, borderRadius: 14,
    borderWidth: 1, color: COLORS.text, fontSize: 15, lineHeight: 22,
    marginTop: 9, paddingHorizontal: 14, paddingVertical: 13,
  },
  settingArea: { minHeight: 125 },
  plotArea: { minHeight: 160 },
  promptNote: {
    alignItems: 'flex-start', backgroundColor: '#251F2C', borderColor: COLORS.border,
    borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 11,
    marginTop: 20, padding: 13,
  },
  promptMark: { color: COLORS.accent, fontSize: 15 },
  promptText: { color: COLORS.muted, flex: 1, fontSize: 12, lineHeight: 18 },
  forgeButton: {
    alignItems: 'center', backgroundColor: COLORS.accent, borderRadius: 16,
    marginTop: 22, paddingHorizontal: 20, paddingVertical: 15,
  },
  settingsContent: { padding: 20, paddingBottom: 50 },
  settingsTitle: {
    color: COLORS.text, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 27, fontWeight: '700', marginTop: 5,
  },
  connectionCard: {
    backgroundColor: COLORS.panel, borderColor: COLORS.border, borderRadius: 18,
    borderWidth: 1, marginTop: 12, padding: 16,
  },
  connectionHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  connectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  connectionDescription: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  connectionOptions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modelOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  modelOption: {
    borderColor: COLORS.border, borderRadius: 13, borderWidth: 1,
    flexBasis: '47%', flexGrow: 1, paddingHorizontal: 12, paddingVertical: 12,
  },
  connectionOption: {
    borderColor: COLORS.border, borderRadius: 13, borderWidth: 1, flex: 1,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  connectionOptionSelected: { backgroundColor: COLORS.accentDark, borderColor: COLORS.accent },
  optionTitle: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  optionSelectedText: { color: COLORS.accent },
  optionText: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  hint: { color: COLORS.muted, flexShrink: 1, fontSize: 11, lineHeight: 16, marginTop: 9 },
  apiKeyEditor: { marginTop: 12 },
  apiKeyInput: {
    backgroundColor: COLORS.background, borderColor: COLORS.border, borderRadius: 12,
    borderWidth: 1, color: COLORS.text, fontSize: 14, paddingHorizontal: 13, paddingVertical: 12,
  },
  apiKeyActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 10 },
  secondaryButton: { borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, padding: 10 },
  secondaryButtonText: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  saveButton: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 10 },
  savedKeyRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 12 },
  savedKeyTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  keyAction: { paddingHorizontal: 5, paddingVertical: 8 },
  keyActionText: { color: COLORS.accent, fontSize: 12, fontWeight: '800' },
  removeKeyText: { color: COLORS.danger, fontSize: 12, fontWeight: '800' },
  settingsError: { backgroundColor: COLORS.dangerBackground, borderRadius: 12, marginTop: 12, padding: 10 },
  notice: { backgroundColor: COLORS.accentDark, borderRadius: 12, marginTop: 12, padding: 10 },
  noticeText: { color: '#FFE0A3', fontSize: 12, lineHeight: 17 },
  privacyCard: { borderColor: COLORS.border, borderRadius: 16, borderWidth: 1, marginTop: 14, padding: 15 },
  privacyTitle: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  privacyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  readerHeader: {
    alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between',
    paddingBottom: 10, paddingHorizontal: 10, paddingTop: Platform.OS === 'android' ? 17 : 6,
  },
  readerHeading: { alignItems: 'center', flex: 1, paddingHorizontal: 4 },
  readerTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', maxWidth: '100%' },
  readerSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  chapterBar: {
    alignItems: 'center', backgroundColor: COLORS.panel, borderColor: COLORS.border,
    borderWidth: 1, paddingVertical: 9,
  },
  chapterBarText: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  messageList: { flexGrow: 1, paddingBottom: 30, paddingHorizontal: 22, paddingTop: 24 },
  messageRow: { marginBottom: 24 },
  narratorPassage: { alignSelf: 'center', maxWidth: 680, width: '100%' },
  userMessageRow: { alignItems: 'center', marginBottom: 28, marginTop: 2 },
  messageBubble: { borderRadius: 18, maxWidth: 520, paddingHorizontal: 18, paddingVertical: 14, width: '91%' },
  userBubble: { backgroundColor: '#3A2631', borderColor: '#704558', borderWidth: 1 },
  messageLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginBottom: 7, textAlign: 'center' },
  userMessageLabel: { color: COLORS.rose },
  openingState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 35 },
  openingMark: { color: COLORS.accent, fontSize: 30, marginBottom: 14 },
  openingTitle: { color: COLORS.text, fontSize: 19, fontWeight: '800' },
  openingText: { color: COLORS.muted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  typingBubble: {
    alignItems: 'center', alignSelf: 'flex-start', backgroundColor: COLORS.raised,
    borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row',
    gap: 9, paddingHorizontal: 15, paddingVertical: 12,
  },
  typingText: { color: COLORS.muted, fontSize: 14 },
  errorBanner: {
    backgroundColor: COLORS.dangerBackground, borderColor: '#744049', borderRadius: 12,
    borderWidth: 1, marginTop: 12, padding: 12,
  },
  errorText: { color: COLORS.danger, fontSize: 13, lineHeight: 18 },
  retryButton: { marginTop: 9, paddingVertical: 4 },
  retryButtonText: { color: COLORS.accent, fontSize: 13, fontWeight: '800' },
  composerShell: {
    alignItems: 'flex-end', backgroundColor: COLORS.panel, borderColor: COLORS.border,
    borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 10,
    marginHorizontal: 12, padding: 8,
  },
  composerInput: {
    color: COLORS.text, flex: 1, fontSize: 16, lineHeight: 22, maxHeight: 130,
    minHeight: 44, paddingHorizontal: 10, paddingVertical: 10, textAlignVertical: 'top',
  },
  sendButton: {
    alignItems: 'center', backgroundColor: COLORS.accent, borderRadius: 16,
    height: 44, justifyContent: 'center', width: 48,
  },
  sendButtonText: { color: '#241804', fontSize: 22, fontWeight: '900' },
  footerText: { color: COLORS.muted, fontSize: 9, paddingBottom: 7, paddingTop: 7, textAlign: 'center' },
});
