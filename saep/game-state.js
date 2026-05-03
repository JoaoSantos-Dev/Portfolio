export function createDefaultInventory() {
    return {
        bussola: 0,
        lupa: 0,
        escudo: 0,
        ampulheta: 0,
        chaveMestra: 0
    };
}

export function createState(config) {
    return {
        questions: [],
        riddles: [],
        rooms: [],
        authResolved: false,
        authUser: null,
        authProfile: null,
        currentQuestionIndex: null,
        unlockedQuestionIndex: 0,
        playerName: "",
        selectedRoom: null,
        selectedDifficulty: "normal",
        errorCount: 0,
        riddleErrorCount: 0,
        scorePenaltyPoints: 0,
        extraLifeCount: 0,
        remainingLives: config.difficulty.normal.initialLives,
        gameStartTime: null,
        timerIntervalId: null,
        pausedElapsedMs: 0,
        pauseStartedAt: null,
        scoreSaved: false,
        currentRunId: null,
        currentRunStatus: "nao_iniciada",
        runSyncPromise: Promise.resolve(),
        inventory: createDefaultInventory(),
        shieldActive: false,
        comboStreakCount: 0,
        comboStreakStartedAt: null,
        currentQuestionLupaUsed: false,
        extraHintVisible: false,
        rewardInProgress: false,
        answerHistory: [],
        lobbySummary: null,
        resultSummary: null,
        pendingStartAvailability: null,
        currentChallenge: null,
        currentParticipation: null
    };
}
