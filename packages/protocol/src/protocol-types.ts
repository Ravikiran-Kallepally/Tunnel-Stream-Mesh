export const PROTOCOL_VERSION = '1.0.0';
export const DEFAULT_CHUNK_SIZE = 16384; // 16KB - Optimized for WebRTC MTU
export const ACK_BATCH_SIZE = 64;        // Ack every 1MB of verified data
export const MAX_CHUNK_RETRIES = 5;

export enum MessageType {
  HANDSHAKE = 'HANDSHAKE',           // Version & Manifest exchange
  DATA_CHUNK = 'DATA_CHUNK',         // Binary file slice
  CHUNK_ACK_BATCH = 'CHUNK_ACK',     // Batch confirmation of IDs
  RE_REQUEST = 'RE_REQUEST',         // Request missing chunk
  CHECKSUM_REVEAL = 'CHECKSUM_REVEAL', // Final master hash delivery
  PAUSE = 'PAUSE',
  RESUME = 'RESUME',
  ERROR = 'ERROR'
}

export interface FileManifest {
  protocolVersion: string;
  fileId: string;
  fileName: string;
  totalSize: number;
  totalChunks: number;
  chunkSize: number;
  masterChecksum: string; // Initially empty, filled by CHECKSUM_REVEAL
}

export interface ChunkEnvelope {
  chunkId: number;
  data: Uint8Array;
  checksum: string; // SHA-256 of this 16KB slice
}