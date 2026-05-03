export function createUtils({ CONFIG, state }) {
    return {
        normalizeCode(value) {
            return value.trim().toUpperCase();
        },

        formatElapsedTime(totalSeconds) {
            const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
            const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
            return `${minutes}:${seconds}`;
        },

        generateRunId() {
            if (window.crypto && typeof window.crypto.randomUUID === "function") {
                return window.crypto.randomUUID();
            }

            return `run-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
        },

        getDifficultyConfig() {
            return CONFIG.difficulty[state.selectedDifficulty];
        },

        getRoomConfig() {
            return state.rooms.find(room => room.id === state.selectedRoom) || null;
        },

        getRoomLabel(roomId = state.selectedRoom) {
            return state.rooms.find(room => room.id === roomId)?.nome || "Sem sala";
        },

        getElapsedSeconds() {
            if (!state.gameStartTime) {
                return 0;
            }

            const activePauseMs = state.pauseStartedAt ? (Date.now() - state.pauseStartedAt) : 0;
            return Math.floor((Date.now() - state.gameStartTime - state.pausedElapsedMs - activePauseMs) / 1000);
        },

        getCurrentQuestion() {
            return state.questions[state.currentQuestionIndex] || null;
        },

        getExpectedQuestion() {
            return state.questions[state.unlockedQuestionIndex] || null;
        },

        getCurrentRiddle() {
            return state.riddles[state.unlockedQuestionIndex] || null;
        },

        getCurrentQuestionNumber() {
            if (state.currentQuestionIndex !== null) {
                return state.currentQuestionIndex + 1;
            }

            return state.unlockedQuestionIndex + 1;
        },

        getPerformanceProfile(result) {
            if (result.score >= 9000 && state.errorCount <= 1 && result.elapsedSeconds <= 180) {
                return {
                    title: "Mestre do Tesouro",
                    description: "Você avançou com precisão quase perfeita, pouco erro e ritmo dominante do início ao fim."
                };
            }

            if (result.score >= 7600 && state.errorCount <= 3 && result.elapsedSeconds <= 360) {
                return {
                    title: "Explorador Ágil",
                    description: "Você encontrou o caminho com velocidade e manteve um desempenho forte ao longo da caça."
                };
            }

            if (result.score >= 5600 && state.errorCount <= 6) {
                return {
                    title: "Persistente",
                    description: "Você tropeçou algumas vezes, mas se reorganizou e chegou ao tesouro sem desistir."
                };
            }

            return {
                title: "Sobrevivente",
                description: "A jornada foi dura, mas você resistiu, continuou tentando e conseguiu concluir o desafio."
            };
        },

        shuffle(list) {
            const shuffled = [...list];

            for (let index = shuffled.length - 1; index > 0; index -= 1) {
                const randomIndex = Math.floor(Math.random() * (index + 1));
                [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
            }

            return shuffled;
        },

        pickRandom(list) {
            if (list.length === 0) {
                return null;
            }

            return list[Math.floor(Math.random() * list.length)];
        },

        buildRiddleSequence(totalQuestions, riddlePool) {
            return Array.from({ length: totalQuestions }, () => this.pickRandom(riddlePool));
        },

        takeRandomItems(list, count) {
            if (count >= list.length) {
                return this.shuffle(list);
            }

            return this.shuffle(list).slice(0, count);
        }
    };
}
