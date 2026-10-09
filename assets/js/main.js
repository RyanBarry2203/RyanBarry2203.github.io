const root = document.documentElement;
root.classList.remove('no-js');

// Motion follows the OS "reduce motion" setting unless the visitor has chosen otherwise with the
// FX switch in the nav. Many Windows machines have animation effects off without the owner knowing.
const MOTION_KEY = 'rb-motion';
function readMotionChoice() {
    try { return localStorage.getItem(MOTION_KEY); } catch { return null; }
}
const motionChoice = readMotionChoice();
const osPrefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const reducedMotion = motionChoice ? motionChoice === 'off' : osPrefersReduced;
const finePointer = matchMedia('(pointer: fine)').matches;
root.classList.add(reducedMotion ? 'reduced' : 'motion-on');

const navHeight = () => parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 64;

function onIdle(callback) {
    if ('requestIdleCallback' in window) requestIdleCallback(callback, { timeout: 1500 });
    else setTimeout(callback, 200);
}

function whenLoaded(callback) {
    if (document.readyState === 'complete') callback();
    else addEventListener('load', callback, { once: true });
}

// ---------- Text scramble: letters resolve from random glyphs, left to right ----------

const GLYPHS = '<>/\\[]{}=+*#01_';

function scrambleText(element, seconds = 0.8) {
    if (!element || reducedMotion || element.dataset.scrambled) return;
    element.dataset.scrambled = 'true';
    const finalText = element.textContent;
    element.setAttribute('aria-label', finalText);
    const start = performance.now();
    const frame = (now) => {
        const progress = Math.min(1, (now - start) / (seconds * 1000));
        const settled = Math.floor(progress * finalText.length);
        let output = '';
        for (let i = 0; i < finalText.length; i++) {
            const char = finalText[i];
            output += i < settled || char === ' ' ? char : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        element.textContent = output;
        if (progress < 1) requestAnimationFrame(frame);
        else element.textContent = finalText;
    };
    requestAnimationFrame(frame);
}

// "Lights" a section: draws its lines, expands its HUD corners and decodes its headings.
function lightUp(element) {
    if (element.classList.contains('is-lit')) return;
    element.classList.add('is-lit');
    element.querySelectorAll('[data-scramble]').forEach((heading) => scrambleText(heading));
    if (element.matches('[data-scramble]')) scrambleText(element);
}

// ---------- Smooth scroll and reveals ----------

function setUpMotion() {
    const { gsap, ScrollTrigger, Lenis } = window;
    if (!gsap || !ScrollTrigger) return null;
    gsap.registerPlugin(ScrollTrigger);

    let lenis = null;
    if (!reducedMotion && Lenis) {
        lenis = new Lenis({ lerp: 0.1 });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
    }

    if (!reducedMotion) {
        root.classList.add('motion');
        scrambleText(document.querySelector('.hero__title'), 1);
        gsap.from(['.hero__content .eyebrow', '.hero__role', '.hero__lede', '.hero__actions', '.hero__hud'], {
            y: 18, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay: 0.15,
        });
        gsap.to('.hero__content', {
            yPercent: -18, opacity: 0, ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 25%', scrub: true },
        });

        gsap.utils.toArray('.bay, .feature__head, .sector-head, .init__grid, .video-facade').forEach((element) => {
            gsap.from(element, {
                y: 48, opacity: 0, duration: 1, ease: 'power3.out',
                scrollTrigger: { trigger: element, start: 'top 88%', once: true },
            });
        });
        gsap.utils.toArray('.bay__systems li, .init__terminal > *').forEach((element) => {
            gsap.from(element, {
                x: -16, opacity: 0, duration: 0.6, ease: 'power2.out',
                scrollTrigger: { trigger: element, start: 'top 92%', once: true },
            });
        });
    }

    return { gsap, ScrollTrigger, lenis };
}

function setUpMagneticButtons(gsap) {
    if (!gsap || reducedMotion || !finePointer) return;
    document.querySelectorAll('[data-magnetic]').forEach((button) => {
        const toX = gsap.quickTo(button, 'x', { duration: 0.4, ease: 'power3.out' });
        const toY = gsap.quickTo(button, 'y', { duration: 0.4, ease: 'power3.out' });
        button.addEventListener('pointermove', (event) => {
            const rect = button.getBoundingClientRect();
            toX((event.clientX - rect.left - rect.width / 2) * 0.25);
            toY((event.clientY - rect.top - rect.height / 2) * 0.35);
        });
        button.addEventListener('pointerleave', () => { toX(0); toY(0); });
    });
}

// ---------- Navigation: anchors, mobile menu, scroll-spy and progress bar ----------

// FX switch: stores the visitor's choice and reloads so every system starts in the right mode.
function setUpFxToggle() {
    const button = document.querySelector('[data-fx-toggle]');
    if (!button) return;
    const label = button.querySelector('[data-fx-state]');
    button.setAttribute('aria-pressed', String(!reducedMotion));
    if (label) label.textContent = reducedMotion ? 'OFF' : 'ON';
    button.title = reducedMotion ? 'Turn on animations and live demos' : 'Turn off animations';
    button.addEventListener('click', () => {
        try { localStorage.setItem(MOTION_KEY, reducedMotion ? 'on' : 'off'); } catch { /* storage blocked: the reload still applies the OS default */ }
        location.reload();
    });
}

function setUpNavigation(motion) {
    const toggle = document.querySelector('[data-nav-toggle]');
    const closeMenu = () => {
        root.classList.remove('nav-open');
        toggle?.setAttribute('aria-expanded', 'false');
    };
    toggle?.addEventListener('click', () => {
        const open = root.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });

    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        const id = link.getAttribute('href');
        const target = id === '#top' ? document.body : document.querySelector(id);
        if (!target) return;
        event.preventDefault();
        closeMenu();
        if (motion?.lenis) motion.lenis.scrollTo(target, { offset: id === '#top' ? 0 : -navHeight() });
        else target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
        history.replaceState(null, '', id);
        if (id !== '#top') {
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }
    });

    const links = [...document.querySelectorAll('[data-nav-link]')];
    const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
    const spy = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            links.forEach((link) => link.setAttribute('aria-current', String(link.getAttribute('href') === `#${entry.target.id}`)));
        });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((section) => spy.observe(section));

    const nav = document.querySelector('.site-nav');
    const updateProgress = () => {
        const max = document.documentElement.scrollHeight - innerHeight;
        nav?.style.setProperty('--scroll-progress', `${max > 0 ? (scrollY / max) * 100 : 0}%`);
    };
    addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
}

