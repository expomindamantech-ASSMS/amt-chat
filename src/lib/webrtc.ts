// src/lib/webrtc.ts
import Peer from 'simple-peer';

export interface PeerConnection {
  peer: Peer.Instance;
  stream?: MediaStream;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export async function getLocalStream(video: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
  } catch (err) {
    // Fallback: audio only
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

export function createPeer(opts: {
  initiator: boolean;
  stream: MediaStream;
  onSignal: (signal: any) => void;
  onStream: (stream: MediaStream) => void;
  onConnect?: () => void;
  onClose?: () => void;
  onError?: (err: Error) => void;
}): Peer.Instance {
  const peer = new Peer({
    initiator: opts.initiator,
    trickle: true,
    stream: opts.stream,
    config: { iceServers: ICE_SERVERS },
  });

  peer.on('signal', opts.onSignal);
  peer.on('stream', opts.onStream);
  peer.on('connect', () => opts.onConnect?.());
  peer.on('close', () => opts.onClose?.());
  peer.on('error', (err) => opts.onError?.(err));

  return peer;
}

export function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop());
}

export function toggleAudio(stream: MediaStream | null, enabled: boolean) {
  if (!stream) return;
  stream.getAudioTracks().forEach(t => { t.enabled = enabled; });
}

export function toggleVideo(stream: MediaStream | null, enabled: boolean) {
  if (!stream) return;
  stream.getVideoTracks().forEach(t => { t.enabled = enabled; });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
