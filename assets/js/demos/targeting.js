// A small re-creation of the Pale Roots battle targeting, drawn on a 2D canvas.
// Same rule as the game: every 500 ms, units without a valid target pick the nearest enemy
// that has fewer than MAX_ATTACKERS units already attacking it.

import { fitCanvas, runWhileActive } from './canvas-loop.js';

const WORLD_W = 800;
const WORLD_H = 450;
const SCAN_INTERVAL = 0.5;
const MAX_ATTACKERS = 2;
const SPEED = 46;
const ATTACK_RANGE = 22;
const ATTACK_COOLDOWN = 0.8;
const DAMAGE = 20;
const RESPAWN_DELAY = 1.6;

const TEAM_COLOURS = { ally: '#00f3ff', enemy: '#ff8c00' };

function spawnPosition(team) {
    return {
        x: team === 'ally' ? 60 + Math.random() * 120 : WORLD_W - 60 - Math.random() * 120,
        y: 70 + Math.random() * (WORLD_H - 140),
    };
}

function createUnit(team) {
    return { team, ...spawnPosition(team), hp: 100, target: null, attackers: 0, cooldown: Math.random() * ATTACK_COOLDOWN, respawn: 0 };
}

export function createTargetingDemo(canvas, { reducedMotion = false, controls } = {}) {
    const context = canvas.getContext('2d');
    const units = [
        ...Array.from({ length: 6 }, () => createUnit('ally')),
        ...Array.from({ length: 9 }, () => createUnit('enemy')),
    ];
    let capEnabled = true;
    let scanTimer = 0;

    const isAlive = (unit) => unit.respawn <= 0;

    function setTarget(unit, target) {
        if (unit.target) unit.target.attackers--;
        unit.target = target;
        if (target) target.attackers++;
    }

    function findBestTarget(seeker) {
        let best = null;
        let closest = Infinity;
        for (const candidate of units) {
            if (candidate.team === seeker.team || !isAlive(candidate)) continue;
            if (capEnabled && candidate.attackers >= MAX_ATTACKERS) continue;
            const distance = Math.hypot(candidate.x - seeker.x, candidate.y - seeker.y);
            if (distance < closest) {
                closest = distance;
                best = candidate;
            }
        }
        return best;
    }

    function kill(unit) {
        units.forEach((other) => { if (other.target === unit) setTarget(other, null); });
        setTarget(unit, null);
        unit.respawn = RESPAWN_DELAY;
    }

    function step(dt) {
        scanTimer += dt;
        const scanNow = scanTimer >= SCAN_INTERVAL;
        if (scanNow) scanTimer = 0;

        for (const unit of units) {
            if (!isAlive(unit)) {
                unit.respawn -= dt;
                if (unit.respawn <= 0) Object.assign(unit, spawnPosition(unit.team), { hp: 100 });
                continue;
            }

            if (scanNow && (!unit.target || !isAlive(unit.target))) setTarget(unit, findBestTarget(unit));

            unit.cooldown -= dt;
            const target = unit.target;
            if (target) {
                const dx = target.x - unit.x;
                const dy = target.y - unit.y;
                const distance = Math.hypot(dx, dy) || 1;
                if (distance > ATTACK_RANGE) {
                    unit.x += (dx / distance) * SPEED * dt;
                    unit.y += (dy / distance) * SPEED * dt;
                } else if (unit.cooldown <= 0) {
                    unit.cooldown = ATTACK_COOLDOWN;
                    target.hp -= DAMAGE;
                    if (target.hp <= 0) kill(target);
                }
            }

            // Light separation so units on the same team don't stack into one dot.
            for (const other of units) {
                if (other === unit || other.team !== unit.team || !isAlive(other)) continue;
                const dx = unit.x - other.x;
                const dy = unit.y - other.y;
                const distance = Math.hypot(dx, dy);
                if (distance > 0 && distance < 14) {
                    unit.x += (dx / distance) * (14 - distance) * 0.5;
                    unit.y += (dy / distance) * (14 - distance) * 0.5;
                }
            }
        }
    }

    function draw() {
        const scale = fitCanvas(canvas, context, WORLD_W, WORLD_H);
        context.fillStyle = '#04070b';
        context.fillRect(0, 0, WORLD_W, WORLD_H);

        context.strokeStyle = 'rgba(0, 243, 255, 0.08)';
        context.lineWidth = 1;
        context.beginPath();
        for (let x = 0; x <= WORLD_W; x += 40) { context.moveTo(x, 0); context.lineTo(x, WORLD_H); }
        for (let y = 0; y <= WORLD_H; y += 40) { context.moveTo(0, y); context.lineTo(WORLD_W, y); }
        context.stroke();

        context.lineWidth = 1.5;
        for (const unit of units) {
            if (!isAlive(unit) || !unit.target) continue;
            context.strokeStyle = unit.team === 'ally' ? 'rgba(0, 243, 255, 0.45)' : 'rgba(255, 140, 0, 0.45)';
            context.beginPath();
            context.moveTo(unit.x, unit.y);
            context.lineTo(unit.target.x, unit.target.y);
            context.stroke();
        }

        let mostAttackers = 0;
        for (const unit of units) {
            if (!isAlive(unit)) continue;
            mostAttackers = Math.max(mostAttackers, unit.attackers);
            const colour = TEAM_COLOURS[unit.team];
            context.shadowColor = colour;
            context.shadowBlur = 10;
            context.fillStyle = colour;
            context.beginPath();
            context.arc(unit.x, unit.y, 6, 0, Math.PI * 2);
            context.fill();
            context.shadowBlur = 0;

            context.fillStyle = 'rgba(255, 255, 255, 0.15)';
            context.fillRect(unit.x - 9, unit.y - 13, 18, 2.5);
            context.fillStyle = '#ffffff';
            context.fillRect(unit.x - 9, unit.y - 13, 18 * (unit.hp / 100), 2.5);

            if (unit.attackers > MAX_ATTACKERS) {
                context.fillStyle = '#ff4d5e';
                context.font = '600 11px "JetBrains Mono", monospace';
                context.fillText(`×${unit.attackers}`, unit.x + 9, unit.y - 8);
            }
        }

        context.font = '600 12px "JetBrains Mono", monospace';
        context.fillStyle = mostAttackers > MAX_ATTACKERS ? '#ff4d5e' : '#d5e3ea';
        context.fillText(`most attackers on one unit: ${mostAttackers}`, 14, 24);
        return scale;
    }

    const toggle = controls?.querySelector('[data-targeting-toggle]');
    toggle?.addEventListener('click', () => {
        capEnabled = !capEnabled;
        toggle.setAttribute('aria-pressed', String(capEnabled));
        toggle.textContent = capEnabled ? `Attacker cap: ${MAX_ATTACKERS}` : 'Attacker cap: off';
        units.forEach((unit) => setTarget(unit, null));
        scanTimer = SCAN_INTERVAL;
        if (reducedMotion) {
            for (let i = 0; i < 120; i++) step(1 / 60);
            draw();
        }
    });

    for (let i = 0; i < 90; i++) step(1 / 60);
    draw();

    return runWhileActive({ step, draw, reducedMotion });
}