// ---------- Slideshows: auto-cycle while visible, dots to jump, click to enlarge ----------

const slideshows = [];

function setUpSlideshows(openLightbox) {
    document.querySelectorAll('[data-slideshow]').forEach((element) => {
        const images = [...element.querySelectorAll('img')];
        if (!images.length) return;
        const label = document.createElement('span');
        label.className = 'slideshow__label';
        const dots = document.createElement('div');
        dots.className = 'slideshow__dots';
        element.append(label, dots);

        let index = 0;
        let timer = 0;
        let running = false;
        const SLIDE_TIME = 3600;

        const show = (i) => {
            index = (i + images.length) % images.length;
            images.forEach((image, n) => image.classList.toggle('is-current', n === index));
            [...dots.children].forEach((dot, n) => {
                dot.classList.remove('is-current');
                if (n === index) { void dot.offsetWidth; dot.classList.add('is-current'); }
            });
            label.textContent = images[index].dataset.label || '';
        };

        images.forEach((image, n) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.setAttribute('aria-label', `Show image ${n + 1} of ${images.length}`);
            dot.addEventListener('click', () => { show(n); restart(); });
            dots.append(dot);
            image.addEventListener('click', () => openLightbox(images, n));
        });

        const restart = () => {
            clearInterval(timer);
            if (running && images.length > 1) timer = setInterval(() => show(index + 1), SLIDE_TIME);
        };

        const controller = {
            element,
            setRunning(value) {
                const next = value && !reducedMotion;
                if (next === running) return;
                running = next;
                element.classList.toggle('is-paused', !running);
                if (running) show(index);
                restart();
            },
        };
        element.style.setProperty('--slide-time', `${SLIDE_TIME / 1000}s`);
        element.classList.add('is-paused');
        show(0);
        slideshows.push(controller);
    });
}

// A slideshow runs only while it is on screen and its layer or panel is the visible one.
function syncSlideshows() {
    slideshows.forEach((slideshow) => {
        const layer = slideshow.element.closest('.media-layer, .hud__panel');
        const layerActive = !layer || layer.classList.contains('is-active');
        slideshow.setRunning(layerActive && slideshow.element.dataset.onScreen === 'true');
    });
}

