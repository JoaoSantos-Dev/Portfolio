export function createScore({ CONFIG, state, Utils }) {
    return {
        calculate() {
            const elapsedSeconds = Utils.getElapsedSeconds();
            const rawScore = CONFIG.scoring.base
                - (elapsedSeconds * CONFIG.scoring.timePenaltyPerSecond)
                - state.scorePenaltyPoints;

            return {
                elapsedSeconds,
                score: Math.max(0, Math.round(rawScore * Utils.getDifficultyConfig().scoreMultiplier))
            };
        }
    };
}
