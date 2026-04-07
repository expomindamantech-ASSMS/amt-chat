// src/types/index.ts

export interface AMTUser {
  id: string;
  username: string;
  displayName: string;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  online?: boolean;
  lastSeen?: Date;
  parseObject?: any;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'file';
  fileUrl?: string;
  fileName?: string;
  audioDuration?: number;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  conversationId: string;
  replyTo?: string;
}

export interface Conversation {
  id: string;
  participants: AMTUser[];
  isGroup: boolean;
  groupName?: string;
  groupAvatar?: string;
  groupDescription?: string;
  admins?: string[];
  lastMessage?: Message;
  lastMessageAt?: Date;
  unreadCount: number;
  createdAt: Date;
  parseObject?: any;
}

export interface Status {
  id: string;
  user: AMTUser;
  type: 'text' | 'image' | 'video';
  content: string;
  mediaUrl?: string;
  bgColor?: string;
  views: string[];
  createdAt: Date;
  expiresAt: Date;
}

export interface Call {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  receiverId: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'declined' | 'missed';
  startedAt?: Date;
  endedAt?: Date;
  duration?: number;
  roomId: string;
}

export interface Contact {
  id: string;
  user: AMTUser;
  nickname?: string;
  addedAt: Date;
}

export interface SignalData {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-ended' | 'call-declined';
  signal?: any;
  callId: string;
  from: string;
  to: string;
  callType?: 'audio' | 'video';
  callerName?: string;
  callerAvatar?: string;
}
