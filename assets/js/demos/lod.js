// The Hybrid LOD idea in 2D. Cars drive a road graph; near the camera they "hydrate" into full
// GameObjects, far away they "dehydrate" into ECS data. The two radii differ (3:4, as in the Unity
// project's 150 / 200), so a car sitting on the boundary doesn't flip state every frame.

import { fitCanvas, runWhileActive } from '../canvas-loop.js';

const WORLD_W = 800;
const WORLD_H = 450;
const COLUMNS = 8;
const ROWS = 5;
const SPACING_X = 100;
const SPACING_Y = 92;
const ORIGIN_X = 50;
const ORIGIN_Y = 41;
const CAR_COUNT = 46;
const HYDRATE_RADIUS = 120;
const DEHYDRATE_RADIUS = 160;

const nodes = [];
for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
        nodes.push({ x: ORIGIN_X + column * SPACING_X, y: ORIGIN_Y + row * SPACING_Y, links: [] });
    }
}
nodes.forEach((node, index) => {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    if (column > 0) node.links.push(index - 1);
    if (column < COLUMNS - 1) node.links.push(index + 1);
    if (row > 0) node.links.push(index - COLUMNS);
    if (row < ROWS - 1) node.links.push(index + COLUMNS);
});

function pickNext(from, previous) {
    const options = nodes[from].links.filter((link) => link !== previous);
    return options[(Math.random() * options.length) | 0];
}

export function createLodDemo(canvas, { reducedMotion = false } = {}) {
    const context = canvas.getContext('2d');
    const cars = Array.from({ length: CAR_COUNT }, () => {
        const from = (Math.random() * nodes.length) | 0;
        return { from, to: pickNext(from, -1), t: Math.random(), speed: 55 + Math.random() * 40, hydrated: false, flash: 0, x: 0, y: 0, angle: 0 };
    });
    const focus = { x: WORLD_W / 2, y: WORLD_H / 2, pointer: false };
    let time = 0;
    let scale = 1;

    canvas.addEventListener('pointermove', (event) => {
        const rect = canvas.getBoundingClientRect();
        const ratio = canvas.width / rect.width;
        const offsetX = (canvas.width - WORLD_W * scale) / 2;
        const offsetY = (canvas.height - WORLD_H * scale) / 2;
        focus.x = ((event.clientX - rect.left) * ratio - offsetX) / scale;
        focus.y = ((event.clientY - rect.top) * ratio - offsetY) / scale;
        focus.pointer = true;
        if (reducedMotion) { step(0); draw(); }
    });
    canvas.addEventListener('pointerleave', () => { focus.pointer = false; });

    function step(dt) {
        time += dt;
        if (!focus.pointer) {
            focus.x = WORLD_W / 2 + Math.sin(time * 0.35) * 240;
            focus.y = WORLD_H / 2 + Math.sin(time * 0.5 + 1) * 110;
        }

        for (const car of cars) {
            const a = nodes[car.from];
            const b = nodes[car.to];
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            car.t += (car.speed * dt) / length;
            if (car.t >= 1) {
                car.t -= 1;
                const previous = car.from;
                car.from = car.to;
                car.to = pickNext(car.from, previous);
            }
            const start = nodes[car.from];
            const end = nodes[car.to];
            car.x = start.x + (end.x - start.x) * car.t;
            car.y = start.y + (end.y - start.y) * car.t;
            car.angle = Math.atan2(end.y - start.y, end.x - start.x);

            const distance = Math.hypot(car.x - focus.x, car.y - focus.y);
            if (!car.hydrated && distance < HYDRATE_RADIUS) { car.hydrated = true; car.flash = 1; }
            else if (car.hydrated && distance > DEHYDRATE_RADIUS) { car.hydrated = false; car.flash = 1; }
            car.flash = Math.max(0, car.flash - dt * 3);
        }
    }

    function draw() {
        scale = fitCanvas(canvas, context, WORLD_W, WORLD_H);

        context.strokeStyle = 'rgba(0, 243, 255, 0.16)';
        context.lineWidth = 2;
        context.beginPath();
        nodes.forEach((node, index) => {
            node.links.forEach((link) => {
                if (link < index) return;
                context.moveTo(node.x, node.y);
                context.lineTo(nodes[link].x, nodes[link].y);
            });
        });
        context.stroke();

        context.fillStyle = 'rgba(0, 243, 255, 0.35)';
        nodes.forEach((node) => context.fillRect(node.x - 2, node.y - 2, 4, 4));

        context.fillStyle = 'rgba(0, 243, 255, 0.06)';
        context.beginPath();
        context.arc(focus.x, focus.y, HYDRATE_RADIUS, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = 'rgba(0, 243, 255, 0.8)';
        context.lineWidth = 1.5;
        context.stroke();
        context.setLineDash([6, 6]);
        context.strokeStyle = 'rgba(255, 140, 0, 0.6)';
        context.beginPath();
        context.arc(focus.x, focus.y, DEHYDRATE_RADIUS, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([]);

        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(focus.x, focus.y, 4, 0, Math.PI * 2);
        context.fill();

        let gameObjects = 0;
        for (const car of cars) {
            if (car.flash > 0) {
                context.strokeStyle = `rgba(255, 255, 255, ${car.flash * 0.8})`;
                context.lineWidth = 1.5;
                context.beginPath();
                context.arc(car.x, car.y, 6 + (1 - car.flash) * 14, 0, Math.PI * 2);
                context.stroke();
            }
            if (car.hydrated) {
                gameObjects++;
                context.save();
                context.translate(car.x, car.y);
                context.rotate(car.angle);
                context.strokeStyle = 'rgba(0, 243, 255, 0.35)';
                context.lineWidth = 1;
                context.beginPath();
                context.moveTo(8, 0);
                context.lineTo(30, 0);
                context.stroke();
                context.shadowColor = '#00f3ff';
                context.shadowBlur = 10;
                context.fillStyle = '#00f3ff';
                context.fillRect(-8, -4.5, 16, 9);
                context.shadowBlur = 0;
                context.fillStyle = '#04070b';
                context.fillRect(2, -3, 4, 6);
                context.restore();
            } else {
                context.fillStyle = '#ff4d5e';
                context.fillRect(car.x - 2, car.y - 2, 4, 4);
            }
        }

        context.font = '600 12px "JetBrains Mono", monospace';
        context.fillStyle = '#d5e3ea';
        context.fillText(`GameObjects ${String(gameObjects).padStart(2, ' ')}   ECS entities ${CAR_COUNT - gameObjects}`, 14, 24);
    }

    for (let i = 0; i < 30; i++) step(1 / 60);
    draw();

    return runWhileActive({ step, draw, reducedMotion });
}
