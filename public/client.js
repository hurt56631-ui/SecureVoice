// public/client.js

// DOM Elements
const joinButton = document.getElementById('joinButton');
const roomNameInput = document.getElementById('roomNameInput');
const localAudio = document.getElementById('localAudio');
const remoteAudioContainer = document.getElementById('remote-audio-container');
const statusText = document.getElementById('statusText');
const myIdSpan = document.getElementById('my-id');

// WebRTC & WebSocket Globals
let localStream;
let myPeerId;
let socket;
const peerConnections = new Map();
const stunServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- 主流程 ---

joinButton.onclick = async () => {
    const roomName = roomNameInput.value.trim();
    if (!roomName) {
        alert('请输入房间名');
        return;
    }

    joinButton.disabled = true;
    roomNameInput.disabled = true;
    updateStatus('正在获取麦克风...');

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localAudio.srcObject = localStream;
        updateStatus('正在连接服务器...');

        // 连接 WebSocket
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
        setupWebSocketListeners(roomName);

    } catch (error) {
        console.error('获取媒体设备失败:', error);
        updateStatus('无法访问麦克风', true);
        joinButton.disabled = false;
        roomNameInput.disabled = false;
    }
};


// --- WebSocket 事件处理 ---

function setupWebSocketListeners(roomName) {
    socket.onopen = () => {
        updateStatus('正在加入房间...');
    };

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const { type, data } = message;

        switch (type) {
            case 'your-id':
                myPeerId = data.peerId;
                myIdSpan.textContent = `我的ID: ${myPeerId}`;
                // 获得 ID 后再加入房间
                socket.send(JSON.stringify({ type: 'join-room', data: { roomName } }));
                break;
            case 'existing-peers':
                updateStatus(`成功加入房间: ${roomName}`);
                // 为每个已存在的 peer 创建连接并发送 offer
                data.peerIds.forEach(peerId => {
                    createAndSendOffer(peerId);
                });
                break;
            case 'new-peer':
                // 新 peer 加入，等待对方 offer
                console.log(`新成员加入: ${data.peerId}`);
                break;
            case 'offer':
                handleOffer(data.sdp, data.sender);
                break;
            case 'answer':
                handleAnswer(data.sdp, data.sender);
                break;
            case 'ice-candidate':
                handleIceCandidate(data.candidate, data.sender);
                break;
            case 'peer-disconnected':
                handlePeerDisconnect(data.peerId);
                break;
        }
    };

    socket.onclose = () => {
        updateStatus('连接已断开', true);
        cleanup();
    };
    
    socket.onerror = (error) => {
        console.error("WebSocket Error:", error);
        updateStatus('连接出错', true);
        cleanup();
    };
}


// --- WebRTC 核心函数 ---

function createPeerConnection(peerId) {
    if (peerConnections.has(peerId)) {
        console.warn(`与 ${peerId} 的连接已存在`);
        return peerConnections.get(peerId);
    }
    
    const pc = new RTCPeerConnection(stunServers);
    peerConnections.set(peerId, pc);

    // 1. 添加本地流轨道
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

    // 3. 处理收到的远程流
    pc.ontrack = (event) => {
        addRemoteAudioStream(peerId, event.streams[0]);
    };
    
    // 4. 连接状态
    pc.onconnectionstatechange = () => {
        console.log(`与 ${peerId} 的连接状态: ${pc.connectionState}`);
    };
    
    return pc;
}

async function createAndSendOffer(peerId) {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.send(JSON.stringify({
        type: 'offer',
        data: { target: peerId, sdp: pc.localDescription }
    }));
}

async function handleOffer(sdp, senderId) {
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
    const audioEl = document.getElementById(`audio-${peerId}`);
    if (audioEl) {
        audioEl.remove();
    }
    console.log(`与成员 ${peerId} 的连接已关闭`);
}


// --- UI & 工具函数 ---

function addRemoteAudioStream(peerId, stream) {
    if (document.getElementById(`audio-${peerId}`)) return; // 防止重复添加

    const peerDiv = document.createElement('div');
    peerDiv.id = `audio-${peerId}`;
    peerDiv.className = 'peer-audio';

    const peerName = document.createElement('p');
    peerName.textContent = `成员: ${peerId.substring(0, 8)}...`;
    
    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.controls = true;

    peerDiv.appendChild(peerName);
    peerDiv.appendChild(audio);
    remoteAudioContainer.appendChild(peerDiv);
}

function updateStatus(message, isError = false) {
    statusText.textContent = message;
    statusText.style.color = isError ? '#c53030' : '#4a5568';
}

function cleanup() {
    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
    remoteAudioContainer.innerHTML = '';
    localStream?.getTracks().forEach(track => track.stop());
    localAudio.srcObject = null;
    joinButton.disabled = false;
    roomNameInput.disabled = false;
    myIdSpan.textContent = '';
}
