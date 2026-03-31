import Database from 'better-sqlite3';
import { Chunker } from './chunker';
import { ChunkEnvelope } from './protocol-types';

export class StateStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    // This creates a local file like 'transfer.db' in your AppData
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_progress (
        file_id TEXT,
        chunk_id INTEGER,
        PRIMARY KEY (file_id, chunk_id)
      )
    `);
  }

  /**
   * ATOMIC TRANSACTION: 
   * We only mark the chunk as 'done' in the DB IF the disk write succeeds.
   */
  public commitChunk(targetPath: string, fileId: string, envelope: ChunkEnvelope): boolean {
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO transfer_progress (file_id, chunk_id) VALUES (?, ?)'
    );

    try {
      const transaction = this.db.transaction((path, fId, env) => {
        // Step 1: Write bytes to SSD
        const success = Chunker.writeSlice(path, env);
        if (!success) throw new Error('Checksum mismatch');

        // Step 2: Update SQLite manifest
        const result = insert.run(fId, env.chunkId);
        return result.changes > 0; // Returns true if this was a new chunk
      });

      return transaction(targetPath, fileId, envelope);
    } catch (err) {
      console.error(`Failed to commit chunk ${envelope.chunkId}:`, err);
      return false;
    }
  }

  /**
   * Used for the 'Resume' handshake. 
   * Uses RLE (Run-Length Encoding) logic to find gaps.
   */
  public getCompletedChunks(fileId: string): { start: number; end: number }[] {
    const query = `
      SELECT MIN(chunk_id) as start, MAX(chunk_id) as end
      FROM (
        SELECT chunk_id, chunk_id - ROW_NUMBER() OVER (ORDER BY chunk_id) as grp
        FROM transfer_progress
        WHERE file_id = ?
      ) t
      GROUP BY grp
      ORDER BY start ASC
    `;
    return this.db.prepare(query).all(fileId) as { start: number; end: number }[];
  }
}