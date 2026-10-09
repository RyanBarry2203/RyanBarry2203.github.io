// The Gameplay & AI sandbox: CarController.cs's drift model and CameraFlash.cs's pooled burn nodes.
// Sideways velocity = right * dot(velocity, right). Steering hard above 40% of top speed swaps the
// grip factor for a much lower drift grip, so the counter-force only partly cancels the slide.

import { fitCanvas, runWhileActive, trackPointer, trackKeys, drawHudText, drawBackdropGrid } from '../canvas-loop.js';

const W = 800;
const H = 450;
const MAX_SPEED = 260;
const ACCELERATION = 330;
const GRIP = 7;
const DRIFT_GRIP = 1.1;
const DRAG = 0.6;
const TURN_RATE = 3.2;
const FLASH_RANGE = 300;
const STUN_RADIUS = 70;
const POOL_SIZE = 16;
const BURN_TIME = 2.6;
const SKIDS = 220;

const obstacles = [
    { x: 250, y: 150, w: 70, h: 150 },
    { x: 480, y: 150, w: 70, h: 150 },
    { x: 365, y: 30, w: 70, h: 50 },
    { x: 365, y: 370, w: 70, h: 50 },
];
const waypoints = [{ x: 120, y: 90 }, { x: 680, y: 90 }, { x: 680, y: 360 }, { x: 400, y: 225 }, { x: 120, y: 360 }];

const insideObstacle = (x, y) => x < 12 || y < 12 || x > W - 12 || y > H - 12 || obstacles.some((o) => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h);

