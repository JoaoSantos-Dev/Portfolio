import { auth, CONFIG, db } from "./game-config.js";
import { createAuthService } from "./game-auth.js";
import { createRoomService } from "./room-service.js";
import { createChallengeService } from "./challenge-service.js";

const AuthService = createAuthService({
    auth,
    db,
    CONFIG,
    state: {
        authResolved: false,
        authUser: null,
        authProfile: null
    }
});
const RoomService = createRoomService({
    db,
    CONFIG,
    state: {
        rooms: [],
        selectedRoom: null
    }
});
const ChallengeService = createChallengeService({ db, CONFIG, AuthService });

const status = document.getElementById("adminStatus");
const empty = document.getElementById("adminEmpty");
const panel = document.getElementById("adminPanel");
const newRoomInput = document.getElementById("newRoomInput");
const createRoomButton = document.getElementById("createRoomButton");
const challengeTitleInput = document.getElementById("challengeTitleInput");
const challengeQuestionCountInput = document.getElementById("challengeQuestionCountInput");
const challengeStartInput = document.getElementById("challengeStartInput");
const challengeEndInput = document.getElementById("challengeEndInput");
const createChallengeButton = document.getElementById("createChallengeButton");
const generateReportButton = document.getElementById("generateReportButton");
const openSuspectsButton = document.getElementById("openSuspectsButton");
const challengesBody = document.getElementById("challengesBody");
const challengeModalOverlay = document.getElementById("challengeModalOverlay");
const closeChallengeModalButton = document.getElementById("closeChallengeModalButton");
const challengeModalTitle = document.getElementById("challengeModalTitle");
const challengeModalStatus = document.getElementById("challengeModalStatus");
const challengeModalVisualStatus = document.getElementById("challengeModalVisualStatus");
const challengeModalQuestionCount = document.getElementById("challengeModalQuestionCount");
const challengeModalStart = document.getElementById("challengeModalStart");
const challengeModalEnd = document.getElementById("challengeModalEnd");
const challengeExtendInput = document.getElementById("challengeExtendInput");
const extendChallengeButton = document.getElementById("extendChallengeButton");
const activateChallengeNowButton = document.getElementById("activateChallengeNowButton");
const endChallengeButton = document.getElementById("endChallengeButton");
const cancelChallengeButton = document.getElementById("cancelChallengeButton");
const suspectsModalOverlay = document.getElementById("suspectsModalOverlay");
const closeSuspectsModalButton = document.getElementById("closeSuspectsModalButton");
const suspectsStatus = document.getElementById("suspectsStatus");
const refreshSuspectsButton = document.getElementById("refreshSuspectsButton");
const generateSuspectsReportButton = document.getElementById("generateSuspectsReportButton");
const suspectsEmpty = document.getElementById("suspectsEmpty");
const suspectsTable = document.getElementById("suspectsTable");
const suspectsBody = document.getElementById("suspectsBody");
const suspectSimulationPanel = document.getElementById("suspectSimulationPanel");
const suspectSimulationTitle = document.getElementById("suspectSimulationTitle");
const suspectSimulationTime = document.getElementById("suspectSimulationTime");
const suspectSimulationErrors = document.getElementById("suspectSimulationErrors");
const suspectSimulationProgress = document.getElementById("suspectSimulationProgress");
const suspectSimulationQuestion = document.getElementById("suspectSimulationQuestion");
const suspectSimulationResult = document.getElementById("suspectSimulationResult");
const restartSuspectSimulationButton = document.getElementById("restartSuspectSimulationButton");
const closeSuspectCaseButton = document.getElementById("closeSuspectCaseButton");
const roomsBody = document.getElementById("roomsBody");
const userLink = document.getElementById("userLink");
const adminLogoutButton = document.getElementById("adminLogoutButton");

const redirectToLogin = () => {
    const returnTo = encodeURIComponent("./admin.html");
    window.location.replace(`./arena.html?redirect=${returnTo}`);
};

let currentUser = null;
let currentProfile = null;
let rooms = [];
let challenges = [];
let selectedChallenge = null;
let suspiciousCases = [];
let activeSuspiciousCase = null;
let simulationState = null;
let simulationTimerId = null;

const getRoomLabel = roomId => rooms.find(room => room.id === roomId)?.nome || "Sem sala";
const getRoomOptions = selectedRoom => rooms.map(room => `
    <option value="${room.id}" ${room.id === selectedRoom ? "selected" : ""}>${room.nome}</option>
`).join("");

const setStatus = (type, message) => {
    status.className = `status ${type}`;
    status.textContent = message;
};

const isFullAdmin = () => AuthService.isAdminProfile(currentProfile);

const pluralize = (count, singular, plural = `${singular}s`) => (
    count === 1 ? singular : plural
);

const formatDateTime = value => {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString("pt-BR");
};

const formatElapsedTime = totalSeconds => {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
    const seconds = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
};

const toLocalDateTimeInputValue = value => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const adjusted = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return adjusted.toISOString().slice(0, 16);
};

