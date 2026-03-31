import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const rooms = new Map<string, Set<WebSocket>>();
const roomActivity = new Map<string, number>();

const ROOM_TTL = 60000; // 60 Seconds of inactivity = room deleted

// Janitor: Runs every 30 seconds to clean up dead 4-digit codes
setInterval(() => {
  const now = Date.now();
  for (const [code, lastActive] of roomActivity.entries()) {
    if (now - lastActive > ROOM_TTL) {
      console.log(`Expiring stagnant room: ${code}`);
      rooms.delete(code);
      roomActivity.delete(code);
    }
  }
}, 30000);

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'GET_CODE':
        let code: string;
        do {
          // Generates 0000 to 9999
          code = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        } while (rooms.has(code));

        rooms.set(code, new Set([ws]));
        roomActivity.set(code, Date.now());
        ws.send(JSON.stringify({ type: 'CODE_ASSIGNED', code }));
        console.log(`Room created: ${code}`);
        break;

      case 'JOIN_ROOM':
        const targetRoom = rooms.get(message.code);
        if (targetRoom && targetRoom.size < 2) {
          targetRoom.add(ws);
          roomActivity.set(message.code, Date.now());
          ws.send(JSON.stringify({ type: 'ROOM_JOINED', role: 'RECEIVER' }));
          console.log(`Receiver joined room: ${message.code}`);
        } else {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Room Full or Invalid' }));
        }
        break;

      case 'SIGNAL':
        // The "Relay": Forwards WebRTC Offer/Answer/ICE to the other peer
        const currentRoom = rooms.get(message.code);
        if (currentRoom) {
          roomActivity.set(message.code, Date.now());
          currentRoom.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'SIGNAL', data: message.data }));
            }
          });
        }
        break;
    }
  });

  ws.on('close', () => {
    // Cleanup on disconnect
    rooms.forEach((clients, code) => {
      if (clients.has(ws)) {
        clients.delete(ws);
        if (clients.size === 0) {
          rooms.delete(code);
          roomActivity.delete(code);
        }
      }
    });
  });
});

console.log('OmniTunnel Signaling Server running on port 8080');