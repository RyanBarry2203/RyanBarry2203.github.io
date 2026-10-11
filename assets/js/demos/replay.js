// Tallow's event replay. The rules model resolves a whole turn in one frame and raises EncounterEvent
// structs; EncounterPresenter queues them and, each frame, runs
//   while (wait <= 0 && queue.Count > 0) wait += Handle(queue.Dequeue());
// so the model stays instant and testable while the view plays the turn back as animation.

import { fitCanvas, runWhileActive, trackPointer, drawHudText } from '../canvas-loop.js';

const W = 800;
const H = 450;
const QUEUE_CAPACITY = 256;

const TURN = [
    ['TurnStarted', 0.25], ['CardDrawn', 0.45], ['CardPlayed', 0.5], ['WaxPaid', 0.35],
    ['CardPlayed', 0.5], ['TellShown', 0.6], ['AttackStarted', 0.3], ['DirectHit', 0.45],
    ['FlickerRaised', 0.35], ['CardHit', 0.45], ['DirectHit', 0.45], ['CharmTriggered', 0.5],
    ['AttackResolved', 0.6], ['CandleChanged', 0.7], ['CardRevealed', 0.5], ['CardDied', 0.45],
];
const COLOURS = {
    TurnStarted: '#8a6a4a', CardDrawn: '#c9b49a', CardPlayed: '#e8d7b0', WaxPaid: '#ff8c00', TellShown: '#b8b0a8',
    AttackStarted: '#8a6a4a', DirectHit: '#ffb35c', FlickerRaised: '#efe6cf', CardHit: '#ff5a1f', CharmTriggered: '#00f3ff',
    AttackResolved: '#ffb35c', CandleChanged: '#ff8c00', CardRevealed: '#b8b0a8', CardDied: '#ff4d5e',
};

