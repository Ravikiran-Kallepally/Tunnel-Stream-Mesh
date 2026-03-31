import React, { useState, useEffect } from 'react';
import { IPC_CHANNELS, ProgressPayload, TransferState } from '@omnitunnel/ipc-types';

export const App = () => {
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [mode, setMode] = useState<'SEND' | 'RECEIVE' | null>(null);

  useEffect(() => {
    // Listen for real-time updates from the Main Process (main.ts)
    window.electron.on(IPC_CHANNELS.PROGRESS_UPDATE, (payload: ProgressPayload) => {
      setProgress(payload);
    });

    // Catch the 4-digit code if we are the sender
    window.electron.on(IPC_CHANNELS.CODE_GENERATED, (code: string) => {
      setInputCode(code);
    });
  }, []);

  const handleSelectFile = async () => {
    const file = await window.electron.invoke(IPC_CHANNELS.SELECT_FILE);
    if (file) {
      setMode('SEND');
      window.electron.invoke(IPC_CHANNELS.START_TRANSFER, { 
        mode: 'SEND', 
        filePath: file.path 
      });
    }
  };

  const handleJoin = () => {
    setMode('RECEIVE');
    window.electron.invoke(IPC_CHANNELS.START_TRANSFER, { 
      mode: 'RECEIVE', 
      code: inputCode 
    });
  };

  // 1. IDLE STATE: The Choice
  if (!progress || progress.state === 'IDLE') {
    return (
      <div className="h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">
        <h1 className="text-5xl font-black mb-2 bg-gradient-to-r from-cyan-400 to-blue-600 bg-clip-text text-transparent">
          OmniTunnel
        </h1>
        <p className="text-slate-500 mb-12 tracking-widest uppercase text-sm">P2P Gigabit Bridge</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
          <button onClick={handleSelectFile} className="group p-8 rounded-3xl bg-slate-900 border border-slate-800 hover:border-cyan-500 transition-all text-left">
            <div className="text-cyan-400 text-3xl mb-4">↑</div>
            <h2 className="text-2xl font-bold mb-2">Send File</h2>
            <p className="text-slate-400 text-sm">Bridge a local file to another device instantly.</p>
          </button>

          <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 focus-within:border-emerald-500 transition-all">
            <div className="text-emerald-400 text-3xl mb-4">↓</div>
            <h2 className="text-2xl font-bold mb-2">Receive</h2>
            <input 
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 mt-2 text-center text-3xl tracking-[0.5em] font-mono outline-none focus:border-emerald-500 transition-all"
              placeholder="0000"
              maxLength={4}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
            />
            <button onClick={handleJoin} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all">
              Join Bridge
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. HANDSHAKING: The Code Display
  if (progress.state === 'HANDSHAKING' && mode === 'SEND') {
    return (
      <div className="h-screen bg-slate-950 text-white flex flex-col items-center justify-center">
        <p className="text-slate-400 mb-4">Ready to Bridge. Enter this code on the receiver:</p>
        <div className="text-9xl font-black tracking-tighter text-cyan-500 animate-pulse">
          {inputCode}
        </div>
        <div className="mt-12 flex items-center gap-3 text-slate-500">
          <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping" />
          Waiting for peer...
        </div>
      </div>
    );
  }

  // 3. TRANSFERRING: The Progress Bar
  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-12">
      <div className="w-full max-w-2xl">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-3xl font-black">{progress.percentage}%</h2>
            <p className="text-slate-400 text-sm">{progress.speedMbps.toFixed(1)} Mbps</p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-sm">Remaining</p>
            <p className="font-mono">{Math.floor(progress.estimatedTimeRemaining / 60)}m {progress.estimatedTimeRemaining % 60}s</p>
          </div>
        </div>

        <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        
        <p className="mt-6 text-center text-slate-500 italic">
          {progress.state === 'VERIFYING' ? 'Finalizing Integrity Check...' : 'Streaming via P2P Tunnel'}
        </p>
      </div>
    </div>
  );
};