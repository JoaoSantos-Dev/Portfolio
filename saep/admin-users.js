import { auth, CONFIG, db } from "./game-config.js";
import { createAuthService } from "./game-auth.js";
import { createRoomService } from "./room-service.js";

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

const PAGE_SIZE = 10;

const status = document.getElementById("adminUsersStatus");
const empty = document.getElementById("adminUsersEmpty");
const panel = document.getElementById("adminUsersPanel");
const searchInput = document.getElementById("adminUsersSearchInput");
const searchButton = document.getElementById("adminUsersSearchButton");
const syncRankingRoomsButton = document.getElementById("syncRankingRoomsButton");
const activeUsersToggle = document.getElementById("activeUsersToggle");
const activeUsersCount = document.getElementById("activeUsersCount");
const activeUsersSection = document.getElementById("activeUsersSection");
const activeUsersBody = document.getElementById("activeUsersBody");
const activeUsersPrevButton = document.getElementById("activeUsersPrevButton");
const activeUsersNextButton = document.getElementById("activeUsersNextButton");
const activeUsersPageInfo = document.getElementById("activeUsersPageInfo");
const pendingUsersToggle = document.getElementById("pendingUsersToggle");
const pendingUsersCount = document.getElementById("pendingUsersCount");
const pendingUsersSection = document.getElementById("pendingUsersSection");
const pendingUsersBody = document.getElementById("pendingUsersBody");
const pendingUsersEmptyState = document.getElementById("pendingUsersEmptyState");
const pendingUsersPrevButton = document.getElementById("pendingUsersPrevButton");
const pendingUsersNextButton = document.getElementById("pendingUsersNextButton");
const pendingUsersPageInfo = document.getElementById("pendingUsersPageInfo");
const userLink = document.getElementById("adminUsersUserLink");
const logoutButton = document.getElementById("adminUsersLogoutButton");

let currentUser = null;
let currentProfile = null;
let rooms = [];
let allUsers = [];
let activePage = 1;
let pendingPage = 1;

const redirectToLogin = () => {
    const returnTo = encodeURIComponent("./admin-users.html");
    window.location.replace(`./arena.html?redirect=${returnTo}`);
};

const setStatus = (type, message) => {
    status.className = `status ${type}`;
    status.textContent = message;
};

const pluralize = (count, singular, plural = `${singular}s`) => (
    count === 1 ? singular : plural
);

const getRoomLabel = roomId => rooms.find(room => room.id === roomId)?.nome || "Sem sala";
const canManageRoles = () => AuthService.isAdminProfile(currentProfile);
const getRoleOptions = selectedRole => ["jogador", "moderador", "admin"].map(role => `
    <option value="${role}" ${role === selectedRole ? "selected" : ""}>${AuthService.getRoleLabel(role)}</option>
`).join("");

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

const getApprovalStatus = user => AuthService.getApprovalStatus(user);

const getFilteredUsers = () => {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
        return allUsers;
    }

    return allUsers.filter(user => {
        const name = (user.nomeAcesso || "").toLowerCase();
        const email = (user.email || "").toLowerCase();
        return name.includes(term) || email.includes(term);
    });
};

const paginate = (items, page) => {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * PAGE_SIZE;

    return {
        items: items.slice(start, start + PAGE_SIZE),
        page: safePage,
        totalPages
    };
};

const getRoomOptions = selectedRoom => rooms.map(room => `
    <option value="${room.id}" ${room.id === selectedRoom ? "selected" : ""}>${room.nome}</option>
`).join("");

const renderApprovedUsers = users => {
    const approvedUsers = users.filter(user => getApprovalStatus(user) === "aprovado");
    activeUsersCount.textContent = String(approvedUsers.length);

    const pagination = paginate(approvedUsers, activePage);
    activePage = pagination.page;
    activeUsersBody.innerHTML = "";

    pagination.items.forEach(user => {
        const row = document.createElement("tr");
        const isCurrentUser = currentUser?.uid === user.uid;
        const protectedAction = isCurrentUser ? "disabled" : "";
        const roleAction = canManageRoles()
            ? `
                <select data-role-select="${user.uid}" ${protectedAction}>
                    ${getRoleOptions(user.role || "jogador")}
                </select>
                <button type="button" data-action="role" data-uid="${user.uid}" ${protectedAction}>Salvar perfil</button>
            `
            : `<span class="pagination-info">Sem permissão para alterar perfil</span>`;

        row.innerHTML = `
            <td data-label="Nome">${user.nomeAcesso || "-"}</td>
            <td data-label="E-mail">${user.email || "-"}</td>
            <td data-label="Sala">
                <select data-room-select="${user.uid}">
                    ${getRoomOptions(user.sala)}
                </select>
                <button type="button" data-action="room" data-uid="${user.uid}">Salvar sala</button>
            </td>
            <td data-label="Status">
                <select data-active-select="${user.uid}">
                    <option value="true" ${user.ativo !== false ? "selected" : ""}>Ativo</option>
                    <option value="false" ${user.ativo === false ? "selected" : ""}>Inativo</option>
                </select>
                <button type="button" data-action="active" data-uid="${user.uid}">Salvar status</button>
            </td>
            <td data-label="Perfil">${AuthService.getRoleLabel(user.role || "jogador")}</td>
            <td data-label="Ação">
                <div class="action-group">
                    ${roleAction}
                    <button type="button" data-action="delete" data-uid="${user.uid}" class="danger-button" ${protectedAction}>Excluir usuário</button>
                </div>
            </td>
        `;

        activeUsersBody.appendChild(row);
    });

    activeUsersPageInfo.textContent = `Página ${pagination.page} de ${pagination.totalPages}`;
    activeUsersPrevButton.disabled = pagination.page <= 1;
    activeUsersNextButton.disabled = pagination.page >= pagination.totalPages;
};

