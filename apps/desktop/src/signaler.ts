import { EventEmitter } from 'events';

export class Signaler extends EventEmitter {
  private pc: RTCPeerConnection;
  private socket: WebSocket;
  private remoteDescriptionSet = false;
  private candidateQueue: RTCIceCandidateInit[] = [];
  public dataChannel: RTCDataChannel | null = null;

  constructor(private url: string, iceServers: RTCIceServer[]) {
    super();
    this.pc = new RTCPeerConnection({ iceServers });
    this.socket = new WebSocket(url);
    this.setupSocket();
    this.setupPeerConnection();
  }

  private setupSocket() {
    this.socket.onopen = () => this.emit('connected');
    this.socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'CODE_ASSIGNED') this.emit('CODE_ASSIGNED', msg.code);
      if (msg.type === 'SIGNAL') this.handleSignal(msg.data);
    };
  }

  private setupPeerConnection() {
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.emit('signal_out', { type: 'candidate', candidate: e.candidate });
      }
    };

    // RECEIVER SIDE: When the sender opens a channel, we catch it here
    this.pc.ondatachannel = (e) => {
      this.dataChannel = e.channel;
      this.emit('channel_ready', e.channel);
    };
  }

  /**
   * SENDER SIDE: Create the pipe before the offer
   */
  public async initiateOffer() {
    this.dataChannel = this.pc.createDataChannel('transfer', {
      ordered: false,
      maxRetransmits: 0
    });
    
    // Set 16MB threshold for high-speed backpressure
    this.dataChannel.bufferedAmountLowThreshold = 16 * 1024 * 1024;

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.emit('signal_out', { type: 'offer', sdp: offer });
  }

  public async handleSignal(data: any) {
    if (data.type === 'offer') {
      await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      this.remoteDescriptionSet = true;
      
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.emit('signal_out', { type: 'answer', sdp: answer });
      
      await this.processCandidateQueue();
    } else if (data.type === 'answer') {
      await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      this.remoteDescriptionSet = true;
      await this.processCandidateQueue();
    } else if (data.type === 'candidate') {
      if (!this.remoteDescriptionSet) {
        this.candidateQueue.push(data.candidate);
      } else {
        await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    }
  }

  private async processCandidateQueue() {
    while (this.candidateQueue.length > 0) {
      const candidate = this.candidateQueue.shift()!;
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  public sendSignal(code: string, data: any) {
    this.socket.send(JSON.stringify({ type: 'SIGNAL', code, data }));
  }
}