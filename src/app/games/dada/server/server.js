const { Server } = require("socket.io");
const http = require("http");

const server = http.createServer();

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const rooms = {}; // { roomId: { players: [], createdAt: ..., isStarted: false } }

function updateLeader(roomId) {
  const roomPlayers = rooms[roomId];
  if (!roomPlayers) return;

  roomPlayers.forEach((p) => (p.leader = false));
  if (roomPlayers[0]) roomPlayers[0].leader = true;
}

function getRoomSummaries() {
  return Object.entries(rooms).map(([roomId, data]) => ({
    roomId,
    nbPlayers: data.players.length,
    isStarted: data.isStarted,
    createdAt: data.createdAt,
  }));
}

io.on("connection", (socket) => {
  console.log("Joueur connecté :", socket.id);

  // Créer une room
  socket.on("createRoom", (roomName) => {
    rooms[roomName] = {
      players: [],
      createdAt: Date.now(),
      isStarted: false,
    };

    io.emit("updateRoomList", getRoomSummaries()); // Envoie la liste des rooms à tous les clients
    console.log(`Room ${roomName} créée`);

    socket.emit("roomCreated", roomName); // Envoie un message au client qui a créé la room
    socket.join(roomName); // Met le joueur dans sa room WebSocket

    // envoi les liste des joueurs dans la room
    socket.emit("updatePlayers", rooms[roomName].players);
  });

  // Lister les rooms disponibles
  socket.on("getRoomsList", () => {
    socket.emit("updateRoomList", getRoomSummaries()); // Envoie la liste des rooms au client sur dmd
  });

  socket.on("joinRoom", ({ roomId, name, color }) => {
    console.log(`Joueur ${name} (${color}) a rejoint la room ${roomId}`);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        createdAt: Date.now(),
        isStarted: false,
      };
    }

    console.log("La room : ", rooms[roomId]);

    const playersInRoom = rooms[roomId].players;

    // ✔ Vérifie que le nom n'est pas déjà utilisé dans cette room
    const nameAlreadyTaken = playersInRoom.findIndex((p) => p.name === name);
    if (nameAlreadyTaken) {
      socket.emit("errorJoin", "Ce nom est déjà pris ! (Erreur serveur)");
      return;
    }

    const player = {
      id: socket.id,
      name,
      color,
      leader: false,
    };

    playersInRoom.push(player);
    console.log("✔️ Nouveau joueur ajouté :", player);
    console.log("📦 État actuel des joueurs :", rooms[roomId].players);

    updateLeader(roomId); // 👈 met à jour le leader pour cette room

    console.log(
      `${player.leader ? "[LEADER]" : "[Player]"} | Joueur ${name} (${color}) a rejoint la room ${roomId}`
    );

    socket.join(roomId); // Met le joueur dans sa room WebSocket
    io.to(roomId).emit("updatePlayers", rooms[roomId].players);
  });

  socket.on("disconnect", () => {
    console.log("❌ Déconnecté du WebSocket");
    // Retire le joueur de la room
    for (const roomId in rooms) {
      const playersInRoom = rooms[roomId].players;
      const playerIndex = playersInRoom.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        const playerName = rooms[roomId][playerIndex].name;
        playersInRoom.splice(playerIndex, 1); // Retire le joueur de la room

        console.log(`Joueur ${playerName} a quitté la room ${roomId}`);
        updateLeader(roomId); // Met à jour le leader après la déconnexion d'un joueur
        // Diffuser la mise à jour
        io.to(roomId).emit("updatePlayers", rooms[roomId].players);

        // Si la room est vide, la supprimer
        if (playersInRoom.length === 0) {
          delete rooms[roomId];
          console.log(`Room ${roomId} supprimée`);
        }
        break;
      }
    }

    console.log("Joueur déconnecté :", socket.id);
  });
});

server.listen(5000, () => {
  console.log("Serveur WebSocket en écoute sur http://localhost:5000");
});

