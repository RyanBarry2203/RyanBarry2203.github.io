// A light cycle that rides down the page as you scroll. Its route runs along the side lanes and cuts
// across the page just above each section; crossing a section "powers it on" through onPass.
// The route is a list of straight segments, each mapped to a range of scroll positions ("keys"),
// so scrolling drives the bike along the path rather than along raw pixels.

const CONTENT_WIDTH = 1320;
const CROSSING_KEYS = 140;
const MIN_LEG = 420;
const CELL = 48;
const PARTICLES = 90;
const TOOLBAR_SLACK = 160;
const NARROW_WIDTH = 700;
// Once the bike has caught up with the scroll, the trail's travelling dash is drawn at this rate instead of every frame.
const IDLE_FRAME_MS = 1000 / 30;

export function createScrollRider(canvas, { stops, hero, lowPower = false, onPass = () => {} }) {
    const context = canvas.getContext('2d');
    const ratio = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.5);
    let scale = 1;
    // On a phone there is no margin beside the text, so the rider hugs the screen edge, smaller and without its glow.
    let narrow = false;

    let width = 0;
    let height = 0;
    let segments = [];
    let markers = [];
    let endKey = 0;
    let key = 0;
    let previous = { x: 0, y: 0 };
    let heading = Math.PI / 2;
    let time = 0;

    const sparks = Array.from({ length: PARTICLES }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
    let sparkCursor = 0;

    function docTop(element) {
        return element.getBoundingClientRect().top + scrollY;
    }

    // Each crossing runs the full width of the page, so it must sit in a gap between lines of text, never through a
    // heading or paragraph, or it reads like a strike-through. This merges the page's text boxes into vertical bands
    // (page coordinates) and returns a function that moves a y out of any band to its nearest edge, never above floor.
    const TEXT = 'main :is(h1, h2, h3, h4, p, li, dt, dd, blockquote, figcaption, pre, .btn, .hud__label)';
    const TEXT_PAD = 8;
    function clearOfText() {
        const bands = [];
        document.querySelectorAll(TEXT).forEach((element) => {
            const box = element.getBoundingClientRect();
            if (box.height > 0) bands.push([box.top + scrollY - TEXT_PAD, box.bottom + scrollY + TEXT_PAD]);
        });
        bands.sort((a, b) => a[0] - b[0]);
        const merged = [];
        bands.forEach((band) => {
            const previousBand = merged[merged.length - 1];
            if (previousBand && band[0] <= previousBand[1]) previousBand[1] = Math.max(previousBand[1], band[1]);
            else merged.push(band);
        });
        return (y, floor) => {
            const band = merged.find((b) => y > b[0] && y < b[1]);
            if (!band) return y;
            const up = band[0];
            const down = band[1];
            return up >= floor && y - up <= down - y ? up : down;
        };
    }

    // Rebuild the route from the current layout: down from the hero, then lane to lane per section.
    function layout() {
        const nextWidth = canvas.clientWidth || innerWidth;
        const nextHeight = Math.max(1, innerHeight);
        // A phone's toolbar sliding away changes the height a little on every scroll. Keeping the taller canvas then
        // avoids clearing and reallocating it mid-scroll; the spare strip just sits below the screen.
        const toolbarOnly = nextWidth === width && nextHeight <= height && height - nextHeight < TOOLBAR_SLACK;
        if (!toolbarOnly) {
            width = nextWidth;
            height = nextHeight;
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            canvas.style.height = `${height}px`;
        }

        const spare = (width - Math.min(width, CONTENT_WIDTH)) / 2;
        narrow = width < NARROW_WIDTH;
        scale = narrow ? 0.5 : lowPower ? 0.7 : 1;
        const left = spare > 90 ? spare - 34 : narrow ? 4 : 12;
        const right = width - left;
        const heroBottom = hero ? docTop(hero) + hero.offsetHeight : height;
        const pageEnd = document.documentElement.scrollHeight - 80;

        const clear = clearOfText();
        const points = [{ x: width / 2, y: heroBottom - 4 }];
        const crossings = [];
        // The first turn comes straight after the hero, so the run down the middle never crosses the first heading.
        let y = clear(heroBottom + 24, heroBottom + 8);
        points.push({ x: width / 2, y });
        points.push({ x: left, y });
        crossings.push(1);
        let side = left;
        markers = [];

        [...stops].sort((a, b) => docTop(a) - docTop(b)).forEach((stop) => {
            const crossY = clear(Math.max(docTop(stop) - 40, y + MIN_LEG), y + MIN_LEG * 0.6);
            if (crossY > pageEnd - 200) return;
            side = side === left ? right : left;
            points.push({ x: points[points.length - 1].x, y: crossY });
            points.push({ x: side, y: crossY });
            crossings.push(points.length - 2);
            markers.push({ element: stop, key: crossY - CROSSING_KEYS, passed: false });
            y = crossY;
        });
        points.push({ x: side, y: pageEnd });

        // Horizontal legs use a fixed band of scroll keys centred on their y; vertical legs fill the rest.
        segments = [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const horizontal = Math.abs(a.y - b.y) < 1;
            const startKey = horizontal ? a.y - CROSSING_KEYS : a.y + (crossings.includes(i - 1) ? CROSSING_KEYS : 0);
            const finishKey = horizontal ? a.y + CROSSING_KEYS : b.y - (crossings.includes(i + 1) ? CROSSING_KEYS : 0);
            segments.push({ a, b, k0: startKey, k1: Math.max(finishKey, startKey + 1), length: Math.hypot(b.x - a.x, b.y - a.y) });
        }
        endKey = segments.length ? segments[segments.length - 1].k1 : 0;
    }

    function pointAt(k) {
        if (!segments.length) return { x: width / 2, y: 0, index: 0, t: 0 };
        if (k <= segments[0].k0) return { ...segments[0].a, index: 0, t: 0 };
        for (let i = 0; i < segments.length; i++) {
            const s = segments[i];
            if (k <= s.k1) {
                const t = Math.max(0, Math.min(1, (k - s.k0) / (s.k1 - s.k0)));
                return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t, index: i, t };
            }
        }
        const last = segments[segments.length - 1];
        return { ...last.b, index: segments.length - 1, t: 1 };
    }

    function drawGrid(offsetY, alpha) {
        context.strokeStyle = `rgba(0, 243, 255, ${alpha})`;
        context.lineWidth = 1;
        context.beginPath();
        for (let x = 0; x <= width; x += CELL) { context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, height); }
        for (let y = -(offsetY % CELL); y <= height; y += CELL) { context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5); }
        context.stroke();
    }

    // Draws the trail from the start of the route up to the bike, in screen space.
    function traceTrail(bike, scroll) {
        context.beginPath();
        let started = false;
        for (let i = 0; i <= bike.index; i++) {
            const s = segments[i];
            const end = i === bike.index ? bike : s.b;
            if (!started) { context.moveTo(s.a.x, s.a.y - scroll); started = true; }
            context.lineTo(end.x, end.y - scroll);
        }
    }

    function emitSpark(x, y, dirX, dirY) {
        const spark = sparks[sparkCursor];
        sparkCursor = (sparkCursor + 1) % PARTICLES;
        spark.x = x;
        spark.y = y;
        spark.vx = -dirX * (60 + Math.random() * 120) + (Math.random() - 0.5) * 90;
        spark.vy = -dirY * (60 + Math.random() * 120) + (Math.random() - 0.5) * 90;
        spark.life = 0.35 + Math.random() * 0.35;
    }

    // The gradients are built once around the origin and moved into place with translate, not rebuilt every frame.
    const beam = context.createLinearGradient(14, 0, 150, 0);
    beam.addColorStop(0, 'rgba(180, 255, 255, 1)');
    beam.addColorStop(1, 'rgba(180, 255, 255, 0)');
    const lit = context.createRadialGradient(0, 0, 0, 0, 0, 300);
    lit.addColorStop(0, 'rgba(0, 243, 255, 0.5)');
    lit.addColorStop(1, 'rgba(0, 243, 255, 0)');
    const glow = context.createRadialGradient(0, 0, 0, 0, 0, 120);
    glow.addColorStop(0, 'rgba(0, 243, 255, 0.35)');
    glow.addColorStop(1, 'rgba(0, 243, 255, 0)');

    function drawBike(x, y, angle, speed) {
        context.save();
        context.translate(x, y);
        context.scale(scale, scale);
        if (!narrow) {
            context.fillStyle = glow;
            context.fillRect(-120, -120, 240, 240);
        }
        context.rotate(angle);

        context.globalAlpha = 0.18 + speed * 0.2;
        context.fillStyle = beam;
        context.beginPath();
        context.moveTo(14, -4);
        context.lineTo(150, -34);
        context.lineTo(150, 34);
        context.lineTo(14, 4);
        context.closePath();
        context.fill();
        context.globalAlpha = 1;

        context.fillStyle = '#04070b';
        context.strokeStyle = '#00f3ff';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(-20, -6);
        context.lineTo(10, -7);
        context.quadraticCurveTo(22, -6, 22, 0);
        context.quadraticCurveTo(22, 6, 10, 7);
        context.lineTo(-20, 6);
        context.closePath();
        context.fill();
        context.stroke();

        context.strokeStyle = '#ffffff';
        context.lineWidth = 2.2;
        context.beginPath();
        context.arc(-13, 0, 6.5, 0, Math.PI * 2);
        context.moveTo(19.5, 0);
        context.arc(13, 0, 6.5, 0, Math.PI * 2);
        context.stroke();

        context.fillStyle = '#ff8c00';
        context.fillRect(-4, -2, 10, 4);
        context.restore();
    }

    // A playing game shares this page's main thread, so the rider stops drawing until it is closed. With nothing
    // moving it draws at a lower rate, and on low-power devices it stops until the next scroll or resize.
    let paused = false;
    let running = false;
    let settled = false;
    let last = performance.now();
    let drawnAt = 0;

    function frame(now) {
        if (paused) {
            running = false;
            return;
        }
        if (settled && now - drawnAt < IDLE_FRAME_MS) {
            requestAnimationFrame(frame);
            return;
        }
        drawnAt = now;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        time += dt;

        const scroll = scrollY;
        const target = Math.min(endKey, scroll + height * 0.62);
        key += (target - key) * (1 - Math.pow(0.0008, dt));
        const bike = pointAt(key);

        const moveX = bike.x - previous.x;
        const moveY = bike.y - previous.y;
        const moved = Math.hypot(moveX, moveY);
        if (moved > 0.3) {
            const wanted = Math.atan2(moveY, moveX);
            let delta = wanted - heading;
            delta = Math.atan2(Math.sin(delta), Math.cos(delta));
            heading += delta * Math.min(1, dt * 14);
        }
        previous = { x: bike.x, y: bike.y };
        const speed = Math.min(1, moved / 12);

        markers.forEach((marker) => {
            if (!marker.passed && key >= marker.key) {
                marker.passed = true;
                onPass(marker.element);
            }
        });

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);

        drawGrid(scroll, 0.045);

        const bx = bike.x;
        const by = bike.y - scroll;
        if (!lowPower && !narrow) {
            context.save();
            context.translate(bx, by);
            context.beginPath();
            context.arc(0, 0, 300, 0, Math.PI * 2);
            context.clip();
            context.strokeStyle = lit;
            context.lineWidth = 1;
            context.beginPath();
            for (let x = 0; x <= width; x += CELL) { context.moveTo(x + 0.5 - bx, -300); context.lineTo(x + 0.5 - bx, 300); }
            for (let y = -(scroll % CELL); y <= height; y += CELL) { context.moveTo(-300, y + 0.5 - by); context.lineTo(300, y + 0.5 - by); }
            context.stroke();
            context.restore();
        }

        if (segments.length && key > segments[0].k0) {
            context.lineJoin = 'miter';
            context.lineCap = 'butt';
            traceTrail(bike, scroll);
            context.strokeStyle = 'rgba(0, 243, 255, 0.12)';
            context.lineWidth = 14 * scale;
            context.stroke();
            context.strokeStyle = 'rgba(0, 243, 255, 0.75)';
            context.lineWidth = 3.5 * scale;
            context.stroke();
            context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            context.lineWidth = 1.2;
            context.stroke();

            context.setLineDash([18, 160]);
            context.lineDashOffset = -time * 260;
            context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            context.lineWidth = 3 * scale;
            context.stroke();
            context.setLineDash([]);
        }

        if (moved > 0.8) {
            const dirX = Math.cos(heading);
            const dirY = Math.sin(heading);
            for (let i = 0; i < 2; i++) emitSpark(bike.x - dirX * 18 * scale, bike.y - dirY * 18 * scale, dirX, dirY);
        }
        let sparksAlive = false;
        context.strokeStyle = '#bff9ff';
        context.lineWidth = 1.5;
        context.beginPath();
        for (const spark of sparks) {
            if (spark.life <= 0) continue;
            spark.life -= dt;
            sparksAlive = true;
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt;
            const sy = spark.y - scroll;
            context.moveTo(spark.x, sy);
            context.lineTo(spark.x - spark.vx * 0.03, sy - spark.vy * 0.03);
        }
        context.stroke();

        drawBike(bx, by, heading, speed);

        settled = Math.abs(target - key) < 0.5 && moved < 0.3 && !sparksAlive;
        if (settled && lowPower) running = false;
        else requestAnimationFrame(frame);
    }

    const wake = () => {
        settled = false;
        if (paused || running) return;
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
    };
    const setPaused = (value) => {
        paused = value;
        wake();
    };

    let pending = 0;
    const relayout = () => {
        clearTimeout(pending);
        pending = setTimeout(() => {
            layout();
            markers.forEach((marker) => { if (key >= marker.key) marker.passed = true; });
            wake();
        }, 150);
    };
    addEventListener('resize', relayout);
    addEventListener('scroll', wake, { passive: true });
    new ResizeObserver(relayout).observe(document.body);
    document.fonts?.ready.then(relayout);

    layout();
    key = Math.min(endKey, scrollY + height * 0.62);
    previous = pointAt(key);
    markers.forEach((marker) => {
        if (key >= marker.key) { marker.passed = true; onPass(marker.element); }
    });
    wake();
    return { setPaused };
}
