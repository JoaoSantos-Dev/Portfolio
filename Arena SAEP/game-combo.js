export function createCombo({ CONFIG, state, Items }) {
    return {
        reset() {
            state.comboStreakCount = 0;
            state.comboStreakStartedAt = null;
        },

        registerCorrectAnswer() {
            const now = Date.now();

            if (!state.comboStreakStartedAt || (now - state.comboStreakStartedAt) > CONFIG.reward.comboWindowMs) {
                state.comboStreakStartedAt = now;
                state.comboStreakCount = 1;
                return;
            }

            state.comboStreakCount += 1;

            if (state.comboStreakCount >= CONFIG.reward.comboRequired) {
                this.reset();
                Items.giveRandom();
            }
        }
    };
}
