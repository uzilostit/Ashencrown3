import { wsClient } from './wsClient.ts';

export interface VoicePeerState {
  peerId: string;
  mutedByMe: boolean;
  connected: boolean;
  speaking: boolean;
}

/**
 * Experimental direct WebRTC proximity voice mesh.
 * Does NOT assume STUN/TURN servers exist; reports clear unavailable status
 * when microphone permission or peer connectivity cannot be established.
 */
class ProximityVoiceManager {
  private localStream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private peerGains = new Map<string, GainNode>();
  private mutedPeers = new Set<string>();
  private audioCtx: AudioContext | null = null;
  private selfMuted = true;
  private voiceVolume = 0.85;
  public available = false;
  public statusReason = 'Voice chat off — click to enable microphone';
  private listeners = new Set<() => void>();

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  public async enableVoice(): Promise<boolean> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      this.available = false;
      this.statusReason = 'Voice unavailable in this browser';
      this.notify();
      return false;
    }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.selfMuted = false;
      this.available = true;
      this.statusReason = 'Proximity voice active (direct P2P)';
      wsClient.send({ type: 'voice_state', payload: { speaking: true } });
      this.notify();
      return true;
    } catch {
      this.available = false;
      this.statusReason = 'Voice unavailable — microphone denied or absent';
      this.notify();
      return false;
    }
  }

  public toggleSelfMute() {
    if (!this.localStream) {
      void this.enableVoice();
      return;
    }
    this.selfMuted = !this.selfMuted;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !this.selfMuted;
    }
    wsClient.send({ type: 'voice_state', payload: { speaking: !this.selfMuted } });
    this.statusReason = this.selfMuted ? 'Microphone muted' : 'Proximity voice active';
    this.notify();
  }

  public isSelfMuted(): boolean {
    return this.selfMuted;
  }

  public togglePeerMute(peerId: string) {
    if (this.mutedPeers.has(peerId)) this.mutedPeers.delete(peerId);
    else this.mutedPeers.add(peerId);
    this.notify();
  }

  public isPeerMuted(peerId: string): boolean {
    return this.mutedPeers.has(peerId);
  }

  public setVoiceVolume(v: number) {
    this.voiceVolume = Math.max(0, Math.min(1, v));
  }

  public async connectToPeer(peerId: string, initiator: boolean) {
    if (!this.available || !this.localStream || this.peers.has(peerId)) return;
    try {
      // No hardcoded external STUN/TURN requirement — direct ICE gathering
      const pc = new RTCPeerConnection({ iceServers: [] });
      this.peers.set(peerId, pc);
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          wsClient.send({
            type: 'rtc_signal',
            payload: { targetId: peerId, signal: { candidate: e.candidate } },
          });
        }
      };

      pc.ontrack = (e) => {
        const stream = e.streams[0];
        if (!stream) return;
        this.attachRemoteStream(peerId, stream);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          this.disconnectPeer(peerId);
        }
      };

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsClient.send({
          type: 'rtc_signal',
          payload: { targetId: peerId, signal: { sdp: pc.localDescription } },
        });
      }
    } catch {
      this.statusReason = 'Voice unavailable — peer connection could not initialize';
      this.notify();
    }
  }

  public async handleSignal(fromId: string, signal: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
    if (!this.available || !this.localStream) return;
    if (!this.peers.has(fromId)) {
      await this.connectToPeer(fromId, false);
    }
    const pc = this.peers.get(fromId);
    if (!pc) return;
    try {
      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          wsClient.send({
            type: 'rtc_signal',
            payload: { targetId: fromId, signal: { sdp: pc.localDescription } },
          });
        }
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch {
      // Ignore signaling race
    }
  }

  private attachRemoteStream(peerId: string, stream: MediaStream) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      const src = this.audioCtx.createMediaStreamSource(stream);
      const gain = this.audioCtx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(this.audioCtx.destination);
      this.peerGains.set(peerId, gain);
    } catch {
      // fallback audio element if Web Audio fails
    }
  }

  public updateProximities(
    localPos: { x: number; z: number },
    remotePlayers: Array<{ id: string; x: number; z: number; alive: boolean }>
  ) {
    const maxDist = 32;
    for (const rp of remotePlayers) {
      const gain = this.peerGains.get(rp.id);
      if (!gain || !this.audioCtx) continue;
      if (!rp.alive || this.mutedPeers.has(rp.id)) {
        gain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.08);
        continue;
      }
      const d = Math.hypot(rp.x - localPos.x, rp.z - localPos.z);
      const atten = Math.max(0, 1 - d / maxDist) * this.voiceVolume;
      gain.gain.setTargetAtTime(atten, this.audioCtx.currentTime, 0.08);
    }
  }

  public disconnectPeer(peerId: string) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
    this.peerGains.delete(peerId);
  }

  public dispose() {
    for (const id of this.peers.keys()) this.disconnectPeer(id);
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = null;
    }
    this.available = false;
    this.selfMuted = true;
    this.notify();
  }
}

export const voiceManager = new ProximityVoiceManager();
