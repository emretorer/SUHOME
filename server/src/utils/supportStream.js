const conversationStreams = new Map();
const inboxStreams = new Set();

const KEEP_ALIVE_MS = 25000;
const RETRY_MS = 10000;

function startStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  res.write(`retry: ${RETRY_MS}\n\n`);

  const keepAlive = setInterval(() => {
    if (res.writableEnded) return;
    res.write(": ping\n\n");
  }, KEEP_ALIVE_MS);

  return () => clearInterval(keepAlive);
}

function sendEvent(res, event, payload) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function registerConversationStream(conversationId, req, res) {
  const key = String(conversationId);
  const streams = conversationStreams.get(key) || new Set();
  conversationStreams.set(key, streams);

  const stop = startStream(res);
  streams.add(res);
  sendEvent(res, "ready", { conversation_id: conversationId });

  req.on("close", () => {
    stop();
    streams.delete(res);
    if (streams.size === 0) {
      conversationStreams.delete(key);
    }
  });
}

export function registerInboxStream(req, res) {
  const stop = startStream(res);
  inboxStreams.add(res);
  sendEvent(res, "ready", { scope: "inbox" });

  req.on("close", () => {
    stop();
    inboxStreams.delete(res);
  });
}

export function broadcastConversationMessage(conversationId, message) {
  const streams = conversationStreams.get(String(conversationId));
  if (!streams) return;
  streams.forEach((res) => {
    sendEvent(res, "support-message", { conversation_id: conversationId, message });
  });
}

export function broadcastInboxUpdate(payload) {
  inboxStreams.forEach((res) => {
    sendEvent(res, "inbox-update", payload);
  });
}
