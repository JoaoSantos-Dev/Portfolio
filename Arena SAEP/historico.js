import { auth, CONFIG, db } from "./game-config.js";
import { createAuthService } from "./game-auth.js";
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
const ChallengeService = createChallengeService({ db, CONFIG, AuthService });

const historyStatus = document.getElementById("historyStatus");
const historyEmpty = document.getElementById("historyEmpty");
const historyTable = document.getElementById("historyTable");
const historyBody = document.getElementById("historyBody");
const historyUserLink = document.getElementById("historyUserLink");
const historyAdminLink = document.getElementById("historyAdminLink");
const historyLogoutButton = document.getElementById("historyLogoutButton");

const redirectToLogin = () => {
    const returnTo = encodeURIComponent("./historico.html");
    window.location.replace(`./cacaaotesouro.html?redirect=${returnTo}`);
};

const formatDate = value => {
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
    const safeSeconds = Number(totalSeconds) || 0;
    const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
    const seconds = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
};

const formatChallengeStatus = status => {
    if (status === "ativo") {
        return "Ativo";
    }

    if (status === "encerrado") {
        return "Encerrado";
    }

    if (status === "cancelado") {
        return "Cancelado";
    }

    return status || "-";
};

const formatPlayerStatus = status => {
    if (status === "nao_iniciado") {
        return "Não iniciado";
    }

    if (status === "em_andamento") {
        return "Em andamento";
    }

    if (status === "concluido") {
        return "Concluído";
    }

    if (status === "expirado") {
        return "Expirado / não respondido";
    }

    if (status === "cancelado") {
        return "Cancelado";
    }

    return status || "-";
};

const loadHistory = async uid => {
    historyStatus.textContent = "Carregando histórico...";
    historyStatus.className = "status info";
    historyEmpty.hidden = true;
    historyTable.hidden = true;
    historyBody.innerHTML = "";

    try {
        const history = await ChallengeService.getUserHistory(uid);

        if (history.length === 0) {
            historyStatus.textContent = "Histórico carregado.";
            historyEmpty.hidden = false;
            return;
        }

        history.forEach(item => {
            const challenge = item.challenge || {};
            const participation = item.participation || {};
            const totalQuestions = Number(challenge.quantidadeQuestoes) || 0;
            const reached = totalQuestions > 0
                ? Math.min(
                    (Number(participation.progressoAtual) || 0) + (participation.status === "concluido" ? 1 : 0),
                    totalQuestions
                )
                : 0;
            const progress = totalQuestions > 0 ? `${reached}/${totalQuestions}` : "-";
            const row = document.createElement("tr");

            row.innerHTML = `
                <td data-label="Desafio">${challenge.titulo || "Desafio sem título"}</td>
                <td data-label="Período">${formatDate(challenge.inicioEm)}<br />até ${formatDate(challenge.fimEm)}</td>
                <td data-label="Status do desafio">${formatChallengeStatus(challenge.status)}</td>
                <td data-label="Seu status">${formatPlayerStatus(item.statusAluno)}</td>
                <td data-label="Pontuação">${participation.pontuacao ?? 0}</td>
                <td data-label="Tempo">${formatElapsedTime(participation.tempoSegundos ?? 0)}</td>
                <td data-label="Erros">${participation.erros ?? 0}</td>
                <td data-label="Progresso">${progress}</td>
                <td data-label="Conclusão">${formatDate(participation.concluidoEm)}</td>
            `;

            historyBody.appendChild(row);
        });

        historyStatus.textContent = "Histórico carregado.";
        historyTable.hidden = false;
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        historyStatus.textContent = "Não foi possível carregar o histórico.";
        historyStatus.className = "status error";
    }
};

historyLogoutButton.addEventListener("click", async () => {
    await AuthService.signOutUser();
});

AuthService.watchSession(async user => {
    if (!user) {
        redirectToLogin();
        return;
    }

    const profile = await AuthService.loadProfile(user.uid);
    historyUserLink.classList.remove("hidden");
    historyAdminLink.classList.toggle("hidden", !AuthService.isAdministrativeProfile(profile));
    historyLogoutButton.classList.remove("hidden");
    await loadHistory(user.uid);
});
