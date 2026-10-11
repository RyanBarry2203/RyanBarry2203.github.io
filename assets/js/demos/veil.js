// Tallow's veil, ported from Encounter.MakeTell and CallVeil. A face-down card is LIT if its power is 2
// or more. The Chandler's tell is honest with the night's honesty chance, and his hands show
// Confident when (strong == honest), otherwise Wary. A right call is +1 Flicker; a wrong one costs 2 wax.

import { fitCanvas, runWhileActive, trackPointer, drawHudText } from '../canvas-loop.js';

const W = 800;
const H = 450;
const STRONG_POWER = 2;
const FLICKER_REWARD = 1;
const WAX_PENALTY = 2;
const NIGHTS = [
    { name: 'FIRST TEST', honesty: 0.9 },
    { name: 'SECOND TEST', honesty: 0.8 },
    { name: 'THIRD TEST', honesty: 0.7 },
    { name: 'THE CHANDLER', honesty: 0.55 },
];
const ROUNDS_PER_NIGHT = 3;
const HOST_CARDS = [
    { id: 'husk', name: 'Husk', power: 0 },
    { id: 'drip', name: 'Drip', power: 0 },
    { id: 'wax_mould', name: 'Wax Mould', power: 1 },
    { id: 'weeping_saint', name: 'Weeping Saint', power: 1 },
    { id: 'hook', name: 'Hanging Hook', power: 2 },
    { id: 'melted_man', name: 'Melted Man', power: 3 },
    { id: 'chandlers_hand', name: "The Chandler's Hand", power: 3 },
];

const portraits = new Map();
function portrait(id) {
    if (!portraits.has(id)) {
        const img = new Image();
        img.src = `assets/img/tallow/portraits/${id}.png`;
        portraits.set(id, img);
    }
    return portraits.get(id);
}

