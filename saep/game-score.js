export function createScore({ CONFIG, state, Utils }) {
    return {
        calculate() {
            const elapsedSeconds = Utils.getElapsedSeconds();
            const rawScore = CONFIG.scoring.base
                - (elapsedSeconds * CONFIG.scoring.timePenaltyPerSecond);
            const adjustedScore = (rawScore * Utils.getDifficultyConfig().scoreMultiplier)
                - state.scorePenaltyPoints;

            return {
                elapsedSeconds,
                score: Math.max(0, Math.round(adjustedScore))
            };
        }
    };
}
