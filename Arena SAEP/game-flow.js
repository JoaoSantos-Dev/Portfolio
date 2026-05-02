export function createFlow({
    auth,
    db,
    dom,
    state,
    CONFIG,
    Utils,
    UI,
    Audio,
    Timer,
    AuthService,
    RoomService,
    ChallengeService,
    RunService,
    Combo,
    Parser,
    Score,
    createDefaultInventory
}) {
    const AUTH_NOTICE_KEY = "onepieceAuthNotice";
    const SUSPICIOUS_FAST_FINISH_SECONDS = 5 * 60;
    const SUSPICIOUS_NO_ERROR_SECONDS = 8 * 60;

    const getAuthErrorMessage = error => {
        const code = error?.code || "";

        if (code === "auth/email-already-in-use") {
            return "Este e-mail já está em uso.";
        }

        if (code === "auth/invalid-email") {
            return "O e-mail informado é inválido.";
        }

        if (code === "auth/invalid-registration-domain") {
            return "Use um e-mail institucional do SENAI: @edu.sc.senai.br ou @estudante.sc.senai.br.";
        }

        if (code === "auth/weak-password") {
            return "A senha é muito fraca. Use pelo menos 6 caracteres.";
        }

        if (code === "auth/operation-not-allowed") {
            return "O login por e-mail e senha não está habilitado no Firebase Authentication.";
        }

        if (code === "auth/network-request-failed") {
            return "Falha de rede ao falar com o Firebase.";
        }

        if (code === "auth/invalid-credential") {
            return "Credenciais inválidas. Verifique e-mail e senha.";
        }

        if (code === "auth/user-not-found") {
            return "Usuário não encontrado.";
        }

        if (code === "auth/wrong-password") {
            return "Senha incorreta.";
        }

        if (code === "permission-denied" || code === "firestore/permission-denied") {
            return "O usuário foi criado, mas o Firestore bloqueou o salvamento do perfil.";
        }

        return error?.message || "Erro desconhecido.";
    };

    return {
        isNewPersonalRecord(result) {
            const previousBestScore = state.lobbySummary?.bestScore;
            const previousBestTime = state.lobbySummary?.bestTimeSeconds;

            if (previousBestScore === null || previousBestScore === undefined) {
                return true;
            }

            if (result.score > previousBestScore) {
                return true;
            }

            if (result.score === previousBestScore && previousBestTime !== null && previousBestTime !== undefined) {
                return result.elapsedSeconds < previousBestTime;
            }

            return false;
        },

        buildFinalFeedback(result, insights, flags = {}) {
            const messages = [];

            if (flags.isNewRecord) {
                messages.push("Novo recorde pessoal!");
            }

            if (flags.roomImproved) {
                messages.push("Sua sala subiu no ranking!");
            }

            if (state.errorCount <= 2) {
                messages.push("Você concluiu com poucos erros!");
            } else if (state.errorCount >= 7) {
                messages.push("Boa tentativa. Agora tente reduzir seus erros.");
            }

            if (result.elapsedSeconds <= 240) {
                messages.push("Tempo forte. Você terminou a jornada com ritmo de destaque.");
            } else {
                messages.push("Boa tentativa, agora tente melhorar seu tempo.");
            }

            if (!insights.individualRank) {
                messages.push("Sua primeira marca já está pronta para entrar no ranking.");
            }

            return messages.slice(0, 4);
        },

        getUnlockedTitles(previousTitles = [], nextTitles = []) {
            const previousSet = new Set(Array.isArray(previousTitles) ? previousTitles : []);
            return (Array.isArray(nextTitles) ? nextTitles : []).filter(title => !previousSet.has(title));
        },

        updateLobbyChallengeState(availability) {
            if (!dom.lobbyChallengeStatus || !dom.startMatchButton) {
                return;
            }

            const challenge = availability?.challenge || null;
            const formattedWindow = challenge
                ? ` até ${new Date(challenge.fimEm).toLocaleString("pt-BR")}`
                : "";

            let statusClass = "info";
            let message = "Não há desafio disponível no momento. Aguarde o próximo desafio.";
            let buttonLabel = "Aguardar desafio";
            let disabled = true;

            if (availability?.state === "novo") {
                statusClass = "success";
                message = `Desafio disponível agora. Você pode iniciar sua tentativa única${formattedWindow}.`;
                buttonLabel = "Começar desafio";
                disabled = false;
            } else if (availability?.state === "retomar") {
                statusClass = "info";
                message = `Você já começou o desafio atual. Continue de onde parou${formattedWindow}.`;
                buttonLabel = "Continuar desafio";
                disabled = false;
            } else if (availability?.state === "concluido") {
                statusClass = "success";
                message = "Você já concluiu o desafio atual. Aguarde o próximo desafio.";
                buttonLabel = "Desafio concluído";
                disabled = true;
            } else if (availability?.state === "expirado") {
                statusClass = "error";
                message = "O prazo do desafio atual já terminou. Aguarde o próximo.";
                buttonLabel = "Prazo encerrado";
                disabled = true;
            }

            dom.lobbyChallengeStatus.className = `status ${statusClass}`;
            dom.lobbyChallengeStatus.textContent = message;
            dom.startMatchButton.textContent = buttonLabel;
            dom.startMatchButton.disabled = disabled;
        },

        restoreParticipationState(challenge, participation) {
            const difficulty = participation?.dificuldade;
            const restoredDifficulty = CONFIG.difficulty[difficulty] ? difficulty : state.selectedDifficulty;
            const savedLives = Number(participation?.vidasRestantes);
            const savedErrors = Number(participation?.errosQuestoes ?? participation?.erros);
            const savedRiddleErrors = Number(participation?.errosCharada);
            const savedScorePenalty = Number(participation?.penalidadePontuacao);
            const savedExtraLives = Number(participation?.vidasExtrasUsadas);
            const savedProgress = Number(participation?.progressoAtual);
            const savedQuestionIndex = participation?.currentQuestionIndex;
            const savedElapsedSeconds = Number(participation?.tempoSegundos);

            state.currentChallenge = challenge;
            state.currentParticipation = participation;
            state.selectedRoom = participation?.salaId || state.selectedRoom;
            state.selectedDifficulty = restoredDifficulty;
            state.questions = Array.isArray(participation?.perguntas) ? participation.perguntas : [];
            state.riddles = Array.isArray(participation?.charadas) ? participation.charadas : [];
            state.errorCount = Number.isFinite(savedErrors) ? savedErrors : 0;
            state.riddleErrorCount = Number.isFinite(savedRiddleErrors) ? savedRiddleErrors : 0;
            state.scorePenaltyPoints = Number.isFinite(savedScorePenalty)
                ? savedScorePenalty
                : (state.errorCount * CONFIG.scoring.answerErrorPenalty);
            state.extraLifeCount = Number.isFinite(savedExtraLives) ? savedExtraLives : 0;
            state.remainingLives = Number.isFinite(savedLives)
                ? savedLives
                : Utils.getDifficultyConfig().initialLives;
            state.unlockedQuestionIndex = Number.isFinite(savedProgress) && savedProgress >= 0
                ? savedProgress
                : 0;
            state.currentQuestionIndex = Number.isInteger(savedQuestionIndex)
                ? savedQuestionIndex
                : (Number.isInteger(Number(savedQuestionIndex)) ? Number(savedQuestionIndex) : null);
            state.inventory = {
                ...createDefaultInventory(),
                ...(participation?.itens || {})
            };
            state.answerHistory = Array.isArray(participation?.respostas) ? participation.respostas : [];
            state.shieldActive = Boolean(participation?.escudoAtivo);
            state.extraHintVisible = Boolean(participation?.extraHintVisible);
            state.currentQuestionLupaUsed = false;
            state.pausedElapsedMs = 0;
            state.pauseStartedAt = null;
            state.rewardInProgress = false;
            state.scoreSaved = participation?.status === "concluido";
            state.gameStartTime = Number.isFinite(savedElapsedSeconds) && savedElapsedSeconds > 0
                ? Date.now() - (savedElapsedSeconds * 1000)
                : null;

            if (state.questions.length > 0) {
                state.unlockedQuestionIndex = Math.max(
                    0,
                    Math.min(state.unlockedQuestionIndex, state.questions.length - 1)
                );

                if (state.currentQuestionIndex !== null) {
                    state.currentQuestionIndex = Math.max(
                        0,
                        Math.min(state.currentQuestionIndex, state.questions.length - 1)
                    );
                }
            } else {
                state.unlockedQuestionIndex = 0;
                state.currentQuestionIndex = null;
            }
        },

        async login() {
            const email = dom.loginEmailInput.value.trim();
            const password = dom.loginPasswordInput.value;

            if (!email || !password) {
                UI.setStatusMessage(dom.loginMessage, "error", "Preencha e-mail e senha para entrar.");
                return;
            }

            UI.setStatusMessage(dom.loginMessage, "info", "Entrando...");

            try {
                const user = await AuthService.signIn(email, password);
                await AuthService.reloadUser(user);
                let profile = await AuthService.loadProfile(user.uid);
                profile = await AuthService.syncEmailVerificationApproval(user, profile);

                if (AuthService.requiresEmailVerification(profile) && !AuthService.isVerifiedUser(user)) {
                    UI.setStatusMessage(
                        dom.loginMessage,
                        "info",
                        "Confirme seu e-mail para acessar a plataforma. Verifique sua caixa de entrada e depois tente entrar novamente."
                    );
                    sessionStorage.setItem(
                        AUTH_NOTICE_KEY,
                        "info::Confirme seu e-mail para acessar a plataforma. Verifique sua caixa de entrada e depois tente entrar novamente."
                    );
                    await AuthService.signOutUser();
                    return;
                }

                const approvalStatus = AuthService.getApprovalStatus(profile);

                if (approvalStatus !== "aprovado") {
                    UI.setStatusMessage(
                        dom.loginMessage,
                        approvalStatus === "recusado" ? "error" : "info",
                        approvalStatus === "recusado"
                            ? "Seu cadastro foi recusado. Fale com a equipe responsável."
                            : "Cadastro recebido. Aguarde a confirmação da equipe para acessar a plataforma."
                    );
                    sessionStorage.setItem(
                        AUTH_NOTICE_KEY,
                        approvalStatus === "recusado"
                            ? "error::Seu cadastro foi recusado. Fale com a equipe responsável."
                            : "info::Cadastro recebido. Aguarde a confirmação da equipe para acessar a plataforma."
                    );
                    await AuthService.signOutUser();
                    return;
                }

                dom.loginPasswordInput.value = "";
                UI.setStatusMessage(dom.loginMessage, "success", "Sessão iniciada com sucesso.");
            } catch (error) {
                console.error("Erro ao fazer login:", error);
                UI.setStatusMessage(dom.loginMessage, "error", getAuthErrorMessage(error));
            }
        },

        async resendVerificationEmail() {
            const email = dom.loginEmailInput.value.trim();
            const password = dom.loginPasswordInput.value;

            if (!email || !password) {
                UI.setStatusMessage(dom.loginMessage, "error", "Informe e-mail e senha para reenviar a confirmação.");
                return;
            }

            UI.setStatusMessage(dom.loginMessage, "info", "Reenviando e-mail de confirmação...");

            try {
                const user = await AuthService.signIn(email, password);
                await AuthService.reloadUser(user);

                if (AuthService.isVerifiedUser(user)) {
                    UI.setStatusMessage(dom.loginMessage, "success", "Este e-mail já foi confirmado. Agora basta entrar normalmente.");
                    await AuthService.signOutUser();
                    return;
                }

                await AuthService.sendVerificationEmail(user);
                await AuthService.signOutUser();
                UI.setStatusMessage(
                    dom.loginMessage,
                    "success",
                    "E-mail de confirmação reenviado. Verifique sua caixa de entrada e depois tente entrar novamente."
                );
            } catch (error) {
                console.error("Erro ao reenviar e-mail de confirmação:", error);
                UI.setStatusMessage(dom.loginMessage, "error", getAuthErrorMessage(error));
            }
        },

        async register() {
            const name = dom.registerNameInput.value.trim();
            const email = dom.registerEmailInput.value.trim();
            const password = dom.registerPasswordInput.value;

            if (name.length < 2) {
                UI.setStatusMessage(dom.registerMessage, "error", "Digite um nome de acesso com pelo menos 2 caracteres.");
                return;
            }

            if (!email || !password) {
                UI.setStatusMessage(dom.registerMessage, "error", "Preencha e-mail e senha para cadastrar.");
                return;
            }

            if (password.length < 6) {
                UI.setStatusMessage(dom.registerMessage, "error", "A senha precisa ter pelo menos 6 caracteres.");
                return;
            }

            UI.setStatusMessage(dom.registerMessage, "info", "Criando usuário...");

            try {
                const result = await AuthService.register({
                    name,
                    email,
                    password,
                    room: state.selectedRoom
                });
                dom.registerPasswordInput.value = "";
                sessionStorage.setItem(
                    AUTH_NOTICE_KEY,
                    result.profileSaved
                        ? (result.verificationSent
                            ? "success::Cadastro enviado com sucesso. Confirme seu e-mail e aguarde a aprovação da equipe para entrar."
                            : "info::Cadastro criado, mas não foi possível enviar o e-mail de confirmação. Tente entrar novamente mais tarde.")
                        : "info::Cadastro criado, mas o perfil não foi salvo corretamente. Verifique as regras do Firestore."
                );
                UI.setStatusMessage(
                    dom.registerMessage,
                    result.profileSaved ? "success" : "info",
                    result.profileSaved
                        ? (result.verificationSent
                            ? "Cadastro enviado com sucesso. Confirme seu e-mail e aguarde a aprovação da equipe."
                            : "Cadastro criado, mas o e-mail de confirmação não pôde ser enviado agora.")
                        : "Cadastro criado, mas o perfil não foi salvo corretamente. Verifique as regras do Firestore."
                );
                await AuthService.signOutUser();
            } catch (error) {
                console.error("Erro ao registrar usuário:", error);
                UI.setStatusMessage(dom.registerMessage, "error", getAuthErrorMessage(error));
            }
        },

        async logout() {
            await RunService.sync();
            this.resetRunState();
            localStorage.removeItem(CONFIG.storageKeys.playerName);
            localStorage.removeItem(CONFIG.storageKeys.playerRoom);
            await AuthService.signOutUser();
        },

        applyDifficulty(difficultyKey) {
            state.selectedDifficulty = CONFIG.difficulty[difficultyKey] ? difficultyKey : "normal";
            state.remainingLives = Utils.getDifficultyConfig().initialLives;
            UI.updateDifficulty();
            UI.updateLives();
        },

        applyRoom(roomKey) {
            const roomExists = state.rooms.some(room => room.id === roomKey);
            state.selectedRoom = roomExists ? roomKey : (state.rooms[0]?.id || null);
            UI.updateRoom();
        },

        registerError(scorePenalty = CONFIG.scoring.answerErrorPenalty) {
            state.errorCount += 1;
            state.scorePenaltyPoints += scorePenalty;
            UI.updateErrors();
            Combo.reset();
            RunService.sync({
                erros: state.errorCount,
                errosQuestoes: state.errorCount,
                penalidadePontuacao: state.scorePenaltyPoints
            });
        },

        registerRiddleError() {
            state.riddleErrorCount += 1;
            RunService.sync({
                errosCharada: state.riddleErrorCount
            });
        },

        registerAnswerAttempt(selectedOptionId, isCorrect, currentQuestion) {
            if (!currentQuestion) {
                return;
            }

            const selectedOption = currentQuestion.options.find(option => option.id === selectedOptionId) || null;
            const correctOption = currentQuestion.options.find(option => option.id === currentQuestion.correct) || null;

            state.answerHistory.push({
                challengeId: state.currentChallenge?.id || null,
                questionNumber: Utils.getCurrentQuestionNumber(),
                title: currentQuestion.title || "",
                question: currentQuestion.question || "",
                selectedOptionId,
                selectedOptionText: selectedOption?.text || "",
                correctOptionId: currentQuestion.correct || "",
                correctOptionText: correctOption?.text || "",
                options: currentQuestion.options.map(option => ({
                    id: option.id,
                    text: option.text
                })),
                isCorrect,
                elapsedSeconds: Utils.getElapsedSeconds(),
                answeredAt: new Date().toISOString()
            });
        },

        getSuspiciousBehaviorPayload(result) {
            const motivos = [];

            if (result.elapsedSeconds < SUSPICIOUS_FAST_FINISH_SECONDS) {
                motivos.push({
                    codigo: "tempo_menor_5_min",
                    descricao: "Concluiu o desafio em menos de 5 minutos."
                });
            }

            if (result.elapsedSeconds < SUSPICIOUS_NO_ERROR_SECONDS && state.errorCount === 0) {
                motivos.push({
                    codigo: "tempo_menor_8_min_sem_erros",
                    descricao: "Concluiu em menos de 8 minutos sem erros de questão."
                });
            }

            const isSuspicious = motivos.length > 0;

            return {
                comportamentoSuspeito: isSuspicious,
                comportamentoSuspeitoMotivos: motivos,
                comportamentoSuspeitoRegistradoEm: isSuspicious ? new Date().toISOString() : null,
                respostasSuspeitas: isSuspicious ? state.answerHistory : []
            };
        },

        addExtraLife() {
            state.extraLifeCount += 1;
            state.remainingLives += 1;

            if (state.gameStartTime) {
                state.gameStartTime -= CONFIG.scoring.extraLifePenaltySeconds * 1000;
            }

            UI.refreshPlayerPanel();
            UI.setStatusMessage(dom.codeMessage, "info", "Vida extra ativada. Você recebeu +1 vida, mas ganhou uma penalidade de 30 segundos no tempo.", "status-pop");
            RunService.sync({
                vidasRestantes: state.remainingLives,
                vidasExtrasUsadas: state.extraLifeCount,
                tempoSegundos: Utils.getElapsedSeconds()
            });
        },

        async loadQuestions(questionCount = CONFIG.gameplay.questionsPerRun) {
            try {
                const cacheKey = Date.now();
                const [questionsResponse, riddlesResponse] = await Promise.all([
                    fetch("questoes.txt?ts=" + cacheKey),
                    fetch("charadas.txt?ts=" + cacheKey)
                ]);

                if (!questionsResponse.ok) {
                    throw new Error("Não foi possível ler o arquivo questoes.txt.");
                }

                if (!riddlesResponse.ok) {
                    throw new Error("Não foi possível ler o arquivo charadas.txt.");
                }

                const [questionsText, riddlesText] = await Promise.all([
                    questionsResponse.text(),
                    riddlesResponse.text()
                ]);

                const parsedQuestions = Parser.parseQuestions(questionsText);
                const parsedRiddles = Parser.parseRiddles(riddlesText);
                const targetCount = Math.max(1, Math.min(questionCount, parsedQuestions.length));
                const selectedQuestions = Utils.takeRandomItems(parsedQuestions, targetCount);

                state.questions = selectedQuestions;
                state.riddles = Utils.buildRiddleSequence(state.questions.length, parsedRiddles);
                dom.finalText.textContent = `Todas as ${state.questions.length} questões foram respondidas corretamente.`;
                return true;
            } catch (error) {
                const detail = error instanceof Error ? error.message : "Erro desconhecido ao carregar os arquivos.";
                dom.loadingMessage.className = "status error";
                dom.loadingMessage.innerHTML = `
                    Erro ao carregar os arquivos do jogo.
                    <br />
                    <small>${detail}</small>
                    <br />
                    <small>Verifique se <code>questoes.txt</code> e <code>charadas.txt</code> estão na mesma pasta e se você abriu o sistema por um servidor local.</small>
                `;
                console.error(error);
                return false;
            }
        },

        async enterLobby() {
            state.pendingStartAvailability = null;
            UI.closeTitleUnlockOverlay();
            UI.showLobbyScreen();
            UI.setStatusMessage(dom.lobbyMessage, "info", "Carregando seu resumo...");

            try {
                const [summary, availability] = state.authUser
                    ? await Promise.all([
                        AuthService.getUserGameInsights(state.authUser.uid, state.selectedRoom),
                        ChallengeService.getAvailableChallengeForUser(state.authUser.uid)
                    ])
                    : [{
                        bestScore: null,
                        bestTimeSeconds: null,
                        matchesPlayed: 0,
                        lastMatch: null,
                        roomPosition: null,
                        individualRank: null
                    }, {
                        state: "sem_desafio",
                        challenge: null,
                        participation: null
                    }];

                state.lobbySummary = summary;
                UI.updateLobby(summary);
                this.updateLobbyChallengeState(availability);
                dom.lobbyMessage.innerHTML = "";
            } catch (error) {
                console.error("Erro ao carregar resumo do lobby:", error);
                state.lobbySummary = {
                    bestScore: null,
                    bestTimeSeconds: null,
                    matchesPlayed: 0,
                    lastMatch: null,
                    roomPosition: null,
                    individualRank: null
                };
                UI.updateLobby(state.lobbySummary);
                this.updateLobbyChallengeState({
                    state: "sem_desafio",
                    challenge: null,
                    participation: null
                });
                UI.setStatusMessage(dom.lobbyMessage, "error", "Não foi possível carregar seu histórico agora.");
            }
        },

        async beginMatchWithAvailability(availability) {
            this.resetRunState();
            state.currentChallenge = availability.challenge;
            state.remainingLives = Utils.getDifficultyConfig().initialLives;
            UI.showGameContent();
            UI.showOnlyScreen(dom.loadingScreen);
            dom.loadingMessage.className = "status info";
            dom.loadingMessage.innerHTML = availability.state === "retomar"
                ? "Carregando seu progresso salvo..."
                : "Preparando desafio...";

            if (availability.state === "retomar" && availability.participation) {
                this.restoreParticipationState(availability.challenge, availability.participation);

                if (state.questions.length === 0 || state.riddles.length === 0) {
                    const restoredQuestions = await this.loadQuestions(availability.challenge.quantidadeQuestoes);

                    if (!restoredQuestions) {
                        return;
                    }

                    await ChallengeService.updateParticipation(availability.participation.id, {
                        perguntas: state.questions,
                        charadas: state.riddles
                    });
                    availability.participation.perguntas = state.questions;
                    availability.participation.charadas = state.riddles;
                    state.currentParticipation.perguntas = state.questions;
                    state.currentParticipation.charadas = state.riddles;
                }

                RunService.beginTracking(state.currentParticipation || availability.participation);
                UI.showGameContent();

                if (availability.participation.telaAtual === "questao" && state.currentQuestionIndex !== null) {
                    UI.renderQuestion();
                    UI.setStatusMessage(dom.answerMessage, "info", "Desafio retomado. Continue a questão atual.", "status-pop");
                } else {
                    UI.showStartScreen();
                    UI.setStatusMessage(dom.codeMessage, "info", "Desafio retomado. Continue pela etapa em que você parou.", "status-pop");
                    dom.codeInput.focus();
                }

                return;
            }

            const questionsLoaded = await this.loadQuestions(availability.challenge.quantidadeQuestoes);

            if (!questionsLoaded) {
                return;
            }

            const now = new Date().toISOString();
            const payload = {
                desafioId: availability.challenge.id,
                nome: state.playerName,
                salaId: state.selectedRoom,
                uid: state.authUser?.uid || null,
                email: state.authUser?.email || null,
                iniciadoEm: now,
                concluidoEm: null,
                status: "em_andamento",
                dificuldade: state.selectedDifficulty,
                erros: state.errorCount,
                errosQuestoes: state.errorCount,
                errosCharada: state.riddleErrorCount,
                penalidadePontuacao: state.scorePenaltyPoints,
                vidasRestantes: state.remainingLives,
                vidasExtrasUsadas: state.extraLifeCount,
                progressoAtual: state.unlockedQuestionIndex,
                questaoAtual: 1,
                currentQuestionIndex: null,
                telaAtual: "codigo",
                tempoSegundos: 0,
                totalQuestoes: state.questions.length,
                itens: state.inventory,
                escudoAtivo: state.shieldActive,
                perguntas: state.questions,
                charadas: state.riddles,
                respostas: state.answerHistory
            };
            const participationId = await ChallengeService.createParticipation(payload);
            const participation = {
                id: participationId,
                participacaoId: participationId,
                ...payload
            };

            state.currentParticipation = participation;
            RunService.beginTracking(participation);
            UI.showStartScreen();
            UI.setStatusMessage(dom.codeMessage, "info", "Desafio iniciado. Digite o código da etapa atual.");
            dom.codeInput.focus();
        },

        async startMatch() {
            if (!state.authUser) {
                UI.showLoginScreen();
                UI.setStatusMessage(dom.loginMessage, "error", "Faça login para iniciar um desafio.");
                return;
            }

            let availability = null;

            try {
                availability = await ChallengeService.getAvailableChallengeForUser(state.authUser.uid);
                this.updateLobbyChallengeState(availability);
            } catch (error) {
                console.error("Erro ao verificar desafio atual:", error);
                await this.enterLobby();
                UI.setStatusMessage(dom.lobbyMessage, "error", "Não foi possível verificar o desafio atual.");
                return;
            }

            if (!availability?.challenge || availability.state === "sem_desafio") {
                await this.enterLobby();
                UI.setStatusMessage(dom.lobbyMessage, "info", "Não há desafio disponível no momento. Aguarde o próximo desafio.");
                return;
            }

            if (availability.state === "concluido") {
                await this.enterLobby();
                UI.setStatusMessage(dom.lobbyMessage, "success", "Você já concluiu o desafio atual. Aguarde o próximo desafio.");
                return;
            }

            if (availability.state === "expirado") {
                await this.enterLobby();
                UI.setStatusMessage(dom.lobbyMessage, "error", "O prazo do desafio atual já terminou. Aguarde o próximo.");
                return;
            }

            if (availability.state === "retomar") {
                state.pendingStartAvailability = null;
                await this.beginMatchWithAvailability(availability);
                return;
            }

            if (availability.state !== "novo") {
                return;
            }

            state.pendingStartAvailability = availability;
            state.selectedDifficulty = "normal";
            state.remainingLives = Utils.getDifficultyConfig().initialLives;
            UI.showDifficultyScreen();
        },

        async confirmDifficultyAndStart() {
            const availability = state.pendingStartAvailability;

            if (!availability?.challenge) {
                await this.enterLobby();
                UI.setStatusMessage(dom.lobbyMessage, "error", "Não há um desafio pendente para iniciar.");
                return;
            }

            state.pendingStartAvailability = null;
            await this.beginMatchWithAvailability(availability);
        },

        openQuestionByCode() {
            if (state.rewardInProgress) {
                return;
            }

            const typedCode = Utils.normalizeCode(dom.codeInput.value);
            dom.codeMessage.innerHTML = "";
            dom.answerMessage.innerHTML = "";

            const expectedQuestion = Utils.getExpectedQuestion();
            const currentRiddle = Utils.getCurrentRiddle();

            if (!expectedQuestion || !currentRiddle) {
                UI.setStatusMessage(dom.codeMessage, "error", "Nenhuma questão disponível no momento.");
                return;
            }

            if (!typedCode) {
                UI.setStatusMessage(dom.codeMessage, "error", "Digite um código para continuar.");
                return;
            }

            if (typedCode !== currentRiddle.answer) {
                this.registerRiddleError();
                UI.setStatusMessage(dom.codeMessage, "error", "Código inválido para esta etapa. Encontre o código correto para continuar.");
                return;
            }

            Timer.ensureStarted();
            state.currentQuestionIndex = state.unlockedQuestionIndex;
            RunService.sync({ questaoAtual: state.currentQuestionIndex + 1 });
            UI.renderQuestion();
        },

        handleShieldedError(selectedButton) {
            state.shieldActive = false;

            if (selectedButton) {
                selectedButton.classList.add("wrong-shake");
            }

            Audio.error();
            UI.flashBody("body-error-flash");
            UI.setStatusMessage(dom.answerMessage, "info", "Escudo consumido. Esse erro foi anulado e você continua na questão.", "status-pop");
            RunService.sync({ escudoAtivo: state.shieldActive, itens: state.inventory });
            UI.refreshPlayerPanel();
        },

        handleQuestionFailure(selectedButton) {
            if (state.shieldActive) {
                this.handleShieldedError(selectedButton);
                return;
            }

            if (selectedButton) {
                selectedButton.classList.add("wrong-shake");
            }

            Audio.error();
            UI.flashBody("body-error-flash");
            this.registerError();
            state.remainingLives -= 1;
            UI.updateLives();

            window.setTimeout(() => {
                dom.questionScreen.classList.add("hidden");
                dom.startScreen.classList.remove("hidden");
                dom.codeInput.value = "";
                state.currentQuestionIndex = null;

                if (state.remainingLives <= 0) {
                    state.unlockedQuestionIndex = 0;
                    state.remainingLives = Utils.getDifficultyConfig().initialLives;
                    UI.updateCodeStep();
                    UI.updateJourneyProgress();
                    UI.updateLives();
                    UI.setStatusMessage(dom.codeMessage, "error", "Suas vidas acabaram. Você voltou para o início da jornada com as vidas restauradas.", "status-pop");
                    UI.animateScreen(dom.startScreen);
                    RunService.sync({
                        questaoAtual: 1,
                        vidasRestantes: state.remainingLives
                    });
                    return;
                }

                UI.updateCodeStep();
                UI.updateJourneyProgress();
                UI.showLifeChoiceMessage();
                UI.animateScreen(dom.startScreen);
                RunService.sync({
                    questaoAtual: state.unlockedQuestionIndex + 1,
                    vidasRestantes: state.remainingLives
                });
            }, 420);
        },

        handleQuestionSuccess(selectedButton) {
            if (selectedButton) {
                selectedButton.classList.add("correct-pulse");
            }

            Audio.success();
            UI.flashBody("body-success-flash");
            Combo.registerCorrectAnswer();

            if (state.currentQuestionIndex === state.questions.length - 1) {
                window.setTimeout(() => {
                    this.finishGame();
                }, 360);
                return;
            }

            state.unlockedQuestionIndex = state.currentQuestionIndex + 1;
            UI.updateJourneyProgress();

            window.setTimeout(() => {
                dom.questionScreen.classList.add("hidden");
                dom.startScreen.classList.remove("hidden");
                dom.codeInput.value = "";
                state.extraHintVisible = false;
                UI.setStatusMessage(dom.codeMessage, "info", "Resposta correta. Agora decifre a charada e digite o próximo código.", "status-pop");
                UI.updateCodeStep();
                UI.animateScreen(dom.startScreen);
                dom.codeInput.focus();
                RunService.sync({ questaoAtual: state.unlockedQuestionIndex + 1 });
            }, 360);
        },

        handleAnswer(selectedOptionId) {
            if (state.rewardInProgress) {
                return;
            }

            const current = Utils.getCurrentQuestion();
            const isCorrect = selectedOptionId === current.correct;
            const selectedButton = Array.from(dom.optionsContainer.querySelectorAll(".option"))
                .find(button => button.dataset.optionId === selectedOptionId);

            this.registerAnswerAttempt(selectedOptionId, isCorrect, current);

            if (!isCorrect) {
                this.handleQuestionFailure(selectedButton);
                return;
            }

            this.handleQuestionSuccess(selectedButton);
        },

        async saveScore(result) {
            if (state.scoreSaved) {
                return true;
            }

            state.scoreSaved = true;
            UI.setStatusMessage(dom.saveStatus, "success", "Pontuação salva com sucesso no desafio.");
            state.currentParticipation = {
                ...(state.currentParticipation || {}),
                pontuacao: result.score,
                tempoSegundos: result.elapsedSeconds,
                erros: state.errorCount,
                errosQuestoes: state.errorCount,
                errosCharada: state.riddleErrorCount,
                penalidadePontuacao: state.scorePenaltyPoints
            };
            return true;
        },

        async finishGame() {
            Timer.stopInterval();
            const result = Score.calculate();
            const performance = Utils.getPerformanceProfile(result);
            const previousRoomPosition = state.lobbySummary?.roomPosition ?? null;
            const previousTitles = Array.isArray(state.lobbySummary?.titles) ? state.lobbySummary.titles : [];
            const isNewRecord = this.isNewPersonalRecord(result);
            const suspiciousBehavior = this.getSuspiciousBehaviorPayload(result);
            const alreadyUnderReview = state.authProfile?.emAnalise === true;
            const isUnderReview = suspiciousBehavior.comportamentoSuspeito === true || alreadyUnderReview;

            if (alreadyUnderReview && !suspiciousBehavior.comportamentoSuspeito) {
                suspiciousBehavior.pontuacaoBloqueadaPorAnalise = true;
                suspiciousBehavior.analiseUsuarioPendente = true;
            }

            UI.showOnlyScreen(dom.finalScreen);
            dom.finalPlayerName.textContent = state.playerName;
            dom.finalScore.textContent = result.score.toString();
            dom.finalTime.textContent = Utils.formatElapsedTime(result.elapsedSeconds);
            dom.finalErrors.textContent = state.errorCount.toString();
            dom.finalContribution.textContent = result.score.toString();
            dom.finalPersonalRecord.textContent = "Calculando...";
            dom.finalIndividualRank.textContent = "Calculando...";
            dom.finalRoomRank.textContent = "Calculando...";
            dom.finalFeedbackList.innerHTML = "";
            dom.finalPerformanceTitle.textContent = performance.title;
            dom.finalPerformanceDescription.textContent = performance.description;
            UI.updateJourneyProgress();
            UI.animateScreen(dom.finalScreen);

            await RunService.finalize("concluido", {
                tempoSegundos: result.elapsedSeconds,
                erros: state.errorCount,
                errosQuestoes: state.errorCount,
                errosCharada: state.riddleErrorCount,
                penalidadePontuacao: state.scorePenaltyPoints,
                dificuldade: state.selectedDifficulty,
                sala: state.selectedRoom,
                vidasRestantes: state.remainingLives,
                vidasExtrasUsadas: state.extraLifeCount,
                questaoAtual: state.questions.length,
                pontuacao: result.score,
                progressoAtual: state.questions.length - 1,
                currentQuestionIndex: state.questions.length - 1,
                telaAtual: "resultado",
                respostas: state.answerHistory,
                ...suspiciousBehavior
            });

            if (suspiciousBehavior.comportamentoSuspeito && state.authUser) {
                try {
                    await AuthService.updateUserProfile(state.authUser.uid, {
                        emAnalise: true,
                        analiseDesde: new Date().toISOString(),
                        analiseMotivo: "desempenho_fora_do_padrao"
                    });

                    if (state.authProfile) {
                        state.authProfile.emAnalise = true;
                        state.authProfile.analiseDesde = new Date().toISOString();
                        state.authProfile.analiseMotivo = "desempenho_fora_do_padrao";
                    }
                } catch (error) {
                    console.error("Erro ao marcar usuário em análise:", error);
                }
            }

            const scoreSaved = await this.saveScore(result);
            let insights = null;

            if (scoreSaved && state.authUser && !isUnderReview) {
                try {
                    await AuthService.updateRankingCacheWithResult({
                        uid: state.authUser.uid,
                        nome: state.playerName || state.authProfile?.nomeJogador || state.authProfile?.nomeAcesso,
                        sala: state.selectedRoom,
                        pontuacao: result.score,
                        tempoSegundos: result.elapsedSeconds,
                        erros: state.errorCount,
                        concluidoEm: new Date().toISOString()
                    });
                    insights = await AuthService.getUserGameInsights(state.authUser.uid, state.selectedRoom);
                    state.resultSummary = insights;
                    state.lobbySummary = insights;
                } catch (error) {
                    console.error("Erro ao carregar resumo final da partida:", error);
                }
            }

            const roomImproved = Boolean(
                previousRoomPosition &&
                insights?.roomPosition &&
                insights.roomPosition < previousRoomPosition
            );
            const feedbackMessages = this.buildFinalFeedback(result, insights || {}, {
                isNewRecord,
                roomImproved
            });
            const unlockedTitles = this.getUnlockedTitles(previousTitles, insights?.titles || []);

            if (isUnderReview) {
                dom.finalText.innerHTML = "<strong>Resultado recebido</strong><br />Sua tentativa foi registrada com sucesso. Como o sistema identificou um desempenho fora do padrão esperado para esta atividade, sua pontuação ficará temporariamente em análise pelo professor antes de ser liberada.";
            } else {
                dom.finalText.textContent = `Você concluiu as ${state.questions.length} questões e sua pontuação agora conta para a sala ${Utils.getRoomLabel()}.`;
            }
            dom.finalContribution.textContent = result.score.toString();
            dom.finalPersonalRecord.textContent = isNewRecord
                ? "Novo recorde pessoal!"
                : (insights?.bestScore ? `Seu recorde é ${insights.bestScore}` : "Sem recorde ainda");
            dom.finalIndividualRank.textContent = insights?.individualRank
                ? `${insights.individualRank}º lugar`
                : "Sem posição ainda";
            dom.finalRoomRank.textContent = insights?.roomPosition
                ? `${insights.roomPosition}º lugar`
                : "Sala ainda sem posição";
            dom.finalFeedbackList.innerHTML = feedbackMessages
                .map(message => `<div class="feedback-pill">${message}</div>`)
                .join("");

            if (unlockedTitles.length > 0) {
                window.setTimeout(() => {
                    UI.showTitleUnlockOverlay(unlockedTitles);
                }, 180);
            }
        },

        resetRunState() {
            Timer.stopInterval();
            UI.closeTitleUnlockOverlay();
            state.questions = [];
            state.currentQuestionIndex = null;
            state.unlockedQuestionIndex = 0;
            state.riddles = [];
            state.errorCount = 0;
            state.riddleErrorCount = 0;
            state.scorePenaltyPoints = 0;
            state.extraLifeCount = 0;
            state.inventory = createDefaultInventory();
            state.shieldActive = false;
            Combo.reset();
            state.currentQuestionLupaUsed = false;
            state.extraHintVisible = false;
            state.pausedElapsedMs = 0;
            state.pauseStartedAt = null;
            state.rewardInProgress = false;
            state.answerHistory = [];
            state.gameStartTime = null;
            state.scoreSaved = false;
            state.pendingStartAvailability = null;
            state.currentRunId = null;
            state.currentRunStatus = "nao_iniciada";
            state.remainingLives = Utils.getDifficultyConfig().initialLives;
            state.resultSummary = null;
            state.currentChallenge = null;
            state.currentParticipation = null;

            dom.rewardOverlay.classList.add("hidden");
            dom.rewardContinueButton.classList.add("hidden");
            dom.rewardItemDescription.textContent = "";
            dom.codeInput.value = "";
            dom.saveStatus.innerHTML = "";
            dom.finalContribution.textContent = "0";
            dom.finalPersonalRecord.textContent = "-";
            dom.finalIndividualRank.textContent = "-";
            dom.finalRoomRank.textContent = "-";
            dom.finalFeedbackList.innerHTML = "";
            localStorage.removeItem(CONFIG.storageKeys.activeRun);
            UI.refreshPlayerPanel();
            UI.updateJourneyProgress();
        },

        async restartGame() {
            await this.startMatch();
        },

        async savePlayer() {
            const typedName = dom.playerNameInput.value.trim();

            if (typedName.length < 2) {
                UI.setStatusMessage(dom.playerNameMessage, "error", "Digite um nome com pelo menos 2 caracteres.");
                return;
            }

            state.playerName = typedName;
            localStorage.setItem(CONFIG.storageKeys.playerName, state.playerName);
            localStorage.setItem(CONFIG.storageKeys.playerRoom, state.selectedRoom);

            if (state.authUser) {
                try {
                    await AuthService.updateOwnProfile(state.authUser.uid, {
                        nomeJogador: state.playerName
                    });

                    if (state.authProfile) {
                        state.authProfile.nomeJogador = state.playerName;
                    }
                } catch (error) {
                    console.error("Erro ao salvar preferências do jogador:", error);
                    UI.setStatusMessage(dom.playerNameMessage, "error", "A conta foi carregada, mas não foi possível salvar seu nome de jogador. Verifique as regras do Firestore.");
                    return;
                }
            }

            state.remainingLives = Utils.getDifficultyConfig().initialLives;
            UI.refreshPlayerPanel();
            await this.enterLobby();
        },

        async changePlayerName() {
            const timerWasRunning = Boolean(state.timerIntervalId);
            Timer.stopInterval();
            const shouldReset = window.confirm("Trocar o nome vai reiniciar a tentativa atual. Deseja continuar?");

            if (!shouldReset) {
                if (state.gameStartTime && timerWasRunning) {
                    Timer.startInterval();
                }
                return;
            }

            await RunService.sync();
            this.resetRunState();
            UI.showPlayerScreen(true);
        },

        openPlayerSetup() {
            UI.showPlayerScreen(true);
        },

        async goBackToLobby() {
            this.resetRunState();
            await this.enterLobby();
        }
    };
}
