// Tallow's strike, ported from Encounter.ResolveAttack. Lanes resolve left to right: a card facing a
// card hits it (a neighbouring Guard can step in), a card facing nothing is a direct hit that adds its
// power to Heat. Sigils and charms raise Flicker, charms fire in slot order, and damage is Heat x Flicker.

import { fitCanvas, runWhileActive, trackPointer, drawHudText } from '../canvas-loop.js';

const W = 800;
const H = 450;
const LANES = 4;
const CARD_W = 78;
const CARD_H = 96;
const LANE_X = [150, 250, 350, 450];
const HOST_Y = 96;
const PLAYER_Y = 226;
const STEP_TIME = 0.55;

const CARDS = {
    moth: { name: 'Moth', power: 0, health: 1, sigils: [], moth: true },
    wax_rat: { name: 'Wax Rat', power: 1, health: 1, sigils: [] },
    tallow_hound: { name: 'Tallow Hound', power: 2, health: 2, sigils: [] },
    wickling: { name: 'Wickling', power: 1, health: 1, sigils: ['Kindle'] },
    ash_moth: { name: 'Ash Moth', power: 1, health: 1, sigils: ['Leap'], moth: true },
    cinder_toad: { name: 'Cinder Toad', power: 1, health: 2, sigils: ['Thorns'] },
    gutter_crow: { name: 'Gutter Crow', power: 2, health: 1, sigils: ['Leap'] },
    sootling: { name: 'Sootling', power: 1, health: 2, sigils: ['TwinStrike'] },
    hollow_choir: { name: 'Hollow Choir', power: 3, health: 2, sigils: [] },
    ember_widow: { name: 'Ember Widow', power: 2, health: 2, sigils: ['Kindle', 'Leap'] },
    mothmother: { name: 'Mothmother', power: 1, health: 2, sigils: ['Kindle'], moth: true },
    red_wick: { name: 'Red Wick', power: 2, health: 2, sigils: ['Kindle'] },
    leech_lamp: { name: 'Leech Lamp', power: 1, health: 2, sigils: ['Drain'] },
    twin_flame: { name: 'Twin Flame', power: 2, health: 2, sigils: ['TwinStrike', 'Kindle'] },
    martyr: { name: 'The Martyr', power: 3, health: 1, sigils: [] },
    pale_stag: { name: 'Pale Stag', power: 2, health: 3, sigils: [] },
    husk: { name: 'Husk', power: 0, health: 1, sigils: [] },
    hook: { name: 'Hanging Hook', power: 2, health: 1, sigils: ['Leap'] },
    wax_mould: { name: 'Wax Mould', power: 1, health: 3, sigils: ['Guard'] },
    melted_man: { name: 'Melted Man', power: 3, health: 4, sigils: [] },
    drip: { name: 'Drip', power: 0, health: 3, sigils: ['Guard'] },
    weeping_saint: { name: 'Weeping Saint', power: 1, health: 4, sigils: ['Guard', 'Thorns'] },
};
const PLAYER_POOL = ['moth', 'wax_rat', 'tallow_hound', 'wickling', 'ash_moth', 'cinder_toad', 'gutter_crow', 'sootling', 'hollow_choir', 'ember_widow', 'mothmother', 'red_wick', 'leech_lamp', 'twin_flame', 'martyr', 'pale_stag'];
const HOST_POOL = ['husk', 'hook', 'wax_mould', 'melted_man', 'drip', 'weeping_saint', 'cinder_toad'];

const CHARMS = {
    ember_ring: { name: 'Ember Ring', text: 'first direct hit +3 Heat', colour: '#ff8c00' },
    cold_hands: { name: 'Cold Hands', text: '1-power hits +2', colour: '#7fc8d8' },
    moth_lantern: { name: 'Moth Lantern', text: '+1 Flicker per Moth', colour: '#b8b0a8' },
    twin_wicks: { name: 'Twin Wicks', text: 'x2 Flicker if neighbours hit', colour: '#ffb35c' },
    last_light: { name: 'Last Light', text: 'x3 Flicker at 5 wax or less', colour: '#efe6cf' },
};

const images = new Map();
function image(path) {
    if (!images.has(path)) {
        const img = new Image();
        img.src = path;
        images.set(path, img);
    }
    return images.get(path);
}
const portrait = (id) => image(`assets/img/tallow/portraits/${id}.png`);
const sigilIcon = (sigil) => image(`assets/img/tallow/sigils/${sigil}.png`);

