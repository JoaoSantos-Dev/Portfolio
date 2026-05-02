export function createUI({ dom, state, CONFIG, Utils }) {
    let Items = null;
    let Flow = null;
    let Timer = null;
    const contestedTitles = new Set(["Lendario", "Relampago", "Impecavel", "Campeao local"]);

    const getTitleChipVariant = title => {
        if (title === "Campeao em treino") {
            return "training";
        }

        if (contestedTitles.has(title)) {
            return "contested";
        }

        return "muted";
    };

    return {
        setDependencies(dependencies) {
            Items = dependencies.Items;
            Flow = dependencies.Flow;
            Timer = dependencies.Timer;
        },

        setHtmlMessage(element, html) {
            element.innerHTML = html;
        },

        setStatusMessage(element, statusClass, message, extraClass = "") {
            const suffix = extraClass ? ` ${extraClass}` : "";
            this.setHtmlMessage(element, `<div class="status ${statusClass}${suffix}">${message}</div>`);
        },

        updateTimer() {
            dom.timerDisplay.textContent = `Tempo: ${Utils.formatElapsedTime(Utils.getElapsedSeconds())}`;
        },

        updateErrors() {
            dom.errorsDisplay.textContent = `Erros: ${state.errorCount}`;
        },

        updateLives() {
            dom.livesDisplay.textContent = `Vidas: ${state.remainingLives}`;
            dom.livesDisplay.classList.toggle("safe", state.remainingLives > 1);
            dom.finalLivesBadge.textContent = `Vidas restantes: ${state.remainingLives}`;
            dom.finalLivesBadge.classList.toggle("safe", state.remainingLives > 1);
        },

        updateDifficulty() {
            const config = Utils.getDifficultyConfig();
            dom.difficultyDisplay.textContent = `Modo: ${config.label}`;
            dom.finalDifficultyBadge.textContent = `Modo: ${config.label}`;

            Array.from(dom.difficultyGrid.querySelectorAll(".difficulty-card")).forEach(card => {
                card.classList.toggle("selected", card.dataset.difficulty === state.selectedDifficulty);
            });
        },

        updateRoom() {
            const config = Utils.getRoomConfig();

            if (dom.roomDisplay) {
                dom.roomDisplay.textContent = `Sala: ${config?.nome || "-"}`;
            }

            if (dom.playerRoomSummary) {
                dom.playerRoomSummary.textContent = `Sala atual: ${config?.nome || "-"}`;
            }
        },

        renderRegisterRooms() {
            if (!dom.registerRoomGrid) {
                return;
            }

            dom.registerRoomGrid.innerHTML = "";

            state.rooms.forEach(room => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "room-card";
                button.dataset.room = room.id;
                button.innerHTML = `
                    <strong>${room.nome}</strong>
                    <span>Representação da turma</span>
                `;
                dom.registerRoomGrid.appendChild(button);
            });

            this.updateRegisterRoomSelector();
        },

        updateRegisterRoomSelector() {
            if (!dom.registerRoomGrid) {
                return;
            }

            Array.from(dom.registerRoomGrid.querySelectorAll(".room-card")).forEach(card => {
                card.classList.toggle("selected", card.dataset.room === state.selectedRoom);
            });
        },

        updateTopLinks() {
            const gameVisible = dom.gameContent && !dom.gameContent.classList.contains("hidden");
            const lobbyVisible = dom.lobbyScreen && !dom.lobbyScreen.classList.contains("hidden");
            const difficultyVisible = dom.difficultyScreen && !dom.difficultyScreen.classList.contains("hidden");
            const howToVisible = dom.howToPlayScreen && !dom.howToPlayScreen.classList.contains("hidden");
            const appNavigationVisible = gameVisible || lobbyVisible || difficultyVisible || howToVisible;

            if (dom.topUserLink) {
                dom.topUserLink.classList.toggle("hidden", !state.authUser || appNavigationVisible);
            }

            if (dom.topAdminLink) {
                const hasAdminAccess = ["admin", "moderador"].includes(state.authProfile?.role);
                dom.topAdminLink.classList.toggle("hidden", !state.authUser || !hasAdminAccess || appNavigationVisible);
            }

            if (dom.topLogoutButton) {
                dom.topLogoutButton.classList.toggle("hidden", !state.authUser || appNavigationVisible);
            }
        },

        setIntroVisible(visible) {
            if (dom.introStrip) {
                dom.introStrip.classList.toggle("hidden", !visible);
            }
        },

        updateJourneyProgress() {
            const total = state.questions.length || 1;
            const reachedSteps = dom.finalScreen.classList.contains("hidden")
                ? state.unlockedQuestionIndex
                : state.questions.length;
            const percent = Math.max(0, Math.min(100, Math.round((reachedSteps / total) * 100)));

            dom.journeyProgressText.textContent = `Progresso da jornada: ${percent}%`;
            dom.journeyProgressBar.style.width = `${percent}%`;
        },

        updateLobby(summary = {}) {
            const activeSummary = summary && Object.keys(summary).length > 0
                ? summary
                : (state.lobbySummary || {});

            if (dom.lobbyPlayerName) {
                dom.lobbyPlayerName.textContent = state.playerName || state.authProfile?.nomeJogador || state.authProfile?.nomeAcesso || "-";
            }

            const roomLabel = Utils.getRoomLabel() || "Sem sala";
            const bestScoreLabel = activeSummary.bestScore === null || activeSummary.bestScore === undefined
                ? "Sem recorde ainda"
                : String(activeSummary.bestScore);
            const bestTimeLabel = activeSummary.bestTimeSeconds === null || activeSummary.bestTimeSeconds === undefined
                ? "Sem tempo ainda"
                : Utils.formatElapsedTime(activeSummary.bestTimeSeconds);

            if (dom.lobbyIdentityLine) {
                dom.lobbyIdentityLine.textContent = `Sala: ${roomLabel} • Recorde: ${bestScoreLabel} • Melhor tempo: ${bestTimeLabel}`;
            }

            if (dom.lobbyRoomPosition) {
                dom.lobbyRoomPosition.textContent = activeSummary.roomPosition
                    ? `Sua sala está em ${activeSummary.roomPosition}º lugar`
                    : "Sala ainda sem posição";
            }

            if (dom.lobbyIndividualMedal) {
                const medal = activeSummary.individualMedal;
                dom.lobbyIndividualMedal.classList.toggle("hidden", !medal);
                dom.lobbyIndividualMedal.classList.remove("gold", "silver", "bronze");

                if (medal) {
                    const medalIcon = medal.tier === "gold" ? "🥇" : medal.tier === "silver" ? "🥈" : "🥉";
                    dom.lobbyIndividualMedal.textContent = `${medalIcon} ${medal.label}`;
                    dom.lobbyIndividualMedal.classList.add(medal.tier);
                }
            }

            if (dom.lobbyRoomMedal) {
                const medal = activeSummary.roomMedal;
                dom.lobbyRoomMedal.classList.toggle("hidden", !medal);
                dom.lobbyRoomMedal.classList.remove("gold", "silver", "bronze");

                if (medal) {
                    dom.lobbyRoomMedal.textContent = `🛡️ ${medal.label}`;
                    dom.lobbyRoomMedal.classList.add(medal.tier);
                }
            }

            if (dom.lobbyTitleChip) {
                const title = activeSummary.title || "Decifrador";
                dom.lobbyTitleChip.textContent = `⭐ Título: ${title}`;
                dom.lobbyTitleChip.classList.remove("title-chip-contested", "title-chip-muted", "title-chip-training");
                dom.lobbyTitleChip.classList.add(`title-chip-${getTitleChipVariant(title)}`);
            }

            if (dom.lobbyMatchesChip) {
                const matchesPlayed = activeSummary.matchesPlayed ?? 0;
                dom.lobbyMatchesChip.textContent = matchesPlayed === 1
                    ? "📘 1 desafio concluído"
                    : `📘 ${matchesPlayed} desafios concluídos`;
            }

            if (dom.lobbyAdminLink) {
                dom.lobbyAdminLink.classList.toggle("hidden", !["admin", "moderador"].includes(state.authProfile?.role));
            }
        },

        renderInventory() {
            const ownedItems = Object.entries(CONFIG.items).filter(([itemKey]) => state.inventory[itemKey] > 0);
            dom.inventoryPanel.classList.toggle("hidden", ownedItems.length === 0);
            dom.inventoryGrid.innerHTML = "";

            ownedItems.forEach(([itemKey, item]) => {
                const card = document.createElement("div");
                const enabled = Items ? Items.canUse(itemKey) : false;

                card.className = "item-card";
                card.innerHTML = `
                    <strong>${item.label} x${state.inventory[itemKey]}</strong>
                    <span>${item.description}</span>
                    <button type="button" data-item="${itemKey}" ${enabled ? "" : "disabled"}>Usar item</button>
                `;

                dom.inventoryGrid.appendChild(card);
            });
        },

        refreshPlayerPanel() {
            dom.playerNameDisplay.textContent = state.playerName || "Jogador";
            if (dom.accountEmailDisplay) {
                dom.accountEmailDisplay.textContent = state.authUser?.email || "Sem sessão";
            }
            this.updateTopLinks();
            this.updateRoom();
            this.updateTimer();
            this.updateErrors();
            this.updateDifficulty();
            this.updateLives();
            this.updateJourneyProgress();
            this.renderInventory();
            this.updateLobby();
        },

        flashBody(className) {
            document.body.classList.remove("body-success-flash", "body-error-flash");
            document.body.classList.add(className);
            window.setTimeout(() => {
                document.body.classList.remove(className);
            }, 480);
        },

        animateScreen(screenElement) {
            screenElement.classList.remove("screen-highlight");
            void screenElement.offsetWidth;
            screenElement.classList.add("screen-highlight");
        },

        showTitleUnlockOverlay(titles = []) {
            if (!dom.titleUnlockOverlay || !dom.titleUnlockList) {
                return;
            }

            dom.titleUnlockList.innerHTML = titles.map(title => `
                <div class="title-unlock-chip">🏆 ${title}</div>
            `).join("");
            dom.titleUnlockOverlay.classList.remove("hidden");
        },

        closeTitleUnlockOverlay() {
            if (!dom.titleUnlockOverlay || !dom.titleUnlockList) {
                return;
            }

            dom.titleUnlockOverlay.classList.add("hidden");
            dom.titleUnlockList.innerHTML = "";
        },

        hideGameplayScreens() {
            dom.loadingScreen.classList.add("hidden");
            dom.startScreen.classList.add("hidden");
            dom.questionScreen.classList.add("hidden");
            dom.finalScreen.classList.add("hidden");
        },

        showOnlyScreen(screenElement) {
            this.hideGameplayScreens();
            screenElement.classList.remove("hidden");
        },

        showPlayerScreen(prefillCurrentName = false) {
            dom.loginScreen.classList.add("hidden");
            dom.registerScreen.classList.add("hidden");
            dom.lobbyScreen.classList.add("hidden");
            dom.difficultyScreen.classList.add("hidden");
            dom.howToPlayScreen.classList.add("hidden");
            dom.playerScreen.classList.remove("hidden");
            dom.gameContent.classList.add("hidden");
            this.setIntroVisible(true);
            dom.playerNameMessage.innerHTML = "";
            dom.playerNameInput.value = prefillCurrentName ? state.playerName : "";
            this.updateTopLinks();
            this.updateRoom();
            this.updateDifficulty();
            dom.playerNameInput.focus();
        },

        showLoginScreen() {
            dom.registerScreen.classList.add("hidden");
            dom.playerScreen.classList.add("hidden");
            dom.lobbyScreen.classList.add("hidden");
            dom.difficultyScreen.classList.add("hidden");
            dom.howToPlayScreen.classList.add("hidden");
            dom.gameContent.classList.add("hidden");
            dom.loginScreen.classList.remove("hidden");
            this.setIntroVisible(true);
            dom.loginMessage.innerHTML = "";
            this.updateTopLinks();
            dom.loginEmailInput.focus();
        },

        showRegisterScreen() {
            dom.loginScreen.classList.add("hidden");
            dom.playerScreen.classList.add("hidden");
            dom.lobbyScreen.classList.add("hidden");
            dom.difficultyScreen.classList.add("hidden");
            dom.howToPlayScreen.classList.add("hidden");
            dom.gameContent.classList.add("hidden");
            dom.registerScreen.classList.remove("hidden");
            this.setIntroVisible(true);
            dom.registerMessage.innerHTML = "";
            this.updateTopLinks();
            this.renderRegisterRooms();
            this.updateRegisterRoomSelector();
            dom.registerNameInput.focus();
        },

        showLobbyScreen() {
            dom.loginScreen.classList.add("hidden");
            dom.registerScreen.classList.add("hidden");
            dom.playerScreen.classList.add("hidden");
            dom.difficultyScreen.classList.add("hidden");
            dom.howToPlayScreen.classList.add("hidden");
            dom.gameContent.classList.add("hidden");
            dom.lobbyScreen.classList.remove("hidden");
            this.setIntroVisible(false);
            this.updateTopLinks();
            this.updateRoom();
            this.updateDifficulty();
            this.updateLobby();
        },

        showDifficultyScreen() {
            dom.loginScreen.classList.add("hidden");
            dom.registerScreen.classList.add("hidden");
            dom.playerScreen.classList.add("hidden");
            dom.lobbyScreen.classList.add("hidden");
            dom.howToPlayScreen.classList.add("hidden");
            dom.gameContent.classList.add("hidden");
            dom.difficultyScreen.classList.remove("hidden");
            this.setIntroVisible(false);
            dom.difficultyMessage.innerHTML = "";
            this.updateTopLinks();
            this.updateDifficulty();
        },

        showHowToPlayScreen() {
            dom.loginScreen.classList.add("hidden");
            dom.registerScreen.classList.add("hidden");
            dom.playerScreen.classList.add("hidden");
            dom.lobbyScreen.classList.add("hidden");
            dom.difficultyScreen.classList.add("hidden");
            dom.gameContent.classList.add("hidden");
            dom.howToPlayScreen.classList.remove("hidden");
            this.setIntroVisible(false);
            this.updateTopLinks();
        },

        showGameContent() {
            dom.loginScreen.classList.add("hidden");
            dom.registerScreen.classList.add("hidden");
            dom.playerScreen.classList.add("hidden");
            dom.lobbyScreen.classList.add("hidden");
            dom.difficultyScreen.classList.add("hidden");
            dom.howToPlayScreen.classList.add("hidden");
            dom.gameContent.classList.remove("hidden");
            this.setIntroVisible(false);
            this.refreshPlayerPanel();
        },

        showStartScreen() {
            this.showOnlyScreen(dom.startScreen);
            this.updateCodeStep();
            this.updateJourneyProgress();
            this.renderInventory();
        },

        updateCodeStep() {
            if (state.questions.length === 0) {
                return;
            }

            const stepNumber = state.unlockedQuestionIndex + 1;
            const currentRiddle = Utils.getCurrentRiddle();
            dom.codeStepText.textContent = `Etapa ${stepNumber} de ${state.questions.length}`;
            dom.codeInstruction.textContent = `Digite o código para acessar a questão ${stepNumber}.`;
            dom.codeInput.placeholder = `Digite o código da questão ${stepNumber}`;
            dom.codeHintWrapper.classList.remove("hidden");
            dom.codeCheckpointMessage.textContent = state.unlockedQuestionIndex === 0
                ? "A aventura começou. Resolva a charada abaixo para liberar a primeira questão."
                : `Checkpoint ${state.unlockedQuestionIndex} alcançado. Resolva a nova charada para seguir viagem.`;
            dom.codeCheckpointMessage.classList.add("status-pop");
            dom.codeHint.textContent = currentRiddle?.riddle || "Nenhuma charada disponível para esta etapa.";
            dom.codeExtraHint.textContent = currentRiddle?.extraHint || "Nenhuma dica extra disponível para esta charada.";
            dom.codeExtraHint.classList.toggle("hidden", !state.extraHintVisible);
        },

        renderQuestion() {
            const current = Utils.getCurrentQuestion();
            state.currentQuestionLupaUsed = false;

            this.showOnlyScreen(dom.questionScreen);
            this.renderInventory();
            dom.progressText.textContent = `Questão ${state.currentQuestionIndex + 1} de ${state.questions.length}`;
            dom.questionTitle.textContent = current.title;
            dom.questionText.textContent = current.question;
            dom.optionsContainer.innerHTML = "";
            dom.answerMessage.innerHTML = "";

            current.options.forEach(option => {
                const button = document.createElement("button");
                button.className = "option";
                button.dataset.optionId = option.id;
                button.textContent = `${option.id}) ${option.text}`;
                button.addEventListener("click", () => Flow.handleAnswer(option.id));
                dom.optionsContainer.appendChild(button);
            });
        },

        showRewardOverlay(itemKey) {
            state.rewardInProgress = true;
            Timer.pause();
            dom.rewardOverlay.classList.remove("hidden");
            dom.rewardContinueButton.classList.add("hidden");
            dom.rewardItemDescription.textContent = "";

            const ownedItemKeys = Object.keys(state.inventory).filter(key => state.inventory[key] > 0);
            const previewItemKeys = ownedItemKeys.length > 0 ? ownedItemKeys : [itemKey];
            let tick = 0;

            const spinIntervalId = window.setInterval(() => {
                const previewItem = CONFIG.items[previewItemKeys[tick % previewItemKeys.length]];
                dom.rewardItemName.textContent = previewItem.label;
                tick += 1;
            }, CONFIG.reward.spinTickMs);

            window.setTimeout(() => {
                window.clearInterval(spinIntervalId);
                dom.rewardItemName.textContent = CONFIG.items[itemKey].label;
                dom.rewardItemDescription.textContent = CONFIG.items[itemKey].description;
                dom.rewardContinueButton.classList.remove("hidden");
                this.refreshPlayerPanel();
            }, CONFIG.reward.spinDurationMs);
        },

        closeRewardOverlay() {
            dom.rewardOverlay.classList.add("hidden");
            dom.rewardContinueButton.classList.add("hidden");
            dom.rewardItemDescription.textContent = "";
            state.rewardInProgress = false;
            Timer.resume();
            this.setStatusMessage(dom.codeMessage, "success", `Novo item no inventário: ${dom.rewardItemName.textContent}.`, "status-pop");
        },

        showLifeChoiceMessage() {
            dom.codeMessage.innerHTML = `
                <div class="status error status-pop">Você perdeu uma vida e voltou para a busca do código atual.</div>
                <div class="button-group">
                    <button id="extraLifeButton" type="button" class="life-button">Ganhar vida extra (+30s)</button>
                </div>
            `;

            const extraLifeButton = document.getElementById("extraLifeButton");
            if (extraLifeButton) {
                extraLifeButton.addEventListener("click", () => Flow.addExtraLife(), { once: true });
            }
        }
    };
}
