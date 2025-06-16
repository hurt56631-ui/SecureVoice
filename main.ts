// main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

// 房间数据结构: Map<roomName, Map<peerId, { socket: WebSocket, username: string }>>
const rooms = new Map<string, Map<string, { socket: WebSocket, username: string }>>();

const handler = (req: Request): Response => {
  const url = new URL(req.url);
  // 只允许 WebSocket 连接到 /ws 路径
  if (req.headers.get("upgrade") === "websocket" && url.pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const peerId = crypto.randomUUID();

    let userRoom: string | null = null;

    // 1. 连接建立
    socket.onopen = () => {
      console.log(`[+] Peer connected: ${peerId}`);
      // 连接后立即发送 peerId 给客户端 (不包含现有peer信息，这将在join-room时发送)
      socket.send(JSON.stringify({ type: 'your-id', data: { peerId } }));
    };

    // 2. 收到消息
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, data } = message;
        const roomName = data?.roomName || userRoom;

        if (!roomName) return;

        switch (type) {
          case 'join-room': {
            const { username } = data; // 获取用户名
            userRoom = roomName;
            if (!rooms.has(roomName)) {
              rooms.set(roomName, new Map());
            }
            const room = rooms.get(roomName)!;

            // 检查用户名是否重复
            const isUsernameTaken = Array.from(room.values()).some(peerInfo => peerInfo.username === username);
            if (isUsernameTaken) {
              console.log(`[${roomName}] Username ${username} is already taken. Rejecting peer ${peerId}.`);
              socket.send(JSON.stringify({ type: 'username-taken', data: { username } }));
              socket.close(1008, 'Username taken'); // 1008: Policy Violation
              return; // 终止处理，不加入房间
            }

            // a. 告知新用户，房间里已有哪些人 (包含用户名)
            const existingPeers = Array.from(room.entries()).map(([id, { username }]) => ({ peerId: id, username }));
            socket.send(JSON.stringify({ type: 'your-id', data: { peerId, peers: existingPeers } })); // 修改为 peers

            // b. 将新用户加入房间 (存储 socket 和 username)
            room.set(peerId, { socket, username });
            
            // c. 告知房间里其他人，有新人加入 (包含用户名)
            room.forEach((peerInfo, id) => {
              if (id !== peerId) {
                peerInfo.socket.send(JSON.stringify({ type: 'new-peer', data: { peerId, username } }));
              }
            });

            console.log(`[${roomName}] Peer ${username} (${peerId}) joined. Total: ${room.size}`);
            break;
          }

          // 转发 WebRTC 信令
          case 'offer':
          case 'answer':
          case 'ice-candidate': {
            const room = rooms.get(roomName);
            const senderUsername = room?.get(peerId)?.username; // 获取发送者的用户名
            const targetPeerInfo = room?.get(data.target);
            if (targetPeerInfo) {
              // 附加上发送者的 ID 和用户名
              targetPeerInfo.socket.send(JSON.stringify({ type, data: { ...data, senderId: peerId, senderUsername } }));
            }
            break;
          }
          
          case 'chat-message': {
            const room = rooms.get(roomName);
            const senderUsername = room?.get(peerId)?.username; // 获取发送者的用户名
            if (room && senderUsername) {
              // 广播消息给房间内所有其他人
              room.forEach((peerInfo, id) => {
                if (id !== peerId) {
                  peerInfo.socket.send(JSON.stringify({
                    type: 'chat-message',
                    data: { senderId: peerId, senderUsername, message: data.message }
                  }));
                }
              });
            }
            break;
          }
        }
      } catch (error) {
        console.error("Failed to process message:", event.data, error);
      }
    };

    // 3. 连接关闭
    socket.onclose = () => {
      console.log(`[-] Peer disconnected: ${peerId}`);
      if (userRoom) {
        const room = rooms.get(userRoom);
        const disconnectedPeerInfo = room?.get(peerId);
        if (room && disconnectedPeerInfo) {
          room.delete(peerId);
          console.log(`[${userRoom}] Peer ${disconnectedPeerInfo.username} (${peerId}) removed. Total: ${room.size}`);
          // 告知房间里剩下的人，有人已离开 (包含用户名)
          room.forEach((peerInfo) => {
            peerInfo.socket.send(JSON.stringify({ type: 'peer-disconnected', data: { peerId, username: disconnectedPeerInfo.username } }));
          });
        }
      }
    };

    socket.onerror = (err) => {
      console.error(`Socket error for peer ${peerId}:`, err);
    };

    return response;
  }

  // 4. 其他所有请求都作为静态文件服务
  return serveDir(req, {
    fsRoot: "public",
    urlRoot: "",
    showDirListing: false,
    enableCors: true,
  });
};

// 启动服务器
console.log("Voice chat server running on http://localhost:8000");
serve(handler, { port: 8000 });