const pick = (list) => list[(Math.random() * list.length) | 0];
const makeCard = (id) => ({ id, ...CARDS[id], dead: false });
const has = (card, sigil) => card && card.sigils.includes(sigil);

// Runs the real rules on copies of the board and returns every step as an event for playback.
export function resolve(state, charmOrder) {
    const player = state.player.map((c) => (c ? { ...c } : null));
    const host = state.host.map((c) => (c ? { ...c } : null));
    let wax = state.wax;
    const score = { heat: 0, flicker: 1, directHits: 0, mask: 0 };
    const events = [];
    const push = (event) => events.push({ ...event, heat: score.heat, flicker: score.flicker, wax });

    const findGuard = (lane) => {
        if (has(host[lane - 1], 'Guard')) return lane - 1;
        if (has(host[lane + 1], 'Guard')) return lane + 1;
        return -1;
    };

    const directHit = (attacker, from, target) => {
        let amount = attacker.power;
        const bonuses = [];
        charmOrder.forEach((key) => {
            if (key === 'ember_ring' && score.directHits === 0) { amount += 3; bonuses.push('ember_ring'); }
            if (key === 'cold_hands' && attacker.power === 1) { amount += 2; bonuses.push('cold_hands'); }
        });
        score.heat += amount;
        score.directHits++;
        score.mask |= 1 << target;
        push({ kind: 'direct', from, target, amount, charms: bonuses, text: `${attacker.name} hits his candle +${amount} Heat` });
        if (has(attacker, 'Kindle')) { score.flicker += 1; push({ kind: 'flicker', from, text: `Kindle +1 Flicker` }); }
        if (has(attacker, 'Drain') && wax < 20) { wax += 1; push({ kind: 'drain', from, text: 'Drain restores 1 wax' }); }
    };

    const strike = (attacker, from, target) => {
        if (target < 0 || target >= LANES || attacker.dead) return;
        if (!has(attacker, 'Leap')) {
            let defender = host[target];
            if (!defender) {
                const guardLane = findGuard(target);
                if (guardLane >= 0) {
                    defender = host[guardLane];
                    push({ kind: 'guard', from, target: guardLane, text: `${defender.name} guards lane ${target + 1}` });
                    target = guardLane;
                }
            }
            if (defender) {
                defender.health -= attacker.power;
                push({ kind: 'hit', from, target, health: defender.health, text: `${attacker.name} hits ${defender.name}` });
                if (has(defender, 'Thorns')) {
                    attacker.health -= 1;
                    push({ kind: 'thorns', from, target, text: 'Thorns: 1 back' });
                }
                if (defender.health <= 0) { defender.dead = true; host[target] = null; push({ kind: 'death', side: 'host', target, text: `${defender.name} burns away` }); }
                if (attacker.health <= 0) { attacker.dead = true; player[from] = null; push({ kind: 'death', side: 'player', target: from, text: `${attacker.name} burns away` }); }
                return;
            }
        }
        directHit(attacker, from, target);
    };

    for (let lane = 0; lane < LANES; lane++) {
        const card = player[lane];
        if (!card || card.power <= 0) continue;
        push({ kind: 'lane', from: lane, text: `Lane ${lane + 1}: ${card.name}` });
        if (has(card, 'TwinStrike')) { strike(card, lane, lane - 1); strike(card, lane, lane + 1); }
        else strike(card, lane, lane);
    }

    const moths = player.filter((c) => c && c.moth).length;
    charmOrder.forEach((key, slot) => {
        if (key === 'moth_lantern' && moths > 0) { score.flicker += moths; push({ kind: 'charm', slot, text: `Moth Lantern +${moths} Flicker` }); }
        if (key === 'twin_wicks' && (score.mask & (score.mask >> 1)) !== 0) { score.flicker *= 2; push({ kind: 'charm', slot, text: 'Twin Wicks x2 Flicker' }); }
        if (key === 'last_light' && wax <= 5) { score.flicker *= 3; push({ kind: 'charm', slot, text: 'Last Light x3 Flicker' }); }
    });

    push({ kind: 'damage', amount: score.heat * score.flicker, text: `${score.heat} Heat x ${score.flicker} Flicker = ${score.heat * score.flicker}` });
    return { events, damage: score.heat * score.flicker };
}

