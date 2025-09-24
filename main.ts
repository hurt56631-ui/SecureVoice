// main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";
// --- Firestore 配置 ---
const FIREBASE_PROJECT_ID = 'chrome-sum-448615-f2'; // ✅ 您的 Firebase 项目 ID
const FIREBASE_API_KEY = 'AIzaSyBejyAos_TNLoJpFf59OQS0e0-jFNC-l4M';   // ✅ 您的 Web API Key
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// --- 操作 Firestore 的辅助函数 ---
async function updateFirestoreRoom(roomName: string, memberCount: number) {
    const documentPath = `active_rooms/${encodeURIComponent(roomName)}`;
    const url = `${FIRESTORE_BASE_URL}/${documentPath}?key=${FIREBASE_API_KEY}`;
    const data = {
        fields: {
            roomName: { stringValue: roomName },
            memberCount: { integerValue: memberCount.toString() },
            createdAt: { timestampValue: new Date().toISOString() }
        }
    };
    try {
        const response = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            console.error(`[Firestore] Failed to update room ${roomName}:`, await response.text());
        } else {
            console.log(`[Firestore] Successfully updated room ${roomName} with ${memberCount} members.`);
        }
    } catch (error) {
        console.error(`[Firestore] Network error updating room ${roomName}:`, error);
    }
}

async function deleteFirestoreRoom(roomName: string) {
    const documentPath = `active_rooms/${encodeURIComponent(roomName)}`;
    const url = `${FIRESTORE_BASE_URL}/${documentPath}?key=${FIREBASE_API_KEY}`;
    try {
        const response = await fetch(url, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
            console.error(`[Firestore] Failed to delete room ${roomName}:`, await response.text());
        } else {
            console.log(`[Firestore] Successfully deleted room ${roomName}.`);
        }
    } catch (error) {
        console.error(`[Firestore] Network error deleting room ${roomName}:`, error);
    }
}


// 房间数据结构: Map<roomName, Map<peerId, { socket: WebSocket, username: string }>>
const rooms = new Map<string, Map<string, { socket: WebSocket, username: string }>>();

// 游戏状态数据结构
interface GameState {
  gameActive: boolean;
  bombNumber: number;
  currentRange: { min: number; max: number };
  round: number;
  guesses: Map<string, number>; // peerId -> guess
  waitingForGuesses: Set<string>; // peerIds who haven't guessed yet
  gameType: 'number-bomb';
}

// 房间游戏状态: Map<roomName, GameState>
const roomGames = new Map<string, GameState>();

// 游戏辅助函数
function startNumberBombGame(roomName: string): GameState {
  const room = rooms.get(roomName);
  if (!room) throw new Error('Room not found');

  const bombNumber = Math.floor(Math.random() * 100) + 1; // 1-100
  const gameState: GameState = {
    gameActive: true,
    bombNumber,
    currentRange: { min: 1, max: 100 },
    round: 1,
    guesses: new Map(),
    waitingForGuesses: new Set(room.keys()),
    gameType: 'number-bomb'
  };

  roomGames.set(roomName, gameState);
  console.log(`[${roomName}] Number bomb game started. Bomb: ${bombNumber}`);

  // 通知所有玩家游戏开始
  room.forEach((peerInfo) => {
    peerInfo.socket.send(JSON.stringify({
      type: 'game-state-update',
      data: {
        gameActive: true,
        gameType: 'number-bomb',
        currentRange: gameState.currentRange,
        round: gameState.round,
        waitingForGuesses: Array.from(gameState.waitingForGuesses),
        totalPlayers: room.size
      }
    }));
  });

  return gameState;
}

function processNumberBombGuesses(roomName: string): void {
  const gameState = roomGames.get(roomName);
  const room = rooms.get(roomName);
  if (!gameState || !room || !gameState.gameActive) return;

  const guesses = Array.from(gameState.guesses.entries());
  let gameEnded = false;
  let winner: string | null = null;
  let explodedPlayer: string | null = null;

  // 检查是否有人猜中炸弹
  for (const [peerId, guess] of guesses) {
    if (guess === gameState.bombNumber) {
      gameEnded = true;
      explodedPlayer = peerId;
      break;
    }
  }

  if (gameEnded) {
    // 游戏结束
    gameState.gameActive = false;
    const explodedUsername = room.get(explodedPlayer!)?.username || 'Unknown';

    room.forEach((peerInfo) => {
      peerInfo.socket.send(JSON.stringify({
        type: 'game-end',
        data: {
          gameType: 'number-bomb',
          result: 'explosion',
          explodedPlayer: explodedPlayer,
          explodedUsername,
          bombNumber: gameState.bombNumber,
          guesses: Object.fromEntries(guesses.map(([peerId, guess]) => [
            room.get(peerId)?.username || peerId, guess
          ]))
        }
      }));
    });

    roomGames.delete(roomName);
    console.log(`[${roomName}] Game ended. ${explodedUsername} exploded!`);
  } else {
    // 更新范围并继续游戏
    updateGameRange(gameState, guesses);
    gameState.round++;
    gameState.guesses.clear();
    gameState.waitingForGuesses = new Set(room.keys());

    // 通知所有玩家新的游戏状态
    room.forEach((peerInfo) => {
      peerInfo.socket.send(JSON.stringify({
        type: 'game-round-result',
        data: {
          gameType: 'number-bomb',
          currentRange: gameState.currentRange,
          round: gameState.round,
          guesses: Object.fromEntries(guesses.map(([peerId, guess]) => [
            room.get(peerId)?.username || peerId, guess
          ])),
          waitingForGuesses: Array.from(gameState.waitingForGuesses)
        }
      }));
    });

    console.log(`[${roomName}] Round ${gameState.round - 1} completed. New range: ${gameState.currentRange.min}-${gameState.currentRange.max}`);
  }
}

