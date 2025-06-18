// 简单的WebSocket连接测试
const ws = new WebSocket('ws://localhost:8000/ws');

ws.onopen = () => {
    console.log('WebSocket连接已建立');
    
    // 模拟加入房间
    ws.send(JSON.stringify({
        type: 'join-room',
        data: { roomName: 'test-room', username: 'test-user' }
    }));
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('收到消息:', message);
};

ws.onclose = () => {
    console.log('WebSocket连接已关闭');
};

ws.onerror = (error) => {
    console.error('WebSocket错误:', error);
};

// 5秒后关闭连接
setTimeout(() => {
    ws.close();
}, 5000);
