// Dying Fire's monster as a survival mini-game. A game-loop tick every 3 seconds lets the monster
// service move and raise OnMonsterMoved; listeners turn its distance into an audio cue, and walking
// into an unhidden player triggers the jumpscare. Hiding pushes a HidingState; leaving pops it.

import { fitCanvas, runWhileActive, trackPointer, drawHudText } from '../canvas-loop.js';

const W = 800;
const H = 450;
const TICK = 3;

const ROOMS = [
    { name: 'BEDROOM', x: 30, y: 40 },
    { name: 'HALLWAY', x: 210, y: 40 },
    { name: 'BATHROOM', x: 390, y: 40 },
    { name: 'STUDY', x: 30, y: 180 },
    { name: 'LANDING', x: 210, y: 180 },
    { name: 'KITCHEN', x: 390, y: 180 },
    { name: 'CELLAR', x: 30, y: 320 },
    { name: 'LIBRARY', x: 210, y: 320 },
    { name: 'DINING', x: 390, y: 320 },
];
const ROOM_W = 150;
const ROOM_H = 110;
const LINKS = [[0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5], [3, 6], [4, 7], [5, 8], [6, 7], [7, 8]];
const neighbours = ROOMS.map((_, i) => LINKS.filter(([a, b]) => a === i || b === i).map(([a, b]) => (a === i ? b : a)));

function distanceBetween(from, to) {
    const seen = new Map([[from, 0]]);
    const queue = [from];
    while (queue.length) {
        const room = queue.shift();
        if (room === to) return seen.get(room);
        neighbours[room].forEach((n) => { if (!seen.has(n)) { seen.set(n, seen.get(room) + 1); queue.push(n); } });
    }
    return Infinity;
}

