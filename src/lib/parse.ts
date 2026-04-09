// src/lib/parse.ts
import Parse from 'parse';

const APP_ID = process.env.NEXT_PUBLIC_BACK4APP_APP_ID || '';
const JS_KEY = process.env.NEXT_PUBLIC_BACK4APP_JS_KEY || '';
const SERVER_URL = process.env.NEXT_PUBLIC_BACK4APP_SERVER_URL || 'https://parseapi.back4app.com';
const LIVE_QUERY_URL = process.env.NEXT_PUBLIC_BACK4APP_LIVE_QUERY_URL || 'wss://amt-chat.b4a.io';

let initialized = false;

export function initParse() {
  if (initialized || typeof window === 'undefined') return;
  Parse.initialize(APP_ID, JS_KEY);
  (Parse as any).serverURL = SERVER_URL;
  initialized = true;
}

export { Parse };

// ── Parse Classes ──────────────────────────────────────────────

export const UserClass = Parse.User;

// Use class name strings directly with new Parse.Object('ClassName')
export const CLASS_NAMES = {
  Message: 'Message',
  Conversation: 'Conversation',
  Status: 'Status',
  Call: 'Call',
  Contact: 'Contact',
  Signal: 'Signal',
} as const;

// ── LiveQuery ──────────────────────────────────────────────────

let liveQueryClient: any = null;

export function getLiveQueryClient() {
  if (!liveQueryClient && typeof window !== 'undefined') {
    liveQueryClient = new (Parse as any).LiveQueryClient({
      applicationId: APP_ID,
      serverURL: LIVE_QUERY_URL,
      javascriptKey: JS_KEY,
    });
    liveQueryClient.open();
  }
  return liveQueryClient;
}

export async function subscribeToQuery(query: any, callbacks: {
  onCreate?: (object: any) => void;
  onUpdate?: (object: any) => void;
  onDelete?: (object: any) => void;
}) {
  const subscription = await query.subscribe();
  if (callbacks.onCreate) subscription.on('create', callbacks.onCreate);
  if (callbacks.onUpdate) subscription.on('update', callbacks.onUpdate);
  if (callbacks.onDelete) subscription.on('delete', callbacks.onDelete);
  return subscription;
}

// ── Helper: Upload File ────────────────────────────────────────

export async function uploadFile(file: File, name?: string): Promise<string> {
  const parseFile = new Parse.File(name || file.name, file);
  await parseFile.save();
  return parseFile.url() || '';
}

// ── Helper: Format User ────────────────────────────────────────

export function formatUser(parseUser: any): import('../types').AMTUser {
  return {
    id: parseUser.id || '',
    username: parseUser.get('username') || '',
    displayName: parseUser.get('displayName') || parseUser.get('username') || '',
    phone: parseUser.get('phone'),
    bio: parseUser.get('bio'),
    avatarUrl: parseUser.get('avatar')?.url?.() || parseUser.get('avatarUrl'),
    online: parseUser.get('online') || false,
    lastSeen: parseUser.get('lastSeen'),
    parseObject: parseUser,
  };
}

// ── Helper: Format Message ─────────────────────────────────────

export function formatMessage(obj: any): import('../types').Message {
  const sender = obj.get('sender');
  return {
    id: obj.id,
    senderId: sender?.id || '',
    senderName: sender?.get('displayName') || sender?.get('username') || '',
    senderAvatar: sender?.get('avatar')?.url?.(),
    content: obj.get('content') || '',
    type: obj.get('type') || 'text',
    fileUrl: obj.get('file')?.url?.(),
    fileName: obj.get('fileName'),
    audioDuration: obj.get('audioDuration'),
    read: obj.get('read') || false,
    readAt: obj.get('readAt'),
    createdAt: obj.createdAt || new Date(),
    conversationId: obj.get('conversationId') || '',
    replyTo: obj.get('replyTo'),
  };
}

// ── Helper: Format Conversation ────────────────────────────────

export function formatConversation(obj: any, currentUserId: string): import('../types').Conversation {
  const participants = (obj.get('participants') || []).map((p: any) => formatUser(p));
  const lastMsgObj = obj.get('lastMessage');
  return {
    id: obj.id,
    participants,
    isGroup: obj.get('isGroup') || false,
    groupName: obj.get('groupName'),
    groupAvatar: obj.get('groupAvatar')?.url?.() || obj.get('groupAvatarUrl'),
    groupDescription: obj.get('groupDescription'),
    admins: obj.get('admins') || [],
    lastMessage: lastMsgObj ? formatMessage(lastMsgObj) : undefined,
    lastMessageAt: obj.get('lastMessageAt') || obj.updatedAt,
    unreadCount: obj.get(`unread_${currentUserId}`) || 0,
    createdAt: obj.createdAt || new Date(),
    parseObject: obj,
  };
}
