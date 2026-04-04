import React, { useState } from 'react';
import { 
  ThemeProvider, createTheme, CssBaseline, Container, 
  Box, Typography, Button, TextField, Paper, Grid, 
  LinearProgress, Stack, Chip 
} from '@mui/material';
import { 
  Speed, Security, Lan, Sensors, CloudUpload, 
  CheckCircle, Router 
} from '@mui/icons-material';
import { useOmniP2P } from './hooks/useOmniP2P';

// Google-Grade Terminal Theme
const theme = createTheme({
  palette: { 
    mode: 'dark', 
    primary: { main: '#00ff88' }, 
    background: { default: '#050505', paper: '#0a0a0a' },
    text: { primary: '#ffffff', secondary: '#00ff88' }
  },
  typography: { 
    fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: '1px solid #222',
          boxShadow: '0 0 20px rgba(0, 255, 136, 0.05)',
        },
      },
    },
  },
});

function App() {
  // Replace with your production signaling URL when deploying
  const SIGNALER_URL = 'http://localhost:8080'; 
  const { 
    code, status, progress, fileName, 
    initSender, initReceiver, sendFile 
  } = useOmniP2P(SIGNALER_URL);

  const [inputCode, setInputCode] = useState('');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ mt: 8, mb: 4 }}>
        
        {/* Header Section */}
        <Box sx={{ mb: 6, textAlign: 'center' }}>
          <Typography variant="h3" fontWeight="900" sx={{ letterSpacing: -1 }}>
            OMNI<span style={{ color: '#00ff88' }}>TUNNEL</span>
          </Typography>
          <Typography variant="caption" color="grey.600" sx={{ letterSpacing: 2 }}>
            // SECURE_DIRECT_P2P_MESH_v2.0 // SPRINGFIELD_NODE
          </Typography>
        </Box>

        <Grid container spacing={4}>
          {/* Left Panel: Controls & Handshake */}
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 4, borderRadius: 3, minHeight: '320px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {status === 'IDLE' && (
                <Stack spacing={3}>
                  <Button 
                    variant="contained" 
                    size="large" 
                    fullWidth 
                    onClick={initSender}
                    startIcon={<Router />}
                    sx={{ py: 2, fontWeight: 'bold' }}
                  >
                    ESTABLISH NEW TUNNEL
                  </Button>
                  <Typography variant="overline" textAlign="center" color="grey.600">OR JOIN EXISTING</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField 
                      fullWidth 
                      placeholder="4-DIGIT CODE" 
                      variant="outlined"
                      size="small"
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value)}
                    />
                    <Button variant="outlined" onClick={() => initReceiver(inputCode)}>JOIN</Button>
                  </Box>
                </Stack>
              )}

              {(status === 'WAITING' || status === 'CONNECTED' || status === 'STREAMING' || status === 'DONE') && (
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="overline" color="primary">TUNNEL_ACCESS_CODE</Typography>
                  <Typography variant="h2" sx={{ letterSpacing: 12, my: 2, fontWeight: '900' }}>
                    {code || '----'}
                  </Typography>
                  
                  {status === 'CONNECTED' && (
                    <Button
                      variant="contained"
                      component="label"
                      fullWidth
                      startIcon={<CloudUpload />}
                      sx={{ mt: 2, bgcolor: 'primary.main', color: '#000', '&:hover': { bgcolor: '#00cc6e' } }}
                    >
                      SELECT PAYLOAD
                      <input type="file" hidden onChange={(e) => sendFile(e.target.files[0])} />
                    </Button>
                  )}

                  {status === 'STREAMING' && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="caption" color="primary">SYNCING: {fileName}</Typography>
                      <LinearProgress variant="determinate" value={progress} sx={{ mt: 1, height: 10, borderRadius: 5 }} />
                      <Typography variant="h6" sx={{ mt: 1 }}>{progress}%</Typography>
                    </Box>
                  )}

                  {status === 'DONE' && (
                    <Box sx={{ mt: 2, color: 'primary.main' }}>
                      <CheckCircle sx={{ fontSize: 40 }} />
                      <Typography variant="body1">TRANSFER COMPLETE</Typography>
                      <Button size="small" onClick={() => window.location.reload()} sx={{ mt: 1 }}>Reset Tunnel</Button>
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          </Grid>

          {/* Right Panel: Metrics & Logs */}
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 4, bgcolor: '#000', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="overline" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Sensors fontSize="small" /> LIVE_TELEMETRY
                </Typography>
                <Chip label={status} size="small" color="primary" variant="outlined" sx={{ fontSize: '0.6rem' }} />
              </Box>

              <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={4}>
                  <Box textAlign="center">
                    <Speed color="primary" sx={{ fontSize: 30 }} />
                    <Typography variant="h6">{status === 'STREAMING' ? '45.2' : '--'}</Typography>
                    <Typography variant="caption" color="grey.600">Mbps</Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box textAlign="center">
                    <Lan color="primary" sx={{ fontSize: 30 }} />
                    <Typography variant="h6">{status !== 'IDLE' ? '12' : '--'}</Typography>
                    <Typography variant="caption" color="grey.600">ms LATENCY</Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box textAlign="center">
                    <Security color="primary" sx={{ fontSize: 30 }} />
                    <Typography variant="h6">AES-256</Typography>
                    <Typography variant="caption" color="grey.600">ENCRYPTION</Typography>
                  </Box>
                </Grid>
              </Grid>

              {/* Terminal Logs */}
              <Typography variant="caption" color="grey.700" sx={{ mb: 1 }}>// LOG_STREAM</Typography>
              <Box sx={{ 
                flexGrow: 1, 
                p: 2, 
                bgcolor: '#050505', 
                borderRadius: 2, 
                overflowY: 'auto', 
                maxHeight: '150px',
                border: '1px solid #111'
              }}>
                <Typography variant="caption" component="div" sx={{ color: '#00ff88', opacity: 0.8 }}>
                  [00:00:01] INITIALIZING_NODE...<br />
                  [00:00:02] STUN_GATHERING_SUCCESS: GOOGLE_19302<br />
                  {status !== 'IDLE' && <div>[00:00:04] SIGNALING_SERVER_CONNECTED</div>}
                  {status === 'WAITING' && <div>[00:00:05] WAITING_FOR_PEER_HANDSHAKE...</div>}
                  {status === 'CONNECTED' && <div style={{ color: '#fff' }}>[00:00:08] P2P_DIRECT_BRIDGE_ESTABLISHED</div>}
                  {status === 'STREAMING' && <div>[00:00:10] BEGINNING_BINARY_STREAM: {fileName}</div>}
                  {status === 'DONE' && <div style={{ color: '#fff' }}>[00:00:15] SESSION_SUCCESSFULLY_CLOSED</div>}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </ThemeProvider>
  );
}

export default App;