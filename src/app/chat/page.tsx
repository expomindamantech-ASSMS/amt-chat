'use client';
// src/app/chat/page.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Parse, initParse, formatUser, formatMessage, formatConversation, uploadFile, subscribeToQuery } from '../../lib/parse';
import { getLocalStream, createPeer, stopStream, toggleAudio, toggleVideo, formatDuration } from '../../lib/webrtc';
import type { AMTUser, Message, Conversation, Status, Call, SignalData } from '../../types';
import toast from 'react-hot-toast';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

// ── Helpers ───────────────────────────────────────────────────

function Avatar({ user, size = 44, radius = 14 }: { user: Partial<AMTUser>, size?: number, radius?: number }) {
  const colors = ['#E8F0FF,#0057FF','#E8F5E9,#2E7D32','#FFF3E0,#E65100','#FCE4EC,#880E4F','#EDE7F6,#4527A0'];
  const idx = (user.displayName || user.username || '').charCodeAt(0) % colors.length;
  const [bg, fg] = colors[idx].split(',');
  const initials = (user.displayName || user.username || '?').slice(0,2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: user.avatarUrl ? 'transparent' : bg,
      overflow: 'hidden', flexShrink: 0, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt={user.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        : <span style={{ fontSize: size * 0.33, fontWeight: 700, color: fg }}>{initials}</span>
      }
    </div>
  );
}

function Tick({ read }: { read: boolean }) {
  return <span style={{ fontSize: 12, color: read ? '#53bdeb' : 'rgba(255,255,255,0.7)' }}>✓✓</span>;
}

function formatMsgTime(date: Date) {
  return format(date, 'HH:mm');
}
function formatDateDivider(date: Date) {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}
function getConvName(conv: Conversation, me: AMTUser) {
  if (conv.isGroup) return conv.groupName || 'Group';
  const other = conv.participants.find(p => p.id !== me.id);
  return other?.displayName || other?.username || 'Unknown';
}
function getConvAvatar(conv: Conversation, me: AMTUser) {
  if (conv.isGroup) return undefined;
  return conv.participants.find(p => p.id !== me.id);
}

// ── MAIN COMPONENT ────────────────────────────────────────────

