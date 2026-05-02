import {
    addDoc,
    collection,
    deleteField,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

function asTimestamp(value) {
    const timestamp = new Date(value || 0).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isWithinWindow(challenge, now = Date.now()) {
    return now >= asTimestamp(challenge.inicioEm) && now <= asTimestamp(challenge.fimEm);
}

function isExpired(challenge, now = Date.now()) {
    return now > asTimestamp(challenge.fimEm);
}

function getDerivedStatus(challenge, now = Date.now()) {
    if (challenge.status === "cancelado") {
        return "cancelado";
    }

    if (challenge.status === "encerrado") {
        return "encerrado";
    }

    if (isExpired(challenge, now)) {
        return "encerrado";
    }

    if (asTimestamp(challenge.inicioEm) > now) {
        return "agendado";
    }

    if (isWithinWindow(challenge, now)) {
        return "ativo";
    }

    return challenge.status || "ativo";
}

function getAnswerOptionText(answer, optionId) {
    const option = Array.isArray(answer.options)
        ? answer.options.find(item => item.id === optionId)
        : null;

    return option?.text || "";
}

function buildAnswerReview(answer) {
    return {
        questionNumber: answer.questionNumber ?? null,
        title: answer.title || "Sem título",
        question: answer.question || "Sem enunciado",
        selectedOptionId: answer.selectedOptionId || "",
        selectedOptionText: answer.selectedOptionText || getAnswerOptionText(answer, answer.selectedOptionId),
        correctOptionId: answer.correctOptionId || "",
        correctOptionText: answer.correctOptionText || getAnswerOptionText(answer, answer.correctOptionId),
        isCorrect: Boolean(answer.isCorrect),
        elapsedSeconds: Number(answer.elapsedSeconds) || null,
        answeredAt: answer.answeredAt || null,
        options: Array.isArray(answer.options) ? answer.options : []
    };
}

function normalizeSuspiciousParticipation(participation) {
    const suspiciousAnswers = Array.isArray(participation.respostasSuspeitas) && participation.respostasSuspeitas.length > 0
        ? participation.respostasSuspeitas
        : (Array.isArray(participation.respostas) ? participation.respostas : []);

    return {
        id: participation.id,
        desafioId: participation.desafioId || null,
        uid: participation.uid || null,
        nome: participation.nome || participation.email || "Sem nome",
        email: participation.email || "-",
        sala: participation.salaId || participation.sala || "sem_sala",
        tempoSegundos: Number(participation.tempoSegundos) || 0,
        pontuacao: Number(participation.pontuacao) || 0,
        erros: Number(participation.errosQuestoes ?? participation.erros) || 0,
        errosCharada: Number(participation.errosCharada) || 0,
        concluidoEm: participation.concluidoEm || participation.atualizadoEm || null,
        registradoEm: participation.comportamentoSuspeitoRegistradoEm || null,
        motivos: Array.isArray(participation.comportamentoSuspeitoMotivos)
            ? participation.comportamentoSuspeitoMotivos
            : [],
        perguntas: Array.isArray(participation.perguntas) ? participation.perguntas : [],
        respostas: suspiciousAnswers.map(buildAnswerReview)
    };
}

export function createChallengeService({ db, CONFIG, AuthService }) {
    const collections = CONFIG.collections;
    const REPORT_AUDIT_DOC_ID = "reportAudit";

    return {
        async markExpiredChallenges() {
            const snapshot = await getDocs(query(
                collection(db, collections.challenges),
                where("status", "==", "ativo")
            ));

            const now = Date.now();
            const expiredChallenges = snapshot.docs
                .map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() }))
                .filter(challenge => isExpired(challenge, now));

            await Promise.all(expiredChallenges.map(challenge => updateDoc(
                doc(db, collections.challenges, challenge.id),
                {
                    status: "encerrado",
                    atualizadoEm: new Date().toISOString()
                }
            )));
        },

        async listChallenges() {
            await this.markExpiredChallenges();

            const [challengesSnapshot, participationsSnapshot] = await Promise.all([
                getDocs(collection(db, collections.challenges)),
                getDocs(collection(db, collections.challengeParticipations))
            ]);

            const participations = participationsSnapshot.docs.map(docSnapshot => ({
                id: docSnapshot.id,
                ...docSnapshot.data()
            }));

            const now = Date.now();

            return challengesSnapshot.docs
                .map(docSnapshot => ({
                    id: docSnapshot.id,
                    ...docSnapshot.data()
                }))
                .sort((first, second) => asTimestamp(second.criadoEm) - asTimestamp(first.criadoEm))
                .map(challenge => {
                    const challengeParticipations = participations.filter(participation => participation.desafioId === challenge.id);

                    return {
                        ...challenge,
                        statusVisual: getDerivedStatus(challenge, now),
                        totalParticipantes: challengeParticipations.length,
                        totalConcluidos: challengeParticipations.filter(participation => participation.status === "concluido").length
                    };
                });
        },

        async getActiveChallenge() {
            await this.markExpiredChallenges();

            const snapshot = await getDocs(query(
                collection(db, collections.challenges),
                where("status", "==", "ativo")
            ));

            const activeChallenge = snapshot.docs
                .map(docSnapshot => ({
                    id: docSnapshot.id,
                    ...docSnapshot.data()
                }))
                .sort((first, second) => {
                    const firstStart = asTimestamp(first.inicioEm);
                    const secondStart = asTimestamp(second.inicioEm);

                    if (firstStart !== secondStart) {
                        return secondStart - firstStart;
                    }

                    return asTimestamp(second.criadoEm) - asTimestamp(first.criadoEm);
                })
                .find(challenge => isWithinWindow(challenge));

            return activeChallenge || null;
        },

        async getChallengeById(challengeId) {
            const snapshot = await getDoc(doc(db, collections.challenges, challengeId));

            if (!snapshot.exists()) {
                return null;
            }

            const challenge = {
                id: snapshot.id,
                ...snapshot.data()
            };

            return {
                ...challenge,
                statusVisual: getDerivedStatus(challenge)
            };
        },

        async createChallenge({ quantidadeQuestoes, inicioEm, fimEm, criadoPor, titulo }) {
            await AuthService.requireAdmin();

            await addDoc(collection(db, collections.challenges), {
                titulo: titulo || `Desafio ${new Date(inicioEm).toLocaleDateString("pt-BR")}`,
                quantidadeQuestoes,
                inicioEm,
                fimEm,
                status: "ativo",
                criadoPor,
                criadoEm: new Date().toISOString(),
                atualizadoEm: new Date().toISOString()
            });
        },

        async cancelChallenge(challengeId) {
            await updateDoc(doc(db, collections.challenges, challengeId), {
                status: "cancelado",
                atualizadoEm: new Date().toISOString()
            });

            await AuthService.rebuildRankingCache();
        },

        async endChallenge(challengeId) {
            await updateDoc(doc(db, collections.challenges, challengeId), {
                status: "encerrado",
                fimEm: new Date().toISOString(),
                atualizadoEm: new Date().toISOString()
            });
        },

        async extendChallenge(challengeId, fimEm) {
            await updateDoc(doc(db, collections.challenges, challengeId), {
                fimEm,
                atualizadoEm: new Date().toISOString()
            });
        },

        async activateChallengeNow(challengeId) {
            const nowIso = new Date().toISOString();

            await updateDoc(doc(db, collections.challenges, challengeId), {
                status: "ativo",
                inicioEm: nowIso,
                atualizadoEm: nowIso
            });
        },

        async getUserParticipation(challengeId, uid) {
            const snapshot = await getDocs(query(
                collection(db, collections.challengeParticipations),
                where("desafioId", "==", challengeId),
                where("uid", "==", uid)
            ));

            if (snapshot.empty) {
                return null;
            }

            const docSnapshot = snapshot.docs[0];
            return {
                id: docSnapshot.id,
                ...docSnapshot.data()
            };
        },

        async createParticipation(payload) {
            const docRef = await addDoc(collection(db, collections.challengeParticipations), {
                ...payload,
                criadoEm: new Date().toISOString(),
                atualizadoEm: new Date().toISOString()
            });

            await updateDoc(docRef, {
                participacaoId: docRef.id
            });

            return docRef.id;
        },

        async updateParticipation(participationId, updates) {
            await updateDoc(doc(db, collections.challengeParticipations, participationId), {
                ...updates,
                atualizadoEm: new Date().toISOString()
            });
        },

        async getAvailableChallengeForUser(uid) {
            const challenge = await this.getActiveChallenge();

            if (!challenge) {
                return {
                    challenge: null,
                    participation: null,
                    state: "sem_desafio"
                };
            }

            const participation = await this.getUserParticipation(challenge.id, uid);

            if (!participation) {
                return {
                    challenge,
                    participation: null,
                    state: "novo"
                };
            }

            if (participation.status === "concluido") {
                return {
                    challenge,
                    participation,
                    state: "concluido"
                };
            }

            if (isExpired(challenge)) {
                if (participation.status !== "expirado") {
                    await this.updateParticipation(participation.id, {
                        status: "expirado"
                    });
                }

                return {
                    challenge,
                    participation: {
                        ...participation,
                        status: "expirado"
                    },
                    state: "expirado"
                };
            }

            return {
                challenge,
                participation,
                state: "retomar"
            };
        },

        async getUserHistory(uid) {
            const [challenges, participationsSnapshot] = await Promise.all([
                this.listChallenges(),
                getDocs(query(
                    collection(db, collections.challengeParticipations),
                    where("uid", "==", uid)
                ))
            ]);

            const participations = participationsSnapshot.docs.map(docSnapshot => ({
                id: docSnapshot.id,
                ...docSnapshot.data()
            }));

            return challenges.map(challenge => {
                const participation = participations.find(item => item.desafioId === challenge.id) || null;
                let statusAluno = "nao_iniciado";

                if (challenge.status === "cancelado") {
                    statusAluno = "cancelado";
                } else if (participation?.status === "concluido") {
                    statusAluno = "concluido";
                } else if (participation?.status === "em_andamento") {
                    statusAluno = isExpired(challenge) ? "expirado" : "em_andamento";
                } else if (participation?.status === "expirado") {
                    statusAluno = "expirado";
                } else if (isExpired(challenge)) {
                    statusAluno = "expirado";
                }

                return {
                    challenge,
                    participation,
                    statusAluno
                };
            });
        },

        async getRankingData() {
            await this.markExpiredChallenges();
            return AuthService.getCachedRankingContext();
        },

        async getReportAudit() {
            const snapshot = await getDoc(doc(db, collections.meta, REPORT_AUDIT_DOC_ID));

            if (!snapshot.exists()) {
                return {
                    totalReports: 0,
                    admins: []
                };
            }

            const data = snapshot.data() || {};
            return {
                totalReports: Number(data.totalReports) || 0,
                admins: Object.values(data.admins || {})
                    .sort((first, second) => (second.totalReports || 0) - (first.totalReports || 0))
            };
        },

        async registerReportGeneration(adminUser) {
            await AuthService.requireAdmin();

            const snapshot = await getDoc(doc(db, collections.meta, REPORT_AUDIT_DOC_ID));
            const currentData = snapshot.exists() ? snapshot.data() || {} : {};
            const admins = { ...(currentData.admins || {}) };
            const adminKey = adminUser?.uid || "desconhecido";
            const existing = admins[adminKey] || {
                uid: adminUser?.uid || null,
                nome: adminUser?.nome || "Administrador",
                totalReports: 0
            };

            admins[adminKey] = {
                uid: adminUser?.uid || existing.uid || null,
                nome: adminUser?.nome || existing.nome || "Administrador",
                totalReports: (Number(existing.totalReports) || 0) + 1
            };

            const nextData = {
                totalReports: (Number(currentData.totalReports) || 0) + 1,
                admins,
                updatedAt: new Date().toISOString()
            };

            await setDoc(doc(db, collections.meta, REPORT_AUDIT_DOC_ID), nextData);

            return {
                totalReports: nextData.totalReports,
                admins: Object.values(admins)
                    .sort((first, second) => (second.totalReports || 0) - (first.totalReports || 0))
            };
        },

        async getQuestionPerformanceReport() {
            await AuthService.requireAdmin();

            await this.markExpiredChallenges();

            const [challengesSnapshot, participationsSnapshot] = await Promise.all([
                getDocs(collection(db, collections.challenges)),
                getDocs(collection(db, collections.challengeParticipations))
            ]);

            const validChallengeIds = new Set(challengesSnapshot.docs
                .map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() }))
                .filter(challenge => challenge.status !== "cancelado")
                .map(challenge => challenge.id));

            const participations = participationsSnapshot.docs
                .map(docSnapshot => ({
                    id: docSnapshot.id,
                    ...docSnapshot.data()
                }))
                .filter(participation => (
                    participation.status === "concluido"
                    && validChallengeIds.has(participation.desafioId)
                ));

            const createQuestionBucket = answer => ({
                title: answer.title || "Sem título",
                question: answer.question || "Sem enunciado",
                totalAnswers: 0,
                correctCount: 0,
                wrongCount: 0
            });
            const buildQuestionKey = answer => `${answer.title || "Sem título"}::${answer.question || "Sem enunciado"}`;
            const finalizeQuestions = questionMap => Array.from(questionMap.values())
                .map(question => ({
                    ...question,
                    accuracyRate: question.totalAnswers > 0
                        ? Math.round((question.correctCount / question.totalAnswers) * 100)
                        : 0
                }))
                .sort((first, second) => {
                    if (second.wrongCount !== first.wrongCount) {
                        return second.wrongCount - first.wrongCount;
                    }

                    return first.accuracyRate - second.accuracyRate;
                });
            const filterHardestQuestions = questions => questions
                .filter(question => question.accuracyRate <= 59)
                .sort((first, second) => {
                    if (second.wrongCount !== first.wrongCount) {
                        return second.wrongCount - first.wrongCount;
                    }

                    return first.accuracyRate - second.accuracyRate;
                });
            const filterEasiestQuestions = questions => questions
                .filter(question => question.accuracyRate > 40)
                .sort((first, second) => {
                    if (second.accuracyRate !== first.accuracyRate) {
                        return second.accuracyRate - first.accuracyRate;
                    }

                    return second.correctCount - first.correctCount;
                });

            const questionMap = new Map();
            const roomQuestionMaps = new Map();
            let participationsWithDetails = 0;
            let participationsWithoutDetails = 0;
            let totalAnswers = 0;

            participations.forEach(participation => {
                const answers = Array.isArray(participation.respostas) ? participation.respostas : [];

                if (answers.length === 0) {
                    participationsWithoutDetails += 1;
                    return;
                }

                participationsWithDetails += 1;

                answers.forEach(answer => {
                    const key = buildQuestionKey(answer);
                    const current = questionMap.get(key) || createQuestionBucket(answer);
                    const roomId = participation.salaId || participation.sala || "sem_sala";
                    const roomQuestionMap = roomQuestionMaps.get(roomId) || new Map();
                    const roomCurrent = roomQuestionMap.get(key) || createQuestionBucket(answer);

                    current.totalAnswers += 1;
                    if (answer.isCorrect) {
                        current.correctCount += 1;
                    } else {
                        current.wrongCount += 1;
                    }

                    roomCurrent.totalAnswers += 1;
                    if (answer.isCorrect) {
                        roomCurrent.correctCount += 1;
                    } else {
                        roomCurrent.wrongCount += 1;
                    }

                    questionMap.set(key, current);
                    roomQuestionMap.set(key, roomCurrent);
                    roomQuestionMaps.set(roomId, roomQuestionMap);
                    totalAnswers += 1;
                });
            });

            const questions = finalizeQuestions(questionMap);
            const roomReports = Array.from(roomQuestionMaps.entries())
                .map(([roomId, roomQuestionMap]) => {
                    const roomQuestions = finalizeQuestions(roomQuestionMap);

                    return {
                        roomId,
                        totalQuestionsInReport: roomQuestions.length,
                        totalAnswers: roomQuestions.reduce((sum, question) => sum + question.totalAnswers, 0),
                        hardestQuestions: filterHardestQuestions(roomQuestions),
                        easiestQuestions: filterEasiestQuestions(roomQuestions),
                        questions: roomQuestions
                    };
                })
                .sort((first, second) => first.roomId.localeCompare(second.roomId));
            const suspiciousParticipations = participations
                .filter(participation => participation.comportamentoSuspeito === true)
                .map(normalizeSuspiciousParticipation)
                .sort((first, second) => first.tempoSegundos - second.tempoSegundos);

            return {
                generatedAt: new Date().toISOString(),
                totalCompletedParticipations: participations.length,
                participationsWithDetails,
                participationsWithoutDetails,
                totalAnswers,
                suspiciousCount: suspiciousParticipations.length,
                totalQuestionsInReport: questions.length,
                hardestQuestions: filterHardestQuestions(questions),
                easiestQuestions: filterEasiestQuestions(questions),
                questions,
                roomReports,
                suspiciousParticipations
            };
        },

        async listSuspiciousCases() {
            await AuthService.requireAdmin();

            const snapshot = await getDocs(query(
                collection(db, collections.challengeParticipations),
                where("comportamentoSuspeito", "==", true)
            ));

            return snapshot.docs
                .map(docSnapshot => normalizeSuspiciousParticipation({
                    id: docSnapshot.id,
                    ...docSnapshot.data()
                }))
                .sort((first, second) => {
                    const firstName = first.nome || "";
                    const secondName = second.nome || "";

                    if (firstName !== secondName) {
                        return firstName.localeCompare(secondName, "pt-BR");
                    }

                    return asTimestamp(second.concluidoEm) - asTimestamp(first.concluidoEm);
                });
        },

        async clearSuspiciousCasesForUser(uid, fallbackParticipationId) {
            await AuthService.requireAdmin();

            const clearPayload = {
                comportamentoSuspeito: deleteField(),
                comportamentoSuspeitoMotivos: deleteField(),
                comportamentoSuspeitoRegistradoEm: deleteField(),
                respostasSuspeitas: deleteField(),
                pontuacaoBloqueadaPorAnalise: deleteField(),
                analiseUsuarioPendente: deleteField()
            };
            const clearUserAnalysis = async () => {
                if (!uid) {
                    return;
                }

                await updateDoc(doc(db, collections.users, uid), {
                    emAnalise: false,
                    analiseDesde: null,
                    analiseMotivo: null
                });
            };

            if (!uid) {
                await updateDoc(doc(db, collections.challengeParticipations, fallbackParticipationId), clearPayload);
                await clearUserAnalysis();
                await AuthService.rebuildRankingCacheSafely();
                return 1;
            }

            const snapshot = await getDocs(query(
                collection(db, collections.challengeParticipations),
                where("uid", "==", uid)
            ));
            const suspiciousDocs = snapshot.docs.filter(docSnapshot => (
                docSnapshot.data()?.comportamentoSuspeito === true
            ));

            await Promise.all(suspiciousDocs.map(docSnapshot => updateDoc(docSnapshot.ref, clearPayload)));
            await clearUserAnalysis();
            await AuthService.rebuildRankingCacheSafely();
            return suspiciousDocs.length;
        }
    };
}
