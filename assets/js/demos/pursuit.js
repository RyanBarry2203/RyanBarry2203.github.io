// Split_Shift's PursuitCoordinator as a mini-game. A reported crime recruits the 3 nearest police
// within the response radius; every second each pursuer is re-routed to the road node nearest the
// suspect. Keep every pursuer outside the escape distance for 10 seconds and you get away.

import { fitCanvas, runWhileActive, trackPointer, trackKeys, drawHudText } from '../canvas-loop.js';

const W = 800;
const H = 450;
const COLS = 8;
const ROWS = 5;
const SPACING_X = 100;
const SPACING_Y = 90;
const ORIGIN_X = 50;
const ORIGIN_Y = 45;

const RESPONSE_RADIUS = 260;
const MAX_PURSUERS = 3;
const ESCAPE_DISTANCE = 150;
const ESCAPE_TIME = 10;
const REROUTE_INTERVAL = 1;
const CATCH_DISTANCE = 16;
const PLAYER_SPEED = 135;
const POLICE_PATROL_SPEED = 85;
const POLICE_PURSUIT_SPEED = 128;
const LOOKAHEAD = 26;

const nodes = [];
for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) nodes.push({ x: ORIGIN_X + col * SPACING_X, y: ORIGIN_Y + row * SPACING_Y, col, row });
}
const nodeAt = (col, row) => (col < 0 || row < 0 || col >= COLS || row >= ROWS ? -1 : row * COLS + col);
const neighbours = nodes.map((node) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => nodeAt(node.col + dc, node.row + dr)).filter((n) => n >= 0));

function nearestNode(x, y) {
    let best = 0;
    let bestDistance = Infinity;
    nodes.forEach((node, i) => {
        const distance = Math.hypot(node.x - x, node.y - y);
        if (distance < bestDistance) { bestDistance = distance; best = i; }
    });
    return best;
}

// Breadth-first search gives the shortest route on a uniform grid (what A* reduces to here).
function route(from, to) {
    const previous = new Array(nodes.length).fill(-1);
    const queue = [from];
    previous[from] = from;
    while (queue.length) {
        const current = queue.shift();
        if (current === to) break;
        for (const next of neighbours[current]) {
            if (previous[next] === -1) { previous[next] = current; queue.push(next); }
        }
    }
    const path = [];
    for (let at = to; at !== from && at !== -1; at = previous[at]) path.unshift(at);
    return path;
}

function createCar(start, colour) {
    const next = neighbours[start][0];
    return { from: start, to: next, t: 0, path: [], colour, x: nodes[start].x, y: nodes[start].y, heading: 0, pursuing: false };
}

function advance(car, speed, dt, chooseNext) {
    const a = nodes[car.from];
    const b = nodes[car.to];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    car.t += (speed * dt) / length;
    while (car.t >= 1) {
        car.t -= 1;
        const arrived = car.to;
        const cameFrom = car.from;
        car.from = arrived;
        car.to = car.path.length ? car.path.shift() : chooseNext(arrived, cameFrom);
        if (!neighbours[arrived].includes(car.to)) car.to = neighbours[arrived][0];
    }
    const start = nodes[car.from];
    const end = nodes[car.to];
    car.x = start.x + (end.x - start.x) * car.t;
    car.y = start.y + (end.y - start.y) * car.t;

    // Pure pursuit: face a lookahead point further along the route rather than the next node.
    const remaining = (1 - car.t) * Math.hypot(end.x - start.x, end.y - start.y);
    let lookX;
    let lookY;
    if (remaining >= LOOKAHEAD || !car.path.length) {
        const along = Math.min(1, car.t + LOOKAHEAD / (Math.hypot(end.x - start.x, end.y - start.y) || 1));
        lookX = start.x + (end.x - start.x) * along;
        lookY = start.y + (end.y - start.y) * along;
    } else {
        const after = nodes[car.path[0]];
        const extra = LOOKAHEAD - remaining;
        const segment = Math.hypot(after.x - end.x, after.y - end.y) || 1;
        lookX = end.x + ((after.x - end.x) / segment) * extra;
        lookY = end.y + ((after.y - end.y) / segment) * extra;
    }
    const wanted = Math.atan2(lookY - car.y, lookX - car.x);
    const delta = Math.atan2(Math.sin(wanted - car.heading), Math.cos(wanted - car.heading));
    car.heading += delta * Math.min(1, dt * 10);
}

const randomTurn = (at, cameFrom) => {
    const options = neighbours[at].filter((n) => n !== cameFrom);
    return options[(Math.random() * options.length) | 0] ?? cameFrom;
};

