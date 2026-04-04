import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
// Use minified build to bypass CommonJS/ESM compatibility issues in Vite
import Peer from 'simple-peer/simplepeer.min.js';

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
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

  // Handle Vite's "Default" vs "Named" import quirks
  const PeerConstructor = Peer.default || Peer;

  useEffect(() => {
    // 1. Initialize Socket
    socketRef.current = io(serverUrl);

    // 2. Global Signal Listener (Handles the handshake exchange)
    socketRef.current.on('signal', ({ signal }) => {
      if (peerRef.current && !peerRef.current.destroyed) {
        console.log("[P2P] Processing signaling data...");
        peerRef.current.signal(signal);
      }
    });

    // 3. Cleanup on Unmount
    return () => {
      if (peerRef.current) peerRef.current.destroy();
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    };
  }, [serverUrl]);

  const setupPeerEvents = (p, targetId) => {
    p.on('signal', s => {
      socketRef.current.emit('signal', { to: targetId, signal: s });
    });

    p.on('connect', () => {
      console.log("[P2P] SUCCESS: BRIDGE_ACTIVE");
      setStatus('CONNECTED');
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
        // Binary chunk received
        chunksRef.current.push(data);
        const receivedSize = chunksRef.current.reduce((acc, curr) => acc + curr.byteLength, 0);
        const percent = Math.round((receivedSize / metaRef.current.size) * 100);
        setProgress(percent);

        if (receivedSize >= metaRef.current.size) {
          const blob = new Blob(chunksRef.current);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; 
          a.download = metaRef.current.name; 
          a.click();
          setStatus('DONE');
        }
      }
    });

    p.on('error', err => {
      console.error("[P2P] Peer Error:", err);
      setStatus('IDLE'); // Reset on error
      peerRef.current = null;
    });
  };

  const initSender = () => {
    if (status !== 'IDLE') return; // Prevent double-init
    
    console.log("[SYSTEM] Creating Room...");
    socketRef.current.emit('room:create');
    
    socketRef.current.on('room:created', (newCode) => {
      setCode(newCode);
      setStatus('WAITING');
    });

    socketRef.current.on('peer:joined', ({ peerId }) => {
      // Guard: Only start ONE peer instance
      if (peerRef.current) return; 

      console.log("[SYSTEM] Remote Peer Found. Initiating Handshake...");
      const p = new PeerConstructor({ 
        initiator: true, 
        trickle: true, 
        config: STUN_SERVERS 
      });

      setupPeerEvents(p, peerId);
      peerRef.current = p;
    });
  };

  const initReceiver = (inputCode) => {
    if (!inputCode || status !== 'IDLE') return; 
    
    console.log("[SYSTEM] Attempting Join for Code:", inputCode);
    setStatus('CONNECTING');
    socketRef.current.emit('room:join', inputCode);
    
    socketRef.current.on('peer:joined', ({ peerId }) => {
      if (peerRef.current) return; 

      console.log("[SYSTEM] Handshake Requesting...");
      const p = new PeerConstructor({ 
        initiator: false, 
        trickle: true, 
        config: STUN_SERVERS 
      });
      setupPeerEvents(p, peerId);
      peerRef.current = p;
    });
  };

  const sendFile = (file) => {
    if (!peerRef.current || !file) return;
    setFileName(file.name);
    setStatus('STREAMING');
    
    peerRef.current.send(JSON.stringify({ 
      type: 'meta', 
      name: file.name, 
      size: file.size 
    }));

    const chunkSize = 16384; 
    let offset = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!peerRef.current) return;
      peerRef.current.send(e.target.result);
      offset += e.target.result.byteLength;
      setProgress(Math.round((offset / file.size) * 100));
      if (offset < file.size) readNext(); else setStatus('DONE');
    };

    const readNext = () => reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
    readNext();
  };

  return { code, status, progress, fileName, initSender, initReceiver, sendFile };
};