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
import { ChatMessage } from './src/types/chat';

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

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi — I'm your WorldForge assistant. Ask me to brainstorm a setting, develop a character, or answer anything else.",
};

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    const timer = setTimeout(
      () => listRef.current?.scrollToEnd({ animated: true }),
      80,
    );
    return () => clearTimeout(timer);
  }, [messages, isSending]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || isSending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    };
    const conversation = [...messages, userMessage];

    setDraft('');
    setError(null);
    setMessages(conversation);
    setIsSending(true);

    try {
      const reply = await sendChat(conversation);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: reply,
        },
      ]);
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

  function handleClear() {
    setMessages([welcomeMessage]);
    setDraft('');
    setError(null);
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>WORLD FORGE</Text>
            <Text style={styles.title}>Chat</Text>
          </View>
          <Pressable
            accessibilityLabel="Clear conversation"
            disabled={messages.length === 1 && !error}
            onPress={handleClear}
            style={({ pressed }) => [
              styles.clearButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.clearButtonText}>New chat</Text>
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
          data={messages}
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
        <Text style={styles.footerText}>AI can make mistakes. Check important information.</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  keyboardView: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: Platform.OS === 'android' ? 18 : 8,
  },
  eyebrow: { color: COLORS.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2.2 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.8 },
  clearButton: {
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  clearButtonText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  buttonPressed: { opacity: 0.7 },
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