export default function ChatPage() {
  const { user, logout, updateProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  // Navigation
  const [tab, setTab] = useState<'chats'|'status'|'calls'>('chats');
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);

  // Data
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [callHistory, setCallHistory] = useState<Call[]>([]);
  const [contacts, setContacts] = useState<AMTUser[]>([]);
  const [search, setSearch] = useState('');

  // Modals
  const [showProfile, setShowProfile] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showStatusCreate, setShowStatusCreate] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState<AMTUser | null>(null);

  // Input
  const [msgText, setMsgText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  // Call state
  const [incomingCall, setIncomingCall] = useState<SignalData | null>(null);
  const [activeCall, setActiveCall] = useState<{
    callId: string; type: 'audio'|'video'; peer?: any;
    localStream?: MediaStream; remoteStream?: MediaStream;
    muted: boolean; videoOff: boolean; duration: number;
    otherUser?: AMTUser;
  } | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout>();
  const convSubscriptionRef = useRef<any>(null);
  const msgSubscriptionRef = useRef<any>(null);
  const signalSubscriptionRef = useRef<any>(null);

  // ── Init ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    initParse();
    loadConversations();
    loadContacts();
    loadStatuses();
    loadCallHistory();
    subscribeToSignals();
    // Mark online
    const interval = setInterval(() => {
      const u = Parse.User.current();
      if (u) { u.set('online', true); u.save().catch(()=>{}); }
    }, 30000);
    return () => { clearInterval(interval); cleanupSubscriptions(); };
  }, [user]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (activeCall) { cleanupSubscriptions(); subscribeToSignals(); }
  }, [activeCall?.callId]);

  function cleanupSubscriptions() {
    convSubscriptionRef.current?.unsubscribe();
    msgSubscriptionRef.current?.unsubscribe();
    signalSubscriptionRef.current?.unsubscribe();
  }

  // ── Load Data ──────────────────────────────────────────────

  async function loadConversations() {
    try {
      const query = new Parse.Query('Conversation');
      query.containsAll('participantIds', [user!.id]);
      query.descending('lastMessageAt');
      query.include(['participants','lastMessage','lastMessage.sender']);
      query.limit(50);
      const results = await query.find();
      setConversations(results.map((r: any) => formatConversation(r, user!.id)));

      // Subscribe
      convSubscriptionRef.current = await subscribeToQuery(query, {
        onCreate: (obj) => setConversations(prev => [formatConversation(obj, user!.id), ...prev.filter(c=>c.id!==obj.id)]),
        onUpdate: (obj) => setConversations(prev => prev.map((c: import('../../types').Conversation) => c.id===obj.id ? formatConversation(obj, user!.id) : c).sort((a: import('../../types').Conversation,b: import('../../types').Conversation)=>(b.lastMessageAt?.getTime()||0)-(a.lastMessageAt?.getTime()||0))),
      });
    } catch (err) { console.error('loadConversations', err); }
  }

  async function loadMessages(convId: string) {
    try {
      const query = new Parse.Query('Message');
      query.equalTo('conversationId', convId);
      query.ascending('createdAt');
      query.include('sender');
      query.limit(100);
      const results = await query.find();
      setMessages(results.map((r: any) => formatMessage(r)));

      // Subscribe
      msgSubscriptionRef.current?.unsubscribe();
      const liveQuery = new Parse.Query('Message');
      liveQuery.equalTo('conversationId', convId);
      liveQuery.include('sender');
      msgSubscriptionRef.current = await subscribeToQuery(liveQuery, {
        onCreate: (obj) => setMessages(prev => [...prev, formatMessage(obj)]),
        onUpdate: (obj) => setMessages(prev => prev.map((m: import('../../types').Message) => m.id===obj.id ? formatMessage(obj) : m)),
      });

      // Mark read
      markMessagesRead(convId);
    } catch (err) { console.error('loadMessages', err); }
  }

  async function loadContacts() {
    try {
      const query = new Parse.Query('Contact');
      query.equalTo('owner', Parse.User.current());
      query.include('contact');
      const results = await query.find();
      setContacts(results.map((r: any) => formatUser(r.get('contact'))));
    } catch (err) { console.error('loadContacts', err); }
  }

  async function loadStatuses() {
    try {
      const query = new Parse.Query('Status');
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24*60*60*1000);
      query.greaterThan('expiresAt', yesterday);
      query.descending('createdAt');
      query.include('user');
      const results = await query.find();
      setStatuses(results.map((r: any) => ({
        id: r.id,
        user: formatUser(r.get('user')),
        type: r.get('type') || 'text',
        content: r.get('content') || '',
        mediaUrl: r.get('media')?.url?.(),
        bgColor: r.get('bgColor') || '#0057FF',
        views: r.get('views') || [],
        createdAt: r.createdAt || new Date(),
        expiresAt: r.get('expiresAt') || new Date(),
      })));
    } catch (err) { console.error('loadStatuses', err); }
  }

  async function loadCallHistory() {
    try {
      const query = new Parse.Query('Call');
      const orQ = Parse.Query.or(
        new Parse.Query('Call').equalTo('callerId', user!.id),
        new Parse.Query('Call').equalTo('receiverId', user!.id)
      );
      orQ.descending('createdAt').limit(30);
      const results = await orQ.find();
      setCallHistory(results.map((r: any) => ({
        id: r.id, callerId: r.get('callerId'), callerName: r.get('callerName'),
        callerAvatar: r.get('callerAvatar'), receiverId: r.get('receiverId'),
        type: r.get('type'), status: r.get('status'), startedAt: r.get('startedAt'),
        endedAt: r.get('endedAt'), duration: r.get('duration'), roomId: r.get('roomId'),
      })));
    } catch (err) { console.error('loadCallHistory', err); }
  }

  // ── Signal System (WebRTC signaling via Parse) ─────────────

  async function subscribeToSignals() {
    try {
      const query = new Parse.Query('Signal');
      query.equalTo('to', user!.id);
      query.greaterThan('createdAt', new Date());
      signalSubscriptionRef.current = await subscribeToQuery(query, {
        onCreate: async (obj) => {
          const data: SignalData = {
            type: obj.get('type'), signal: obj.get('signal'),
            callId: obj.get('callId'), from: obj.get('from'), to: obj.get('to'),
            callType: obj.get('callType'), callerName: obj.get('callerName'),
            callerAvatar: obj.get('callerAvatar'),
          };
          handleIncomingSignal(data);
          obj.destroy().catch(()=>{});
        }
      });
    } catch (err) { console.error('subscribeToSignals', err); }
  }

  async function sendSignal(data: SignalData) {
    const obj = new Parse.Object('Signal');
    Object.entries(data).forEach(([k,v]) => obj.set(k,v));
    await obj.save();
  }

  function handleIncomingSignal(data: SignalData) {
    if (data.type === 'offer') {
      setIncomingCall(data);
    } else if (data.type === 'answer' && activeCall?.peer) {
      activeCall.peer.signal(data.signal);
    } else if (data.type === 'ice-candidate' && activeCall?.peer) {
      activeCall.peer.signal(data.signal);
    } else if (data.type === 'call-ended') {
      endCall(true);
    } else if (data.type === 'call-declined') {
      toast.error('Call declined');
      endCall(true);
    }
  }

  // ── Messaging ──────────────────────────────────────────────

  async function openConversation(conv: Conversation) {
    setActiveConv(conv);
    setMessages([]);
    await loadMessages(conv.id);
    setConversations(prev => prev.map((c: import('../../types').Conversation) => c.id===conv.id ? {...c, unreadCount:0} : c));
  }

  async function startDirectChat(contact: AMTUser) {
    // Find existing conv
    const existing = conversations.find((c: import('../../types').Conversation) =>
      !c.isGroup && c.participants.some(p=>p.id===contact.id) && c.participants.some(p=>p.id===user!.id)
    );
    if (existing) { openConversation(existing); setTab('chats'); return; }

    // Create new conversation
    try {
      const conv = new Parse.Object('Conversation');
      const me = Parse.User.current()!;
      const otherUser = await new Parse.Query(Parse.User).get(contact.id);
      conv.set('participants', [me, otherUser]);
      conv.set('participantIds', [user!.id, contact.id]);
      conv.set('isGroup', false);
      conv.set('lastMessageAt', new Date());
      await conv.save();
      await loadConversations();
      const newConv = formatConversation(conv, user!.id);
      setActiveConv(newConv);
      setMessages([]);
      setTab('chats');
    } catch (err) { toast.error('Could not start conversation'); }
  }

  async function sendTextMessage() {
    if (!msgText.trim() || !activeConv) return;
    const text = msgText.trim();
    setMsgText('');
    await sendMessage({ content: text, type: 'text' });
    setReplyTo(null);
  }

  async function sendMessage(data: { content: string; type: Message['type']; fileUrl?: string; fileName?: string; audioDuration?: number }) {
    if (!activeConv || !user) return;
    try {
      const msg = new Parse.Object('Message');
      const me = Parse.User.current()!;
      msg.set('sender', me);
      msg.set('senderId', user.id);
      msg.set('conversationId', activeConv.id);
      msg.set('content', data.content);
      msg.set('type', data.type);
      msg.set('read', false);
      if (data.fileUrl) msg.set('fileUrl', data.fileUrl);
      if (data.fileName) msg.set('fileName', data.fileName);
      if (data.audioDuration) msg.set('audioDuration', data.audioDuration);
      if (replyTo) msg.set('replyTo', replyTo.id);

      const acl = new Parse.ACL();
      acl.setPublicReadAccess(true);
      acl.setPublicWriteAccess(true);
      msg.setACL(acl);
      await msg.save();

      // Update conversation
      const convQuery = new Parse.Query('Conversation');
      const conv = await convQuery.get(activeConv.id);
      conv.set('lastMessage', msg);
      conv.set('lastMessageAt', new Date());
      // Increment unread for others
      activeConv.participants.forEach(p => {
        if (p.id !== user.id) conv.increment(`unread_${p.id}`);
      });
      await conv.save();
    } catch (err) { toast.error('Message failed to send'); }
  }

  async function sendFile(file: File) {
    if (!activeConv) return;
    const toastId = toast.loading('Uploading...');
    try {
      const url = await uploadFile(file);
      const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
      await sendMessage({ content: file.name, type, fileUrl: url, fileName: file.name });
      toast.success('File sent!', { id: toastId });
    } catch (err) {
      toast.error('Upload failed', { id: toastId });
    }
  }

  async function markMessagesRead(convId: string) {
    try {
      const query = new Parse.Query('Message');
      query.equalTo('conversationId', convId);
      query.equalTo('read', false);
      query.notEqualTo('senderId', user!.id);
      const unread = await query.find();
      await Parse.Object.saveAll(unread.map((m: any) => { m.set('read', true); m.set('readAt', new Date()); return m; }));
    } catch {}
  }

  // ── Voice Recording ────────────────────────────────────────

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => audioChunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t=>t.stop());
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        const url = await uploadFile(file);
        await sendMessage({ content: 'Voice message', type: 'audio', fileUrl: url, audioDuration: recordSeconds });
        setRecordSeconds(0);
      };
      mr.start();
      setRecording(true);
      const timer = setInterval(() => setRecordSeconds(s => s+1), 1000);
      (mediaRecorderRef.current as any)._timer = timer;
    } catch { toast.error('Microphone access denied'); }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current) return;
    clearInterval((mediaRecorderRef.current as any)._timer);
    mediaRecorderRef.current.stop();
    setRecording(false);
  }

  // ── Calls ──────────────────────────────────────────────────

  async function initiateCall(callType: 'audio'|'video', targetUser: AMTUser) {
    const callId = uuidv4();
    try {
      const stream = await getLocalStream(callType === 'video');

      const peer = createPeer({
        initiator: true,
        stream,
        onSignal: async (signal) => {
          await sendSignal({ type: 'offer', signal, callId, from: user!.id, to: targetUser.id, callType, callerName: user!.displayName, callerAvatar: user!.avatarUrl });
        },
        onStream: (remoteStream) => {
          setActiveCall(prev => prev ? { ...prev, remoteStream } : null);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        },
        onClose: () => endCall(false),
      });

      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      setActiveCall({ callId, type: callType, peer, localStream: stream, muted: false, videoOff: false, duration: 0, otherUser: targetUser });

      // Log call
      const callObj = new Parse.Object('Call');
      callObj.set('callerId', user!.id); callObj.set('callerName', user!.displayName);
      callObj.set('receiverId', targetUser.id); callObj.set('type', callType);
      callObj.set('status', 'ringing'); callObj.set('roomId', callId);
      await callObj.save();

      callTimerRef.current = setInterval(() => setActiveCall(prev => prev ? { ...prev, duration: prev.duration+1 } : null), 1000);
    } catch (err) { toast.error('Could not start call'); }
  }

  async function acceptCall() {
    if (!incomingCall) return;
    const { callId, from, callType } = incomingCall;
    try {
      const stream = await getLocalStream(callType === 'video');
      const callerUser = contacts.find(c=>c.id===from) || { id:from, username:'', displayName: incomingCall.callerName||'Caller', avatarUrl: incomingCall.callerAvatar } as AMTUser;

      const peer = createPeer({
        initiator: false,
        stream,
        onSignal: async (signal) => {
          await sendSignal({ type: 'answer', signal, callId, from: user!.id, to: from });
        },
        onStream: (remoteStream) => {
          setActiveCall(prev => prev ? { ...prev, remoteStream } : null);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        },
        onClose: () => endCall(false),
      });

      peer.signal(incomingCall.signal);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      setActiveCall({ callId, type: callType||'audio', peer, localStream: stream, muted:false, videoOff:false, duration:0, otherUser:callerUser });
      setIncomingCall(null);
      callTimerRef.current = setInterval(() => setActiveCall(prev => prev ? {...prev, duration:prev.duration+1}:null), 1000);
    } catch { toast.error('Could not accept call'); }
  }

  function declineCall() {
    if (incomingCall) {
      sendSignal({ type:'call-declined', callId:incomingCall.callId, from:user!.id, to:incomingCall.from });
    }
    setIncomingCall(null);
  }

  function endCall(silent?: boolean) {
    if (activeCall && !silent) {
      sendSignal({ type:'call-ended', callId:activeCall.callId, from:user!.id, to:activeCall.otherUser?.id||'' });
    }
    clearInterval(callTimerRef.current);
    if (activeCall) {
      activeCall.peer?.destroy();
      stopStream(activeCall.localStream||null);
      stopStream(activeCall.remoteStream||null);
    }
    setActiveCall(null);
  }

  // ── Add Contact ────────────────────────────────────────────

  async function addContact(searchTerm: string): Promise<boolean> {
    try {
      const query = new Parse.Query(Parse.User);
      query.or(
        new Parse.Query(Parse.User).equalTo('username', searchTerm.toLowerCase()),
        new Parse.Query(Parse.User).equalTo('phone', searchTerm)
      );
      const found = await query.first();
      if (!found) { toast.error('User not found'); return false; }
      if (found.id === user!.id) { toast.error("That's you!"); return false; }

      const contact = new Parse.Object('Contact');
      contact.set('owner', Parse.User.current());
      contact.set('contact', found);
      contact.set('contactId', found.id);
      const acl = new Parse.ACL(Parse.User.current()!);
      contact.setACL(acl);
      await contact.save();
      toast.success(`${found.get('displayName')||found.get('username')} added!`);
      await loadContacts();
      return true;
    } catch (err: any) { toast.error(err.message || 'Failed to add contact'); return false; }
  }

  // ── Create Group ───────────────────────────────────────────

  async function createGroup(name: string, members: AMTUser[], avatar?: File) {
    try {
      const conv = new Parse.Object('Conversation');
      const me = Parse.User.current()!;
      const memberUsers = await Promise.all(members.map((m: import('../../types').AMTUser) => new Parse.Query(Parse.User).get(m.id)));
      const allParticipants = [me, ...memberUsers];
      conv.set('participants', allParticipants);
      conv.set('participantIds', [user!.id, ...members.map(m=>m.id)]);
      conv.set('isGroup', true);
      conv.set('groupName', name);
      conv.set('admins', [user!.id]);
      conv.set('lastMessageAt', new Date());
      if (avatar) {
        const url = await uploadFile(avatar, `group_${uuidv4()}`);
        conv.set('groupAvatarUrl', url);
      }
      const acl = new Parse.ACL();
      acl.setPublicReadAccess(true);
      acl.setPublicWriteAccess(true);
      conv.setACL(acl);
      await conv.save();
      toast.success(`Group "${name}" created!`);
      await loadConversations();
      setShowCreateGroup(false);
    } catch (err) { toast.error('Failed to create group'); }
  }

  // ── Post Status ────────────────────────────────────────────

  async function postStatus(data: { type:'text'|'image'; content:string; bgColor?:string; file?:File }) {
    try {
      const status = new Parse.Object('Status');
      status.set('user', Parse.User.current());
      status.set('userId', user!.id);
      status.set('type', data.type);
      status.set('content', data.content);
      status.set('bgColor', data.bgColor || '#0057FF');
      status.set('views', []);
      status.set('expiresAt', new Date(Date.now() + 24*60*60*1000));
      if (data.file) {
        const url = await uploadFile(data.file);
        status.set('mediaUrl', url);
      }
      const acl = new Parse.ACL();
      acl.setPublicReadAccess(true);
      acl.setPublicWriteAccess(true);
      status.setACL(acl);
      await status.save();
      toast.success('Status posted!');
      await loadStatuses();
      setShowStatusCreate(false);
    } catch { toast.error('Failed to post status'); }
  }

  // ── RENDER ─────────────────────────────────────────────────

  if (!user) return null;

  const filteredConvs = conversations.filter((c: import('../../types').Conversation) =>
    getConvName(c, user).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display:'flex', height:'100vh', background:'var(--bg)', overflow:'hidden' }}>

      {/* ── SIDEBAR ─────────────────────────────────── */}
      <div style={{
        width: 360, minWidth: 280, display:'flex', flexDirection:'column',
        background:'var(--surface)', borderRight:'1.5px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ padding:'16px 16px 12px', borderBottom:'1.5px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'#0057FF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <path d="M4 17L6.5 11L9 17M4 17H9M6.5 11L5 8H8L6.5 11Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
                  <path d="M13 8V17M13 8L16 17M16 17L19 8" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
                </svg>
              </div>
              <span style={{ fontSize:22, fontWeight:800, color:'#0057FF', letterSpacing:-0.5 }}>AMT</span>
            </div>
            <div style={{ display:'flex', gap:4 }}>
              <button className="amt-btn-ghost" onClick={toggleTheme} style={{ width:34, height:34, borderRadius:10, fontSize:16 }}>
                {theme==='dark'?'☀️':'🌙'}
              </button>
              <button className="amt-btn-ghost" onClick={() => setShowCreateGroup(true)} style={{ width:34, height:34, borderRadius:10, fontSize:16 }}>👥</button>
              <button className="amt-btn-ghost" onClick={() => setShowAddContact(true)} style={{ width:34, height:34, borderRadius:10, fontSize:16 }}>➕</button>
              <button className="amt-btn-ghost" onClick={() => setShowProfile(true)} style={{ width:34, height:34, padding:0, overflow:'hidden', borderRadius:'50%' }}>
                <Avatar user={user} size={34} radius={17}/>
              </button>
            </div>
          </div>
          {/* Search */}
          <div style={{
            display:'flex', alignItems:'center', gap:8, background:'var(--input-bg)',
            borderRadius:12, padding:'9px 14px', border:'1.5px solid var(--border)',
          }}>
            <span style={{ fontSize:14, color:'var(--text-muted)' }}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search conversations…"
              style={{ border:'none', background:'none', outline:'none', fontSize:14, color:'var(--text)', width:'100%', fontFamily:'inherit' }}/>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1.5px solid var(--border)' }}>
          {(['chats','status','calls'] as const).map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{
              flex:1, padding:'12px 0', border:'none', background:'none', cursor:'pointer',
              fontSize:13, fontWeight:600, fontFamily:'inherit', textTransform:'capitalize',
              color: tab===t ? '#0057FF' : 'var(--text-muted)',
              borderBottom: tab===t ? '2px solid #0057FF' : '2px solid transparent',
              transition:'all 0.2s',
            }}>{t==='chats'?'💬 Chats':t==='status'?'📸 Status':'📞 Calls'}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto' }}>

          {/* CHATS TAB */}
          {tab==='chats' && (
            <>
              {filteredConvs.length === 0 && (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <p style={{ fontSize:36, marginBottom:12 }}>💬</p>
                  <p style={{ color:'var(--text-muted)', fontSize:14 }}>No conversations yet</p>
                  <button onClick={()=>setShowAddContact(true)} className="amt-btn" style={{ marginTop:12, padding:'8px 20px', borderRadius:10, fontSize:13 }}>Add Contact</button>
                </div>
              )}
              {filteredConvs.map(conv => {
                const name = getConvName(conv, user);
                const avatar = getConvAvatar(conv, user);
                const isActive = activeConv?.id === conv.id;
                return (
                  <div key={conv.id} onClick={()=>openConversation(conv)}
                    className={isActive ? 'contact-active' : ''}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', cursor:'pointer', transition:'background 0.12s', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ position:'relative' }}>
                      {conv.isGroup
                        ? <div style={{ width:48, height:48, borderRadius:14, background:'var(--amt-light)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>👥</div>
                        : <Avatar user={avatar||{}} size={48} radius={14}/>
                      }
                      {!conv.isGroup && avatar?.online && <div style={{ position:'absolute', bottom:-1, right:-1, width:13, height:13, borderRadius:'50%', background:'var(--online)', border:'2px solid var(--surface)' }}/>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                        <span style={{ fontSize:14.5, fontWeight:600, color:'var(--text)' }}>{name}</span>
                        <span style={{ fontSize:11, color:'var(--text-muted)', flexShrink:0 }}>
                          {conv.lastMessageAt ? formatMsgTime(new Date(conv.lastMessageAt)) : ''}
                        </span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:12.5, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>
                          {conv.lastMessage?.type==='audio'?'🎵 Voice message':conv.lastMessage?.type==='image'?'📷 Image':conv.lastMessage?.content||'Start chatting'}
                        </span>
                        {conv.unreadCount>0 && <div className="badge">{conv.unreadCount}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* STATUS TAB */}
          {tab==='status' && (
            <StatusTab statuses={statuses} user={user} onPost={()=>setShowStatusCreate(true)} onChat={startDirectChat}/>
          )}

          {/* CALLS TAB */}
          {tab==='calls' && (
            <CallsTab calls={callHistory} user={user} contacts={contacts} onCall={initiateCall} onChat={startDirectChat}/>
          )}
        </div>

        {/* Contacts quick access */}
        {contacts.length > 0 && tab==='chats' && (
          <div style={{ borderTop:'1.5px solid var(--border)', padding:'10px 16px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>Contacts</p>
            <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:4 }}>
              {contacts.map(c=>(
                <div key={c.id} onClick={()=>startDirectChat(c)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer', flexShrink:0 }}>
                  <div style={{ position:'relative' }}>
                    <Avatar user={c} size={40} radius={12}/>
                    {c.online && <div style={{ position:'absolute', bottom:-1, right:-1, width:10, height:10, borderRadius:'50%', background:'var(--online)', border:'2px solid var(--surface)' }}/>}
                  </div>
                  <span style={{ fontSize:10, color:'var(--text-muted)', textAlign:'center', maxWidth:44, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.displayName||c.username}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── CHAT WINDOW ──────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:'var(--chat-bg)', position:'relative' }}>
        {!activeConv ? (
          <WelcomeScreen user={user} onAddContact={()=>setShowAddContact(true)}/>
        ) : (
          <>
            {/* Chat Header */}
            <ChatHeader conv={activeConv} user={user} onCall={initiateCall} onInfo={setShowContactInfo} onBack={()=>setActiveConv(null)}/>

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
              {messages.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-muted)' }}>
                  <p style={{ fontSize:36, marginBottom:12 }}>👋</p>
                  <p style={{ fontSize:14 }}>Say hello!</p>
                </div>
              )}
              {groupMessagesByDate(messages).map((group, gi) => (
                <div key={gi}>
                  <div style={{ textAlign:'center', margin:'12px 0' }}>
                    <span style={{
                      background:'var(--surface)', color:'var(--text-muted)',
                      fontSize:11.5, fontWeight:600, padding:'4px 12px', borderRadius:20,
                      border:'1px solid var(--border)',
                    }}>{formatDateDivider(group.date)}</span>
                  </div>
                  {group.messages.map(msg => (
                    <MessageBubble key={msg.id} msg={msg} isMe={msg.senderId===user.id} conv={activeConv} onReply={setReplyTo}/>
                  ))}
                </div>
              ))}
              <div ref={messagesEndRef}/>
            </div>

            {/* Reply preview */}
            {replyTo && (
              <div style={{ margin:'0 20px 0', padding:'10px 14px', background:'var(--surface)', borderLeft:'3px solid #0057FF', borderRadius:'0 8px 8px 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ fontSize:12, fontWeight:600, color:'#0057FF', marginBottom:2 }}>{replyTo.senderName}</p>
                  <p style={{ fontSize:12.5, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:400 }}>{replyTo.content}</p>
                </div>
                <button onClick={()=>setReplyTo(null)} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:18 }}>✕</button>
              </div>
            )}

            {/* Input */}
            <div style={{ padding:'12px 20px 16px', background:'var(--surface)', borderTop:'1.5px solid var(--border)', display:'flex', alignItems:'flex-end', gap:10 }}>
              <input ref={fileInputRef} type="file" style={{ display:'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f) sendFile(f); e.target.value=''; }}/>
              <button onClick={()=>fileInputRef.current?.click()} className="amt-btn-ghost" style={{ width:40, height:40, borderRadius:12, fontSize:20, flexShrink:0 }}>📎</button>
              <div style={{
                flex:1, background:'var(--input-bg)', borderRadius:16, border:'1.5px solid var(--border)',
                display:'flex', alignItems:'flex-end', gap:8, padding:'10px 14px',
                transition:'border-color 0.2s',
              }}>
                <textarea
                  value={msgText}
                  onChange={e=>{ setMsgText(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'; }}
                  onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendTextMessage();} }}
                  placeholder="Message…" rows={1}
                  style={{ flex:1, border:'none', background:'none', outline:'none', fontSize:14.5, color:'var(--text)', resize:'none', maxHeight:120, lineHeight:1.45, fontFamily:'inherit' }}/>
                <button className="amt-btn-ghost" style={{ width:28, height:28, fontSize:18, flexShrink:0 }}>😊</button>
              </div>
              {recording ? (
                <button onClick={stopRecording} style={{
                  width:46, height:46, borderRadius:14, background:'var(--danger)', border:'none', cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:20,
                  animation:'pulse 1s infinite',
                }}>⏹️</button>
              ) : msgText.trim() ? (
                <button onClick={sendTextMessage} className="amt-btn" style={{ width:46, height:46, borderRadius:14, fontSize:0, flexShrink:0, boxShadow:'0 6px 20px rgba(0,87,255,0.35)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
                </button>
              ) : (
                <button onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}
                  className="amt-btn-ghost" style={{ width:46, height:46, borderRadius:14, fontSize:22, flexShrink:0, border:'1.5px solid var(--border)' }}>
                  🎙️
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── MODALS ─────────────────────────────────────── */}
      {incomingCall && (
        <IncomingCallModal call={incomingCall} onAccept={acceptCall} onDecline={declineCall}/>
      )}
      {activeCall && (
        <ActiveCallModal
          call={activeCall}
          localVideoRef={localVideoRef} remoteVideoRef={remoteVideoRef}
          onEnd={()=>endCall(false)}
          onToggleMute={()=>{toggleAudio(activeCall.localStream||null,activeCall.muted);setActiveCall(p=>p?{...p,muted:!p.muted}:null);}}
          onToggleVideo={()=>{toggleVideo(activeCall.localStream||null,activeCall.videoOff);setActiveCall(p=>p?{...p,videoOff:!p.videoOff}:null);}}
        />
      )}
      {showProfile && <ProfileModal user={user} onUpdate={updateProfile} onLogout={async()=>{await logout();router.replace('/auth/login');}} onClose={()=>setShowProfile(false)}/>}
      {showAddContact && <AddContactModal onAdd={addContact} onClose={()=>setShowAddContact(false)}/>}
      {showCreateGroup && <CreateGroupModal contacts={contacts} onCreate={createGroup} onClose={()=>setShowCreateGroup(false)}/>}
      {showStatusCreate && <CreateStatusModal onPost={postStatus} onClose={()=>setShowStatusCreate(false)}/>}
      {showContactInfo && <ContactInfoModal user={showContactInfo} onChat={()=>{startDirectChat(showContactInfo);setShowContactInfo(null);}} onCall={(t)=>initiateCall(t,showContactInfo)} onClose={()=>setShowContactInfo(null)}/>}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: Date; messages: Message[] }[] = [];
  messages.forEach(msg => {
    const d = new Date(msg.createdAt);
    const last = groups[groups.length-1];
    if (!last || formatDateDivider(new Date(last.date)) !== formatDateDivider(d)) {
      groups.push({ date: d, messages: [msg] });
    } else {
      last.messages.push(msg);
    }
  });
  return groups;
}

function WelcomeScreen({ user, onAddContact }: { user: AMTUser; onAddContact: ()=>void }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, padding:40, textAlign:'center' }}>
      <div style={{ width:96, height:96, borderRadius:28, background:'#0057FF', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 20px 60px rgba(0,87,255,0.3)', marginBottom:8 }}>
        <svg width="52" height="52" viewBox="0 0 22 22" fill="none">
          <path d="M4 17L6.5 11L9 17M4 17H9M6.5 11L5 8H8L6.5 11Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M13 8V17M13 8L16 17M16 17L19 8" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      </div>
      <h2 style={{ fontSize:28, fontWeight:800, color:'var(--text)', letterSpacing:-1, margin:0 }}>Hi, {user.displayName}! 👋</h2>
      <p style={{ color:'var(--text-muted)', fontSize:14, maxWidth:320, lineHeight:1.7, margin:0 }}>
        Select a conversation to start chatting, or add new contacts to connect.
      </p>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center' }}>
        {['🔒 End-to-end encrypted','📞 Voice & video calls','📸 24h Status updates','👥 Group chats'].map(t=>(
          <span key={t} style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontSize:12.5, fontWeight:500, padding:'6px 14px', borderRadius:20 }}>{t}</span>
        ))}
      </div>
      <button onClick={onAddContact} className="amt-btn" style={{ marginTop:8, padding:'12px 28px', borderRadius:14, fontSize:14, boxShadow:'0 8px 24px rgba(0,87,255,0.3)' }}>
        ➕ Add Contact
      </button>
    </div>
  );
}

function ChatHeader({ conv, user, onCall, onInfo, onBack }: { conv: Conversation; user: AMTUser; onCall:(t:'audio'|'video',u:AMTUser)=>void; onInfo:(u:AMTUser)=>void; onBack:()=>void; }) {
  const name = conv.isGroup ? conv.groupName || 'Group' : conv.participants.find(p=>p.id!==user.id)?.displayName || 'Unknown';
  const other = conv.participants.find(p=>p.id!==user.id);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', background:'var(--surface)', borderBottom:'1.5px solid var(--border)', minHeight:66 }}>
      <button className="amt-btn-ghost" onClick={onBack} style={{ width:32, height:32, borderRadius:8, fontSize:18 }}>←</button>
      <div style={{ position:'relative', cursor: other?'pointer':'default' }} onClick={()=>other&&onInfo(other)}>
        {conv.isGroup
          ? <div style={{ width:44, height:44, borderRadius:13, background:'var(--amt-light)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>👥</div>
          : <Avatar user={other||{}} size={44} radius={13}/>
        }
        {other?.online && !conv.isGroup && <div style={{ position:'absolute', bottom:-1, right:-1, width:12, height:12, borderRadius:'50%', background:'var(--online)', border:'2px solid var(--surface)' }}/>}
      </div>
      <div style={{ flex:1 }}>
        <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', margin:0, marginBottom:2 }}>{name}</p>
        <p style={{ fontSize:12, color: other?.online ? 'var(--online)' : 'var(--text-muted)', margin:0, fontWeight:500 }}>
          {conv.isGroup ? `${conv.participants.length} members` : other?.online ? '● Online' : other?.lastSeen ? `Last seen ${formatDistanceToNow(new Date(other.lastSeen), {addSuffix:true})}` : '● Offline'}
        </p>
      </div>
      <div style={{ display:'flex', gap:4 }}>
        {!conv.isGroup && other && <>
          <button onClick={()=>onCall('audio',other)} className="amt-btn-ghost" style={{ width:36, height:36, borderRadius:10, fontSize:18 }}>📞</button>
          <button onClick={()=>onCall('video',other)} className="amt-btn-ghost" style={{ width:36, height:36, borderRadius:10, fontSize:18 }}>📹</button>
        </>}
        <button className="amt-btn-ghost" style={{ width:36, height:36, borderRadius:10, fontSize:18 }}>⋮</button>
      </div>
    </div>
  );
}

function MessageBubble({ msg, isMe, conv, onReply }: { msg: Message; isMe: boolean; conv: Conversation; onReply:(m:Message)=>void }) {
  const time = format(new Date(msg.createdAt), 'HH:mm');
  return (
    <div style={{ display:'flex', justifyContent: isMe?'flex-end':'flex-start', marginBottom:4 }}>
      <div style={{ maxWidth:'65%', position:'relative', cursor:'pointer' }} onDoubleClick={()=>onReply(msg)}>
        {conv.isGroup && !isMe && <p style={{ fontSize:11, fontWeight:700, color:'#0057FF', marginBottom:3, paddingLeft:2 }}>{msg.senderName}</p>}
        <div style={{
          background: isMe ? 'var(--bubble-out)' : 'var(--bubble-in)',
          color: isMe ? 'var(--bubble-out-text)' : 'var(--bubble-in-text)',
          borderRadius: isMe ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
          padding:'9px 13px',
          boxShadow: isMe ? 'none' : '0 1px 4px rgba(0,0,0,0.08)',
          wordBreak:'break-word',
        }}>
          {msg.type==='text' && <p style={{ margin:0, fontSize:14.5, lineHeight:1.5 }}>{msg.content}</p>}
          {msg.type==='image' && msg.fileUrl && (
            <img src={msg.fileUrl} alt="img" style={{ maxWidth:220, borderRadius:10, display:'block', marginBottom:4 }}/>
          )}
          {msg.type==='audio' && msg.fileUrl && (
            <div style={{ minWidth:200 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ fontSize:20 }}>🎙️</span>
                <audio controls src={msg.fileUrl} style={{ flex:1, height:28 }}/>
              </div>
              {msg.audioDuration && <p style={{ fontSize:11, margin:0, opacity:0.7 }}>{formatDuration(msg.audioDuration)}</p>}
            </div>
          )}
          {msg.type==='file' && (
            <a href={msg.fileUrl} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:8, color:'inherit', textDecoration:'none' }}>
              <span style={{ fontSize:24 }}>📄</span>
              <span style={{ fontSize:13, fontWeight:500 }}>{msg.fileName||msg.content}</span>
            </a>
          )}
          {msg.type==='video' && msg.fileUrl && (
            <video src={msg.fileUrl} controls style={{ maxWidth:220, borderRadius:10 }}/>
          )}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4, marginTop:4 }}>
            <span style={{ fontSize:10.5, opacity:0.65 }}>{time}</span>
            {isMe && <Tick read={msg.read}/>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusTab({ statuses, user, onPost, onChat }: { statuses:Status[];user:AMTUser;onPost:()=>void;onChat:(u:AMTUser)=>void }) {
  const myStatus = statuses.find(s=>s.user.id===user.id);
  const others = statuses.filter(s=>s.user.id!==user.id);
  const [viewing, setViewing] = useState<Status|null>(null);

  return (
    <div>
      {/* My status */}
      <div onClick={onPost} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid var(--border)' }}>
        <div style={{ position:'relative' }}>
          <Avatar user={user} size={48} radius={24}/>
          <div style={{ position:'absolute', bottom:0, right:0, width:18, height:18, borderRadius:'50%', background:'#0057FF', border:'2px solid var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:12, fontWeight:700 }}>+</div>
        </div>
        <div>
          <p style={{ fontSize:14.5, fontWeight:600, color:'var(--text)', margin:0, marginBottom:3 }}>My Status</p>
          <p style={{ fontSize:12.5, color:'var(--text-muted)', margin:0 }}>{myStatus ? 'Tap to update' : 'Add status update'}</p>
        </div>
      </div>

      {others.length > 0 && <p style={{ padding:'10px 16px 4px', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:0.5 }}>Recent Updates</p>}

      {others.map(s => (
        <div key={s.id} onClick={()=>setViewing(s)} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', cursor:'pointer', borderBottom:'1px solid var(--border)' }}>
          <div style={{ padding:2, borderRadius:'50%', background:'linear-gradient(135deg,#0057FF,#00D2FF)' }}>
            <div style={{ padding:2, borderRadius:'50%', background:'var(--surface)' }}>
              <Avatar user={s.user} size={44} radius={22}/>
            </div>
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:14.5, fontWeight:600, color:'var(--text)', margin:0, marginBottom:2 }}>{s.user.displayName||s.user.username}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', margin:0 }}>{formatDistanceToNow(new Date(s.createdAt),{addSuffix:true})}</p>
          </div>
        </div>
      ))}

      {others.length === 0 && <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text-muted)', fontSize:14 }}>
        <p style={{ fontSize:36, marginBottom:12 }}>📸</p>
        <p>No status updates yet</p>
      </div>}

      {/* Status viewer */}
      {viewing && (
        <div className="modal-backdrop" onClick={()=>setViewing(null)}>
          <div style={{ width:'100%', maxWidth:400, background: viewing.type==='text' ? viewing.bgColor||'#0057FF' : '#000', borderRadius:20, overflow:'hidden', aspectRatio:'9/16', maxHeight:'80vh', position:'relative' }}>
            {viewing.mediaUrl && <img src={viewing.mediaUrl} alt="status" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>}
            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', justifyContent:'space-between', padding:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Avatar user={viewing.user} size={36} radius={18}/>
                <div>
                  <p style={{ color:'white', fontWeight:700, fontSize:14, margin:0, textShadow:'0 1px 4px rgba(0,0,0,0.5)' }}>{viewing.user.displayName}</p>
                  <p style={{ color:'rgba(255,255,255,0.8)', fontSize:11, margin:0 }}>{formatDistanceToNow(new Date(viewing.createdAt),{addSuffix:true})}</p>
                </div>
              </div>
              <p style={{ color:'white', fontSize:18, fontWeight:600, textAlign:'center', textShadow:'0 2px 8px rgba(0,0,0,0.5)', margin:0 }}>{viewing.content}</p>
              <button onClick={e=>{e.stopPropagation();onChat(viewing.user);setViewing(null);}} style={{ background:'rgba(255,255,255,0.2)', border:'1px solid rgba(255,255,255,0.3)', color:'white', padding:'10px 20px', borderRadius:12, cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:14, backdropFilter:'blur(4px)' }}>
                💬 Reply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CallsTab({ calls, user, contacts, onCall, onChat }: { calls:Call[];user:AMTUser;contacts:AMTUser[];onCall:(t:'audio'|'video',u:AMTUser)=>void;onChat:(u:AMTUser)=>void }) {
  return (
    <div>
      {calls.length === 0 && <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text-muted)' }}>
        <p style={{ fontSize:36, marginBottom:12 }}>📞</p>
        <p style={{ fontSize:14 }}>No call history yet</p>
      </div>}
      {calls.map(c => {
        const isOutgoing = c.callerId === user.id;
        const otherId = isOutgoing ? c.receiverId : c.callerId;
        const other = contacts.find(ct=>ct.id===otherId) || { id:otherId, username:'', displayName:c.callerName||'Unknown', avatarUrl:c.callerAvatar } as AMTUser;
        const icon = c.status==='missed'?'📵':isOutgoing?'📤':'📥';
        return (
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderBottom:'1px solid var(--border)' }}>
            <Avatar user={other} size={46} radius={13}/>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:14.5, fontWeight:600, color: c.status==='missed'?'var(--danger)':'var(--text)', margin:0, marginBottom:3 }}>
                {icon} {other.displayName||other.username}
              </p>
              <p style={{ fontSize:12, color:'var(--text-muted)', margin:0 }}>
                {c.type==='video'?'📹':'📞'} {c.status} · {c.startedAt ? formatDistanceToNow(new Date(c.startedAt),{addSuffix:true}) : ''}
                {c.duration ? ` · ${formatDuration(c.duration)}` : ''}
              </p>
            </div>
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={()=>onCall('audio',other)} className="amt-btn-ghost" style={{ width:34, height:34, borderRadius:9, fontSize:18 }}>📞</button>
              <button onClick={()=>onCall('video',other)} className="amt-btn-ghost" style={{ width:34, height:34, borderRadius:9, fontSize:18 }}>📹</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IncomingCallModal({ call, onAccept, onDecline }: { call:SignalData;onAccept:()=>void;onDecline:()=>void }) {
  return (
    <div className="modal-backdrop">
      <div className="amt-surface fade-in" style={{ borderRadius:24, padding:'36px 28px', textAlign:'center', width:320, boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }}>
        <p style={{ fontSize:36, marginBottom:8 }} className="call-ring">📞</p>
        <p style={{ fontSize:18, fontWeight:700, color:'var(--text)', marginBottom:4 }}>{call.callerName||'Unknown'}</p>
        <p style={{ fontSize:14, color:'var(--text-muted)', marginBottom:28 }}>Incoming {call.callType||'audio'} call…</p>
        <div style={{ display:'flex', gap:16, justifyContent:'center' }}>
          <button onClick={onDecline} style={{ width:60, height:60, borderRadius:'50%', background:'var(--danger)', border:'none', cursor:'pointer', fontSize:24, display:'flex', alignItems:'center', justifyContent:'center' }}>📵</button>
          <button onClick={onAccept} style={{ width:60, height:60, borderRadius:'50%', background:'var(--online)', border:'none', cursor:'pointer', fontSize:24, display:'flex', alignItems:'center', justifyContent:'center' }}>📞</button>
        </div>
      </div>
    </div>
  );
}

function ActiveCallModal({ call, localVideoRef, remoteVideoRef, onEnd, onToggleMute, onToggleVideo }: any) {
  return (
    <div className="modal-backdrop" style={{ background:'rgba(0,0,0,0.85)' }}>
      <div style={{ width:'100%', maxWidth:520, borderRadius:24, overflow:'hidden', background:'#1a1a2e', position:'relative', minHeight:420 }}>
        {call.type==='video' ? (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width:'100%', height:380, objectFit:'cover', background:'#000' }}/>
            <video ref={localVideoRef} autoPlay playsInline muted style={{ position:'absolute', top:16, right:16, width:100, height:140, borderRadius:12, objectFit:'cover', border:'2px solid rgba(255,255,255,0.3)' }}/>
          </>
        ) : (
          <div style={{ height:280, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
            <div style={{ width:80, height:80, borderRadius:24, background:'rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36 }}>👤</div>
            <p style={{ color:'white', fontWeight:700, fontSize:18 }}>{call.otherUser?.displayName||'Call'}</p>
            <p style={{ color:'rgba(255,255,255,0.6)', fontSize:14 }}>{formatDuration(call.duration)}</p>
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'center', gap:16, padding:'20px', background:'rgba(0,0,0,0.5)' }}>
          <button onClick={onToggleMute} style={{ width:54, height:54, borderRadius:'50%', background: call.muted?'var(--danger)':'rgba(255,255,255,0.2)', border:'none', cursor:'pointer', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {call.muted?'🔇':'🎙️'}
          </button>
          {call.type==='video' && (
            <button onClick={onToggleVideo} style={{ width:54, height:54, borderRadius:'50%', background: call.videoOff?'var(--danger)':'rgba(255,255,255,0.2)', border:'none', cursor:'pointer', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {call.videoOff?'📵':'📹'}
            </button>
          )}
          <button onClick={onEnd} style={{ width:54, height:54, borderRadius:'50%', background:'var(--danger)', border:'none', cursor:'pointer', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center' }}>📵</button>
        </div>
      </div>
    </div>
  );
}

function ProfileModal({ user, onUpdate, onLogout, onClose }: { user:AMTUser;onUpdate:(d:any)=>Promise<void>;onLogout:()=>void;onClose:()=>void }) {
  const [form, setForm] = useState({ displayName:user.displayName||'', phone:user.phone||'', bio:user.bio||'' });
  const [avatar, setAvatar] = useState<File|null>(null);
  const [preview, setPreview] = useState(user.avatarUrl||'');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    setLoading(true);
    try { await onUpdate({...form, avatar}); toast.success('Profile updated!'); onClose(); }
    catch { toast.error('Update failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="amt-surface fade-in" onClick={e=>e.stopPropagation()} style={{ borderRadius:24, padding:'32px 28px', width:'100%', maxWidth:420, boxShadow:'0 24px 80px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <h2 style={{ fontSize:20, fontWeight:800, color:'var(--text)', margin:0 }}>My Profile</h2>
          <button onClick={onClose} className="amt-btn-ghost" style={{ width:32, height:32, borderRadius:8, fontSize:18 }}>✕</button>
        </div>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ position:'relative', display:'inline-block' }}>
            <div onClick={()=>fileRef.current?.click()} style={{ width:88, height:88, borderRadius:'50%', cursor:'pointer', overflow:'hidden', border:'3px dashed #0057FF', background:'var(--input-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {preview ? <img src={preview} alt="av" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <span style={{ fontSize:32 }}>📷</span>}
            </div>
            <button onClick={()=>fileRef.current?.click()} style={{ position:'absolute', bottom:2, right:2, width:26, height:26, borderRadius:'50%', background:'#0057FF', border:'2px solid var(--surface)', color:'white', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f){setAvatar(f);setPreview(URL.createObjectURL(f));} }}/>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {[['Display Name','text',form.displayName,'displayName'],['Phone','tel',form.phone,'phone'],['Bio','text',form.bio,'bio']].map(([label,type,val,key])=>(
            <div key={key as string}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 }}>{label as string}</label>
              <input className="amt-input" type={type as string} value={val as string} onChange={e=>setForm(f=>({...f,[key as string]:e.target.value}))} style={{ width:'100%', padding:'11px 14px', borderRadius:12, fontSize:14 }}/>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:10, marginTop:24 }}>
          <button onClick={onLogout} style={{ flex:1, padding:'12px', borderRadius:12, background:'var(--input-bg)', border:'1.5px solid var(--border)', color:'var(--danger)', fontWeight:600, cursor:'pointer', fontFamily:'inherit', fontSize:14 }}>Sign Out</button>
          <button onClick={save} className="amt-btn" disabled={loading} style={{ flex:2, padding:'12px', borderRadius:12, fontSize:14 }}>{loading?'Saving…':'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

function AddContactModal({ onAdd, onClose }: { onAdd:(s:string)=>Promise<boolean>;onClose:()=>void }) {
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!val.trim()) return;
    setLoading(true);
    const ok = await onAdd(val.trim());
    setLoading(false);
    if (ok) onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="amt-surface fade-in" onClick={e=>e.stopPropagation()} style={{ borderRadius:24, padding:'32px 28px', width:'100%', maxWidth:380, boxShadow:'0 24px 80px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:'var(--text)', margin:'0 0 8px' }}>Add Contact</h2>
        <p style={{ color:'var(--text-muted)', fontSize:13, margin:'0 0 24px' }}>Search by username or phone number</p>
        <input className="amt-input" value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}
          placeholder="username or +233XXXXXXXXX" style={{ width:'100%', padding:'12px 16px', borderRadius:12, fontSize:14, marginBottom:16 }}/>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:12, background:'var(--input-bg)', border:'1.5px solid var(--border)', color:'var(--text)', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:14 }}>Cancel</button>
          <button onClick={submit} className="amt-btn" disabled={loading} style={{ flex:2, padding:'12px', borderRadius:12, fontSize:14 }}>{loading?'Searching…':'Add Contact'}</button>
        </div>
      </div>
    </div>
  );
}

function CreateGroupModal({ contacts, onCreate, onClose }: { contacts:AMTUser[];onCreate:(n:string,m:AMTUser[],a?:File)=>void;onClose:()=>void }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<AMTUser[]>([]);
  const [avatar, setAvatar] = useState<File|null>(null);
  const [preview, setPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const toggle = (u:AMTUser) => setSelected(s=>s.find(x=>x.id===u.id)?s.filter(x=>x.id!==u.id):[...s,u]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="amt-surface fade-in" onClick={e=>e.stopPropagation()} style={{ borderRadius:24, padding:'32px 28px', width:'100%', maxWidth:420, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:'var(--text)', margin:'0 0 24px' }}>Create Group</h2>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <div onClick={()=>fileRef.current?.click()} style={{ width:56, height:56, borderRadius:16, background:'var(--input-bg)', border:'2px dashed #0057FF', cursor:'pointer', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:24 }}>
            {preview ? <img src={preview} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : '📷'}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f){setAvatar(f);setPreview(URL.createObjectURL(f));} }}/>
          <input className="amt-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Group name" style={{ flex:1, padding:'11px 14px', borderRadius:12, fontSize:14 }}/>
        </div>
        <p style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:0.5 }}>Add Members</p>
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
          {contacts.map(c=>(
            <div key={c.id} onClick={()=>toggle(c)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:12, cursor:'pointer', background: selected.find(x=>x.id===c.id)?'var(--amt-light)':'transparent', transition:'background 0.15s' }}>
              <Avatar user={c} size={36} radius={11}/>
              <span style={{ flex:1, fontSize:14, fontWeight:500, color:'var(--text)' }}>{c.displayName||c.username}</span>
              {selected.find(x=>x.id===c.id) && <span style={{ color:'#0057FF', fontSize:18 }}>✓</span>}
            </div>
          ))}
          {contacts.length===0 && <p style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:'20px 0' }}>Add contacts first</p>}
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:12, background:'var(--input-bg)', border:'1.5px solid var(--border)', color:'var(--text)', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:14 }}>Cancel</button>
          <button onClick={()=>{ if(!name||selected.length<1) return toast.error('Name + at least 1 member'); onCreate(name,selected,avatar||undefined); }} className="amt-btn" style={{ flex:2, padding:'12px', borderRadius:12, fontSize:14 }}>Create Group ({selected.length})</button>
        </div>
      </div>
    </div>
  );
}

function CreateStatusModal({ onPost, onClose }: { onPost:(d:any)=>void;onClose:()=>void }) {
  const [type, setType] = useState<'text'|'image'>('text');
  const [text, setText] = useState('');
  const [bg, setBg] = useState('#0057FF');
  const [file, setFile] = useState<File|null>(null);
  const [preview, setPreview] = useState('');
  const COLORS = ['#0057FF','#22C55E','#EF4444','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#1a1a2e'];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="amt-surface fade-in" onClick={e=>e.stopPropagation()} style={{ borderRadius:24, padding:'32px 28px', width:'100%', maxWidth:400, boxShadow:'0 24px 80px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:'var(--text)', margin:'0 0 20px' }}>New Status</h2>
        <div style={{ display:'flex', gap:8, marginBottom:20 }}>
          {(['text','image'] as const).map(t=>(
            <button key={t} onClick={()=>setType(t)} style={{ flex:1, padding:'9px', borderRadius:10, border:`1.5px solid ${type===t?'#0057FF':'var(--border)'}`, background:type===t?'var(--amt-light)':'transparent', color:type===t?'#0057FF':'var(--text-muted)', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:13 }}>
              {t==='text'?'📝 Text':'🖼️ Image'}
            </button>
          ))}
        </div>
        {type==='text' && (
          <>
            <div style={{ borderRadius:14, padding:'20px', background:bg, marginBottom:16, minHeight:100, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <p style={{ color:'white', fontSize:16, fontWeight:600, textAlign:'center', margin:0, wordBreak:'break-word' }}>{text||'Type your status…'}</p>
            </div>
            <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="What's on your mind?" rows={2}
              style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--border)', background:'var(--input-bg)', color:'var(--text)', fontSize:14, fontFamily:'inherit', resize:'none', outline:'none', marginBottom:12 }}/>
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {COLORS.map(c=><div key={c} onClick={()=>setBg(c)} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border:`3px solid ${bg===c?'var(--text)':'transparent'}`, transition:'border 0.2s' }}/>)}
            </div>
          </>
        )}
        {type==='image' && (
          <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderRadius:14, border:'2px dashed var(--border)', padding:'28px', cursor:'pointer', marginBottom:16, background:'var(--input-bg)', overflow:'hidden', minHeight:140 }}>
            {preview ? <img src={preview} style={{ maxWidth:'100%', borderRadius:8 }}/> : <>
              <span style={{ fontSize:36 }}>🖼️</span>
              <span style={{ color:'var(--text-muted)', fontSize:13, marginTop:8 }}>Tap to choose photo</span>
            </>}
            <input type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f){setFile(f);setPreview(URL.createObjectURL(f));} }}/>
          </label>
        )}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:12, background:'var(--input-bg)', border:'1.5px solid var(--border)', color:'var(--text)', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:14 }}>Cancel</button>
          <button onClick={()=>{ if(type==='text'&&!text.trim()) return; onPost({type, content:text, bgColor:bg, file:file||undefined}); }} className="amt-btn" style={{ flex:2, padding:'12px', borderRadius:12, fontSize:14 }}>Post Status</button>
        </div>
      </div>
    </div>
  );
}

function ContactInfoModal({ user, onChat, onCall, onClose }: { user:AMTUser;onChat:()=>void;onCall:(t:'audio'|'video')=>void;onClose:()=>void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="amt-surface fade-in" onClick={e=>e.stopPropagation()} style={{ borderRadius:24, padding:'36px 28px', width:'100%', maxWidth:360, textAlign:'center', boxShadow:'0 24px 80px rgba(0,0,0,0.2)' }}>
        <Avatar user={user} size={80} radius={24}/>
        <h2 style={{ fontSize:22, fontWeight:800, color:'var(--text)', margin:'16px 0 4px' }}>{user.displayName}</h2>
        <p style={{ color:'var(--text-muted)', fontSize:13, margin:'0 0 4px' }}>@{user.username}</p>
        {user.phone && <p style={{ color:'var(--text-muted)', fontSize:13, margin:'0 0 4px' }}>📞 {user.phone}</p>}
        {user.bio && <p style={{ color:'var(--text-secondary)', fontSize:14, margin:'12px 0 20px', lineHeight:1.5 }}>{user.bio}</p>}
        <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:16 }}>
          <button onClick={onChat} className="amt-btn" style={{ padding:'10px 20px', borderRadius:12, fontSize:14 }}>💬 Message</button>
          <button onClick={()=>onCall('audio')} style={{ padding:'10px 20px', borderRadius:12, border:'1.5px solid var(--border)', background:'var(--input-bg)', color:'var(--text)', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:14 }}>📞 Call</button>
          <button onClick={()=>onCall('video')} style={{ padding:'10px 20px', borderRadius:12, border:'1.5px solid var(--border)', background:'var(--input-bg)', color:'var(--text)', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:14 }}>📹 Video</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background: user.online?'var(--online)':'var(--text-muted)' }}/>
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>{user.online?'Online now':'Offline'}</span>
        </div>
      </div>
    </div>
  );
}
