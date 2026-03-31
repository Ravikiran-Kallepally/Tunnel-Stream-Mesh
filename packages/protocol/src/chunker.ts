import fs from 'fs';
import crypto from 'crypto';
import { DEFAULT_CHUNK_SIZE, ChunkEnvelope } from './protocol-types';

export class Chunker {
  /**
   * Reserves space on the receiver's disk for the 100GB+ file.
   */
  static preallocate(targetPath: string, totalSize: number): void {
    const fd = fs.openSync(targetPath, 'w');
    if (totalSize > 0) {
      fs.writeSync(fd, Buffer.alloc(1), 0, 1, totalSize - 1);
    }
    fs.closeSync(fd);
  }

  /**
   * Reads a 16KB slice for sending.
   */
  static readSlice(filePath: string, chunkId: number): ChunkEnvelope {
    const offset = chunkId * DEFAULT_CHUNK_SIZE;
    const buffer = Buffer.alloc(DEFAULT_CHUNK_SIZE);
    
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, DEFAULT_CHUNK_SIZE, offset);
    fs.closeSync(fd);

    const actualData = buffer.subarray(0, bytesRead);
    const checksum = crypto.createHash('sha256').update(actualData).digest('hex');

    return {
      chunkId,
      data: actualData,
      checksum
    };
  }

  /**
   * Writes a received slice to the correct byte-offset.
   */
  static writeSlice(targetPath: string, envelope: ChunkEnvelope): boolean {
    const actualHash = crypto.createHash('sha256').update(envelope.data).digest('hex');
    if (actualHash !== envelope.checksum) return false;

    const offset = envelope.chunkId * DEFAULT_CHUNK_SIZE;
    const fd = fs.openSync(targetPath, 'r+');
    fs.writeSync(fd, Buffer.from(envelope.data), 0, envelope.data.length, offset);
    fs.closeSync(fd);

    return true;
  }
}