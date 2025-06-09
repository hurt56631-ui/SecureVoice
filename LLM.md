# FileStruct
```
main.ts
main.ts-structure.md
public/
public/client.js
public/client.js-structure.md
public/index.html
```

This project implements a WebRTC voice and text chat application. It consists of a Deno-based signaling server (`main.ts`) and a client-side application (`public/client.js` and `public/index.html`).

First, the `main.ts` file acts as the signaling server. It handles WebSocket connections for real-time communication between peers and manages chat rooms. When a client connects, it receives a unique `peerId`. The server facilitates the exchange of WebRTC signaling messages (offers, answers, ICE candidates) between peers to establish peer-to-peer audio connections. **It also relays text-based chat messages between clients in the same room without storing them.** It serves static files (HTML, CSS, JavaScript) from the `public` directory to the clients.

Besides, `public/client.js` implements the client-side logic. It manages user interface interactions, obtains the local audio stream from the user's microphone, and establishes a WebSocket connection to the signaling server. It then uses WebRTC to create peer connections with other participants in the same room, exchanging audio streams for real-time voice communication. **The client also provides a user interface for sending and receiving real-time text messages.** The client handles various signaling messages from the server, such as `your-id`, `existing-peers`, `new-peer`, `offer`, `answer`, `ice-candidate`, `chat-message`, and `peer-disconnected`, to manage the WebRTC connection and chat lifecycle.