const formatVisualStatus = status => {
    if (status === "ativo") {
        return "Ativo agora";
    }

    if (status === "agendado") {
        return "Agendado";
    }

    if (status === "encerrado") {
        return "Encerrado";
    }

    if (status === "cancelado") {
        return "Cancelado";
    }

    return status || "-";
};

const generatePdfReport = (reportData, auditData) => {
    const JsPdfConstructor = window.jspdf?.jsPDF;

    if (!JsPdfConstructor) {
        throw new Error("Biblioteca de PDF não carregada.");
    }

    const pdf = new JsPdfConstructor({
        orientation: "portrait",
        unit: "pt",
        format: "a4"
    });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("Relatório de Desempenho das Questões", 40, 44);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Gerado em: ${formatDateTime(reportData.generatedAt)}`, 40, 62);
    pdf.text(`Relatórios já gerados: ${auditData.totalReports}`, 40, 76);

    pdf.autoTable({
        startY: 92,
        theme: "grid",
        head: [["Resumo geral", "Valor"]],
        body: [
            ["Participações concluídas válidas", String(reportData.totalCompletedParticipations)],
            ["Participações com detalhamento", String(reportData.participationsWithDetails)],
            ["Participações sem detalhamento", String(reportData.participationsWithoutDetails)],
            ["Tentativas de resposta registradas", String(reportData.totalAnswers)],
            ["Questões analisadas", String(reportData.totalQuestionsInReport)]
        ],
        styles: { fontSize: 9 }
    });

    pdf.autoTable({
        startY: pdf.lastAutoTable.finalY + 18,
        theme: "grid",
        head: [["Administradores que geraram relatórios", "Quantidade"]],
        body: (auditData.admins || []).length > 0
            ? auditData.admins.map(admin => [admin.nome || "Administrador", String(admin.totalReports || 0)])
            : [["Nenhum registro encontrado", "0"]],
        styles: { fontSize: 9 }
    });

    pdf.autoTable({
        startY: pdf.lastAutoTable.finalY + 18,
        theme: "striped",
        head: [["Questões incorretas em destaque", "Acertos", "Erros", "Taxa de acerto"]],
        body: reportData.hardestQuestions.length > 0
            ? reportData.hardestQuestions.map(question => [
                question.title,
                String(question.correctCount),
                String(question.wrongCount),
                `${question.accuracyRate}%`
            ])
            : [["Nenhuma questão com 59% ou menos de acerto", "-", "-", "-"]],
        styles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 240 } }
    });

    pdf.autoTable({
        startY: pdf.lastAutoTable.finalY + 18,
        theme: "striped",
        head: [["Questões corretas em destaque", "Acertos", "Erros", "Taxa de acerto"]],
        body: reportData.easiestQuestions.length > 0
            ? reportData.easiestQuestions.map(question => [
                question.title,
                String(question.correctCount),
                String(question.wrongCount),
                `${question.accuracyRate}%`
            ])
            : [["Nenhuma questão com mais de 40% de acerto", "-", "-", "-"]],
        styles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 240 } }
    });

    pdf.addPage();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("Todas as questões analisadas", 40, 40);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Observação: participações antigas sem respostas detalhadas entram só no resumo geral.", 40, 56);

    pdf.autoTable({
        startY: 72,
        theme: "grid",
        head: [["Título", "Acertos", "Erros", "Tentativas", "Taxa de acerto"]],
        body: reportData.questions.length > 0
            ? reportData.questions.map(question => [
                question.title,
                String(question.correctCount),
                String(question.wrongCount),
                String(question.totalAnswers),
                `${question.accuracyRate}%`
            ])
            : [["Sem dados detalhados suficientes", "-", "-", "-", "-"]],
        styles: {
            fontSize: 8,
            cellPadding: 4,
            overflow: "linebreak"
        },
        columnStyles: {
            0: { cellWidth: 250 }
        }
    });

    (reportData.roomReports || []).forEach(roomReport => {
        pdf.addPage();
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(14);
        pdf.text(`Sala: ${getRoomLabel(roomReport.roomId)}`, 40, 40);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text("Relatório separado por sala, considerando somente os participantes dessa sala.", 40, 56);

        pdf.autoTable({
            startY: 72,
            theme: "grid",
            head: [["Resumo da sala", "Valor"]],
            body: [
                ["Sala", getRoomLabel(roomReport.roomId)],
                ["Tentativas de resposta registradas", String(roomReport.totalAnswers)],
                ["Questões analisadas", String(roomReport.totalQuestionsInReport)]
            ],
            styles: { fontSize: 9 }
        });

        pdf.autoTable({
            startY: pdf.lastAutoTable.finalY + 18,
            theme: "striped",
            head: [["Questões incorretas em destaque", "Acertos", "Erros", "Taxa de acerto"]],
            body: roomReport.hardestQuestions.length > 0
                ? roomReport.hardestQuestions.map(question => [
                    question.title,
                    String(question.correctCount),
                    String(question.wrongCount),
                    `${question.accuracyRate}%`
                ])
                : [["Nenhuma questão com 59% ou menos de acerto", "-", "-", "-"]],
            styles: { fontSize: 8 },
            columnStyles: { 0: { cellWidth: 240 } }
        });

        pdf.autoTable({
            startY: pdf.lastAutoTable.finalY + 18,
            theme: "striped",
            head: [["Questões corretas em destaque", "Acertos", "Erros", "Taxa de acerto"]],
            body: roomReport.easiestQuestions.length > 0
                ? roomReport.easiestQuestions.map(question => [
                    question.title,
                    String(question.correctCount),
                    String(question.wrongCount),
                    `${question.accuracyRate}%`
                ])
                : [["Nenhuma questão com mais de 40% de acerto", "-", "-", "-"]],
            styles: { fontSize: 8 },
            columnStyles: { 0: { cellWidth: 240 } }
        });

        pdf.autoTable({
            startY: pdf.lastAutoTable.finalY + 18,
            theme: "grid",
            head: [["Título", "Acertos", "Erros", "Tentativas", "Taxa de acerto"]],
            body: roomReport.questions.length > 0
                ? roomReport.questions.map(question => [
                    question.title,
                    String(question.correctCount),
                    String(question.wrongCount),
                    String(question.totalAnswers),
                    `${question.accuracyRate}%`
                ])
                : [["Sem dados detalhados suficientes", "-", "-", "-", "-"]],
            styles: {
                fontSize: 8,
                cellPadding: 4,
                overflow: "linebreak"
            },
            columnStyles: {
                0: { cellWidth: 250 }
            }
        });
    });

    pdf.save(`relatorio-questoes-${new Date().toISOString().slice(0, 10)}.pdf`);
};

const getSuspiciousReasonText = suspiciousCase => (
    (suspiciousCase.motivos || [])
        .map(reason => reason.descricao || reason.codigo)
        .filter(Boolean)
        .join(" | ") || "Critério de tempo"
);

const getSuspiciousUserKey = suspiciousCase => (
    suspiciousCase.uid || suspiciousCase.email || suspiciousCase.nome || suspiciousCase.id
);

const getVisibleSuspiciousUsers = () => {
    const casesByUser = new Map();

    suspiciousCases.forEach(suspiciousCase => {
        const key = getSuspiciousUserKey(suspiciousCase);
        const current = casesByUser.get(key);
        const currentTime = new Date(current?.concluidoEm || 0).getTime();
        const nextTime = new Date(suspiciousCase.concluidoEm || 0).getTime();

        if (!current || nextTime > currentTime) {
            casesByUser.set(key, suspiciousCase);
        }
    });

    return Array.from(casesByUser.values())
        .sort((first, second) => (first.nome || "").localeCompare(second.nome || "", "pt-BR"));
};

const generateSuspiciousPdfReport = cases => {
    const JsPdfConstructor = window.jspdf?.jsPDF;

    if (!JsPdfConstructor) {
        throw new Error("Biblioteca de PDF não carregada.");
    }

    const uniqueNames = Array.from(new Set(
        cases
            .map(item => item.nome || item.email || "Sem nome")
            .filter(Boolean)
    )).sort((first, second) => first.localeCompare(second, "pt-BR"));
    const pdf = new JsPdfConstructor({
        orientation: "portrait",
        unit: "pt",
        format: "a4"
    });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("Suspeitos de uso de hack", 40, 44);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Gerado em: ${formatDateTime(new Date().toISOString())}`, 40, 62);

    pdf.autoTable({
        startY: 82,
        theme: "grid",
        head: [["Nome"]],
        body: uniqueNames.length > 0
            ? uniqueNames.map(name => [name])
            : [["Nenhum suspeito pendente"]],
        styles: {
            fontSize: 10,
            cellPadding: 6
        }
    });

    pdf.save(`suspeitos-hack-${new Date().toISOString().slice(0, 10)}.pdf`);
};