function updateGameRange(gameState: GameState, guesses: [string, number][]): void {
  const bombNumber = gameState.bombNumber;
  let newMin = gameState.currentRange.min;
  let newMax = gameState.currentRange.max;

  for (const [_, guess] of guesses) {
    if (guess < bombNumber) {
      newMin = Math.max(newMin, guess + 1);
    } else if (guess > bombNumber) {
      newMax = Math.min(newMax, guess - 1);
    }
  }

  gameState.currentRange = { min: newMin, max: newMax };
}

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

          // 游戏相关消息处理
          case 'start-number-bomb': {
            const room = rooms.get(roomName);
            if (room && room.size >= 2) { // 至少需要2个玩家
              try {
                startNumberBombGame(roomName);
              } catch (error) {
                console.error(`[${roomName}] Failed to start game:`, error);
                socket.send(JSON.stringify({
                  type: 'game-error',
                  data: { message: '游戏启动失败' }
                }));
              }
            } else {
              socket.send(JSON.stringify({
                type: 'game-error',
                data: { message: '至少需要2个玩家才能开始游戏' }
              }));
            }
            break;
          }

          case 'submit-guess': {
            const gameState = roomGames.get(roomName);
            const room = rooms.get(roomName);
            if (gameState && room && gameState.gameActive) {
              const guess = parseInt(data.guess);
              if (isNaN(guess) || guess < gameState.currentRange.min || guess > gameState.currentRange.max) {
                socket.send(JSON.stringify({
                  type: 'game-error',
                  data: { message: `请输入 ${gameState.currentRange.min}-${gameState.currentRange.max} 之间的数字` }
                }));
                break;
              }

              // 记录猜测
              gameState.guesses.set(peerId, guess);
              gameState.waitingForGuesses.delete(peerId);

              console.log(`[${roomName}] ${room.get(peerId)?.username} guessed: ${guess}`);

              // 通知所有玩家有人提交了猜测
              room.forEach((peerInfo) => {
                peerInfo.socket.send(JSON.stringify({
                  type: 'player-guessed',
                  data: {
                    playerUsername: room.get(peerId)?.username,
                    waitingCount: gameState.waitingForGuesses.size,
                    totalPlayers: room.size
                  }
                }));
              });

              // 如果所有人都猜测了，处理结果
              if (gameState.waitingForGuesses.size === 0) {
                processNumberBombGuesses(roomName);
              }
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

          // 处理游戏状态
          const gameState = roomGames.get(userRoom);
          if (gameState && gameState.gameActive) {
            gameState.waitingForGuesses.delete(peerId);
            gameState.guesses.delete(peerId);

            // 如果房间人数不足，结束游戏
            if (room.size < 2) {
              gameState.gameActive = false;
              roomGames.delete(userRoom);
              room.forEach((peerInfo) => {
                peerInfo.socket.send(JSON.stringify({
                  type: 'game-end',
                  data: {
                    gameType: 'number-bomb',
                    result: 'insufficient-players',
                    message: '玩家人数不足，游戏结束'
                  }
                }));
              });
            } else if (gameState.waitingForGuesses.size === 0) {
              // 如果剩余玩家都已猜测，处理结果
              processNumberBombGuesses(userRoom);
            } else {
              // 通知剩余玩家等待状态更新
              room.forEach((peerInfo) => {
                peerInfo.socket.send(JSON.stringify({
                  type: 'player-disconnected-during-game',
                  data: {
                    disconnectedUsername: disconnectedPeerInfo.username,
                    waitingCount: gameState.waitingForGuesses.size,
                    totalPlayers: room.size
                  }
                }));
              });
            }
          }

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
//console.log("Voice chat server running on http://localhost:8000");
//serve(handler, { port: 8000 });
