// public/client.js

// --- DOM 元素 ---
const loginModal = document.getElementById('login-modal');
const appContainer = document.getElementById('app');
const joinButton = document.getElementById('joinButton');
const usernameInput = document.getElementById('usernameInput'); // 新增
const roomNameInput = document.getElementById('roomNameInput');
const statusText = document.getElementById('statusText');

const localAudio = document.getElementById('localAudio');
const remoteAudioContainer = document.getElementById('remote-audio-container');
const roomNameDisplay = document.getElementById('room-name-display');
const myPeerIdDisplay = document.getElementById('my-peer-id-display');
const micToggleButton = document.getElementById('mic-toggle-btn');
const myAvatar = document.querySelector('.my-avatar');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const userListSidebar = document.getElementById('user-list-sidebar');

// --- WebRTC & WebSocket 全局变量 ---
let localStream;
let myPeerId;
let socket;
const peerConnections = new Map();
const visualizers = new Map(); // 存储 visualizer 实例
const stunServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- 主流程 ---

joinButton.onclick = async () => {
    const username = usernameInput.value.trim(); // 获取用户名
    const roomName = roomNameInput.value.trim();
    if (!username) { // 验证用户名
        alert('请输入您的用户名');
        return;
    }
    if (!roomName) {
        alert('请输入房间名');
        return;
    }

    usernameInput.disabled = true; // 禁用用户名输入框

    joinButton.disabled = true;
    roomNameInput.disabled = true;
    statusText.textContent = '正在获取麦克风...';
    statusText.classList.remove('hidden');

    try {
        const audioConstraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        };
        localStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
        localAudio.srcObject = localStream;
        
        // 设置本地音频可视化
        setupLocalAudioVisualizer();

        statusText.textContent = '正在连接服务器...';

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
        setupWebSocketListeners(roomName, username); // 传递用户名

    } catch (error) {
        console.error('获取媒体设备失败:', error);
        statusText.textContent = '无法访问麦克风。请检查权限。';
        joinButton.disabled = false;
        roomNameInput.disabled = false;
        usernameInput.disabled = false; // 重新启用用户名输入框
    }
};

micToggleButton.onclick = () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        micToggleButton.classList.toggle('muted', !audioTrack.enabled);
        micToggleButton.textContent = audioTrack.enabled ? '🎤' : '🎤';
    }
};


// --- WebSocket 事件处理 ---

function setupWebSocketListeners(roomName, username) { // 接收用户名
    socket.onopen = () => {
        statusText.textContent = '正在加入房间...';
        // 在连接打开时发送 join-room 消息，包含用户名
        socket.send(JSON.stringify({ type: 'join-room', data: { roomName, username } }));
    };

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const { type, data } = message;

        switch (type) {
            case 'your-id':
                myPeerId = data.peerId;
                // myPeerIdDisplay.textContent = `ID: ${myPeerId.substring(0, 8)}`; // 不再显示ID
                myPeerIdDisplay.textContent = username; // 显示用户名
                updateStatus(`成功加入房间: ${roomName}`);
                roomNameDisplay.textContent = roomName;
                loginModal.classList.add('hidden');
                appContainer.classList.remove('hidden');

                // 为每个已存在的 peer 创建连接并发送 offer
                if (Array.isArray(data.peers)) { // data.peers 现在包含 { peerId, username }
                    data.peers.forEach(peer => {
                        createAndSendOffer(peer.peerId);
                        // 在侧边栏添加已存在的用户
                        addSidebarUser(peer.peerId, peer.username);
                    });
                }
                chatInput.disabled = false;
                sendButton.disabled = false;
                setupChat();
                break;
            case 'new-peer':
                console.log(`新成员加入: ${data.peerId} (${data.username})`);
                addChatMessage('系统', `成员 ${data.username} 加入了频道。`);
                // 主动向新成员发起连接
                createAndSendOffer(data.peerId);
                // 在侧边栏添加新用户
                addSidebarUser(data.peerId, data.username);
                break;
            case 'offer':
                handleOffer(data.sdp, data.senderId, data.senderUsername); // 传递用户名
                break;
            case 'answer':
                handleAnswer(data.sdp, data.senderId);
                break;
            case 'ice-candidate':
                handleIceCandidate(data.candidate, data.senderId);
                break;
            case 'chat-message':
                addChatMessage(data.senderUsername, data.message, false); // 使用用户名
                break;
            case 'peer-disconnected':
                handlePeerDisconnect(data.peerId);
                addChatMessage('系统', `成员 ${data.username} 离开了频道。`); // 使用用户名
                break;
        }
    };

    socket.onclose = () => {
        alert('与服务器的连接已断开，请刷新页面重试。');
        cleanup();
    };
    
    socket.onerror = (error) => {
        console.error("WebSocket Error:", error);
         alert('连接发生错误，请刷新页面重试。');
        cleanup();
    };
}


