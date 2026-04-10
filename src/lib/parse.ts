// src/lib/parse.ts
import Parse from 'parse';

const APP_ID = process.env.NEXT_PUBLIC_BACK4APP_APP_ID || '';
const JS_KEY = process.env.NEXT_PUBLIC_BACK4APP_JS_KEY || '';
const SERVER_URL = process.env.NEXT_PUBLIC_BACK4APP_SERVER_URL || 'https://parseapi.back4app.com';

let initialized = false;

export function initParse() {
  if (initialized || typeof window === 'undefined') return;
  Parse.initialize(APP_ID, JS_KEY);
  (Parse as any).serverURL = SERVER_URL;
  initialized = true;
}

export { Parse };

export const UserClass = Parse.User;

// ── Polling replaces LiveQuery - no WebSocket/LiveQuery URL needed ──
type PollCallbacks = {
  onCreate?: (object: any) => void;
  onUpdate?: (object: any) => void;
  onDelete?: (object: any) => void;
};

export function subscribeToQuery(query: any, callbacks: PollCallbacks): Promise<{ unsubscribe: () => void }> {
  const knownIds = new Map<string, string>();
  let stopped = false;
  let firstPoll = true;

  const poll = async () => {
    if (stopped) return;
    try {
      const results = await query.find();
      const currentIds = new Set<string>();

      for (const obj of results) {
        currentIds.add(obj.id);
        const prevUpdated = knownIds.get(obj.id);
        const nowUpdated = obj.updatedAt?.toISOString() || '';
        if (!prevUpdated) {
          if (!firstPoll) callbacks.onCreate?.(obj);
          knownIds.set(obj.id, nowUpdated);
        } else if (prevUpdated !== nowUpdated) {
          callbacks.onUpdate?.(obj);
          knownIds.set(obj.id, nowUpdated);
        }
      }

      for (const [id] of knownIds) {
        if (!currentIds.has(id)) {
          callbacks.onDelete?.({ id });
          knownIds.delete(id);
        }
      }
      firstPoll = false;
    } catch { /* ignore */ }
  };

  poll();
  const timer = setInterval(poll, 2500);

  return Promise.resolve({
    unsubscribe: () => { stopped = true; clearInterval(timer); }
  });
}

export async function uploadFile(file: File, name?: string): Promise<string> {
  const parseFile = new Parse.File(name || file.name, file);
  await parseFile.save();
  return parseFile.url() || '';
}

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

export function formatMessage(obj: any): import('../types').Message {
  const sender = obj.get('sender');
  return {
    id: obj.id,
    senderId: sender?.id || '',
    senderName: sender?.get('displayName') || sender?.get('username') || '',
    senderAvatar: sender?.get('avatar')?.url?.(),
    content: obj.get('content') || '',
    type: obj.get('type') || 'text',
    fileUrl: obj.get('file')?.url?.() || obj.get('fileUrl'),
    fileName: obj.get('fileName'),
    audioDuration: obj.get('audioDuration'),
    read: obj.get('read') || false,
    readAt: obj.get('readAt'),
    createdAt: obj.createdAt || new Date(),
    conversationId: obj.get('conversationId') || '',
    replyTo: obj.get('replyTo'),
  };
}

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
