import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { IPC_CHANNELS, TransferState, ProgressPayload } from '@omnitunnel/ipc-types';
import { TransferManager, DEFAULT_CHUNK_SIZE } from '@omnitunnel/protocol';
import { Signaler } from './signaler';
import { StateStore } from './state-store';

class MainController {
  private currentState: TransferState = 'IDLE';
  private manager: TransferManager | null = null;
  private signaler: Signaler | null = null;
  private store: StateStore;
  private speedWindow: { bytes: number; time: number }[] = [];
  private lastUpdateTimestamp = 0;
  private activeCode: string = '';

  constructor(private window: BrowserWindow) {
    // Initialize SQLite in the user's app data folder
    const dbPath = path.join(app.getPath('userData'), 'omnitunnel.db');
    this.store = new StateStore(dbPath);
    this.setupIPC();
  }

  private setupIPC() {
    // 1. File Picker
    ipcMain.handle(IPC_CHANNELS.SELECT_FILE, async () => {
      const result = await dialog.showOpenDialog(this.window, {
        properties: ['openFile'],
        title: 'Select 100GB+ File to Bridge'
      });
      return result.canceled ? null : { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
    });

    // 2. Start Transfer (The Handshake)
    ipcMain.handle(IPC_CHANNELS.START_TRANSFER, async (_, req) => {
      if (this.currentState !== 'IDLE') return;
      
      this.signaler = new Signaler('ws://localhost:8080', [{ urls: 'stun:stun.l.google.com:19302' }]);
      this.setState('CONNECTING');

      this.signaler.on('connected', async () => {
        if (req.mode === 'SEND') {
          this.activeCode = await this.signaler!.requestCode();
          this.window.webContents.send(IPC_CHANNELS.CODE_GENERATED, this.activeCode);
          this.setState('HANDSHAKING');
          await this.signaler!.initiateOffer();
        } else {
          this.activeCode = req.code;
          this.signaler!.sendSignal(this.activeCode, { type: 'JOIN_ROOM' });
          this.setState('HANDSHAKING');
        }
      });

      this.signaler.on('signal_out', (data) => {
        this.signaler!.sendSignal(this.activeCode, data);
      });

      this.signaler.on('channel_ready', (channel) => {
        this.startProtocol(channel, req.filePath, req.mode);
      });
    });
  }

  private async startProtocol(channel: RTCDataChannel, filePath: string, mode: 'SEND' | 'RECEIVE') {
    this.setState('TRANSFERRING');
    
    // In a real run, we'd generate/receive the manifest here. 
    // For the 1GB test, we'll assume the sender generates it.
    const manifest = await this.generateManifest(filePath);
    this.manager = new TransferManager(manifest, this.store, channel);

    this.manager.on('TRANSFER_COMPLETE', () => this.setState('COMPLETE'));
    this.manager.on('progress', () => this.emitProgress());

    if (mode === 'SEND') {
      this.manager.processQueue(filePath);
    }
  }

  private calculateMetrics(currentBytes: number) {
    const now = Date.now();
    this.speedWindow.push({ bytes: currentBytes, time: now });
    this.speedWindow = this.speedWindow.filter(s => now - s.time < 5000);

    if (this.speedWindow.length < 2) return { speed: 0, etr: 0 };
    const first = this.speedWindow[0];
    const last = this.speedWindow[this.speedWindow.length - 1];
    
    const bytesGained = last.bytes - first.bytes;
    const timeGained = (last.time - first.time) / 1000;
    const speedBytesPerSec = bytesGained / timeGained;
    
    const remainingBytes = (this.manager?.totalBytes || 0) - currentBytes;
    return {
      speed: (speedBytesPerSec * 8) / 1_000_000, // Mbps
      etr: speedBytesPerSec > 0 ? Math.ceil(remainingBytes / speedBytesPerSec) : 0
    };
  }

  private emitProgress() {
    const now = Date.now();
    if (now - this.lastUpdateTimestamp < 500) return;

    const metrics = this.calculateMetrics(this.manager!.receivedBytes);
    const payload: ProgressPayload = {
      state: this.currentState,
      fileId: this.manager!.fileId,
      fileName: 'test-file',
      bytesReceived: this.manager!.receivedBytes,
      totalBytes: this.manager!.totalBytes,
      percentage: this.manager!.percentage,
      speedMbps: metrics.speed,
      estimatedTimeRemaining: metrics.etr
    };

    this.window.webContents.send(IPC_CHANNELS.PROGRESS_UPDATE, payload);
    this.lastUpdateTimestamp = now;
  }

  private setState(state: TransferState) {
    this.currentState = state;
    this.window.webContents.send(IPC_CHANNELS.PROGRESS_UPDATE, { state });
  }

  private async generateManifest(filePath: string) {
    const stats = fs.statSync(filePath);
    return {
      protocolVersion: '1.0.0',
      fileId: crypto.randomBytes(8).toString('hex'),
      fileName: path.basename(filePath),
      totalSize: stats.size,
      totalChunks: Math.ceil(stats.size / DEFAULT_CHUNK_SIZE),
      chunkSize: DEFAULT_CHUNK_SIZE,
      masterChecksum: ''
    };
  }
}