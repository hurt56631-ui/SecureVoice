### This code implements the client-side logic for a WebRTC voice chat application.

It handles user interface interactions, obtains local audio streams, establishes WebSocket connections to a signaling server, and manages WebRTC peer connections for real-time audio communication with other participants in a room.

## DOM Elements
*   **`joinButton`**: Button to initiate joining a room.
*   **`roomNameInput`**: Input field for entering the room name.
*   **`localAudio`**: HTML `<audio>` element to play back the local audio stream.
*   **`remoteAudioContainer`**: Container `<div>` where remote audio streams will be added.
*   **`statusText`**: `<p>` element to display status messages to the user.
*   **`myIdSpan`**: `<span>` element to display the client's own peer ID.
*   **`chatMessages`**: `<div>` element to display chat messages.
*   **`chatInput`**: Input field for typing chat messages.
*   **`sendButton`**: Button to send chat messages.

## Global Variables
*   **`localStream`**: Stores the `MediaStream` object obtained from the user's microphone.
*   **`myPeerId`**: Stores the unique ID assigned to this client by the signaling server.
*   **`socket`**: The `WebSocket` object used for communication with the signaling server.
*   **`peerConnections`**: A `Map` to store `RTCPeerConnection` objects, keyed by the remote peer's ID.
*   **`stunServers`**: Configuration object for STUN servers, used by `RTCPeerConnection` to discover public IP addresses and NAT traversal.

## Main Flow
*   **`joinButton.onclick`**:
    *   Triggered when the user clicks the "Join" button.
    *   Validates the room name input.
    *   Disables UI elements to prevent multiple clicks.
    *   Attempts to get the user's microphone access using `navigator.mediaDevices.getUserMedia({ audio: true, video: false })`.
    *   Sets the obtained `localStream` to the `localAudio` element.
    *   Establishes a WebSocket connection to the signaling server (`/ws` endpoint).
    *   Calls `setupWebSocketListeners` to configure WebSocket event handlers.
    *   Includes error handling for media device access and WebSocket connection.

## WebSocket Event Handling (`setupWebSocketListeners` function)
*   **`socket.onopen`**:
    *   Updates the status to "正在加入房间..." (Joining room...).
*   **`socket.onmessage(event)`**:
    *   Parses incoming JSON messages from the server.
    *   Uses a `switch` statement to handle different message types:
        *   **`your-id`**: Receives the `myPeerId` from the server and displays it. After receiving the ID, it sends a `join-room` message to the server.
        *   **`existing-peers`**: Receives a list of `peerIds` already in the room. For each existing peer, it calls `createAndSendOffer` to initiate a WebRTC connection. It also enables the chat input and send button, and calls `setupChat`.
        *   **`new-peer`**: Logs a message when a new peer joins the room and adds a system message to the chat.
        *   **`offer`**: Calls `handleOffer` to process an incoming WebRTC offer.
        *   **`answer`**: Calls `handleAnswer` to process an incoming WebRTC answer.
        *   **`ice-candidate`**: Calls `handleIceCandidate` to process an incoming ICE candidate.
        *   **`chat-message`**: Calls `addChatMessage` to display a received chat message from another peer.
        *   **`peer-disconnected`**: Calls `handlePeerDisconnect` when a peer leaves the room and adds a system message to the chat.
*   **`socket.onclose`**:
    *   Updates the status to "连接已断开" (Connection disconnected).
    *   Calls `cleanup` to reset the application state.
*   **`socket.onerror`**:
    *   Logs WebSocket errors.
    *   Updates the status to "连接出错" (Connection error).
    *   Calls `cleanup`.

## WebRTC Core Functions
*   **`createPeerConnection(peerId)`**:
    *   Creates a new `RTCPeerConnection` for a given `peerId` if one doesn't already exist.
    *   Adds the `localStream` tracks to the peer connection.
    *   Sets up `onicecandidate` to send ICE candidates to the signaling server.
    *   Sets up `ontrack` to handle incoming remote audio streams and add them to the UI.
    *   Sets up `onconnectionstatechange` for logging connection status.
    *   Returns the `RTCPeerConnection` object.
*   **`createAndSendOffer(peerId)`**:
    *   Creates an `RTCPeerConnection` for the target `peerId`.
    *   Creates a WebRTC offer (`pc.createOffer()`).
    *   Sets the local description (`pc.setLocalDescription()`).
    *   Sends the offer (SDP) to the signaling server.
*   **`handleOffer(sdp, senderId)`**:
    *   Creates an `RTCPeerConnection` for the `senderId`.
    *   Sets the remote description with the received SDP offer.
    *   Creates a WebRTC answer (`pc.createAnswer()`).
    *   Sets the local description with the answer.
    *   Sends the answer (SDP) to the signaling server.
*   **`handleAnswer(sdp, senderId)`**:
    *   Retrieves the `RTCPeerConnection` for the `senderId`.
    *   Sets the remote description with the received SDP answer.
*   **`handleIceCandidate(candidate, senderId)`**:
    *   Retrieves the `RTCPeerConnection` for the `senderId`.
    *   Adds the received ICE candidate to the peer connection.
*   **`handlePeerDisconnect(peerId)`**:
    *   Closes and removes the `RTCPeerConnection` associated with the disconnected `peerId`.
    *   Removes the corresponding remote audio element from the DOM.

## Chat Functions
*   **`setupChat()`**:
    *   Sets up event listeners for the chat send button (`onclick`) and input field (`onkeydown` for 'Enter' key).
*   **`sendMessage()`**:
    *   Reads the message from the `chatInput`.
    *   Sends the message to the server via WebSocket with the type `chat-message`.
    *   Calls `addChatMessage` to display the sent message locally.
    *   Clears the chat input field.
*   **`addChatMessage(sender, message)`**:
    *   Creates new DOM elements for the message.
    *   Appends the formatted message (sender + message) to the `chatMessages` container.
    *   Automatically scrolls the chat view to the bottom.

## UI & Utility Functions
*   **`addRemoteAudioStream(peerId, stream)`**:
    *   Creates a new `<div>` element for the remote peer's audio.
    *   Creates an `<p>` element for the peer's ID and an `<audio>` element for the stream.
    *   Sets the `srcObject` of the audio element to the remote stream and enables autoplay.
    *   Appends the new elements to the `remoteAudioContainer`.
*   **`updateStatus(message, isError = false)`**:
    *   Updates the `statusText` element with the given message.
    *   Changes the text color based on whether it's an error message.
*   **`cleanup()`**:
    *   Closes all active `RTCPeerConnection`s.
    *   Clears the `peerConnections` Map.
    *   Clears the `remoteAudioContainer` and `chatMessages`.
    *   Stops local media tracks and resets `localAudio.srcObject`.
    *   Re-enables the "Join" button and room name input, and disables chat controls.
    *   Clears the `myIdSpan` text.