export function createItems({ dom, state, CONFIG, Utils, UI, Timer, RunService }) {
    return {
        canUse(itemKey) {
            if (state.inventory[itemKey] <= 0) {
                return false;
            }

            if (itemKey === "bussola") {
                return !dom.startScreen.classList.contains("hidden")
                    && !dom.codeHintWrapper.classList.contains("hidden")
                    && !state.extraHintVisible;
            }

            if (itemKey === "lupa") {
                return !dom.questionScreen.classList.contains("hidden") && !state.currentQuestionLupaUsed;
            }

            if (itemKey === "escudo") {
                return !state.shieldActive;
            }

            if (itemKey === "ampulheta") {
                return true;
            }

            if (itemKey === "chaveMestra") {
                return !dom.startScreen.classList.contains("hidden");
            }

            return false;
        },

        syncInventory(overrides = {}) {
            UI.refreshPlayerPanel();
            RunService.sync({
                itens: state.inventory,
                escudoAtivo: state.shieldActive,
                ...overrides
            });
        },

        consume(itemKey) {
            if ((state.inventory[itemKey] || 0) <= 0) {
                return false;
            }

            state.inventory[itemKey] -= 1;
            this.syncInventory();
            return true;
        },

        giveRandom() {
            const itemKeys = Object.keys(CONFIG.items);
            const randomItem = itemKeys[Math.floor(Math.random() * itemKeys.length)];
            state.inventory[randomItem] += 1;
            this.syncInventory();
            UI.showRewardOverlay(randomItem);
        },

        useCompass() {
            if (!this.canUse("bussola") || !this.consume("bussola")) {
                return;
            }

            state.extraHintVisible = true;
            UI.updateCodeStep();
            UI.setStatusMessage(dom.codeMessage, "info", "Bussola usada. A dica extra da charada foi revelada.", "status-pop");
            this.syncInventory();
        },

        useMagnifier() {
            if (!this.canUse("lupa") || !this.consume("lupa")) {
                return;
            }

            const current = Utils.getCurrentQuestion();

            if (!current) {
                return;
            }

            Array.from(dom.optionsContainer.querySelectorAll(".option"))
                .filter(button => button.dataset.optionId !== current.correct)
                .slice(0, 2)
                .forEach(button => button.classList.add("danger-mark"));

            state.currentQuestionLupaUsed = true;
            UI.setStatusMessage(dom.answerMessage, "info", "Lupa usada. Duas alternativas erradas foram destacadas.", "status-pop");
            this.syncInventory();
        },

        useShield() {
            if (!this.canUse("escudo") || !this.consume("escudo")) {
                return;
            }

            state.shieldActive = true;
            UI.setStatusMessage(dom.codeMessage, "success", "Escudo ativado. O próximo erro de resposta será anulado.", "status-pop");
            this.syncInventory();
        },

        useHourglass() {
            if (!this.canUse("ampulheta") || !this.consume("ampulheta")) {
                return;
            }

            if (state.gameStartTime) {
                state.gameStartTime += CONFIG.scoring.hourglassBonusSeconds * 1000;
            }

            UI.setStatusMessage(dom.codeMessage, "success", "Ampulheta usada. O cronômetro recuou 20 segundos.", "status-pop");
            this.syncInventory({ tempoSegundos: Utils.getElapsedSeconds() });
        },

        useMasterKey() {
            if (!this.canUse("chaveMestra") || !this.consume("chaveMestra")) {
                return;
            }

            Timer.ensureStarted();
            UI.setStatusMessage(dom.codeMessage, "success", "Chave Mestra usada. A próxima questão foi aberta sem precisar do código.", "status-pop");
            state.currentQuestionIndex = state.unlockedQuestionIndex;
            this.syncInventory({ questaoAtual: state.currentQuestionIndex + 1 });
            UI.renderQuestion();
        },

        use(itemKey) {
            if (itemKey === "bussola") {
                this.useCompass();
            } else if (itemKey === "lupa") {
                this.useMagnifier();
            } else if (itemKey === "escudo") {
                this.useShield();
            } else if (itemKey === "ampulheta") {
                this.useHourglass();
            } else if (itemKey === "chaveMestra") {
                this.useMasterKey();
            }
        }
    };
}
