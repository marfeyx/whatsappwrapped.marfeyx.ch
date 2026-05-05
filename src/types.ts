export type AttachmentKind = "image" | "video" | "audio" | "document" | "unknown";

export type Attachment = {
  name: string;
  path: string;
  mime: string;
  kind: AttachmentKind;
  size: number;
  isVoiceMemo: boolean;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  chatTitle: string;
  sourceName: string;
  timestamp: Date | null;
  sender: string | null;
  text: string;
  isSystem: boolean;
  attachments: Attachment[];
};

export type ParsedChat = {
  id: string;
  sourceName: string;
  title: string;
  messages: ChatMessage[];
  participants: string[];
  attachments: Attachment[];
  totalMessages: number;
  includedMessages: number;
};

export type ImportResult = {
  chats: ParsedChat[];
  errors: string[];
};

export type ParticipantStats = {
  name: string;
  messages: number;
  words: number;
  media: number;
  voiceMemos: number;
  responseCount: number;
  totalResponseMs: number;
  averageResponseMs: number | null;
};

export type ChatSummary = {
  id: string;
  title: string;
  sourceName: string;
  messages: number;
  participants: string[];
  media: number;
  firstMessage: Date | null;
  lastMessage: Date | null;
};

export type WrappedStats = {
  generatedAt: Date;
  windowStart: Date;
  windowEnd: Date;
  chats: number;
  skippedMessages: number;
  messages: number;
  yourMessages: number;
  partnerMessages: number;
  systemMessages: number;
  words: number;
  yourWords: number;
  partnerWords: number;
  textMessages: number;
  images: number;
  videos: number;
  documents: number;
  audio: number;
  voiceMemos: number;
  omittedMedia: number;
  activeDays: number;
  busiestDay: { label: string; count: number } | null;
  busiestHour: { hour: number; count: number } | null;
  longestMessage: ChatMessage | null;
  firstMessage: Date | null;
  lastMessage: Date | null;
  participantStats: ParticipantStats[];
  chatSummaries: ChatSummary[];
  dailyActivity: Array<{ label: string; count: number }>;
  hourlyActivity: Array<{ hour: number; count: number }>;
};
