export enum IPC_CHANNELS {
  SELECT_FILE = 'transfer:select-file',    // UI asks to open file picker
  START_TRANSFER = 'transfer:start',       // UI says "Go"
  PAUSE_TRANSFER = 'transfer:pause',       // UI says "Wait"
  CANCEL_TRANSFER = 'transfer:cancel',     // UI says "Stop"
  CODE_GENERATED = 'transfer:code',        // Engine tells UI the 4-digit code
  PROGRESS_UPDATE = 'transfer:progress',   // Engine tells UI the speed/percentage
  TRANSFER_COMPLETE = 'transfer:complete', // Engine tells UI it's done
  ERROR = 'transfer:error'                 // Engine tells UI something broke
}

export type TransferState = 
  | 'IDLE' 
  | 'CONNECTING' 
  | 'HANDSHAKING' 
  | 'TRANSFERRING' 
  | 'VERIFYING' 
  | 'COMPLETE' 
  | 'ERROR';

export interface ProgressPayload {
  state: TransferState;
  fileId: string;
  fileName: string;
  bytesReceived: number;
  totalBytes: number;
  percentage: number;
  speedMbps: number;           // Calculated via 5s rolling window
  estimatedTimeRemaining: number; 
}

export interface TransferRequest {
  mode: 'SEND' | 'RECEIVE';
  filePath?: string;    // Provided by Sender
  code?: string;        // Provided by Receiver
}