import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer/simplepeer.min.js';

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' }
  ],
  iceCandidatePoolSize: 10,
};

export const useOmniP2P = (serverUrl) => {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('IDLE');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  
  const socketRef = useRef();
  const peerRef = useRef();
  const chunksRef = useRef([]);
  const metaRef = useRef(null);
  const signalQueue = useRef([]); 

  const PeerConstructor = Peer.default || Peer;

  useEffect(() => {
    socketRef.current = io(serverUrl);

    socketRef.current.on('signal', ({ signal }) => {
      if (peerRef.current && !peerRef.current.destroyed) {
        try {
          peerRef.current.signal(signal);
        } catch (e) {
          signalQueue.current.push(signal);
        }
      } else {
        signalQueue.current.push(signal);
      }
    });

    return () => {
      if (peerRef.current) peerRef.current.destroy();
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    };
  }, [serverUrl]);

  const flushSignalQueue = () => {
    if (!peerRef.current) return;
    while (signalQueue.current.length > 0) {
      const s = signalQueue.current.shift();
      peerRef.current.signal(s);
    }
  };

  const setupPeerEvents = (p) => {
    p.on('connect', () => {
      console.log("[SUCCESS] P2P_BRIDGE_ESTABLISHED");
      setStatus('CONNECTED'); 
    });

    p.on('iceStateChange', (state) => {
      console.log("[P2P] ICE_STATE:", state);
      if (state === 'connected' || state === 'completed') setStatus('CONNECTED');
      if (state === 'failed') setStatus('ERROR');
    });
    
    p.on('data', data => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'meta') {
          metaRef.current = msg;
          chunksRef.current = [];
          setFileName(msg.name);
          setStatus('STREAMING');
        }
      } catch (e) {
        chunksRef.current.push(data);
        const receivedSize = chunksRef.current.reduce((acc, curr) => acc + curr.byteLength, 0);
        setProgress(Math.round((receivedSize / metaRef.current.size) * 100));

        if (receivedSize >= metaRef.current.size) {
          const blob = new Blob(chunksRef.current);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = metaRef.current.name; a.click();
          setStatus('DONE');
        }
      }
    });

    p.on('error', err => {
      console.error("[P2P] Peer Error:", err);
      setStatus('IDLE');
      peerRef.current = null;
    });
  };

  const initSender = () => {
    if (status !== 'IDLE') return;
    socketRef.current.emit('room:create');
    socketRef.current.on('room:created', (newCode) => {
      setCode(newCode);
      setStatus('WAITING');
    });

    socketRef.current.on('peer:joined', ({ peerId }) => {
      if (peerRef.current) return; 
      const p = new PeerConstructor({ initiator: true, trickle: true, config: STUN_SERVERS });
      p.on('signal', s => socketRef.current.emit('signal', { to: peerId, signal: s }));
      setupPeerEvents(p);
      peerRef.current = p;
      setTimeout(flushSignalQueue, 100); 
    });
  };

  const initReceiver = (inputCode) => {
    if (!inputCode || status !== 'IDLE') return; 
    setStatus('CONNECTING');
    const p = new PeerConstructor({ initiator: false, trickle: true, config: STUN_SERVERS });
    peerRef.current = p;
    setupPeerEvents(p);

    socketRef.current.emit('room:join', inputCode);
    socketRef.current.on('peer:joined', ({ peerId }) => {
      p.on('signal', s => socketRef.current.emit('signal', { to: peerId, signal: s }));
      flushSignalQueue();
    });
  };

  // REFACTORED: SendFile with Closure Protection
  const sendFile = useCallback((file) => {
    const peer = peerRef.current;
    if (!peer || !file) {
      console.error("[P2P] Cannot send: Peer connection not ready.");
      return;
    }

    setFileName(file.name);
    setStatus('STREAMING');
    
    // Step 1: Send Metadata
    peer.send(JSON.stringify({ type: 'meta', name: file.name, size: file.size }));

    const chunkSize = 16384; 
    let offset = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!peer || peer.destroyed) return;
      
      peer.send(e.target.result);
      offset += e.target.result.byteLength;
      setProgress(Math.round((offset / file.size) * 100));

      if (offset < file.size) {
        // Backpressure check: wait if the buffer is getting too full
        if (peer.bufferedAmount > 8 * 1024 * 1024) {
           setTimeout(readNext, 50);
        } else {
           readNext();
        }
      } else {
        setStatus('DONE');
      }
    };

    const readNext = () => {
      if (offset < file.size) {
        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
      }
    };

    readNext();
  }, []);

  return { code, status, progress, fileName, initSender, initReceiver, sendFile };
};