export function createPursuitDemo(canvas, { reducedMotion = false, controls } = {}) {
    const context = canvas.getContext('2d');
    const pointer = trackPointer(canvas, W, H);
    let lastInput = -Infinity;
    const keys = trackKeys(canvas, (key) => {
        lastInput = performance.now();
        if (key === 'r') reportCrime();
    });

    const player = createCar(nodeAt(0, 2), '#ff8c00');
    const police = [nodeAt(7, 0), nodeAt(5, 4), nodeAt(3, 0), nodeAt(7, 4), nodeAt(2, 4), nodeAt(5, 1)].map((n) => createCar(n, '#ffffff'));
    const pursuers = [];
    let suspectActive = false;
    let escapeTimer = 0;
    let rerouteTimer = 0;
    let crimeFlash = 0;
    let recruitFlash = 0;
    let status = 'PATROL';
    let statusTime = 0;
    let idleTimer = 0;
    let time = 0;

    function reportCrime() {
        crimeFlash = 1;
        const available = police
            .filter((car) => !pursuers.includes(car) && Math.hypot(car.x - player.x, car.y - player.y) <= RESPONSE_RADIUS)
            .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
        for (let i = 0; i < available.length && pursuers.length < MAX_PURSUERS; i++) {
            available[i].pursuing = true;
            pursuers.push(available[i]);
        }
        suspectActive = true;
        escapeTimer = 0;
        rerouteTimer = 0;
        recruitFlash = 1;
        status = pursuers.length ? 'PURSUIT' : 'NO UNITS IN RANGE';
        statusTime = 2;
    }

    function endPursuit(message) {
        pursuers.forEach((car) => { car.pursuing = false; car.path = []; });
        pursuers.length = 0;
        suspectActive = false;
        escapeTimer = 0;
        status = message;
        statusTime = 2.2;
    }

    controls?.querySelector('[data-pursuit-crime]')?.addEventListener('click', () => { lastInput = performance.now(); reportCrime(); canvas.focus({ preventScroll: true }); });

    // Player choice at each junction: keyboard, then pointer, then a simple escape-minded autopilot.
    function playerChoice(at, cameFrom) {
        const node = nodes[at];
        const wish = [];
        if (keys.has('ArrowUp') || keys.has('w')) wish.push(nodeAt(node.col, node.row - 1));
        if (keys.has('ArrowDown') || keys.has('s')) wish.push(nodeAt(node.col, node.row + 1));
        if (keys.has('ArrowLeft') || keys.has('a')) wish.push(nodeAt(node.col - 1, node.row));
        if (keys.has('ArrowRight') || keys.has('d')) wish.push(nodeAt(node.col + 1, node.row));
        const fromKeys = wish.find((n) => n >= 0);
        if (fromKeys !== undefined) return fromKeys;

        if (pointer.down || (pointer.inside && performance.now() - pointer.lastMove < 1500 && performance.now() - lastInput < 8000)) {
            return neighbours[at].reduce((best, n) => (Math.hypot(nodes[n].x - pointer.x, nodes[n].y - pointer.y) < Math.hypot(nodes[best].x - pointer.x, nodes[best].y - pointer.y) ? n : best));
        }
        if (!suspectActive) return randomTurn(at, cameFrom);
        // Autopilot: take the exit that is furthest from the closest pursuer.
        const threat = pursuers.reduce((closest, car) => (Math.hypot(car.x - node.x, car.y - node.y) < Math.hypot(closest.x - node.x, closest.y - node.y) ? car : closest), pursuers[0]);
        if (!threat) return randomTurn(at, cameFrom);
        return neighbours[at].filter((n) => n !== cameFrom || neighbours[at].length === 1)
            .reduce((best, n) => (Math.hypot(nodes[n].x - threat.x, nodes[n].y - threat.y) > Math.hypot(nodes[best].x - threat.x, nodes[best].y - threat.y) ? n : best), neighbours[at][0]);
    }

    function step(dt) {
        time += dt;
        crimeFlash = Math.max(0, crimeFlash - dt);
        recruitFlash = Math.max(0, recruitFlash - dt * 0.6);
        statusTime -= dt;
        if (statusTime <= 0 && !suspectActive) status = 'PATROL';

        const playerDriving = performance.now() - lastInput < 6000 || pointer.down;
        if (!playerDriving && !suspectActive) {
            idleTimer += dt;
            if (idleTimer > 2.5) { idleTimer = 0; reportCrime(); }
        } else idleTimer = 0;

        advance(player, PLAYER_SPEED, dt, playerChoice);

        if (suspectActive) {
            rerouteTimer -= dt;
            if (rerouteTimer <= 0) {
                rerouteTimer = REROUTE_INTERVAL;
                const target = nearestNode(player.x, player.y);
                pursuers.forEach((car) => { car.path = route(car.to, target); });
            }
        }
        police.forEach((car) => advance(car, car.pursuing ? POLICE_PURSUIT_SPEED : POLICE_PATROL_SPEED, dt, (at, cameFrom) => (car.pursuing ? neighbours[at][0] : randomTurn(at, cameFrom))));

        if (suspectActive) {
            let anyoneClose = false;
            for (const car of pursuers) {
                const distance = Math.hypot(car.x - player.x, car.y - player.y);
                if (distance < CATCH_DISTANCE) { endPursuit('BUSTED'); return; }
                if (distance < ESCAPE_DISTANCE) anyoneClose = true;
            }
            escapeTimer = anyoneClose ? 0 : escapeTimer + dt;
            if (escapeTimer >= ESCAPE_TIME) endPursuit('ESCAPED');
        }
    }

    function drawCar(car, isPlayer) {
        context.save();
        context.translate(car.x, car.y);
        context.rotate(car.heading);
        context.shadowBlur = 12;
        context.shadowColor = isPlayer ? '#ff8c00' : car.pursuing ? '#ff4d5e' : '#00f3ff';
        context.fillStyle = isPlayer ? '#ff8c00' : '#0b1a24';
        context.strokeStyle = isPlayer ? '#ffd29a' : '#00f3ff';
        context.lineWidth = 1.5;
        context.fillRect(-9, -5, 18, 10);
        context.strokeRect(-9, -5, 18, 10);
        if (!isPlayer && car.pursuing) {
            const blink = Math.floor(time * 8) % 2 === 0;
            context.fillStyle = blink ? '#ff4d5e' : '#3d7bff';
            context.fillRect(-2, -5, 4, 4);
            context.fillStyle = blink ? '#3d7bff' : '#ff4d5e';
            context.fillRect(-2, 1, 4, 4);
        }
        context.restore();
    }

    function draw() {
        fitCanvas(canvas, context, W, H);

        context.fillStyle = '#060d14';
        for (let row = 0; row < ROWS; row++) context.fillRect(ORIGIN_X - 14, ORIGIN_Y + row * SPACING_Y - 9, (COLS - 1) * SPACING_X + 28, 18);
        for (let col = 0; col < COLS; col++) context.fillRect(ORIGIN_X + col * SPACING_X - 9, ORIGIN_Y - 14, 18, (ROWS - 1) * SPACING_Y + 28);
        context.strokeStyle = 'rgba(0, 243, 255, 0.18)';
        context.setLineDash([6, 8]);
        context.lineWidth = 1;
        context.beginPath();
        for (let row = 0; row < ROWS; row++) { context.moveTo(ORIGIN_X, ORIGIN_Y + row * SPACING_Y); context.lineTo(ORIGIN_X + (COLS - 1) * SPACING_X, ORIGIN_Y + row * SPACING_Y); }
        for (let col = 0; col < COLS; col++) { context.moveTo(ORIGIN_X + col * SPACING_X, ORIGIN_Y); context.lineTo(ORIGIN_X + col * SPACING_X, ORIGIN_Y + (ROWS - 1) * SPACING_Y); }
        context.stroke();
        context.setLineDash([]);

        context.fillStyle = 'rgba(0, 243, 255, 0.07)';
        for (let row = 0; row < ROWS - 1; row++) {
            for (let col = 0; col < COLS - 1; col++) context.fillRect(ORIGIN_X + col * SPACING_X + 16, ORIGIN_Y + row * SPACING_Y + 16, SPACING_X - 32, SPACING_Y - 32);
        }

        if (crimeFlash > 0) {
            context.strokeStyle = `rgba(255, 77, 94, ${crimeFlash})`;
            context.lineWidth = 2;
            context.beginPath();
            context.arc(player.x, player.y, RESPONSE_RADIUS * (1.1 - crimeFlash * 0.1), 0, Math.PI * 2);
            context.stroke();
        }
        if (suspectActive) {
            context.strokeStyle = 'rgba(255, 140, 0, 0.35)';
            context.setLineDash([4, 6]);
            context.beginPath();
            context.arc(player.x, player.y, ESCAPE_DISTANCE, 0, Math.PI * 2);
            context.stroke();
            context.setLineDash([]);

            pursuers.forEach((car) => {
                context.strokeStyle = 'rgba(255, 77, 94, 0.55)';
                context.lineWidth = 2;
                context.beginPath();
                context.moveTo(car.x, car.y);
                [car.to, ...car.path].forEach((n) => context.lineTo(nodes[n].x, nodes[n].y));
                context.stroke();
                if (recruitFlash > 0) {
                    context.strokeStyle = `rgba(255, 255, 255, ${recruitFlash})`;
                    context.beginPath();
                    context.moveTo(player.x, player.y);
                    context.lineTo(car.x, car.y);
                    context.stroke();
                }
            });
        }

        police.forEach((car) => drawCar(car, false));
        drawCar(player, true);

        drawHudText(context, `STATUS ${status}`, 14, 22, status === 'BUSTED' ? '#ff4d5e' : status === 'ESCAPED' ? '#3ddc97' : '#d5e3ea');
        drawHudText(context, `PURSUERS ${pursuers.length}/${MAX_PURSUERS}`, 230, 22, '#ff4d5e');
        drawHudText(context, 'ESCAPE', 420, 22, '#ff8c00');
        context.fillStyle = 'rgba(255, 255, 255, 0.12)';
        context.fillRect(480, 14, 160, 8);
        context.fillStyle = '#ff8c00';
        context.fillRect(480, 14, 160 * Math.min(1, escapeTimer / ESCAPE_TIME), 8);
        drawHudText(context, `${Math.max(0, ESCAPE_TIME - escapeTimer).toFixed(1)}s`, 650, 22, '#ff8c00');
    }

    for (let i = 0; i < 30; i++) step(1 / 60);
    draw();
    return runWhileActive({ step, draw, reducedMotion });
}
