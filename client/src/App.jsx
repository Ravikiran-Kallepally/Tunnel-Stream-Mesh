import React, { useState, useEffect, useRef } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Container, Box, Typography, Button, TextField, Paper, Grid } from '@mui/material';
import { Speed, Security, Lan, Sensors } from '@mui/icons-material';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';

// The "Terminal" Theme
const theme = createTheme({
  palette: { mode: 'dark', primary: { main: '#00ff88' }, background: { default: '#050505', paper: '#0a0a0a' } },
  typography: { fontFamily: "'JetBrains Mono', monospace" }
});

function App() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('IDLE');
  const [inputCode, setInputCode] = useState('');
  const socketRef = useRef();
  const peerRef = useRef();

  useEffect(() => {
    socketRef.current = io('http://localhost:8080');
    socketRef.current.on('signal', ({ signal }) => peerRef.current?.signal(signal));
  }, []);

  const handleHost = () => {
    socketRef.current.emit('room:create');
    socketRef.current.on('room:created', (c) => { setCode(c); setStatus('WAITING'); });
    socketRef.current.on('peer:joined', ({ peerId }) => {
      const p = new SimplePeer({ 
        initiator: true, 
        trickle: true, 
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } 
      });
      p.on('signal', s => socketRef.current.emit('signal', { to: peerId, signal: s }));
      p.on('connect', () => setStatus('CONNECTED'));
      peerRef.current = p;
    });
  };

  const handleJoin = () => {
    socketRef.current.emit('room:join', inputCode);
    socketRef.current.on('signal', ({ from, signal }) => {
      if (!peerRef.current) {
        const p = new SimplePeer({ 
          initiator: false, 
          trickle: true, 
          config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } 
        });
        p.on('signal', s => socketRef.current.emit('signal', { to: from, signal: s }));
        p.on('connect', () => setStatus('CONNECTED'));
        peerRef.current = p;
      }
      peerRef.current.signal(signal);
    });
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ mt: 8 }}>
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" fontWeight="900" color="primary">OMNITUNNEL</Typography>
          <Typography variant="caption" color="grey.600">// SECURE_DIRECT_P2P_MESH_v2.0</Typography>
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 4, border: '1px solid #222', borderRadius: 3 }}>
              {status === 'IDLE' ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Button variant="contained" size="large" fullWidth onClick={handleHost}>CREATE TUNNEL</Button>
                  <Typography variant="overline" textAlign="center">OR</Typography>
                  <TextField fullWidth placeholder="4-DIGIT CODE" onChange={e => setInputCode(e.target.value)} />
                  <Button variant="outlined" fullWidth onClick={handleJoin}>JOIN TUNNEL</Button>
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="overline" color="primary">ACTIVE_CODE</Typography>
                  <Typography variant="h2" sx={{ letterSpacing: 10, my: 2 }}>{code || '....'}</Typography>
                  <Typography variant="caption" color="grey.500">{status}</Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 3, bgcolor: '#000', border: '1px solid #111', height: '100%' }}>
              <Typography variant="overline" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Sensors fontSize="small" /> LIVE_METRICS
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-around' }}>
                <Box textAlign="center"><Speed color="primary" /><Typography variant="h6">-- Mbps</Typography></Box>
                <Box textAlign="center"><Lan color="primary" /><Typography variant="h6">-- ms</Typography></Box>
                <Box textAlign="center"><Security color="primary" /><Typography variant="h6">AES-256</Typography></Box>
              </Box>
              <Box sx={{ mt: 4, p: 2, bgcolor: '#050505', color: '#00ff88', fontSize: '0.7rem', height: 100, overflowY: 'auto' }}>
                <div>[SYSTEM] INITIALIZING...</div>
                {status !== 'IDLE' && <div>[SYSTEM] GATHERING_ICE_CANDIDATES...</div>}
                {status === 'CONNECTED' && <div>[SUCCESS] TUNNEL_ESTABLISHED_VIA_STUN</div>}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </ThemeProvider>
  );
}

export default App;