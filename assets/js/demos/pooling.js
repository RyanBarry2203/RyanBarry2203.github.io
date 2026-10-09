// An illustrative model (not a measurement) of why the Engine Optimisation project pools enemies.
// Instantiate mode allocates on every spawn and leaves garbage on every despawn; when the modelled
// heap fills, a collection pauses the frame. Pooled mode warms the pool once and then reuses it.

import { fitCanvas, runWhileActive, drawHudText } from '../canvas-loop.js';

const W = 800;
const H = 450;
const MAX_ACTIVE = 500;
const POOL_CAPACITY = 520;
const HEAP_LIMIT = 100;
const ALLOC_PER_SPAWN = 0.35;
const HISTORY = 240;
const ARENA = { x: 14, y: 36, w: W - 28, h: 210 };

export function createPoolingDemo(canvas, { reducedMotion = false, controls } = {}) {
    const context = canvas.getContext('2d');
    const enemies = Array.from({ length: POOL_CAPACITY }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0 }));
    const heapHistory = new Float32Array(HISTORY);
    const frameHistory = new Float32Array(HISTORY);
    let cursor = 0;
    let pooled = true;
    let spawning = true;
    let active = 0;
    let heap = 20;
    let garbage = 0;
    let collections = 0;
    let allocationsThisSecond = 0;
    let allocationsShown = 0;
    let secondTimer = 0;
    let pause = 0;
    let gcFlash = 0;

    const toggle = controls?.querySelector('[data-pool-toggle]');
    toggle?.addEventListener('click', () => {
        pooled = !pooled;
        toggle.setAttribute('aria-pressed', String(pooled));
        toggle.textContent = pooled ? 'Mode: Pooled' : 'Mode: Instantiate';
        heap = pooled ? 26 : 20;
        garbage = 0;
    });

    function spawn() {
        const enemy = enemies.find((e) => !e.active);
        if (!enemy) return;
        enemy.active = true;
        enemy.x = ARENA.x + 20;
        enemy.y = ARENA.y + 20 + Math.random() * (ARENA.h - 40);
        const angle = (Math.random() - 0.5) * 1.2;
        const speed = 40 + Math.random() * 60;
        enemy.vx = Math.cos(angle) * speed;
        enemy.vy = Math.sin(angle) * speed;
        active++;
        if (!pooled) { heap += ALLOC_PER_SPAWN; allocationsThisSecond++; }
    }

    function despawn(enemy) {
        enemy.active = false;
        active--;
        if (!pooled) garbage += ALLOC_PER_SPAWN;
    }

    function step(dt) {
        let frameMs = 7 + active * 0.012 + Math.random() * 1.2;

        if (pause > 0) {
            pause -= dt;
        } else {
            const perFrame = spawning ? 6 : 0;
            for (let i = 0; i < perFrame && active < MAX_ACTIVE; i++) spawn();
            if (active >= MAX_ACTIVE) spawning = false;
            if (!spawning) {
                let removed = 0;
                for (const enemy of enemies) {
                    if (enemy.active && removed < 6) { despawn(enemy); removed++; }
                }
                if (active <= 40) spawning = true;
            }

            enemies.forEach((enemy) => {
                if (!enemy.active) return;
                enemy.x += enemy.vx * dt;
                enemy.y += enemy.vy * dt;
                if (enemy.y < ARENA.y + 4 || enemy.y > ARENA.y + ARENA.h - 4) enemy.vy *= -1;
                if (enemy.x < ARENA.x + 4 || enemy.x > ARENA.x + ARENA.w - 4) enemy.vx *= -1;
            });
        }

        if (!pooled && heap >= HEAP_LIMIT) {
            heap = 20 + (heap - garbage) * 0.2;
            garbage = 0;
            collections++;
            pause = 0.12;
            gcFlash = 0.5;
            frameMs += 38 + Math.random() * 20;
        }
        gcFlash = Math.max(0, gcFlash - dt);

        secondTimer += dt;
        if (secondTimer >= 1) { allocationsShown = allocationsThisSecond; allocationsThisSecond = 0; secondTimer = 0; }

        heapHistory[cursor] = heap;
        frameHistory[cursor] = frameMs;
        cursor = (cursor + 1) % HISTORY;
    }

    function drawGraph(data, top, height, maxValue, colour, label, threshold) {
        context.fillStyle = 'rgba(0, 243, 255, 0.04)';
        context.fillRect(ARENA.x, top, ARENA.w, height);
        if (threshold) {
            const ty = top + height - (threshold.value / maxValue) * height;
            context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            context.setLineDash([4, 4]);
            context.beginPath();
            context.moveTo(ARENA.x, ty);
            context.lineTo(ARENA.x + ARENA.w, ty);
            context.stroke();
            context.setLineDash([]);
            drawHudText(context, threshold.label, ARENA.x + ARENA.w - 80, ty - 4, '#8ba3b0', 9);
        }
        context.strokeStyle = colour;
        context.lineWidth = 1.5;
        context.beginPath();
        for (let i = 0; i < HISTORY; i++) {
            const value = data[(cursor + i) % HISTORY];
            const x = ARENA.x + (i / (HISTORY - 1)) * ARENA.w;
            const y = top + height - Math.min(1, value / maxValue) * height;
            if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
        drawHudText(context, label, ARENA.x + 6, top + 12, colour, 10);
    }

    function draw() {
        fitCanvas(canvas, context, W, H);

        context.strokeStyle = 'rgba(0, 243, 255, 0.3)';
        context.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
        context.fillStyle = pooled ? '#00f3ff' : '#ff8c00';
        enemies.forEach((enemy) => { if (enemy.active) context.fillRect(enemy.x - 1.5, enemy.y - 1.5, 3, 3); });
        if (gcFlash > 0) {
            context.fillStyle = `rgba(255, 77, 94, ${gcFlash * 0.4})`;
            context.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
            context.font = '700 34px Rajdhani, sans-serif';
            context.fillStyle = `rgba(255, 77, 94, ${gcFlash * 2})`;
            context.fillText('GC.COLLECT()', W / 2 - 90, ARENA.y + ARENA.h / 2);
        }

        drawHudText(context, `MODE ${pooled ? 'POOLED' : 'INSTANTIATE'}`, 14, 24, pooled ? '#00f3ff' : '#ff8c00');
        drawHudText(context, `ACTIVE ${String(active).padStart(3, '0')}/${MAX_ACTIVE}`, 190, 24, '#d5e3ea');
        drawHudText(context, `POOL ${pooled ? POOL_CAPACITY : 0}`, 360, 24, '#d5e3ea');
        drawHudText(context, `ALLOCS/S ${allocationsShown}`, 470, 24, allocationsShown ? '#ff8c00' : '#3ddc97');
        drawHudText(context, `GC RUNS ${collections}`, 640, 24, collections ? '#ff4d5e' : '#3ddc97');

        drawGraph(heapHistory, 256, 58, 110, '#ff8c00', 'MANAGED HEAP (model)', { value: HEAP_LIMIT, label: 'GC threshold' });
        drawGraph(frameHistory, 322, 58, 70, '#00f3ff', 'FRAME TIME ms (model)', { value: 16.7, label: '60 FPS' });
    }

    for (let i = 0; i < 120; i++) step(1 / 60);
    draw();
    return runWhileActive({ step, draw, reducedMotion });
}
