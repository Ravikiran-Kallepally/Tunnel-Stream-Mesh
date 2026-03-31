import { EventEmitter } from 'events';
import fs from 'fs';
import crypto from 'crypto';
import { 
  MessageType, 
  FileManifest, 
  ChunkEnvelope, 
  ACK_BATCH_SIZE,
  DEFAULT_CHUNK_SIZE
} from './protocol-types';
import { StateStore } from './state-store';

export class TransferManager extends EventEmitter {
  private nextChunkId = 0;
  private receivedCount = 0;
  private isPaused = false;
  private batchQueue: number[] = [];
  private senderHash = crypto.createHash('sha256');

  constructor(
    private manifest: FileManifest,
    private store: StateStore,
    private sendChannel: RTCDataChannel
  ) {
    super();
    this.setupChannel();
  }

  private setupChannel() {
    // Native WebRTC Backpressure: Only send when the buffer has room
    this.sendChannel.onbufferedamountlow = () => {
      this.isPaused = false;
      this.emit('resume_sending');
    };
  }

  /**
   * SENDER: The 100GB Firehose
   */
  public async processQueue(filePath: string) {
    while (this.nextChunkId < this.manifest.totalChunks) {
      // 16MB Buffer Limit: Prevents RAM bloat and network congestion
      if (this.sendChannel.bufferedAmount > this.sendChannel.bufferedAmountLowThreshold) {
        this.isPaused = true;
        await new Promise(resolve => this.once('resume_sending', resolve));
      }

      const envelope = Chunker.readSlice(filePath, this.nextChunkId++);
      this.senderHash.update(envelope.data);
      
      this.send(MessageType.DATA_CHUNK, envelope);

      // Heartbeat for your 1GB test
      if (envelope.chunkId % 1000 === 0) {
        console.log(`[SENDER] Dispatched chunk ${envelope.chunkId}/${this.manifest.totalChunks}`);
      }
    }

    // Final Reveal: Tell the receiver the "Answer Key" (Master Hash)
    const finalHash = this.senderHash.digest('hex');
    this.send(MessageType.CHECKSUM_REVEAL, { masterChecksum: finalHash });
  }

  /**
   * RECEIVER: The "Validator"
   */
  public handleIncomingChunk(targetPath: string, envelope: ChunkEnvelope) {
    const isNew = this.store.commitChunk(targetPath, this.manifest.fileId, envelope);
    if (isNew) {
      this.receivedCount++;
      this.batchQueue.push(envelope.chunkId);
    }

    // Batch ACKs: Don't flood the control channel
    if (this.batchQueue.length >= ACK_BATCH_SIZE || this.receivedCount === this.manifest.totalChunks) {
      this.send(MessageType.CHUNK_ACK_BATCH, { chunkIds: [...this.batchQueue] });
      this.batchQueue = [];
    }

    // If we have all chunks and the master hash has been revealed
    if (this.receivedCount === this.manifest.totalChunks && this.manifest.masterChecksum) {
      this.verifyFinalIntegrity(targetPath);
    }
  }

  private verifyFinalIntegrity(targetPath: string) {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(targetPath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => {
      if (hash.digest('hex') === this.manifest.masterChecksum) {
        this.emit('TRANSFER_COMPLETE');
      } else {
        this.emit('ERROR', 'Master Integrity Failure');
      }
    });
  }

  private send(type: MessageType, payload: any) {
    if (this.sendChannel.readyState === 'open') {
      this.sendChannel.send(JSON.stringify({ type, payload }));
    }
  }

  // Getters for the UI progress bar
  get percentage(): number { return Math.round((this.receivedCount / this.manifest.totalChunks) * 100); }
  get receivedBytes(): number { return Math.min(this.receivedCount * DEFAULT_CHUNK_SIZE, this.manifest.totalSize); }
}