// Deals a hand worth watching: a fully blocked board scores nothing, so redeal those.
export function deal() {
    let hand = dealOnce();
    for (let tries = 0; tries < 12 && resolve(hand, hand.charms).damage === 0; tries++) hand = dealOnce();
    return hand;
}

function dealOnce() {
    const player = Array.from({ length: LANES }, () => (Math.random() < 0.88 ? makeCard(pick(PLAYER_POOL)) : null));
    if (!player.some((c) => c && c.moth)) player[(Math.random() * LANES) | 0] = makeCard(Math.random() < 0.5 ? 'moth' : 'mothmother');
    const host = Array.from({ length: LANES }, () => (Math.random() < 0.4 ? makeCard(pick(HOST_POOL)) : null));
    const additive = pick(['moth_lantern', 'ember_ring', 'cold_hands']);
    const multiplier = pick(['twin_wicks', 'last_light']);
    const third = pick(Object.keys(CHARMS).filter((k) => k !== additive && k !== multiplier));
    const charms = [additive, multiplier, third].sort(() => Math.random() - 0.5);
    if (!charms.includes('moth_lantern')) charms[charms.findIndex((k) => k !== multiplier)] = 'moth_lantern';
    return { player, host, wax: Math.random() < 0.45 ? 3 + ((Math.random() * 3) | 0) : 8 + ((Math.random() * 10) | 0), charms, hostWax: 40 };
}

