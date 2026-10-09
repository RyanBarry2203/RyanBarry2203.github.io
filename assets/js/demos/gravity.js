// The Pale Roots Black Hole boss in miniature. Same rules as BlackHoleBoss.cs: gravity is on a
// 6-second cooldown, and once the boss has taken 200 damage since its last ability, its next one is
// a repel blast instead of a pull. Knockback decays with the game's 0.9 friction.

import { fitCanvas, runWhileActive, trackPointer, drawHudText, drawBackdropGrid } from '../canvas-loop.js';

const W = 800;
const H = 450;
const ARENA = 200;
const GRAVITY_COOLDOWN = 6;
const PULL_TIME = 1.6;
const REPEL_THRESHOLD = 200;
const SWORD_DAMAGE = 25;
const SWORD_RANGE = 90;
const SWORD_COOLDOWN = 0.5;
const BOSS_HEALTH = 2000;
const KNOCKBACK_FRICTION = 0.9;

export function createGravityDemo(canvas, { reducedMotion = false } = {}) {
    const context = canvas.getContext('2d');
    const pointer = trackPointer(canvas, W, H);
    const boss = { x: W / 2, y: H / 2, health: BOSS_HEALTH, flash: 0 };
    const player = { x: W / 2 - 150, y: H / 2, vx: 0, vy: 0, swing: 0, angle: 0 };
    const rings = [];
    let cooldown = 3;
    let pull = 0;
    let damageSinceAbility = 0;
    let banner = '';
    let bannerTime = 0;
    let time = 0;
    let lastClicks = 0;

    function say(text) { banner = text; bannerTime = 1.4; }

    function hitBoss() {
        if (player.swing > 0) return;
        player.swing = SWORD_COOLDOWN;
        if (Math.hypot(boss.x - player.x, boss.y - player.y) > SWORD_RANGE) return;
        boss.health -= SWORD_DAMAGE;
        boss.flash = 0.15;
        damageSinceAbility += SWORD_DAMAGE;
        if (boss.health <= 0) { boss.health = BOSS_HEALTH; say('BOSS RESET'); }
    }

    function useGravity() {
        if (damageSinceAbility >= REPEL_THRESHOLD) {
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const distance = Math.hypot(dx, dy) || 1;
            player.vx += (dx / distance) * 900;
            player.vy += (dy / distance) * 900;
            rings.push({ r: 30, life: 1, outward: true });
            say('REPEL BLAST');
        } else {
            pull = PULL_TIME;
            say('GRAVITY PULL');
        }
        damageSinceAbility = 0;
        cooldown = GRAVITY_COOLDOWN;
    }

    function step(dt) {
        time += dt;
        cooldown -= dt;
        bannerTime -= dt;
        player.swing = Math.max(0, player.swing - dt);
        boss.flash = Math.max(0, boss.flash - dt);
        if (cooldown <= 0) useGravity();

        // Player intent: follow the pointer while it is over the demo, otherwise orbit and attack.
        let tx;
        let ty;
        const steering = pointer.inside && performance.now() - pointer.lastMove < 4000;
        if (steering) {
            tx = pointer.x;
            ty = pointer.y;
            if (pointer.clicks !== lastClicks) { lastClicks = pointer.clicks; hitBoss(); }
        } else {
            const orbit = time * 0.6;
            const radius = 70 + Math.sin(time * 0.9) * 40;
            tx = boss.x + Math.cos(orbit) * radius;
            ty = boss.y + Math.sin(orbit) * radius * 0.8;
            hitBoss();
        }
        const toX = tx - player.x;
        const toY = ty - player.y;
        const toLength = Math.hypot(toX, toY);
        if (toLength > 4) {
            player.x += (toX / toLength) * Math.min(170 * dt, toLength);
            player.y += (toY / toLength) * Math.min(170 * dt, toLength);
            player.angle = Math.atan2(toY, toX);
        }

        if (pull > 0) {
            pull -= dt;
            const dx = boss.x - player.x;
            const dy = boss.y - player.y;
            const distance = Math.hypot(dx, dy) || 1;
            const strength = 260 * (1 - Math.min(1, distance / 320)) + 60;
            player.x += (dx / distance) * strength * dt;
            player.y += (dy / distance) * strength * dt;
            if (Math.random() < 0.5) rings.push({ r: 160 + Math.random() * 60, life: 1, outward: false });
        }

        player.x += player.vx * dt;
        player.y += player.vy * dt;
        const friction = Math.pow(KNOCKBACK_FRICTION, dt * 60);
        player.vx *= friction;
        player.vy *= friction;

        const fromBossX = player.x - boss.x;
        const fromBossY = player.y - boss.y;
        const fromBoss = Math.hypot(fromBossX, fromBossY) || 1;
        if (fromBoss > ARENA - 10) {
            player.x = boss.x + (fromBossX / fromBoss) * (ARENA - 10);
            player.y = boss.y + (fromBossY / fromBoss) * (ARENA - 10);
            player.vx *= -0.3;
            player.vy *= -0.3;
        }
        if (fromBoss < 46) {
            player.x = boss.x + (fromBossX / fromBoss) * 46;
            player.y = boss.y + (fromBossY / fromBoss) * 46;
        }

        for (let i = rings.length - 1; i >= 0; i--) {
            const ring = rings[i];
            ring.life -= dt * (ring.outward ? 1.2 : 1.8);
            ring.r += (ring.outward ? 420 : -150) * dt;
            if (ring.life <= 0 || ring.r < 30) rings.splice(i, 1);
        }
    }

    function draw() {
        fitCanvas(canvas, context, W, H);
        drawBackdropGrid(context, W, H, 40, 0.06);

        context.strokeStyle = 'rgba(0, 243, 255, 0.4)';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(boss.x, boss.y, ARENA, 0, Math.PI * 2);
        context.stroke();

        rings.forEach((ring) => {
            context.strokeStyle = ring.outward ? `rgba(255, 140, 0, ${ring.life})` : `rgba(157, 123, 255, ${ring.life * 0.6})`;
            context.lineWidth = ring.outward ? 4 : 1.5;
            context.beginPath();
            context.arc(boss.x, boss.y, ring.r, 0, Math.PI * 2);
            context.stroke();
        });

        const core = context.createRadialGradient(boss.x, boss.y, 4, boss.x, boss.y, 70);
        core.addColorStop(0, '#000');
        core.addColorStop(0.45, '#000');
        core.addColorStop(0.55, pull > 0 ? '#c9b6ff' : '#9d7bff');
        core.addColorStop(1, 'rgba(157, 123, 255, 0)');
        context.fillStyle = core;
        context.beginPath();
        context.arc(boss.x, boss.y, 70, 0, Math.PI * 2);
        context.fill();
        context.save();
        context.translate(boss.x, boss.y);
        context.rotate(time * (pull > 0 ? 4 : 1));
        context.strokeStyle = boss.flash > 0 ? '#ffffff' : 'rgba(201, 182, 255, 0.8)';
        context.lineWidth = 2;
        for (let arm = 0; arm < 4; arm++) {
            context.rotate(Math.PI / 2);
            context.beginPath();
            context.arc(18, 0, 22, Math.PI * 0.9, Math.PI * 1.6);
            context.stroke();
        }
        context.restore();

        context.save();
        context.translate(player.x, player.y);
        context.rotate(player.angle);
        context.shadowColor = '#00f3ff';
        context.shadowBlur = 14;
        context.fillStyle = '#00f3ff';
        context.beginPath();
        context.moveTo(12, 0);
        context.lineTo(-8, -8);
        context.lineTo(-4, 0);
        context.lineTo(-8, 8);
        context.closePath();
        context.fill();
        if (player.swing > SWORD_COOLDOWN - 0.15) {
            context.strokeStyle = '#ffffff';
            context.lineWidth = 3;
            context.beginPath();
            context.arc(0, 0, 34, -0.9, 0.9);
            context.stroke();
        }
        context.restore();

        drawHudText(context, `BOSS ${Math.max(0, boss.health)}/${BOSS_HEALTH}`, 14, 24, '#c9b6ff');
        context.fillStyle = 'rgba(255, 255, 255, 0.12)';
        context.fillRect(14, 32, 200, 4);
        context.fillStyle = '#9d7bff';
        context.fillRect(14, 32, 200 * (boss.health / BOSS_HEALTH), 4);
        drawHudText(context, `GRAVITY CD ${Math.max(0, cooldown).toFixed(1)}s`, W - 200, 24, '#00f3ff');
        const charged = damageSinceAbility >= REPEL_THRESHOLD;
        drawHudText(context, `DMG SINCE ABILITY ${damageSinceAbility}/${REPEL_THRESHOLD}`, W - 260, 44, charged ? '#ff8c00' : '#8ba3b0');
        if (bannerTime > 0) {
            context.font = '700 30px Rajdhani, sans-serif';
            context.textAlign = 'center';
            context.fillStyle = banner === 'REPEL BLAST' ? '#ff8c00' : '#c9b6ff';
            context.globalAlpha = Math.min(1, bannerTime);
            context.fillText(banner, W / 2, 84);
            context.globalAlpha = 1;
            context.textAlign = 'left';
        }
    }

    for (let i = 0; i < 60; i++) step(1 / 60);
    draw();
    return runWhileActive({ step, draw, reducedMotion });
}
