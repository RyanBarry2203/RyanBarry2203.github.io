// An original ambient loop in the Tron mood, synthesised live with the Web Audio API, so there is no audio file
// to download. D minor, i-VI-iv-V: a pulsing filtered bass, slow detuned pads, and an echoing arpeggio on every
// other pass. Notes are scheduled a little ahead of the audio clock by a timer ("a tale of two clocks").

const BPM = 92;
const STEP = 60 / BPM / 4;
const STEPS_PER_CHORD = 32;
const LOOKAHEAD = 0.3;
const TICK_MS = 90;
const FADE = 1.6;

const CHORDS = [
    { root: 38, notes: [50, 53, 57] },
    { root: 34, notes: [46, 50, 53] },
    { root: 31, notes: [43, 46, 50] },
    { root: 33, notes: [45, 49, 52] },
];
const BASS_PATTERN = [0, 0, 12, 0, 0, 12, 0, 7];
const ARP_STEPS = [0, 3, 6, 8, 10, 13];

const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

function createImpulse(context, seconds) {
    const length = Math.floor(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.5;
    }
    return impulse;
}

export function createGridAmbient(context, { volume = 0.15, output = context.destination } = {}) {
    const master = context.createGain();
    master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    master.connect(limiter).connect(output);

    const dry = context.createGain();
    dry.connect(master);
    const reverb = context.createConvolver();
    reverb.buffer = createImpulse(context, 3.2);
    const wet = context.createGain();
    wet.gain.value = 0.45;
    reverb.connect(wet).connect(master);

    const padFilter = context.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 900;
    padFilter.Q.value = 0.7;
    const sweep = context.createOscillator();
    sweep.frequency.value = 1 / 16;
    const sweepDepth = context.createGain();
    sweepDepth.gain.value = 450;
    sweep.connect(sweepDepth).connect(padFilter.frequency);
    sweep.start();
    const pads = context.createGain();
    pads.gain.value = 0.5;
    padFilter.connect(pads);
    pads.connect(dry);
    pads.connect(reverb);

    const echo = context.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const echoTone = context.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2200;
    const feedback = context.createGain();
    feedback.gain.value = 0.38;
    echo.connect(echoTone).connect(feedback).connect(echo);
    echoTone.connect(dry);
    echoTone.connect(reverb);
    const arps = context.createGain();
    arps.connect(dry);
    arps.connect(echo);

    function playPad(notes, time, length) {
        for (const note of notes) {
            for (const detune of [-8, 8]) {
                const osc = context.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.value = frequency(note);
                osc.detune.value = detune;
                const gain = context.createGain();
                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.06, time + 1.8);
                gain.gain.setValueAtTime(0.06, time + length);
                gain.gain.linearRampToValueAtTime(0, time + length + 2.5);
                osc.connect(gain).connect(padFilter);
                osc.start(time);
                osc.stop(time + length + 2.6);
            }
        }
    }

    function playBass(note, time) {
        const osc = context.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = frequency(note);
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 6;
        filter.frequency.setValueAtTime(900, time);
        filter.frequency.exponentialRampToValueAtTime(180, time + 0.18);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.35, time + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
        osc.connect(filter).connect(gain).connect(dry);
        osc.start(time);
        osc.stop(time + 0.3);
    }

    function playArp(note, time) {
        const osc = context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = frequency(note);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.08, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
        osc.connect(gain).connect(arps);
        osc.start(time);
        osc.stop(time + 0.3);
    }

    function playStep(step, time) {
        const chord = CHORDS[Math.floor(step / STEPS_PER_CHORD) % CHORDS.length];
        const local = step % STEPS_PER_CHORD;
        const pass = Math.floor(step / (STEPS_PER_CHORD * CHORDS.length));
        if (local === 0) playPad(chord.notes, time, STEPS_PER_CHORD * STEP);
        if (local % 2 === 0) playBass(chord.root + BASS_PATTERN[(local / 2) % BASS_PATTERN.length], time);
        const arpIndex = ARP_STEPS.indexOf(local % 16);
        if (pass % 2 === 1 && arpIndex >= 0) playArp(chord.notes[arpIndex % chord.notes.length] + 12, time);
    }

    let step = 0;
    let nextTime = 0;
    let timer = 0;
    let idleTimer = 0;
    let playing = false;

    function schedule() {
        while (nextTime < context.currentTime + LOOKAHEAD) {
            playStep(step++, nextTime);
            nextTime += STEP;
        }
    }

    function fadeTo(level) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(level, context.currentTime, FADE / 3);
    }

    return {
        setPlaying(shouldPlay) {
            if (shouldPlay === playing) return;
            playing = shouldPlay;
            clearTimeout(idleTimer);
            if (playing) {
                context.resume();
                if (!timer) {
                    nextTime = context.currentTime + 0.05;
                    timer = setInterval(schedule, TICK_MS);
                }
                fadeTo(volume);
                return;
            }
            fadeTo(0);
            idleTimer = setTimeout(() => {
                clearInterval(timer);
                timer = 0;
                context.suspend();
            }, FADE * 1000 + 200);
        },
    };
}
