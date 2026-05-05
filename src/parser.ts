import JSZip from "jszip";
import type { Attachment, AttachmentKind, ChatMessage, ImportResult, ParsedChat } from "./types";

const textExtensions = new Set([".txt"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".bmp"]);
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".3gp", ".avi", ".webm"]);
const audioExtensions = new Set([".opus", ".ogg", ".mp3", ".m4a", ".aac", ".wav", ".amr"]);
const omittedMediaPattern = /<(?:attached|attachment|media|medium|anhang)\s+omitted>|<(?:attached|attachment|media|medium|anhang):/i;

const messagePatterns = [
  /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]\s([^:]+?):\s([\s\S]*)$/i,
  /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\s-\s([^:]+?):\s([\s\S]*)$/i,
];

const systemPatterns = [
  /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]\s([\s\S]*)$/i,
  /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\s-\s([\s\S]*)$/i,
];

export async function parseWhatsAppFiles(files: File[], windowStart: Date, windowEnd: Date): Promise<ImportResult> {
  const chats: ParsedChat[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      chats.push(await parseWhatsAppZip(file, windowStart, windowEnd));
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : "Could not parse this file."}`);
    }
  }

  return { chats, errors };
}

async function parseWhatsAppZip(file: File, windowStart: Date, windowEnd: Date): Promise<ParsedChat> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const textFile = pickChatTextFile(entries.map((entry) => entry.name));

  if (!textFile) {
    throw new Error("No WhatsApp chat .txt file was found.");
  }

  const attachments = entries
    .filter((entry) => !textExtensions.has(getExtension(entry.name)))
    .map((entry) => {
      const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
      return buildAttachment(entry.name, size);
    });

  const text = await zip.file(textFile)!.async("string");
  const chatId = `${file.name}-${file.size}-${file.lastModified}`;
  const title = inferChatTitle(textFile, file.name);
  const allMessages = parseChatText(text, attachments, chatId, title, file.name);
  const messages = allMessages.filter((message) => {
    const time = message.timestamp?.getTime();
    return typeof time === "number" && time >= windowStart.getTime() && time <= windowEnd.getTime();
  });
  const participants = Array.from(
    new Set(messages.map((message) => message.sender).filter((sender): sender is string => Boolean(sender))),
  ).sort((a, b) => a.localeCompare(b));
  const usedAttachmentPaths = new Set(messages.flatMap((message) => message.attachments.map((attachment) => attachment.path)));

  return {
    id: chatId,
    sourceName: file.name,
    title,
    messages,
    participants,
    attachments: attachments.filter((attachment) => usedAttachmentPaths.has(attachment.path)),
    totalMessages: allMessages.length,
    includedMessages: messages.length,
  };
}

function parseChatText(
  text: string,
  attachments: Attachment[],
  chatId: string,
  chatTitle: string,
  sourceName: string,
): ChatMessage[] {
  const byName = new Map(attachments.map((attachment) => [attachment.name.toLowerCase(), attachment]));
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const messages: ChatMessage[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = parseLineStart(line);

    if (parsed) {
      messages.push({
        id: `${chatId}-${messages.length}`,
        chatId,
        chatTitle,
        sourceName,
        timestamp: parsed.timestamp,
        sender: parsed.sender,
        text: parsed.text,
        isSystem: !parsed.sender,
        attachments: [],
      });
      continue;
    }

    const previous = messages[messages.length - 1];
    if (previous) previous.text = `${previous.text}\n${cleanInvisible(line)}`;
  }

  for (const message of messages) {
    message.attachments = findAttachments(message.text, byName);
  }

  return messages;
}

function parseLineStart(line: string): { timestamp: Date | null; sender: string | null; text: string } | null {
  const cleanedLine = cleanInvisible(line).trimStart();

  for (const pattern of messagePatterns) {
    const match = cleanedLine.match(pattern);
    if (match) {
      return {
        timestamp: buildDate(match[1], match[2], match[3], match[4], match[5], match[6], match[7]),
        sender: cleanInvisible(match[8]).trim(),
        text: cleanInvisible(match[9]).trim(),
      };
    }
  }

  for (const pattern of systemPatterns) {
    const match = cleanedLine.match(pattern);
    if (match) {
      return {
        timestamp: buildDate(match[1], match[2], match[3], match[4], match[5], match[6], match[7]),
        sender: null,
        text: cleanInvisible(match[8]).trim(),
      };
    }
  }

  return null;
}

function buildDate(
  dayText: string,
  monthText: string,
  yearText: string,
  hourText: string,
  minuteText: string,
  secondText = "0",
  meridiem?: string,
): Date | null {
  let year = Number(yearText);
  let hour = Number(hourText);

  if (year < 100) year += year >= 70 ? 1900 : 2000;
  if (meridiem) {
    const upper = meridiem.toUpperCase();
    if (upper === "PM" && hour < 12) hour += 12;
    if (upper === "AM" && hour === 12) hour = 0;
  }

  const date = new Date(year, Number(monthText) - 1, Number(dayText), hour, Number(minuteText), Number(secondText || "0"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function findAttachments(text: string, byName: Map<string, Attachment>): Attachment[] {
  const matches = new Map<string, Attachment>();
  const lowerText = text.toLowerCase();

  for (const [name, attachment] of byName) {
    if (lowerText.includes(name)) matches.set(attachment.path, attachment);
  }

  const explicit = text.match(/<(?:attached|attachment|anhang|media|medium):\s*([^>]+)>/gi) ?? [];
  for (const token of explicit) {
    const name = token.replace(/<(?:attached|attachment|anhang|media|medium):\s*/i, "").replace(/>$/, "").trim().toLowerCase();
    const attachment = byName.get(name);
    if (attachment) matches.set(attachment.path, attachment);
  }

  return Array.from(matches.values());
}

function buildAttachment(path: string, size: number): Attachment {
  const mime = getMimeType(path);
  const name = getBaseName(path);
  const kind = getAttachmentKind(path, mime);

  return {
    name,
    path,
    mime,
    kind,
    size,
    isVoiceMemo: kind === "audio" && /ptt|voice|audio|opus|\.amr$/i.test(name),
  };
}

export function isOmittedMediaMessage(text: string) {
  return omittedMediaPattern.test(text);
}

function pickChatTextFile(paths: string[]): string | null {
  const textFiles = paths.filter((path) => textExtensions.has(getExtension(path)));
  return (
    textFiles.find((path) => getBaseName(path).toLowerCase() === "_chat.txt") ??
    textFiles.find((path) => /chat/i.test(getBaseName(path))) ??
    textFiles[0] ??
    null
  );
}

function inferChatTitle(textPath: string, fileName: string) {
  const base = getBaseName(textPath).replace(/_chat/i, "").replace(/\.txt$/i, "").trim();
  return base || fileName.replace(/\.zip$/i, "");
}

function getAttachmentKind(path: string, mime: string): AttachmentKind {
  const extension = getExtension(path);
  if (mime.startsWith("image/") || imageExtensions.has(extension)) return "image";
  if (mime.startsWith("video/") || videoExtensions.has(extension)) return "video";
  if (mime.startsWith("audio/") || audioExtensions.has(extension)) return "audio";
  if (extension) return "document";
  return "unknown";
}

function getMimeType(path: string): string {
  const known: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".bmp": "image/bmp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/mp4",
    ".3gp": "video/3gpp",
    ".webm": "video/webm",
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
    ".amr": "audio/amr",
    ".pdf": "application/pdf",
  };
  return known[getExtension(path)] ?? "application/octet-stream";
}

function getExtension(path: string) {
  const match = path.toLowerCase().match(/\.[^.\\/]+$/);
  return match?.[0] ?? "";
}

function getBaseName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

function cleanInvisible(value: string) {
  return value.replace(/[\u200e\u200f\u202a-\u202e]/g, "");
}