function watchSlideshowVisibility() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => { entry.target.dataset.onScreen = String(entry.isIntersecting); });
        syncSlideshows();
    });
    slideshows.forEach((slideshow) => observer.observe(slideshow.element));
}

// ---------- Demos: loaded the first time their container nears the viewport ----------

const DEMO_LOADERS = {
    targeting: () => import('./demos/targeting.js').then((m) => m.createTargetingDemo),
    lod: () => import('./demos/lod.js').then((m) => m.createLodDemo),
    gravity: () => import('./demos/gravity.js').then((m) => m.createGravityDemo),
    pursuit: () => import('./demos/pursuit.js').then((m) => m.createPursuitDemo),
    ghost: () => import('./demos/ghost.js').then((m) => m.createGhostDemo),
    drift: () => import('./demos/drift.js').then((m) => m.createDriftDemo),
    pooling: () => import('./demos/pooling.js').then((m) => m.createPoolingDemo),
    monster: () => import('./demos/monster.js').then((m) => m.createMonsterDemo),
    terminal: () => import('./demos/terminal.js').then((m) => m.createTerminalDemo),
};

// Each container owns a set of "slots" (layers or tab panels). A demo runs only when its slot
// is the active one and the container is on screen.
function setUpDemoHost(container, slotSelector) {
    const slots = [...container.querySelectorAll(slotSelector)];
    const demos = new Map();
    let visible = false;
    let loaded = false;

    // With reduced motion, a demo shows a still preview until the visitor presses Run.
    const userStarted = (slot) => !reducedMotion || slot.dataset.userRun === 'true';
    const sync = () => {
        demos.forEach((demo, slot) => demo?.setActive(visible && slot.classList.contains('is-active') && userStarted(slot)));
        syncSlideshows();
    };

    if (reducedMotion) {
        slots.forEach((slot) => {
            const target = slot.querySelector('canvas[data-demo]');
            if (!target) return;
            const run = document.createElement('button');
            run.type = 'button';
            run.className = 'demo-run';
            run.innerHTML = '<span aria-hidden="true">&#9654;</span> Run sim';
            run.addEventListener('click', () => {
                slot.dataset.userRun = 'true';
                run.remove();
                target.focus({ preventScroll: true });
                sync();
            });
            slot.append(run);
        });
    }

    new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !loaded) {
            loaded = true;
            slots.forEach((slot) => {
                const target = slot.querySelector('[data-demo]');
                if (!target) return;
                demos.set(slot, null);
                DEMO_LOADERS[target.dataset.demo]?.()
                    .then((create) => {
                        demos.set(slot, create(target, { reducedMotion: false, controls: slot }));
                        sync();
                    })
                    .catch((error) => console.warn(`Demo "${target.dataset.demo}" failed to load`, error));
            });
        }
        sync();
    }, { rootMargin: '250px 0px' }).observe(container);

    return { slots, sync };
}

function setUpFeatures() {
    document.querySelectorAll('[data-feature]').forEach((feature) => {
        const steps = [...feature.querySelectorAll('.step')];
        const host = setUpDemoHost(feature, '.media-layer');
        const caption = feature.querySelector('[data-media-caption]');

        const activate = (index) => {
            steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
            host.slots.forEach((layer, i) => layer.classList.toggle('is-active', i === index));
            if (caption) caption.textContent = host.slots[index]?.dataset.caption || '';
            host.sync();
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => { if (entry.isIntersecting) activate(steps.indexOf(entry.target)); });
        }, { rootMargin: '-45% 0px -45% 0px' });
        steps.forEach((step) => observer.observe(step));
    });
}

function setUpBays() {
    document.querySelectorAll('[data-bay]').forEach((bay) => {
        const host = setUpDemoHost(bay, '.hud__panel');
        const tabs = [...bay.querySelectorAll('[role="tab"]')];
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach((other) => other.setAttribute('aria-selected', String(other === tab)));
                host.slots.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.tab));
                host.sync();
            });
        });
    });
}

// ---------- Showreel facade ----------

