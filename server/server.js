const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // Allows your React app to talk to this server
});

const rooms = new Map();

io.on('connection', (socket) => {
  // 1. Create a 4-digit tunnel code
  socket.on('room:create', () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    rooms.set(code, socket.id);
    socket.join(code);
    socket.emit('room:created', code);
    console.log(`Tunnel Created: ${code}`);
  });

  // 2. Join an existing tunnel
  socket.on('room:join', (code) => {
    const hostId = rooms.get(code);
    if (hostId) {
      socket.join(code);
      io.to(hostId).emit('peer:joined', { peerId: socket.id });
      socket.emit('peer:joined', { peerId: hostId });

      console.log(`Peer Joined Tunnel: ${code}`);
    } else {
      socket.emit('error:msg', 'Invalid or Expired Code');
    }
  });

  // 3. Relay the P2P Handshake (Signaling)
  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, signal });
  });

  socket.on('disconnecting', () => {
    // socket.rooms contains all rooms the user is currently in
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        // Notify the other person in the room that their partner left
        socket.to(room).emit('peer:disconnected');
        // If the host leaves, clean up the map
        for (const [code, id] of rooms.entries()) {
          if (id === socket.id) rooms.delete(code);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`OmniTunnel Signaler live on port ${PORT}`));