const root = document.documentElement;
root.classList.remove('no-js');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const navHeight = () => parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 60;

const GALLERIES = {
    paranormal: [
        ['paranormal-1', 'First-person view with the Spirit Box switched on'],
        ['paranormal-2', 'Ghost NavMesh agent and the ScriptableObject data assets'],
        ['paranormal-3', 'Vehicle section of the level'],
        ['paranormal-4', 'Blockout of the haunted house'],
    ],
    'engine-opt': [
        ['engine-opt-1', 'Stress test overlay: 500 active pooled enemies at 84 FPS'],
        ['engine-opt-2', 'GPU instancing and culling setup'],
        ['engine-opt-3', 'Occlusion culling in the scene view'],
    ],
    'gameplay-ai': [
        ['gameplay-ai-1', 'Baked NavMesh for the enemy AI'],
        ['gameplay-ai-2', 'Enemy state machine in action'],
        ['gameplay-ai-3', 'Drifting vehicle controller'],
    ],
    'dying-fire': [
        ['dying-fire-1', 'Exploring a room in the WPF game window'],
        ['dying-fire-2', 'Inventory screen'],
        ['dying-fire-3', 'Game code and data layer'],
    ],
    'house-of-history': [
        ['house-of-history-1', 'Kitchen room with health, light and sanity readouts'],
        ['house-of-history-2', 'Room logic and branching choices'],
        ['house-of-history-3', 'Console game code'],
    ],
};

function onIdle(callback) {
    if ('requestIdleCallback' in window) requestIdleCallback(callback, { timeout: 1500 });
    else setTimeout(callback, 200);
}

function whenLoaded(callback) {
    if (document.readyState === 'complete') callback();
    else addEventListener('load', callback, { once: true });
}

// ---------- Smooth scroll, reveals and the hero intro ----------

function setUpMotion() {
    const { gsap, ScrollTrigger, Lenis } = window;
    if (!gsap || !ScrollTrigger) return null;
    gsap.registerPlugin(ScrollTrigger);

    let lenis = null;
    if (!reducedMotion && Lenis) {
        lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
    }

    if (!reducedMotion) {
        root.classList.add('motion');
        playHeroIntro(gsap);

        gsap.to('.hero__content', {
            yPercent: -18,
            opacity: 0,
            ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 25%', scrub: true },
        });

        gsap.utils.toArray('[data-reveal]').forEach((element) => {
            gsap.from(element, {
                y: 32,
                opacity: 0,
                duration: 0.9,
                ease: 'power3.out',
                scrollTrigger: { trigger: element, start: 'top 90%', once: true },
            });
        });
    }

    return { gsap, ScrollTrigger, lenis };
}

function playHeroIntro(gsap) {
    scrambleText(document.querySelector('.hero__title'), 0.9);
    gsap.from(['.hero__content .eyebrow', '.hero__role', '.hero__lede', '.hero__actions'], {
        y: 18,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.08,
        delay: 0.15,
    });
}

// Resolves each letter from random glyphs, left to right. The accessible name never changes.
function scrambleText(element, seconds) {
    if (!element) return;
    const finalText = element.textContent;
    const glyphs = '<>/\\[]{}=+*#01_';
    element.setAttribute('aria-label', finalText);
    const start = performance.now();
    const frame = (now) => {
        const progress = Math.min(1, (now - start) / (seconds * 1000));
        const settled = Math.floor(progress * finalText.length);
        let output = '';
        for (let i = 0; i < finalText.length; i++) {
            const char = finalText[i];
            output += i < settled || char === ' ' ? char : glyphs[(Math.random() * glyphs.length) | 0];
        }
        element.textContent = output;
        if (progress < 1) requestAnimationFrame(frame);
        else element.textContent = finalText;
    };
    requestAnimationFrame(frame);
}

function setUpAnchorLinks(motion) {
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        const id = link.getAttribute('href');
        const target = id === '#top' ? document.body : document.querySelector(id);
        if (!target) return;
        event.preventDefault();
        if (motion?.lenis) motion.lenis.scrollTo(target, { offset: id === '#top' ? 0 : -navHeight() });
        else target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
        history.replaceState(null, '', id);
        if (id !== '#top') {
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }
    });
}

// Buttons drift a few pixels toward the cursor, then spring back.
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

// ---------- Hero: Three.js light-cycle grid ----------

function canRunHeroScene() {
    if (navigator.connection?.saveData) return false;
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
}

