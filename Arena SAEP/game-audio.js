export function createAudio() {
    return {
        context: null,

        getContext() {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                return null;
            }

            if (!this.context) {
                this.context = new AudioContextClass();
            }

            return this.context;
        },

        play(tones) {
            const audioContext = this.getContext();

            if (!audioContext) {
                return;
            }

            const now = audioContext.currentTime;

            if (audioContext.state === "suspended") {
                audioContext.resume().catch(() => {});
            }

            tones.forEach((tone, index) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                const startAt = now + (tone.delay || index * 0.12);
                const endAt = startAt + tone.duration;

                oscillator.type = tone.type || "sine";
                oscillator.frequency.setValueAtTime(tone.frequency, startAt);
                gainNode.gain.setValueAtTime(0.0001, startAt);
                gainNode.gain.exponentialRampToValueAtTime(tone.volume || 0.06, startAt + 0.02);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.start(startAt);
                oscillator.stop(endAt);
            });
        },

        success() {
            this.play([
                { frequency: 523.25, duration: 0.12, volume: 0.05, type: "triangle", delay: 0 },
                { frequency: 659.25, duration: 0.14, volume: 0.06, type: "triangle", delay: 0.1 },
                { frequency: 783.99, duration: 0.18, volume: 0.07, type: "triangle", delay: 0.22 }
            ]);
        },

        error() {
            this.play([
                { frequency: 220, duration: 0.12, volume: 0.06, type: "sawtooth", delay: 0 },
                { frequency: 164.81, duration: 0.18, volume: 0.05, type: "sawtooth", delay: 0.08 }
            ]);
        }
    };
}