// --- WebRTC 核心函数 ---

function createPeerConnection(peerId) {
    if (peerConnections.has(peerId)) {
        return peerConnections.get(peerId);
    }
    
    const pc = new RTCPeerConnection(stunServers);
    peerConnections.set(peerId, pc);

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    // 2. 处理收到的 ICE Candidate
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.send(JSON.stringify({
                type: 'ice-candidate',
                data: { target: peerId, candidate: event.candidate }
            }));
        }
    };

    pc.ontrack = (event) => {
        addRemoteAudioStream(peerId, event.streams[0]);
    };
    
    pc.onconnectionstatechange = () => {
        console.log(`与 ${peerId} 的连接状态: ${pc.connectionState}`);
        if(pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
           handlePeerDisconnect(peerId);
        }
    };
    
    return pc;
}

// ( बाकी के WebRTC functions: createAndSendOffer, handleOffer, etc. समान रहते हैं )
async function createAndSendOffer(peerId) {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.send(JSON.stringify({
        type: 'offer',
        data: { target: peerId, sdp: pc.localDescription }
    }));
}
 
// 存储 peerId 到 username 的映射
const peerIdToUsernameMap = new Map();

async function handleOffer(sdp, senderId, senderUsername) { // 接收用户名
    peerIdToUsernameMap.set(senderId, senderUsername); // 存储映射
    const pc = createPeerConnection(senderId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.send(JSON.stringify({
        type: 'answer',
        data: { target: senderId, sdp: pc.localDescription }
    }));
}

async function handleAnswer(sdp, senderId) {
    const pc = peerConnections.get(senderId);
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
}

async function handleIceCandidate(candidate, senderId) {
    const pc = peerConnections.get(senderId);
    if (pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch(e) {
            console.error("添加 ICE candidate 失败:", e);
        }
    }
}


function handlePeerDisconnect(peerId) {
    const pc = peerConnections.get(peerId);
    if (pc) {
        pc.close();
        peerConnections.delete(peerId);
    }

    const visualizer = visualizers.get(peerId);
    if(visualizer) {
        visualizer.stop();
        visualizers.delete(peerId);
    }

    const audioCard = document.getElementById(`audio-card-${peerId}`);
    if (audioCard) {
        audioCard.remove();
    }

    const sidebarUser = document.getElementById(`sidebar-user-${peerId}`);
    if (sidebarUser) {
        sidebarUser.remove();
    }

    console.log(`与成员 ${peerId} 的连接已关闭`);
}


// --- 聊天功能 ---

function setupChat() {
    sendButton.onclick = sendMessage;
    chatInput.onkeydown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    };
}

function sendMessage() {
    const message = chatInput.value.trim();
    if (message && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'chat-message',
            data: { message, senderUsername: myPeerIdDisplay.textContent } // 发送用户名
        }));
        addChatMessage('我', message, true);
        chatInput.value = '';
    }
}

