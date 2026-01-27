import ChatBox from "./ChatBox";
import "../../styles/chat.css";
import { useChat } from "../../context/ChatContext";

function ChatButton() {
  const { isOpen, toggleChat, unreadCount } = useChat();

  return (
    <>
      {isOpen && <ChatBox />}
      <button
        className={`chat-button ${isOpen ? "open" : ""}`}
        onClick={toggleChat}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? "✕" : "💬"}
        {unreadCount > 0 && <span className="chat-badge">{unreadCount}</span>}
      </button>
    </>
  );
}

export default ChatButton;
