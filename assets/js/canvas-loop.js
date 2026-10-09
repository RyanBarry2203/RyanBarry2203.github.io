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

// Tracks the pointer in world units (the same space fitCanvas maps), plus whether it is held down.
export function trackPointer(canvas, worldWidth, worldHeight) {
    const pointer = { x: worldWidth / 2, y: worldHeight / 2, inside: false, down: false, clicks: 0, lastMove: -Infinity };
    const toWorld = (event) => {
        const rect = canvas.getBoundingClientRect();
        const scale = Math.min(rect.width / worldWidth, rect.height / worldHeight);
        pointer.x = (event.clientX - rect.left - (rect.width - worldWidth * scale) / 2) / scale;
        pointer.y = (event.clientY - rect.top - (rect.height - worldHeight * scale) / 2) / scale;
        pointer.lastMove = performance.now();
    };
    canvas.addEventListener('pointermove', (event) => { toWorld(event); pointer.inside = true; });
    canvas.addEventListener('pointerleave', () => { pointer.inside = false; pointer.down = false; });
    canvas.addEventListener('pointerdown', (event) => { toWorld(event); pointer.down = true; pointer.inside = true; pointer.clicks++; canvas.focus({ preventScroll: true }); });
    addEventListener('pointerup', () => { pointer.down = false; });
    return pointer;
}

// Keys held while the canvas has focus. Game keys are swallowed so they never scroll the page.
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'f', 'r']);
export function trackKeys(canvas, onPress = () => {}) {
    const held = new Set();
    canvas.addEventListener('keydown', (event) => {
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (!GAME_KEYS.has(key)) return;
        event.preventDefault();
        if (!held.has(key)) onPress(key);
        held.add(key);
    });
    canvas.addEventListener('keyup', (event) => held.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
    canvas.addEventListener('blur', () => held.clear());
    return held;
}

export function drawHudText(context, text, x, y, colour = '#d5e3ea', size = 12) {
    context.font = `600 ${size}px "JetBrains Mono", monospace`;
    context.fillStyle = colour;
    context.fillText(text, x, y);
}

export function drawBackdropGrid(context, width, height, step = 40, alpha = 0.08) {
    context.strokeStyle = `rgba(0, 243, 255, ${alpha})`;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= width; x += step) { context.moveTo(x, 0); context.lineTo(x, height); }
    for (let y = 0; y <= height; y += step) { context.moveTo(0, y); context.lineTo(width, y); }
    context.stroke();
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