const stopSimulationTimer = () => {
    if (simulationTimerId) {
        window.clearInterval(simulationTimerId);
        simulationTimerId = null;
    }
};

const getSimulationElapsedSeconds = () => {
    if (!simulationState?.startedAt) {
        return simulationState?.elapsedSeconds || 0;
    }

    return Math.floor((Date.now() - simulationState.startedAt) / 1000);
};

const refreshSimulationStats = () => {
    suspectSimulationTime.textContent = formatElapsedTime(getSimulationElapsedSeconds());
    suspectSimulationErrors.textContent = String(simulationState?.errors || 0);

    if (simulationState?.questions?.length) {
        const safeIndex = Math.min(simulationState.index + 1, simulationState.questions.length);
        suspectSimulationProgress.textContent = `${safeIndex} de ${simulationState.questions.length}`;
    } else {
        suspectSimulationProgress.textContent = "-";
    }
};

const normalizeSimulationQuestion = (question, index) => ({
    title: question.title || `Questão ${index + 1}`,
    question: question.question || "Sem enunciado",
    correct: question.correct || question.correctOptionId || "",
    options: Array.isArray(question.options)
        ? question.options.map(option => ({
            id: option.id,
            text: option.text
        }))
        : []
});

const getSimulationQuestions = suspiciousCase => {
    const storedQuestions = Array.isArray(suspiciousCase?.perguntas)
        ? suspiciousCase.perguntas.map(normalizeSimulationQuestion).filter(question => question.options.length > 0)
        : [];

    if (storedQuestions.length > 0) {
        return storedQuestions;
    }

    return (suspiciousCase?.respostas || [])
        .map((answer, index) => {
            const options = Array.isArray(answer.options) && answer.options.length > 0
                ? answer.options
                : [
                    { id: answer.selectedOptionId, text: answer.selectedOptionText || "Resposta do aluno" },
                    { id: answer.correctOptionId, text: answer.correctOptionText || "Resposta correta" }
                ].filter((option, optionIndex, list) => (
                    option.id && list.findIndex(item => item.id === option.id) === optionIndex
                ));

            return normalizeSimulationQuestion({
                title: answer.title || `Questão ${index + 1}`,
                question: answer.question,
                correct: answer.correctOptionId,
                options
            }, index);
        })
        .filter(question => question.options.length > 0 && question.correct);
};

