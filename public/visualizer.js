// public/visualizer.js

function createVisualizer(stream, canvasElement, volumeCallback) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);
    // 不连接到 destination，避免回声

    const canvasCtx = canvasElement ? canvasElement.getContext('2d') : null;
    let animationFrameId;

    function processAudio() {
        animationFrameId = requestAnimationFrame(processAudio);
        analyser.getByteFrequencyData(dataArray);
        
        let totalVolume = 0;
        for (let i = 0; i < bufferLength; i++) {
            totalVolume += dataArray[i];
        }
        const averageVolume = totalVolume / bufferLength;

        if (volumeCallback) {
            volumeCallback(averageVolume);
        }
        
        // 如果没有 canvas，就不需要绘制
        if (!canvasCtx) return;

        // --- Canvas 绘制逻辑 ---
        canvasCtx.fillStyle = 'rgb(247, 250, 252)'; // background: #f7fafc
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

        const barWidth = (canvasElement.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;
            canvasCtx.fillStyle = '#3182ce'; // blue-500
            const y = (canvasElement.height - barHeight) / 2;
            canvasCtx.fillRect(x, y, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    processAudio();

    return {
        stop: () => {
            cancelAnimationFrame(animationFrameId);
            audioContext.close().catch(e => console.error("Error closing AudioContext:", e));
        }
    };
}