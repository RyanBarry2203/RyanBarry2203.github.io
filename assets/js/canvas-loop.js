// Sizes the canvas backing store to its on-screen size (times device pixel ratio, capped at 2)
// and maps a fixed world rectangle onto it, centred, so the demos can work in world units.
export function fitCanvas(canvas, context, worldWidth, worldHeight) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    const scale = Math.min(width / worldWidth, height / worldHeight);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#04070b';
    context.fillRect(0, 0, width, height);
    context.setTransform(scale, 0, 0, scale, (width - worldWidth * scale) / 2, (height - worldHeight * scale) / 2);
    return scale;
}

// Runs step + draw on requestAnimationFrame only while the demo is active and the tab is visible.
export function runWhileActive({ step, draw, reducedMotion }) {
    let active = false;
    let frameId = 0;
    let last = 0;

    const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        step(dt);
        draw();
        frameId = requestAnimationFrame(frame);
    };

    const update = () => {
        cancelAnimationFrame(frameId);
        frameId = 0;
        if (active && !reducedMotion && !document.hidden) {
            last = performance.now();
            frameId = requestAnimationFrame(frame);
        }
    };

    document.addEventListener('visibilitychange', update);
    addEventListener('resize', () => { if (!frameId) draw(); }, { passive: true });

    return {
        setActive(value) {
            if (value === active) return;
            active = value;
            if (active && !frameId) draw();
            update();
        },
    };
}