export function createDriftDemo(canvas, { reducedMotion = false, controls } = {}) {
    const context = canvas.getContext('2d');
    const pointer = trackPointer(canvas, W, H);
    let lastInput = -Infinity;
    const keys = trackKeys(canvas, (key) => { lastInput = performance.now(); if (key === 'f') fireFlash(); });
    controls?.querySelector('[data-drift-flash]')?.addEventListener('click', () => { lastInput = performance.now(); fireFlash(); canvas.focus({ preventScroll: true }); });

    const car = { x: 120, y: 225, vx: 0, vy: 0, heading: -Math.PI / 2, drifting: false, steer: 0 };
    const pool = Array.from({ length: POOL_SIZE }, () => ({ active: false, x: 0, y: 0, life: 0 }));
    const skids = Array.from({ length: SKIDS }, () => ({ x1: 0, y1: 0, x2: 0, y2: 0, life: 0 }));
    let skidCursor = 0;
    const enemies = Array.from({ length: 4 }, (_, i) => ({ x: 600 + (i % 2) * 80, y: 120 + i * 70, state: 'WANDER', timer: 0, tx: 400, ty: 225 }));
    let flash = null;
    let waypoint = 0;
    let autoFlashTimer = 2;
    let time = 0;
    let prevRear = null;

    function acquireNode(x, y) {
        const node = pool.find((n) => !n.active);
        if (!node) return;
        node.active = true;
        node.x = x;
        node.y = y;
        node.life = BURN_TIME;
    }

    function fireFlash() {
        const dirX = Math.cos(car.heading);
        const dirY = Math.sin(car.heading);
        let hitX = car.x;
        let hitY = car.y;
        let distance = 14;
        for (; distance < FLASH_RANGE; distance += 4) {
            hitX = car.x + dirX * distance;
            hitY = car.y + dirY * distance;
            if (insideObstacle(hitX, hitY)) break;
        }
        flash = { x: hitX, y: hitY, life: 0.35, distance };
        if (distance < FLASH_RANGE) acquireNode(hitX, hitY);
        enemies.forEach((enemy) => {
            if (Math.hypot(enemy.x - hitX, enemy.y - hitY) < STUN_RADIUS) { enemy.state = 'STUNNED'; enemy.timer = 0; }
            else if (Math.hypot(enemy.x - hitX, enemy.y - hitY) < 320) { enemy.state = 'INVESTIGATE'; enemy.timer = 0; enemy.tx = hitX; enemy.ty = hitY; }
        });
    }

    function step(dt) {
        time += dt;
        const forwardX = Math.cos(car.heading);
        const forwardY = Math.sin(car.heading);
        const rightX = -forwardY;
        const rightY = forwardX;
        const speed = Math.hypot(car.vx, car.vy);

        let throttle = 0;
        let steer = 0;
        const usingKeys = performance.now() - lastInput < 3000 && keys.size > 0;
        if (usingKeys) {
            if (keys.has('ArrowUp') || keys.has('w')) throttle = 1;
            if (keys.has('ArrowDown') || keys.has('s')) throttle = -0.6;
            if (keys.has('ArrowLeft') || keys.has('a')) steer = -1;
            if (keys.has('ArrowRight') || keys.has('d')) steer = 1;
        } else {
            const target = pointer.down ? pointer : waypoints[waypoint];
            if (!pointer.down && Math.hypot(target.x - car.x, target.y - car.y) < 60) waypoint = (waypoint + 1) % waypoints.length;
            const wanted = Math.atan2(target.y - car.y, target.x - car.x);
            const delta = Math.atan2(Math.sin(wanted - car.heading), Math.cos(wanted - car.heading));
            steer = Math.max(-1, Math.min(1, delta * 2.2));
            throttle = Math.abs(delta) > 1.6 ? 0.4 : 1;
            if (!pointer.down) {
                autoFlashTimer -= dt;
                if (autoFlashTimer <= 0) { autoFlashTimer = 3.5; fireFlash(); }
            }
        }
        car.steer = steer;

        car.vx += forwardX * throttle * ACCELERATION * dt;
        car.vy += forwardY * throttle * ACCELERATION * dt;
        car.heading += steer * TURN_RATE * Math.min(1, speed / 120) * dt * Math.sign(car.vx * forwardX + car.vy * forwardY || 1);

        // The drift model: remove sideways velocity with a grip factor that drops while drifting.
        const sideways = car.vx * rightX + car.vy * rightY;
        car.drifting = Math.abs(steer) > 0.5 && speed > MAX_SPEED * 0.4;
        const grip = car.drifting ? DRIFT_GRIP : GRIP;
        car.vx -= rightX * sideways * grip * dt;
        car.vy -= rightY * sideways * grip * dt;
        car.vx -= car.vx * DRAG * dt;
        car.vy -= car.vy * DRAG * dt;
        const newSpeed = Math.hypot(car.vx, car.vy);
        if (newSpeed > MAX_SPEED) { car.vx *= MAX_SPEED / newSpeed; car.vy *= MAX_SPEED / newSpeed; }

        const nextX = car.x + car.vx * dt;
        const nextY = car.y + car.vy * dt;
        if (insideObstacle(nextX, car.y)) car.vx *= -0.4; else car.x = nextX;
        if (insideObstacle(car.x, nextY)) car.vy *= -0.4; else car.y = nextY;

        const rear = { x: car.x - forwardX * 9, y: car.y - forwardY * 9 };
        if (car.drifting && Math.abs(sideways) > 40 && prevRear) {
            const skid = skids[skidCursor];
            skidCursor = (skidCursor + 1) % SKIDS;
            Object.assign(skid, { x1: prevRear.x, y1: prevRear.y, x2: rear.x, y2: rear.y, life: 3 });
        }
        prevRear = rear;
        skids.forEach((skid) => { skid.life -= dt; });

        pool.forEach((node) => {
            if (!node.active) return;
            node.life -= dt;
            if (node.life <= 0) node.active = false;
        });
        if (flash) { flash.life -= dt; if (flash.life <= 0) flash = null; }

        enemies.forEach((enemy) => {
            enemy.timer += dt;
            let speedE = 45;
            if (enemy.state === 'STUNNED') { speedE = 0; if (enemy.timer > 2) { enemy.state = 'WANDER'; enemy.timer = 0; } }
            else if (enemy.state === 'INVESTIGATE') { speedE = 85; if (enemy.timer > 4) { enemy.state = 'WANDER'; enemy.timer = 0; } }
            else if (Math.hypot(enemy.tx - enemy.x, enemy.ty - enemy.y) < 10 || enemy.timer > 5) {
                enemy.timer = 0;
                do { enemy.tx = 40 + Math.random() * (W - 80); enemy.ty = 40 + Math.random() * (H - 80); } while (insideObstacle(enemy.tx, enemy.ty));
            }
            const dx = enemy.tx - enemy.x;
            const dy = enemy.ty - enemy.y;
            const d = Math.hypot(dx, dy);
            if (d > 1 && speedE > 0) {
                const nx = enemy.x + (dx / d) * speedE * dt;
                const ny = enemy.y + (dy / d) * speedE * dt;
                if (!insideObstacle(nx, ny)) { enemy.x = nx; enemy.y = ny; } else enemy.timer = 10;
            }
        });
    }

    function draw() {
        fitCanvas(canvas, context, W, H);
        drawBackdropGrid(context, W, H, 40, 0.06);

        context.fillStyle = '#0b1a24';
        context.strokeStyle = 'rgba(0, 243, 255, 0.6)';
        context.lineWidth = 1.5;
        obstacles.forEach((o) => { context.fillRect(o.x, o.y, o.w, o.h); context.strokeRect(o.x, o.y, o.w, o.h); });
        context.strokeRect(12, 12, W - 24, H - 24);

        context.lineWidth = 3;
        skids.forEach((skid) => {
            if (skid.life <= 0) return;
            context.strokeStyle = `rgba(255, 140, 0, ${Math.min(0.5, skid.life / 6)})`;
            context.beginPath();
            context.moveTo(skid.x1, skid.y1);
            context.lineTo(skid.x2, skid.y2);
            context.stroke();
        });

        pool.forEach((node) => {
            if (!node.active) return;
            const strength = node.life / BURN_TIME;
            const glow = context.createRadialGradient(node.x, node.y, 0, node.x, node.y, 40);
            glow.addColorStop(0, `rgba(255, 255, 255, ${strength})`);
            glow.addColorStop(0.3, `rgba(0, 243, 255, ${strength * 0.6})`);
            glow.addColorStop(1, 'rgba(0, 243, 255, 0)');
            context.fillStyle = glow;
            context.beginPath();
            context.arc(node.x, node.y, 40, 0, Math.PI * 2);
            context.fill();
        });

        if (flash) {
            context.strokeStyle = `rgba(255, 255, 255, ${flash.life * 2.5})`;
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(car.x, car.y);
            context.lineTo(flash.x, flash.y);
            context.stroke();
            context.strokeStyle = `rgba(0, 243, 255, ${flash.life * 2})`;
            context.beginPath();
            context.arc(flash.x, flash.y, STUN_RADIUS, 0, Math.PI * 2);
            context.stroke();
        }

        enemies.forEach((enemy) => {
            const colour = enemy.state === 'STUNNED' ? '#8ba3b0' : enemy.state === 'INVESTIGATE' ? '#ff4d5e' : '#c9b6ff';
            context.fillStyle = colour;
            context.shadowColor = colour;
            context.shadowBlur = 10;
            context.beginPath();
            context.arc(enemy.x, enemy.y, 8, 0, Math.PI * 2);
            context.fill();
            context.shadowBlur = 0;
            drawHudText(context, enemy.state[0], enemy.x - 4, enemy.y - 13, colour, 10);
        });

        context.save();
        context.translate(car.x, car.y);
        context.rotate(car.heading);
        context.shadowColor = car.drifting ? '#ff8c00' : '#00f3ff';
        context.shadowBlur = 16;
        context.fillStyle = '#04070b';
        context.strokeStyle = car.drifting ? '#ff8c00' : '#00f3ff';
        context.lineWidth = 2;
        context.fillRect(-12, -7, 24, 14);
        context.strokeRect(-12, -7, 24, 14);
        context.fillStyle = '#ffffff';
        context.fillRect(8, -5, 3, 10);
        context.restore();

        const active = pool.filter((n) => n.active).length;
        drawHudText(context, `SPEED ${Math.round(Math.hypot(car.vx, car.vy))}`, 24, 34, '#d5e3ea');
        drawHudText(context, car.drifting ? 'DRIFT GRIP' : 'FULL GRIP', 150, 34, car.drifting ? '#ff8c00' : '#00f3ff');
        drawHudText(context, `BURN POOL ${active}/${POOL_SIZE}`, W - 170, 34, '#00f3ff');
        drawHudText(context, 'W wander  I investigate  S stunned', W - 300, H - 22, '#4d6876', 10);
    }

    for (let i = 0; i < 30; i++) step(1 / 60);
    draw();
    return runWhileActive({ step, draw, reducedMotion });
}
