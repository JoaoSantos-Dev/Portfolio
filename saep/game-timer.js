export function createTimer({ state, UI }) {
    return {
        startInterval() {
            this.stopInterval();
            state.timerIntervalId = window.setInterval(() => UI.updateTimer(), 1000);
        },

        ensureStarted() {
            if (state.gameStartTime) {
                if (!state.timerIntervalId) {
                    this.startInterval();
                }
                return;
            }

            state.gameStartTime = Date.now();
            UI.updateTimer();
            this.startInterval();
        },

        stopInterval() {
            if (state.timerIntervalId) {
                window.clearInterval(state.timerIntervalId);
                state.timerIntervalId = null;
            }
        },

        pause() {
            if (state.pauseStartedAt) {
                return;
            }

            state.pauseStartedAt = Date.now();
            this.stopInterval();
            UI.updateTimer();
        },

        resume() {
            if (!state.pauseStartedAt) {
                return;
            }

            state.pausedElapsedMs += Date.now() - state.pauseStartedAt;
            state.pauseStartedAt = null;

            if (state.gameStartTime) {
                this.startInterval();
            }
        }
    };
}
