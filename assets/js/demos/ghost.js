// The Paranormal Investigation ghost as a playable state machine. Light disturbances pull it into
// Investigate, falling sanity tips Wander into Spook and then Hunt, a hunt only commits to Chase when
// a line-of-sight test against the walls passes, and catching it in your torch beam stuns it.

import { fitCanvas, runWhileActive, trackPointer, drawHudText } from '../canvas-loop.js';

const W = 800;
const H = 450;
const HOUSE = { x: 20, y: 30, w: 570, h: 400 };
const COLS = 3;
const ROWS = 2;
const DOOR = 56;
const STATES = ['WANDER', 'INVESTIGATE', 'SPOOK', 'CHASE', 'HUNT', 'STUNNED', 'DEAD'];
const DETECTION_RADIUS = 90;
const TORCH_RANGE = 210;
const TORCH_ANGLE = 0.55;

const roomW = HOUSE.w / COLS;
const roomH = HOUSE.h / ROWS;
const rooms = [];
for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
        rooms.push({ x: HOUSE.x + col * roomW, y: HOUSE.y + row * roomH, lit: (row + col) % 2 === 0, flicker: 0 });
    }
}

// Wall segments with a door gap in the middle of every interior wall.
const walls = [];
const addWall = (x1, y1, x2, y2) => walls.push({ x1, y1, x2, y2 });
addWall(HOUSE.x, HOUSE.y, HOUSE.x + HOUSE.w, HOUSE.y);
addWall(HOUSE.x, HOUSE.y + HOUSE.h, HOUSE.x + HOUSE.w, HOUSE.y + HOUSE.h);
addWall(HOUSE.x, HOUSE.y, HOUSE.x, HOUSE.y + HOUSE.h);
addWall(HOUSE.x + HOUSE.w, HOUSE.y, HOUSE.x + HOUSE.w, HOUSE.y + HOUSE.h);
for (let col = 1; col < COLS; col++) {
    const x = HOUSE.x + col * roomW;
    for (let row = 0; row < ROWS; row++) {
        const top = HOUSE.y + row * roomH;
        addWall(x, top, x, top + roomH / 2 - DOOR / 2);
        addWall(x, top + roomH / 2 + DOOR / 2, x, top + roomH);
    }
}
for (let row = 1; row < ROWS; row++) {
    const y = HOUSE.y + row * roomH;
    for (let col = 0; col < COLS; col++) {
        const left = HOUSE.x + col * roomW;
        addWall(left, y, left + roomW / 2 - DOOR / 2, y);
        addWall(left + roomW / 2 + DOOR / 2, y, left + roomW, y);
    }
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (d === 0) return false;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
    const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
}
const lineOfSight = (ax, ay, bx, by) => !walls.some((w) => segmentsCross(ax, ay, bx, by, w.x1, w.y1, w.x2, w.y2));
const roomIndexAt = (x, y) => {
    const col = Math.floor((x - HOUSE.x) / roomW);
    const row = Math.floor((y - HOUSE.y) / roomH);
    return col < 0 || row < 0 || col >= COLS || row >= ROWS ? -1 : row * COLS + col;
};
const roomCentre = (i) => ({ x: rooms[i].x + roomW / 2, y: rooms[i].y + roomH / 2 });

