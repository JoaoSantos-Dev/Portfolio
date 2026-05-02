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

const status = document.getElementById("userStatus");
const summary = document.getElementById("userSummary");
const empty = document.getElementById("userEmpty");
const displayName = document.getElementById("userDisplayName");
const displayEmail = document.getElementById("userDisplayEmail");
const displayRoom = document.getElementById("userDisplayRoom");
const displayRole = document.getElementById("userDisplayRole");
const profileNameInput = document.getElementById("profileNameInput");
const updateProfileNameButton = document.getElementById("updateProfileNameButton");
const currentPasswordInput = document.getElementById("currentPasswordInput");
const newPasswordInput = document.getElementById("newPasswordInput");
const confirmPasswordInput = document.getElementById("confirmPasswordInput");
const changePasswordButton = document.getElementById("changePasswordButton");
const logoutButton = document.getElementById("logoutButton");
const topLogoutButton = document.getElementById("topLogoutButton");
const adminLink = document.getElementById("adminLink");
let rooms = [];

const getRoomLabel = roomId => rooms.find(room => room.id === roomId)?.nome || "Sem sala";

const redirectToLogin = () => {
    const returnTo = encodeURIComponent("./user.html");
    window.location.replace(`./cacaaotesouro.html?redirect=${returnTo}`);
};

const getErrorMessage = error => {
    const code = error?.code || "";

    if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        return "A senha atual está incorreta.";
    }

    if (code === "auth/weak-password") {
        return "A nova senha é muito fraca.";
    }

    if (code === "auth/too-many-requests") {
        return "Muitas tentativas. Aguarde um pouco antes de tentar novamente.";
    }

    return error?.message || "Erro desconhecido.";
};

const setStatus = (type, message) => {
    status.className = `status ${type}`;
    status.textContent = message;
};

const renderProfile = (user, profile) => {
    displayName.textContent = profile?.nomeAcesso || "Sem nome";
    displayEmail.textContent = user.email || "-";
    displayRoom.textContent = getRoomLabel(profile?.sala);
    displayRole.textContent = AuthService.getRoleLabel(profile?.role || "jogador");
    profileNameInput.value = profile?.nomeJogador || profile?.nomeAcesso || "";
    adminLink.classList.toggle("hidden", !AuthService.isAdministrativeProfile(profile));
    summary.hidden = false;
    empty.hidden = true;
};

updateProfileNameButton.addEventListener("click", async () => {
    const user = auth.currentUser;
    const newName = profileNameInput.value.trim();

    if (!user) {
        setStatus("error", "Você precisa estar autenticado.");
        return;
    }

    if (newName.length < 2) {
        setStatus("error", "O nome precisa ter pelo menos 2 caracteres.");
        return;
    }

    setStatus("info", "Salvando nickname...");

    try {
        await AuthService.updateOwnProfile(user.uid, { nomeJogador: newName });
        localStorage.setItem(CONFIG.storageKeys.playerName, newName);
        setStatus("success", "Nickname do jogador atualizado com sucesso.");
    } catch (error) {
        console.error("Erro ao atualizar nome:", error);
        setStatus("error", "Não foi possível atualizar o nickname do jogador.");
    }
});

changePasswordButton.addEventListener("click", async () => {
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        setStatus("error", "Preencha a senha atual, a nova senha e a confirmação.");
        return;
    }

    if (newPassword.length < 6) {
        setStatus("error", "A nova senha precisa ter pelo menos 6 caracteres.");
        return;
    }

    if (newPassword !== confirmPassword) {
        setStatus("error", "A confirmação da nova senha não confere.");
        return;
    }

    setStatus("info", "Atualizando senha...");

    try {
        await AuthService.changePassword(currentPassword, newPassword);
        currentPasswordInput.value = "";
        newPasswordInput.value = "";
        confirmPasswordInput.value = "";
        setStatus("success", "Senha alterada com sucesso.");
    } catch (error) {
        console.error("Erro ao alterar senha:", error);
        setStatus("error", getErrorMessage(error));
    }
});

logoutButton.addEventListener("click", async () => {
    await AuthService.signOutUser();
});

topLogoutButton.addEventListener("click", async () => {
    await AuthService.signOutUser();
});

AuthService.watchSession(async user => {
    if (!user) {
        redirectToLogin();
        return;
    }

    const profile = await AuthService.loadProfile(user.uid);

    if (!AuthService.isApprovedProfile(profile)) {
        await AuthService.signOutUser();
        redirectToLogin();
        return;
    }

    rooms = await RoomService.listRooms();
    topLogoutButton.classList.remove("hidden");
    renderProfile(user, profile);
    setStatus("success", "Perfil carregado com sucesso.");
});