const renderSimulationQuestion = () => {
    if (!simulationState) {
        suspectSimulationQuestion.innerHTML = "";
        suspectSimulationResult.classList.add("hidden");
        refreshSimulationStats();
        return;
    }

    refreshSimulationStats();

    if (simulationState.finished) {
        suspectSimulationQuestion.innerHTML = "";
        suspectSimulationResult.className = "status success";
        suspectSimulationResult.textContent = `Simulado concluído em ${formatElapsedTime(simulationState.elapsedSeconds)} com ${simulationState.errors} ${pluralize(simulationState.errors, "erro", "erros")}.`;
        return;
    }

    const question = simulationState.questions[simulationState.index];

    if (!question) {
        simulationState.finished = true;
        simulationState.elapsedSeconds = getSimulationElapsedSeconds();
        stopSimulationTimer();
        renderSimulationQuestion();
        return;
    }

    suspectSimulationResult.classList.add("hidden");
    suspectSimulationQuestion.innerHTML = `
        <h4>${question.title}</h4>
        <p>${question.question}</p>
        <div class="suspect-option-list">
            ${question.options.map(option => `
                <button type="button" class="button-secondary" data-sim-option="${option.id}">
                    ${option.id}) ${option.text}
                </button>
            `).join("")}
        </div>
    `;
};

const startSuspiciousSimulation = suspiciousCase => {
    const questions = getSimulationQuestions(suspiciousCase);

    if (questions.length === 0) {
        suspectsStatus.className = "status error";
        suspectsStatus.textContent = "Não há questões detalhadas suficientes para gerar o simulado deste caso.";
        return;
    }

    stopSimulationTimer();
    activeSuspiciousCase = suspiciousCase;
    simulationState = {
        questions,
        index: 0,
        errors: 0,
        answers: [],
        startedAt: Date.now(),
        elapsedSeconds: 0,
        finished: false
    };
    suspectSimulationTitle.textContent = `Tentativa em simulado: ${suspiciousCase.nome}`;
    suspectSimulationPanel.classList.remove("hidden");
    suspectSimulationResult.classList.add("hidden");
    suspectsStatus.className = "status info";
    suspectsStatus.textContent = "Simulado local iniciado. Esta tentativa não grava pontuação nem resposta no banco.";
    simulationTimerId = window.setInterval(refreshSimulationStats, 1000);
    renderSimulationQuestion();
};

const finishSimulationIfNeeded = () => {
    if (!simulationState || simulationState.index < simulationState.questions.length) {
        return;
    }

    simulationState.finished = true;
    simulationState.elapsedSeconds = getSimulationElapsedSeconds();
    stopSimulationTimer();
};

