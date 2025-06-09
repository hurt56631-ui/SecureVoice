// main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

// 房间数据结构: Map<roomName, Map<peerId, WebSocket>>
const rooms = new Map<string, Map<string, WebSocket>>();

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
      // 连接后立即发送 peerId 给客户端
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
            userRoom = roomName;
            if (!rooms.has(roomName)) {
              rooms.set(roomName, new Map());
            }
            const room = rooms.get(roomName)!;

            // a. 告知新用户，房间里已有哪些人
            const existingPeers = Array.from(room.keys());
            socket.send(JSON.stringify({ type: 'existing-peers', data: { peerIds: existingPeers } }));

            // b. 将新用户加入房间
            room.set(peerId, socket);
            
            // c. 告知房间里其他人，有新人加入
            room.forEach((peerSocket, id) => {
              if (id !== peerId) {
                peerSocket.send(JSON.stringify({ type: 'new-peer', data: { peerId } }));
              }
            });

            console.log(`[${roomName}] Peer ${peerId} joined. Total: ${room.size}`);
            break;
          }

          // 转发 WebRTC 信令
          case 'offer':
          case 'answer':
          case 'ice-candidate': {
            const room = rooms.get(roomName);
            const targetSocket = room?.get(data.target);
            if (targetSocket) {
              // 附加上发送者的 ID
              targetSocket.send(JSON.stringify({ type, data: { ...data, sender: peerId } }));
            }
            break;
          }
          
          case 'chat-message': {
            const room = rooms.get(roomName);
            if (room) {
              // 广播消息给房间内所有其他人
              room.forEach((peerSocket, id) => {
                if (id !== peerId) {
                  peerSocket.send(JSON.stringify({
                    type: 'chat-message',
                    data: { sender: peerId, message: data.message }
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
        if (room?.has(peerId)) {
          room.delete(peerId);
          console.log(`[${userRoom}] Peer ${peerId} removed. Total: ${room.size}`);
          // 告知房间里剩下的人，有人已离开
          room.forEach((peerSocket) => {
            peerSocket.send(JSON.stringify({ type: 'peer-disconnected', data: { peerId } }));
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