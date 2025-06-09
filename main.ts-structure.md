### This code implements a simple WebRTC signaling server for a voice chat application using Deno.

It handles WebSocket connections for real-time communication and serves static files for the client-side application. The server manages rooms where peers can join and exchange WebRTC signaling messages (offer, answer, ICE candidates) to establish peer-to-peer connections.

## Global Variables
*   **`rooms`**: A `Map<string, Map<string, WebSocket>>` that stores the active chat rooms.
    *   The outer `Map` uses `roomName` (string) as keys.
    *   The inner `Map` stores `peerId` (string) to `WebSocket` connections, representing the peers currently in that room.

## Functions Defined
*   **`handler(req: Request): Response`**: This is the main request handler for the Deno server.
    *   It checks if the incoming request is a WebSocket upgrade request to the `/ws` path.
    *   If it is a WebSocket request, it upgrades the connection and sets up event listeners for the WebSocket.
    *   If it's not a WebSocket request, it serves static files from the `public` directory.

## WebSocket Handling Logic (within `handler` function)
The WebSocket connection lifecycle is managed through `socket.onopen`, `socket.onmessage`, `socket.onclose`, and `socket.onerror` events.

*   **`socket.onopen`**:
    *   Logs a message indicating a new peer connection.
    *   Generates a unique `peerId` for the connected client using `crypto.randomUUID()`.
    *   Sends the generated `peerId` back to the client immediately.

*   **`socket.onmessage(event)`**:
    *   Parses incoming messages as JSON, expecting `type` and `data` fields.
    *   Determines the `roomName` from the message data or the `userRoom` variable.
    *   Uses a `switch` statement to handle different message types:
        *   **`join-room`**:
            *   Sets the `userRoom` for the current peer.
            *   If the room doesn't exist, it creates a new entry in the `rooms` Map.
            *   Informs the newly joined peer about existing peers in the room.
            *   Adds the new peer's WebSocket to the room.
            *   Notifies all other existing peers in the room about the new peer's arrival.
        *   **`offer`**, **`answer`**, **`ice-candidate`**:
            *   These types are for forwarding WebRTC signaling messages.
            *   It retrieves the target peer's WebSocket from the room.
            *   If the target socket exists, it forwards the signaling message, attaching the sender's `peerId`.
        *   **`chat-message`**:
            *   Receives a chat message from a peer.
            *   Broadcasts the message (including the sender's `peerId` and the message content) to all other peers in the same room. Messages are not stored on the server.

*   **`socket.onclose`**:
    *   Logs a message indicating a peer disconnection.
    *   If the disconnected peer was in a room (`userRoom` is set):
        *   Removes the peer from the `rooms` Map.
        *   Notifies all remaining peers in that room about the disconnection.

*   **`socket.onerror(err)`**:
    *   Logs any errors that occur on the WebSocket connection.

## Other Logic
*   **Static File Serving**: For any HTTP requests that are not WebSocket upgrade requests to `/ws`, the server uses `serveDir` from Deno's standard library to serve static files.
    *   The `fsRoot` is set to `"public"`, meaning files are served from the `public` directory.
    *   CORS is enabled (`enableCors: true`).
*   **Server Initialization**: The server starts listening on `http://localhost:8000` using `serve(handler, { port: 8000 })`.