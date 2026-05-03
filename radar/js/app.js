(function () {
  const sections = [
    {
      key: "curadoria",
      label: "Curadoria",
      context: "Cursos, conteúdos, ferramentas e referências úteis para evoluir em GameDev.",
      emptyTitle: "Nenhum recurso de curadoria cadastrado ainda.",
      emptyDescription: "A curadoria ainda está vazia. Volte em breve para novos recursos."
    },
    {
      key: "profissionais",
      label: "Profissionais",
      context: "Portfólios e Referências de grandes profissionais da indústria, para estudar.",
      emptyTitle: "Nenhuma referência profissional cadastrada ainda.",
      emptyDescription: "Ainda não há referências profissionais nesta seção."
    },
    {
      key: "empresas",
      label: "Empresas",
      context: "Estúdios e empresas para acompanhar vagas, oportunidades e traçar metas profissionais.",
      emptyTitle: "Nenhuma empresa cadastrada ainda.",
      emptyDescription: "Ainda não há empresas cadastradas nesta seção."
    }
  ];

  const categoryBySection = {
    curadoria: [
      "Curso",
      "Vídeo",
      "Artigo",
      "Ferramenta",
      "Asset",
      "Comunidade",
      "Evento",
      "Documentação",
      "Repositório",
      "Dica",
      "Vaga"
    ],
    profissionais: [
      "Profissional",
      "Portfólio",
      "Gameplay Programming",
      "Game Design",
      "Level Design",
      "Technical Art",
      "Environment Art",
      "Character Art",
      "UI/UX",
      "Narrative Design",
      "Producer",
      "Audio",
      "QA"
    ],
    empresas: [
      "AAA",
      "AA",
      "Indie",
      "Mobile",
      "Outsourcing",
      "Publisher",
      "Serious Games",
      "Game Tech",
      "QA/Localization",
      "Porting",
      "Estúdio Brasileiro",
      "Estúdio Internacional"
    ]
  };

  const state = {
    query: "",
    section: "curadoria",
    category: "",
    tag: "",
    resources: [],
    isLoadingResources: true,
    resourcesError: ""
  };

  const elements = {
    sectionList: document.querySelector("#sectionList"),
    categoryList: document.querySelector("#categoryList"),
    sectionContext: document.querySelector("#sectionContext"),
    searchInput: document.querySelector("#searchInput"),
    resourceGrid: document.querySelector("#resourceGrid"),
    resultCount: document.querySelector("#resultCount"),
    clearFilters: document.querySelector("#clearFilters"),
    emptyState: document.querySelector("#emptyState"),
    activeFilterBar: document.querySelector("#activeFilterBar"),
    themeToggle: document.querySelector("#themeToggle"),
    brand: document.querySelector(".brand"),
    sessionActions: document.querySelector("#sessionActions"),
    adminButton: document.querySelector("#adminButton"),
    viewResourcesButton: document.querySelector("#viewResourcesButton"),
    migrateLocalButton: document.querySelector("#migrateLocalButton"),
    logoutButton: document.querySelector("#logoutButton"),
    authDialog: document.querySelector("#authDialog"),
    adminPanelDialog: document.querySelector("#adminPanelDialog"),
    pendingUsersDialog: document.querySelector("#pendingUsersDialog"),
    authMessage: document.querySelector("#authMessage"),
    loginPanel: document.querySelector("#loginPanel"),
    registerPanel: document.querySelector("#registerPanel"),
    loginEmail: document.querySelector("#loginEmail"),
    loginPassword: document.querySelector("#loginPassword"),
    loginSubmit: document.querySelector("#loginSubmit"),
    registerName: document.querySelector("#registerName"),
    registerEmail: document.querySelector("#registerEmail"),
    registerPassword: document.querySelector("#registerPassword"),
    registerSubmit: document.querySelector("#registerSubmit"),
    openPendingUsers: document.querySelector("#openPendingUsers"),
    pendingUsersList: document.querySelector("#pendingUsersList"),
    approvedUsersList: document.querySelector("#approvedUsersList"),
    pendingUsersCount: document.querySelector("#pendingUsersCount"),
    approvedUsersCount: document.querySelector("#approvedUsersCount"),
    rejectAllPending: document.querySelector("#rejectAllPending"),
    adminLocalCount: document.querySelector("#adminLocalCount"),
    adminDraftStatus: document.querySelector("#adminDraftStatus")
  };

  const THEME_STORAGE_KEY = "radar-theme";
  const CUSTOM_RESOURCES_KEY = "radar-custom-resources";
  const NEW_CARD_DRAFT_KEY = "radar-admin-card-draft-new";
  const stateAuth = {
    user: null,
    profile: null,
    pendingUsers: [],
    approvedUsers: []
  };

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function normalizeSection(section, type) {
    const validSections = sections.map((item) => item.key);
    const sectionValue = normalizeText(section);

    if (validSections.includes(sectionValue)) {
      return sectionValue;
    }

    const normalizedType = normalizeText(type);
    const empresaTypes = [
      "empresa",
      "empresas",
      "estudio",
      "studio",
      "aaa",
      "aa",
      "indie",
      "mobile",
      "outsourcing",
      "publisher",
      "serious games",
      "game tech",
      "qa/localization",
      "porting",
      "estudio brasileiro",
      "estudio internacional"
    ];
    const profissionalTypes = [
      "profissional",
      "profissionais",
      "portfolio",
      "portfolios",
      "gameplay programming",
      "game design",
      "level design",
      "technical art",
      "environment art",
      "character art",
      "ui/ux",
      "narrative design",
      "producer",
      "audio",
      "qa"
    ];
    const curadoriaTypes = [
      "ferramenta",
      "ferramentas",
      "vaga",
      "vagas",
      "evento",
      "eventos",
      "artigo",
      "artigos",
      "curso",
      "cursos",
      "comunidade",
      "comunidades",
      "asset",
      "assets",
      "documentacao",
      "documentacoes",
      "repositorio",
      "repositorios",
      "dica",
      "dicas",
      "video"
    ];

    if (empresaTypes.some((typeName) => normalizedType.includes(typeName))) {
      return "empresas";
    }

    if (profissionalTypes.some((typeName) => normalizedType.includes(typeName))) {
      return "profissionais";
    }

    if (curadoriaTypes.some((typeName) => normalizedType.includes(typeName))) {
      return "curadoria";
    }

    return "curadoria";
  }

  function normalizeResource(resource) {
    return {
      ...resource,
      section: normalizeSection(resource.section, resource.type),
      tags: Array.isArray(resource.tags) ? resource.tags : [],
      special: Boolean(resource.special),
      pinned: Boolean(resource.pinned),
      wallpaper: Boolean(resource.wallpaper),
      imagePositionY: Number.isFinite(Number(resource.imagePositionY))
        ? Number(resource.imagePositionY)
        : 50,
      useLibraryGif: Boolean(resource.useLibraryGif),
      libraryGifKey: resource.libraryGifKey || "",
      libraryGifMode: resource.libraryGifMode === "contain" ? "contain" : "cover",
      libraryGifPositionY: Number.isFinite(Number(resource.libraryGifPositionY))
        ? Number(resource.libraryGifPositionY)
        : 50
    };
  }

  function getSectionMeta(sectionKey = state.section) {
    return sections.find((section) => section.key === sectionKey) || sections[0];
  }

  function getSectionFromHash() {
    const hash = window.location.hash.replace("#", "");
    return sections.some((section) => section.key === hash) ? hash : "curadoria";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getCustomResources() {
    try {
      const storedResources = localStorage.getItem(CUSTOM_RESOURCES_KEY);
      const parsedResources = storedResources ? JSON.parse(storedResources) : [];
      return Array.isArray(parsedResources) ? parsedResources : [];
    } catch (error) {
      return [];
    }
  }

  function getResources() {
    return state.resources.filter((resource) => resource.status !== "draft");
  }

  function getResourceTags(resource) {
    return Array.isArray(resource.tags) ? resource.tags : [];
  }

  function getGifLibrary() {
    return Array.isArray(window.GIF_LIBRARY) ? window.GIF_LIBRARY : [];
  }

  function getLibraryGifByKey(key) {
    return getGifLibrary().find((gif) => gif.key === key) || null;
  }

  function hasSavedCardDraft() {
    try {
      return Object.keys(localStorage).some((key) =>
        key.startsWith("radar-admin-card-draft-")
      );
    } catch (error) {
      return Boolean(localStorage.getItem(NEW_CARD_DRAFT_KEY));
    }
  }

  function isAdmin() {
    return stateAuth.profile?.role === "admin";
  }

  function matchesQuery(resource, normalizedQuery) {
    if (!normalizedQuery) {
      return true;
    }

    const searchable = [
      resource.title,
      resource.description,
      resource.type,
      resource.section,
      resource.country,
      resource.cta,
      getResourceTags(resource).join(" ")
    ].join(" ");

    return normalizeText(searchable).includes(normalizedQuery);
  }

  function getFilteredResources() {
    const normalizedQuery = normalizeText(state.query);
    const normalizedTag = normalizeText(state.tag);

    return getResources().filter((resource) => {
      const sectionMatch = resource.section === state.section;
      const categoryMatch = !state.category || resource.type === state.category;
      const queryMatch = matchesQuery(resource, normalizedQuery);
      const tagMatch =
        !normalizedTag ||
        getResourceTags(resource).some((tag) => normalizeText(tag) === normalizedTag);

      return sectionMatch && categoryMatch && queryMatch && tagMatch;
    });
  }

  function renderSections() {
    elements.sectionList.innerHTML = sections
      .map(
        (section) => `
          <button
            class="section-chip ${state.section === section.key ? "is-active" : ""}"
            type="button"
            data-section="${section.key}"
            aria-pressed="${state.section === section.key}"
          >
            ${section.label}
          </button>
        `
      )
      .join("");
  }

  function renderCategories() {
    elements.categoryList.innerHTML = categoryBySection[state.section]
      .map(
        (category) => `
          <button
            class="category-chip ${state.category === category ? "is-active" : ""}"
            type="button"
            data-category="${category}"
            aria-pressed="${state.category === category}"
          >
            ${category}
          </button>
        `
      )
      .join("");
  }

  function renderSectionContext() {
    elements.sectionContext.textContent = getSectionMeta().context;
  }

  function renderCard(resource) {
    const imageSource = resource.imageUrl || resource.image || "";
    const imagePositionY = Number.isFinite(Number(resource.imagePositionY))
      ? Number(resource.imagePositionY)
      : 50;
    const libraryGif = resource.useLibraryGif
      ? getLibraryGifByKey(resource.libraryGifKey)
      : null;
    const gifMode = resource.libraryGifMode === "contain" ? "contain" : "cover";
    const gifPositionY = Number.isFinite(Number(resource.libraryGifPositionY))
      ? Number(resource.libraryGifPositionY)
      : 50;
    const mediaMarkup = libraryGif
      ? `
        <div class="card-media card-media--gif card-media--${gifMode}">
          <img src="${libraryGif.url}" alt="" loading="lazy" decoding="async" style="object-position: center ${gifMode === "cover" ? gifPositionY : 50}%;" />
        </div>
      `
      : imageSource
        ? `
          <div class="card-media card-media--${resource.wallpaper ? "cover" : "contain"}">
            <img src="${imageSource}" alt="" loading="lazy" decoding="async" style="object-position: center ${imagePositionY}%;" />
          </div>
        `
        : "";
    const hasMedia = Boolean(mediaMarkup);
    const isCoverMedia = Boolean(libraryGif ? gifMode === "cover" : resource.wallpaper);
    const editMarkup = isAdmin()
      ? `
        <a class="admin-edit-card" href="admin-card.html?id=${encodeURIComponent(resource.id)}" aria-label="Editar card: ${resource.title}">
          Editar
        </a>
      `
      : "";

    const tagsMarkup = getResourceTags(resource)
      .map(
        (tag) => `
          <button class="tag-pill" type="button" data-tag="${tag}" aria-label="Filtrar por tag ${tag}">
            ${tag}
          </button>
        `
      )
      .join("");

    return `
      <article class="resource-card ${resource.featured ? "is-featured" : ""} ${resource.special ? "resource-card--special" : ""} ${resource.pinned ? "is-pinned" : ""} ${hasMedia ? "has-image" : "text-card"} ${isCoverMedia ? "resource-card--wallpaper" : ""}">
        ${editMarkup}
        ${mediaMarkup}
        <div class="card-content">
          <div class="card-topline">
            <span class="type-label">${resource.type}</span>
            <span class="country-label">${resource.country}</span>
          </div>
          ${resource.pinned ? '<span class="pinned-label">Fixado</span>' : ""}
          <h3>${resource.title}</h3>
          <p>${resource.description}</p>
          <div class="tag-list">${tagsMarkup}</div>
          <a class="card-cta" href="${resource.url}" target="_blank" rel="noopener noreferrer">
            ${resource.cta}
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </article>
    `;
  }

  function renderActiveFilters() {
    if (!elements.activeFilterBar) {
      return;
    }

    const active = [];

    if (state.category) {
      active.push(`Categoria: ${state.category}`);
    }

    if (state.tag) {
      active.push(`Tag: ${state.tag}`);
    }

    if (state.query) {
      active.push(`Busca: ${state.query}`);
    }

    elements.activeFilterBar.innerHTML = active
      .map((item) => `<span>${item}</span>`)
      .join("");
  }

  function getSavedTheme() {
    let savedTheme = null;

    try {
      savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    } catch (error) {
      savedTheme = null;
    }

    return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "light";
  }

  function updateThemeButton(theme) {
    if (!elements.themeToggle) {
      return;
    }

    const nextTheme = theme === "dark" ? "light" : "dark";
    const icon = elements.themeToggle.querySelector(".theme-toggle__icon");

    if (icon) {
      icon.textContent = theme === "dark" ? "☾" : "☀";
    }

    elements.themeToggle.setAttribute(
      "aria-label",
      `Alternar para modo ${nextTheme === "dark" ? "escuro" : "claro"}`
    );
    elements.themeToggle.setAttribute("aria-pressed", theme === "light");
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // Theme still changes for the current session if storage is unavailable.
    }

    updateThemeButton(theme);
  }

  function initTheme() {
    updateThemeButton(getSavedTheme());
  }

  function renderResources() {
    if (state.isLoadingResources) {
      elements.resultCount.textContent = "Carregando recursos...";
      elements.resourceGrid.innerHTML = "";
      elements.emptyState.hidden = true;
      return;
    }

    if (state.resourcesError) {
      elements.resultCount.textContent = "0 recursos encontrados";
      elements.resourceGrid.innerHTML = "";
      elements.emptyState.querySelector("h3").textContent =
        "Não foi possível carregar os recursos agora";
      elements.emptyState.querySelector("p").textContent = state.resourcesError;
      elements.emptyState.hidden = false;
      return;
    }

    const resources = getFilteredResources();
    const total = resources.length;
    const suffix = total === 1 ? "recurso encontrado" : "recursos encontrados";
    const sectionMeta = getSectionMeta();

    elements.resultCount.textContent = `${total} ${suffix} em ${sectionMeta.label}`;
    elements.resourceGrid.innerHTML = resources.map(renderCard).join("");
    elements.emptyState.querySelector("h3").textContent =
      total === 0 && !state.query && !state.category && !state.tag
        ? sectionMeta.emptyTitle
        : "Nenhum sinal encontrado";
    elements.emptyState.querySelector("p").textContent =
      total === 0 && !state.query && !state.category && !state.tag
        ? stateAuth.profile?.role === "admin"
          ? "Clique em Novo card no Painel Admin para cadastrar o primeiro recurso."
          : sectionMeta.emptyDescription
        : "Tente buscar por outro termo ou limpe os filtros para voltar ao mural completo.";
    elements.emptyState.hidden = total > 0;
    renderActiveFilters();
  }

  function clearFilters() {
    state.query = "";
    state.category = "";
    state.tag = "";
    elements.searchInput.value = "";
    renderCategories();
    renderResources();
    elements.searchInput.focus();
  }

  function openDialog(dialog) {
    if (!dialog) {
      return;
    }

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      return;
    }

    dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) {
      return;
    }

    dialog.close();
  }

  function setAuthMessage(message, tone = "neutral") {
    if (!elements.authMessage) {
      return;
    }

    elements.authMessage.textContent = message;
    elements.authMessage.dataset.tone = tone;
  }

  function setAuthMode(mode) {
    const isLogin = mode === "login";

    elements.loginPanel.hidden = !isLogin;
    elements.registerPanel.hidden = isLogin;
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.authMode === mode);
    });
    setAuthMessage("");
  }

  function waitForFirebaseApi() {
    if (window.radarFirebase) {
      return Promise.resolve(window.radarFirebase);
    }

    return new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;

        if (window.radarFirebase) {
          window.clearInterval(timer);
          resolve(window.radarFirebase);
        }

        if (attempts >= 80) {
          window.clearInterval(timer);
          reject(new Error("Firebase não carregou. Verifique a conexão."));
        }
      }, 100);
    });
  }

  function withTimeout(promise, milliseconds, timeoutMessage) {
    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, milliseconds);
    });

    return Promise.race([promise, timeout]).finally(() => {
      window.clearTimeout(timeoutId);
    });
  }

  function getCachedProfile() {
    return null;
  }

  function saveCachedProfile(profile) {
    // Firebase Auth owns session persistence.
  }

  function clearCachedProfile() {
    // Firebase Auth owns session persistence.
  }

  function updateSessionUi() {
    const adminActive = isAdmin();

    elements.sessionActions.hidden = !adminActive;

    if (adminActive) {
      const customResources = getCustomResources();
      const counts = sections
        .map((section) => {
          const total = state.resources.filter(
            (resource) => resource.section === section.key
          ).length;
          return `${section.label}: ${total}`;
        })
        .join(" | ");
      elements.adminLocalCount.textContent =
        counts || `Recursos locais: ${customResources.length}`;
      elements.adminDraftStatus.hidden = !hasSavedCardDraft();
      elements.migrateLocalButton.hidden = customResources.length === 0;
    }

    renderResources();
  }

  function openHiddenAdminAccess() {
    if (stateAuth.profile?.role === "admin") {
      openDialog(elements.adminPanelDialog);
      return;
    }

    openDialog(elements.authDialog);
    setAuthMode("login");
  }

  async function handleRegister() {
    const name = elements.registerName.value;
    const email = elements.registerEmail.value;
    const password = elements.registerPassword.value;

    if (!name || !email || !password) {
      setAuthMessage("Preencha nome, email e senha.", "error");
      return;
    }

    try {
      elements.registerSubmit.disabled = true;
      setAuthMessage("Enviando solicitação...");
      const firebase = await waitForFirebaseApi();
      await withTimeout(
        firebase.registerPendingUser({ name, email, password }),
        15000,
        "O cadastro demorou para responder. Verifique no Firebase se a solicitação foi criada."
      );
      elements.registerName.value = "";
      elements.registerEmail.value = "";
      elements.registerPassword.value = "";
      setAuthMode("login");
      setAuthMessage("Cadastro enviado. Aguarde aprovação do admin.", "success");
    } catch (error) {
      setAuthMessage(error.message || "Não foi possível cadastrar.", "error");
    } finally {
      elements.registerSubmit.disabled = false;
    }
  }

  async function handleLogin() {
    const email = elements.loginEmail.value;
    const password = elements.loginPassword.value;

    if (!email || !password) {
      setAuthMessage("Preencha email e senha.", "error");
      return;
    }

    try {
      elements.loginSubmit.disabled = true;
      setAuthMessage("Entrando...");
      const firebase = await waitForFirebaseApi();
      const session = await firebase.loginApprovedUser({ email, password });
      stateAuth.user = session.user;
      stateAuth.profile = session.profile;
      saveCachedProfile(session.profile);
      updateSessionUi();

      if (session.profile.role !== "admin") {
        setAuthMessage(
          "Login aprovado, mas este usuário ainda não tem permissão de admin.",
          "error"
        );
        return;
      }

      setAuthMessage("");
      closeDialog(elements.authDialog);
    } catch (error) {
      setAuthMessage(error.message || "Não foi possível entrar.", "error");
    } finally {
      elements.loginSubmit.disabled = false;
    }
  }

  function renderPendingUsers(users) {
    if (!elements.pendingUsersList) {
      return;
    }

    if (elements.pendingUsersCount) {
      elements.pendingUsersCount.textContent = String(users.length);
    }

    if (!users.length) {
      elements.pendingUsersList.innerHTML =
        '<p class="empty-panel">Nenhum usuário pendente agora.</p>';
      elements.rejectAllPending.disabled = true;
      return;
    }

    elements.rejectAllPending.disabled = false;
    elements.pendingUsersList.innerHTML = users
      .map(
        (user) => `
          <article class="pending-user">
            <strong>${escapeHtml(user.name || "Sem nome")}</strong>
            <span>${escapeHtml(user.email || "Sem email")}</span>
          </article>
        `
      )
      .join("");
  }

  function renderApprovedUsers(users) {
    if (!elements.approvedUsersList) {
      return;
    }

    if (elements.approvedUsersCount) {
      elements.approvedUsersCount.textContent = String(users.length);
    }

    if (!users.length) {
      elements.approvedUsersList.innerHTML =
        '<p class="empty-panel">Nenhum usuário aprovado encontrado.</p>';
      return;
    }

    elements.approvedUsersList.innerHTML = users
      .map((user) => {
        const isCurrentUser = user.id === stateAuth.user?.uid;
        const actionMarkup = isCurrentUser
          ? '<span class="user-self-badge">Você</span>'
          : `
            <button class="user-action user-action--danger" type="button" data-ban-user="${escapeHtml(user.id)}" aria-label="Banir usuário ${escapeHtml(user.name || user.email || "sem nome")}">
              Banir
            </button>
          `;

        return `
          <article class="pending-user user-row">
            <div>
              <strong>${escapeHtml(user.name || "Sem nome")}</strong>
              <span>${escapeHtml(user.email || "Sem email")}</span>
            </div>
            ${actionMarkup}
          </article>
        `;
      })
      .join("");
  }

  async function loadUsersPanel() {
    if (stateAuth.profile?.role !== "admin") {
      return;
    }

    elements.pendingUsersList.innerHTML =
      '<p class="empty-panel">Carregando usuários pendentes...</p>';
    elements.approvedUsersList.innerHTML =
      '<p class="empty-panel">Carregando usuários aprovados...</p>';
    closeDialog(elements.adminPanelDialog);
    openDialog(elements.pendingUsersDialog);

    try {
      const firebase = await waitForFirebaseApi();
      const [pendingUsers, approvedUsers] = await Promise.all([
        firebase.getPendingUsers(),
        firebase.getApprovedUsers()
      ]);
      stateAuth.pendingUsers = pendingUsers;
      stateAuth.approvedUsers = approvedUsers;
      renderPendingUsers(stateAuth.pendingUsers);
      renderApprovedUsers(stateAuth.approvedUsers);
    } catch (error) {
      elements.pendingUsersList.innerHTML = `<p class="empty-panel">${error.message || "Não foi possível carregar usuários."}</p>`;
      elements.approvedUsersList.innerHTML = `<p class="empty-panel">${error.message || "Não foi possível carregar usuários."}</p>`;
    }
  }

  async function rejectAllPendingUsers() {
    if (!stateAuth.pendingUsers.length) {
      return;
    }

    try {
      elements.rejectAllPending.disabled = true;
      const firebase = await waitForFirebaseApi();
      await firebase.deletePendingUsers(
        stateAuth.pendingUsers.map((user) => user.id)
      );
      stateAuth.pendingUsers = [];
      renderPendingUsers([]);
    } catch (error) {
      elements.pendingUsersList.innerHTML = `<p class="empty-panel">${error.message || "Não foi possível recusar os usuários."}</p>`;
    }
  }

  async function banUser(userId) {
    const user = stateAuth.approvedUsers.find((approvedUser) => approvedUser.id === userId);

    if (!user || userId === stateAuth.user?.uid) {
      return;
    }

    const confirmed = window.confirm(
      `Banir ${user.name || user.email || "este usuário"}? Ele não poderá mais fazer login no Radar GameDev.`
    );

    if (!confirmed) {
      return;
    }

    const button = Array.from(
      elements.approvedUsersList.querySelectorAll("[data-ban-user]")
    ).find((actionButton) => actionButton.dataset.banUser === userId);

    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Banindo...";
      }

      const firebase = await waitForFirebaseApi();
      await firebase.banApprovedUser(userId);
      stateAuth.approvedUsers = stateAuth.approvedUsers.filter(
        (approvedUser) => approvedUser.id !== userId
      );
      renderApprovedUsers(stateAuth.approvedUsers);
    } catch (error) {
      elements.approvedUsersList.innerHTML = `<p class="empty-panel">${error.message || "Não foi possível banir o usuário."}</p>`;
    }
  }

  async function initFirebaseSession() {
    try {
      const firebase = await waitForFirebaseApi();
      await firebase.authPersistenceReady;

      firebase.onAuthStateChanged(firebase.auth, async (user) => {
        stateAuth.user = null;
        stateAuth.profile = null;

        if (!user) {
          clearCachedProfile();
          updateSessionUi();
          return;
        }

        const profile = await firebase.getCurrentApprovedProfile(user);

        if (!profile) {
          await firebase.signOut();
          clearCachedProfile();
          updateSessionUi();
          return;
        }

        stateAuth.user = user;
        stateAuth.profile = profile;
        saveCachedProfile(profile);
        updateSessionUi();
      });
    } catch (error) {
      console.warn(error.message);
    }
  }

  async function loadFirebaseResources() {
    state.isLoadingResources = true;
    state.resourcesError = "";
    renderResources();

    try {
      const firebase = await waitForFirebaseApi();
      state.resources = (await firebase.getResources()).map(normalizeResource);
    } catch (error) {
      state.resources = [];
      state.resourcesError =
        error.message || "Tente recarregar a página em alguns instantes.";
    } finally {
      state.isLoadingResources = false;
      renderResources();
      updateSessionUi();
    }
  }

  async function migrateLocalResources() {
    const localResources = getCustomResources();

    if (!localResources.length) {
      return;
    }

    if (
      !window.confirm(
        `Migrar ${localResources.length} card(s) locais para o Firebase?`
      )
    ) {
      return;
    }

    try {
      elements.migrateLocalButton.disabled = true;
      elements.migrateLocalButton.textContent = "Migrando...";
      const firebase = await waitForFirebaseApi();
      const migratedCount = await firebase.migrateLocalResources(localResources);
      await loadFirebaseResources();

      if (
        window.confirm(
          `${migratedCount} card(s) migrados. Deseja limpar os cards locais deste navegador?`
        )
      ) {
        localStorage.removeItem(CUSTOM_RESOURCES_KEY);
      }

      updateSessionUi();
    } catch (error) {
      window.alert(error.message || "Não foi possível migrar os cards locais.");
    } finally {
      elements.migrateLocalButton.disabled = false;
      elements.migrateLocalButton.textContent = "Migrar locais";
    }
  }

  function bindEvents() {
    elements.sectionList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-section]");
      if (!button) {
        return;
      }

      state.section = button.dataset.section;
      state.category = "";
      state.tag = "";
      if (state.section === "curadoria") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } else {
        window.location.hash = state.section;
      }
      renderSections();
      renderCategories();
      renderSectionContext();
      renderResources();
    });

    elements.categoryList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) {
        return;
      }

      state.category = button.dataset.category;
      renderCategories();
      renderResources();
    });

    elements.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      renderResources();
    });

    elements.resourceGrid.addEventListener("click", (event) => {
      const tagButton = event.target.closest("[data-tag]");
      if (!tagButton) {
        return;
      }

      state.tag = tagButton.dataset.tag;
      renderResources();
      document.querySelector(".search-strip").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });

    elements.clearFilters.addEventListener("click", clearFilters);

    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        closeDialog(button.closest("dialog"));
      });
    });

    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
    });

    elements.authDialog
      .querySelector("form")
      .addEventListener("submit", (event) => event.preventDefault());
    elements.loginPanel.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleLogin();
      }
    });
    elements.registerPanel.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleRegister();
      }
    });

    elements.loginSubmit.addEventListener("click", handleLogin);
    elements.registerSubmit.addEventListener("click", handleRegister);
    elements.logoutButton.addEventListener("click", async () => {
      try {
        const firebase = await waitForFirebaseApi();
        await firebase.signOut();
      } catch (error) {
        console.warn(error.message);
      }

      stateAuth.user = null;
      stateAuth.profile = null;
      clearCachedProfile();
      updateSessionUi();
    });
    elements.adminButton.addEventListener("click", () => {
      openDialog(elements.adminPanelDialog);
    });
    elements.viewResourcesButton.addEventListener("click", () => {
      document.querySelector(".resources-section").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
    elements.migrateLocalButton.addEventListener("click", migrateLocalResources);
    elements.openPendingUsers.addEventListener("click", loadUsersPanel);
    elements.rejectAllPending.addEventListener("click", rejectAllPendingUsers);
    elements.approvedUsersList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-ban-user]");

      if (!button) {
        return;
      }

      banUser(button.dataset.banUser);
    });

    let logoClickCount = 0;
    let logoClickTimer = null;
    elements.brand.addEventListener("click", () => {
      logoClickCount += 1;
      window.clearTimeout(logoClickTimer);
      logoClickTimer = window.setTimeout(() => {
        logoClickCount = 0;
      }, 1200);

      if (logoClickCount >= 5) {
        logoClickCount = 0;
        openHiddenAdminAccess();
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "a") {
        openHiddenAdminAccess();
      }
    });

    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#radar-admin") {
        openHiddenAdminAccess();
        return;
      }

      state.section = getSectionFromHash();
      state.category = "";
      state.tag = "";
      renderSections();
      renderCategories();
      renderSectionContext();
      renderResources();
    });

    if (window.location.hash === "#radar-admin") {
      openHiddenAdminAccess();
    }

    if (elements.themeToggle) {
      elements.themeToggle.addEventListener("click", () => {
        const currentTheme = document.documentElement.dataset.theme || "light";
        applyTheme(currentTheme === "dark" ? "light" : "dark");
      });
    }
  }

  function init() {
    initTheme();
    state.section = getSectionFromHash();
    stateAuth.profile = getCachedProfile();
    updateSessionUi();
    renderSections();
    renderCategories();
    renderSectionContext();
    loadFirebaseResources();
    if (window.GIF_LIBRARY_READY) {
      window.GIF_LIBRARY_READY.then(renderResources);
    }
    bindEvents();
    initFirebaseSession();
  }

  init();
})();
