### This code implements the client-side logic for a WebRTC voice chat application.

It handles user interface interactions, obtains local audio streams, establishes WebSocket connections to a signaling server, and manages WebRTC peer connections for real-time audio communication with other participants in a room.

## DOM Elements
*   **`joinButton`**: Button to initiate joining a room.
*   **`usernameInput`**: Input field for entering the username.
*   **`roomNameInput`**: Input field for entering the room name.
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
*   **`peerIdToUsernameMap`**: A `Map` to store the mapping from peer ID to username.
*   **`stunServers`**: Configuration object for STUN servers, used by `RTCPeerConnection` to discover public IP addresses and NAT traversal.

## Main Flow
*   **`joinButton.onclick`**:
    *   Triggered when the user clicks the "Join" button.
    *   Validates both the username and room name inputs.
    *   Disables UI elements to prevent multiple clicks.
    *   Attempts to get the user's microphone access using `navigator.mediaDevices.getUserMedia({ audio: true, video: false })`.
    *   Sets the obtained `localStream` to the `localAudio` element.
    *   Establishes a WebSocket connection to the signaling server (`/ws` endpoint).
    *   Calls `setupWebSocketListeners` to configure WebSocket event handlers, passing the entered username.
    *   Includes error handling for media device access and WebSocket connection, re-enabling username input on error.

## WebSocket Event Handling (`setupWebSocketListeners` function)
*   **`socket.onopen`**:
    *   Updates the status to "正在加入房间..." (Joining room...).
*   **`socket.onmessage(event)`**:
    *   Parses incoming JSON messages from the server.
    *   Uses a `switch` statement to handle different message types:
        *   **`your-id`**: Receives the `myPeerId` from the server and displays the user's chosen username. Sends a `join-room` message to the server, including the username. Processes a list of existing peers (now including their usernames), initiating WebRTC connections and adding them to the sidebar.
        *   **`existing-peers`**: (This case is now integrated into `your-id` handling, receiving `data.peers` with usernames).
        *   **`new-peer`**: Logs a message when a new peer joins the room, adds a system message to the chat using the new peer's username, initiates a WebRTC connection, and adds the new user to the sidebar.
        *   **`offer`**: Calls `handleOffer` to process an incoming WebRTC offer, also receiving and storing the sender's username.
        *   **`answer`**: Calls `handleAnswer` to process an incoming WebRTC answer.
        *   **`ice-candidate`**: Calls `handleIceCandidate` to process an incoming ICE candidate.
        *   **`chat-message`**: Calls `addChatMessage` to display a received chat message from another peer, using the sender's username.
        *   **`peer-disconnected`**: Calls `handlePeerDisconnect` when a peer leaves the room and adds a system message to the chat, using the disconnected peer's username.
        *   **`username-taken`**: Displays an alert to the user indicating that the chosen username is already taken, and then calls `cleanup()` to reset the application state, allowing the user to try again with a different username.
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
*   **`handleOffer(sdp, senderId, senderUsername)`**:
    *   Stores the `senderId` to `senderUsername` mapping in `peerIdToUsernameMap`.
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
    *   Sends the message to the server via WebSocket with the type `chat-message`, including the local user's username.
    *   Calls `addChatMessage` to display the sent message locally.
    *   Clears the chat input field.
*   **`addChatMessage(sender, message, isMe)`**:
    *   Creates new DOM elements for the message.
    *   Appends the formatted message (sender + message) to the `chatMessages` container.
    *   Automatically scrolls the chat view to the bottom.
*   **`addSidebarUser(peerId, username)`**:
    *   Creates and appends a new user element to the `user-list-sidebar` for a given peer, displaying their username.

## UI & Utility Functions
*   **`addRemoteAudioStream(peerId, stream)`**:
    *   Creates a new `<div>` element for the remote peer's audio.
    *   Creates an `<p>` element for the peer's username (retrieved from `peerIdToUsernameMap`) and an `<audio>` element for the stream.
    *   Sets the `srcObject` of the audio element to the remote stream and enables autoplay.
    *   Appends the new elements to the `remoteAudioContainer`.
*   **`updateStatus(message)`**:
    *   Updates the `statusText` element with the given message.
*   **`cleanup()`**:
    *   Closes all active `RTCPeerConnection`s.
    *   Clears the `peerConnections` Map.
    *   Clears the `remoteAudioContainer` and `chatMessages`.
    *   Stops local media tracks and resets `localAudio.srcObject`.
    *   Re-enables the "Join" button, room name input, and username input, and disables chat controls.
    *   Clears the `myPeerIdDisplay` text and the `peerIdToUsernameMap`.