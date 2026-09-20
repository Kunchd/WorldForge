import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

import { sendChat } from './src/lib/chatApi';
import { loadChats, saveChats } from './src/lib/chatStorage';
import { Chat, ChatMessage } from './src/types/chat';

const COLORS = {
  background: '#0B0F14',
  panel: '#121821',
  panelRaised: '#19212C',
  border: '#263241',
  text: '#F4F7FB',
  muted: '#92A0B3',
  accent: '#7BE0B8',
  accentDark: '#123D32',
  danger: '#FFB4AB',
  dangerBackground: '#3A1D20',
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createWelcomeMessage(): ChatMessage {
  return {
    id: createId('welcome'),
    role: 'assistant',
    content:
      "Hi — I'm your WorldForge assistant. Ask me to brainstorm a setting, develop a character, or answer anything else.",
  };
}

function createChat(): Chat {
  const timestamp = new Date().toISOString();
  return {
    id: createId('chat'),
    title: 'New chat',
    messages: [createWelcomeMessage()],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function titleFromMessage(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 44
    ? `${normalized.slice(0, 44).trimEnd()}…`
    : normalized;
}

function formatUpdatedAt(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function previewForChat(chat: Chat) {
  if (chat.messages.length <= 1) return 'No messages yet';
  const message = chat.messages[chat.messages.length - 1];
  const prefix = message.role === 'user' ? 'You: ' : '';
  return `${prefix}${message.content.replace(/\s+/g, ' ')}`;
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [persistenceVersion, setPersistenceVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const storageWriteQueue = useRef<Promise<void>>(Promise.resolve());

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;

  useEffect(() => {
    let isMounted = true;

    loadChats()
      .then((storedChats) => {
        if (isMounted) setChats(storedChats);
      })
      .catch((caughtError: unknown) => {
        if (!isMounted) return;
        setPersistenceError(
          caughtError instanceof Error
            ? `Could not load saved chats: ${caughtError.message}`
            : 'Could not load saved chats.',
        );
      })
      .finally(() => {
        if (isMounted) setIsHydrating(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isHydrating || persistenceVersion === 0) return;

    storageWriteQueue.current = storageWriteQueue.current
      .catch(() => undefined)
      .then(() => saveChats(chats))
      .then(() => setPersistenceError(null))
      .catch((caughtError: unknown) => {
        setPersistenceError(
          caughtError instanceof Error
            ? `Could not save chats: ${caughtError.message}`
            : 'Could not save chats.',
        );
      });
  }, [chats, isHydrating, persistenceVersion]);

  useEffect(() => {
    if (!activeChat) return;
    const timer = setTimeout(
      () => listRef.current?.scrollToEnd({ animated: true }),
      80,
    );
    return () => clearTimeout(timer);
  }, [activeChat?.messages, isSending]);

  function updateChats(updater: (current: Chat[]) => Chat[]) {
    setChats(updater);
    setPersistenceVersion((current) => current + 1);
  }

  function updateChat(chatId: string, updater: (chat: Chat) => Chat) {
    updateChats((current) =>
      current
        .map((chat) => (chat.id === chatId ? updater(chat) : chat))
        .sort((first, second) =>
          second.updatedAt.localeCompare(first.updatedAt),
        ),
    );
  }

  function handleNewChat() {
    if (isSending) return;
    const chat = createChat();
    updateChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setDraft('');
    setError(null);
  }

  function handleOpenChat(chatId: string) {
    if (isSending) return;
    setActiveChatId(chatId);
    setDraft('');
    setError(null);
  }

  function handleGoHome() {
    if (isSending) return;
    setActiveChatId(null);
    setDraft('');
    setError(null);
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content || isSending || !activeChat) return;

    const chatId = activeChat.id;
    const userMessage: ChatMessage = {
      id: createId('user'),
      role: 'user',
      content,
    };
    const conversation = [...activeChat.messages, userMessage];
    const updatedAt = new Date().toISOString();

    setDraft('');
    setError(null);
    updateChat(chatId, (chat) => ({
      ...chat,
      title:
        chat.title === 'New chat' ? titleFromMessage(content) : chat.title,
      messages: conversation,
      updatedAt,
    }));
    setIsSending(true);

    try {
      const reply = await sendChat(conversation);
      updateChat(chatId, (chat) => ({
        ...chat,
        messages: [
          ...chat.messages,
          {
            id: createId('assistant'),
            role: 'assistant',
            content: reply,
          },
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

  function renderHome() {
    return (
      <View style={styles.screen}>
        <View style={styles.homeHeader}>
          <View style={styles.brandBlock}>
            <Text style={styles.eyebrow}>WORLD FORGE</Text>
            <Text style={styles.homeTitle}>Your chats</Text>
            <Text style={styles.homeSubtitle}>
              Continue building a world or start somewhere new.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Create a new chat"
            onPress={handleNewChat}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>+ New chat</Text>
          </Pressable>
        </View>

        {persistenceError ? (
          <View style={[styles.errorBanner, styles.homeError]}>
            <Text style={styles.errorText}>{persistenceError}</Text>
          </View>
        ) : null}

        {chats.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✦</Text>
            <Text style={styles.emptyTitle}>Forge your first conversation</Text>
            <Text style={styles.emptyText}>
              Your chats will be saved on this device so you can return to them.
            </Text>
            <Pressable
              accessibilityLabel="Start your first chat"
              onPress={handleNewChat}
              style={({ pressed }) => [
                styles.emptyButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Start a chat</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.chatList}
            data={chats}
            keyExtractor={(chat) => chat.id}
            renderItem={({ item }) => (
              <Pressable
                accessibilityLabel={`Open ${item.title}`}
                onPress={() => handleOpenChat(item.id)}
                style={({ pressed }) => [
                  styles.chatCard,
                  pressed && styles.chatCardPressed,
                ]}
              >
                <View style={styles.chatCardTopRow}>
                  <Text numberOfLines={1} style={styles.chatCardTitle}>
                    {item.title}
                  </Text>
                  <Text style={styles.chatCardDate}>
                    {formatUpdatedAt(item.updatedAt)}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.chatCardPreview}>
                  {previewForChat(item)}
                </Text>
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  function renderChat() {
    if (!activeChat) return null;

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to chats"
            disabled={isSending}
            onPress={handleGoHome}
            style={({ pressed }) => [
              styles.headerButton,
              isSending && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.headerButtonText}>‹ Chats</Text>
          </Pressable>
          <View style={styles.chatHeading}>
            <Text numberOfLines={1} style={styles.chatTitle}>
              {activeChat.title}
            </Text>
            <Text style={styles.chatHeadingSubtitle}>OpenAI</Text>
          </View>
          <Pressable
            accessibilityLabel="Create a new chat"
            disabled={isSending}
            onPress={handleNewChat}
            style={({ pressed }) => [
              styles.headerButton,
              isSending && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.headerButtonText}>New</Text>
          </Pressable>
        </View>

        <View style={styles.providerRow}>
          <View style={styles.statusDot} />
          <Text style={styles.providerText}>OpenAI</Text>
          <Text style={styles.providerModel}>via your local proxy</Text>
        </View>

        <FlatList
          ref={listRef}
          contentContainerStyle={styles.messageList}
          data={activeChat.messages}
          keyExtractor={(message) => message.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageRow,
                item.role === 'user' && styles.userMessageRow,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  item.role === 'user'
                    ? styles.userBubble
                    : styles.assistantBubble,
                ]}
              >
                <Text
                  style={[
                    styles.messageLabel,
                    item.role === 'user' && styles.userMessageLabel,
                  ]}
                >
                  {item.role === 'user' ? 'YOU' : 'ASSISTANT'}
                </Text>
                <Text style={styles.messageText}>{item.content}</Text>
              </View>
            </View>
          )}
          ListFooterComponent={
            <>
              {isSending ? (
                <View style={styles.typingBubble}>
                  <ActivityIndicator color={COLORS.accent} size="small" />
                  <Text style={styles.typingText}>Thinking…</Text>
                </View>
              ) : null}
              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              {persistenceError ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{persistenceError}</Text>
                </View>
              ) : null}
            </>
          }
        />

        <View style={styles.composerShell}>
          <TextInput
            accessibilityLabel="Message"
            editable={!isSending}
            maxLength={4000}
            multiline
            onChangeText={setDraft}
            onSubmitEditing={handleSend}
            placeholder="Message WorldForge…"
            placeholderTextColor={COLORS.muted}
            returnKeyType="send"
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityLabel="Send message"
            disabled={!draft.trim() || isSending}
            onPress={handleSend}
            style={({ pressed }) => [
              styles.sendButton,
              (!draft.trim() || isSending) && styles.sendButtonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
        <Text style={styles.footerText}>
          AI can make mistakes. Check important information.
        </Text>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        {isHydrating ? (
          <View style={styles.loadingScreen}>
            <ActivityIndicator color={COLORS.accent} size="large" />
            <Text style={styles.loadingText}>Loading your chats…</Text>
          </View>
        ) : activeChat ? (
          renderChat()
        ) : (
          renderHome()
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  screen: { flex: 1 },
  keyboardView: { flex: 1 },
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  loadingText: { color: COLORS.muted, fontSize: 14 },
  homeHeader: {
    alignItems: 'flex-end',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    paddingBottom: 22,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 24 : 14,
  },
  brandBlock: { flex: 1 },
  eyebrow: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.2,
  },
  homeTitle: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: 3,
  },
  homeSubtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: { color: '#071510', fontSize: 14, fontWeight: '800' },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.4 },
  homeError: { marginHorizontal: 16, marginTop: 16 },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 38,
  },
  emptyIcon: { color: COLORS.accent, fontSize: 38, marginBottom: 15 },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 9,
    maxWidth: 330,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    marginTop: 22,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  chatList: { padding: 16, paddingBottom: 30 },
  chatCard: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  chatCardPressed: {
    backgroundColor: COLORS.panelRaised,
    borderColor: '#3A4C61',
  },
  chatCardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  chatCardTitle: { color: COLORS.text, flex: 1, fontSize: 17, fontWeight: '700' },
  chatCardDate: { color: COLORS.muted, fontSize: 11 },
  chatCardPreview: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'android' ? 18 : 8,
  },
  headerButton: {
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  headerButtonText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
  chatHeading: { alignItems: 'center', flex: 1, paddingHorizontal: 6 },
  chatTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700', maxWidth: '100%' },
  chatHeadingSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  providerRow: {
    alignItems: 'center',
    backgroundColor: COLORS.panel,
    borderBottomColor: COLORS.border,
    borderTopColor: COLORS.border,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  statusDot: {
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    height: 8,
    marginRight: 8,
    width: 8,
  },
  providerText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  providerModel: { color: COLORS.muted, fontSize: 12, marginLeft: 7 },
  messageList: { flexGrow: 1, padding: 16, paddingBottom: 24 },
  messageRow: { alignItems: 'flex-start', marginBottom: 14 },
  userMessageRow: { alignItems: 'flex-end' },
  messageBubble: {
    borderRadius: 18,
    maxWidth: '88%',
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  assistantBubble: {
    backgroundColor: COLORS.panelRaised,
    borderColor: COLORS.border,
    borderTopLeftRadius: 5,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: COLORS.accentDark,
    borderColor: '#236954',
    borderTopRightRadius: 5,
    borderWidth: 1,
  },
  messageLabel: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  userMessageLabel: { color: '#9BF2CF' },
  messageText: { color: COLORS.text, fontSize: 16, lineHeight: 23 },
  typingBubble: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.panelRaised,
    borderColor: COLORS.border,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  typingText: { color: COLORS.muted, fontSize: 14 },
  errorBanner: {
    backgroundColor: COLORS.dangerBackground,
    borderColor: '#744049',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  errorText: { color: COLORS.danger, fontSize: 13, lineHeight: 18 },
  composerShell: {
    alignItems: 'flex-end',
    backgroundColor: COLORS.panel,
    borderColor: COLORS.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 12,
    padding: 8,
  },
  input: {
    color: COLORS.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 130,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
  },
  sendButtonDisabled: { opacity: 0.35 },
  sendButtonText: { color: '#071510', fontSize: 14, fontWeight: '800' },
  footerText: {
    color: COLORS.muted,
    fontSize: 10,
    paddingBottom: 8,
    paddingTop: 7,
    textAlign: 'center',
  },
});