const renderSuspiciousCases = () => {
    const visibleCases = getVisibleSuspiciousUsers();

    suspectsBody.innerHTML = "";
    suspectsEmpty.classList.toggle("hidden", visibleCases.length > 0);
    suspectsTable.classList.toggle("hidden", visibleCases.length === 0);

    visibleCases.forEach(suspiciousCase => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td data-label="Nome">${suspiciousCase.nome}</td>
            <td data-label="Sala">${getRoomLabel(suspiciousCase.sala)}</td>
            <td data-label="Tempo original">${formatElapsedTime(suspiciousCase.tempoSegundos)}</td>
            <td data-label="Erros">${suspiciousCase.erros ?? 0}</td>
            <td data-label="Motivo">${getSuspiciousReasonText(suspiciousCase)}</td>
            <td data-label="Ação">
                <button type="button" data-action="start-simulation" data-case-id="${suspiciousCase.id}">
                    Tentativa em simulado
                </button>
            </td>
        `;

        suspectsBody.appendChild(row);
    });
};

const loadSuspiciousCases = async () => {
    suspectsStatus.className = "status info";
    suspectsStatus.textContent = "Carregando casos suspeitos...";

    try {
        suspiciousCases = await ChallengeService.listSuspiciousCases();
        renderSuspiciousCases();
        const visibleCount = getVisibleSuspiciousUsers().length;
        suspectsStatus.className = "status success";
        suspectsStatus.textContent = `${visibleCount} ${pluralize(visibleCount, "usuário suspeito", "usuários suspeitos")} pendente${visibleCount === 1 ? "" : "s"}.`;
    } catch (error) {
        console.error("Erro ao carregar suspeitos:", error);
        suspectsStatus.className = "status error";
        suspectsStatus.textContent = "Não foi possível carregar a lista de suspeitos.";
    }
};

const openSuspectsModal = async () => {
    suspectsModalOverlay.classList.remove("hidden");
    suspectSimulationPanel.classList.add("hidden");
    activeSuspiciousCase = null;
    simulationState = null;
    stopSimulationTimer();
    await loadSuspiciousCases();
};

const closeSuspectsModal = () => {
    suspectsModalOverlay.classList.add("hidden");
    suspectSimulationPanel.classList.add("hidden");
    activeSuspiciousCase = null;
    simulationState = null;
    stopSimulationTimer();
};

const setDefaultChallengeDates = () => {
    const now = new Date();
    const end = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
    const toLocalValue = date => {
        const adjusted = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return adjusted.toISOString().slice(0, 16);
    };

    challengeStartInput.value = toLocalValue(now);
    challengeEndInput.value = toLocalValue(end);

    if (!challengeQuestionCountInput.value) {
        challengeQuestionCountInput.value = "10";
    }
};

const renderRooms = () => {
    roomsBody.innerHTML = "";

    rooms.forEach((room, index) => {
        const row = document.createElement("tr");
        const upDisabled = index === 0 ? "disabled" : "";
        const downDisabled = index === rooms.length - 1 ? "disabled" : "";

        row.innerHTML = `
            <td data-label="Nome">
                <input type="text" value="${room.nome}" data-room-name="${room.id}" />
            </td>
            <td data-label="Ordem">${index + 1}</td>
            <td data-label="Ação">
                <div class="action-group">
                    <button type="button" data-action="move-room" data-direction="up" data-room-id="${room.id}" ${upDisabled}>Subir</button>
                    <button type="button" data-action="move-room" data-direction="down" data-room-id="${room.id}" ${downDisabled}>Descer</button>
                    <button type="button" data-action="rename-room" data-room-id="${room.id}">Renomear</button>
                    <button type="button" data-action="delete-room" data-room-id="${room.id}" class="danger-button">Excluir sala</button>
                </div>
            </td>
        `;

        roomsBody.appendChild(row);
    });
};

const renderChallenges = challenges => {
    challengesBody.innerHTML = "";

    challenges.forEach(challenge => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td data-label="Título">
                <button type="button" data-action="open-challenge" data-challenge-id="${challenge.id}">
                    ${challenge.titulo || "Desafio sem título"}
                </button>
            </td>
            <td data-label="Questões">${challenge.quantidadeQuestoes ?? 0}</td>
            <td data-label="Período">${formatDateTime(challenge.inicioEm)}<br />até ${formatDateTime(challenge.fimEm)}</td>
            <td data-label="Status">${formatVisualStatus(challenge.statusVisual || challenge.status)}</td>
            <td data-label="Participantes">${challenge.totalParticipantes ?? 0}</td>
            <td data-label="Concluídos">${challenge.totalConcluidos ?? 0}</td>
            <td data-label="Ação">Abrir</td>
        `;

        challengesBody.appendChild(row);
    });
};

const openChallengeModal = challengeId => {
    selectedChallenge = challenges.find(challenge => challenge.id === challengeId) || null;

    if (!selectedChallenge) {
        setStatus("error", "Desafio não encontrado.");
        return;
    }

    challengeModalTitle.textContent = selectedChallenge.titulo || "Desafio sem título";
    challengeModalStatus.className = "status info";
    challengeModalStatus.textContent = "Gerencie o desafio selecionado.";
    challengeModalVisualStatus.textContent = formatVisualStatus(selectedChallenge.statusVisual || selectedChallenge.status);
    challengeModalQuestionCount.textContent = String(selectedChallenge.quantidadeQuestoes ?? 0);
    challengeModalStart.textContent = formatDateTime(selectedChallenge.inicioEm);
    challengeModalEnd.textContent = formatDateTime(selectedChallenge.fimEm);
    challengeExtendInput.value = toLocalDateTimeInputValue(selectedChallenge.fimEm);
    challengeModalOverlay.classList.remove("hidden");
};

const closeChallengeModal = () => {
    challengeModalOverlay.classList.add("hidden");
    selectedChallenge = null;
};

