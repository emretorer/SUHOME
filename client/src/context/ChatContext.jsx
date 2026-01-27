import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import {
  fetchUserConversation,
  linkConversationToUser,
  sendUserMessage,
  SUPPORT_BASE,
} from "../services/supportService";

const ChatContext = createContext(undefined);

const seedMessages = [];

const buildMessage = (text, from, attachments = []) => ({
  id: `${from}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
  from,
  text,
  timestamp: Date.now(),
  attachments,
});

const normalizeAttachments = (incoming = [], fallbackFrom) =>
  (incoming || []).map((att) => ({
    id: att.id ?? att.attachment_id ?? `${fallbackFrom}-att-${Math.random().toString(16).slice(2)}`,
    file_name: att.file_name ?? att.filename ?? att.name ?? "Attachment",
    mime_type: att.mime_type ?? att.type ?? "",
    url: att.url ?? att.path ?? att.preview ?? "",
    isLocal: Boolean(att.isLocal),
  }));

const safeStorage = {
  get(key) {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      console.error("Chat storage read failed", error);
      return null;
    }
  },
  set(key, value) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.error("Chat storage write failed", error);
    }
  },
};

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [clientToken] = useState(() => {
    if (typeof window === "undefined") return "guest";
    const key = "chat-client-token";
    const existing = safeStorage.get(key);
    if (existing) return existing;
    const fresh = `g-${crypto.randomUUID?.() ?? Math.random().toString(16).slice(2)}`;
    safeStorage.set(key, fresh);
    return fresh;
  });
  const [serverUserId, setServerUserId] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState(seedMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [syncError, setSyncError] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [chatUnavailable, setChatUnavailable] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const hydrateRef = useRef(null);
  const identityRef = useRef(null);

  const activeUserId = useMemo(
    () => user?.id ?? serverUserId ?? clientToken,
    [serverUserId, user, clientToken]
  );
  const identityEmail = useMemo(
    () => user?.email || `${clientToken}@chat.local`,
    [user, clientToken]
  );
  const identityName = useMemo(() => user?.name || "Guest", [user]);

  useEffect(() => {
    const identityKey = user?.id
      ? `user:${String(user.id)}`
      : `guest:${String(clientToken)}`;
    if (identityRef.current && identityRef.current !== identityKey) {
      setServerUserId(null);
      setConversationId(null);
      setMessages(seedMessages);
      setHasHydrated(false);
      setSyncError(null);
      setLastError(null);
      setChatUnavailable(false);
    }
    identityRef.current = identityKey;
  }, [user?.id, clientToken]);

  const normalizeMessages = useCallback(
    (incoming) =>
      (incoming || []).map((msg) => {
        const senderId = msg.sender_id ?? msg.user_id ?? null;
        const rawFrom =
          msg.from ??
          (senderId && String(senderId) === String(activeUserId) ? "user" : "assistant");
        const resolvedFrom =
          rawFrom === "support"
            ? "assistant"
            : rawFrom === "customer"
            ? "user"
            : rawFrom;

        return {
          id: msg.id ?? msg.message_id ?? `${resolvedFrom}-${msg.timestamp ?? Date.now()}`,
          from: resolvedFrom,
          sender_id: senderId ?? activeUserId,
          text: msg.text ?? msg.message_text ?? "",
          timestamp: msg.timestamp ?? msg.created_at ?? Date.now(),
          attachments: normalizeAttachments(msg.attachments, resolvedFrom),
        };
      }),
    [activeUserId]
  );

  const hydrateFromServer = useCallback(async () => {
    if (chatUnavailable) return;
    setIsLoading((prev) => prev || !hasHydrated);
    try {
      const data = await fetchUserConversation({
        userId: activeUserId,
        email: identityEmail,
        name: identityName,
      });
      if (data?.user_id) {
        setServerUserId(data.user_id);
      }
      setConversationId(data.conversation_id);
      const nextMessages = normalizeMessages(data.messages);
      setMessages((prev) => {
        const incoming = nextMessages.length > 0 ? nextMessages : prev.length > 0 ? prev : seedMessages;
        if (!isOpen) {
          const existingIds = new Set(prev.map((m) => String(m.id)));
          const newSupportMessages = incoming.filter(
            (m) => m.from !== "user" && !existingIds.has(String(m.id))
          ).length;
          if (newSupportMessages > 0) {
            setUnreadCount((val) => val + newSupportMessages);
          }
        }
        return incoming;
      });
      setSyncError(null);
      setLastError(null);
      setHasHydrated(true);
    } catch (error) {
      const isNetworkLike =
        error?.message?.toLowerCase().includes("failed to fetch") ||
        error?.message?.toLowerCase().includes("load failed") ||
        error?.name === "TypeError";
      if (isNetworkLike) {
        setChatUnavailable(true);
      }
      setSyncError(error.message);
      setLastError(error.message);
      setMessages((prev) => prev);
      setHasHydrated(true);
    } finally {
      setIsLoading(false);
    }
  }, [activeUserId, isOpen, normalizeMessages, chatUnavailable, hasHydrated]);

  useEffect(() => {
    hydrateFromServer();
  }, [hydrateFromServer]);

  useEffect(() => {
    hydrateRef.current = hydrateFromServer;
  }, [hydrateFromServer]);

  useEffect(() => {
    if (!conversationId || !isOpen || chatUnavailable || isStreaming) return undefined;
    const interval = setInterval(() => {
      hydrateFromServer();
    }, 4500);
    return () => clearInterval(interval);
  }, [conversationId, hydrateFromServer, isOpen, chatUnavailable, isStreaming]);

  useEffect(() => {
    if (!conversationId || chatUnavailable) return undefined;
    const streamUrl = `${SUPPORT_BASE}/conversations/${conversationId}/stream`;
    const source = new EventSource(streamUrl);

    const handleUpdate = () => {
      hydrateRef.current?.();
    };

    source.addEventListener("support-message", handleUpdate);
    source.addEventListener("ready", handleUpdate);
    source.onopen = () => setIsStreaming(true);
    source.onerror = () => {
      setIsStreaming(false);
    };

    return () => {
      source.close();
      setIsStreaming(false);
    };
  }, [conversationId, chatUnavailable]);

  useEffect(() => {
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    const numericUserId = Number(user.id);
    if (!Number.isFinite(numericUserId)) return;
    if (serverUserId && Number(serverUserId) === numericUserId) return;

    linkConversationToUser({
      conversationId,
      userId: numericUserId,
      email: user?.email,
      name: user?.name,
    })
      .then((data) => {
        if (data?.user_id) {
          setServerUserId(data.user_id);
        }
      })
      .catch((error) => {
        console.error("Support conversation link failed", error);
      });
  }, [conversationId, user?.id, user?.email, user?.name, serverUserId]);

  const sendMessage = (input) => {
    const payload = typeof input === "string" ? { text: input } : input || {};
    const files = Array.isArray(payload.attachments) ? payload.attachments : [];
    const trimmed = payload.text && typeof payload.text === "string" ? payload.text.trim() : "";
    if (!trimmed && files.length === 0) return;

    const optimisticAttachments = files.map((file) => ({
      id: `local-${file.name}-${Math.random().toString(16).slice(2)}`,
      file_name: file.name,
      mime_type: file.type,
      url: URL.createObjectURL(file),
      isLocal: true,
    }));

    const optimistic = buildMessage(trimmed || "Gönderiliyor...", "user", optimisticAttachments);
    setMessages((prev) => [...prev, optimistic]);
    setIsSending(true);

    sendUserMessage({
      userId: activeUserId,
      text: trimmed,
      email: identityEmail,
      name: identityName,
      attachments: files,
    })
      .then((serverPayload) => {
        if (serverPayload?.conversation_id) {
          setConversationId(serverPayload.conversation_id);
        }
        if (serverPayload?.message) {
          const [confirmed] = normalizeMessages([serverPayload.message]);
          setMessages((prev) =>
            prev.map((msg) => (msg.id === optimistic.id ? confirmed : msg))
          );
        }
        if (serverPayload?.user_id) {
          setServerUserId(serverPayload.user_id);
        }
        setSyncError(null);
      })
      .catch((error) => {
        console.error("Support message send failed", error);
        setSyncError(error.message);
        setLastError(error.message);
        setMessages((prev) => prev.filter((msg) => msg.id !== optimistic.id));
      })
      .finally(() => setIsSending(false));
  };

  const openChat = () => setIsOpen(true);
  const closeChat = () => setIsOpen(false);
  const toggleChat = () => setIsOpen((prev) => !prev);

  const value = useMemo(
    () => ({
      messages,
      isOpen,
      isSending,
      isLoading,
      unreadCount,
      conversationId,
      syncError,
      lastError,
      hasHydrated,
      sendMessage,
      openChat,
      closeChat,
      toggleChat,
    }),
    [
      messages,
      isOpen,
      isSending,
      isLoading,
      unreadCount,
      conversationId,
      syncError,
      lastError,
      hasHydrated,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}
