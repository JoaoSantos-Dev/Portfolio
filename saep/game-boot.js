export function createBoot({ db, dom, state, CONFIG, UI, Flow, Items, RunService, AuthService, RoomService, ChallengeService }) {
    const AUTH_NOTICE_KEY = "onepieceAuthNotice";

    return {
        bindEvents() {
            window.addEventListener("pagehide", () => {
                if (!state.currentRunId || state.currentRunStatus !== "em_andamento") {
                    return;
                }

                RunService.sync();
            });

            dom.savePlayerNameButton.addEventListener("click", () => Flow.savePlayer());
            dom.loginButton.addEventListener("click", () => Flow.login());
            dom.resendVerificationButton.addEventListener("click", () => Flow.resendVerificationEmail());
            dom.showRegisterButton.addEventListener("click", () => UI.showRegisterScreen());
            dom.registerButton.addEventListener("click", () => Flow.register());
            dom.backToLoginButton.addEventListener("click", () => UI.showLoginScreen());
            dom.topLogoutButton.addEventListener("click", () => Flow.logout());
            dom.startMatchButton.addEventListener("click", () => Flow.startMatch());
            dom.confirmDifficultyButton.addEventListener("click", () => Flow.confirmDifficultyAndStart());
            dom.backToLobbyFromDifficultyButton.addEventListener("click", () => Flow.enterLobby());
            dom.showHowToPlayButton.addEventListener("click", () => UI.showHowToPlayScreen());
            dom.backToLobbyButton.addEventListener("click", () => Flow.enterLobby());
            dom.lobbyLogoutButton.addEventListener("click", () => Flow.logout());
            dom.changeNameButton.addEventListener("click", () => Flow.changePlayerName());
            dom.checkCodeButton.addEventListener("click", () => Flow.openQuestionByCode());
            dom.restartButton.addEventListener("click", () => Flow.restartGame());
            dom.backToLobbyAfterResultButton.addEventListener("click", () => Flow.goBackToLobby());
            dom.logoutButton.addEventListener("click", () => Flow.logout());
            dom.rewardContinueButton.addEventListener("click", () => UI.closeRewardOverlay());
            dom.titleUnlockContinueButton?.addEventListener("click", () => UI.closeTitleUnlockOverlay());
            dom.titleUnlockOverlay?.addEventListener("click", event => {
                if (event.target === dom.titleUnlockOverlay) {
                    UI.closeTitleUnlockOverlay();
                }
            });

            dom.difficultyGrid.addEventListener("click", event => {
                const button = event.target.closest(".difficulty-card");
                if (!button) {
                    return;
                }

                Flow.applyDifficulty(button.dataset.difficulty);
            });

            dom.registerRoomGrid.addEventListener("click", event => {
                const button = event.target.closest(".room-card");
                if (!button) {
                    return;
                }

                Flow.applyRoom(button.dataset.room);
                UI.updateRegisterRoomSelector();
            });

            dom.inventoryGrid.addEventListener("click", event => {
                const button = event.target.closest("button[data-item]");
                if (!button) {
                    return;
                }

                Items.use(button.dataset.item);
            });

            dom.playerNameInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    Flow.savePlayer();
                }
            });

            dom.loginPasswordInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    Flow.login();
                }
            });

            dom.registerPasswordInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    Flow.register();
                }
            });

            dom.codeInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    Flow.openQuestionByCode();
                }
            });
        },

        async init() {
            const savedRoom = localStorage.getItem(CONFIG.storageKeys.playerRoom);
            const savedName = localStorage.getItem(CONFIG.storageKeys.playerName);
            const redirectTarget = new URLSearchParams(window.location.search).get("redirect");
            const consumeAuthNotice = () => {
                const storedNotice = sessionStorage.getItem(AUTH_NOTICE_KEY);
                if (!storedNotice) {
                    return;
                }

                sessionStorage.removeItem(AUTH_NOTICE_KEY);
                const [type, ...messageParts] = storedNotice.split("::");
                const message = messageParts.join("::");
                if (type && message) {
                    UI.setStatusMessage(dom.loginMessage, type, message);
                }
            };

            try {
                await RoomService.ensureSeedRooms();
                await RoomService.refreshRooms();
                await ChallengeService.markExpiredChallenges();

                if (savedRoom && state.rooms.some(room => room.id === savedRoom)) {
                    state.selectedRoom = savedRoom;
                }
            } catch (error) {
                console.error("Erro ao carregar salas:", error);
                UI.showLoginScreen();
                UI.setStatusMessage(dom.loginMessage, "error", "Não foi possível carregar as salas do sistema. Verifique a coleção <code>salas</code> no Firebase.");
                return;
            }

            AuthService.watchSession(async user => {
                if (!user) {
                    await RunService.recoverAbandonedPreviousRun();
                    state.playerName = "";
                    UI.showLoginScreen();
                    consumeAuthNotice();
                    return;
                }

                try {
                    await RoomService.refreshRooms();
                    await AuthService.reloadUser(user);
                    state.authProfile = await AuthService.syncEmailVerificationApproval(user, state.authProfile);

                    const profileRequiresEmailVerification = AuthService.requiresEmailVerification(state.authProfile);

                    if (profileRequiresEmailVerification && !AuthService.isVerifiedUser(user)) {
                        sessionStorage.setItem(
                            AUTH_NOTICE_KEY,
                            "info::Confirme seu e-mail para acessar a plataforma. Verifique sua caixa de entrada e depois tente entrar novamente."
                        );
                        await AuthService.signOutUser();
                        return;
                    }

                    const approvalStatus = AuthService.getApprovalStatus(state.authProfile);
                    if (approvalStatus !== "aprovado") {
                        sessionStorage.setItem(
                            AUTH_NOTICE_KEY,
                            approvalStatus === "recusado"
                                ? "error::Seu cadastro foi recusado. Fale com a equipe responsável."
                                : "info::Cadastro recebido. Aguarde a confirmação da equipe para acessar a plataforma."
                        );
                        await AuthService.signOutUser();
                        return;
                    }

                    if (state.authProfile?.sala && state.rooms.some(room => room.id === state.authProfile.sala)) {
                        state.selectedRoom = state.authProfile.sala;
                    }

                    const profilePlayerName = state.authProfile?.nomeJogador?.trim();
                    const resolvedPlayerName = profilePlayerName || savedName || "";

                    if (redirectTarget && redirectTarget !== "./arena.html") {
                        if (resolvedPlayerName) {
                            state.playerName = resolvedPlayerName;
                            localStorage.setItem(CONFIG.storageKeys.playerName, state.playerName);
                        }

                        localStorage.setItem(CONFIG.storageKeys.playerRoom, state.selectedRoom || "");
                        window.location.replace(redirectTarget);
                        return;
                    }

                    if (!resolvedPlayerName) {
                        UI.showPlayerScreen(false);
                        return;
                    }

                    state.playerName = resolvedPlayerName;
                    localStorage.setItem(CONFIG.storageKeys.playerName, state.playerName);
                    localStorage.setItem(CONFIG.storageKeys.playerRoom, state.selectedRoom || "");
                    await Flow.enterLobby();
                } catch (error) {
                    console.error("Erro ao iniciar sessão do jogo:", error);
                    UI.showLoginScreen();
                    UI.setStatusMessage(dom.loginMessage, "error", "A sessão foi carregada, mas ocorreu um erro ao iniciar o sistema.");
                }
            });
        }
    };
}