const loadPanelData = async () => {
    setStatus("info", "Carregando painel...");

    try {
        const [loadedRooms, loadedChallenges] = await Promise.all([
            RoomService.listRooms(),
            ChallengeService.listChallenges()
        ]);

        rooms = loadedRooms;
        challenges = loadedChallenges;
        selectedChallenge = selectedChallenge
            ? challenges.find(challenge => challenge.id === selectedChallenge.id) || null
            : null;
        if (selectedChallenge) {
            challengeModalTitle.textContent = selectedChallenge.titulo || "Desafio sem título";
            challengeModalStatus.className = "status info";
            challengeModalStatus.textContent = "Gerencie o desafio selecionado.";
            challengeModalVisualStatus.textContent = formatVisualStatus(selectedChallenge.statusVisual || selectedChallenge.status);
            challengeModalQuestionCount.textContent = String(selectedChallenge.quantidadeQuestoes ?? 0);
            challengeModalStart.textContent = formatDateTime(selectedChallenge.inicioEm);
            challengeModalEnd.textContent = formatDateTime(selectedChallenge.fimEm);
            challengeExtendInput.value = toLocalDateTimeInputValue(selectedChallenge.fimEm);
        }
        renderRooms();
        renderChallenges(challenges);
        setStatus(
            "success",
            `${rooms.length} ${pluralize(rooms.length, "sala", "salas")} e ${challenges.length} ${pluralize(challenges.length, "desafio", "desafios")} carregados.`
        );
    } catch (error) {
        console.error("Erro ao carregar painel:", error);
        setStatus("error", "Não foi possível carregar os dados do painel.");
    }
};

roomsBody.addEventListener("click", async event => {
    const button = event.target.closest("button[data-room-id]");

    if (!button) {
        return;
    }

    if (button.dataset.action === "move-room") {
        setStatus("info", "Reordenando sala...");

        try {
            await RoomService.moveRoom(button.dataset.roomId, button.dataset.direction);
            await loadPanelData();
            setStatus("success", "Ordem das salas atualizada.");
        } catch (error) {
            console.error("Erro ao reordenar sala:", error);
            setStatus("error", "Não foi possível reordenar a sala.");
        }

        return;
    }

    if (button.dataset.action === "delete-room") {
        const shouldDelete = window.confirm(
            "Deseja excluir esta sala? A exclusão será bloqueada se ainda houver usuários cadastrados nela."
        );

        if (!shouldDelete) {
            return;
        }

        setStatus("info", "Excluindo sala...");

        try {
            await RoomService.deleteRoom(button.dataset.roomId);
            await loadPanelData();
            setStatus("success", "Sala excluída com sucesso.");
        } catch (error) {
            console.error("Erro ao excluir sala:", error);
            setStatus("error", error?.message || "Não foi possível excluir a sala.");
        }

        return;
    }

    const input = roomsBody.querySelector(`input[data-room-name="${button.dataset.roomId}"]`);
    const newName = input?.value.trim();

    if (!newName) {
        setStatus("error", "Digite um nome válido para a sala.");
        return;
    }

    setStatus("info", "Renomeando sala...");

    try {
        await RoomService.renameRoom(button.dataset.roomId, newName);
        await loadPanelData();
        setStatus("success", "Sala renomeada com sucesso.");
    } catch (error) {
        console.error("Erro ao renomear sala:", error);
        setStatus("error", "Não foi possível renomear a sala.");
    }
});

createRoomButton.addEventListener("click", async () => {
    const name = newRoomInput.value.trim();

    if (!name) {
        setStatus("error", "Digite um nome para criar a sala.");
        return;
    }

    setStatus("info", "Criando sala...");

    try {
        await RoomService.createRoom(name);
        newRoomInput.value = "";
        await loadPanelData();
        setStatus("success", "Sala criada com sucesso.");
    } catch (error) {
        console.error("Erro ao criar sala:", error);
        setStatus("error", "Não foi possível criar a sala.");
    }
});

createChallengeButton.addEventListener("click", async () => {
    if (!isFullAdmin()) {
        setStatus("error", "Apenas administradores podem criar novos desafios.");
        return;
    }

    const quantidadeQuestoes = Number(challengeQuestionCountInput.value);
    const inicioEm = challengeStartInput.value;
    const fimEm = challengeEndInput.value;
    const titulo = challengeTitleInput.value.trim();

    if (!Number.isInteger(quantidadeQuestoes) || quantidadeQuestoes <= 0) {
        setStatus("error", "Informe uma quantidade válida de questões.");
        return;
    }

    if (!inicioEm || !fimEm) {
        setStatus("error", "Defina início e fim do desafio.");
        return;
    }

    if (new Date(fimEm).getTime() <= new Date(inicioEm).getTime()) {
        setStatus("error", "A data final precisa ser maior que a data inicial.");
        return;
    }

    setStatus("info", "Criando desafio...");

    try {
        await ChallengeService.createChallenge({
            quantidadeQuestoes,
            inicioEm: new Date(inicioEm).toISOString(),
            fimEm: new Date(fimEm).toISOString(),
            criadoPor: currentUser?.uid || null,
            titulo
        });
        challengeTitleInput.value = "";
        setDefaultChallengeDates();
        await loadPanelData();
        setStatus("success", "Desafio criado com sucesso.");
    } catch (error) {
        console.error("Erro ao criar desafio:", error);
        setStatus("error", error?.message || "Não foi possível criar o desafio.");
    }
});