export function createStrikeDemo(canvas, { reducedMotion = false, controls } = {}) {
    const context = canvas.getContext('2d');
    const pointer = trackPointer(canvas, W, H);
    let state = deal();
    let display = null;
    let playback = null;
    let idle = 0;
    let rounds = 0;
    let shake = 0;
    let lastClicks = 0;
    let selectedCharm = -1;
    let flash = null;

    const alternative = () => {
        const reversed = [...state.charms].reverse();
        return resolve(state, reversed).damage;
    };

    function resetDisplay() {
        display = { player: state.player.map((c) => (c ? { ...c } : null)), host: state.host.map((c) => (c ? { ...c } : null)), heat: 0, flicker: 1, wax: state.wax, hostWax: state.hostWax, log: [], damage: null };
    }

    function ringBell() {
        if (playback) return;
        resetDisplay();
        const result = resolve(state, state.charms);
        playback = { events: result.events, index: 0, timer: 0.2, other: alternative() };
        idle = 0;
    }

    function newHand() { state = deal(); playback = null; selectedCharm = -1; resetDisplay(); }
    function swapOrder() { if (playback) return; state.charms.reverse(); resetDisplay(); }

    controls?.querySelector('[data-strike-bell]')?.addEventListener('click', ringBell);
    controls?.querySelector('[data-strike-swap]')?.addEventListener('click', swapOrder);
    controls?.querySelector('[data-strike-deal]')?.addEventListener('click', newHand);

    function applyEvent(event) {
        display.heat = event.heat;
        display.flicker = event.flicker;
        display.wax = event.wax;
        display.log.unshift(event.text);
        display.log.length = Math.min(display.log.length, 9);
        flash = { event, life: 1 };
        if (event.kind === 'hit' && display.host[event.target]) display.host[event.target].health = event.health;
        if (event.kind === 'thorns' && display.player[event.from]) display.player[event.from].health -= 1;
        if (event.kind === 'death') (event.side === 'host' ? display.host : display.player)[event.target] = null;
        if (event.kind === 'damage') {
            display.damage = event.amount;
            display.hostWax = Math.max(0, state.hostWax - event.amount);
            shake = Math.min(1, event.amount / 40) + 0.2;
        }
    }

    function step(dt) {
        shake = Math.max(0, shake - dt * 2);
        if (flash) flash.life = Math.max(0, flash.life - dt * 2.2);

        if (pointer.clicks !== lastClicks) {
            lastClicks = pointer.clicks;
            const slot = charmSlotAt(pointer.x, pointer.y);
            if (slot >= 0 && !playback) {
                if (selectedCharm < 0) selectedCharm = slot;
                else { [state.charms[selectedCharm], state.charms[slot]] = [state.charms[slot], state.charms[selectedCharm]]; selectedCharm = -1; resetDisplay(); }
            } else if (pointer.y > 330 && pointer.x < 560) ringBell();
        }

        if (playback) {
            playback.timer -= dt;
            while (playback && playback.timer <= 0) {
                applyEvent(playback.events[playback.index]);
                playback.index++;
                playback.timer += playback.events[playback.index - 1].kind === 'damage' ? 0 : STEP_TIME;
                if (playback.index >= playback.events.length) { display.other = playback.other; playback = null; rounds++; }
            }
        } else {
            idle += dt;
            if (idle > 5.5 && performance.now() - pointer.lastMove > 6000) {
                if (rounds % 2 === 1) newHand();
                ringBell();
            }
        }
    }

    function charmSlotAt(x, y) {
        for (let i = 0; i < 3; i++) {
            const cx = 120 + i * 150;
            if (x > cx && x < cx + 140 && y > 360 && y < 432) return i;
        }
        return -1;
    }

    function drawCard(card, x, y, side, lane) {
        if (!card) {
            context.strokeStyle = 'rgba(255, 170, 90, 0.18)';
            context.setLineDash([4, 4]);
            context.strokeRect(x - CARD_W / 2, y, CARD_W, CARD_H);
            context.setLineDash([]);
            return;
        }
        const active = flash && flash.life > 0 && ((side === 'player' && flash.event.from === lane && ['lane', 'direct', 'hit', 'flicker'].includes(flash.event.kind)) || (side === 'host' && flash.event.target === lane && ['hit', 'guard'].includes(flash.event.kind)));
        context.fillStyle = '#e8d7b0';
        context.fillRect(x - CARD_W / 2, y, CARD_W, CARD_H);
        context.fillStyle = side === 'host' ? '#3a1c18' : '#2a2018';
        context.fillRect(x - CARD_W / 2 + 4, y + 16, CARD_W - 8, 50);
        const img = portrait(card.id);
        if (img.complete && img.naturalWidth) context.drawImage(img, x - 24, y + 17, 48, 48);
        context.fillStyle = '#2a1a10';
        context.font = '700 10px Rajdhani, sans-serif';
        context.textAlign = 'center';
        context.fillText(card.name.toUpperCase().slice(0, 14), x, y + 12);
        context.textAlign = 'left';
        context.font = '700 15px "JetBrains Mono", monospace';
        context.fillStyle = '#b4280c';
        context.fillText(String(card.power), x - CARD_W / 2 + 6, y + CARD_H - 8);
        context.fillStyle = '#2a1a10';
        context.fillText(String(Math.max(0, card.health)), x + CARD_W / 2 - 15, y + CARD_H - 8);
        card.sigils.forEach((sigil, i) => {
            const icon = sigilIcon(sigil);
            if (icon.complete && icon.naturalWidth) context.drawImage(icon, x - 10 + i * 18, y + 70, 16, 16);
        });
        if (active) {
            context.strokeStyle = '#ff8c00';
            context.lineWidth = 3;
            context.shadowColor = '#ff8c00';
            context.shadowBlur = 16;
            context.strokeRect(x - CARD_W / 2 - 2, y - 2, CARD_W + 4, CARD_H + 4);
            context.shadowBlur = 0;
            context.lineWidth = 1;
        }
    }

    function drawCandle(x, y, wax, max, label) {
        const height = 16 + 60 * Math.min(1, wax / max);
        context.fillStyle = '#e9dcc0';
        context.fillRect(x - 12, y - height, 24, height);
        const flame = 8 + Math.sin(performance.now() / 90) * 2;
        const glow = context.createRadialGradient(x, y - height - 8, 0, x, y - height - 8, 40);
        glow.addColorStop(0, 'rgba(255, 170, 60, 0.7)');
        glow.addColorStop(1, 'rgba(255, 120, 30, 0)');
        context.fillStyle = glow;
        context.fillRect(x - 40, y - height - 48, 80, 80);
        context.fillStyle = '#ffd27a';
        context.beginPath();
        context.ellipse(x, y - height - flame / 2, 4, flame, 0, 0, Math.PI * 2);
        context.fill();
        drawHudText(context, `${label} ${wax}`, x - 26, y + 16, '#e9dcc0', 11);
    }

    function draw() {
        fitCanvas(canvas, context, W, H);
        context.imageSmoothingEnabled = false;
        context.save();
        if (shake > 0) context.translate((Math.random() - 0.5) * shake * 12, (Math.random() - 0.5) * shake * 12);

        const table = context.createRadialGradient(300, 220, 40, 300, 220, 420);
        table.addColorStop(0, '#3b1d14');
        table.addColorStop(1, '#0b0504');
        context.fillStyle = table;
        context.fillRect(0, 0, W, H);

        if (!display) resetDisplay();
        drawCandle(560, 150, display.hostWax, 40, 'HIS WAX');
        drawCandle(40, 300, display.wax, 20, 'YOU');
        for (let lane = 0; lane < LANES; lane++) {
            drawCard(display.host[lane], LANE_X[lane], HOST_Y, 'host', lane);
            drawCard(display.player[lane], LANE_X[lane], PLAYER_Y, 'player', lane);
        }

        if (flash && flash.life > 0 && (flash.event.kind === 'direct' || flash.event.kind === 'hit')) {
            const from = LANE_X[flash.event.from];
            const to = flash.event.kind === 'direct' ? 560 : LANE_X[flash.event.target];
            const toY = flash.event.kind === 'direct' ? 70 : HOST_Y + CARD_H;
            context.strokeStyle = `rgba(255, 160, 60, ${flash.life})`;
            context.lineWidth = 3;
            context.beginPath();
            context.moveTo(from, PLAYER_Y);
            context.lineTo(to, toY);
            context.stroke();
            context.lineWidth = 1;
            if (flash.event.kind === 'direct') {
                context.font = '700 22px Rajdhani, sans-serif';
                context.fillStyle = `rgba(255, 210, 120, ${flash.life})`;
                context.fillText(`+${flash.event.amount}`, to + 20, toY + 10 - (1 - flash.life) * 20);
            }
        }

        state.charms.forEach((key, slot) => {
            const charm = CHARMS[key];
            const x = 120 + slot * 150;
            const firing = flash && flash.life > 0 && ((flash.event.kind === 'charm' && flash.event.slot === slot) || (flash.event.charms || []).includes(key));
            context.fillStyle = firing ? 'rgba(255, 140, 0, 0.35)' : 'rgba(20, 10, 6, 0.85)';
            context.fillRect(x, 362, 140, 70);
            context.strokeStyle = selectedCharm === slot ? '#00f3ff' : charm.colour;
            context.lineWidth = selectedCharm === slot ? 2 : 1;
            context.strokeRect(x, 362, 140, 70);
            context.lineWidth = 1;
            drawHudText(context, `SLOT ${slot + 1}`, x + 8, 378, '#8a6a4a', 9);
            context.font = '700 15px Rajdhani, sans-serif';
            context.fillStyle = charm.colour;
            context.fillText(charm.name.toUpperCase(), x + 8, 398);
            drawHudText(context, charm.text, x + 8, 418, '#c9b49a', 9);
        });
        drawHudText(context, 'CHARMS FIRE LEFT TO RIGHT · CLICK TWO TO SWAP', 120, 352, '#8a6a4a', 9);

        const panel = 600;
        drawHudText(context, 'HEAT', panel, 222, '#ff8c00', 11);
        context.font = '700 34px Rajdhani, sans-serif';
        context.fillStyle = '#ffb35c';
        context.fillText(String(display.heat), panel, 256);
        drawHudText(context, 'x FLICKER', panel + 80, 222, '#efe6cf', 11);
        context.fillStyle = '#efe6cf';
        context.fillText(String(display.flicker), panel + 80, 256);
        if (display.damage !== null) {
            context.font = '700 46px Rajdhani, sans-serif';
            context.fillStyle = '#ff5a1f';
            context.shadowColor = '#ff8c00';
            context.shadowBlur = 20;
            context.fillText(`= ${display.damage}`, panel, 304);
            context.shadowBlur = 0;
            if (display.other !== undefined && display.other !== display.damage) {
                drawHudText(context, `reversed charm order: ${display.other}`, panel, 324, '#00f3ff', 10);
            }
        }
        display.log.slice(0, 5).forEach((line, i) => drawHudText(context, line.slice(0, 30), panel, 350 + i * 16, i === 0 ? '#efe6cf' : '#6a5440', 10));
        context.restore();
    }

    resetDisplay();
    [...Object.keys(CARDS).map(portrait), ...['Kindle', 'Leap', 'Thorns', 'Guard', 'TwinStrike', 'Drain'].map(sigilIcon)]
        .forEach((img) => { if (!img.complete) img.addEventListener('load', () => draw(), { once: true }); });
    draw();
    return runWhileActive({ step, draw, reducedMotion });
}
