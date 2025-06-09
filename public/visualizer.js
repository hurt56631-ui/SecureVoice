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

    const canvasCtx = canvasElement.getContext('2d');
    let animationFrameId;

    function draw() {
        animationFrameId = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = 'rgb(247, 250, 252)'; // background: #f7fafc
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

        const barWidth = (canvasElement.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        let totalVolume = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;
            totalVolume += dataArray[i];
            
            canvasCtx.fillStyle = `rgb(50, ${barHeight + 100}, 50)`;
            canvasCtx.fillStyle = '#3182ce'; // blue-500
            
            // 让条形图从中间向两边扩展
            const y = (canvasElement.height - barHeight) / 2;
            canvasCtx.fillRect(x, y, barWidth, barHeight);

            x += barWidth + 1;
        }
        
        if (volumeCallback) {
            const averageVolume = totalVolume / bufferLength;
            volumeCallback(averageVolume);
        }
    }

    draw();

    return {
        stop: () => {
            cancelAnimationFrame(animationFrameId);
            audioContext.close().catch(e => console.error("Error closing AudioContext:", e));
        }
    };
}