generateReportButton.addEventListener("click", async () => {
    if (!isFullAdmin()) {
        setStatus("error", "Apenas administradores podem gerar relatórios.");
        return;
    }

    const shouldGenerate = window.confirm(
        "Gerar relatório pode consumir muitas leituras do Firebase, porque analisa desafios e participações concluídas. Deseja continuar?"
    );

    if (!shouldGenerate) {
        return;
    }

    setStatus("info", "Gerando relatório em PDF...");

    try {
        const reportData = await ChallengeService.getQuestionPerformanceReport();
        const auditData = await ChallengeService.registerReportGeneration({
            uid: currentUser?.uid || null,
            nome: currentProfile?.nomeAcesso || currentProfile?.nomeJogador || currentUser?.email || "Administrador"
        });

        generatePdfReport(reportData, auditData);
        setStatus("success", "Relatório gerado com sucesso.");
    } catch (error) {
        console.error("Erro ao gerar relatório:", error);
        setStatus("error", "Não foi possível gerar o relatório agora.");
    }
});

openSuspectsButton.addEventListener("click", async () => {
    if (!isFullAdmin()) {
        setStatus("error", "Apenas administradores podem acessar suspeitos.");
        return;
    }

    await openSuspectsModal();
});
closeSuspectsModalButton.addEventListener("click", closeSuspectsModal);
refreshSuspectsButton.addEventListener("click", loadSuspiciousCases);
suspectsModalOverlay.addEventListener("click", event => {
    if (event.target === suspectsModalOverlay) {
        closeSuspectsModal();
    }
});

generateSuspectsReportButton.addEventListener("click", async () => {
    if (!isFullAdmin()) {
        suspectsStatus.className = "status error";
        suspectsStatus.textContent = "Apenas administradores podem gerar relatório de suspeitos.";
        return;
    }

    try {
        if (suspiciousCases.length === 0) {
            suspiciousCases = await ChallengeService.listSuspiciousCases();
            renderSuspiciousCases();
        }

        generateSuspiciousPdfReport(suspiciousCases);
        suspectsStatus.className = "status success";
        suspectsStatus.textContent = "Relatório de suspeitos gerado com sucesso.";
    } catch (error) {
        console.error("Erro ao gerar relatório de suspeitos:", error);
        suspectsStatus.className = "status error";
        suspectsStatus.textContent = "Não foi possível gerar o relatório de suspeitos.";
    }
});

suspectsBody.addEventListener("click", event => {
    const button = event.target.closest("button[data-case-id]");

    if (!button || button.dataset.action !== "start-simulation") {
        return;
    }

    const suspiciousCase = suspiciousCases.find(item => item.id === button.dataset.caseId);

    if (!suspiciousCase) {
        suspectsStatus.className = "status error";
        suspectsStatus.textContent = "Caso suspeito não encontrado.";
        return;
    }

    startSuspiciousSimulation(suspiciousCase);
});

suspectSimulationQuestion.addEventListener("click", event => {
    const button = event.target.closest("button[data-sim-option]");

    if (!button || !simulationState || simulationState.finished) {
        return;
    }

    const question = simulationState.questions[simulationState.index];
    const selectedOptionId = button.dataset.simOption;
    const isCorrect = selectedOptionId === question.correct;

    if (!isCorrect) {
        simulationState.errors += 1;
    }

    simulationState.answers.push({
        questionNumber: simulationState.index + 1,
        selectedOptionId,
        correctOptionId: question.correct,
        isCorrect
    });
    simulationState.index += 1;
    finishSimulationIfNeeded();
    renderSimulationQuestion();
});

restartSuspectSimulationButton.addEventListener("click", () => {
    if (!activeSuspiciousCase) {
        suspectsStatus.className = "status error";
        suspectsStatus.textContent = "Selecione um caso suspeito para gerar uma nova tentativa.";
        return;
    }

    startSuspiciousSimulation(activeSuspiciousCase);
});

closeSuspectCaseButton.addEventListener("click", async () => {
    if (!activeSuspiciousCase) {
        return;
    }

    const shouldClose = window.confirm(
        "Encerrar este caso vai remover as marcações de suspeita desse usuário no banco. Deseja continuar?"
    );

    if (!shouldClose) {
        return;
    }

    suspectsStatus.className = "status info";
    suspectsStatus.textContent = "Encerrando caso suspeito...";

    try {
        const clearedCount = await ChallengeService.clearSuspiciousCasesForUser(
            activeSuspiciousCase.uid,
            activeSuspiciousCase.id
        );
        stopSimulationTimer();
        activeSuspiciousCase = null;
        simulationState = null;
        suspectSimulationPanel.classList.add("hidden");
        await loadSuspiciousCases();
        suspectsStatus.className = "status success";
        suspectsStatus.textContent = `${clearedCount} ${pluralize(clearedCount, "menção de suspeita removida", "menções de suspeita removidas")}.`;
    } catch (error) {
        console.error("Erro ao encerrar caso suspeito:", error);
        suspectsStatus.className = "status error";
        suspectsStatus.textContent = "Não foi possível encerrar o caso suspeito.";
    }
});

challengesBody.addEventListener("click", event => {
    const button = event.target.closest("button[data-challenge-id]");

    if (!button || button.dataset.action !== "open-challenge") {
        return;
    }

    openChallengeModal(button.dataset.challengeId);
});