export function createGhostDemo(canvas, { reducedMotion = false } = {}) {
    const context = canvas.getContext('2d');
    const pointer = trackPointer(canvas, W, H);
    const player = { x: roomCentre(0).x, y: roomCentre(0).y, aim: 0, sanity: 100 };
    const ghost = { x: roomCentre(5).x, y: roomCentre(5).y, state: 'WANDER', timer: 0, target: roomCentre(5), alpha: 0.6 };
    const log = [];
    let autoTarget = roomCentre(1);
    let lastClicks = 0;
    let time = 0;
    let caughtFlash = 0;
    let grace = 0;
    let survived = 0;
    let stuns = 0;

    function changeState(next, reason) {
        if (ghost.state === next) return;
        ghost.state = next;
        ghost.timer = 0;
        log.unshift({ state: next, reason });
        log.length = Math.min(log.length, 5);
    }

    function torchHits(x, y) {
        const dx = x - player.x;
        const dy = y - player.y;
        const distance = Math.hypot(dx, dy);
        if (distance > TORCH_RANGE) return false;
        const angle = Math.atan2(dy, dx);
        const delta = Math.abs(Math.atan2(Math.sin(angle - player.aim), Math.cos(angle - player.aim)));
        return delta < TORCH_ANGLE && lineOfSight(player.x, player.y, x, y);
    }

    function movePlayer(tx, ty, speed, dt) {
        const dx = tx - player.x;
        const dy = ty - player.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 3) return;
        const stepX = (dx / distance) * Math.min(speed * dt, distance);
        const stepY = (dy / distance) * Math.min(speed * dt, distance);
        if (lineOfSight(player.x, player.y, player.x + stepX * 3, player.y)) player.x += stepX;
        if (lineOfSight(player.x, player.y, player.x, player.y + stepY * 3)) player.y += stepY;
    }

    function step(dt) {
        time += dt;
        ghost.timer += dt;
        caughtFlash = Math.max(0, caughtFlash - dt);
        grace = Math.max(0, grace - dt);
        survived += dt;
        rooms.forEach((room) => { room.flicker = Math.max(0, room.flicker - dt); });

        const steering = pointer.inside && performance.now() - pointer.lastMove < 5000;
        if (steering) {
            player.aim = Math.atan2(pointer.y - player.y, pointer.x - player.x);
            if (pointer.down) movePlayer(pointer.x, pointer.y, 120, dt);
            else if (Math.hypot(pointer.x - player.x, pointer.y - player.y) > 60) movePlayer(pointer.x, pointer.y, 95, dt);
            if (pointer.clicks !== lastClicks) {
                lastClicks = pointer.clicks;
                const clicked = roomIndexAt(pointer.x, pointer.y);
                if (clicked >= 0) {
                    rooms[clicked].lit = !rooms[clicked].lit;
                    ghost.target = roomCentre(clicked);
                    changeState('INVESTIGATE', `light flicked in room ${clicked + 1}`);
                }
            }
        } else {
            if (Math.hypot(autoTarget.x - player.x, autoTarget.y - player.y) < 8) autoTarget = roomCentre((Math.random() * rooms.length) | 0);
            movePlayer(autoTarget.x, autoTarget.y, 85, dt);
            player.aim += (Math.atan2(ghost.y - player.y, ghost.x - player.x) - player.aim) * Math.min(1, dt * 0.8);
            if (Math.random() < dt * 0.15) {
                const room = (Math.random() * rooms.length) | 0;
                rooms[room].lit = !rooms[room].lit;
                ghost.target = roomCentre(room);
                changeState('INVESTIGATE', `light flicked in room ${room + 1}`);
            }
        }

        const myRoom = roomIndexAt(player.x, player.y);
        const inLight = myRoom >= 0 && rooms[myRoom].lit;
        player.sanity = Math.max(0, Math.min(100, player.sanity + (inLight ? 3 : -1.1) * dt));
        const sanityPct = player.sanity / 100;
        const toPlayer = Math.hypot(player.x - ghost.x, player.y - ghost.y);
        const canSee = lineOfSight(ghost.x, ghost.y, player.x, player.y);

        if (ghost.state !== 'STUNNED' && torchHits(ghost.x, ghost.y) && (ghost.state === 'CHASE' || ghost.state === 'HUNT' || ghost.state === 'SPOOK')) {
            stuns++;
            changeState('STUNNED', 'caught in the torch beam');
        }

        let speed = 50;
        switch (ghost.state) {
            case 'WANDER':
                if (Math.hypot(ghost.target.x - ghost.x, ghost.target.y - ghost.y) < 10) ghost.target = roomCentre((Math.random() * rooms.length) | 0);
                if (grace <= 0 && toPlayer < DETECTION_RADIUS && canSee) changeState('CHASE', 'player inside detection sphere');
                else if (sanityPct < 0.2) changeState('HUNT', `sanity ${Math.round(player.sanity)}% < 20%`);
                else if (sanityPct < 0.45 && ghost.timer > 4) changeState('SPOOK', `sanity ${Math.round(player.sanity)}% < 45%`);
                break;
            case 'INVESTIGATE':
                speed = 65;
                if (grace <= 0 && toPlayer < DETECTION_RADIUS && canSee) changeState('CHASE', 'found the player while investigating');
                else if (Math.hypot(ghost.target.x - ghost.x, ghost.target.y - ghost.y) < 10 && ghost.timer > 1.5) changeState('WANDER', 'nothing found');
                break;
            case 'SPOOK':
                speed = 55;
                ghost.target = { x: player.x, y: player.y };
                if (toPlayer < 70) {
                    player.sanity = Math.max(0, player.sanity - 8);
                    if (myRoom >= 0) { rooms[myRoom].flicker = 0.8; rooms[myRoom].lit = false; }
                    changeState('WANDER', 'spooked the player (-8 sanity)');
                } else if (ghost.timer > 6) changeState('WANDER', 'lost interest');
                break;
            case 'HUNT':
                speed = 60;
                ghost.target = { x: player.x, y: player.y };
                if (grace <= 0 && canSee && toPlayer < 220) changeState('CHASE', 'line-of-sight raycast passed');
                else if (sanityPct > 0.4) changeState('WANDER', 'sanity recovered');
                break;
            case 'CHASE':
                speed = 72;
                ghost.target = { x: player.x, y: player.y };
                if (grace <= 0 && toPlayer < 14) {
                    player.sanity = Math.max(0, player.sanity - 20);
                    caughtFlash = 1;
                    Object.assign(player, roomCentre(0));
                    Object.assign(ghost, roomCentre(5));
                    grace = 3;
                    survived = 0;
                    changeState('WANDER', 'caught the player (-20 sanity)');
                } else if (!canSee && ghost.timer > 2) changeState('HUNT', 'lost line of sight');
                break;
            case 'STUNNED':
                speed = 0;
                if (ghost.timer > 3.5) changeState('WANDER', 'recovered from stun');
                break;
            default:
                break;
        }

        const gx = ghost.target.x - ghost.x;
        const gy = ghost.target.y - ghost.y;
        const gd = Math.hypot(gx, gy);
        if (gd > 1 && speed > 0) {
            ghost.x += (gx / gd) * Math.min(speed * dt, gd);
            ghost.y += (gy / gd) * Math.min(speed * dt, gd);
        }
        ghost.alpha = ghost.state === 'STUNNED' ? 0.25 + Math.random() * 0.4 : 0.55 + Math.sin(time * 3) * 0.2;
    }

    function draw() {
        fitCanvas(canvas, context, W, H);

        rooms.forEach((room, i) => {
            const flicker = room.flicker > 0 && Math.random() < 0.5;
            context.fillStyle = room.lit && !flicker ? 'rgba(255, 214, 140, 0.12)' : 'rgba(0, 0, 0, 0.6)';
            context.fillRect(room.x, room.y, roomW, roomH);
            context.fillStyle = room.lit ? '#ffd68c' : '#2a3a44';
            context.beginPath();
            context.arc(room.x + roomW / 2, room.y + 16, 5, 0, Math.PI * 2);
            context.fill();
            drawHudText(context, `ROOM_${i + 1}`, room.x + 8, room.y + roomH - 10, '#3b5664', 10);
        });

        const cone = context.createRadialGradient(player.x, player.y, 0, player.x, player.y, TORCH_RANGE);
        cone.addColorStop(0, 'rgba(255, 245, 200, 0.4)');
        cone.addColorStop(1, 'rgba(255, 245, 200, 0)');
        context.fillStyle = cone;
        context.beginPath();
        context.moveTo(player.x, player.y);
        context.arc(player.x, player.y, TORCH_RANGE, player.aim - TORCH_ANGLE, player.aim + TORCH_ANGLE);
        context.closePath();
        context.fill();

        context.strokeStyle = '#00f3ff';
        context.lineWidth = 3;
        context.shadowColor = '#00f3ff';
        context.shadowBlur = 8;
        context.beginPath();
        walls.forEach((w) => { context.moveTo(w.x1, w.y1); context.lineTo(w.x2, w.y2); });
        context.stroke();
        context.shadowBlur = 0;

        if (ghost.state === 'HUNT' || ghost.state === 'CHASE') {
            const clear = lineOfSight(ghost.x, ghost.y, player.x, player.y);
            context.strokeStyle = clear ? 'rgba(255, 77, 94, 0.8)' : 'rgba(139, 163, 176, 0.35)';
            context.setLineDash([5, 5]);
            context.beginPath();
            context.moveTo(ghost.x, ghost.y);
            context.lineTo(player.x, player.y);
            context.stroke();
            context.setLineDash([]);
        }

        context.strokeStyle = 'rgba(157, 123, 255, 0.25)';
        context.beginPath();
        context.arc(ghost.x, ghost.y, DETECTION_RADIUS, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = ghost.alpha;
        context.fillStyle = '#c9b6ff';
        context.shadowColor = '#9d7bff';
        context.shadowBlur = 24;
        context.beginPath();
        context.arc(ghost.x, ghost.y - 4, 13, Math.PI, 0);
        context.lineTo(ghost.x + 13, ghost.y + 12);
        for (let i = 0; i < 4; i++) context.lineTo(ghost.x + 13 - (i + 0.5) * 6.5, ghost.y + (i % 2 ? 12 : 6));
        context.lineTo(ghost.x - 13, ghost.y + 12);
        context.closePath();
        context.fill();
        context.globalAlpha = 1;
        context.shadowBlur = 0;

        context.fillStyle = '#ff8c00';
        context.beginPath();
        context.arc(player.x, player.y, 7, 0, Math.PI * 2);
        context.fill();

        if (caughtFlash > 0) {
            context.fillStyle = `rgba(255, 77, 94, ${caughtFlash * 0.35})`;
            context.fillRect(0, 0, W, H);
        }

        const panelX = 610;
        drawHudText(context, 'GHOST_FSM', panelX, 44, '#00f3ff');
        STATES.forEach((state, i) => {
            const current = state === ghost.state;
            context.fillStyle = current ? 'rgba(0, 243, 255, 0.2)' : 'rgba(255, 255, 255, 0.03)';
            context.fillRect(panelX, 56 + i * 26, 170, 22);
            drawHudText(context, `${current ? '>' : ' '} ${state}`, panelX + 8, 72 + i * 26, current ? '#ffffff' : '#4d6876', 12);
        });
        drawHudText(context, `SANITY ${Math.round(player.sanity)}%`, panelX, 258, player.sanity < 25 ? '#ff4d5e' : '#ff8c00');
        const seconds = Math.floor(survived);
        drawHudText(context, `SURVIVED ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}  STUNS ${stuns}`, panelX, 290, grace > 0 ? '#3ddc97' : '#8ba3b0', 10);
        context.fillStyle = 'rgba(255, 255, 255, 0.12)';
        context.fillRect(panelX, 266, 170, 6);
        context.fillStyle = player.sanity < 25 ? '#ff4d5e' : '#ff8c00';
        context.fillRect(panelX, 266, 170 * (player.sanity / 100), 6);
        drawHudText(context, 'TRANSITIONS', panelX, 314, '#8ba3b0', 10);
        log.forEach((entry, i) => {
            drawHudText(context, entry.state, panelX, 330 + i * 24, '#d5e3ea', 10);
            drawHudText(context, entry.reason.slice(0, 30), panelX, 341 + i * 24, '#4d6876', 9);
        });
    }

    for (let i = 0; i < 30; i++) step(1 / 60);
    draw();
    return runWhileActive({ step, draw, reducedMotion });
}
