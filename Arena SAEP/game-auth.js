import {
    EmailAuthProvider,
    createUserWithEmailAndPassword,
    reauthenticateWithCredential,
    onAuthStateChanged,
    reload,
    sendEmailVerification,
    signInWithEmailAndPassword,
    signOut
    ,
    updatePassword
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    getDoc,
    query,
    setDoc,
    updateDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

export function createAuthService({ auth, db, CONFIG, state }) {
    const MIN_MATCHES_FOR_RELAMPAGO = 3;
    const RANKING_CACHE_DOC_ID = "rankingCache";
    const ALLOWED_EMAIL_DOMAINS = [
        "@edu.sc.senai.br",
        "@estudante.sesisenai.org.br"
    ];
    const ADMINISTRATIVE_ROLES = new Set(["admin", "moderador"]);
    const VALID_ROLES = new Set(["jogador", "moderador", "admin"]);
    const PROFILE_FIELDS_THAT_AFFECT_RANKING = ["nomeAcesso", "nomeJogador", "sala", "ativo"];
    const profileUpdateAffectsRanking = updates => (
        updates
        && PROFILE_FIELDS_THAT_AFFECT_RANKING.some(field => Object.prototype.hasOwnProperty.call(updates, field))
    );
    const getProfileRoom = profile => profile?.sala || "sem_sala";
    const getQuestionErrorCount = participation => {
        const storedQuestionErrors = Number(participation?.errosQuestoes);

        if (Number.isFinite(storedQuestionErrors)) {
            return storedQuestionErrors;
        }

        const answers = Array.isArray(participation?.respostas) ? participation.respostas : [];

        if (answers.length > 0) {
            return answers.filter(answer => answer.isCorrect === false).length;
        }

        return Number(participation?.erros) || 0;
    };
    const commitBatchedUpdates = async updates => {
        const batchSize = 450;

        for (let index = 0; index < updates.length; index += batchSize) {
            const batch = writeBatch(db);
            const chunk = updates.slice(index, index + batchSize);

            chunk.forEach(update => {
                batch.update(update.ref, update.data);
            });

            await batch.commit();
        }
    };

    return {
        isAllowedRegistrationEmail(email = "") {
            const normalizedEmail = email.trim().toLowerCase();
            return ALLOWED_EMAIL_DOMAINS.some(domain => normalizedEmail.endsWith(domain));
        },

        getApprovalStatus(profile) {
            if (!profile) {
                return "pendente";
            }

            if (!profile?.aprovacaoStatus) {
                return "aprovado";
            }

            return profile.aprovacaoStatus;
        },

        requiresEmailVerification(profile) {
            return Boolean(profile?.aprovacaoStatus);
        },

        isApprovedProfile(profile) {
            return this.getApprovalStatus(profile) === "aprovado";
        },

        isAdminProfile(profile) {
            return profile?.role === "admin";
        },

        isAdministrativeProfile(profile) {
            return ADMINISTRATIVE_ROLES.has(profile?.role);
        },

        getRoleLabel(role) {
            if (role === "admin") {
                return "Administrador";
            }

            if (role === "moderador") {
                return "Moderador";
            }

            return "Jogador";
        },

        async requireAdmin() {
            const currentUser = auth.currentUser;
            const profile = currentUser ? await this.loadProfile(currentUser.uid) : null;

            if (!this.isAdminProfile(profile)) {
                throw new Error("Apenas administradores podem executar esta ação.");
            }

            return profile;
        },

        isVerifiedUser(user) {
            return Boolean(user?.emailVerified);
        },

        getTitleCatalog() {
            return [
                { key: "Lendario", label: "Lendario", publicBoard: true },
                { key: "Relampago", label: "Relampago", publicBoard: true },
                { key: "Impecavel", label: "Impecavel", publicBoard: true },
                { key: "Campeao local", label: "Campeao local", publicBoard: true },
                { key: "Veterano", label: "Veterano", publicBoard: false },
                { key: "Persistente", label: "Persistente", publicBoard: false },
                { key: "Muito rapido", label: "Muito rapido", publicBoard: false },
                { key: "Decifrador", label: "Decifrador", publicBoard: false },
                { key: "Campeao em treino", label: "Campeao em treino", publicBoard: false }
            ];
        },

        getRecentAverageMetrics(userEntries = []) {
            const recentEntries = userEntries.slice(0, 3);
            const validRecentEntries = recentEntries.filter(entry => (
                Number.isFinite(Number(entry?.tempoSegundos))
                && Number.isFinite(Number(entry?.pontuacao))
            ));

            if (validRecentEntries.length < 3) {
                return {
                    averageTimeLastThree: null,
                    averageScoreLastThree: null,
                    recentEntriesCount: validRecentEntries.length
                };
            }

            const totalTime = validRecentEntries.reduce((sum, entry) => sum + Number(entry.tempoSegundos), 0);
            const totalScore = validRecentEntries.reduce((sum, entry) => sum + Number(entry.pontuacao), 0);

            return {
                averageTimeLastThree: totalTime / validRecentEntries.length,
                averageScoreLastThree: totalScore / validRecentEntries.length,
                recentEntriesCount: validRecentEntries.length
            };
        },

        async signIn(email, password) {
            const credentials = await signInWithEmailAndPassword(auth, email, password);
            return credentials.user;
        },

        async register({ name, email, password, room }) {
            if (!this.isAllowedRegistrationEmail(email)) {
                const error = new Error("Use um e-mail institucional do SENAI para se cadastrar.");
                error.code = "auth/invalid-registration-domain";
                throw error;
            }

            const credentials = await createUserWithEmailAndPassword(auth, email, password);
            const user = credentials.user;
            let profileSaved = true;
            let verificationSent = false;

            try {
                await setDoc(doc(db, CONFIG.collections.users, user.uid), {
                    uid: user.uid,
                    nomeAcesso: name,
                    nomeJogador: name,
                    email: user.email,
                    sala: room,
                    role: "jogador",
                    ativo: true,
                    emAnalise: false,
                    analiseDesde: null,
                    analiseMotivo: null,
                    aprovacaoStatus: "pendente",
                    aprovadoEm: null,
                    revisadoEm: null,
                    criadoEm: new Date().toISOString()
                });

                await sendEmailVerification(user);
                verificationSent = true;
            } catch (error) {
                profileSaved = false;
                console.error("Usuário autenticado, mas o perfil não pôde ser salvo no Firestore:", error);
            }

            return {
                user,
                profileSaved,
                verificationSent
            };
        },

        async signOutUser() {
            await signOut(auth);
        },

        async sendVerificationEmail(user) {
            if (!user) {
                return;
            }

            await sendEmailVerification(user);
        },

        async reloadUser(user) {
            if (!user) {
                return null;
            }

            await reload(user);
            return user;
        },

        async loadProfile(uid) {
            const snapshot = await getDoc(doc(db, CONFIG.collections.users, uid));
            return snapshot.exists() ? snapshot.data() : null;
        },

        getBestEntriesPerPlayer(entries) {
            const players = new Map();

            entries.forEach(entry => {
                const playerKey = entry.uid || `${(entry.nome || "sem_nome").trim().toLowerCase()}::${entry.sala || "sem_sala"}`;
                const current = players.get(playerKey);

                if (!current || (entry.pontuacao ?? 0) > (current.pontuacao ?? 0) || (
                    (entry.pontuacao ?? 0) === (current.pontuacao ?? 0) &&
                    (entry.tempoSegundos ?? 0) < (current.tempoSegundos ?? 0)
                )) {
                    players.set(playerKey, entry);
                }
            });

            return Array.from(players.values()).sort((a, b) => {
                if ((b.pontuacao ?? 0) !== (a.pontuacao ?? 0)) {
                    return (b.pontuacao ?? 0) - (a.pontuacao ?? 0);
                }

                return (a.tempoSegundos ?? 0) - (b.tempoSegundos ?? 0);
            });
        },

        buildRoomRanking(bestEntries) {
            const rooms = new Map();

            bestEntries.forEach(entry => {
                const roomKey = entry.sala || "sem_sala";
                const current = rooms.get(roomKey) || {
                    sala: roomKey,
                    totalPontos: 0,
                    totalAlunos: 0
                };

                current.totalPontos += Number(entry.pontuacao) || 0;
                current.totalAlunos += 1;
                rooms.set(roomKey, current);
            });

            return Array.from(rooms.values())
                .map(room => ({
                    ...room,
                    media: room.totalAlunos > 0 ? Math.round(room.totalPontos / room.totalAlunos) : 0
                }))
                .sort((a, b) => b.media - a.media);
        },

        getMedalByPosition(position, scope) {
            if (position === 1) {
                return {
                    tier: "gold",
                    label: scope === "individual" ? "Top 1 individual" : "Sala em 1º"
                };
            }

            if (position === 2) {
                return {
                    tier: "silver",
                    label: scope === "individual" ? "Top 2 individual" : "Sala em 2º"
                };
            }

            if (position === 3) {
                return {
                    tier: "bronze",
                    label: scope === "individual" ? "Top 3 individual" : "Sala em 3º"
                };
            }

            return null;
        },

        getPlayerTitles({
            individualRank,
            isFastestOverall,
            isRoomLeader,
            matchesPlayed,
            userEntries,
            userBestEntry,
            bestScore
        }) {
            const bestTime = Number(userBestEntry?.tempoSegundos);
            const lastThreeEntries = userEntries.slice(0, 3);
            const hasThreePerfectRuns = lastThreeEntries.length === 3
                && lastThreeEntries.every(entry => Number(entry.erros) === 0);
            const {
                averageTimeLastThree,
                averageScoreLastThree
            } = this.getRecentAverageMetrics(userEntries);
            const titles = [];

            if (individualRank === 1) {
                titles.push("Lendario");
            }

            if (isFastestOverall && matchesPlayed >= MIN_MATCHES_FOR_RELAMPAGO && averageTimeLastThree !== null) {
                titles.push("Relampago");
            }

            if (hasThreePerfectRuns) {
                titles.push("Impecavel");
            }

            if (isRoomLeader) {
                titles.push("Campeao local");
            }

            if (matchesPlayed >= 15) {
                titles.push("Veterano");
            }

            if (matchesPlayed >= 8) {
                titles.push("Persistente");
            }

            if (averageTimeLastThree !== null && averageTimeLastThree > 0 && averageTimeLastThree < 900) {
                titles.push("Muito rapido");
            }

            if (averageScoreLastThree !== null && averageScoreLastThree >= 6000) {
                titles.push("Decifrador");
            }

            return titles.length > 0 ? titles : ["Campeao em treino"];
        },

        getPlayerTitle(payload) {
            return this.getPlayerTitles(payload)[0];
        },

        buildTitleBoard(userRanking = []) {
            return this.getTitleCatalog()
                .filter(titleInfo => titleInfo.publicBoard)
                .map(titleInfo => ({
                    ...titleInfo,
                    holders: userRanking
                        .filter(user => (user.titles || []).includes(titleInfo.key))
                        .map(user => ({
                            uid: user.uid,
                            nome: user.nome || "Sem nome",
                            sala: user.sala || "sem_sala",
                            rank: user.rank,
                            pontuacaoTotal: user.pontuacaoTotal ?? 0
                        }))
                }));
        },

        getEmptyRankingContext() {
            return {
                userRanking: [],
                roomRanking: [],
                titleBoard: [],
                updatedAt: null
            };
        },

        buildRankingContext(users = [], challenges = [], participations = []) {
            const validChallengeIds = new Set(challenges
                .filter(challenge => challenge.status !== "cancelado")
                .map(challenge => challenge.id));
            const usersUnderReview = new Set(users
                .filter(user => user.emAnalise === true)
                .map(user => user.uid));
            const validParticipations = participations.filter(participation => (
                participation.uid
                && participation.status === "concluido"
                && participation.comportamentoSuspeito !== true
                && !usersUnderReview.has(participation.uid)
                && validChallengeIds.has(participation.desafioId)
            ));
            const activeUsersByRoom = new Map();
            const userTotalsMap = new Map();
            const profileByUid = new Map(users.map(user => [user.uid, user]));

            users
                .filter(user => user.ativo !== false)
                .forEach(user => {
                    const roomId = user.sala || "sem_sala";
                    activeUsersByRoom.set(roomId, (activeUsersByRoom.get(roomId) || 0) + 1);
                });

            validParticipations.forEach(participation => {
                const profile = profileByUid.get(participation.uid) || {};
                const current = userTotalsMap.get(participation.uid) || {
                    uid: participation.uid,
                    nome: profile.nomeJogador || profile.nomeAcesso || participation.nome || "Sem nome",
                    sala: profile.sala || participation.salaId || "sem_sala",
                    pontuacaoTotal: 0,
                    melhorTempo: null,
                    totalDesafiosConcluidos: 0,
                    totalErros: 0,
                    participations: []
                };

                current.pontuacaoTotal += Number(participation.pontuacao) || 0;
                current.totalDesafiosConcluidos += 1;
                current.totalErros += getQuestionErrorCount(participation);
                current.participations.push(participation);

                const elapsed = Number(participation.tempoSegundos);
                if (Number.isFinite(elapsed) && elapsed >= 0 && (current.melhorTempo === null || elapsed < current.melhorTempo)) {
                    current.melhorTempo = elapsed;
                }

                userTotalsMap.set(participation.uid, current);
            });

            const roomTotalsMap = new Map();

            Array.from(userTotalsMap.values()).forEach(user => {
                const roomId = user.sala || "sem_sala";
                const current = roomTotalsMap.get(roomId) || {
                    sala: roomId,
                    totalPontos: 0,
                    totalUsuariosAtivos: activeUsersByRoom.get(roomId) || 0
                };

                current.totalPontos += user.pontuacaoTotal;
                roomTotalsMap.set(roomId, current);
            });

            Array.from(activeUsersByRoom.entries()).forEach(([roomId, totalUsuariosAtivos]) => {
                if (!roomTotalsMap.has(roomId)) {
                    roomTotalsMap.set(roomId, {
                        sala: roomId,
                        totalPontos: 0,
                        totalUsuariosAtivos
                    });
                }
            });

            const roomRanking = Array.from(roomTotalsMap.values())
                .map(room => ({
                    ...room,
                    media: room.totalUsuariosAtivos > 0
                        ? Math.round(room.totalPontos / room.totalUsuariosAtivos)
                        : 0
                }))
                .sort((first, second) => second.media - first.media)
                .map((room, index) => ({
                    ...room,
                    rank: index + 1
                }));

            const usersWithRecentAverages = Array.from(userTotalsMap.values())
                .map(user => {
                    const sortedEntries = [...user.participations].sort((first, second) => (
                        new Date(second.concluidoEm || second.atualizadoEm || second.criadoEm || 0).getTime()
                        - new Date(first.concluidoEm || first.atualizadoEm || first.criadoEm || 0).getTime()
                    ));
                    const recentMetrics = this.getRecentAverageMetrics(sortedEntries);

                    return {
                        ...user,
                        recentEntries: sortedEntries,
                        averageTimeLastThree: recentMetrics.averageTimeLastThree,
                        averageScoreLastThree: recentMetrics.averageScoreLastThree
                    };
                });

            const fastestOverallUid = usersWithRecentAverages
                .filter(user => (
                    user.totalDesafiosConcluidos >= MIN_MATCHES_FOR_RELAMPAGO
                    && Number.isFinite(user.averageTimeLastThree)
                    && user.averageTimeLastThree > 0
                ))
                .sort((first, second) => {
                    if (first.averageTimeLastThree !== second.averageTimeLastThree) {
                        return first.averageTimeLastThree - second.averageTimeLastThree;
                    }

                    if (second.pontuacaoTotal !== first.pontuacaoTotal) {
                        return second.pontuacaoTotal - first.pontuacaoTotal;
                    }

                    return first.totalErros - second.totalErros;
                })[0]?.uid || null;

            const roomLeaderByRoom = new Map();
            Array.from(userTotalsMap.values())
                .sort((first, second) => {
                    if (second.pontuacaoTotal !== first.pontuacaoTotal) {
                        return second.pontuacaoTotal - first.pontuacaoTotal;
                    }

                    return (first.melhorTempo ?? Number.MAX_SAFE_INTEGER) - (second.melhorTempo ?? Number.MAX_SAFE_INTEGER);
                })
                .forEach(user => {
                    const roomId = user.sala || "sem_sala";
                    if (!roomLeaderByRoom.has(roomId)) {
                        roomLeaderByRoom.set(roomId, user.uid);
                    }
                });

            const userRanking = Array.from(userTotalsMap.values())
                .sort((first, second) => {
                    if (second.pontuacaoTotal !== first.pontuacaoTotal) {
                        return second.pontuacaoTotal - first.pontuacaoTotal;
                    }

                    return (first.melhorTempo ?? Number.MAX_SAFE_INTEGER) - (second.melhorTempo ?? Number.MAX_SAFE_INTEGER);
                })
                .map((user, index) => {
                    const sortedEntries = [...user.participations].sort((first, second) => (
                        new Date(second.concluidoEm || second.atualizadoEm || second.criadoEm || 0).getTime()
                        - new Date(first.concluidoEm || first.atualizadoEm || first.criadoEm || 0).getTime()
                    ));
                    const recentMetrics = this.getRecentAverageMetrics(sortedEntries);
                    const roomPosition = roomRanking.findIndex(room => room.sala === user.sala) + 1 || null;
                    const userBestEntry = [...user.participations].sort((first, second) => {
                        if ((second.pontuacao ?? 0) !== (first.pontuacao ?? 0)) {
                            return (second.pontuacao ?? 0) - (first.pontuacao ?? 0);
                        }

                        return (first.tempoSegundos ?? Number.MAX_SAFE_INTEGER) - (second.tempoSegundos ?? Number.MAX_SAFE_INTEGER);
                    })[0] || null;
                    const latestFinished = sortedEntries[0] || null;

                    const titles = this.getPlayerTitles({
                        individualRank: index + 1,
                        isFastestOverall: user.uid === fastestOverallUid,
                        isRoomLeader: roomLeaderByRoom.get(user.sala || "sem_sala") === user.uid,
                        matchesPlayed: user.totalDesafiosConcluidos,
                        userEntries: sortedEntries,
                        userBestEntry,
                        bestScore: user.pontuacaoTotal
                    });

                    return {
                        uid: user.uid,
                        nome: user.nome || "Sem nome",
                        sala: user.sala || "sem_sala",
                        pontuacaoTotal: user.pontuacaoTotal ?? 0,
                        melhorTempo: user.melhorTempo ?? null,
                        totalDesafiosConcluidos: user.totalDesafiosConcluidos ?? 0,
                        totalErros: user.totalErros ?? 0,
                        averageTimeLastThree: recentMetrics.averageTimeLastThree,
                        averageScoreLastThree: recentMetrics.averageScoreLastThree,
                        rank: index + 1,
                        roomPosition,
                        titles,
                        title: titles[0],
                        individualMedal: this.getMedalByPosition(index + 1, "individual"),
                        roomMedal: this.getMedalByPosition(roomPosition, "room"),
                        userBestEntry,
                        recentMatches: sortedEntries.slice(0, 3).map(entry => ({
                            pontuacao: entry.pontuacao ?? null,
                            erros: entry.erros ?? null,
                            tempoSegundos: entry.tempoSegundos ?? null,
                            criadoEm: entry.concluidoEm ?? entry.atualizadoEm ?? entry.criadoEm ?? null
                        })),
                        lastMatch: latestFinished ? {
                            pontuacao: latestFinished.pontuacao ?? null,
                            erros: latestFinished.erros ?? null,
                            tempoSegundos: latestFinished.tempoSegundos ?? null,
                            criadoEm: latestFinished.concluidoEm ?? latestFinished.criadoEm ?? null
                        } : null
                    };
                });

            const titleBoard = this.buildTitleBoard(userRanking);

            return {
                userRanking,
                roomRanking,
                titleBoard,
                updatedAt: new Date().toISOString()
            };
        },

        async rebuildRankingCache() {
            const [usersSnapshot, challengesSnapshot, participationsSnapshot] = await Promise.all([
                getDocs(collection(db, CONFIG.collections.users)),
                getDocs(collection(db, CONFIG.collections.challenges)),
                getDocs(collection(db, CONFIG.collections.challengeParticipations))
            ]);

            const users = usersSnapshot.docs.map(docSnapshot => ({
                uid: docSnapshot.id,
                ...docSnapshot.data()
            }));
            const challenges = challengesSnapshot.docs.map(docSnapshot => ({
                id: docSnapshot.id,
                ...docSnapshot.data()
            }));
            const participations = participationsSnapshot.docs.map(docSnapshot => ({
                id: docSnapshot.id,
                ...docSnapshot.data()
            }));
            const context = this.buildRankingContext(users, challenges, participations);

            await setDoc(doc(db, CONFIG.collections.meta, RANKING_CACHE_DOC_ID), context);
            return context;
        },

        async rebuildRankingCacheSafely() {
            try {
                await this.rebuildRankingCache();
                return {
                    rankingCacheUpdated: true
                };
            } catch (error) {
                console.warn("Perfil atualizado, mas o cache do ranking não pôde ser recalculado:", error);
                return {
                    rankingCacheUpdated: false,
                    rankingCacheError: error
                };
            }
        },

        async syncPendingRoomRankingUpdates() {
            const now = new Date().toISOString();
            const [usersSnapshot, rankingCacheSnapshot] = await Promise.all([
                getDocs(collection(db, CONFIG.collections.users)),
                getDoc(doc(db, CONFIG.collections.meta, RANKING_CACHE_DOC_ID))
            ]);
            const users = usersSnapshot.docs.map(docSnapshot => ({
                uid: docSnapshot.id,
                ...docSnapshot.data()
            }));
            const profileByUid = new Map(users.map(user => [user.uid, user]));
            const cached = rankingCacheSnapshot.exists()
                ? {
                    ...this.getEmptyRankingContext(),
                    ...rankingCacheSnapshot.data()
                }
                : this.getEmptyRankingContext();
            const cachedUserRanking = Array.isArray(cached.userRanking) ? cached.userRanking : [];
            const cachedRoomRanking = Array.isArray(cached.roomRanking) ? cached.roomRanking : [];
            const affectedUids = new Set();

            users
                .filter(user => user.rankingSyncPendente === true)
                .forEach(user => affectedUids.add(user.uid));

            cachedUserRanking.forEach(entry => {
                const profile = profileByUid.get(entry.uid);

                if (profile && (entry.sala || "sem_sala") !== getProfileRoom(profile)) {
                    affectedUids.add(entry.uid);
                }
            });

            const activeUsersByRoom = new Map();
            users
                .filter(user => user.ativo !== false)
                .forEach(user => {
                    const roomId = getProfileRoom(user);
                    activeUsersByRoom.set(roomId, (activeUsersByRoom.get(roomId) || 0) + 1);
                });

            const cachedActiveUsersByRoom = new Map(
                cachedRoomRanking.map(room => [room.sala || "sem_sala", Number(room.totalUsuariosAtivos) || 0])
            );
            const roomsToCompare = new Set([
                ...activeUsersByRoom.keys(),
                ...cachedActiveUsersByRoom.keys()
            ]);
            const activeUserCountChanged = Array.from(roomsToCompare).some(roomId => (
                (activeUsersByRoom.get(roomId) || 0) !== (cachedActiveUsersByRoom.get(roomId) || 0)
            ));

            if (affectedUids.size === 0 && !activeUserCountChanged) {
                return {
                    affectedUsers: 0,
                    updatedParticipations: 0,
                    rankingCacheUpdated: false
                };
            }

            const participationUpdates = [];

            for (const uid of affectedUids) {
                const profile = profileByUid.get(uid);

                if (!profile) {
                    continue;
                }

                const roomId = getProfileRoom(profile);
                const participationsSnapshot = await getDocs(query(
                    collection(db, CONFIG.collections.challengeParticipations),
                    where("uid", "==", uid)
                ));

                participationsSnapshot.docs.forEach(docSnapshot => {
                    const data = docSnapshot.data() || {};

                    if ((data.salaId || "sem_sala") !== roomId || (data.sala || "sem_sala") !== roomId) {
                        participationUpdates.push({
                            ref: docSnapshot.ref,
                            data: {
                                salaId: roomId,
                                sala: roomId,
                                atualizadoEm: now
                            }
                        });
                    }
                });
            }

            await commitBatchedUpdates(participationUpdates);

            const rankingEntries = cachedUserRanking.map(entry => {
                const profile = profileByUid.get(entry.uid);

                if (!profile) {
                    return {
                        ...entry,
                        sala: entry.sala || "sem_sala"
                    };
                }

                return {
                    ...entry,
                    nome: profile.nomeJogador || profile.nomeAcesso || entry.nome || "Sem nome",
                    sala: getProfileRoom(profile)
                };
            });
            const roomTotalsMap = new Map();

            rankingEntries.forEach(entry => {
                const roomId = entry.sala || "sem_sala";
                const current = roomTotalsMap.get(roomId) || {
                    sala: roomId,
                    totalPontos: 0,
                    totalUsuariosAtivos: activeUsersByRoom.get(roomId) || 0
                };

                current.totalPontos += Number(entry.pontuacaoTotal) || 0;
                roomTotalsMap.set(roomId, current);
            });

            Array.from(activeUsersByRoom.entries()).forEach(([roomId, totalUsuariosAtivos]) => {
                if (!roomTotalsMap.has(roomId)) {
                    roomTotalsMap.set(roomId, {
                        sala: roomId,
                        totalPontos: 0,
                        totalUsuariosAtivos
                    });
                }
            });

            const roomRanking = Array.from(roomTotalsMap.values())
                .map(room => ({
                    ...room,
                    media: room.totalUsuariosAtivos > 0
                        ? Math.round(room.totalPontos / room.totalUsuariosAtivos)
                        : 0
                }))
                .sort((first, second) => second.media - first.media)
                .map((room, index) => ({
                    ...room,
                    rank: index + 1
                }));
            const fastestOverallUid = rankingEntries
                .filter(user => (
                    Number(user.totalDesafiosConcluidos) >= MIN_MATCHES_FOR_RELAMPAGO
                    && Number.isFinite(Number(user.averageTimeLastThree))
                    && Number(user.averageTimeLastThree) > 0
                ))
                .sort((first, second) => {
                    if (Number(first.averageTimeLastThree) !== Number(second.averageTimeLastThree)) {
                        return Number(first.averageTimeLastThree) - Number(second.averageTimeLastThree);
                    }

                    if (Number(second.pontuacaoTotal) !== Number(first.pontuacaoTotal)) {
                        return Number(second.pontuacaoTotal) - Number(first.pontuacaoTotal);
                    }

                    return Number(first.totalErros) - Number(second.totalErros);
                })[0]?.uid || null;
            const roomLeaderByRoom = new Map();

            [...rankingEntries]
                .sort((first, second) => {
                    if (Number(second.pontuacaoTotal) !== Number(first.pontuacaoTotal)) {
                        return Number(second.pontuacaoTotal) - Number(first.pontuacaoTotal);
                    }

                    return (Number(first.melhorTempo) || Number.MAX_SAFE_INTEGER) - (Number(second.melhorTempo) || Number.MAX_SAFE_INTEGER);
                })
                .forEach(user => {
                    const roomId = user.sala || "sem_sala";

                    if (!roomLeaderByRoom.has(roomId)) {
                        roomLeaderByRoom.set(roomId, user.uid);
                    }
                });

            const userRanking = [...rankingEntries]
                .sort((first, second) => {
                    if (Number(second.pontuacaoTotal) !== Number(first.pontuacaoTotal)) {
                        return Number(second.pontuacaoTotal) - Number(first.pontuacaoTotal);
                    }

                    return (Number(first.melhorTempo) || Number.MAX_SAFE_INTEGER) - (Number(second.melhorTempo) || Number.MAX_SAFE_INTEGER);
                })
                .map((user, index) => {
                    const roomPosition = roomRanking.findIndex(room => room.sala === user.sala) + 1 || null;
                    const titles = this.getPlayerTitles({
                        individualRank: index + 1,
                        isFastestOverall: user.uid === fastestOverallUid,
                        isRoomLeader: roomLeaderByRoom.get(user.sala || "sem_sala") === user.uid,
                        matchesPlayed: Number(user.totalDesafiosConcluidos) || 0,
                        userEntries: user.recentMatches || [],
                        userBestEntry: user.userBestEntry || null,
                        bestScore: Number(user.pontuacaoTotal) || 0
                    });

                    return {
                        ...user,
                        rank: index + 1,
                        roomPosition,
                        titles,
                        title: titles[0],
                        individualMedal: this.getMedalByPosition(index + 1, "individual"),
                        roomMedal: this.getMedalByPosition(roomPosition, "room")
                    };
                });
            const nextContext = {
                userRanking,
                roomRanking,
                titleBoard: this.buildTitleBoard(userRanking),
                updatedAt: now
            };

            await setDoc(doc(db, CONFIG.collections.meta, RANKING_CACHE_DOC_ID), nextContext);

            const userFlagUpdates = users
                .filter(user => affectedUids.has(user.uid) || user.rankingSyncPendente === true)
                .map(user => ({
                    ref: doc(db, CONFIG.collections.users, user.uid),
                    data: {
                        rankingSyncPendente: false,
                        rankingSyncTipo: null,
                        rankingSyncSolicitadoEm: null,
                        rankingSyncSincronizadoEm: now,
                        salaRankingSincronizada: getProfileRoom(user)
                    }
                }));

            await commitBatchedUpdates(userFlagUpdates);

            return {
                affectedUsers: affectedUids.size,
                updatedParticipations: participationUpdates.length,
                rankingCacheUpdated: true
            };
        },

        async updateRankingCacheWithResult({
            uid,
            nome,
            sala,
            pontuacao,
            tempoSegundos,
            erros,
            concluidoEm
        }) {
            const profile = uid ? await this.loadProfile(uid) : null;

            if (profile?.emAnalise === true) {
                return this.getCachedRankingContext();
            }

            const cached = await this.getCachedRankingContext();
            const rankingEntries = (Array.isArray(cached.userRanking) ? cached.userRanking : [])
                .map(entry => ({
                    ...entry,
                    recentMatches: Array.isArray(entry.recentMatches) ? [...entry.recentMatches] : []
                }));
            const normalizedResult = {
                pontuacao: Number(pontuacao) || 0,
                tempoSegundos: Number(tempoSegundos) || 0,
                erros: Number(erros) || 0,
                criadoEm: concluidoEm || new Date().toISOString()
            };
            let entry = rankingEntries.find(item => item.uid === uid) || null;

            if (!entry) {
                entry = {
                    uid,
                    nome: nome || "Sem nome",
                    sala: sala || "sem_sala",
                    pontuacaoTotal: 0,
                    melhorTempo: null,
                    totalDesafiosConcluidos: 0,
                    totalErros: 0,
                    averageTimeLastThree: null,
                    averageScoreLastThree: null,
                    userBestEntry: null,
                    lastMatch: null,
                    recentMatches: []
                };
                rankingEntries.push(entry);
            }

            entry.nome = nome || entry.nome || "Sem nome";
            entry.sala = sala || entry.sala || "sem_sala";
            entry.pontuacaoTotal = (Number(entry.pontuacaoTotal) || 0) + normalizedResult.pontuacao;
            entry.totalDesafiosConcluidos = (Number(entry.totalDesafiosConcluidos) || 0) + 1;
            entry.totalErros = (Number(entry.totalErros) || 0) + normalizedResult.erros;
            entry.lastMatch = normalizedResult;
            entry.recentMatches = [normalizedResult, ...entry.recentMatches]
                .sort((first, second) => new Date(second.criadoEm || 0).getTime() - new Date(first.criadoEm || 0).getTime())
                .slice(0, 3);

            if (entry.melhorTempo === null || entry.melhorTempo === undefined || normalizedResult.tempoSegundos < entry.melhorTempo) {
                entry.melhorTempo = normalizedResult.tempoSegundos;
            }

            if (!entry.userBestEntry
                || normalizedResult.pontuacao > (entry.userBestEntry.pontuacao ?? 0)
                || (
                    normalizedResult.pontuacao === (entry.userBestEntry.pontuacao ?? 0)
                    && normalizedResult.tempoSegundos < (entry.userBestEntry.tempoSegundos ?? Number.MAX_SAFE_INTEGER)
                )) {
                entry.userBestEntry = { ...normalizedResult };
            }

            const recentMetrics = this.getRecentAverageMetrics(entry.recentMatches);
            entry.averageTimeLastThree = recentMetrics.averageTimeLastThree;
            entry.averageScoreLastThree = recentMetrics.averageScoreLastThree;

            const activeUsersByRoom = new Map(
                (Array.isArray(cached.roomRanking) ? cached.roomRanking : [])
                    .map(room => [room.sala, room.totalUsuariosAtivos || 0])
            );

            if (!activeUsersByRoom.has(entry.sala)) {
                activeUsersByRoom.set(entry.sala, 1);
            }

            const roomTotalsMap = new Map();

            rankingEntries.forEach(user => {
                const roomId = user.sala || "sem_sala";
                const current = roomTotalsMap.get(roomId) || {
                    sala: roomId,
                    totalPontos: 0,
                    totalUsuariosAtivos: activeUsersByRoom.get(roomId) || 0
                };

                current.totalPontos += Number(user.pontuacaoTotal) || 0;
                roomTotalsMap.set(roomId, current);
            });

            Array.from(activeUsersByRoom.entries()).forEach(([roomId, totalUsuariosAtivos]) => {
                if (!roomTotalsMap.has(roomId)) {
                    roomTotalsMap.set(roomId, {
                        sala: roomId,
                        totalPontos: 0,
                        totalUsuariosAtivos
                    });
                }
            });

            const roomRanking = Array.from(roomTotalsMap.values())
                .map(room => ({
                    ...room,
                    media: room.totalUsuariosAtivos > 0 ? Math.round(room.totalPontos / room.totalUsuariosAtivos) : 0
                }))
                .sort((first, second) => second.media - first.media)
                .map((room, index) => ({
                    ...room,
                    rank: index + 1
                }));

            const fastestOverallUid = rankingEntries
                .filter(user => (
                    Number(user.totalDesafiosConcluidos) >= MIN_MATCHES_FOR_RELAMPAGO
                    && Number.isFinite(Number(user.averageTimeLastThree))
                    && Number(user.averageTimeLastThree) > 0
                ))
                .sort((first, second) => {
                    if (Number(first.averageTimeLastThree) !== Number(second.averageTimeLastThree)) {
                        return Number(first.averageTimeLastThree) - Number(second.averageTimeLastThree);
                    }

                    if (Number(second.pontuacaoTotal) !== Number(first.pontuacaoTotal)) {
                        return Number(second.pontuacaoTotal) - Number(first.pontuacaoTotal);
                    }

                    return Number(first.totalErros) - Number(second.totalErros);
                })[0]?.uid || null;

            const roomLeaderByRoom = new Map();
            [...rankingEntries]
                .sort((first, second) => {
                    if (Number(second.pontuacaoTotal) !== Number(first.pontuacaoTotal)) {
                        return Number(second.pontuacaoTotal) - Number(first.pontuacaoTotal);
                    }

                    return (Number(first.melhorTempo) || Number.MAX_SAFE_INTEGER) - (Number(second.melhorTempo) || Number.MAX_SAFE_INTEGER);
                })
                .forEach(user => {
                    const roomId = user.sala || "sem_sala";
                    if (!roomLeaderByRoom.has(roomId)) {
                        roomLeaderByRoom.set(roomId, user.uid);
                    }
                });

            const userRanking = [...rankingEntries]
                .sort((first, second) => {
                    if (Number(second.pontuacaoTotal) !== Number(first.pontuacaoTotal)) {
                        return Number(second.pontuacaoTotal) - Number(first.pontuacaoTotal);
                    }

                    return (Number(first.melhorTempo) || Number.MAX_SAFE_INTEGER) - (Number(second.melhorTempo) || Number.MAX_SAFE_INTEGER);
                })
                .map((user, index) => {
                    const roomPosition = roomRanking.findIndex(room => room.sala === user.sala) + 1 || null;
                    const titles = this.getPlayerTitles({
                        individualRank: index + 1,
                        isFastestOverall: user.uid === fastestOverallUid,
                        isRoomLeader: roomLeaderByRoom.get(user.sala || "sem_sala") === user.uid,
                        matchesPlayed: Number(user.totalDesafiosConcluidos) || 0,
                        userEntries: user.recentMatches || [],
                        userBestEntry: user.userBestEntry || null,
                        bestScore: Number(user.pontuacaoTotal) || 0
                    });

                    return {
                        ...user,
                        rank: index + 1,
                        roomPosition,
                        titles,
                        title: titles[0],
                        individualMedal: this.getMedalByPosition(index + 1, "individual"),
                        roomMedal: this.getMedalByPosition(roomPosition, "room")
                    };
                });

            const nextContext = {
                userRanking,
                roomRanking,
                titleBoard: this.buildTitleBoard(userRanking),
                updatedAt: new Date().toISOString()
            };

            await setDoc(doc(db, CONFIG.collections.meta, RANKING_CACHE_DOC_ID), nextContext);
            return nextContext;
        },

        async getCachedRankingContext(forceRefresh = false) {
            if (!forceRefresh) {
                const snapshot = await getDoc(doc(db, CONFIG.collections.meta, RANKING_CACHE_DOC_ID));

                if (snapshot.exists()) {
                    const cached = snapshot.data() || {};
                    return {
                        ...this.getEmptyRankingContext(),
                        ...cached,
                        userRanking: Array.isArray(cached.userRanking) ? cached.userRanking : [],
                        roomRanking: Array.isArray(cached.roomRanking) ? cached.roomRanking : [],
                        titleBoard: Array.isArray(cached.titleBoard) ? cached.titleBoard : []
                    };
                }
            }

            return this.rebuildRankingCache();
        },

        async getUserRankingSummary(uid) {
            const context = await this.getCachedRankingContext();
            const rankingEntry = context.userRanking.find(entry => entry.uid === uid) || null;

            return {
                bestScore: rankingEntry?.pontuacaoTotal ?? null,
                bestTimeSeconds: rankingEntry?.melhorTempo ?? null
            };
        },

        async getChallengeRankingContext() {
            return this.getCachedRankingContext();
        },

        async getUserGameInsights(uid, roomId) {
            const context = await this.getCachedRankingContext();
            const rankingEntry = context.userRanking.find(entry => entry.uid === uid) || null;
            const roomPosition = roomId
                ? (context.roomRanking.findIndex(entry => entry.sala === roomId) + 1 || null)
                : null;

            return {
                bestScore: rankingEntry?.pontuacaoTotal ?? null,
                bestTimeSeconds: rankingEntry?.melhorTempo ?? null,
                matchesPlayed: rankingEntry?.totalDesafiosConcluidos ?? 0,
                lastMatch: rankingEntry?.lastMatch ?? null,
                roomPosition: rankingEntry?.roomPosition ?? roomPosition,
                individualRank: rankingEntry?.rank ?? null,
                individualMedal: rankingEntry?.individualMedal || this.getMedalByPosition(rankingEntry?.rank ?? null, "individual"),
                roomMedal: rankingEntry?.roomMedal || this.getMedalByPosition(roomPosition, "room"),
                title: rankingEntry?.title || "Campeao em treino",
                titles: rankingEntry?.titles || ["Campeao em treino"],
                roomRanking: context.roomRanking,
                userBestEntry: rankingEntry?.userBestEntry || null
            };
        },

        async changePassword(currentPassword, newPassword) {
            const user = auth.currentUser;

            if (!user || !user.email) {
                throw new Error("Nenhum usuário autenticado.");
            }

            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
        },

        async searchUsersByName(searchTerm) {
            const snapshot = await getDocs(collection(db, CONFIG.collections.users));
            const normalizedTerm = searchTerm.trim().toLowerCase();

            return snapshot.docs
                .map(docSnapshot => ({
                    uid: docSnapshot.id,
                    ...docSnapshot.data()
                }))
                .filter(user => {
                    if (!normalizedTerm) {
                        return true;
                    }

                    const name = (user.nomeAcesso || "").toLowerCase();
                    return name.includes(normalizedTerm);
                })
                .sort((first, second) => (first.nomeAcesso || "").localeCompare(second.nomeAcesso || "", "pt-BR"));
        },

        async updateUserRole(uid, role) {
            if (!VALID_ROLES.has(role)) {
                throw new Error("Perfil de usuário inválido.");
            }

            await this.requireAdmin();

            await updateDoc(doc(db, CONFIG.collections.users, uid), {
                role
            });
        },

        async updateOwnProfile(uid, updates) {
            await updateDoc(doc(db, CONFIG.collections.users, uid), updates);

            if (profileUpdateAffectsRanking(updates)) {
                return this.rebuildRankingCacheSafely();
            }

            return {
                rankingCacheUpdated: null
            };
        },

        async updateUserProfile(uid, updates) {
            const hasRoomUpdate = Object.prototype.hasOwnProperty.call(updates, "sala");
            const nextUpdates = hasRoomUpdate
                ? {
                    ...updates,
                    rankingSyncPendente: true,
                    rankingSyncTipo: "sala",
                    rankingSyncSolicitadoEm: new Date().toISOString()
                }
                : updates;

            await updateDoc(doc(db, CONFIG.collections.users, uid), nextUpdates);

            if (hasRoomUpdate) {
                return {
                    rankingCacheUpdated: null,
                    rankingSyncPending: true
                };
            }

            if (profileUpdateAffectsRanking(updates)) {
                return this.rebuildRankingCacheSafely();
            }

            return {
                rankingCacheUpdated: null
            };
        },

        async updateUserActive(uid, ativo) {
            await updateDoc(doc(db, CONFIG.collections.users, uid), {
                ativo
            });

            return this.rebuildRankingCacheSafely();
        },

        async updateUserApprovalStatus(uid, aprovacaoStatus) {
            const updates = {
                aprovacaoStatus,
                revisadoEm: new Date().toISOString()
            };

            if (aprovacaoStatus === "aprovado") {
                updates.aprovadoEm = new Date().toISOString();
            }

            await updateDoc(doc(db, CONFIG.collections.users, uid), updates);
        },

        async syncEmailVerificationApproval(user, profile) {
            if (!user || !profile) {
                return profile;
            }

            const approvalStatus = this.getApprovalStatus(profile);
            const shouldAutoApprove = approvalStatus === "pendente" && this.isVerifiedUser(user);

            if (!shouldAutoApprove) {
                return profile;
            }

            await this.updateUserApprovalStatus(user.uid, "aprovado");
            return {
                ...profile,
                aprovacaoStatus: "aprovado",
                aprovadoEm: new Date().toISOString(),
                revisadoEm: new Date().toISOString()
            };
        },

        async deleteUserData(uid) {
            const collectionsToClean = [
                CONFIG.collections.challengeParticipations,
                CONFIG.collections.ranking,
                CONFIG.collections.runs
            ];

            for (const collectionName of collectionsToClean) {
                const snapshot = await getDocs(query(
                    collection(db, collectionName),
                    where("uid", "==", uid)
                ));

                await Promise.all(snapshot.docs.map(docSnapshot => deleteDoc(docSnapshot.ref)));
            }

            await deleteDoc(doc(db, CONFIG.collections.users, uid));
            return this.rebuildRankingCacheSafely();
        },

        watchSession(handler) {
            return onAuthStateChanged(auth, async user => {
                state.authResolved = true;
                state.authUser = user;
                state.authProfile = user ? await this.loadProfile(user.uid) : null;
                await handler(user);
            });
        }
    };
}