closeChallengeModalButton.addEventListener("click", closeChallengeModal);
challengeModalOverlay.addEventListener("click", event => {
    if (event.target === challengeModalOverlay) {
        closeChallengeModal();
    }
});

cancelChallengeButton.addEventListener("click", async () => {
    if (!selectedChallenge) {
        return;
    }

    const shouldCancel = window.confirm(
        "Deseja cancelar este desafio? O cancelamento é lógico e a pontuação dele deixará de contar no ranking."
    );

    if (!shouldCancel) {
        return;
    }

    challengeModalStatus.className = "status info";
    challengeModalStatus.textContent = "Cancelando desafio...";

    try {
        await ChallengeService.cancelChallenge(selectedChallenge.id);
        await loadPanelData();
        closeChallengeModal();
        setStatus("success", "Desafio cancelado com sucesso.");
    } catch (error) {
        console.error("Erro ao cancelar desafio:", error);
        challengeModalStatus.className = "status error";
        challengeModalStatus.textContent = "Não foi possível cancelar o desafio.";
    }
});

endChallengeButton.addEventListener("click", async () => {
    if (!selectedChallenge) {
        return;
    }

    const shouldEnd = window.confirm(
        "Deseja encerrar este desafio antes do prazo previsto?"
    );

    if (!shouldEnd) {
        return;
    }

    challengeModalStatus.className = "status info";
    challengeModalStatus.textContent = "Encerrando desafio...";

    try {
        await ChallengeService.endChallenge(selectedChallenge.id);
        await loadPanelData();
        closeChallengeModal();
        setStatus("success", "Desafio encerrado com sucesso.");
    } catch (error) {
        console.error("Erro ao encerrar desafio:", error);
        challengeModalStatus.className = "status error";
        challengeModalStatus.textContent = "Não foi possível encerrar o desafio.";
    }
});

extendChallengeButton.addEventListener("click", async () => {
    if (!selectedChallenge) {
        return;
    }

    const newEnd = challengeExtendInput.value;

    if (!newEnd) {
        challengeModalStatus.className = "status error";
        challengeModalStatus.textContent = "Defina um novo prazo válido.";
        return;
    }

    if (new Date(newEnd).getTime() <= new Date(selectedChallenge.inicioEm).getTime()) {
        challengeModalStatus.className = "status error";
        challengeModalStatus.textContent = "O novo prazo precisa ser maior que a data de início.";
        return;
    }

    challengeModalStatus.className = "status info";
    challengeModalStatus.textContent = "Salvando novo prazo...";

    try {
        await ChallengeService.extendChallenge(selectedChallenge.id, new Date(newEnd).toISOString());
        await loadPanelData();
        challengeModalStatus.className = "status success";
        challengeModalStatus.textContent = "Prazo prolongado com sucesso.";
    } catch (error) {
        console.error("Erro ao prolongar prazo:", error);
        challengeModalStatus.className = "status error";
        challengeModalStatus.textContent = "Não foi possível prolongar o prazo.";
    }
});

activateChallengeNowButton.addEventListener("click", async () => {
    if (!selectedChallenge) {
        return;
    }

    const shouldActivate = window.confirm(
        "Deseja ativar este desafio agora, antecipando o início?"
    );

    if (!shouldActivate) {
        return;
    }

    challengeModalStatus.className = "status info";
    challengeModalStatus.textContent = "Ativando desafio agora...";

    try {
        await ChallengeService.activateChallengeNow(selectedChallenge.id);
        await loadPanelData();
        challengeModalStatus.className = "status success";
        challengeModalStatus.textContent = "Desafio ativado com sucesso.";
    } catch (error) {
        console.error("Erro ao ativar desafio:", error);
        challengeModalStatus.className = "status error";
        challengeModalStatus.textContent = "Não foi possível ativar o desafio.";
    }
});

adminLogoutButton.addEventListener("click", async () => {
    await AuthService.signOutUser();
});

AuthService.watchSession(async user => {
    if (!user) {
        redirectToLogin();
        return;
    }

    currentUser = user;
    currentProfile = await AuthService.loadProfile(user.uid);

    if (!AuthService.isApprovedProfile(currentProfile)) {
        await AuthService.signOutUser();
        redirectToLogin();
        return;
    }

    userLink.classList.remove("hidden");
    adminLogoutButton.classList.remove("hidden");

    if (!AuthService.isAdministrativeProfile(currentProfile)) {
        panel.hidden = true;
        empty.hidden = false;
        setStatus("error", "Acesso restrito. Esta página é exclusiva para administradores e moderadores.");
        return;
    }

    empty.hidden = true;
    panel.hidden = false;
    [challengeTitleInput, challengeQuestionCountInput, challengeStartInput, challengeEndInput, createChallengeButton]
        .forEach(element => element.classList.toggle("hidden", !isFullAdmin()));
    generateReportButton.classList.toggle("hidden", !isFullAdmin());
    openSuspectsButton.classList.toggle("hidden", !isFullAdmin());
    setDefaultChallengeDates();
    await loadPanelData();
});
