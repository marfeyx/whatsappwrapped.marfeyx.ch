import type { ChatMessage, ChatSummary, ParsedChat, ParticipantStats, WrappedStats } from "./types";

const maxResponseGapMs = 16 * 60 * 60 * 1000;
const omittedMediaPattern = /<(?:attached|attachment|media|medium|anhang)\s+omitted>|<(?:attached|attachment|media|medium|anhang):/i;

export function getRollingYearWindow(now = new Date()) {
  const windowEnd = now;
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 365);
  return { windowStart, windowEnd };
}

export function mergeChats(existing: ParsedChat[], incoming: ParsedChat[]) {
  const byId = new Map(existing.map((chat) => [chat.id, chat]));
  for (const chat of incoming) byId.set(chat.id, chat);
  return Array.from(byId.values()).sort((a, b) => a.title.localeCompare(b.title));
}

export function getAllParticipants(chats: ParsedChat[]) {
  return Array.from(new Set(chats.flatMap((chat) => chat.participants))).sort((a, b) => a.localeCompare(b));
}

export function calculateWrappedStats(chats: ParsedChat[], selfAliases: Set<string>, now = new Date()): WrappedStats {
  const { windowStart, windowEnd } = getRollingYearWindow(now);
  const rawMessages = chats.flatMap((chat) => chat.messages);
  const messages = dedupeMessages(rawMessages).sort((a, b) => (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0));
  const participantStats = new Map<string, ParticipantStats>();
  const daily = new Map<string, number>();
  const hourly = new Map<number, number>();
  const chatSummaries = chats.map(getChatSummary).sort((a, b) => b.messages - a.messages);
  let longestMessage: ChatMessage | null = null;

  const stats: WrappedStats = {
    generatedAt: now,
    windowStart,
    windowEnd,
    chats: chats.length,
    skippedMessages: chats.reduce((total, chat) => total + Math.max(0, chat.totalMessages - chat.includedMessages), 0),
    messages: messages.length,
    yourMessages: 0,
    partnerMessages: 0,
    systemMessages: 0,
    words: 0,
    yourWords: 0,
    partnerWords: 0,
    textMessages: 0,
    images: 0,
    videos: 0,
    documents: 0,
    audio: 0,
    voiceMemos: 0,
    omittedMedia: 0,
    activeDays: 0,
    busiestDay: null,
    busiestHour: null,
    longestMessage: null,
    firstMessage: messages[0]?.timestamp ?? null,
    lastMessage: messages[messages.length - 1]?.timestamp ?? null,
    participantStats: [],
    chatSummaries,
    dailyActivity: [],
    hourlyActivity: [],
  };

  for (const message of messages) {
    if (message.timestamp) {
      const day = formatDayKey(message.timestamp);
      daily.set(day, (daily.get(day) ?? 0) + 1);
      const hour = message.timestamp.getHours();
      hourly.set(hour, (hourly.get(hour) ?? 0) + 1);
    }

    if (message.isSystem || !message.sender) {
      stats.systemMessages += 1;
      continue;
    }

    const words = countWords(cleanMessageText(message.text));
    const isSelf = selfAliases.has(message.sender);
    const participant = getParticipantBucket(participantStats, message.sender);
    participant.messages += 1;
    participant.words += words;
    participant.media += message.attachments.length;
    participant.voiceMemos += message.attachments.filter((attachment) => attachment.isVoiceMemo).length;

    stats.words += words;
    stats.textMessages += cleanMessageText(message.text) ? 1 : 0;
    stats.images += message.attachments.filter((attachment) => attachment.kind === "image").length;
    stats.videos += message.attachments.filter((attachment) => attachment.kind === "video").length;
    stats.audio += message.attachments.filter((attachment) => attachment.kind === "audio").length;
    stats.documents += message.attachments.filter((attachment) => attachment.kind === "document" || attachment.kind === "unknown").length;
    stats.voiceMemos += message.attachments.filter((attachment) => attachment.isVoiceMemo).length;
    stats.omittedMedia += isOmittedMediaMessage(message.text) ? 1 : 0;

    if (isSelf) {
      stats.yourMessages += 1;
      stats.yourWords += words;
    } else {
      stats.partnerMessages += 1;
      stats.partnerWords += words;
    }

    if (!longestMessage || cleanMessageText(message.text).length > cleanMessageText(longestMessage.text).length) {
      longestMessage = message;
    }
  }

  addResponseTimes(messages, participantStats);

  const dailyActivity = Array.from(daily.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({ hour, count: hourly.get(hour) ?? 0 }));

  stats.activeDays = daily.size;
  stats.busiestDay = [...dailyActivity].sort((a, b) => b.count - a.count)[0] ?? null;
  stats.busiestHour = [...hourlyActivity].sort((a, b) => b.count - a.count)[0] ?? null;
  stats.longestMessage = longestMessage;
  stats.participantStats = Array.from(participantStats.values()).sort((a, b) => b.messages - a.messages);
  stats.dailyActivity = dailyActivity;
  stats.hourlyActivity = hourlyActivity;

  return stats;
}

function addResponseTimes(messages: ChatMessage[], byParticipant: Map<string, ParticipantStats>) {
  let previous: ChatMessage | null = null;

  for (const message of messages) {
    if (message.isSystem || !message.sender || !message.timestamp) continue;
    if (previous?.sender && previous.timestamp && previous.sender !== message.sender) {
      const responseMs = message.timestamp.getTime() - previous.timestamp.getTime();
      const bucket = byParticipant.get(message.sender);
      if (bucket && responseMs >= 0 && responseMs <= maxResponseGapMs) {
        bucket.responseCount += 1;
        bucket.totalResponseMs += responseMs;
        bucket.averageResponseMs = Math.round(bucket.totalResponseMs / bucket.responseCount);
      }
    }
    previous = message;
  }
}

function dedupeMessages(messages: ChatMessage[]) {
  const seen = new Set<string>();
  const unique: ChatMessage[] = [];

  for (const message of messages) {
    const key = [message.timestamp?.getTime() ?? "none", message.sender ?? "system", cleanMessageText(message.text)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(message);
  }

  return unique;
}

function getParticipantBucket(map: Map<string, ParticipantStats>, name: string) {
  const existing = map.get(name);
  if (existing) return existing;
  const created: ParticipantStats = {
    name,
    messages: 0,
    words: 0,
    media: 0,
    voiceMemos: 0,
    responseCount: 0,
    totalResponseMs: 0,
    averageResponseMs: null,
  };
  map.set(name, created);
  return created;
}

function getChatSummary(chat: ParsedChat): ChatSummary {
  const timestamps = chat.messages
    .map((message) => message.timestamp)
    .filter((timestamp): timestamp is Date => Boolean(timestamp))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    id: chat.id,
    title: chat.title,
    sourceName: chat.sourceName,
    messages: chat.messages.length,
    participants: chat.participants,
    media: chat.attachments.length,
    firstMessage: timestamps[0] ?? null,
    lastMessage: timestamps[timestamps.length - 1] ?? null,
  };
}

function cleanMessageText(text: string) {
  return text
    .replace(/<[^>]*(?:attached|attachment|media|medium|omitted|anhang)[^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isOmittedMediaMessage(text: string) {
  return omittedMediaPattern.test(text);
}

function countWords(text: string) {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function formatDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