export function createVeilDemo(canvas, { reducedMotion = false, controls } = {}) {
    const context = canvas.getContext('2d');
    const pointer = trackPointer(canvas, W, H);
    let round = 0;
    let wax = 20;
    let flicker = 0;
    let correct = 0;
    let current = null;
    let phase = 'tell';
    let timer = 0;
    let time = 0;
    let lastClicks = 0;
    let lastHuman = -Infinity;
    let verdict = null;

    const night = () => NIGHTS[Math.min(NIGHTS.length - 1, Math.floor(round / ROUNDS_PER_NIGHT))];

    function dealRound() {
        const card = HOST_CARDS[(Math.random() * HOST_CARDS.length) | 0];
        const strong = card.power >= STRONG_POWER;
        const honest = Math.random() < night().honesty;
        current = { card, strong, honest, tell: strong === honest ? 'CONFIDENT' : 'WARY' };
        phase = 'tell';
        timer = 0;
        verdict = null;
    }

    function restart() {
        round = 0;
        wax = 20;
        flicker = 0;
        correct = 0;
        dealRound();
    }

    function call(lit) {
        if (phase !== 'call' && phase !== 'tell') return;
        const right = lit === current.strong;
        if (right) { flicker += FLICKER_REWARD; correct++; } else wax = Math.max(1, wax - WAX_PENALTY);
        verdict = { lit, right };
        phase = 'reveal';
        timer = 0;
    }

    const human = () => { lastHuman = performance.now(); };
    controls?.querySelector('[data-veil-lit]')?.addEventListener('click', () => { human(); call(true); });
    controls?.querySelector('[data-veil-hollow]')?.addEventListener('click', () => { human(); call(false); });

    function step(dt) {
        time += dt;
        timer += dt;

        if (pointer.clicks !== lastClicks) {
            lastClicks = pointer.clicks;
            human();
            if (phase === 'done') restart();
            else if (pointer.y > 140 && pointer.y < 380) call(pointer.x < 300);
        }

        if (phase === 'tell' && timer > 1.8) { phase = 'call'; timer = 0; }
        if (phase === 'call' && timer > 5 && performance.now() - lastHuman > 8000) call(current.tell === 'CONFIDENT');
        if (phase === 'reveal' && timer > 1.9) {
            round++;
            if (round >= NIGHTS.length * ROUNDS_PER_NIGHT) { phase = 'done'; timer = 0; }
            else dealRound();
        }
        if (phase === 'done' && timer > 6 && performance.now() - lastHuman > 8000) restart();
    }

    // The Chandler: a candle for a head, wax running from hollow eyes.
    function drawChandler() {
        const cx = 400;
        const flame = 10 + Math.sin(time * 11) * 2 + Math.sin(time * 23) * 1;
        const glow = context.createRadialGradient(cx, 40, 0, cx, 40, 160);
        glow.addColorStop(0, 'rgba(255, 150, 60, 0.35)');
        glow.addColorStop(1, 'rgba(255, 100, 30, 0)');
        context.fillStyle = glow;
        context.fillRect(cx - 160, -120, 320, 320);
        context.fillStyle = '#d9c7a4';
        context.fillRect(cx - 26, 46, 52, 70);
        context.fillStyle = '#1a0804';
        context.beginPath();
        context.arc(cx - 11, 76, 6, 0, Math.PI * 2);
        context.arc(cx + 11, 76, 6, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#b0261a';
        context.fillRect(cx - 13, 82, 3, 18 + Math.sin(time) * 3);
        context.fillRect(cx + 10, 82, 3, 12 + Math.cos(time * 0.8) * 3);
        context.fillStyle = '#ffd27a';
        context.beginPath();
        context.ellipse(cx, 40 - flame / 2, 5, flame, 0, 0, Math.PI * 2);
        context.fill();
    }

    // His hand over the card: a confident tap, or a hover that pulls back.
    function drawHand(cardX, cardY) {
        let offsetY = -70;
        let offsetX = 60;
        if (phase === 'tell') {
            const t = timer;
            if (current.tell === 'CONFIDENT') {
                offsetY = -40 + Math.max(0, Math.sin(t * 9)) * -22;
                offsetX = 30;
            } else {
                offsetY = -40 - Math.min(1, t / 1.2) * 50;
                offsetX = 30 + Math.min(1, t / 1.2) * 70;
            }
        }
        const x = cardX + offsetX;
        const y = cardY + offsetY;
        context.fillStyle = '#c9b48f';
        context.fillRect(x - 18, y, 36, 26);
        for (let f = 0; f < 4; f++) context.fillRect(x - 17 + f * 9, y + 24, 6, 18 + (f === 1 ? 4 : 0));
        context.fillRect(x + 18, y + 6, 10, 6);
        context.fillStyle = '#3a1c14';
        context.fillRect(x - 18, y - 30, 36, 30);
    }

    function draw() {
        fitCanvas(canvas, context, W, H);
        context.imageSmoothingEnabled = false;
        const table = context.createRadialGradient(400, 260, 30, 400, 260, 460);
        table.addColorStop(0, '#3d1c12');
        table.addColorStop(1, '#070302');
        context.fillStyle = table;
        context.fillRect(0, 0, W, H);
        if (!current) return;

        drawChandler();

        const cardX = 400;
        const cardY = 170;
        const flip = phase === 'reveal' ? Math.min(1, timer / 0.4) : 0;
        const widthScale = Math.abs(Math.cos(flip * Math.PI));
        const faceUp = flip > 0.5;
        context.save();
        context.translate(cardX, cardY + 60);
        context.scale(Math.max(0.05, widthScale), 1);
        if (faceUp) {
            context.fillStyle = '#e8d7b0';
            context.fillRect(-55, -70, 110, 140);
            context.fillStyle = '#3a1c18';
            context.fillRect(-48, -48, 96, 72);
            const img = portrait(current.card.id);
            if (img.complete && img.naturalWidth) context.drawImage(img, -32, -44, 64, 64);
            context.fillStyle = '#2a1a10';
            context.font = '700 12px Rajdhani, sans-serif';
            context.textAlign = 'center';
            context.fillText(current.card.name.toUpperCase(), 0, -55);
            context.font = '700 18px "JetBrains Mono", monospace';
            context.fillStyle = current.strong ? '#c8400c' : '#5a4a3a';
            context.fillText(current.strong ? 'LIT' : 'HOLLOW', 0, 52);
            context.textAlign = 'left';
        } else {
            context.fillStyle = '#2b1610';
            context.fillRect(-55, -70, 110, 140);
            context.strokeStyle = '#8a4a2a';
            context.strokeRect(-48, -63, 96, 126);
            context.fillStyle = '#5a2a18';
            context.beginPath();
            context.ellipse(0, 0, 12, 20, 0, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
        if (phase !== 'reveal' && phase !== 'done') drawHand(cardX, cardY);

        context.font = '700 26px Rajdhani, sans-serif';
        context.fillStyle = phase === 'call' ? '#ffb35c' : 'rgba(255, 179, 92, 0.35)';
        context.fillText('< CALL LIT', 120, 250);
        context.fillStyle = phase === 'call' ? '#b8b0a8' : 'rgba(184, 176, 168, 0.35)';
        context.fillText('CALL HOLLOW >', 560, 250);

        if (phase === 'tell' || phase === 'call') drawHudText(context, `HIS HANDS: ${current.tell}`, 330, 360, current.tell === 'CONFIDENT' ? '#ffb35c' : '#9a8a7a', 12);
        if (phase === 'reveal' && verdict) {
            const truth = current.honest ? 'he told the truth' : 'HE LIED';
            drawHudText(context, `${verdict.right ? 'RIGHT  +1 Flicker' : 'WRONG  -2 wax'}  ·  ${truth}`, 280, 360, verdict.right ? '#3ddc97' : '#ff4d5e', 12);
        }

        const n = night();
        drawHudText(context, n.name, 20, 28, '#ff8c00', 12);
        drawHudText(context, `honesty ${Math.round(n.honesty * 100)}%`, 20, 46, '#9a8a7a', 10);
        drawHudText(context, `round ${Math.min(round + 1, NIGHTS.length * ROUNDS_PER_NIGHT)}/${NIGHTS.length * ROUNDS_PER_NIGHT}`, 20, 62, '#9a8a7a', 10);
        drawHudText(context, `WAX ${wax}`, W - 150, 28, '#efe6cf', 12);
        drawHudText(context, `FLICKER +${flicker}`, W - 150, 46, '#ffb35c', 12);
        drawHudText(context, `READ RIGHT ${correct}`, W - 150, 64, '#3ddc97', 10);

        if (phase === 'done') {
            context.fillStyle = 'rgba(5, 2, 1, 0.82)';
            context.fillRect(0, 0, W, H);
            context.textAlign = 'center';
            context.font = '700 40px Rajdhani, sans-serif';
            context.fillStyle = '#ffb35c';
            context.fillText(`YOU READ HIM ${correct} / ${NIGHTS.length * ROUNDS_PER_NIGHT}`, W / 2, 200);
            drawHudText(context, 'he lies more as the night goes on. click to sit down again.', W / 2, 240, '#9a8a7a', 12);
            context.textAlign = 'left';
        }
    }

    restart();
    HOST_CARDS.forEach((card) => { const img = portrait(card.id); if (!img.complete) img.addEventListener('load', () => draw(), { once: true }); });
    draw();
    return runWhileActive({ step, draw, reducedMotion });
}