function setUpVideoFacades() {
    document.querySelectorAll('[data-youtube]').forEach((facade) => {
        facade.querySelector('a')?.addEventListener('click', (event) => {
            event.preventDefault();
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube-nocookie.com/embed/${facade.dataset.youtube}?autoplay=1&rel=0`;
            iframe.title = 'Ryan Barry showreel';
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
            iframe.allowFullscreen = true;
            facade.querySelector('img')?.remove();
            facade.querySelector('a')?.remove();
            facade.append(iframe);
            iframe.focus();
        });
    });
}

// ---------- Lightbox ----------

function setUpLightbox(lenis) {
    const dialog = document.querySelector('[data-lightbox]');
    if (!dialog || typeof dialog.showModal !== 'function') return () => {};
    const image = dialog.querySelector('[data-lightbox-img]');
    const caption = dialog.querySelector('[data-lightbox-caption]');
    const count = dialog.querySelector('[data-lightbox-count]');
    let items = [];
    let index = 0;

    const show = (i) => {
        index = (i + items.length) % items.length;
        const source = items[index];
        image.src = source.currentSrc || source.src;
        image.alt = source.alt;
        caption.textContent = source.alt;
        count.textContent = `${index + 1} / ${items.length}`;
    };

    dialog.querySelector('[data-lightbox-prev]').addEventListener('click', () => show(index - 1));
    dialog.querySelector('[data-lightbox-next]').addEventListener('click', () => show(index + 1));
    dialog.querySelector('[data-lightbox-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => lenis?.start());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') show(index - 1);
        if (event.key === 'ArrowRight') show(index + 1);
    });

    return (images, start) => {
        items = images;
        show(start);
        dialog.showModal();
        lenis?.stop();
    };
}

// ---------- Hero scene and the page rider ----------

function canUseWebGL2() {
    if (navigator.connection?.saveData) return false;
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
}

const lowPower = matchMedia('(max-width: 768px)').matches
    || matchMedia('(pointer: coarse)').matches
    || (navigator.hardwareConcurrency || 8) <= 4;

async function startHero(motion) {
    const hero = document.querySelector('.hero');
    const stage = document.querySelector('[data-hero-stage]');
    if (!hero || !stage || !canUseWebGL2()) return;

    let scene;
    try {
        const { createHeroGrid } = await import('./hero-grid.js');
        scene = createHeroGrid(stage, { lowPower, reducedMotion, hud: hero.querySelector('.hero__hud') });
    } catch (error) {
        console.warn('Hero scene unavailable, keeping the CSS grid.', error);
        return;
    }

    root.classList.add('has-webgl');
    scene.onContextLost(() => root.classList.remove('has-webgl'));

    if (finePointer) {
        hero.addEventListener('pointermove', (event) => {
            const rect = hero.getBoundingClientRect();
            scene.setPointer(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
        });
        hero.addEventListener('pointerleave', () => scene.clearPointer());
    }

    if (motion?.ScrollTrigger) {
        motion.ScrollTrigger.create({
            trigger: hero, start: 'top top', end: 'bottom top',
            onUpdate: (self) => scene.setScroll(self.progress),
        });
    } else {
        const update = () => scene.setScroll(Math.min(1, Math.max(0, scrollY / hero.offsetHeight)));
        addEventListener('scroll', update, { passive: true });
        update();
    }
}

async function startRider() {
    const stops = [...document.querySelectorAll('[data-rider-stop]')];
    const canvas = document.querySelector('[data-rider]');

    // Without the rider (or with reduced motion), sections still light up as they scroll into view.
    const lightOnView = () => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) { lightUp(entry.target); observer.unobserve(entry.target); }
            });
        }, { rootMargin: '0px 0px -25% 0px' });
        stops.forEach((stop) => observer.observe(stop));
    };

    if (reducedMotion) {
        canvas?.remove();
        stops.forEach(lightUp);
        return;
    }
    if (!canvas) {
        lightOnView();
        return;
    }
    try {
        const { createScrollRider } = await import('./scroll-rider.js');
        createScrollRider(canvas, { stops, hero: document.querySelector('.hero'), lowPower, onPass: lightUp });
    } catch (error) {
        console.warn('Scroll rider unavailable.', error);
        canvas.remove();
        lightOnView();
    }
}

// ---------- Boot ----------

const motion = setUpMotion();
setUpFxToggle();
setUpNavigation(motion);
setUpMagneticButtons(motion?.gsap);
setUpSlideshows(setUpLightbox(motion?.lenis));
setUpFeatures();
setUpBays();
watchSlideshowVisibility();
setUpVideoFacades();
startRider();
whenLoaded(() => onIdle(() => startHero(motion)));