export function createMonsterDemo(canvas, { reducedMotion = false, controls } = {}) {
    const context = canvas.getContext('2d');
    const pointer = trackPointer(canvas, W, H);
    const hideButton = controls?.querySelector('[data-monster-hide]');
    const log = [];
    let playerRoom = 0;
    let monsterRoom = 7;
    let hiding = false;
    let tickTimer = TICK;
    let searchWait = 0;
    let cue = { level: 0, time: 0 };
    let jumpscare = 0;
    let survived = 0;
    let lastClicks = 0;
    let lastHuman = -Infinity;

    function write(text, colour = '#d5e3ea') {
        log.unshift({ text, colour });
        log.length = Math.min(log.length, 11);
    }

    function setHiding(value) {
        if (value === hiding) return;
        hiding = value;
        hideButton?.setAttribute('aria-pressed', String(hiding));
        if (hideButton) hideButton.textContent = hiding ? 'Leave hiding spot' : 'Hide';
        if (hiding) {
            write('Chain: Hide.CanHandle(wardrobe) = true', '#8ba3b0');
            write('StateManager.PushState(HidingState)', '#00f3ff');
        } else write('StateManager.PopState()', '#00f3ff');
    }

    function moveTo(room) {
        if (hiding || !neighbours[playerRoom].includes(room)) return;
        playerRoom = room;
        write(`MoveCommand -> ${ROOMS[room].name}`);
    }

    hideButton?.addEventListener('click', () => { lastHuman = performance.now(); setHiding(!hiding); });

    // The monster service: wait a few turns after moving, lean towards the player when close.
    function monsterTick() {
        if (searchWait > 0) {
            searchWait--;
            write(`Monster searching ${ROOMS[monsterRoom].name}...`, '#8ba3b0');
        } else {
            const options = neighbours[monsterRoom];
            const closer = options.filter((n) => distanceBetween(n, playerRoom) < distanceBetween(monsterRoom, playerRoom));
            const pool = closer.length && Math.random() < 0.6 ? closer : options;
            monsterRoom = pool[(Math.random() * pool.length) | 0];
            if (Math.random() < 0.3) searchWait = 1;
            write(`OnMonsterMoved(${monsterRoom}) ${ROOMS[monsterRoom].name}`, '#c9b6ff');
        }

        const distance = distanceBetween(monsterRoom, playerRoom);
        const level = distance === 0 ? 1 : distance === 1 ? 0.7 : distance === 2 ? 0.35 : 0.1;
        cue = { level, time: 1 };
        write(`AudioCue volume ${level.toFixed(2)} (distance ${distance})`, '#ff8c00');

        if (monsterRoom === playerRoom) {
            if (hiding) {
                survived++;
                write('Monster passes the hiding spot. You survive.', '#3ddc97');
            } else {
                jumpscare = 1.2;
                write('OnJumpscareTriggered()', '#ff4d5e');
                playerRoom = 0;
                monsterRoom = 8;
                survived = 0;
            }
        }
    }

    function autopilot() {
        const distance = distanceBetween(monsterRoom, playerRoom);
        if (distance <= 1 && !hiding) { setHiding(true); return; }
        if (distance >= 2 && hiding) { setHiding(false); return; }
        if (!hiding && Math.random() < 0.5) {
            const away = neighbours[playerRoom].filter((n) => distanceBetween(n, monsterRoom) >= distance);
            if (away.length) moveTo(away[(Math.random() * away.length) | 0]);
        }
    }

    function step(dt) {
        jumpscare = Math.max(0, jumpscare - dt);
        cue.time = Math.max(0, cue.time - dt);

        if (pointer.clicks !== lastClicks) {
            lastClicks = pointer.clicks;
            lastHuman = performance.now();
            const clicked = ROOMS.findIndex((room) => pointer.x > room.x && pointer.x < room.x + ROOM_W && pointer.y > room.y && pointer.y < room.y + ROOM_H);
            if (clicked >= 0) moveTo(clicked);
        }

        tickTimer -= dt;
        if (tickTimer <= 0) {
            tickTimer = TICK;
            if (performance.now() - lastHuman > 9000) autopilot();
            monsterTick();
        }
    }

    function centre(i) { return { x: ROOMS[i].x + ROOM_W / 2, y: ROOMS[i].y + ROOM_H / 2 }; }

    function draw() {
        fitCanvas(canvas, context, W, H);

        context.strokeStyle = 'rgba(0, 243, 255, 0.25)';
        context.lineWidth = 6;
        context.beginPath();
        LINKS.forEach(([a, b]) => { const p = centre(a); const q = centre(b); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y); });
        context.stroke();

        ROOMS.forEach((room, i) => {
            const isPlayer = i === playerRoom;
            const reachable = !hiding && neighbours[playerRoom].includes(i);
            context.fillStyle = isPlayer ? 'rgba(255, 140, 0, 0.12)' : '#060d14';
            context.fillRect(room.x, room.y, ROOM_W, ROOM_H);
            context.strokeStyle = isPlayer ? '#ff8c00' : reachable ? 'rgba(0, 243, 255, 0.8)' : 'rgba(0, 243, 255, 0.25)';
            context.lineWidth = isPlayer || reachable ? 2 : 1;
            context.strokeRect(room.x, room.y, ROOM_W, ROOM_H);
            drawHudText(context, room.name, room.x + 8, room.y + 18, isPlayer ? '#ff8c00' : '#4d6876', 11);
            if (reachable) drawHudText(context, 'CLICK TO MOVE', room.x + 8, room.y + ROOM_H - 10, 'rgba(0, 243, 255, 0.6)', 9);
        });

        const you = centre(playerRoom);
        if (cue.time > 0) {
            context.strokeStyle = `rgba(255, 140, 0, ${cue.time * cue.level})`;
            context.lineWidth = 2;
            for (let r = 0; r < 3; r++) {
                context.beginPath();
                context.arc(you.x, you.y, 20 + (1 - cue.time) * 60 + r * 14, 0, Math.PI * 2);
                context.stroke();
            }
        }
        context.fillStyle = hiding ? 'rgba(255, 140, 0, 0.35)' : '#ff8c00';
        context.beginPath();
        context.arc(you.x, you.y + 10, 9, 0, Math.PI * 2);
        context.fill();
        if (hiding) drawHudText(context, 'HIDING', you.x - 22, you.y + 36, '#ff8c00', 10);

        const monster = centre(monsterRoom);
        context.fillStyle = '#c9b6ff';
        context.shadowColor = '#9d7bff';
        context.shadowBlur = 20;
        context.beginPath();
        context.arc(monster.x + 26, monster.y - 6, 11, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
        context.fillStyle = '#04070b';
        context.fillRect(monster.x + 21, monster.y - 9, 3, 3);
        context.fillRect(monster.x + 28, monster.y - 9, 3, 3);

        const panelX = 560;
        drawHudText(context, 'GAME LOOP TICK', panelX, 40, '#00f3ff');
        context.fillStyle = 'rgba(255, 255, 255, 0.12)';
        context.fillRect(panelX, 48, 220, 5);
        context.fillStyle = '#00f3ff';
        context.fillRect(panelX, 48, 220 * (1 - tickTimer / TICK), 5);
        drawHudText(context, `SURVIVED ${survived}`, panelX, 72, '#3ddc97', 11);
        drawHudText(context, 'EVENTS', panelX, 98, '#8ba3b0', 10);
        log.forEach((entry, i) => drawHudText(context, entry.text.slice(0, 34), panelX, 118 + i * 28, entry.colour, 10));

        if (jumpscare > 0) {
            context.fillStyle = `rgba(255, 30, 50, ${Math.min(0.85, jumpscare)})`;
            context.fillRect(0, 0, W, H);
            context.font = '700 64px Rajdhani, sans-serif';
            context.textAlign = 'center';
            context.fillStyle = '#ffffff';
            context.fillText('JUMPSCARE', W / 2, H / 2 + 20);
            context.textAlign = 'left';
        }
    }

    write('World loaded from SQLite (async)', '#8ba3b0');
    draw();
    return runWhileActive({ step, draw, reducedMotion });
}