async function startHero(motion) {
    const hero = document.querySelector('.hero');
    const stage = document.querySelector('[data-hero-stage]');
    if (!hero || !stage || !canRunHeroScene()) return;

    const lowPower = matchMedia('(max-width: 768px)').matches
        || matchMedia('(pointer: coarse)').matches
        || (navigator.hardwareConcurrency || 8) <= 4;

    let scene;
    try {
        const { createHeroGrid } = await import('./hero-grid.js');
        scene = createHeroGrid(stage, { lowPower, reducedMotion });
    } catch (error) {
        console.warn('Hero scene unavailable, keeping the CSS grid.', error);
        return;
    }

    root.classList.add('has-webgl');
    scene.onContextLost(() => root.classList.remove('has-webgl'));

    if (!lowPower && finePointer) {
        hero.addEventListener('pointermove', (event) => {
            const rect = hero.getBoundingClientRect();
            scene.setPointer(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
        });
        hero.addEventListener('pointerleave', () => scene.clearPointer());
    }

    if (motion?.ScrollTrigger) {
        motion.ScrollTrigger.create({
            trigger: hero,
            start: 'top top',
            end: 'bottom top',
            onUpdate: (self) => scene.setScroll(self.progress),
        });
    } else {
        const update = () => scene.setScroll(Math.min(1, Math.max(0, scrollY / hero.offsetHeight)));
        addEventListener('scroll', update, { passive: true });
        update();
    }
}

// ---------- Featured projects: active step drives the pinned media ----------

const DEMO_LOADERS = {
    targeting: () => import('./targeting-demo.js').then((m) => m.createTargetingDemo),
    lod: () => import('./lod-demo.js').then((m) => m.createLodDemo),
};

function setUpFeatures() {
    document.querySelectorAll('[data-feature]').forEach((feature) => {
        const steps = [...feature.querySelectorAll('.step')];
        const layers = [...feature.querySelectorAll('.media-layer')];
        const demos = new Map();
        let featureVisible = false;
        let activeIndex = 0;

        const syncDemos = () => {
            demos.forEach((demo, index) => demo?.setActive(featureVisible && index === activeIndex));
        };

        const activate = (index) => {
            if (index === activeIndex) return;
            activeIndex = index;
            steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
            layers.forEach((layer, i) => layer.classList.toggle('is-active', i === index));
            syncDemos();
        };

        const stepObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) activate(steps.indexOf(entry.target));
            });
        }, { rootMargin: '-45% 0px -45% 0px' });
        steps.forEach((step) => stepObserver.observe(step));

        // Load each demo the first time its feature comes near the viewport.
        new IntersectionObserver((entries) => {
            featureVisible = entries[0].isIntersecting;
            if (featureVisible && demos.size === 0) {
                layers.forEach((layer, index) => {
                    const canvas = layer.querySelector('[data-demo]');
                    if (!canvas) return;
                    demos.set(index, null);
                    DEMO_LOADERS[canvas.dataset.demo]?.().then((create) => {
                        demos.set(index, create(canvas, { reducedMotion, controls: layer }));
                        syncDemos();
                    });
                });
            }
            syncDemos();
        }, { rootMargin: '200px 0px' }).observe(feature);
    });
}

// ---------- Showreel: swap the thumbnail for YouTube only on click ----------

function setUpVideoFacades() {
    document.querySelectorAll('[data-youtube]').forEach((facade) => {
        const link = facade.querySelector('a');
        link?.addEventListener('click', (event) => {
            event.preventDefault();
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube-nocookie.com/embed/${facade.dataset.youtube}?autoplay=1&rel=0`;
            iframe.title = 'Ryan Barry showreel';
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
            iframe.allowFullscreen = true;
            facade.replaceChildren(iframe);
            iframe.focus();
        });
    });
}

// ---------- Screenshot lightbox ----------

function setUpLightbox() {
    const dialog = document.querySelector('[data-lightbox]');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const image = dialog.querySelector('[data-lightbox-img]');
    const caption = dialog.querySelector('[data-lightbox-caption]');
    const count = dialog.querySelector('[data-lightbox-count]');
    let items = [];
    let index = 0;

    const show = (i) => {
        index = (i + items.length) % items.length;
        const [file, text] = items[index];
        image.src = `assets/img/${file}-1280.jpg`;
        image.alt = text;
        caption.textContent = text;
        count.textContent = `${index + 1} / ${items.length}`;
    };

    document.querySelectorAll('[data-gallery]').forEach((trigger) => {
        trigger.addEventListener('click', () => {
            items = GALLERIES[trigger.dataset.gallery] ?? [];
            if (!items.length) return;
            show(0);
            dialog.showModal();
        });
    });

    dialog.querySelector('[data-lightbox-prev]').addEventListener('click', () => show(index - 1));
    dialog.querySelector('[data-lightbox-next]').addEventListener('click', () => show(index + 1));
    dialog.querySelector('[data-lightbox-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') show(index - 1);
        if (event.key === 'ArrowRight') show(index + 1);
    });
}

// ---------- Boot ----------

const motion = setUpMotion();
setUpAnchorLinks(motion);
setUpMagneticButtons(motion?.gsap);
setUpFeatures();
setUpVideoFacades();
setUpLightbox();
whenLoaded(() => onIdle(() => startHero(motion)));