function addChatMessage(sender, message, isMe) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    if(isMe) messageElement.style.color = '#fff';

    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit'});

    const senderSpan = document.createElement('span');
    senderSpan.className = 'peer-id';
    senderSpan.textContent = sender;
    
    const messageText = document.createElement('span');
    messageText.textContent = message;

    messageElement.appendChild(timestamp);
    messageElement.appendChild(senderSpan);
    messageElement.appendChild(messageText);
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}


// --- 状态更新 ---
function updateStatus(message) {
    if (statusText) {
        statusText.textContent = message;
        statusText.classList.remove('hidden');
    } else {
        console.warn("statusText element not found. Cannot update status:", message);
    }
}

// --- UI & 可视化 ---

function setupLocalAudioVisualizer() {
    if(!localStream || !myAvatar) return;
    
    // 我们不需要为本地音频绘制 canvas, 只需要音量回调
    const localVisualizer = createVisualizer(localStream, null, (volume) => {
        // 设置一个阈值来判断是否在说话
        if (volume > 5) { // 这个值可能需要微调
            myAvatar.classList.add('speaking');
        } else {
            myAvatar.classList.remove('speaking');
        }
    });

    visualizers.set('local', localVisualizer);
}

function addRemoteAudioStream(peerId, stream) {
    // --- 1. 在主内容区创建音频卡片 (保持不变) ---
    if (!document.getElementById(`audio-card-${peerId}`)) {
        const card = document.createElement('div');
        card.id = `audio-card-${peerId}`;
        card.className = 'audio-card';

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        
        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.playsInline = true;

        const peerInfo = document.createElement('div');
        peerInfo.className = 'peer-info';
        peerInfo.textContent = peerIdToUsernameMap.get(peerId) || `ID: ${peerId.substring(0, 8)}`; // 显示用户名
        
        card.appendChild(avatar);
        card.appendChild(peerInfo);
        card.appendChild(audio);
        remoteAudioContainer.appendChild(card);

        // 为远程音频设置可视化
        const visualizer = createVisualizer(stream, null, (volume) => {
            if (volume > 5) {
                avatar.classList.add('speaking');
                // 同步侧边栏头像
                document.querySelector(`#sidebar-user-${peerId} .avatar`)?.classList.add('speaking');
            } else {
                avatar.classList.remove('speaking');
                document.querySelector(`#sidebar-user-${peerId} .avatar`)?.classList.remove('speaking');
            }
        });
        visualizers.set(peerId, visualizer);
    }
    // 侧边栏用户列表项的添加现在由 `addSidebarUser` 函数处理
}

// 新增函数：在侧边栏添加用户
function addSidebarUser(peerId, username) {
    if (!document.getElementById(`sidebar-user-${peerId}`)) {
        const userElement = document.createElement('div');
        userElement.id = `sidebar-user-${peerId}`;
        userElement.className = 'sidebar-user';

        const avatar = document.createElement('div');
        avatar.className = 'avatar';

        const usernameSpan = document.createElement('span');
        usernameSpan.textContent = username; // 显示用户名

        userElement.appendChild(avatar);
        userElement.appendChild(usernameSpan);
        userListSidebar.appendChild(userElement);
    }
}

function cleanup() {
    // 停止所有可视化
    visualizers.forEach(v => v.stop());
    visualizers.clear();

    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
    
    remoteAudioContainer.innerHTML = '';
    if(userListSidebar) userListSidebar.innerHTML = '';
    
    localStream?.getTracks().forEach(track => track.stop());
    localAudio.srcObject = null;
    
    appContainer.classList.add('hidden');
    loginModal.classList.remove('hidden');

    joinButton.disabled = false;
    roomNameInput.disabled = false;
    usernameInput.disabled = false; // 重新启用用户名输入框
    roomNameInput.value = '';
    usernameInput.value = ''; // 清空用户名输入框
    statusText.textContent = '';
    statusText.classList.add('hidden');

    myPeerIdDisplay.textContent = '未连接';
    chatMessages.innerHTML = '';
    chatInput.value = '';
    chatInput.disabled = true;
    sendButton.disabled = true;
    micToggleButton.classList.add('muted');
    peerIdToUsernameMap.clear(); // 清除映射
}