export function createReplayDemo(canvas, { reducedMotion = false } = {}) {
    const context = canvas.getContext('2d');
    const pointer = trackPointer(canvas, W, H);
    const queue = [];
    let inFlight = [];
    let current = null;
    let wait = 0;
    let idle = 1.5;
    let modelFlash = 0;
    let hostWax = 24;
    let viewCards = 0;
    let lastClicks = 0;
    let turns = 0;
    let handled = 0;

    function resolveTurn() {
        modelFlash = 1;
        turns++;
        TURN.forEach(([kind, duration], i) => inFlight.push({ kind, duration, t: -i * 0.04 }));
    }

    function handle(event) {
        current = { ...event, life: event.duration };
        handled++;
        if (event.kind === 'CardPlayed') viewCards = Math.min(4, viewCards + 1);
        if (event.kind === 'CandleChanged') hostWax = Math.max(4, hostWax - 6);
        if (event.kind === 'CardDied') viewCards = Math.max(0, viewCards - 1);
        return event.duration;
    }

    function step(dt) {
        modelFlash = Math.max(0, modelFlash - dt * 1.5);
        if (pointer.clicks !== lastClicks) { lastClicks = pointer.clicks; if (!queue.length && !inFlight.length) resolveTurn(); }

        for (let i = inFlight.length - 1; i >= 0; i--) {
            const chip = inFlight[i];
            chip.t += dt * 2.4;
            if (chip.t >= 1) { queue.push(chip); inFlight.splice(i, 1); }
        }

        wait -= dt;
        while (wait <= 0 && queue.length > 0) wait += handle(queue.shift());
        if (current) current.life -= dt;

        if (!queue.length && !inFlight.length && wait <= 0) {
            idle -= dt;
            if (idle <= 0) {
                idle = 3;
                if (turns % 3 === 0) { hostWax = 24; viewCards = 0; }
                resolveTurn();
            }
        }
    }

    function box(x, y, w, h, title, subtitle, glow) {
        context.fillStyle = 'rgba(20, 10, 6, 0.9)';
        context.fillRect(x, y, w, h);
        context.strokeStyle = glow > 0 ? `rgba(255, 140, 0, ${0.4 + glow * 0.6})` : 'rgba(255, 170, 90, 0.35)';
        context.lineWidth = glow > 0 ? 2 : 1;
        context.strokeRect(x, y, w, h);
        context.lineWidth = 1;
        context.font = '700 15px Rajdhani, sans-serif';
        context.fillStyle = '#efe6cf';
        context.fillText(title, x + 10, y + 22);
        drawHudText(context, subtitle, x + 10, y + 38, '#8a6a4a', 9);
    }

    function chip(x, y, kind, alpha = 1) {
        context.globalAlpha = alpha;
        context.fillStyle = 'rgba(0, 0, 0, 0.6)';
        context.fillRect(x, y, 112, 18);
        context.strokeStyle = COLOURS[kind] || '#c9b49a';
        context.strokeRect(x, y, 112, 18);
        drawHudText(context, kind, x + 5, y + 13, COLOURS[kind] || '#c9b49a', 9);
        context.globalAlpha = 1;
    }

    function draw() {
        fitCanvas(canvas, context, W, H);
        context.fillStyle = '#0b0504';
        context.fillRect(0, 0, W, H);

        box(20, 40, 170, 250, 'ENCOUNTER', 'Tallow.Core · no Unity refs', modelFlash);
        drawHudText(context, 'rules resolve the whole', 32, 80, '#c9b49a', 10);
        drawHudText(context, 'turn in a single frame', 32, 96, '#c9b49a', 10);
        drawHudText(context, 'raises EncounterEvent', 32, 124, '#ff8c00', 10);
        drawHudText(context, 'structs, never touches', 32, 140, '#ff8c00', 10);
        drawHudText(context, 'a GameObject', 32, 156, '#ff8c00', 10);
        drawHudText(context, `turns resolved ${turns}`, 32, 270, '#8a6a4a', 9);
        if (modelFlash > 0) drawHudText(context, 'RESOLVED', 32, 236, `rgba(255, 179, 92, ${modelFlash})`, 14);

        box(220, 40, 200, 250, 'QUEUE<ENCOUNTEREVENT>', `capacity ${QUEUE_CAPACITY}, allocated once`, 0);
        queue.slice(0, 10).forEach((event, i) => chip(264, 70 + i * 21, event.kind));
        if (queue.length > 10) drawHudText(context, `+${queue.length - 10} more`, 264, 290 - 6, '#8a6a4a', 9);
        context.fillStyle = 'rgba(255, 255, 255, 0.08)';
        context.fillRect(232, 278, 176, 4);
        context.fillStyle = '#ff8c00';
        context.fillRect(232, 278, 176 * Math.min(1, queue.length / 24), 4);

        inFlight.forEach((event) => {
            if (event.t < 0) return;
            const x = 70 + event.t * 194;
            const y = 180 - Math.sin(event.t * Math.PI) * 60;
            chip(x, y, event.kind, 0.9);
        });

        box(450, 40, 330, 250, 'ENCOUNTERPRESENTER → VIEW', 'plays one event at a time', current && current.life > 0 ? 1 : 0);
        const tableY = 200;
        context.fillStyle = '#3b1d14';
        context.fillRect(470, tableY - 40, 290, 110);
        for (let i = 0; i < 4; i++) {
            const filled = i < viewCards;
            context.fillStyle = filled ? '#e8d7b0' : 'rgba(255, 170, 90, 0.12)';
            context.fillRect(486 + i * 70, tableY, 48, 60);
        }
        const height = 10 + hostWax * 2.2;
        context.fillStyle = '#e9dcc0';
        context.fillRect(608, tableY - 44 - height + 60, 22, height);
        context.fillStyle = '#ffd27a';
        context.beginPath();
        context.ellipse(619, tableY - 52 - height + 60, 4, 8 + Math.sin(performance.now() / 90) * 2, 0, 0, Math.PI * 2);
        context.fill();
        if (current && current.life > 0) {
            const strength = Math.min(1, current.life / current.duration);
            context.font = '700 22px Rajdhani, sans-serif';
            context.fillStyle = COLOURS[current.kind] || '#efe6cf';
            context.globalAlpha = 0.4 + strength * 0.6;
            context.fillText(current.kind, 470, 106);
            context.globalAlpha = 1;
            drawHudText(context, `Handle() returns ${current.duration.toFixed(2)}s`, 470, 124, '#8a6a4a', 10);
        }

        context.fillStyle = 'rgba(0, 243, 255, 0.06)';
        context.fillRect(20, 320, 760, 54);
        context.strokeStyle = 'rgba(0, 243, 255, 0.35)';
        context.strokeRect(20, 320, 760, 54);
        drawHudText(context, 'EncounterPresenter.Tick(deltaTime)', 32, 340, '#8ba3b0', 10);
        drawHudText(context, 'while (wait <= 0f && queue.Count > 0) wait += Handle(queue.Dequeue());', 32, 362, '#00f3ff', 12);
        drawHudText(context, `events handled ${handled}  ·  waiting ${Math.max(0, wait).toFixed(2)}s  ·  queued ${queue.length}`, 32, 400, '#c9b49a', 10);
        drawHudText(context, 'the model never waits for the animation, so every rule is tested without a scene', 32, 420, '#6a5440', 10);
    }

    draw();
    return runWhileActive({ step, draw, reducedMotion });
}