const renderPendingUsers = users => {
    const pendingUsers = users.filter(user => getApprovalStatus(user) === "pendente");
    pendingUsersCount.textContent = String(pendingUsers.length);

    const pagination = paginate(pendingUsers, pendingPage);
    pendingPage = pagination.page;
    pendingUsersBody.innerHTML = "";
    pendingUsersEmptyState.classList.toggle("hidden", pendingUsers.length > 0);

    pagination.items.forEach(user => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td data-label="Nome">${user.nomeAcesso || "-"}</td>
            <td data-label="E-mail">${user.email || "-"}</td>
            <td data-label="Sala">${getRoomLabel(user.sala)}</td>
            <td data-label="Cadastro">${formatDateTime(user.criadoEm)}</td>
            <td data-label="Ação">
                <div class="action-group">
                    <button type="button" data-action="approve" data-uid="${user.uid}">Aceitar</button>
                    <button type="button" data-action="reject" data-uid="${user.uid}" class="danger-button">Recusar</button>
                </div>
            </td>
        `;

        pendingUsersBody.appendChild(row);
    });

    pendingUsersPageInfo.textContent = `Página ${pagination.page} de ${pagination.totalPages}`;
    pendingUsersPrevButton.disabled = pagination.page <= 1;
    pendingUsersNextButton.disabled = pagination.page >= pagination.totalPages;
};

const renderLists = () => {
    const filteredUsers = getFilteredUsers();
    renderApprovedUsers(filteredUsers);
    renderPendingUsers(filteredUsers);
};

const refreshSyncRankingButton = () => {
    const pendingCount = allUsers.filter(user => user.rankingSyncPendente === true).length;
    syncRankingRoomsButton.textContent = pendingCount > 0
        ? `Atualizar ranking (${pendingCount})`
        : "Atualizar ranking";
};

const loadUsers = async () => {
    setStatus("info", "Carregando usuários...");

    try {
        [rooms, allUsers] = await Promise.all([
            RoomService.listRooms(),
            AuthService.searchUsersByName("")
        ]);
        renderLists();
        refreshSyncRankingButton();
        setStatus(
            "success",
            `${allUsers.length} ${pluralize(allUsers.length, "usuário", "usuários")} carregados.`
        );
    } catch (error) {
        console.error("Erro ao carregar usuários:", error);
        setStatus("error", "Não foi possível carregar a lista de usuários.");
    }
};

const toggleSection = (button, section) => {
    const isHidden = section.classList.contains("hidden");
    section.classList.toggle("hidden", !isHidden);
    button.setAttribute("aria-expanded", String(isHidden));
};

searchButton.addEventListener("click", () => {
    activePage = 1;
    pendingPage = 1;
    renderLists();
    refreshSyncRankingButton();
    setStatus("success", "Lista de usuários atualizada.");
});

syncRankingRoomsButton.addEventListener("click", async () => {
    syncRankingRoomsButton.disabled = true;
    setStatus("info", "Atualizando ranking com as salas corrigidas...");

    try {
        const result = await AuthService.syncPendingRoomRankingUpdates();
        await loadUsers();

        if (!result?.rankingCacheUpdated) {
            setStatus("success", "Ranking já estava sincronizado com as salas atuais.");
            return;
        }

        setStatus(
            "success",
            `Ranking atualizado: ${result.affectedUsers} ${pluralize(result.affectedUsers, "usuário", "usuários")} e ${result.updatedParticipations} ${pluralize(result.updatedParticipations, "participação", "participações")} sincronizados.`
        );
    } catch (error) {
        console.error("Erro ao atualizar ranking:", error);
        setStatus("error", "Não foi possível atualizar o ranking com as salas corrigidas.");
    } finally {
        syncRankingRoomsButton.disabled = false;
    }
});

searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        searchButton.click();
    }
});

activeUsersToggle.addEventListener("click", () => toggleSection(activeUsersToggle, activeUsersSection));
pendingUsersToggle.addEventListener("click", () => toggleSection(pendingUsersToggle, pendingUsersSection));

activeUsersPrevButton.addEventListener("click", () => {
    activePage -= 1;
    renderLists();
});

activeUsersNextButton.addEventListener("click", () => {
    activePage += 1;
    renderLists();
});

pendingUsersPrevButton.addEventListener("click", () => {
    pendingPage -= 1;
    renderLists();
});

pendingUsersNextButton.addEventListener("click", () => {
    pendingPage += 1;
    renderLists();
});

activeUsersBody.addEventListener("click", async event => {
    const button = event.target.closest("button[data-uid]");
    if (!button) {
        return;
    }

    if (button.dataset.action === "delete") {
        const shouldDelete = window.confirm(
            "Isso vai excluir o perfil do usuário e os registros dele no Firestore. A conta do Firebase Auth pode continuar existindo. Deseja continuar?"
        );

        if (!shouldDelete) {
            return;
        }

        setStatus("info", "Excluindo dados do usuário...");

        try {
            await AuthService.deleteUserData(button.dataset.uid);
            await loadUsers();
            setStatus("success", "Dados do usuário excluídos do sistema.");
        } catch (error) {
            console.error("Erro ao excluir usuário:", error);
            setStatus("error", "Não foi possível excluir os dados do usuário.");
        }

        return;
    }

    if (button.dataset.action === "room") {
        const select = activeUsersBody.querySelector(`select[data-room-select="${button.dataset.uid}"]`);
        const roomId = select?.value;

        if (!roomId || !rooms.some(room => room.id === roomId)) {
            setStatus("error", "Selecione uma sala válida.");
            return;
        }

        setStatus("info", "Salvando sala do usuário...");

        try {
            const result = await AuthService.updateUserProfile(button.dataset.uid, { sala: roomId });
            await loadUsers();
            const message = result?.rankingSyncPending
                ? "Sala do usuário atualizada. Clique em Atualizar ranking para mover a pontuação para a sala correta."
                : result?.rankingCacheUpdated === false
                    ? "Sala do usuário atualizada. O ranking pode ficar temporariamente desatualizado."
                    : "Sala do usuário atualizada com sucesso.";

            setStatus("success", message);
        } catch (error) {
            console.error("Erro ao atualizar sala:", error);
            setStatus("error", "Não foi possível atualizar a sala do usuário.");
        }

        return;
    }

    if (button.dataset.action === "active") {
        const select = activeUsersBody.querySelector(`select[data-active-select="${button.dataset.uid}"]`);
        const active = select?.value === "true";

        setStatus("info", "Salvando status do usuário...");

        try {
            const result = await AuthService.updateUserActive(button.dataset.uid, active);
            await loadUsers();
            setStatus(
                "success",
                result?.rankingCacheUpdated === false
                    ? "Status do usuário atualizado. O ranking pode ficar temporariamente desatualizado."
                    : "Status do usuário atualizado com sucesso."
            );
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            setStatus("error", "Não foi possível atualizar o status do usuário.");
        }

        return;
    }

    setStatus("info", "Salvando perfil do usuário...");

    try {
        if (!canManageRoles()) {
            setStatus("error", "Apenas administradores podem alterar perfis de permissão.");
            return;
        }

        const select = activeUsersBody.querySelector(`select[data-role-select="${button.dataset.uid}"]`);
        const role = select?.value;

        if (!role) {
            setStatus("error", "Selecione um perfil válido.");
            return;
        }

        await AuthService.updateUserRole(button.dataset.uid, role);
        await loadUsers();
        setStatus("success", "Perfil do usuário atualizado com sucesso.");
    } catch (error) {
        console.error("Erro ao atualizar perfil:", error);
        setStatus("error", "Não foi possível atualizar o perfil do usuário.");
    }
});

pendingUsersBody.addEventListener("click", async event => {
    const button = event.target.closest("button[data-uid]");
    if (!button) {
        return;
    }

    const approvalStatus = button.dataset.action === "approve" ? "aprovado" : "recusado";
    setStatus("info", approvalStatus === "aprovado" ? "Aprovando cadastro..." : "Recusando cadastro...");

    try {
        await AuthService.updateUserApprovalStatus(button.dataset.uid, approvalStatus);
        await loadUsers();
        setStatus(
            "success",
            approvalStatus === "aprovado"
                ? "Cadastro aprovado com sucesso."
                : "Cadastro recusado com sucesso."
        );
    } catch (error) {
        console.error("Erro ao revisar cadastro:", error);
        setStatus("error", "Não foi possível atualizar o status de aprovação do usuário.");
    }
});

logoutButton.addEventListener("click", async () => {
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

    if (!AuthService.isAdministrativeProfile(currentProfile)) {
        panel.hidden = true;
        empty.hidden = false;
        setStatus("error", "Acesso restrito. Esta página é exclusiva para administradores e moderadores.");
        return;
    }

    userLink.classList.remove("hidden");
    logoutButton.classList.remove("hidden");
    empty.hidden = true;
    panel.hidden = false;
    await loadUsers();
});
