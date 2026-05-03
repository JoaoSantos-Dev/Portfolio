import {
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

export function createRunService({ db, CONFIG, state, Utils, UI, Timer }) {
    return {
        getPayload(overrides = {}) {
            return {
                participacaoId: state.currentRunId,
                desafioId: state.currentChallenge?.id || null,
                nome: state.playerName,
                salaId: state.selectedRoom,
                uid: state.authUser?.uid || null,
                email: state.authUser?.email || null,
                iniciadoEm: state.currentParticipation?.iniciadoEm || new Date().toISOString(),
                concluidoEm: null,
                status: state.currentRunStatus,
                dificuldade: state.selectedDifficulty,
                erros: state.errorCount,
                errosQuestoes: state.errorCount,
                errosCharada: state.riddleErrorCount,
                penalidadePontuacao: state.scorePenaltyPoints,
                vidasRestantes: state.remainingLives,
                vidasExtrasUsadas: state.extraLifeCount,
                progressoAtual: state.unlockedQuestionIndex,
                questaoAtual: Utils.getCurrentQuestionNumber(),
                currentQuestionIndex: state.currentQuestionIndex,
                telaAtual: state.currentQuestionIndex === null ? "codigo" : "questao",
                tempoSegundos: Utils.getElapsedSeconds(),
                totalQuestoes: state.questions.length,
                itens: state.inventory,
                escudoAtivo: state.shieldActive,
                perguntas: state.questions,
                charadas: state.riddles,
                respostas: state.answerHistory,
                ...overrides
            };
        },

        persistActiveRunLocally() {
            if (!state.currentRunId) {
                localStorage.removeItem(CONFIG.storageKeys.activeRun);
                return;
            }

            localStorage.setItem(CONFIG.storageKeys.activeRun, JSON.stringify({
                participationId: state.currentRunId,
                challengeId: state.currentChallenge?.id || null
            }));
        },

        async queue(task) {
            state.runSyncPromise = state.runSyncPromise
                .then(task)
                .catch(error => {
                    console.error("Erro ao sincronizar tentativa:", error);
                });

            return state.runSyncPromise;
        },

        beginTracking(participation) {
            state.currentRunId = participation.id;
            state.currentParticipation = participation;
            state.currentRunStatus = participation.status || "em_andamento";
            state.scoreSaved = false;
            this.persistActiveRunLocally();
            UI.refreshPlayerPanel();
            Timer.startInterval();
        },

        async sync(overrides = {}) {
            if (!state.currentRunId || state.currentRunStatus !== "em_andamento") {
                return;
            }

            await this.queue(() => updateDoc(
                doc(db, CONFIG.collections.challengeParticipations, state.currentRunId),
                this.getPayload({
                    atualizadoEm: new Date().toISOString(),
                    ...overrides
                })
            ));
        },

        async finalize(status, overrides = {}) {
            if (!state.currentRunId || state.currentRunStatus === "concluido" || state.currentRunStatus === "abandonado") {
                return;
            }

            state.currentRunStatus = status;
            const finishedAt = new Date().toISOString();

            await this.queue(() => updateDoc(
                doc(db, CONFIG.collections.challengeParticipations, state.currentRunId),
                this.getPayload({
                    status,
                    concluidoEm: finishedAt,
                    atualizadoEm: finishedAt,
                    ...overrides
                })
            ));

            if (state.currentParticipation) {
                state.currentParticipation = {
                    ...state.currentParticipation,
                    status,
                    concluidoEm: finishedAt,
                    ...overrides
                };
            }

            localStorage.removeItem(CONFIG.storageKeys.activeRun);
        },

        async recoverAbandonedPreviousRun() {
            const activeRunRaw = localStorage.getItem(CONFIG.storageKeys.activeRun);

            if (!activeRunRaw) {
                return;
            }

            try {
                const activeRun = JSON.parse(activeRunRaw);

                if (!activeRun.participationId) {
                    localStorage.removeItem(CONFIG.storageKeys.activeRun);
                    return;
                }
            } catch (error) {
                console.error("Erro ao recuperar tentativa anterior:", error);
            } finally {
                return;
            }
        }
    };
}
