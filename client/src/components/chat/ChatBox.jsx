import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/chat.css";
import { useChat } from "../../context/ChatContext";

const formatTime = (value) =>
  new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";

function resolveUploadUrl(url) {
  if (!url) return url;
  if (url.startsWith("/uploads")) return `${API_BASE}${url}`;
  return url;
}

function ChatBox() {
  const {
    messages,
    sendMessage,
    isSending,
    isLoading,
    syncError,
    lastError,
    hasHydrated,
    closeChat,
  } = useChat();
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const endRef = useRef(null);
  const fileInputRef = useRef(null);

  const hasMessages = useMemo(() => messages?.length > 0, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const handleSend = (text = draft) => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    sendMessage({ text, attachments });
    setDraft("");
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSend();
  };

  const handleFilesSelected = (e) => {
    const selected = Array.from(e.target.files || []).slice(0, 3);
    setAttachments(selected);
  };

  const handleRemoveAttachment = (name) => {
    setAttachments((prev) => prev.filter((file) => file.name !== name));
    if (fileInputRef.current && fileInputRef.current.files?.length) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="chat-box">
      <div className="chat-header">
        <div className="chat-title">
          <div className="chat-status-dot" />
          <div>
            <p className="chat-label">Live Support</p>
            <p className="chat-subtitle">We usually reply within a few minutes</p>
          </div>
        </div>
        <button className="close-btn" onClick={closeChat} aria-label="Close chat">
          ✕
        </button>
      </div>

      <div className="chat-messages">
        {isLoading && !hasHydrated && <p className="placeholder">Connecting you to support...</p>}
        {!isLoading && !hasMessages ? (
          <p className="placeholder">Type your question and we’ll jump in to help.</p>
        ) : (
          messages.map((msg) => {
            const alignment = msg.from === "user" ? "user" : "assistant";
            return (
              <div key={msg.id} className={`message-row ${alignment}`}>
                <div className="avatar">{alignment === "assistant" ? "🤝" : "🙂"}</div>
                <div className="bubble">
                  <p>{msg.text}</p>
                  {msg.attachments?.length > 0 && (
                    <div className="attachment-list">
                      {msg.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={resolveUploadUrl(att.url)}
                          target="_blank"
                          rel="noreferrer"
                          download={att.file_name}
                          className="attachment-chip"
                        >
                          📎 {att.file_name}
                        </a>
                      ))}
                    </div>
                  )}
                  <span className="meta">{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            );
          })
        )}

        {isSending && (
          <div className="message-row assistant">
            <div className="avatar">🤖</div>
            <div className="bubble typing">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {(syncError || lastError) && (
        <div style={{ padding: "8px 12px", color: "#b91c1c", fontSize: "0.9rem" }}>
          {syncError || lastError}
        </div>
      )}

      <form className="chat-input" onSubmit={handleSubmit}>
        <label className="attach-btn" title="Dosya ekle">
          📎
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt"
            onChange={handleFilesSelected}
            style={{ display: "none" }}
          />
        </label>
        <input
          type="text"
          placeholder="Write a message..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isSending}
        />
        {attachments.length > 0 && (
          <div className="selected-attachments">
            {attachments.map((file) => (
              <span key={file.name} className="attachment-chip removable">
                {file.name}
                <button type="button" onClick={() => handleRemoveAttachment(file.name)} aria-label="Remove attachment">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <button type="submit" disabled={isSending}>
          {isSending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}

export default ChatBox;
