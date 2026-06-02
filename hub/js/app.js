import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

(async function () {
  "use strict";

  var STORAGE_KEY = "hub.state.v2";
  var OLD_STORAGE_KEY = "hub.documents.v1";
  var USERS_KEY = "hub.users.v1";
  var SESSION_KEY = "hub.session.v1";
  var AI_MODE_KEY = "hub-ai-mode";
  var AI_CONTEXT_OPTIONS_KEY = "hub-ai-context-options";
  var AI_UNDO_KEY = "hub-ai-last-undo";
  var AI_OPTIONS_COLLAPSED_KEY = "hub-ai-options-collapsed";
  var IMAGE_URL_PATTERN = /\.(png|jpe?g|webp|gif)(\?.*)?$/i;
  var URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;
  var WIKILINK_PATTERN = /\[\[([^\[\]]+)\]\]/g;
  var SYSTEM_PROMPT = "Você é o Assistente do Hub, um sistema pessoal de organização inspirado em Notion, Obsidian, Trello e ferramentas de produtividade.\n" +
    "Você ajuda o usuário a organizar projetos, páginas, documentos, links, Kanbans, planilhas, toggles, blocos de código e materiais.\n" +
    "Regras fundamentais:\n" +
    "- Você nunca altera nada diretamente. O sistema aplicará ações somente conforme o modo escolhido pelo usuário.\n" +
    "- Quando sugerir ações, retorne JSON válido.\n" +
    "- Não use markdown em volta do JSON.\n" +
    "- Não invente IDs.\n" +
    "- Use apenas IDs fornecidos no contexto.\n" +
    "- Não apague conteúdo, exceto se o usuário pedir explicitamente.\n" +
    "- Preserve o conteúdo existente sempre que possível.\n" +
    "- Prefira appendContent em vez de replaceContent.\n" +
    "- Use replaceContent apenas quando o usuário pedir reescrita completa/substituição.\n" +
    "- Para Kanban, use insertKanban com columns/cards/checklist.\n" +
    "- Para planilhas, use insertSpreadsheet com rows.\n" +
    "- Para texto normal, use HTML simples e seguro.\n" +
    "- Não gere scripts, iframes, handlers JS ou conteúdo inseguro.\n" +
    "- Seja objetivo e útil.\n" +
    "Para resposta comum, responda em texto normal.\n" +
    "Para ações, responda somente com JSON válido neste formato:\n" +
    'Formato JSON obrigatório: {"reply":"Texto explicando o que será feito.","actions":[{"type":"appendContent","itemId":"ID","html":"<h2>Nova seção</h2><p>Conteúdo...</p>"}]}.\n' +
    "Tipos suportados: appendContent, prependContent, replaceContent, createDocument, createFolder, renameItem, insertKanban, insertSpreadsheet.\n" +
    "Se não tiver certeza, responda apenas em texto e peça confirmação.";
  var TEXT_COLOR_OPTIONS = [
    { label: "Padrão", color: null, swatch: "transparent" },
    { label: "Cinza", color: "#6b6b6b" },
    { label: "Vermelho", color: "#c94f4f" },
    { label: "Laranja", color: "#d9822b" },
    { label: "Amarelo", color: "#b58b00" },
    { label: "Verde", color: "#4f8f5f" },
    { label: "Azul", color: "#4f75c9" },
    { label: "Roxo", color: "#8a5fbf" }
  ];
  var SPREADSHEET_COLOR_OPTIONS = [
    "#3a3a3a",
    "#fff3a3",
    "#dff5d8",
    "#d9eaff",
    "#ffd6d6",
    "#eadcff",
    "#ffe0b8"
  ];
  var firebaseConfig = {
    apiKey: "AIzaSyCOhhdaRrR3FEJ0Srk41f7oZMuet2u7QzU",
    authDomain: "hubpessoal-d4a88.firebaseapp.com",
    projectId: "hubpessoal-d4a88",
    storageBucket: "hubpessoal-d4a88.firebasestorage.app",
    messagingSenderId: "758779309249",
    appId: "1:758779309249:web:11916749a6c8054043b840"
  };
  var firebaseApp = initializeApp(firebaseConfig);
  var auth = getAuth(firebaseApp);
  var db = getFirestore(firebaseApp);
  var AiProvider = {
    sendMessage: async function (options) {
      var response;
      var data;

      // Uso local/pessoal: chamada direta no navegador. No futuro, trocar por backend/Firebase Function.
      response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + options.apiKey
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{
            role: "system",
            content: SYSTEM_PROMPT
          }].concat(options.messages),
          temperature: 0.4
        })
      });

      if (!response.ok) {
        throw new Error("DeepSeek request failed: " + response.status);
      }

      data = await response.json();
      return data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
    }
  };

  var saveTimer = null;
  var normalizeTimer = null;
  var selectedImageBlock = null;
  var draggedImageBlock = null;
  var draggedKanbanCard = null;
  var kanbanDragJustEnded = false;
  var activeKanbanModal = null;
  var selectedSpreadsheetCell = null;
  var spreadsheetColorMenu = null;
  var AiState = {
    apiKey: "",
    messages: [],
    isOpen: false,
    isSending: false,
    optionsCollapsed: true,
    mode: "confirm",
    contextOptions: {
      current: true,
      project: false,
      links: false,
      blocks: false,
      related: false
    }
  };
  var resizeState = null;

  var state = {
    items: [],
    selectedItemId: null,
    sidebarCollapsed: false,
    createMenu: null,
    highlightMenu: null,
    textColorMenu: null,
    inlineEdit: null,
    preferences: {
      theme: "light",
      headerCollapsed: false
    },
    ui: {
      isPublicView: false,
      publicView: null,
      publicId: null,
      publicActiveId: null,
      projectTab: "cover",
      copyFeedbackId: null,
      searchQuery: "",
      showTrash: false,
      saveStatus: "saved"
    },
    session: null
  };

  var elements = {
    sidebar: document.getElementById("sidebar"),
    toggleSidebar: document.getElementById("toggleSidebar"),
    toggleTheme: document.getElementById("toggleTheme"),
    newItem: document.getElementById("newItem"),
    sidebarSearch: document.getElementById("sidebarSearch"),
    trashToggle: document.getElementById("trashToggle"),
    trashCount: document.getElementById("trashCount"),
    exportBackup: document.getElementById("exportBackup"),
    importBackup: document.getElementById("importBackup"),
    backupFileInput: document.getElementById("backupFileInput"),
    backupStatus: document.getElementById("backupStatus"),
    treeList: document.getElementById("treeList"),
    editorPanel: document.getElementById("editorPanel"),
    aiPanel: document.getElementById("aiPanel"),
    aiSetKey: document.getElementById("aiSetKey"),
    aiClearKey: document.getElementById("aiClearKey"),
    aiClose: document.getElementById("aiClose"),
    aiOptionsToggle: document.getElementById("aiOptionsToggle"),
    aiOptionsPanel: document.getElementById("aiOptionsPanel"),
    aiKeyStatus: document.getElementById("aiKeyStatus"),
    aiMessages: document.getElementById("aiMessages"),
    aiForm: document.getElementById("aiForm"),
    aiPrompt: document.getElementById("aiPrompt"),
    aiModeSelect: document.getElementById("aiModeSelect"),
    aiContextSummary: document.getElementById("aiContextSummary"),
    aiUndoLastAction: document.getElementById("aiUndoLastAction"),
    accountName: document.getElementById("accountName"),
    adminButton: document.getElementById("adminButton"),
    logoutButton: document.getElementById("logoutButton")
  };

  var AuthStore = {
    users: [],
    loadUsers: function () {
      return this.users;
    },
    syncUsers: async function () {
      try {
        var snapshot = await getDocs(collection(db, "users"));
        var users = snapshot.docs.map(function (userDoc) {
          return Object.assign({
            id: userDoc.id
          }, userDoc.data());
        });
        users = migrateUsersIfNeeded(users);
        this.users = users;
        return users;
      } catch (error) {
        this.users = [];
        return [];
      }
    },
    saveUsers: async function (users) {
      this.users = users;
    },
    getSession: function () {
      return auth.currentUser ? {
        userId: auth.currentUser.uid
      } : null;
    },
    setSession: function (session) {
      return session;
    },
    clearSession: async function () {
      await signOut(auth);
    },
    getCurrentUser: async function () {
      var session = this.getSession();

      if (!session || !session.userId) {
        return null;
      }

      var snapshot = await getDoc(doc(db, "users", session.userId));
      var user = snapshot.exists() ? Object.assign({
        id: snapshot.id
      }, snapshot.data()) : null;

      if (!user || user.status !== "approved") {
        return null;
      }

      return user;
    },
    register: async function (data) {
      var users = [];
      var email = normalizeEmail(data.email);
      var credential;
      var isFirstUser;

      if (!data.name.trim() || !email || !data.password || !data.confirmPassword) {
        return {
          ok: false,
          message: "Preencha todos os campos."
        };
      }

      if (data.password !== data.confirmPassword) {
        return {
          ok: false,
          message: "As senhas não conferem."
        };
      }

      try {
        credential = await createUserWithEmailAndPassword(auth, email, data.password);
      } catch (error) {
        return {
          ok: false,
          message: "Não foi possível criar a conta. Verifique o email e a senha."
        };
      }

      users = await this.syncUsers();
      isFirstUser = users.length === 0;
      var user = {
        id: credential.user.uid,
        name: data.name.trim(),
        email: email,
        role: isFirstUser ? "admin" : "moderator",
        status: isFirstUser ? "approved" : "pending",
        createdAt: nowIso()
      };

      users.push(user);
      await setDoc(doc(db, "users", user.id), user);
      if (isFirstUser) {
        await setDoc(doc(db, "system", "bootstrap"), {
          adminId: user.id,
          createdAt: nowIso()
        });
      }
      this.users = users;
      if (user.status !== "approved") {
        await signOut(auth);
      }

      return {
        ok: true,
        user: user,
        message: user.status === "approved" ? "" : "Conta criada. Aguarde aprovação de um admin."
      };
    },
    login: async function (email, password) {
      var normalizedEmail = normalizeEmail(email);
      var credential;
      var snapshot;
      var user;

      try {
        credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      } catch (error) {
        return {
          ok: false,
          message: "Email ou senha inválidos."
        };
      }

      snapshot = await getDoc(doc(db, "users", credential.user.uid));
      user = snapshot.exists() ? Object.assign({
        id: snapshot.id
      }, snapshot.data()) : null;

      if (!user) {
        return {
          ok: false,
          message: "Email ou senha inválidos."
        };
      }

      if (user.status === "banned") {
        await signOut(auth);
        return {
          ok: false,
          message: "Conta banida."
        };
      }

      if (user.status !== "approved") {
        await signOut(auth);
        return {
          ok: false,
          message: "Conta aguardando aprovação de um admin."
        };
      }

      return {
        ok: true,
        user: user
      };
    },
    updateUser: async function (id, changes) {
      var users = await this.syncUsers();
      var user = users.find(function (candidate) {
        return candidate.id === id;
      });

      if (!user) {
        return null;
      }

      Object.keys(changes).forEach(function (key) {
        user[key] = changes[key];
      });
      await updateDoc(doc(db, "users", id), changes);
      this.users = users;
      return user;
    }
  };

  var DataStore = {
    load: async function () {
      var loadedState = {
        items: [],
        selectedItemId: null,
        preferences: {
          theme: "light",
          headerCollapsed: false
        }
      };

      try {
        var itemSnapshot;
        var prefSnapshot;

        if (state.ui.isPublicView) {
          loadedState.items = await loadPublicItemsForView();
        } else if (isAdmin()) {
          itemSnapshot = await getDocs(collection(db, "items"));
          loadedState.items = itemSnapshot.docs.map(firebaseDocToItem);
        } else if (state.session) {
          // Carregar todos os items e filtrar localmente para evitar problemas com índices do Firebase
          itemSnapshot = await getDocs(collection(db, "items"));
          var allItems = itemSnapshot.docs.map(firebaseDocToItem);

          // Debug: Log dos items compartilhados
          console.log("Session ID do moderador:", state.session.id);
          console.log("Items carregados:", allItems.length);

          loadedState.items = allItems.filter(function (item) {
            var isShared = Array.isArray(item.sharedWith) && item.sharedWith.indexOf(state.session.id) !== -1;
            if (isShared) {
              console.log("Item compartilhado encontrado:", item.title, item.sharedWith);
            }
            return isShared;
          });

          console.log("Items compartilhados após filtro:", loadedState.items.length);
        }

        if (!loadedState.items.length && !state.ui.isPublicView) {
          loadedState.items = this.loadLocalFallback();
          if (loadedState.items.length) {
            await this.save({
              items: loadedState.items,
              selectedItemId: null,
              preferences: loadedState.preferences
            });
          }
        }

        if (auth.currentUser) {
          prefSnapshot = await getDoc(doc(db, "preferences", auth.currentUser.uid));
          if (prefSnapshot.exists()) {
            loadedState.preferences = prefSnapshot.data();
          } else {
            loadedState.preferences = this.loadLocalPreferences();
          }
        } else {
          loadedState.preferences = this.loadLocalPreferences();
        }
      } catch (error) {
        loadedState.items = [];
        loadedState.selectedItemId = null;
      }

      loadedState = migrateStateIfNeeded(loadedState);
      this.setState(loadedState);
      this.save(state).catch(function () {});
      return state;
    },
    loadLocalFallback: function () {
      try {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          var parsed = JSON.parse(saved);
          return Array.isArray(parsed.items) ? parsed.items : [];
        }
      } catch (error) {
        return [];
      }

      return this.loadOldDocuments();
    },
    loadLocalPreferences: function () {
      try {
        var saved = localStorage.getItem(STORAGE_KEY);
        var parsed = saved ? JSON.parse(saved) : null;
        return parsed && parsed.preferences ? parsed.preferences : {
          theme: "light"
        };
      } catch (error) {
        return {
          theme: "light"
        };
      }
    },
    loadOldDocuments: function () {
      try {
        var oldSaved = localStorage.getItem(OLD_STORAGE_KEY);
        var oldDocuments = oldSaved ? JSON.parse(oldSaved) : [];

        if (!Array.isArray(oldDocuments)) {
          return [];
        }

        return oldDocuments.map(function (documentItem) {
          return {
            id: documentItem.id || createId("document"),
            type: "document",
            title: documentItem.title || getDefaultTitle("document"),
            parentId: null,
            content: escapeHtml(documentItem.content || "").replace(/\n/g, "<br>"),
            visibility: "private",
            createdAt: documentItem.createdAt || nowIso(),
            updatedAt: documentItem.updatedAt || nowIso()
          };
        });
      } catch (error) {
        return [];
      }
    },
    save: async function (nextState, options) {
      nextState = migrateStateIfNeeded(nextState);
      var batchItems = nextState.items || [];
      var requestedIds = options && Array.isArray(options.itemIds) ? options.itemIds : null;
      var remoteItems = requestedIds ? getItemsForRemoteSave(requestedIds) : batchItems;
      var orderedItems = getItemsOrderedForRemoteSave(remoteItems);
      var selectedItemId = options && options.statusItemId !== undefined ? options.statusItemId : nextState.selectedItemId;
      var selectedItemWasSynced = !selectedItemId;
      var selectedItemFailed = false;
      setSaveStatus("saving");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        items: nextState.items,
        selectedItemId: nextState.selectedItemId,
        preferences: nextState.preferences || {
          theme: "light",
          headerCollapsed: false
        }
      }));

      if (!auth.currentUser || state.ui.isPublicView) {
        setSaveStatus("local");
        return;
      }

      for (var index = 0; index < orderedItems.length; index += 1) {
        try {
          await setDoc(doc(db, "items", orderedItems[index].id), orderedItems[index], {
            merge: true
          });

          if (orderedItems[index].id === selectedItemId) {
            selectedItemWasSynced = true;
          }
        } catch (error) {
          console.error("Falha ao salvar item no Firebase:", orderedItems[index].title || orderedItems[index].id, error);
          if (orderedItems[index].id === selectedItemId) {
            selectedItemFailed = true;
          }
        }
      }

      try {
        await setDoc(doc(db, "preferences", auth.currentUser.uid), nextState.preferences || {
          theme: "light",
          headerCollapsed: false
        }, {
          merge: true
        });
      } catch (error) {
        console.warn("Falha ao salvar preferências no Firebase.", error);
      }

      if (selectedItemFailed || !selectedItemWasSynced) {
        setSaveStatus("error");
        return;
      }

      setSaveStatus("saved");
    },
    getState: function () {
      return state;
    },
    setState: function (nextState) {
      state.items = Array.isArray(nextState.items) ? nextState.items : [];
      state.selectedItemId = nextState.selectedItemId || null;
      state.preferences = nextState.preferences || {
        theme: "light",
        headerCollapsed: false
      };
      if (state.selectedItemId && !this.getItem(state.selectedItemId)) {
        state.selectedItemId = null;
      }
    },
    getItem: function (id) {
      return state.items.find(function (item) {
        return item.id === id;
      }) || null;
    },
    updateItem: function (id, changes) {
      var item = this.getItem(id);

      if (!item) {
        return null;
      }

      Object.keys(changes).forEach(function (key) {
        item[key] = changes[key];
      });
      item.updatedAt = changes.updatedAt || nowIso();
      this.save(state, {
        itemIds: [id],
        statusItemId: id
      }).catch(function () {});
      return item;
    },
    createItem: function (item) {
      state.items.push(item);
      this.save(state, {
        itemIds: [item.id],
        statusItemId: item.id
      }).catch(function () {});
      return item;
    },
    deleteItem: function (id) {
      state.items = state.items.filter(function (item) {
        return item.id !== id;
      });
      if (state.selectedItemId === id) {
        state.selectedItemId = null;
      }
      this.save(state).catch(function () {});
      deleteDoc(doc(db, "items", id)).catch(function () {});
    },
    deleteItems: async function (ids) {
      if (!Array.isArray(ids) || ids.length === 0) {
        return;
      }

      if (!auth.currentUser || state.ui.isPublicView) {
        return;
      }

      await Promise.all(ids.map(function (id) {
        return deleteDoc(doc(db, "items", id));
      }));
    }
  };

  function createId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function escapeHtml(value) {
    var wrapper = document.createElement("div");
    wrapper.textContent = value || "";
    return wrapper.innerHTML;
  }

  async function loadState() {
    await DataStore.load();
  }

  function loadOldDocuments() {
    return DataStore.loadOldDocuments();
  }

  function migrateStateIfNeeded(nextState) {
    var now = nowIso();
    var itemIds = {};
    var byId = {};

    (nextState.items || []).forEach(function (item) {
      byId[item.id] = item;
    });

    function findRootProjectId(itemId) {
      var current = byId[itemId];

      while (current) {
        if (current.type === "project") {
          return current.id;
        }
        current = byId[current.parentId];
      }

      return null;
    }

    nextState.items = (nextState.items || []).map(function (item) {
      item.createdAt = item.createdAt || now;
      item.updatedAt = item.updatedAt || now;
      item.ownerId = item.ownerId || (state.session ? state.session.id : null);

      if (item.type === "project") {
        item.parentId = null;
        item.content = item.content || "";
        item.isOpen = item.isOpen !== false;
        item.visibility = item.visibility === "public" ? "public" : "private";
        item.sharedWith = Array.isArray(item.sharedWith) ? item.sharedWith : [];
        item.projectId = item.id;
      }

      if (item.type === "document") {
        item.content = item.content || "";
        item.visibility = item.visibility === "public" ? "public" : "private";
        item.sharedWith = Array.isArray(item.sharedWith) ? item.sharedWith : [];
        item.projectId = item.projectId || findRootProjectId(item.id);
      }

      if (item.type === "folder") {
        item.sharedWith = Array.isArray(item.sharedWith) ? item.sharedWith : [];
        item.projectId = item.projectId || findRootProjectId(item.id);
      }

      itemIds[item.id] = true;
      return item;
    });

    if (nextState.selectedItemId && !itemIds[nextState.selectedItemId]) {
      nextState.selectedItemId = null;
    }

    nextState.preferences = nextState.preferences || {};
    nextState.preferences.theme = nextState.preferences.theme === "dark" ? "dark" : "light";
    nextState.preferences.headerCollapsed = nextState.preferences.headerCollapsed === true;
    delete nextState.preferences.toolbarCollapsed;

    return nextState;
  }

  function migrateUsersIfNeeded(users) {
    return users.map(function (user, index) {
      user.role = user.role || (index === 0 ? "admin" : "moderator");
      user.status = user.status || "approved";
      user.createdAt = user.createdAt || nowIso();
      return user;
    });
  }

  function saveState(itemIds, statusItemId) {
    DataStore.save(state, {
      itemIds: itemIds || null,
      statusItemId: statusItemId === undefined ? state.selectedItemId : statusItemId
    }).catch(function () {});
  }

  async function saveStateAsync() {
    await DataStore.save(state);
  }

  function setBackupStatus(message) {
    if (elements.backupStatus) {
      elements.backupStatus.textContent = message || "";
    }
  }

  function buildBackupPayload() {
    return {
      app: "Hub",
      version: "1.0",
      exportedAt: nowIso(),
      items: JSON.parse(JSON.stringify(state.items || [])),
      trash: JSON.parse(JSON.stringify(getDeletedItems())),
      preferences: JSON.parse(JSON.stringify(state.preferences || {}))
    };
  }

  function exportHubBackup() {
    var now = new Date();
    var filename = "hub-backup-" + formatBackupDate(now) + ".json";

    downloadJson(filename, buildBackupPayload());
    setBackupStatus("Backup exportado.");
  }

  function formatBackupDate(date) {
    function pad(value) {
      return String(value).padStart(2, "0");
    }

    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "-" + pad(date.getHours()) + "-" + pad(date.getMinutes());
  }

  function downloadJson(filename, data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importHubBackup(file) {
    var reader = new FileReader();

    if (!file) {
      return;
    }

    reader.addEventListener("load", async function () {
      var payload;
      var validation;

      try {
        payload = JSON.parse(String(reader.result || ""));
      } catch (error) {
        alert("Arquivo de backup inválido.");
        setBackupStatus("Importação falhou.");
        return;
      }

      validation = validateBackupPayload(payload);
      if (!validation.ok) {
        alert(validation.message);
        setBackupStatus("Importação falhou.");
        return;
      }

      if (!confirm("Importar este backup vai substituir os dados atuais. Deseja continuar?")) {
        setBackupStatus("Importação cancelada.");
        return;
      }

      try {
        await applyBackupPayload(payload);
        setBackupStatus("Backup importado.");
        alert("Backup importado com sucesso.");
      } catch (error) {
        console.error("Falha ao importar backup.", error);
        alert("Não foi possível importar o backup.");
        setBackupStatus("Importação falhou.");
      }
    });

    reader.readAsText(file);
  }

  function validateBackupPayload(payload) {
    if (!payload || payload.app !== "Hub") {
      return {
        ok: false,
        message: "Este arquivo não parece ser um backup do Hub."
      };
    }

    if (!Array.isArray(payload.items)) {
      return {
        ok: false,
        message: "Backup inválido: lista de itens ausente."
      };
    }

    return {
      ok: true,
      message: ""
    };
  }

  async function applyBackupPayload(payload) {
    var previousIds = state.items.map(function (item) {
      return item.id;
    });
    var importedItems = normalizeBackupItems(payload.items);
    var importedIds = importedItems.map(function (item) {
      return item.id;
    });
    var removeIds = previousIds.filter(function (id) {
      return importedIds.indexOf(id) === -1;
    });

    state.items = importedItems;
    state.selectedItemId = importedItems.find(function (item) {
      return !item.deletedAt && (item.type === "document" || item.type === "project");
    }) ? importedItems.find(function (item) {
      return !item.deletedAt && (item.type === "document" || item.type === "project");
    }).id : null;
    state.preferences = Object.assign({
      theme: "light",
      headerCollapsed: false
    }, payload.preferences || {});
    state = migrateStateIfNeeded(state);
    applyTheme();

    await DataStore.deleteItems(removeIds);
    await DataStore.save(state, {
      itemIds: state.items.map(function (item) {
        return item.id;
      }),
      statusItemId: state.selectedItemId
    });
    renderAccount();
    render();
  }

  function normalizeBackupItems(items) {
    var allowedTypes = ["project", "folder", "document"];
    var usedIds = {};
    var normalized = [];
    var byId = {};
    var now = nowIso();

    items.forEach(function (item) {
      var id;
      var type;
      var next;

      if (!item || allowedTypes.indexOf(item.type) === -1) {
        return;
      }

      type = item.type;
      id = typeof item.id === "string" && item.id.trim() && !usedIds[item.id] ? item.id : createId(type);
      usedIds[id] = true;

      next = {
        id: id,
        type: type,
        title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : getDefaultTitle(type),
        parentId: typeof item.parentId === "string" ? item.parentId : null,
        projectId: typeof item.projectId === "string" ? item.projectId : null,
        ownerId: state.session ? state.session.id : item.ownerId || null,
        visibility: item.visibility === "public" ? "public" : "private",
        sharedWith: Array.isArray(item.sharedWith) ? item.sharedWith.filter(function (value) {
          return typeof value === "string";
        }) : [],
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now
      };

      if (item.deletedAt) {
        next.deletedAt = item.deletedAt;
      }

      if (type === "project") {
        next.parentId = null;
        next.content = sanitizeImportedHtml(item.content || "");
        next.isOpen = item.isOpen !== false;
      } else if (type === "document") {
        next.content = sanitizeImportedHtml(item.content || "");
      } else {
        next.isOpen = item.isOpen === true;
      }

      normalized.push(next);
      byId[next.id] = next;
    });

    normalized.forEach(function (item) {
      if (item.parentId && !byId[item.parentId]) {
        item.parentId = null;
      }
      if (item.parentId && byId[item.parentId] && byId[item.parentId].type === "document") {
        item.parentId = null;
      }
    });

    return normalized;
  }

  function sanitizeImportedHtml(html) {
    var wrapper = document.createElement("div");

    wrapper.innerHTML = html || "";
    Array.prototype.slice.call(wrapper.querySelectorAll("script, iframe, object, embed, form, svg, math")).forEach(function (node) {
      node.remove();
    });
    Array.prototype.slice.call(wrapper.querySelectorAll("*")).forEach(function (node) {
      Array.prototype.slice.call(node.attributes).forEach(function (attribute) {
        var name = attribute.name.toLowerCase();
        var value = attribute.value || "";

        if (name.indexOf("on") === 0) {
          node.removeAttribute(attribute.name);
          return;
        }

        if ((name === "href" || name === "src") && /^(javascript|data|vbscript):/i.test(value.trim())) {
          node.removeAttribute(attribute.name);
          return;
        }

        if (name === "style" && /url\s*\(|expression\s*\(|javascript:/i.test(value)) {
          node.removeAttribute(attribute.name);
        }
      });

      if (/^(input|button|select|textarea)$/i.test(node.tagName) && !node.closest(".kanban-block") && !node.closest(".spreadsheet-block")) {
        node.remove();
      }
    });

    return wrapper.innerHTML;
  }

  function getItem(id) {
    return DataStore.getItem(id);
  }

  function getItemsForRemoteSave(itemIds) {
    var ids = [];

    itemIds.forEach(function (id) {
      addItemAndParentsForRemoteSave(id, ids);
    });

    return ids.map(getItem).filter(Boolean);
  }

  function addItemAndParentsForRemoteSave(itemId, ids) {
    var item = getItem(itemId);

    if (!item) {
      return;
    }

    if (item.parentId) {
      addItemAndParentsForRemoteSave(item.parentId, ids);
    }

    if (ids.indexOf(item.id) === -1) {
      ids.push(item.id);
    }
  }

  function getItemsOrderedForRemoteSave(items) {
    var byId = {};

    items.forEach(function (item) {
      byId[item.id] = item;
    });

    return items.slice().sort(function (a, b) {
      return getItemDepthForRemoteSave(a, byId) - getItemDepthForRemoteSave(b, byId);
    });
  }

  function getItemDepthForRemoteSave(item, byId) {
    var depth = 0;
    var current = item;

    while (current && current.parentId && byId[current.parentId] && depth < 50) {
      depth += 1;
      current = byId[current.parentId];
    }

    return depth;
  }

  function isDeleted(item) {
    return !!item && !!item.deletedAt;
  }

  function getDeletedItems() {
    return state.items.filter(isDeleted).sort(function (a, b) {
      return (b.deletedAt || "").localeCompare(a.deletedAt || "");
    });
  }

  function firebaseDocToItem(snapshot) {
    return Object.assign({
      id: snapshot.id
    }, snapshot.data());
  }

  async function loadPublicItemsForView() {
    var items = [];
    var current;
    var projectId;
    var snapshot;

    if (!state.ui.publicId) {
      return [];
    }

    current = await getDoc(doc(db, "items", state.ui.publicId));

    if (!current.exists()) {
      return [];
    }

    var currentItem = firebaseDocToItem(current);

    if (isDeleted(currentItem)) {
      return [];
    }

    items.push(currentItem);

    if (state.ui.publicView === "page") {
      projectId = items[0].projectId || null;
      if (projectId) {
        current = await getDoc(doc(db, "items", projectId));
        if (current.exists()) {
          currentItem = firebaseDocToItem(current);
          if (!isDeleted(currentItem)) {
            items.push(currentItem);
          }
        }
      }
      return items;
    }

    snapshot = await getDocs(query(collection(db, "items"), where("projectId", "==", state.ui.publicId), where("visibility", "==", "public")));
    snapshot.docs.forEach(function (itemDoc) {
      var item = firebaseDocToItem(itemDoc);

      if (isDeleted(item)) {
        return;
      }

      if (!items.some(function (item) {
        return item.id === itemDoc.id;
      })) {
        items.push(item);
      }
    });

    return items;
  }

  function getChildren(parentId, options) {
    var includeDeleted = options && options.includeDeleted;

    return state.items.filter(function (item) {
      return item.parentId === parentId && (includeDeleted || !isDeleted(item));
    });
  }

  function getDescendants(itemId, options) {
    var descendants = [];

    getChildren(itemId, options).forEach(function (child) {
      descendants.push(child);
      descendants = descendants.concat(getDescendants(child.id, options));
    });

    return descendants;
  }

  function getSelectedItem() {
    var item = getItem(state.selectedItemId);
    return isDeleted(item) ? null : item;
  }

  function isAdmin() {
    return state.session && state.session.role === "admin";
  }

  function isModerator() {
    return state.session && state.session.role === "moderator";
  }

  function isItemSharedWithUser(item, userId) {
    return !!item && Array.isArray(item.sharedWith) && item.sharedWith.indexOf(userId) !== -1;
  }

  function canAccessItem(item) {
    if (!item || !state.session) {
      return false;
    }

    if (isDeleted(item)) {
      return false;
    }

    if (isAdmin()) {
      return true;
    }

    if (item.type === "folder") {
      return hasAccessibleDescendant(item.id);
    }

    if (isItemSharedWithUser(item, state.session.id)) {
      return true;
    }

    if (item.type === "document") {
      return isItemSharedWithUser(getItem(getRootProjectId(item.id)), state.session.id);
    }

    if (item.type === "project") {
      return hasAccessibleDescendant(item.id);
    }

    return false;
  }

  function canEditItem(item) {
    if (!item || !state.session) {
      return false;
    }

    if (isDeleted(item)) {
      return false;
    }

    if (isAdmin()) {
      return true;
    }

    if (item.type === "folder") {
      return hasAccessibleDescendant(item.id);
    }

    if (isItemSharedWithUser(item, state.session.id)) {
      return true;
    }

    return item.type === "document" && isItemSharedWithUser(getItem(getRootProjectId(item.id)), state.session.id);
  }

  function canManageDeletedItem(item) {
    if (!item || !state.session) {
      return false;
    }

    if (isAdmin()) {
      return true;
    }

    if (isItemSharedWithUser(item, state.session.id)) {
      return true;
    }

    return item.type === "document" && isItemSharedWithUser(getItem(getRootProjectId(item.id)), state.session.id);
  }

  function hasAccessibleDescendant(itemId) {
    return getDescendants(itemId).some(function (descendant) {
      if (descendant.type === "folder") {
        return false;
      }
      return canAccessItem(descendant);
    });
  }

  function getSidebarSearchQuery() {
    return normalizeTitle(state.ui.searchQuery || "");
  }

  function getSearchableText(item) {
    var wrapper = document.createElement("div");

    wrapper.innerHTML = item.content || "";
    return normalizeTitle((item.title || "") + " " + (wrapper.textContent || ""));
  }

  function itemMatchesSearch(item) {
    var query = getSidebarSearchQuery();

    if (!query) {
      return true;
    }

    return getSearchableText(item).indexOf(query) !== -1;
  }

  function subtreeMatchesSearch(item) {
    if (itemMatchesSearch(item)) {
      return true;
    }

    return getChildren(item.id).some(subtreeMatchesSearch);
  }

  function getVisibleChildren(parentId) {
    var children = getChildren(parentId).filter(canAccessItem);

    if (!getSidebarSearchQuery()) {
      return children;
    }

    return children.filter(subtreeMatchesSearch);
  }

  function getRootProjectId(itemId) {
    var current = getItem(itemId);

    while (current) {
      if (current.type === "project") {
        return current.id;
      }

      current = getItem(current.parentId);
    }

    return null;
  }

  function getProjectIdForNewItem(type, parentId, itemId) {
    if (type === "project") {
      return itemId;
    }

    if (!parentId) {
      return null;
    }

    return getRootProjectId(parentId);
  }

  function getDocumentsInsideProject(projectId) {
    if (!projectId) {
      return [];
    }

    return getDescendants(projectId).filter(function (item) {
      return item.type === "document";
    });
  }

  function findDocumentByTitleInProject(projectId, title) {
    var normalizedTitle = normalizeTitle(title);

    return getDocumentsInsideProject(projectId).find(function (item) {
      return normalizeTitle(item.title) === normalizedTitle;
    }) || null;
  }

  function extractWikiLinkTitles(htmlContent) {
    var wrapper = document.createElement("div");
    var titles = [];
    var match;

    wrapper.innerHTML = htmlContent || "";
    Array.prototype.slice.call(wrapper.querySelectorAll(".image-block")).forEach(function (block) {
      block.remove();
    });

    WIKILINK_PATTERN.lastIndex = 0;
    match = WIKILINK_PATTERN.exec(wrapper.textContent || "");

    while (match) {
      titles.push(match[1]);
      match = WIKILINK_PATTERN.exec(wrapper.textContent || "");
    }

    return titles;
  }

  function buildProjectGraph(projectId) {
    var documents = getDocumentsInsideProject(projectId);
    var edges = [];
    var edgeKeys = {};

    documents.forEach(function (documentItem) {
      extractWikiLinkTitles(documentItem.content).forEach(function (title) {
        var target = findDocumentByTitleInProject(projectId, title);
        var key;

        if (!target || target.id === documentItem.id) {
          return;
        }

        key = documentItem.id + "->" + target.id;

        if (edgeKeys[key]) {
          return;
        }

        edgeKeys[key] = true;
        edges.push({
          source: documentItem.id,
          target: target.id
        });
      });
    });

    return {
      nodes: documents.map(function (documentItem) {
        return {
          id: documentItem.id,
          title: documentItem.title || getDefaultTitle("document")
        };
      }),
      edges: edges
    };
  }

  function createItem(type, parentId, temporaryTitle) {
    var createdAt = nowIso();
    var itemId = createId(type);
    var parent = getItem(parentId);
    var item = {
      id: itemId,
      type: type,
      title: temporaryTitle || "",
      parentId: parentId || null,
      content: "",
      projectId: getProjectIdForNewItem(type, parentId, itemId),
      ownerId: state.session ? state.session.id : null,
      createdAt: createdAt,
      updatedAt: createdAt
    };

    if (type === "project" || type === "folder") {
      item.isOpen = true;
    }

    if (type === "project" || type === "document") {
      item.visibility = "private";
      item.sharedWith = parent && Array.isArray(parent.sharedWith) ? parent.sharedWith.slice() : [];
      if (isModerator() && state.session && item.sharedWith.indexOf(state.session.id) === -1) {
        item.sharedWith.push(state.session.id);
      }
    }

    if (type === "folder") {
      item.sharedWith = parent && Array.isArray(parent.sharedWith) ? parent.sharedWith.slice() : [];
    }

    if (type === "folder") {
      delete item.content;
    }

    state.selectedItemId = item.id;
    DataStore.createItem(item);
    return item;
  }

  function deleteItem(id) {
    var item = getItem(id);

    if (!item || !canEditItem(item)) {
      return;
    }

    var descendants = getDescendants(id);
    var extra = descendants.length ? " e " + descendants.length + " item(ns) dentro dele" : "";
    var confirmed = confirm('Mover "' + item.title + '"' + extra + " para a lixeira?");

    if (!confirmed) {
      return;
    }

    var ids = [id].concat(descendants.map(function (child) {
      return child.id;
    }));

    moveItemsToTrash(ids);
    saveState(ids, null);
    render();
  }

  function removeItems(ids) {
    state.items = state.items.filter(function (item) {
      return ids.indexOf(item.id) === -1;
    });

    if (ids.indexOf(state.selectedItemId) !== -1) {
      state.selectedItemId = null;
    }
  }

  function moveItemsToTrash(ids) {
    var deletedAt = nowIso();

    state.items.forEach(function (item) {
      if (ids.indexOf(item.id) === -1) {
        return;
      }

      item.deletedAt = deletedAt;
      item.updatedAt = deletedAt;
    });

    if (ids.indexOf(state.selectedItemId) !== -1) {
      state.selectedItemId = null;
    }
  }

  function restoreItem(id) {
    var item = getItem(id);
    var ids;

    if (!item || !canManageDeletedItem(item)) {
      return;
    }

    ids = [id].concat(getDescendants(id, {
      includeDeleted: true
    }).map(function (child) {
      return child.id;
    }));

    state.items.forEach(function (candidate) {
      if (ids.indexOf(candidate.id) === -1) {
        return;
      }

      delete candidate.deletedAt;
      candidate.updatedAt = nowIso();
    });

    state.ui.showTrash = false;
    state.selectedItemId = id;
    saveState(ids, id);
    render();
  }

  async function permanentlyDeleteItem(id) {
    var item = getItem(id);
    var ids;

    if (!item || !canManageDeletedItem(item)) {
      return;
    }

    ids = [id].concat(getDescendants(id, {
      includeDeleted: true
    }).map(function (child) {
      return child.id;
    }));

    if (!confirm('Excluir definitivamente "' + (item.title || getDefaultTitle(item.type)) + '"?')) {
      return;
    }

    removeItems(ids);
    saveState([], null);
    render();
    await DataStore.deleteItems(ids);
  }

  function selectItem(id) {
    var item = getItem(id);

    state.selectedItemId = id;
    if (item && item.type === "project") {
      state.ui.projectTab = "cover";
    }
    saveState([], null);
    render();
  }

  function toggleOpen(id) {
    var item = getItem(id);

    if (!item || item.type === "document" || state.inlineEdit) {
      return;
    }

    item.isOpen = !item.isOpen;
    item.updatedAt = nowIso();
    state.selectedItemId = id;
    if (item.type === "project") {
      state.ui.projectTab = "cover";
    }
    saveState([item.id], item.id);
    render();
  }

  function openParents(parentId) {
    var current = getItem(parentId);

    while (current) {
      if (current.type === "project" || current.type === "folder") {
        current.isOpen = true;
      }
      current = getItem(current.parentId);
    }
  }

  function expandParents(itemId) {
    var current = getItem(itemId);

    while (current && current.parentId) {
      current = getItem(current.parentId);

      if (current && (current.type === "project" || current.type === "folder")) {
        current.isOpen = true;
      }
    }
  }

  function openCreateMenu(parentId, allowedTypes, anchor) {
    closeCreateMenu();
    state.createMenu = {
      parentId: parentId || null,
      allowedTypes: allowedTypes,
      anchor: anchor
    };
    renderCreateMenu();
  }

  function closeCreateMenu() {
    var menu = document.getElementById("createMenu");

    if (menu) {
      menu.remove();
    }

    state.createMenu = null;
  }

  function openHighlightMenu(anchor) {
    var editor = document.getElementById("documentContent");

    if (!editor || !hasTextSelectionInside(editor)) {
      alert("Selecione um texto para destacar.");
      return;
    }

    closeHighlightMenu();
    closeTextColorMenu();
    state.highlightMenu = {
      anchor: anchor,
      range: saveSelection(editor)
    };
    renderHighlightMenu();
  }

  function closeHighlightMenu() {
    var menu = document.getElementById("highlightMenu");

    if (menu) {
      menu.remove();
    }

    state.highlightMenu = null;
  }

  function openTextColorMenu(anchor) {
    var editor = document.getElementById("documentContent");

    if (!editor || !hasTextSelectionInside(editor)) {
      alert("Selecione um texto para alterar a cor.");
      return;
    }

    closeHighlightMenu();
    closeTextColorMenu();
    state.textColorMenu = {
      anchor: anchor,
      range: saveSelection(editor)
    };
    renderTextColorMenu();
  }

  function closeTextColorMenu() {
    var menu = document.getElementById("textColorMenu");

    if (menu) {
      menu.remove();
    }

    state.textColorMenu = null;
  }

  function renderHighlightMenu() {
    var colors = state.preferences.theme === "dark" ? [
      ["#5c5125", "Amarelo"],
      ["#2f5535", "Verde"],
      ["#284760", "Azul"],
      ["#5e3030", "Vermelho"],
      ["#4b4b48", "Cinza"]
    ] : [
      ["#fff3a3", "Amarelo"],
      ["#dff5d8", "Verde"],
      ["#d9eaff", "Azul"],
      ["#ffd6d6", "Vermelho"],
      ["#e5e5e5", "Cinza"]
    ];
    var menu;

    if (!state.highlightMenu) {
      return;
    }

    menu = document.createElement("div");
    menu.className = "highlight-menu";
    menu.id = "highlightMenu";

    colors.forEach(function (color) {
      var option = document.createElement("button");
      option.type = "button";
      option.className = "highlight-option";
      option.style.backgroundColor = color[0];
      option.title = color[1];
      option.setAttribute("aria-label", color[1]);
      option.addEventListener("click", function (event) {
        event.stopPropagation();
        applyHighlight(color[0]);
      });
      menu.appendChild(option);
    });

    document.body.appendChild(menu);
    positionCreateMenu(menu, state.highlightMenu.anchor);
  }

  function renderTextColorMenu() {
    var menu;

    if (!state.textColorMenu) {
      return;
    }

    menu = document.createElement("div");
    menu.className = "text-color-menu";
    menu.id = "textColorMenu";

    TEXT_COLOR_OPTIONS.forEach(function (option) {
      var button = document.createElement("button");
      var swatch = document.createElement("span");
      var label = document.createElement("span");

      button.type = "button";
      button.className = "text-color-option";
      swatch.className = "text-color-swatch";
      swatch.style.backgroundColor = option.swatch || option.color;
      label.textContent = option.label;

      if (!option.color) {
        swatch.classList.add("is-default");
      }

      button.appendChild(swatch);
      button.appendChild(label);
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        applyTextColor(option.color);
      });
      menu.appendChild(button);
    });

    document.body.appendChild(menu);
    positionCreateMenu(menu, state.textColorMenu.anchor);
  }

  function renderCreateMenu() {
    if (!state.createMenu) {
      return;
    }

    var menu = document.createElement("div");
    menu.className = "create-menu";
    menu.id = "createMenu";

    state.createMenu.allowedTypes.forEach(function (type) {
      var option = document.createElement("button");
      option.type = "button";
      option.className = "create-menu-item";
      option.textContent = getCreateLabel(type);
      option.addEventListener("click", function (event) {
        event.stopPropagation();
        var parentId = state.createMenu ? state.createMenu.parentId : null;
        closeCreateMenu();
        startInlineCreate(type, parentId);
      });
      menu.appendChild(option);
    });

    document.body.appendChild(menu);
    positionCreateMenu(menu, state.createMenu.anchor);
  }

  function positionCreateMenu(menu, anchor) {
    var rect = anchor.getBoundingClientRect();
    var menuWidth = 176;
    var left = Math.min(rect.left, window.innerWidth - menuWidth - 8);
    var top = rect.bottom + 6;

    menu.style.left = Math.max(8, left) + "px";
    menu.style.top = top + "px";
  }

  function startInlineCreate(type, parentId) {
    if (!parentId && !isAdmin()) {
      alert("Moderadores só podem criar dentro de itens compartilhados.");
      return;
    }

    if (parentId && !canEditItem(getItem(parentId))) {
      alert("Você não tem acesso para alterar este item.");
      return;
    }

    state.sidebarCollapsed = false;

    if (parentId) {
      openParents(parentId);
      var parent = getItem(parentId);
      if (parent) {
        parent.isOpen = true;
      }
    }

    var item = createItem(type, parentId, "");
    state.inlineEdit = {
      mode: "create",
      itemId: item.id,
      originalTitle: ""
    };

    render();
    focusInlineInput();
  }

  function startInlineRename(itemId) {
    var item = getItem(itemId);

    if (!item || !canEditItem(item)) {
      return;
    }

    closeCreateMenu();
    state.sidebarCollapsed = false;
    state.inlineEdit = {
      mode: "rename",
      itemId: item.id,
      originalTitle: item.title
    };

    render();
    focusInlineInput();
  }

  function focusInlineInput() {
    window.setTimeout(function () {
      var input = document.getElementById("inlineTitleInput");

      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  function commitInlineEdit() {
    if (!state.inlineEdit) {
      return;
    }

    var input = document.getElementById("inlineTitleInput");
    var item = getItem(state.inlineEdit.itemId);

    if (!item) {
      state.inlineEdit = null;
      render();
      return;
    }

    var title = input ? input.value.trim() : "";
    item.title = title || getDefaultTitle(item.type);
    item.updatedAt = nowIso();
    state.inlineEdit = null;
    saveState([item.id], item.id);
    render();
  }

  function cancelInlineEdit() {
    if (!state.inlineEdit) {
      return;
    }

    var edit = state.inlineEdit;
    var item = getItem(edit.itemId);

    if (edit.mode === "create") {
      removeItems([edit.itemId]);
    } else if (item) {
      item.title = edit.originalTitle || getDefaultTitle(item.type);
    }

    state.inlineEdit = null;
    saveState(item ? [item.id] : [], item ? item.id : null);
    render();
  }

  function renderSidebar() {
    elements.sidebar.classList.toggle("is-collapsed", state.sidebarCollapsed);
    elements.treeList.innerHTML = "";

    if (elements.sidebarSearch && elements.sidebarSearch.value !== (state.ui.searchQuery || "")) {
      elements.sidebarSearch.value = state.ui.searchQuery || "";
    }

    if (elements.trashCount) {
      elements.trashCount.textContent = String(getDeletedItems().length);
    }

    if (elements.trashToggle) {
      elements.trashToggle.classList.toggle("is-active", !!state.ui.showTrash);
    }

    if (state.ui.showTrash && !state.sidebarCollapsed) {
      renderTrash();
      return;
    }

    var rootItems = getVisibleChildren(null);

    if (!rootItems.length && !state.sidebarCollapsed) {
      var empty = document.createElement("div");
      empty.className = "sidebar-empty";
      empty.textContent = getSidebarSearchQuery() ? "Nada encontrado" : "Nenhum item ainda";
      elements.treeList.appendChild(empty);
      return;
    }

    renderTree(null, 0);
  }

  function renderTree(parentId, depth) {
    var isSearching = !!getSidebarSearchQuery();

    getVisibleChildren(parentId).forEach(function (item) {
      renderTreeItem(item, depth);

      if ((item.type === "project" || item.type === "folder") && (item.isOpen || isSearching)) {
        renderTree(item.id, depth + 1);
      }
    });
  }

  function renderTrash() {
    var items = getDeletedItems().filter(function (item) {
      return !isDeleted(getItem(item.parentId));
    });

    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "sidebar-empty";
      empty.textContent = "Lixeira vazia";
      elements.treeList.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      renderTrashItem(item);
    });
  }

  function renderTrashItem(item) {
    var row = document.createElement("div");
    var title = document.createElement("span");
    var restore = document.createElement("button");
    var remove = document.createElement("button");

    row.className = "tree-item tree-item-trash";
    row.style.setProperty("--depth", 0);

    title.className = "tree-title";
    title.textContent = item.title || getDefaultTitle(item.type);

    restore.type = "button";
    restore.className = "tree-mini-action";
    restore.textContent = "R";
    restore.title = "Restaurar";
    restore.setAttribute("aria-label", "Restaurar");
    restore.addEventListener("click", function () {
      restoreItem(item.id);
    });

    remove.type = "button";
    remove.className = "tree-mini-action danger";
    remove.textContent = "x";
    remove.title = "Excluir definitivamente";
    remove.setAttribute("aria-label", "Excluir definitivamente");
    remove.addEventListener("click", function () {
      permanentlyDeleteItem(item.id);
    });

    row.appendChild(title);
    row.appendChild(restore);
    row.appendChild(remove);
    elements.treeList.appendChild(row);
  }

  function renderTreeItem(item, depth) {
    var row = document.createElement("div");
    row.className = "tree-item tree-item-" + item.type;
    row.style.setProperty("--depth", depth);

    if (item.id === state.selectedItemId) {
      row.classList.add("is-active");
    }

    if (getSidebarSearchQuery() && itemMatchesSearch(item)) {
      row.classList.add("is-search-match");
    }

    var main = document.createElement("div");
    main.className = "tree-main";
    main.setAttribute("role", "button");
    main.setAttribute("tabindex", "0");
    main.title = item.title || getDefaultTitle(item.type);

    var indicator = document.createElement("span");
    indicator.className = "tree-indicator";
    indicator.textContent = getIndicator(item);

    var icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = getIcon(item);

    main.appendChild(indicator);
    main.appendChild(icon);

    if (state.inlineEdit && state.inlineEdit.itemId === item.id) {
      main.appendChild(renderInlineInput(item));
    } else {
      var title = document.createElement("span");
      title.className = "tree-title";
      title.textContent = item.title || getDefaultTitle(item.type);
      main.appendChild(title);
    }

    main.addEventListener("click", function () {
      if (state.inlineEdit) {
        return;
      }

      if (item.type === "document") {
        selectItem(item.id);
      } else {
        toggleOpen(item.id);
      }
    });

    main.addEventListener("dblclick", function (event) {
      event.stopPropagation();
      startInlineRename(item.id);
    });

    main.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        main.click();
      }
    });

    row.appendChild(main);

    if (isAdmin() && (item.type === "project" || item.type === "document")) {
      row.appendChild(renderTreeVisibilityButton(item));
    }

    if ((item.type === "project" || item.type === "folder") && canEditItem(item)) {
      var add = document.createElement("button");
      add.type = "button";
      add.className = "tree-add";
      add.textContent = "+";
      add.title = "Criar dentro de " + (item.title || getDefaultTitle(item.type));
      add.setAttribute("aria-label", add.title);
      add.addEventListener("click", function (event) {
        event.stopPropagation();
        openCreateMenu(item.id, ["folder", "document"], add);
      });
      row.appendChild(add);
    }

    elements.treeList.appendChild(row);
  }

  function renderTreeVisibilityButton(item) {
    var button = document.createElement("button");
    var isPublic = item.visibility === "public";
    button.type = "button";
    button.className = "tree-visibility" + (isPublic ? " is-public" : " is-private");
    button.textContent = isPublic ? "P" : "R";
    button.title = isPublic ? "Público" : "Privado";
    button.setAttribute("aria-label", isPublic ? "Tornar privado" : "Tornar público");
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleVisibility(item.id);
    });
    return button;
  }

  function renderInlineInput(item) {
    var input = document.createElement("input");
    input.id = "inlineTitleInput";
    input.className = "tree-title-input";
    input.type = "text";
    input.value = item.title;
    input.placeholder = getDefaultTitle(item.type);

    input.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    input.addEventListener("dblclick", function (event) {
      event.stopPropagation();
    });

    input.addEventListener("keydown", function (event) {
      event.stopPropagation();

      if (event.key === "Enter") {
        event.preventDefault();
        commitInlineEdit();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancelInlineEdit();
      }
    });

    input.addEventListener("blur", function () {
      window.setTimeout(function () {
        if (state.inlineEdit && document.activeElement !== input) {
          commitInlineEdit();
        }
      }, 0);
    });

    return input;
  }

  function renderMain() {
    var item = getSelectedItem();

    if (!item || !canAccessItem(item)) {
      renderEmptyState();
      return;
    }

    if (item.type === "document") {
      renderEditor(item);
      return;
    }

    if (item.type === "project") {
      if (!isAdmin() && !isItemSharedWithUser(item, state.session.id)) {
        renderContainerState(item);
        return;
      }
      renderProjectView(item);
      return;
    }

    renderContainerState(item);
  }

  function renderEmptyState() {
    var empty = document.createElement("div");
    var title = document.createElement("h2");
    var text = document.createElement("p");

    elements.editorPanel.innerHTML = "";
    empty.className = "empty-state";
    title.textContent = "Nenhum documento selecionado";
    text.textContent = "Crie ou selecione um documento na barra lateral.";

    empty.appendChild(title);
    empty.appendChild(text);

    if (isAdmin()) {
      var actions = document.createElement("div");
      actions.className = "empty-actions";
      actions.appendChild(createTextButton("Novo projeto", function () {
        startInlineCreate("project", null);
      }));
      actions.appendChild(createTextButton("Novo documento", function () {
        startInlineCreate("document", null);
      }));
      empty.appendChild(actions);
    }

    elements.editorPanel.appendChild(empty);
  }

  function renderHeader(item, includeToolbar) {
    var header = document.createElement("div");
    var isCollapsed = isHeaderCollapsed();
    header.className = "editor-header";

    if (item.type === "project" && !isCollapsed) {
      header.classList.add("has-tabs");
    }

    if (!includeToolbar && !isCollapsed) {
      header.classList.add("is-compact");
    }

    if (isCollapsed) {
      var compactHeader = document.createElement("div");
      var compactTitle = document.createElement("span");

      header.classList.add("is-collapsed");
      compactHeader.className = "compact-header";
      compactTitle.className = "compact-title";
      compactTitle.textContent = item.title || getDefaultTitle(item.type);

      compactHeader.appendChild(renderHeaderCollapseToggle());
      compactHeader.appendChild(compactTitle);
      header.appendChild(compactHeader);
      return header;
    }

    var headerLeft = document.createElement("div");
    headerLeft.className = "header-left";

    var heading = document.createElement("div");
    heading.className = "document-heading";

    var title = document.createElement("h2");
    title.textContent = item.title || getDefaultTitle(item.type);

    var breadcrumb = document.createElement("div");
    breadcrumb.className = "breadcrumb";
    breadcrumb.textContent = renderBreadcrumb(item.id);

    var status = document.createElement("div");
    status.className = "status-line";
    status.id = "saveStatus";
    status.textContent = item.type === "document" ? getSaveStatusText() : getHeaderStatus(item);

    heading.appendChild(title);
    heading.appendChild(breadcrumb);
    heading.appendChild(status);
    headerLeft.appendChild(renderHeaderCollapseToggle());
    headerLeft.appendChild(heading);

    var actions = document.createElement("div");
    actions.className = "header-actions";
    var documentActions = document.createElement("div");
    documentActions.className = "document-actions";

    if (isAdmin() && (item.type === "project" || item.type === "document")) {
      if (item.visibility === "public") {
        documentActions.appendChild(createTextButton("Copiar link", function () {
          copyPublicLink(item);
        }));
      }

      documentActions.appendChild(createTextButton("Compartilhar", function () {
        shareItem(item.id);
      }));

      if (state.ui.copyFeedbackId === item.id) {
        var copied = document.createElement("span");
        copied.className = "copy-feedback";
        copied.textContent = "Link copiado";
        documentActions.appendChild(copied);
      }
    }

    documentActions.appendChild(createTextButton("IA", function () {
      toggleAiPanel();
    }));

    if (canEditItem(item)) {
      documentActions.appendChild(createTextButton("Renomear", function () {
        startInlineRename(item.id);
      }));
      documentActions.appendChild(createTextButton("Lixeira", function () {
        deleteItem(item.id);
      }, "danger"));
    }

    if (includeToolbar && canEditItem(item)) {
      actions.appendChild(renderToolbar());
    }

    actions.appendChild(documentActions);

    header.appendChild(headerLeft);

    if (item.type === "project") {
      header.appendChild(renderProjectTabs());
    }

    header.appendChild(actions);
    return header;
  }

  function renderContainerState(item) {
    elements.editorPanel.innerHTML = "";
    elements.editorPanel.appendChild(renderHeader(item, false));

    var body = document.createElement("div");
    body.className = "container-message";

    var text = document.createElement("p");
    text.textContent = "Selecione ou crie um documento dentro deste item para começar a escrever.";
    body.appendChild(text);

    if (canEditItem(item) && (item.type === "project" || item.type === "folder")) {
      var actions = document.createElement("div");
      actions.className = "empty-actions";
      actions.appendChild(createTextButton("Novo documento", function () {
        startInlineCreate("document", item.id);
      }));
      actions.appendChild(createTextButton("Nova pasta", function () {
        startInlineCreate("folder", item.id);
      }));
      body.appendChild(actions);
    }

    elements.editorPanel.appendChild(body);
  }

  function renderProjectView(project) {
    if (state.ui.projectTab === "graph") {
      renderProjectOverview(project);
      return;
    }

    renderEditor(project);
  }

  function renderProjectTabs() {
    var tabs = document.createElement("div");
    tabs.className = "project-tabs";
    tabs.appendChild(createProjectTab("cover", "Capa"));
    tabs.appendChild(createProjectTab("graph", "Grafo"));
    return tabs;
  }

  function createProjectTab(tab, label) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "project-tab" + (state.ui.projectTab === tab ? " active" : "");
    button.textContent = label;
    button.addEventListener("click", function () {
      state.ui.projectTab = tab;
      render();
    });
    return button;
  }

  function renderProjectOverview(project) {
    elements.editorPanel.innerHTML = "";
    elements.editorPanel.appendChild(renderHeader(project, false));

    var overview = document.createElement("div");
    overview.className = "project-overview";

    var graph = buildProjectGraph(project.id);

    if (!graph.nodes.length) {
      var empty = document.createElement("div");
      empty.className = "container-message";
      empty.innerHTML = "<p>Este projeto ainda não possui documentos.</p>";
      elements.editorPanel.appendChild(empty);
      return;
    }

    var legend = document.createElement("p");
    legend.className = "graph-legend";
    legend.textContent = "Cada ponto representa um documento. As linhas representam links internos [[...]].";
    overview.appendChild(legend);

    if (!graph.edges.length) {
      var note = document.createElement("p");
      note.className = "graph-note";
      note.textContent = "Nenhuma conexão encontrada. Use [[nome do documento]] para conectar documentos.";
      overview.appendChild(note);
    }

    var wrapper = document.createElement("div");
    wrapper.className = "graph-wrapper";
    wrapper.appendChild(renderProjectGraphSvg(graph));
    overview.appendChild(wrapper);
    elements.editorPanel.appendChild(overview);
  }

  function renderProjectGraphSvg(graph) {
    var width = 900;
    var height = 520;
    var centerX = width / 2;
    var centerY = height / 2;
    var radius = graph.nodes.length === 1 ? 0 : Math.min(width, height) * 0.34;
    var positions = {};
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    svg.setAttribute("class", "project-graph");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    graph.nodes.forEach(function (node, index) {
      var angle = -Math.PI / 2 + (Math.PI * 2 * index) / graph.nodes.length;
      positions[node.id] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      };
    });

    graph.edges.forEach(function (edge) {
      var source = positions[edge.source];
      var target = positions[edge.target];

      if (!source || !target) {
        return;
      }

      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "graph-edge");
      line.setAttribute("x1", source.x);
      line.setAttribute("y1", source.y);
      line.setAttribute("x2", target.x);
      line.setAttribute("y2", target.y);
      svg.appendChild(line);
    });

    graph.nodes.forEach(function (node) {
      var position = positions[node.id];
      var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      var text = document.createElementNS("http://www.w3.org/2000/svg", "text");

      group.setAttribute("class", "graph-node");
      group.setAttribute("tabindex", "0");
      group.setAttribute("transform", "translate(" + position.x + " " + position.y + ")");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", "Abrir " + node.title);

      circle.setAttribute("r", "18");

      text.setAttribute("x", "0");
      text.setAttribute("y", "34");
      text.setAttribute("text-anchor", "middle");
      text.textContent = truncateGraphTitle(node.title);

      group.appendChild(circle);
      group.appendChild(text);
      group.addEventListener("click", function () {
        openGraphDocument(node.id);
      });
      group.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openGraphDocument(node.id);
        }
      });

      svg.appendChild(group);
    });

    return svg;
  }

  function renderEditor(item) {
    elements.editorPanel.innerHTML = "";
    elements.editorPanel.appendChild(renderHeader(item, true));

    var body = document.createElement("div");
    body.className = "editor-body";

    var editor = document.createElement("div");
    editor.className = "document-editor";
    editor.id = "documentContent";
    editor.contentEditable = "true";
    editor.spellcheck = true;
    editor.dataset.placeholder = "Comece a escrever...";
    editor.innerHTML = item.content || "";

    normalizeEditorContent(editor);
    prepareEditorMedia(editor);
    prepareToggleBlocks(editor, false);
    prepareKanbanBlocks(editor, false);
    prepareSpreadsheetBlocks(editor, false);
    ensureLinksOpenInNewTab(editor);
    var normalizedContent = getEditorHtml(editor);
    if (item.content !== normalizedContent) {
      item.content = normalizedContent;
      saveState([item.id], item.id);
    }

    editor.addEventListener("input", function (event) {
      if (handleSpreadsheetInput(event, item.id, editor)) {
        return;
      }

      if (handleKanbanInput(event, item.id, editor)) {
        return;
      }

      scheduleSave(item.id, editor);
      scheduleNormalize(item.id, editor);
    });

    editor.addEventListener("paste", function (event) {
      handleEditorPaste(event, item.id, editor);
    });

    editor.addEventListener("blur", function () {
      normalizeEditorContent();
      updateDocumentContent(item.id, getEditorHtml(editor));
    });

    editor.addEventListener("click", function (event) {
      if (handleToggleBlockClick(event, item.id, editor, false)) {
        return;
      }

      if (event.target.closest && event.target.closest(".spreadsheet-block")) {
        if (handleSpreadsheetClick(event, item.id, editor)) {
          return;
        }

        clearImageSelection();
        return;
      }

      if (event.target.closest && event.target.closest(".kanban-block")) {
        if (handleKanbanClick(event, item.id, editor)) {
          return;
        }

        clearImageSelection();
        return;
      }

      var imageBlock = event.target.closest ? event.target.closest(".image-block") : null;
      var removeButton = event.target.closest ? event.target.closest(".image-remove") : null;
      var internalLink = event.target.closest ? event.target.closest(".internal-link") : null;
      var link = event.target.closest ? event.target.closest("a") : null;

      if (removeButton && imageBlock && editor.contains(imageBlock)) {
        event.preventDefault();
        removeImageBlock(imageBlock, item.id, editor);
        return;
      }

      if (imageBlock && editor.contains(imageBlock)) {
        event.preventDefault();
        selectImageBlock(imageBlock);
        editor.focus();
        return;
      }

      if (internalLink && editor.contains(internalLink)) {
        event.preventDefault();
        updateDocumentContent(item.id, getEditorHtml(editor));
        openInternalLink(internalLink);
        return;
      }

      if (link && editor.contains(link)) {
        event.preventDefault();
        window.open(link.href, "_blank", "noopener,noreferrer");
        return;
      }

      clearImageSelection();
    });

    editor.addEventListener("mousedown", function (event) {
      var handle = event.target.closest ? event.target.closest(".resize-handle") : null;

      if (handle) {
        event.preventDefault();
        startImageResize(handle.closest(".image-block"), item.id, editor, event);
      }
    });

    editor.addEventListener("dragstart", function (event) {
      var imageBlock = event.target.closest ? event.target.closest(".image-block") : null;

      if (!imageBlock || !editor.contains(imageBlock)) {
        return;
      }

      draggedImageBlock = imageBlock;
      selectImageBlock(imageBlock);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "");
    });

    editor.addEventListener("dragstart", function (event) {
      handleKanbanDragStart(event, editor);
    });

    editor.addEventListener("dragover", function (event) {
      if (!draggedImageBlock) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });

    editor.addEventListener("dragover", function (event) {
      handleKanbanDragOver(event, editor);
    });

    editor.addEventListener("drop", function (event) {
      if (!draggedImageBlock) {
        return;
      }

      event.preventDefault();
      moveDraggedImage(editor, event.clientY);
      updateDocumentContent(item.id, getEditorHtml(editor));
    });

    editor.addEventListener("drop", function (event) {
      handleKanbanDrop(event, item.id, editor);
    });

    editor.addEventListener("dragend", function () {
      draggedImageBlock = null;
    });

    editor.addEventListener("dragend", function () {
      if (draggedKanbanCard) {
        updateDocumentContent(item.id, getEditorHtml(editor));
      }

      handleKanbanDragEnd();
    });

    editor.addEventListener("keydown", function (event) {
      if (handleSpreadsheetKeydown(event, item.id, editor)) {
        return;
      }

      if (!selectedImageBlock) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeImageBlock(selectedImageBlock, item.id, editor);
      }
    });

    body.appendChild(editor);
    elements.editorPanel.appendChild(body);
    editor.focus();
  }

  function renderToolbar() {
    var toolbar = document.createElement("div");
    toolbar.className = "format-toolbar header-toolbar";
    toolbar.setAttribute("aria-label", "Formatação de texto");

    [
      [
        ["B", "Negrito", "bold", null, "bold"],
        ["I", "Itálico", "italic", null, "italic"],
        ["U", "Sublinhado", "underline", null, "underline"],
        ["Título", "Transformar em título", "formatBlock", "h2"],
        ["Texto", "Texto normal", "formatBlock", "p"],
        ["Lista", "Lista com marcadores", "insertUnorderedList"]
      ],
      [
        ["A+", "Aumentar fonte", "fontSize", "5"],
        ["A-", "Diminuir fonte", "fontSize", "2"]
      ],
      [
        ["←", "Alinhar à esquerda", "justifyLeft"],
        ["↔", "Centralizar", "justifyCenter"],
        ["→", "Alinhar à direita", "justifyRight"],
        ["≡", "Justificar", "justifyFull"]
      ],
      [
        ["Destacar", "Destacar texto", "highlight"],
        ["Cor", "Alterar cor do texto", "textColor"],
        ["Código", "Inserir bloco de código", "code"],
        ["Toggle", "Inserir bloco recolhível", "toggle"],
        ["Kanban", "Inserir bloco Kanban", "kanban"],
        ["Planilha", "Inserir planilha", "spreadsheet"],
        ["Link", "Inserir link", "link"],
        ["Imagem", "Inserir imagem", "image"]
      ]
    ].forEach(function (group) {
      toolbar.appendChild(createToolbarGroup(group));
    });

    return toolbar;
  }

  function renderHeaderCollapseToggle() {
    var button = document.createElement("button");
    var isCollapsed = isHeaderCollapsed();

    button.type = "button";
    button.className = "header-collapse-toggle";
    button.textContent = isCollapsed ? "▾" : "▴";
    button.title = isCollapsed ? "Expandir cabeçalho" : "Recolher cabeçalho";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-expanded", String(!isCollapsed));

    button.addEventListener("mousedown", function (event) {
      event.preventDefault();
    });

    button.addEventListener("click", function () {
      toggleHeaderCollapsed();
    });

    return button;
  }

  function createToolbarGroup(buttons) {
    var group = document.createElement("div");
    group.className = "toolbar-group";

    buttons.forEach(function (button) {
      group.appendChild(createToolbarButton(button[0], button[1], button[2], button[3], button[4]));
    });

    return group;
  }

  function createToolbarButton(label, title, command, value, extraClass) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "tool-button" + (extraClass ? " " + extraClass : "");
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);

    button.addEventListener("mousedown", function (event) {
      event.preventDefault();
    });

    button.addEventListener("click", function () {
      if (command === "link") {
        applyLink();
        return;
      }

      if (command === "image") {
        insertImageByUrl();
        return;
      }

      if (command === "highlight") {
        openHighlightMenu(button);
        return;
      }

      if (command === "textColor") {
        openTextColorMenu(button);
        return;
      }

      if (command === "code") {
        insertCodeBlock();
        return;
      }

      if (command === "toggle") {
        insertToggleBlock();
        return;
      }

      if (command === "kanban") {
        insertKanbanBlock();
        return;
      }

      if (command === "spreadsheet") {
        insertSpreadsheetBlock();
        return;
      }

      applyFormatting(command, value);
    });

    return button;
  }

  function createTextButton(label, onClick, extraClass) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "text-button" + (extraClass ? " " + extraClass : "");
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function applyFormatting(command, value) {
    var editor = document.getElementById("documentContent");
    var item = getSelectedItem();

    if (!editor || !item || (item.type !== "document" && item.type !== "project")) {
      return;
    }

    if (isAlignmentCommand(command) && selectedImageBlock && editor.contains(selectedImageBlock)) {
      applyImageAlignment(selectedImageBlock, command);
      updateDocumentContent(item.id, getEditorHtml(editor));
      return;
    }

    editor.focus();
    document.execCommand(command, false, value || null);
    normalizeEditorContent();
    updateDocumentContent(item.id, getEditorHtml(editor));
  }

  function applyHighlight(color) {
    var editor = document.getElementById("documentContent");
    var item = getSelectedItem();

    if (!editor || !item || (item.type !== "document" && item.type !== "project")) {
      return;
    }

    editor.focus();
    restoreSelection(state.highlightMenu ? state.highlightMenu.range : null);
    document.execCommand("backColor", false, color);
    closeHighlightMenu();
    updateDocumentContent(item.id, getEditorHtml(editor));
  }

  function applyTextColor(color) {
    var editor = document.getElementById("documentContent");
    var item = getSelectedItem();

    if (!editor || !item || (item.type !== "document" && item.type !== "project")) {
      return;
    }

    editor.focus();
    restoreSelection(state.textColorMenu ? state.textColorMenu.range : null);

    if (color) {
      document.execCommand("foreColor", false, color);
    } else {
      removeTextColorFromSelection(editor);
    }

    closeTextColorMenu();
    normalizeEditorContent(editor);
    updateDocumentContent(item.id, getEditorHtml(editor));
  }

  function removeTextColorFromSelection(editor) {
    var selection = window.getSelection();
    var range;
    var fragment;
    var markerId;
    var marker;

    if (!selection || selection.rangeCount === 0) {
      return;
    }

    range = selection.getRangeAt(0);

    if (range.collapsed || !editor.contains(range.commonAncestorContainer)) {
      return;
    }

    fragment = range.extractContents();
    stripTextColor(fragment);
    markerId = createId("caret");
    marker = createCaretMarker(markerId);
    fragment.appendChild(marker);
    range.insertNode(fragment);
    restoreCaretAtMarker(editor, markerId);
  }

  function stripTextColor(root) {
    Array.prototype.slice.call(root.querySelectorAll("[style]")).forEach(function (node) {
      node.style.removeProperty("color");
      if (!node.getAttribute("style")) {
        node.removeAttribute("style");
      }
    });

    Array.prototype.slice.call(root.querySelectorAll("font[color]")).forEach(function (node) {
      node.removeAttribute("color");
      if (!node.attributes.length) {
        unwrapElement(node);
      }
    });
  }

  function unwrapElement(element) {
    var fragment = document.createDocumentFragment();

    while (element.firstChild) {
      fragment.appendChild(element.firstChild);
    }

    element.replaceWith(fragment);
  }

  function insertCodeBlock() {
    var editor = document.getElementById("documentContent");
    var item = getSelectedItem();

    if (!editor || !item || (item.type !== "document" && item.type !== "project")) {
      return;
    }

    editor.focus();
    document.execCommand("insertHTML", false, '<pre class="code-block" style="text-align: left;" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off"><code spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off">// escreva seu código aqui</code></pre><p><br></p>');
    updateDocumentContent(item.id, getEditorHtml(editor));
  }

  function insertToggleBlock() {
    var editor = document.getElementById("documentContent");
    var item = getSelectedItem();
    var toggleId = createId("toggle");
    var block;
    var title;

    if (!editor || !item || (item.type !== "document" && item.type !== "project")) {
      return;
    }

    editor.focus();
    insertHtmlAtCursorAndMoveCaret(createToggleBlockHtml(toggleId), editor);
    prepareToggleBlocks(editor, false);

    block = editor.querySelector('[data-temp-toggle="' + toggleId + '"]');
    if (block) {
      block.removeAttribute("data-temp-toggle");
      title = block.querySelector(".toggle-title");
      if (title) {
        selectEditableNodeText(title);
      }
    }

    updateDocumentContent(item.id, getEditorHtml(editor));
  }

  function createToggleBlockHtml(toggleId) {
    return '<div class="toggle-block" data-open="true" data-temp-toggle="' + toggleId + '">' +
      '<div class="toggle-header" contenteditable="false">' +
      '<button class="toggle-arrow" type="button" contenteditable="false" aria-label="Recolher">▾</button>' +
      '<span class="toggle-title" contenteditable="true">Título do bloco</span>' +
      "</div>" +
      '<div class="toggle-content" contenteditable="true">Escreva o conteúdo aqui...</div>' +
      "</div><p><br></p>";
  }

  function insertKanbanBlock() {
    var editor = document.getElementById("documentContent");
    var item = getSelectedItem();
    var kanbanId = createId("kanban");
    var block;

    if (!editor || !item || (item.type !== "document" && item.type !== "project")) {
      return;
    }

    editor.focus();
    insertHtmlAtCursorAndMoveCaret(createKanbanBlockHtml(kanbanId), editor);
    prepareKanbanBlocks(editor, false);

    block = editor.querySelector('[data-temp-kanban="' + kanbanId + '"]');
    if (block) {
      block.removeAttribute("data-temp-kanban");
    }

    updateDocumentContent(item.id, getEditorHtml(editor));
  }

  function createKanbanBlockHtml(kanbanId) {
    return '<div class="kanban-block" contenteditable="false" data-kanban-id="' + escapeHtml(kanbanId) + '" data-temp-kanban="' + escapeHtml(kanbanId) + '">' +
      '<div class="kanban-header">' +
      '<span class="kanban-title">Kanban</span>' +
      '<button type="button" class="kanban-add-column" contenteditable="false">+ Coluna</button>' +
      '<button type="button" class="kanban-delete-block" contenteditable="false">Remover</button>' +
      "</div>" +
      '<div class="kanban-board">' +
      createKanbanColumnHtml("A Fazer") +
      createKanbanColumnHtml("Fazendo") +
      createKanbanColumnHtml("Concluído") +
      "</div>" +
      "</div><p><br></p>";
  }

  function createKanbanColumnHtml(title) {
    var columnId = createId("column");

    return '<div class="kanban-column" data-column-id="' + escapeHtml(columnId) + '">' +
      '<div class="kanban-column-header">' +
      '<input class="kanban-column-title" value="' + escapeHtml(title) + '" aria-label="Título da coluna">' +
      '<button type="button" class="kanban-delete-column" contenteditable="false" aria-label="Excluir coluna">×</button>' +
      "</div>" +
      '<div class="kanban-cards"></div>' +
      '<button type="button" class="kanban-add-card" contenteditable="false">+ Cartão</button>' +
      "</div>";
  }

  function createKanbanColumnElement(title) {
    var wrapper = document.createElement("div");
    wrapper.innerHTML = createKanbanColumnHtml(title || "Nova coluna");
    return wrapper.firstChild;
  }

  function createKanbanCardElement(text) {
    var card = document.createElement("div");
    var title = document.createElement("div");
    var meta = document.createElement("div");
    var count = document.createElement("span");
    var remove = document.createElement("button");
    var data = document.createElement("div");

    card.className = "kanban-card";
    card.draggable = true;
    card.setAttribute("data-card-id", createId("card"));
    card.setAttribute("contenteditable", "false");

    title.className = "kanban-card-title";
    title.textContent = text || "Novo cartão";

    meta.className = "kanban-card-meta";
    count.className = "kanban-checklist-count";
    meta.appendChild(count);

    remove.type = "button";
    remove.className = "kanban-delete-card";
    remove.setAttribute("contenteditable", "false");
    remove.setAttribute("aria-label", "Excluir cartão");
    remove.textContent = "×";

    data.className = "kanban-card-data";
    data.hidden = true;

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(remove);
    card.appendChild(data);
    return card;
  }

  function insertSpreadsheetBlock() {
    var editor = document.getElementById("documentContent");
    var item = getSelectedItem();
    var sheetId = createId("sheet");
    var block;

    if (!editor || !item || (item.type !== "document" && item.type !== "project")) {
      return;
    }

    editor.focus();
    insertHtmlAtCursorAndMoveCaret(createSpreadsheetBlockHtml(sheetId), editor);
    prepareSpreadsheetBlocks(editor, false);

    block = editor.querySelector('[data-temp-sheet="' + sheetId + '"]');
    if (block) {
      block.removeAttribute("data-temp-sheet");
    }

    updateDocumentContent(item.id, getEditorHtml(editor));
  }

  function createSpreadsheetBlockHtml(sheetId) {
    return '<div class="spreadsheet-block" contenteditable="false" data-sheet-id="' + escapeHtml(sheetId) + '" data-temp-sheet="' + escapeHtml(sheetId) + '">' +
      '<div class="spreadsheet-toolbar" contenteditable="false">' +
      '<span class="spreadsheet-title">Planilha</span>' +
      '<button type="button" class="sheet-delete-block" contenteditable="false">Remover planilha</button>' +
      '<button type="button" class="sheet-add-row" contenteditable="false">+ Linha</button>' +
      '<button type="button" class="sheet-add-column" contenteditable="false">+ Coluna</button>' +
      '<button type="button" class="sheet-delete-row" contenteditable="false">Remover linha</button>' +
      '<button type="button" class="sheet-delete-column" contenteditable="false">Remover coluna</button>' +
      '<button type="button" class="sheet-align-left" contenteditable="false" title="Alinhar à esquerda">Esq</button>' +
      '<button type="button" class="sheet-align-center" contenteditable="false" title="Centralizar">Centro</button>' +
      '<button type="button" class="sheet-align-right" contenteditable="false" title="Alinhar à direita">Dir</button>' +
      '<button type="button" class="sheet-color-cell" contenteditable="false">Cor célula</button>' +
      '<button type="button" class="sheet-clear-color" contenteditable="false">Limpar cor</button>' +
      "</div>" +
      '<div class="spreadsheet-scroll">' +
      '<table class="spreadsheet-table"><tbody>' +
      createSpreadsheetRowHtml(0, 3, true) +
      createSpreadsheetRowHtml(1, 3, false) +
      createSpreadsheetRowHtml(2, 3, false) +
      createSpreadsheetRowHtml(3, 3, false) +
      "</tbody></table>" +
      "</div>" +
      "</div><p><br></p>";
  }

  function createSpreadsheetRowHtml(rowIndex, columnCount, isHeader) {
    var html = "<tr>";
    var tag = isHeader ? "th" : "td";
    var col;
    var text;

    for (col = 0; col < columnCount; col += 1) {
      text = isHeader ? "Coluna " + (col + 1) : "";
      html += '<' + tag + ' contenteditable="true" data-row="' + rowIndex + '" data-col="' + col + '">' + escapeHtml(text) + '</' + tag + '>';
    }

    return html + "</tr>";
  }

  function selectEditableNodeText(node) {
    var range = document.createRange();
    var selection = window.getSelection();

    if (!selection) {
      return;
    }

    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
    node.focus();
  }

  function applyLink() {
    var editor = document.getElementById("documentContent");
    var item = getSelectedItem();

    if (!editor || !item || item.type !== "document") {
      return;
    }

    var savedRange = saveSelection(editor);
    var hasSelection = hasTextSelectionInside(editor);
    var url = prompt("Digite a URL");

    if (!url || !url.trim()) {
      return;
    }

    url = normalizeUrl(url.trim());
    editor.focus();
    restoreSelection(savedRange);

    if (hasSelection) {
      document.execCommand("createLink", false, url);
    } else {
      var label = prompt("Texto do link (deixe vazio para usar a própria URL)");
      if (label === null) {
        return;
      }
      document.execCommand("insertHTML", false, createLinkHtml(url, label.trim() || url));
    }

    ensureLinksOpenInNewTab(editor);
    updateDocumentContent(item.id, getEditorHtml(editor));
  }

  function insertImageByUrl() {
    var editor = document.getElementById("documentContent");
    var item = getSelectedItem();

    if (!editor || !item || item.type !== "document") {
      return;
    }

    var savedRange = saveSelection(editor);
    var url = prompt("URL da imagem:");

    if (!url || !url.trim()) {
      return;
    }

    url = normalizeUrl(url.trim());

    if (!isImageUrl(url)) {
      alert("Use uma URL direta de imagem: png, jpg, jpeg, webp ou gif.");
      return;
    }

    editor.focus();
    restoreSelection(savedRange);
    document.execCommand("insertHTML", false, createImageBlockHtml(url, getCurrentTextAlignment(editor)));
    prepareEditorMedia(editor);
    updateDocumentContent(item.id, getEditorHtml(editor));
  }

  function normalizeEditorContent(root) {
    var editor = root || document.getElementById("documentContent");

    if (!editor) {
      return;
    }

    unwrapWikilinks(editor);
    linkifyTextNodes(editor);
    wikilinkTextNodes(editor);
    normalizeCodeBlocks(editor);
    prepareToggleBlocks(editor, false);
    prepareKanbanBlocks(editor, false);
    prepareSpreadsheetBlocks(editor, false);
    prepareEditorMedia(editor);
    ensureLinksOpenInNewTab(editor);
  }

  function normalizeCodeBlocks(root) {
    Array.prototype.slice.call(root.querySelectorAll(".code-block")).forEach(function (block) {
      block.setAttribute("spellcheck", "false");
      block.setAttribute("autocorrect", "off");
      block.setAttribute("autocapitalize", "off");
      block.setAttribute("autocomplete", "off");

      Array.prototype.slice.call(block.querySelectorAll("code")).forEach(function (code) {
        code.setAttribute("spellcheck", "false");
        code.setAttribute("autocorrect", "off");
        code.setAttribute("autocapitalize", "off");
        code.setAttribute("autocomplete", "off");
      });
    });
  }

  function prepareToggleBlocks(root, readOnly) {
    Array.prototype.slice.call(root.querySelectorAll(".toggle-block")).forEach(function (block) {
      var header = block.querySelector(".toggle-header");
      var arrow = block.querySelector(".toggle-arrow");
      var title = block.querySelector(".toggle-title");
      var content = block.querySelector(".toggle-content");
      var isOpen = block.getAttribute("data-open") !== "false";

      block.setAttribute("data-open", isOpen ? "true" : "false");

      if (header) {
        header.setAttribute("contenteditable", "false");
      }

      if (arrow) {
        arrow.type = "button";
        arrow.setAttribute("contenteditable", "false");
        arrow.setAttribute("aria-label", isOpen ? "Recolher" : "Expandir");
        arrow.textContent = isOpen ? "▾" : "▸";
      }

      if (title) {
        title.setAttribute("contenteditable", readOnly ? "false" : "true");
      }

      if (content) {
        content.setAttribute("contenteditable", readOnly ? "false" : "true");
      }
    });
  }

  function handleToggleBlockClick(event, itemId, root, readOnly) {
    var target = event.target;
    var block = target.closest ? target.closest(".toggle-block") : null;
    var arrow = target.closest ? target.closest(".toggle-arrow") : null;
    var header = target.closest ? target.closest(".toggle-header") : null;
    var title = target.closest ? target.closest(".toggle-title") : null;

    if (!block || !root.contains(block)) {
      return false;
    }

    if (!arrow && !header) {
      return false;
    }

    if (!readOnly && title && !arrow) {
      return false;
    }

    event.preventDefault();
    toggleCollapsibleBlock(block, itemId, root);
    return true;
  }

  function toggleCollapsibleBlock(block, itemId, root) {
    var isOpen = block.getAttribute("data-open") !== "false";
    var editor = root && root.id === "documentContent" ? root : null;

    block.setAttribute("data-open", isOpen ? "false" : "true");
    prepareToggleBlocks(block.parentElement || root, !editor);

    if (itemId && editor) {
      updateDocumentContent(itemId, getEditorHtml(editor));
    }
  }

  function prepareKanbanBlocks(root, readOnly) {
    Array.prototype.slice.call(root.querySelectorAll(".kanban-block")).forEach(function (block) {
      block.setAttribute("contenteditable", "false");
      block.classList.toggle("readonly", !!readOnly);

      if (!block.getAttribute("data-kanban-id")) {
        block.setAttribute("data-kanban-id", createId("kanban"));
      }

      ensureKanbanBlockControls(block);

      Array.prototype.slice.call(block.querySelectorAll("button")).forEach(function (button) {
        button.type = "button";
        button.setAttribute("contenteditable", "false");
        button.hidden = !!readOnly;
      });

      Array.prototype.slice.call(block.querySelectorAll(".kanban-column")).forEach(function (column) {
        if (!column.getAttribute("data-column-id")) {
          column.setAttribute("data-column-id", createId("column"));
        }
      });

      Array.prototype.slice.call(block.querySelectorAll(".kanban-column-title")).forEach(function (input) {
        input.readOnly = !!readOnly;
        input.setAttribute("value", input.value || "");
      });

      Array.prototype.slice.call(block.querySelectorAll(".kanban-card")).forEach(function (card) {
        normalizeKanbanCardStructure(card);
        card.setAttribute("contenteditable", "false");
        card.draggable = !readOnly;

        if (!card.getAttribute("data-card-id")) {
          card.setAttribute("data-card-id", createId("card"));
        }
      });

      updateKanbanChecklistCounters(block);
    });
  }

  function ensureKanbanBlockControls(block) {
    var header = block.querySelector(".kanban-header");
    var addColumn = block.querySelector(".kanban-add-column");
    var remove;

    if (!header || block.querySelector(".kanban-delete-block")) {
      return;
    }

    remove = document.createElement("button");
    remove.type = "button";
    remove.className = "kanban-delete-block";
    remove.textContent = "Remover";
    remove.setAttribute("contenteditable", "false");
    header.insertBefore(remove, addColumn ? addColumn.nextSibling : null);
  }

  function normalizeKanbanCardStructure(card) {
    var oldText = card.querySelector(".kanban-card-text");
    var title = card.querySelector(".kanban-card-title");
    var meta = card.querySelector(".kanban-card-meta");
    var count = card.querySelector(".kanban-checklist-count");
    var data = card.querySelector(".kanban-card-data");
    var remove = card.querySelector(".kanban-delete-card");

    if (!title) {
      title = document.createElement("div");
      title.className = "kanban-card-title";
      title.textContent = oldText ? oldText.textContent : (card.textContent || "Novo cartão").replace("×", "").trim();
      card.insertBefore(title, card.firstChild);
    }

    title.removeAttribute("contenteditable");

    if (oldText) {
      oldText.remove();
    }

    if (!meta) {
      meta = document.createElement("div");
      meta.className = "kanban-card-meta";
      title.insertAdjacentElement("afterend", meta);
    }

    if (!count) {
      count = document.createElement("span");
      count.className = "kanban-checklist-count";
      meta.appendChild(count);
    }

    if (!remove) {
      remove = document.createElement("button");
      remove.type = "button";
      remove.className = "kanban-delete-card";
      remove.setAttribute("aria-label", "Excluir cartão");
      remove.textContent = "×";
      card.appendChild(remove);
    }

    remove.type = "button";
    remove.setAttribute("contenteditable", "false");

    if (!data) {
      data = document.createElement("div");
      data.className = "kanban-card-data";
      data.hidden = true;
      card.appendChild(data);
    }

    data.hidden = true;
    data.setAttribute("contenteditable", "false");

    Array.prototype.slice.call(data.querySelectorAll(".kanban-checklist-item")).forEach(function (item) {
      if (!item.getAttribute("data-check-id")) {
        item.setAttribute("data-check-id", createId("check"));
      }
      item.setAttribute("data-checked", item.getAttribute("data-checked") === "true" ? "true" : "false");
    });
  }

  function updateKanbanChecklistCounters(root) {
    var cards = root.classList && root.classList.contains("kanban-card") ? [root] : [];

    cards = cards.concat(Array.prototype.slice.call(root.querySelectorAll(".kanban-card")));

    cards.forEach(function (card) {
      var count = card.querySelector(".kanban-checklist-count");
      var items = Array.prototype.slice.call(card.querySelectorAll(".kanban-card-data .kanban-checklist-item"));
      var checked = items.filter(function (item) {
        return item.getAttribute("data-checked") === "true";
      }).length;

      if (!count) {
        return;
      }

      count.textContent = items.length ? "✓ " + checked + "/" + items.length : "";
      count.hidden = items.length === 0;
    });
  }

  function prepareSpreadsheetBlocks(root, readOnly) {
    Array.prototype.slice.call(root.querySelectorAll(".spreadsheet-block")).forEach(function (block) {
      var toolbar = block.querySelector(".spreadsheet-toolbar");

      block.setAttribute("contenteditable", "false");
      block.classList.toggle("readonly", !!readOnly);

      if (!block.getAttribute("data-sheet-id")) {
        block.setAttribute("data-sheet-id", createId("sheet"));
      }

      if (toolbar) {
        toolbar.setAttribute("contenteditable", "false");
        ensureSpreadsheetToolbarControls(toolbar);
        toolbar.hidden = !!readOnly;
      }

      Array.prototype.slice.call(block.querySelectorAll("button")).forEach(function (button) {
        button.type = "button";
        button.setAttribute("contenteditable", "false");
        button.hidden = !!readOnly;
      });

      Array.prototype.slice.call(block.querySelectorAll(".spreadsheet-table")).forEach(function (table) {
        normalizeSpreadsheetTable(table, readOnly);
      });
    });
  }

  function normalizeSpreadsheetTable(table, readOnly) {
    Array.prototype.slice.call(table.rows).forEach(function (row, rowIndex) {
      Array.prototype.slice.call(row.cells).forEach(function (cell, colIndex) {
        cell.setAttribute("data-row", String(rowIndex));
        cell.setAttribute("data-col", String(colIndex));
        cell.setAttribute("contenteditable", readOnly ? "false" : "true");
        if (readOnly) {
          cell.classList.remove("selected-cell");
        }
      });
    });
  }

  function ensureSpreadsheetToolbarControls(toolbar) {
    var colorButton = toolbar.querySelector(".sheet-color-cell");
    var title = toolbar.querySelector(".spreadsheet-title");
    var controls = [
      { className: "sheet-align-left", text: "Esq", title: "Alinhar à esquerda", align: "left" },
      { className: "sheet-align-center", text: "Centro", title: "Centralizar", align: "center" },
      { className: "sheet-align-right", text: "Dir", title: "Alinhar à direita", align: "right" }
    ];
    var remove;

    if (!toolbar.querySelector(".sheet-delete-block")) {
      remove = document.createElement("button");
      remove.type = "button";
      remove.className = "sheet-delete-block";
      remove.textContent = "Remover planilha";
      remove.setAttribute("contenteditable", "false");
      toolbar.insertBefore(remove, title ? title.nextSibling : toolbar.firstChild);
    }

    controls.forEach(function (control) {
      var button;

      if (toolbar.querySelector("." + control.className)) {
        return;
      }

      button = document.createElement("button");
      button.type = "button";
      button.className = control.className;
      button.textContent = control.text;
      button.title = control.title;
      button.setAttribute("contenteditable", "false");
      button.setAttribute("data-align", control.align);
      toolbar.insertBefore(button, colorButton || null);
    });
  }

  function handleSpreadsheetClick(event, itemId, editor) {
    var target = event.target;
    var block = target.closest ? target.closest(".spreadsheet-block") : null;
    var cell = target.closest ? target.closest(".spreadsheet-table th, .spreadsheet-table td") : null;
    var addRow = target.closest ? target.closest(".sheet-add-row") : null;
    var addColumn = target.closest ? target.closest(".sheet-add-column") : null;
    var deleteRow = target.closest ? target.closest(".sheet-delete-row") : null;
    var deleteColumn = target.closest ? target.closest(".sheet-delete-column") : null;
    var colorCell = target.closest ? target.closest(".sheet-color-cell") : null;
    var clearColor = target.closest ? target.closest(".sheet-clear-color") : null;
    var deleteBlock = target.closest ? target.closest(".sheet-delete-block") : null;
    var alignLeft = target.closest ? target.closest(".sheet-align-left") : null;
    var alignCenter = target.closest ? target.closest(".sheet-align-center") : null;
    var alignRight = target.closest ? target.closest(".sheet-align-right") : null;

    if (!block || !editor.contains(block)) {
      return false;
    }

    if (deleteBlock) {
      event.preventDefault();
      removeEmbeddedContentBlock(block, "Remover esta planilha?", itemId, editor);
      return true;
    }

    if (cell && block.contains(cell)) {
      selectSpreadsheetCell(cell);
      return true;
    }

    if (addRow) {
      event.preventDefault();
      addSpreadsheetRow(block);
      updateDocumentContent(itemId, getEditorHtml(editor));
      return true;
    }

    if (addColumn) {
      event.preventDefault();
      addSpreadsheetColumn(block);
      updateDocumentContent(itemId, getEditorHtml(editor));
      return true;
    }

    if (deleteRow) {
      event.preventDefault();
      deleteSelectedSpreadsheetRow(block);
      updateDocumentContent(itemId, getEditorHtml(editor));
      return true;
    }

    if (deleteColumn) {
      event.preventDefault();
      deleteSelectedSpreadsheetColumn(block);
      updateDocumentContent(itemId, getEditorHtml(editor));
      return true;
    }

    if (colorCell) {
      event.preventDefault();
      openSpreadsheetColorMenu(colorCell, block, itemId, editor);
      return true;
    }

    if (alignLeft || alignCenter || alignRight) {
      event.preventDefault();
      alignSelectedSpreadsheetCell(block, alignLeft ? "left" : (alignCenter ? "center" : "right"));
      updateDocumentContent(itemId, getEditorHtml(editor));
      return true;
    }

    if (clearColor) {
      event.preventDefault();
      clearSpreadsheetCellColor(block);
      updateDocumentContent(itemId, getEditorHtml(editor));
      return true;
    }

    return true;
  }

  function handleSpreadsheetInput(event, itemId, editor) {
    var target = event.target;

    if (!isSpreadsheetCell(target)) {
      return false;
    }

    scheduleSave(itemId, editor);
    return true;
  }

  function handleSpreadsheetKeydown(event, itemId, editor) {
    var target = event.target;

    if (!isSpreadsheetCell(target) || event.key !== "Tab") {
      return false;
    }

    event.preventDefault();
    focusSiblingSpreadsheetCell(target, event.shiftKey ? -1 : 1);
    updateDocumentContent(itemId, getEditorHtml(editor));
    return true;
  }

  function isSpreadsheetCell(node) {
    return !!(node && node.matches && node.matches(".spreadsheet-table th, .spreadsheet-table td"));
  }

  function selectSpreadsheetCell(cell) {
    Array.prototype.slice.call(document.querySelectorAll(".spreadsheet-table .selected-cell")).forEach(function (selected) {
      selected.classList.remove("selected-cell");
    });

    selectedSpreadsheetCell = cell;
    cell.classList.add("selected-cell");
  }

  function getSelectedSpreadsheetCell(block) {
    if (selectedSpreadsheetCell && block.contains(selectedSpreadsheetCell)) {
      return selectedSpreadsheetCell;
    }

    return block.querySelector(".spreadsheet-table .selected-cell");
  }

  function addSpreadsheetRow(block) {
    var table = block.querySelector(".spreadsheet-table");
    var selected = getSelectedSpreadsheetCell(block);
    var rows = table ? Array.prototype.slice.call(table.rows) : [];
    var columnCount = rows[0] ? rows[0].cells.length : 3;
    var insertIndex = selected ? selected.parentElement.rowIndex + 1 : rows.length;
    var row;
    var col;
    var cell;

    if (!table) {
      return;
    }

    row = table.insertRow(insertIndex);

    for (col = 0; col < columnCount; col += 1) {
      cell = row.insertCell(col);
      cell.setAttribute("contenteditable", "true");
    }

    normalizeSpreadsheetTable(table, false);
  }

  function addSpreadsheetColumn(block) {
    var table = block.querySelector(".spreadsheet-table");
    var selected = getSelectedSpreadsheetCell(block);
    var rows = table ? Array.prototype.slice.call(table.rows) : [];
    var insertIndex = selected ? selected.cellIndex + 1 : (rows[0] ? rows[0].cells.length : 0);

    if (!table || rows.length === 0) {
      return;
    }

    rows.forEach(function (row, rowIndex) {
      var cell = document.createElement(rowIndex === 0 ? "th" : "td");
      cell.setAttribute("contenteditable", "true");
      cell.textContent = rowIndex === 0 ? "Nova coluna" : "";
      row.insertBefore(cell, row.cells[insertIndex] || null);
    });

    normalizeSpreadsheetTable(table, false);
  }

  function deleteSelectedSpreadsheetRow(block) {
    var table = block.querySelector(".spreadsheet-table");
    var selected = getSelectedSpreadsheetCell(block);
    var rowIndex;

    if (!selected || !table) {
      alert("Selecione uma célula da linha que deseja remover.");
      return;
    }

    rowIndex = selected.parentElement.rowIndex;

    if (rowIndex === 0) {
      alert("A linha de cabeçalho não pode ser removida.");
      return;
    }

    if (table.rows.length <= 1) {
      alert("A planilha precisa ter pelo menos uma linha.");
      return;
    }

    table.deleteRow(rowIndex);
    selectedSpreadsheetCell = null;
    normalizeSpreadsheetTable(table, false);
  }

  function deleteSelectedSpreadsheetColumn(block) {
    var table = block.querySelector(".spreadsheet-table");
    var selected = getSelectedSpreadsheetCell(block);
    var colIndex;

    if (!selected || !table) {
      alert("Selecione uma célula da coluna que deseja remover.");
      return;
    }

    colIndex = selected.cellIndex;

    if (!table.rows[0] || table.rows[0].cells.length <= 1) {
      alert("A planilha precisa ter pelo menos uma coluna.");
      return;
    }

    Array.prototype.slice.call(table.rows).forEach(function (row) {
      if (row.cells[colIndex]) {
        row.deleteCell(colIndex);
      }
    });

    selectedSpreadsheetCell = null;
    normalizeSpreadsheetTable(table, false);
  }

  function openSpreadsheetColorMenu(anchor, block, itemId, editor) {
    var cell = getSelectedSpreadsheetCell(block);
    var menu = document.createElement("div");
    var rect;

    if (!cell) {
      alert("Selecione uma célula para colorir.");
      return;
    }

    closeSpreadsheetColorMenu();
    menu.id = "sheetColorMenu";
    menu.className = "sheet-color-menu";
    rect = anchor.getBoundingClientRect();
    menu.style.left = rect.left + "px";
    menu.style.top = rect.bottom + 6 + "px";

    SPREADSHEET_COLOR_OPTIONS.forEach(function (color) {
      var option = document.createElement("button");
      option.type = "button";
      option.className = "sheet-color-option";
      option.style.backgroundColor = color;
      option.setAttribute("aria-label", "Aplicar cor " + color);
      option.addEventListener("click", function () {
        cell.style.backgroundColor = color;
        closeSpreadsheetColorMenu();
        updateDocumentContent(itemId, getEditorHtml(editor));
      });
      menu.appendChild(option);
    });

    document.body.appendChild(menu);
    spreadsheetColorMenu = {
      menu: menu,
      anchor: anchor
    };
  }

  function closeSpreadsheetColorMenu() {
    if (spreadsheetColorMenu && spreadsheetColorMenu.menu) {
      spreadsheetColorMenu.menu.remove();
    }

    spreadsheetColorMenu = null;
  }

  function clearSpreadsheetCellColor(block) {
    var cell = getSelectedSpreadsheetCell(block);

    if (!cell) {
      alert("Selecione uma célula para limpar a cor.");
      return;
    }

    cell.style.removeProperty("background-color");
  }

  function alignSelectedSpreadsheetCell(block, alignment) {
    var cell = getSelectedSpreadsheetCell(block);

    if (!cell) {
      alert("Selecione uma célula para alinhar.");
      return;
    }

    if (alignment === "left") {
      cell.style.removeProperty("text-align");
      return;
    }

    cell.style.textAlign = alignment;
  }

  function focusSiblingSpreadsheetCell(cell, direction) {
    var table = cell.closest(".spreadsheet-table");
    var cells = table ? Array.prototype.slice.call(table.querySelectorAll("th, td")) : [];
    var index = cells.indexOf(cell);
    var next = cells[index + direction];

    if (!next) {
      return;
    }

    selectSpreadsheetCell(next);
    next.focus();
  }

  function removeEmbeddedContentBlock(block, message, itemId, editor) {
    var next = block.nextElementSibling;

    if (!confirm(message)) {
      return;
    }

    block.remove();
    closeSpreadsheetColorMenu();

    if (next && isEmptyEditorParagraph(next)) {
      next.remove();
    }

    selectedSpreadsheetCell = null;
    updateDocumentContent(itemId, getEditorHtml(editor));
  }

  function isEmptyEditorParagraph(node) {
    return !!(node && node.tagName === "P" && (!node.textContent || !node.textContent.trim()) && node.querySelectorAll("img, table, .kanban-block, .spreadsheet-block").length === 0);
  }

  function handleKanbanClick(event, itemId, editor) {
    var target = event.target;
    var block = target.closest ? target.closest(".kanban-block") : null;
    var deleteBlock = target.closest ? target.closest(".kanban-delete-block") : null;
    var addColumn = target.closest ? target.closest(".kanban-add-column") : null;
    var deleteColumn = target.closest ? target.closest(".kanban-delete-column") : null;
    var addCard = target.closest ? target.closest(".kanban-add-card") : null;
    var deleteCard = target.closest ? target.closest(".kanban-delete-card") : null;
    var column;
    var cards;
    var card;
    var title;
    var board;

    if (!block || !editor.contains(block)) {
      return false;
    }

    if (deleteBlock) {
      event.preventDefault();
      if (activeKanbanModal && block.contains(activeKanbanModal.card)) {
        closeKanbanCardModal();
      }
      removeEmbeddedContentBlock(block, "Remover este Kanban?", itemId, editor);
      return true;
    }

    if (addColumn) {
      event.preventDefault();
      board = block.querySelector(".kanban-board");

      if (!board) {
        return true;
      }

      column = createKanbanColumnElement("Nova coluna");
      board.appendChild(column);
      prepareKanbanBlocks(block, false);
      title = column.querySelector(".kanban-column-title");

      if (title) {
        title.focus();
        title.select();
      }

      updateDocumentContent(itemId, getEditorHtml(editor));
      return true;
    }

    if (deleteColumn) {
      event.preventDefault();
      column = deleteColumn.closest(".kanban-column");

      if (!column) {
        return true;
      }

      if (block.querySelectorAll(".kanban-column").length <= 1) {
        alert("O Kanban precisa ter pelo menos uma coluna.");
        return true;
      }

      if (!confirm("Excluir esta coluna e todos os cartões dentro dela?")) {
        return true;
      }

      column.remove();
      updateDocumentContent(itemId, getEditorHtml(editor));
      return true;
    }

    if (addCard) {
      event.preventDefault();
      column = addCard.closest(".kanban-column");
      cards = column ? column.querySelector(".kanban-cards") : null;

      if (!cards) {
        return true;
      }

      card = createKanbanCardElement("Novo cartão");
      cards.appendChild(card);
      prepareKanbanBlocks(block, false);
      updateDocumentContent(itemId, getEditorHtml(editor));
      openKanbanCardModal(card, {
        editor: editor,
        itemId: itemId,
        readOnly: false
      });
      return true;
    }

    if (deleteCard) {
      event.preventDefault();
      card = deleteCard.closest(".kanban-card");

      if (card) {
        if (activeKanbanModal && activeKanbanModal.card === card) {
          closeKanbanCardModal();
        }

        card.remove();
        updateDocumentContent(itemId, getEditorHtml(editor));
      }

      return true;
    }

    card = target.closest ? target.closest(".kanban-card") : null;
    if (card && block.contains(card)) {
      if (kanbanDragJustEnded) {
        return true;
      }

      event.preventDefault();
      openKanbanCardModal(card, {
        editor: editor,
        itemId: itemId,
        readOnly: false
      });
      return true;
    }

    return false;
  }

  function handleKanbanInput(event, itemId, editor) {
    var target = event.target;

    if (!target.closest || !target.closest(".kanban-block")) {
      return false;
    }

    if (target.classList.contains("kanban-column-title")) {
      target.setAttribute("value", target.value || "");
    }

    scheduleSave(itemId, editor);
    return true;
  }

  function openKanbanCardModal(card, options) {
    options = options || {};
    closeKanbanCardModal(false);
    normalizeKanbanCardStructure(card);
    updateKanbanChecklistCounters(card);

    activeKanbanModal = {
      card: card,
      editor: options.editor || null,
      itemId: options.itemId || null,
      readOnly: !!options.readOnly,
      element: null
    };

    renderKanbanCardModal();
  }

  function closeKanbanCardModal(shouldSave) {
    if (!activeKanbanModal) {
      return;
    }

    if (shouldSave !== false) {
      saveActiveKanbanCard();
    }

    if (activeKanbanModal.element) {
      activeKanbanModal.element.remove();
    }

    activeKanbanModal = null;
  }

  function renderKanbanCardModal() {
    var modalState = activeKanbanModal;
    var card = modalState.card;
    var readOnly = modalState.readOnly;
    var backdrop = document.createElement("div");
    var modal = document.createElement("div");
    var header = document.createElement("div");
    var title = document.createElement("input");
    var close = document.createElement("button");
    var section = document.createElement("div");
    var sectionTitle = document.createElement("h3");
    var checklist = document.createElement("div");
    var add = document.createElement("button");

    backdrop.className = "kanban-modal-backdrop";
    modal.className = "kanban-card-modal";
    header.className = "kanban-modal-header";
    title.className = "kanban-modal-title";
    title.value = getKanbanCardTitle(card);
    title.readOnly = readOnly;
    title.setAttribute("aria-label", "Título do cartão");
    close.type = "button";
    close.className = "kanban-modal-close";
    close.setAttribute("aria-label", "Fechar");
    close.textContent = "×";

    section.className = "kanban-modal-section";
    sectionTitle.textContent = "Checklist";
    checklist.className = "kanban-modal-checklist";
    add.type = "button";
    add.className = "kanban-modal-add-check";
    add.textContent = "+ Item";
    add.hidden = readOnly;

    header.appendChild(title);
    header.appendChild(close);
    section.appendChild(sectionTitle);
    renderKanbanChecklistRows(checklist, card, readOnly);
    section.appendChild(checklist);
    section.appendChild(add);
    modal.appendChild(header);
    modal.appendChild(section);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    activeKanbanModal.element = backdrop;

    backdrop.addEventListener("mousedown", function (event) {
      if (event.target === backdrop) {
        closeKanbanCardModal();
      }
    });

    close.addEventListener("click", function () {
      closeKanbanCardModal();
    });

    title.addEventListener("input", function () {
      if (readOnly) {
        return;
      }

      setKanbanCardTitle(card, title.value);
      saveActiveKanbanCard();
    });

    add.addEventListener("click", function () {
      var item;
      var row;
      var textInput;

      if (readOnly) {
        return;
      }

      item = createKanbanChecklistItemElement("Novo item", false);
      getKanbanCardData(card).appendChild(item);
      row = createKanbanChecklistRow(item, false);
      checklist.appendChild(row);
      textInput = row.querySelector(".kanban-check-text");
      if (textInput) {
        textInput.focus();
        textInput.select();
      }
      saveActiveKanbanCard();
    });

    checklist.addEventListener("change", function (event) {
      var checkbox = event.target.closest ? event.target.closest(".kanban-check-input") : null;
      var row;
      var item;

      if (readOnly || !checkbox) {
        return;
      }

      row = checkbox.closest(".kanban-check-row");
      item = getKanbanChecklistItemById(card, row.getAttribute("data-check-id"));
      if (!item) {
        return;
      }

      item.setAttribute("data-checked", checkbox.checked ? "true" : "false");
      row.classList.toggle("checked", checkbox.checked);
      saveActiveKanbanCard();
    });

    checklist.addEventListener("input", function (event) {
      var input = event.target.closest ? event.target.closest(".kanban-check-text") : null;
      var row;
      var item;

      if (readOnly || !input) {
        return;
      }

      row = input.closest(".kanban-check-row");
      item = getKanbanChecklistItemById(card, row.getAttribute("data-check-id"));
      if (!item) {
        return;
      }

      item.textContent = input.value;
      saveActiveKanbanCard();
    });

    checklist.addEventListener("click", function (event) {
      var button = event.target.closest ? event.target.closest(".kanban-check-delete") : null;
      var row;
      var item;

      if (readOnly || !button) {
        return;
      }

      event.preventDefault();
      row = button.closest(".kanban-check-row");
      item = getKanbanChecklistItemById(card, row.getAttribute("data-check-id"));
      if (item) {
        item.remove();
      }
      row.remove();
      saveActiveKanbanCard();
    });

    title.focus();
    if (!readOnly) {
      title.select();
    }
  }

  function renderKanbanChecklistRows(container, card, readOnly) {
    container.innerHTML = "";
    Array.prototype.slice.call(getKanbanCardData(card).querySelectorAll(".kanban-checklist-item")).forEach(function (item) {
      container.appendChild(createKanbanChecklistRow(item, readOnly));
    });
  }

  function createKanbanChecklistRow(item, readOnly) {
    var row = document.createElement("div");
    var checkbox = document.createElement("input");
    var text = document.createElement("input");
    var remove = document.createElement("button");
    var checked = item.getAttribute("data-checked") === "true";

    row.className = "kanban-check-row" + (checked ? " checked" : "");
    row.setAttribute("data-check-id", item.getAttribute("data-check-id"));

    checkbox.type = "checkbox";
    checkbox.className = "kanban-check-input";
    checkbox.checked = checked;
    checkbox.disabled = readOnly;

    text.type = "text";
    text.className = "kanban-check-text";
    text.value = item.textContent || "";
    text.readOnly = readOnly;

    remove.type = "button";
    remove.className = "kanban-check-delete";
    remove.setAttribute("aria-label", "Remover item");
    remove.textContent = "×";
    remove.hidden = readOnly;

    row.appendChild(checkbox);
    row.appendChild(text);
    row.appendChild(remove);
    return row;
  }

  function createKanbanChecklistItemElement(text, checked) {
    var item = document.createElement("div");

    item.className = "kanban-checklist-item";
    item.setAttribute("data-check-id", createId("check"));
    item.setAttribute("data-checked", checked ? "true" : "false");
    item.textContent = text || "Novo item";
    return item;
  }

  function getKanbanCardData(card) {
    var data = card.querySelector(".kanban-card-data");

    if (!data) {
      data = document.createElement("div");
      data.className = "kanban-card-data";
      data.hidden = true;
      data.setAttribute("contenteditable", "false");
      card.appendChild(data);
    }

    return data;
  }

  function getKanbanChecklistItemById(card, checkId) {
    return Array.prototype.slice.call(getKanbanCardData(card).querySelectorAll(".kanban-checklist-item")).find(function (item) {
      return item.getAttribute("data-check-id") === checkId;
    }) || null;
  }

  function getKanbanCardTitle(card) {
    var title = card.querySelector(".kanban-card-title");
    return title ? title.textContent : "Novo cartão";
  }

  function setKanbanCardTitle(card, value) {
    var title = card.querySelector(".kanban-card-title");

    if (title) {
      title.textContent = value || "Novo cartão";
    }
  }

  function saveActiveKanbanCard() {
    if (!activeKanbanModal || activeKanbanModal.readOnly) {
      return;
    }

    updateKanbanChecklistCounters(activeKanbanModal.card.closest(".kanban-block") || activeKanbanModal.card);

    if (activeKanbanModal.editor && activeKanbanModal.itemId) {
      updateDocumentContent(activeKanbanModal.itemId, getEditorHtml(activeKanbanModal.editor));
    }
  }

  function handleReadOnlyKanbanClick(event, root) {
    var card = event.target.closest ? event.target.closest(".kanban-card") : null;

    if (!card || !root.contains(card)) {
      return false;
    }

    event.preventDefault();
    openKanbanCardModal(card, {
      readOnly: true
    });
    return true;
  }

  function handleKanbanDragStart(event, editor) {
    var card = event.target.closest ? event.target.closest(".kanban-card") : null;

    if (!card || !editor.contains(card) || card.closest(".kanban-block.readonly")) {
      return;
    }

    draggedKanbanCard = card;
    kanbanDragJustEnded = false;
    card.classList.add("dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.getAttribute("data-card-id") || "");
    }
  }

  function handleKanbanDragOver(event, editor) {
    var cards = getKanbanDropCards(event.target, editor);

    if (!draggedKanbanCard || !cards) {
      return;
    }

    event.preventDefault();
    moveKanbanCardToPointer(cards, event.clientY);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleKanbanDrop(event, itemId, editor) {
    var cards = getKanbanDropCards(event.target, editor);

    if (!draggedKanbanCard || !cards) {
      return;
    }

    event.preventDefault();
    moveKanbanCardToPointer(cards, event.clientY);
    draggedKanbanCard.classList.remove("dragging");
    draggedKanbanCard = null;
    updateDocumentContent(itemId, getEditorHtml(editor));
  }

  function getKanbanDropCards(target, editor) {
    var cards = target.closest ? target.closest(".kanban-cards") : null;
    var column;

    if (!cards && target.closest) {
      column = target.closest(".kanban-column");
      cards = column ? column.querySelector(".kanban-cards") : null;
    }

    return cards && editor.contains(cards) ? cards : null;
  }

  function handleKanbanDragEnd() {
    if (draggedKanbanCard) {
      draggedKanbanCard.classList.remove("dragging");
    }

    draggedKanbanCard = null;
    kanbanDragJustEnded = true;
    window.setTimeout(function () {
      kanbanDragJustEnded = false;
    }, 80);
  }

  function moveKanbanCardToPointer(cards, clientY) {
    var afterCard = getKanbanCardAfter(cards, clientY);

    if (!draggedKanbanCard) {
      return;
    }

    if (afterCard) {
      cards.insertBefore(draggedKanbanCard, afterCard);
      return;
    }

    cards.appendChild(draggedKanbanCard);
  }

  function getKanbanCardAfter(cards, clientY) {
    var candidates = Array.prototype.slice.call(cards.querySelectorAll(".kanban-card:not(.dragging)"));
    var closest = {
      offset: Number.NEGATIVE_INFINITY,
      element: null
    };

    candidates.forEach(function (card) {
      var rect = card.getBoundingClientRect();
      var offset = clientY - rect.top - rect.height / 2;

      if (offset < 0 && offset > closest.offset) {
        closest = {
          offset: offset,
          element: card
        };
      }
    });

    return closest.element;
  }

  function handleEditorPaste(event, itemId, editor) {
    var clipboard = event.clipboardData;
    var markerId;

    if (!clipboard) {
      return;
    }

    var hasImageFile = Array.prototype.slice.call(clipboard.items || []).some(function (item) {
      return item.kind === "file" && /^image\//i.test(item.type);
    });
    var text = clipboard.getData("text/plain");

    event.preventDefault();

    if (!text && hasImageFile) {
      alert("Cole o link da imagem hospedada ou use o botão Imagem com uma URL externa.");
      return;
    }

    if (!text) {
      return;
    }

    editor.focus();

    if (event.target.closest && event.target.closest(".code-block")) {
      markerId = insertPlainTextAtCursor(text, editor);
      normalizeCodeBlocks(editor);
    } else {
      markerId = insertHtmlAtCursor(plainTextToPasteHtml(text), editor);
      normalizeEditorContent(editor);
    }

    restoreCaretAtMarker(editor, markerId);
    updateDocumentContent(itemId, getEditorHtml(editor));
  }

  function plainTextToHtml(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  function plainTextToPasteHtml(text) {
    var html = "";
    var lastIndex = 0;
    var match;

    URL_PATTERN.lastIndex = 0;
    match = URL_PATTERN.exec(text);

    while (match) {
      var rawUrl = match[0];
      var cleaned = splitTrailingPunctuation(rawUrl);

      html += plainTextToHtml(text.slice(lastIndex, match.index));
      html += createLinkHtml(cleaned.url, cleaned.url);
      html += plainTextToHtml(cleaned.trailing);

      lastIndex = match.index + rawUrl.length;
      match = URL_PATTERN.exec(text);
    }

    html += plainTextToHtml(text.slice(lastIndex));
    return html;
  }

  function insertHtmlAtCursorAndMoveCaret(html, editor) {
    var markerId = insertHtmlAtCursor(html, editor);
    restoreCaretAtMarker(editor, markerId);
    return markerId;
  }

  function insertHtmlAtCursor(html, editor) {
    var markerId = createId("caret");
    var selection = window.getSelection();
    var range;
    var temp;
    var fragment;

    if (!selection || selection.rangeCount === 0) {
      editor.focus();
      selection = window.getSelection();
    }

    if (!selection || selection.rangeCount === 0) {
      return markerId;
    }

    range = selection.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }

    range.deleteContents();
    temp = document.createElement("div");
    temp.innerHTML = html;
    temp.appendChild(createCaretMarker(markerId));
    fragment = document.createDocumentFragment();

    while (temp.firstChild) {
      fragment.appendChild(temp.firstChild);
    }

    range.insertNode(fragment);
    return markerId;
  }

  function insertPlainTextAtCursor(text, editor) {
    var markerId = createId("caret");
    var selection = window.getSelection();
    var range;
    var fragment;

    if (!selection || selection.rangeCount === 0) {
      return markerId;
    }

    range = selection.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) {
      return markerId;
    }

    range.deleteContents();
    fragment = document.createDocumentFragment();
    fragment.appendChild(document.createTextNode(text));
    fragment.appendChild(createCaretMarker(markerId));
    range.insertNode(fragment);
    return markerId;
  }

  function createCaretMarker(markerId) {
    var marker = document.createElement("span");
    marker.setAttribute("data-caret-marker", markerId);
    marker.style.display = "inline-block";
    marker.style.width = "0";
    marker.style.overflow = "hidden";
    marker.textContent = "";
    return marker;
  }

  function restoreCaretAtMarker(root, markerId) {
    var marker = markerId ? root.querySelector('[data-caret-marker="' + markerId + '"]') : null;
    var selection;
    var range;

    if (!marker) {
      return;
    }

    selection = window.getSelection();
    range = document.createRange();
    range.setStartBefore(marker);
    range.collapse(true);
    marker.remove();

    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function prepareEditorMedia(root) {
    Array.prototype.slice.call(root.querySelectorAll("img")).forEach(function (image) {
      var src = image.getAttribute("src") || "";

      if (/^data:/i.test(src)) {
        image.closest(".image-block") ? image.closest(".image-block").remove() : image.remove();
        return;
      }

      if (!image.closest(".image-block")) {
        var block = document.createElement("div");
        block.className = "image-block";
        image.replaceWith(block);
        block.appendChild(image);
      }
    });

    Array.prototype.slice.call(root.querySelectorAll(".image-block")).forEach(function (block) {
      block.setAttribute("contenteditable", "false");
      block.setAttribute("draggable", "true");

      if (!block.querySelector(".image-remove")) {
        var remove = document.createElement("button");
        remove.className = "image-remove";
        remove.type = "button";
        remove.setAttribute("aria-label", "Voltar para link");
        remove.textContent = "×";
        block.appendChild(remove);
      }

      if (!block.querySelector(".resize-handle")) {
        var handle = document.createElement("span");
        handle.className = "resize-handle";
        block.appendChild(handle);
      }
    });
  }

  function selectImageBlock(block) {
    if (selectedImageBlock && selectedImageBlock !== block) {
      selectedImageBlock.classList.remove("selected");
    }

    selectedImageBlock = block;

    if (selectedImageBlock) {
      selectedImageBlock.classList.add("selected");
    }
  }

  function clearImageSelection() {
    if (selectedImageBlock) {
      selectedImageBlock.classList.remove("selected");
      selectedImageBlock = null;
    }
  }

  function removeImageBlock(block, itemId, editor) {
    if (!block) {
      return;
    }

    var image = block.querySelector("img");
    var url = image ? image.getAttribute("src") : "";
    var paragraph = document.createElement("p");

    if (url) {
      paragraph.appendChild(createLinkNode(url, url));
    } else {
      paragraph.innerHTML = "<br>";
    }

    block.replaceWith(paragraph);
    clearImageSelection();
    ensureLinksOpenInNewTab(editor);
    updateDocumentContent(itemId, getEditorHtml(editor));
  }

  function startImageResize(block, itemId, editor, event) {
    if (!block) {
      return;
    }

    selectImageBlock(block);
    resizeState = {
      block: block,
      itemId: itemId,
      editor: editor,
      startX: event.clientX,
      startWidth: block.getBoundingClientRect().width
    };

    document.addEventListener("mousemove", resizeImage);
    document.addEventListener("mouseup", stopImageResize);
  }

  function resizeImage(event) {
    if (!resizeState) {
      return;
    }

    var maxWidth = resizeState.editor.getBoundingClientRect().width;
    var nextWidth = resizeState.startWidth + event.clientX - resizeState.startX;
    nextWidth = Math.max(80, Math.min(maxWidth, nextWidth));
    resizeState.block.style.width = Math.round(nextWidth) + "px";
  }

  function stopImageResize() {
    if (!resizeState) {
      return;
    }

    updateDocumentContent(resizeState.itemId, getEditorHtml(resizeState.editor));
    resizeState = null;
    document.removeEventListener("mousemove", resizeImage);
    document.removeEventListener("mouseup", stopImageResize);
  }

  function moveDraggedImage(editor, clientY) {
    var target = getDropTargetBlock(editor, clientY);

    if (!draggedImageBlock) {
      return;
    }

    if (!target) {
      editor.appendChild(draggedImageBlock);
      return;
    }

    var rect = target.getBoundingClientRect();

    if (clientY < rect.top + rect.height / 2) {
      editor.insertBefore(draggedImageBlock, target);
    } else {
      editor.insertBefore(draggedImageBlock, target.nextSibling);
    }
  }

  function getDropTargetBlock(editor, clientY) {
    var blocks = Array.prototype.slice.call(editor.children).filter(function (child) {
      return child !== draggedImageBlock;
    });
    var closest = null;
    var closestDistance = Infinity;

    blocks.forEach(function (block) {
      var rect = block.getBoundingClientRect();
      var middle = rect.top + rect.height / 2;
      var distance = Math.abs(clientY - middle);

      if (distance < closestDistance) {
        closestDistance = distance;
        closest = block;
      }
    });

    return closest;
  }

  function getEditorHtml(editor) {
    updateKanbanChecklistCounters(editor);
    syncKanbanFormValues(editor);

    var clone = editor.cloneNode(true);
    updateKanbanChecklistCounters(clone);
    syncKanbanFormValues(clone);

    Array.prototype.slice.call(clone.querySelectorAll(".image-block.selected")).forEach(function (block) {
      block.classList.remove("selected");
    });

    Array.prototype.slice.call(clone.querySelectorAll("[data-caret-marker]")).forEach(function (marker) {
      marker.remove();
    });

    Array.prototype.slice.call(clone.querySelectorAll("[data-temp-toggle]")).forEach(function (block) {
      block.removeAttribute("data-temp-toggle");
    });

    Array.prototype.slice.call(clone.querySelectorAll("[data-temp-kanban]")).forEach(function (block) {
      block.removeAttribute("data-temp-kanban");
    });

    Array.prototype.slice.call(clone.querySelectorAll("[data-temp-sheet]")).forEach(function (block) {
      block.removeAttribute("data-temp-sheet");
    });

    Array.prototype.slice.call(clone.querySelectorAll(".spreadsheet-table .selected-cell")).forEach(function (cell) {
      cell.classList.remove("selected-cell");
    });

    Array.prototype.slice.call(clone.querySelectorAll(".kanban-card.dragging")).forEach(function (card) {
      card.classList.remove("dragging");
    });

    Array.prototype.slice.call(clone.querySelectorAll(".kanban-block.readonly")).forEach(function (block) {
      block.classList.remove("readonly");
    });

    Array.prototype.slice.call(clone.querySelectorAll(".spreadsheet-block.readonly")).forEach(function (block) {
      block.classList.remove("readonly");
    });

    Array.prototype.slice.call(clone.querySelectorAll("img")).forEach(function (image) {
      if (/^data:/i.test(image.getAttribute("src") || "")) {
        image.closest(".image-block") ? image.closest(".image-block").remove() : image.remove();
      }
    });

    return clone.innerHTML;
  }

  function syncKanbanFormValues(root) {
    Array.prototype.slice.call(root.querySelectorAll(".kanban-column-title")).forEach(function (input) {
      input.setAttribute("value", input.value || input.getAttribute("value") || "");
    });
  }

  function linkifyTextNodes(root) {
    replaceUrlTextNodes(root, function (url) {
      if (isImageUrl(url)) {
        return createImageBlockNode(url);
      }

      return createLinkNode(url, url);
    });
  }

  function unwrapWikilinks(root) {
    Array.prototype.slice.call(root.querySelectorAll(".internal-link")).forEach(function (node) {
      node.replaceWith(document.createTextNode(node.textContent));
    });
  }

  function wikilinkTextNodes(root, contextItem, publicOnly) {
    var currentItem = contextItem || getSelectedItem();
    var projectId = null;

    if (currentItem && currentItem.type === "project") {
      projectId = currentItem.id;
    } else if (currentItem) {
      projectId = getRootProjectId(currentItem.id);
    }

    replaceWikilinkTextNodes(root, function (fullText, title) {
      var target = findDocumentByTitleInProject(projectId, title);
      if (target && publicOnly && target.visibility !== "public") {
        target = null;
      }
      return createWikilinkNode(fullText, target);
    });
  }

  function replaceWikilinkTextNodes(root, factory) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;

        if (!parent || parent.closest("a") || parent.closest(".image-block") || parent.closest(".code-block") || parent.closest(".kanban-block") || parent.closest(".spreadsheet-block") || parent.closest("[data-caret-marker]") || parent.closest("script") || parent.closest("style")) {
          return NodeFilter.FILTER_REJECT;
        }

        WIKILINK_PATTERN.lastIndex = 0;
        return WIKILINK_PATTERN.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    var nodes = [];
    var current = walker.nextNode();

    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }

    nodes.forEach(function (node) {
      WIKILINK_PATTERN.lastIndex = 0;
      var fragment = document.createDocumentFragment();
      var text = node.nodeValue;
      var lastIndex = 0;
      var match = WIKILINK_PATTERN.exec(text);

      while (match) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        fragment.appendChild(factory(match[0], match[1]));
        lastIndex = match.index + match[0].length;
        match = WIKILINK_PATTERN.exec(text);
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      node.replaceWith(fragment);
    });
  }

  function replaceUrlTextNodes(root, factory) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;

        if (!parent || parent.closest("a") || parent.closest(".image-block") || parent.closest(".code-block") || parent.closest(".kanban-block") || parent.closest(".spreadsheet-block") || parent.closest("[data-caret-marker]") || parent.closest("script") || parent.closest("style")) {
          return NodeFilter.FILTER_REJECT;
        }

        URL_PATTERN.lastIndex = 0;
        return URL_PATTERN.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    var nodes = [];
    var current = walker.nextNode();

    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }

    nodes.forEach(function (node) {
      URL_PATTERN.lastIndex = 0;
      var fragment = document.createDocumentFragment();
      var text = node.nodeValue;
      var lastIndex = 0;
      var match = URL_PATTERN.exec(text);

      while (match) {
        var rawUrl = match[0];
        var cleaned = splitTrailingPunctuation(rawUrl);
        var start = match.index;

        if (start > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
        }

        fragment.appendChild(factory(cleaned.url));

        if (cleaned.trailing) {
          fragment.appendChild(document.createTextNode(cleaned.trailing));
        }

        lastIndex = start + rawUrl.length;
        match = URL_PATTERN.exec(text);
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      node.replaceWith(fragment);
    });
  }

  function ensureLinksOpenInNewTab(root) {
    Array.prototype.slice.call(root.querySelectorAll("a")).forEach(function (link) {
      if (link.classList.contains("internal-link")) {
        return;
      }

      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  }

  function openInternalLink(link) {
    var targetId = link.getAttribute("data-target-id");

    if (!targetId) {
      alert("Documento não encontrado neste projeto.");
      return;
    }

    var target = getItem(targetId);

    if (!target || target.type !== "document") {
      alert("Documento não encontrado neste projeto.");
      return;
    }

    expandParents(target.id);
    state.selectedItemId = target.id;
    saveState([], null);
    render();
  }

  function openGraphDocument(documentId) {
    var documentItem = getItem(documentId);

    if (!documentItem || documentItem.type !== "document") {
      return;
    }

    expandParents(documentItem.id);
    state.selectedItemId = documentItem.id;
    saveState([], null);
    render();
  }

  function scheduleSave(itemId, editor) {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      updateDocumentContent(itemId, getEditorHtml(editor));
    }, 300);
  }

  function scheduleNormalize(itemId, editor) {
    window.clearTimeout(normalizeTimer);
    normalizeTimer = window.setTimeout(function () {
      normalizeEditorContent();
      updateDocumentContent(itemId, getEditorHtml(editor));
    }, 1200);
  }

  function updateDocumentContent(id, content) {
    var item = getItem(id);

    if (!item || (item.type !== "document" && item.type !== "project") || !canEditItem(item)) {
      return;
    }

    DataStore.updateItem(id, {
      content: content
    });
  }

  function renderVisibilityBadge(item) {
    var badge = document.createElement("span");
    badge.className = "visibility-badge " + (item.visibility === "public" ? "is-public" : "is-private");
    badge.textContent = item.visibility === "public" ? "Público" : "Privado";
    return badge;
  }

  function getItemPath(itemId) {
    var path = [];
    var current = getItem(itemId);

    while (current) {
      path.unshift(current);
      current = getItem(current.parentId);
    }

    return path;
  }

  function renderBreadcrumb(itemId) {
    return getItemPath(itemId).map(function (item) {
      return item.title || getDefaultTitle(item.type);
    }).join(" / ");
  }

  function toggleVisibility(id) {
    var item = getItem(id);

    if (!item || (item.type !== "project" && item.type !== "document")) {
      return;
    }

    if (item.type === "project" && item.visibility !== "public") {
      makeProjectPublic(id);
    } else {
      DataStore.updateItem(id, {
        visibility: item.visibility === "public" ? "private" : "public"
      });
    }

    render();
  }

  function makeProjectPublic(projectId) {
    var now = nowIso();
    var project = getItem(projectId);
    var changedIds = [];

    if (project) {
      project.visibility = "public";
      project.updatedAt = now;
      changedIds.push(project.id);
    }

    getDocumentsInsideProject(projectId).forEach(function (documentItem) {
      documentItem.visibility = "public";
      documentItem.updatedAt = now;
      changedIds.push(documentItem.id);
    });

    saveState(changedIds, projectId);
  }

  function getPublicUrl(item) {
    var view = item.type === "project" ? "project" : "page";
    return window.location.origin + window.location.pathname + "?view=" + view + "&id=" + encodeURIComponent(item.id);
  }

  function copyPublicLink(item) {
    var url = getPublicUrl(item);
    var done = function () {
      state.ui.copyFeedbackId = item.id;
      render();
      window.setTimeout(function () {
        if (state.ui.copyFeedbackId === item.id) {
          state.ui.copyFeedbackId = null;
          render();
        }
      }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () {
        fallbackCopyText(url);
        done();
      });
      return;
    }

    fallbackCopyText(url);
    done();
  }

  function fallbackCopyText(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function updateStatus(text) {
    var status = document.getElementById("saveStatus");

    if (status) {
      status.textContent = text;
    }
  }

  function setSaveStatus(status) {
    var labels = {
      saving: "Salvando...",
      saved: "Salvo",
      local: "Salvo localmente",
      error: "Erro ao salvar"
    };

    state.ui.saveStatus = status;
    updateStatus(labels[status] || "Salvo");
  }

  function hasTextSelectionInside(editor) {
    var selection = window.getSelection();

    if (!selection || selection.rangeCount === 0 || selection.toString().length === 0) {
      return false;
    }

    var range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer);
  }

  function saveSelection(editor) {
    var selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    var range = selection.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) {
      return null;
    }

    return range.cloneRange();
  }

  function restoreSelection(range) {
    if (!range) {
      return;
    }

    var selection = window.getSelection();

    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function createLinkNode(url, label) {
    var link = document.createElement("a");
    link.href = normalizeUrl(url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    return link;
  }

  function createWikilinkNode(fullText, target) {
    if (target) {
      var link = document.createElement("a");
      link.href = "#";
      link.className = "internal-link";
      link.setAttribute("data-target-id", target.id);
      link.textContent = fullText;
      return link;
    }

    var missing = document.createElement("span");
    missing.className = "internal-link missing";
    missing.textContent = fullText;
    return missing;
  }

  function createLinkHtml(url, label) {
    var safeUrl = escapeHtml(normalizeUrl(url));
    return '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + "</a>";
  }

  function createImageBlockNode(url) {
    var wrapper = document.createElement("div");
    wrapper.innerHTML = createImageBlockHtml(url);
    return wrapper.firstChild;
  }

  function createImageBlockHtml(url, alignment) {
    var safeUrl = escapeHtml(normalizeUrl(url));
    return '<div class="image-block" contenteditable="false" draggable="true"' + getImageAlignmentStyle(alignment) + ">" +
      '<img src="' + safeUrl + '" alt="" loading="lazy">' +
      '<button class="image-remove" type="button" aria-label="Voltar para link">×</button>' +
      '<span class="resize-handle"></span>' +
      "</div><p><br></p>";
  }

  function isImageUrl(url) {
    return IMAGE_URL_PATTERN.test(url);
  }

  function isAlignmentCommand(command) {
    return command === "justifyLeft" || command === "justifyCenter" || command === "justifyRight" || command === "justifyFull";
  }

  function applyImageAlignment(block, command) {
    if (command === "justifyCenter") {
      block.style.marginLeft = "auto";
      block.style.marginRight = "auto";
      return;
    }

    if (command === "justifyRight") {
      block.style.marginLeft = "auto";
      block.style.marginRight = "0";
      return;
    }

    block.style.marginLeft = "0";
    block.style.marginRight = "0";
  }

  function getImageAlignmentStyle(alignment) {
    if (alignment === "center") {
      return ' style="margin-left: auto; margin-right: auto;"';
    }

    if (alignment === "right") {
      return ' style="margin-left: auto; margin-right: 0;"';
    }

    return "";
  }

  function getCurrentTextAlignment(editor) {
    var selection = window.getSelection();
    var node;
    var element;
    var align;

    if (!selection || selection.rangeCount === 0) {
      return "left";
    }

    node = selection.getRangeAt(0).commonAncestorContainer;

    if (!editor.contains(node)) {
      return "left";
    }

    element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

    while (element && element !== editor) {
      align = window.getComputedStyle(element).textAlign;

      if (align === "center" || align === "right") {
        return align;
      }

      if (align === "justify") {
        return "left";
      }

      element = element.parentElement;
    }

    return "left";
  }

  function normalizeUrl(url) {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }

    return "https://" + url;
  }

  function splitTrailingPunctuation(url) {
    var trailing = "";

    while (/[.,;:!?)]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }

    return {
      url: normalizeUrl(url),
      trailing: trailing
    };
  }

  function normalizeTitle(title) {
    return (title || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function truncateGraphTitle(title) {
    var value = title || getDefaultTitle("document");

    if (value.length <= 24) {
      return value;
    }

    return value.slice(0, 21) + "...";
  }

  function getHeaderStatus(item) {
    if (item.type === "project") {
      return state.ui.projectTab === "graph" ? "Grafo do projeto" : "Capa do projeto";
    }

    return getTypeName(item.type);
  }

  function getSaveStatusText() {
    if (state.ui.saveStatus === "saving") {
      return "Salvando...";
    }

    if (state.ui.saveStatus === "error") {
      return "Erro ao salvar";
    }

    if (state.ui.saveStatus === "local") {
      return "Salvo localmente";
    }

    return "Salvo";
  }

  function getTypeName(type) {
    if (type === "project") {
      return "Projeto";
    }

    if (type === "folder") {
      return "Pasta";
    }

    return "Documento";
  }

  function getDefaultTitle(type) {
    if (type === "project") {
      return "Projeto sem título";
    }

    if (type === "folder") {
      return "Pasta sem título";
    }

    return "Documento sem título";
  }

  function getCreateLabel(type) {
    if (type === "project") {
      return "Novo projeto";
    }

    if (type === "folder") {
      return "Nova pasta";
    }

    return "Novo documento";
  }

  function getIndicator(item) {
    if (item.type === "document") {
      return "";
    }

    return item.isOpen ? "▾" : "▸";
  }

  function getIcon(item) {
    if (item.type === "project") {
      return "▣";
    }

    if (item.type === "folder") {
      return "□";
    }

    return "◻";
  }

  function detectPublicView() {
    var params = new URLSearchParams(window.location.search);
    var view = params.get("view");
    var id = params.get("id");

    if ((view === "project" || view === "page") && id) {
      state.ui.isPublicView = true;
      state.ui.publicView = view;
      state.ui.publicId = id;
      state.ui.publicActiveId = null;
    }
  }

  function renderApp() {
    applyTheme();

    if (state.ui.isPublicView) {
      renderPublicView();
      return;
    }

    renderNormalApp();
  }

  function renderNormalApp() {
    renderSidebar();
    renderMain();
  }

  function renderPublicView() {
    if (state.ui.publicView === "project") {
      renderPublicProjectView(state.ui.publicId);
      return;
    }

    renderPublicPageView(state.ui.publicId);
  }

  function renderPublicPageView(documentId) {
    var item = getItem(documentId);

    if (!item || item.type !== "document" || item.visibility !== "public") {
      renderPrivateMessage("Página não encontrada ou privada.");
      return;
    }

    document.body.innerHTML = "";

    var layout = document.createElement("main");
    layout.className = "public-layout public-page-layout";

    var wrapper = document.createElement("article");
    wrapper.className = "public-content-wrapper";

    var title = document.createElement("h1");
    title.textContent = item.title || getDefaultTitle("document");
    wrapper.appendChild(title);

    var project = getItem(getRootProjectId(item.id));
    if (project) {
      var meta = document.createElement("p");
      meta.className = "public-meta";
      meta.textContent = project.title || getDefaultTitle("project");
      wrapper.appendChild(meta);
    }

    wrapper.appendChild(renderReadOnlyContent(item, {
      mode: "page"
    }));
    layout.appendChild(wrapper);
    document.body.appendChild(layout);
  }

  function renderPublicProjectView(projectId) {
    var project = getItem(projectId);

    if (!project || project.type !== "project" || project.visibility !== "public") {
      renderPrivateMessage("Projeto não encontrado ou privado.");
      return;
    }

    if (!state.ui.publicActiveId || !isPublicDocumentInProject(state.ui.publicActiveId, project.id)) {
      state.ui.publicActiveId = project.id;
    }

    document.body.innerHTML = "";

    var layout = document.createElement("div");
    layout.className = "public-layout public-project-layout";
    layout.appendChild(renderPublicProjectSidebar(project.id, state.ui.publicActiveId));

    var wrapper = document.createElement("main");
    wrapper.className = "public-content-wrapper";

    var activeItem = state.ui.publicActiveId === project.id ? project : getItem(state.ui.publicActiveId);
    var title = document.createElement("h1");
    title.textContent = activeItem.title || getDefaultTitle(activeItem.type);
    wrapper.appendChild(title);

    if (activeItem.type === "document") {
      var meta = document.createElement("p");
      meta.className = "public-meta";
      meta.textContent = project.title || getDefaultTitle("project");
      wrapper.appendChild(meta);
    }

    wrapper.appendChild(renderReadOnlyContent(activeItem, {
      mode: "project",
      projectId: project.id
    }));
    layout.appendChild(wrapper);
    document.body.appendChild(layout);
  }

  function renderPublicProjectSidebar(projectId, activeId) {
    var project = getItem(projectId);
    var sidebar = document.createElement("aside");
    var title = document.createElement("button");

    sidebar.className = "public-sidebar";
    title.type = "button";
    title.className = "public-sidebar-title" + (activeId === projectId ? " active" : "");
    title.textContent = project.title || getDefaultTitle("project");
    title.addEventListener("click", function () {
      state.ui.publicActiveId = projectId;
      renderPublicProjectView(projectId);
    });
    sidebar.appendChild(title);

    appendPublicSidebarChildren(sidebar, projectId, activeId, 0);
    return sidebar;
  }

  function appendPublicSidebarChildren(container, parentId, activeId, depth) {
    getChildren(parentId).forEach(function (item) {
      if (item.type === "document") {
        if (item.visibility !== "public") {
          return;
        }

        container.appendChild(createPublicSidebarItem(item, activeId, depth));
        return;
      }

      if (item.type === "folder" && folderHasPublicDocuments(item.id)) {
        var folder = document.createElement("div");
        folder.className = "public-sidebar-folder";
        folder.style.setProperty("--depth", depth);
        folder.textContent = item.title || getDefaultTitle("folder");
        container.appendChild(folder);
        appendPublicSidebarChildren(container, item.id, activeId, depth + 1);
      }
    });
  }

  function createPublicSidebarItem(item, activeId, depth) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "public-sidebar-item" + (activeId === item.id ? " active" : "");
    button.style.setProperty("--depth", depth);
    button.textContent = item.title || getDefaultTitle("document");
    button.addEventListener("click", function () {
      state.ui.publicActiveId = item.id;
      renderPublicProjectView(getRootProjectId(item.id));
    });
    return button;
  }

  function renderReadOnlyContent(item, context) {
    var content = document.createElement("div");
    content.className = "public-content";
    content.innerHTML = item.content || "";
    normalizeReadOnlyContent(content, item);

    content.addEventListener("click", function (event) {
      if (handleToggleBlockClick(event, null, content, true)) {
        return;
      }

      if (handleReadOnlyKanbanClick(event, content)) {
        return;
      }

      var internalLink = event.target.closest ? event.target.closest(".internal-link") : null;
      var externalLink = event.target.closest ? event.target.closest("a") : null;
      var targetId;

      if (internalLink && content.contains(internalLink)) {
        event.preventDefault();
        targetId = internalLink.getAttribute("data-target-id");

        if (!targetId) {
          alert("Documento não encontrado neste projeto.");
          return;
        }

        if (context.mode === "project") {
          state.ui.publicActiveId = targetId;
          renderPublicProjectView(context.projectId);
        } else {
          window.location.href = getPublicUrl(getItem(targetId));
        }
        return;
      }

      if (externalLink && content.contains(externalLink)) {
        externalLink.target = "_blank";
        externalLink.rel = "noopener noreferrer";
      }
    });

    return content;
  }

  function normalizeReadOnlyContent(root, contextItem) {
    unwrapWikilinks(root);
    linkifyTextNodes(root);
    wikilinkTextNodes(root, contextItem, true);
    normalizeCodeBlocks(root);
    prepareToggleBlocks(root, true);
    prepareKanbanBlocks(root, true);
    prepareSpreadsheetBlocks(root, true);
    prepareEditorMedia(root);
    Array.prototype.slice.call(root.querySelectorAll(".image-remove, .resize-handle")).forEach(function (control) {
      control.remove();
    });
    Array.prototype.slice.call(root.querySelectorAll(".image-block")).forEach(function (block) {
      block.removeAttribute("draggable");
    });
    ensureLinksOpenInNewTab(root);
    prepareReadOnlyContent(root);
  }

  function prepareReadOnlyContent(container) {
    container.removeAttribute("contenteditable");
    Array.prototype.slice.call(container.querySelectorAll("[contenteditable]")).forEach(function (node) {
      node.setAttribute("contenteditable", "false");
    });
    prepareToggleBlocks(container, true);
    prepareKanbanBlocks(container, true);
    prepareSpreadsheetBlocks(container, true);
  }

  function renderPrivateMessage(message) {
    document.body.innerHTML = "";
    var layout = document.createElement("main");
    layout.className = "public-layout public-page-layout";
    var box = document.createElement("div");
    box.className = "private-message";
    box.textContent = message;
    layout.appendChild(box);
    document.body.appendChild(layout);
  }

  async function shareItem(itemId) {
    var item = getItem(itemId);
    var email;
    var user;

    if (!isAdmin() || !item || (item.type !== "project" && item.type !== "document")) {
      return;
    }

    email = normalizeEmail(prompt("Email do moderador para compartilhar:"));

    if (!email) {
      return;
    }

    user = (await AuthStore.syncUsers()).find(function (candidate) {
      return candidate.email === email && candidate.role === "moderator" && candidate.status === "approved";
    });

    if (!user) {
      alert("Moderador aprovado não encontrado.");
      return;
    }

    item.sharedWith = Array.isArray(item.sharedWith) ? item.sharedWith : [];

    if (item.sharedWith.indexOf(user.id) === -1) {
      item.sharedWith.push(user.id);
      item.updatedAt = nowIso();
    }

    if (item.type === "project") {
      getDescendants(item.id).forEach(function (descendant) {
        descendant.sharedWith = Array.isArray(descendant.sharedWith) ? descendant.sharedWith : [];
        if (descendant.sharedWith.indexOf(user.id) === -1) {
          descendant.sharedWith.push(user.id);
          descendant.updatedAt = nowIso();
        }
      });
    }

    await saveStateAsync();

    alert("Compartilhado com " + user.name + ". O moderador verá na próxima atualização.");
  }

  function getDeepSeekApiKey() {
    return AiState.apiKey;
  }

  function setDeepSeekApiKey(key) {
    AiState.apiKey = key || "";
    updateAiKeyStatus();
  }

  function clearDeepSeekApiKey() {
    AiState.apiKey = "";
    updateAiKeyStatus();
  }

  async function ensureDeepSeekApiKey() {
    var key;

    if (getDeepSeekApiKey()) {
      return getDeepSeekApiKey();
    }

    key = prompt("Digite sua API key da DeepSeek. Ela ficará apenas em memória até você recarregar ou fechar a página.");

    if (!key || !key.trim()) {
      return null;
    }

    setDeepSeekApiKey(key.trim());
    return getDeepSeekApiKey();
  }

  function toggleAiPanel() {
    AiState.isOpen = !AiState.isOpen;
    renderAiPanel();

    if (AiState.isOpen && elements.aiPrompt) {
      elements.aiPrompt.focus();
    }
  }

  function closeAiPanel() {
    AiState.isOpen = false;
    renderAiPanel();
  }

  function renderAiPanel() {
    if (!elements.aiPanel) {
      return;
    }

    elements.aiPanel.classList.toggle("open", !!AiState.isOpen);
    updateAiKeyStatus();
    applyAiOptionsState();
    renderAiMessages();
  }

  function updateAiKeyStatus() {
    if (elements.aiKeyStatus) {
      elements.aiKeyStatus.textContent = getDeepSeekApiKey() ? "Chave configurada nesta sessão" : "Chave não configurada";
    }
  }

  function getDefaultAiContextOptions() {
    return {
      current: true,
      project: false,
      links: false,
      blocks: false,
      related: false
    };
  }

  function loadAiPreferences() {
    var savedMode = localStorage.getItem(AI_MODE_KEY);
    var savedContext = localStorage.getItem(AI_CONTEXT_OPTIONS_KEY);
    var parsedContext;

    AiState.optionsCollapsed = localStorage.getItem(AI_OPTIONS_COLLAPSED_KEY) !== "false";

    if (["reply", "suggest", "confirm", "auto"].indexOf(savedMode) !== -1) {
      AiState.mode = savedMode;
    }

    try {
      parsedContext = savedContext ? JSON.parse(savedContext) : null;
    } catch (error) {
      parsedContext = null;
    }

    AiState.contextOptions = Object.assign(getDefaultAiContextOptions(), parsedContext || {});
    if (!hasAnyAiContextOption(AiState.contextOptions)) {
      AiState.contextOptions.current = true;
    }

    syncAiControls();
  }

  function toggleAiOptions() {
    AiState.optionsCollapsed = !AiState.optionsCollapsed;
    saveAiOptionsPreference();
    applyAiOptionsState();
  }

  function saveAiOptionsPreference() {
    localStorage.setItem(AI_OPTIONS_COLLAPSED_KEY, AiState.optionsCollapsed ? "true" : "false");
  }

  function applyAiOptionsState() {
    if (elements.aiOptionsPanel) {
      elements.aiOptionsPanel.classList.toggle("collapsed", !!AiState.optionsCollapsed);
    }

    if (elements.aiOptionsToggle) {
      elements.aiOptionsToggle.classList.toggle("active", !AiState.optionsCollapsed);
      elements.aiOptionsToggle.textContent = AiState.optionsCollapsed ? "Opções" : "Ocultar opções";
      elements.aiOptionsToggle.title = AiState.optionsCollapsed ? "Mostrar opções" : "Ocultar opções";
    }
  }

  function syncAiControls() {
    if (elements.aiModeSelect) {
      elements.aiModeSelect.value = AiState.mode;
    }

    Array.prototype.slice.call(document.querySelectorAll("[data-ai-context]")).forEach(function (input) {
      var key = input.getAttribute("data-ai-context");
      input.checked = !!AiState.contextOptions[key];
    });

    updateAiContextSummary();
  }

  function saveAiMode(mode) {
    AiState.mode = ["reply", "suggest", "confirm", "auto"].indexOf(mode) !== -1 ? mode : "confirm";
    localStorage.setItem(AI_MODE_KEY, AiState.mode);
  }

  function saveAiContextOptions() {
    localStorage.setItem(AI_CONTEXT_OPTIONS_KEY, JSON.stringify(AiState.contextOptions));
    updateAiContextSummary();
  }

  function hasAnyAiContextOption(options) {
    return !!(options.current || options.project || options.links || options.blocks || options.related);
  }

  function getAiContextOptions() {
    var options = Object.assign(getDefaultAiContextOptions(), AiState.contextOptions || {});

    if (!hasAnyAiContextOption(options)) {
      options.current = true;
    }

    return options;
  }

  function updateAiContextSummary() {
    var labels = [];
    var options = getAiContextOptions();

    if (!elements.aiContextSummary) {
      return;
    }

    if (options.current) {
      labels.push("página atual");
    }
    if (options.project) {
      labels.push("projeto");
    }
    if (options.links) {
      labels.push("links");
    }
    if (options.blocks) {
      labels.push("Kanban/planilhas");
    }
    if (options.related) {
      labels.push("relacionados");
    }

    elements.aiContextSummary.textContent = "Contexto: " + labels.join(" + ");
  }

  function getAiModeInstruction(mode) {
    if (mode === "reply") {
      return "Modo Só responder: responda apenas em texto. Não retorne actions.";
    }
    if (mode === "suggest") {
      return "Modo Sugerir alterações: você pode retornar actions, mas o Hub só mostrará a prévia.";
    }
    if (mode === "auto") {
      return "Modo Aplicar automaticamente: você pode retornar actions. O Hub validará tudo e ações perigosas ainda exigirão confirmação.";
    }
    return "Modo Aplicar com confirmação: você pode retornar actions. O usuário precisa confirmar antes de aplicar.";
  }

  async function handleAiSubmit(event) {
    var promptText = elements.aiPrompt ? elements.aiPrompt.value.trim() : "";
    var apiKey;
    var userContent;
    var answer;
    var parsedAnswer;

    event.preventDefault();

    if (!promptText || AiState.isSending) {
      return;
    }

    apiKey = await ensureDeepSeekApiKey();
    if (!apiKey) {
      return;
    }

    userContent = JSON.stringify({
      pedido: promptText,
      modoIa: AiState.mode,
      instrucaoModo: getAiModeInstruction(AiState.mode),
      contextoHub: buildAiContext()
    }, null, 2);

    AiState.messages.push({
      role: "user",
      content: userContent
    });
    AiState.isSending = true;
    elements.aiPrompt.value = "";
    renderAiMessages();

    try {
      answer = await AiProvider.sendMessage({
        apiKey: apiKey,
        messages: AiState.messages.filter(function (message) {
          return message.role === "user" || message.role === "assistant";
        }).map(function (message) {
          return {
            role: message.role,
            content: message.rawContent || message.content
          };
        })
      });

      parsedAnswer = parseAiResponse(answer || "");
      handleParsedAiAnswer(parsedAnswer, answer || "");
    } catch (error) {
      console.error("Falha ao consultar DeepSeek.", error);
      AiState.messages.push({
        role: "error",
        content: "Não foi possível consultar a IA. Verifique sua chave ou tente novamente."
      });
    } finally {
      AiState.isSending = false;
      renderAiMessages();
    }
  }

  function handleParsedAiAnswer(parsedAnswer, rawAnswer) {
    var mode = AiState.mode;
    var actions = Array.isArray(parsedAnswer.actions) ? parsedAnswer.actions : [];
    var message = {
      role: "assistant",
      content: parsedAnswer.reply || "Não recebi conteúdo na resposta.",
      rawContent: rawAnswer || "",
      actions: actions,
      actionsStatus: actions.length ? "pending" : "none"
    };
    var result;

    if (parsedAnswer.parseError) {
      message.actions = [];
      message.actionsStatus = "none";
      AiState.messages.push(message);
      return;
    }

    if (mode === "reply" && actions.length) {
      message.actions = [];
      message.actionsStatus = "ignored";
      message.content += "\n\nAções ignoradas porque o modo atual é Só responder.";
      AiState.messages.push(message);
      return;
    }

    if (!actions.length) {
      AiState.messages.push(message);
      return;
    }

    if (mode === "auto" && !actionsNeedConfirmation(actions)) {
      result = applyAiActions(actions, message.content);
      if (!result.ok) {
        message.actionsStatus = "failed";
        AiState.messages.push(message);
        AiState.messages.push({
          role: "error",
          content: result.errors.join("\n")
        });
        return;
      }

      message.actionsStatus = "applied";
      message.content += "\n\nAções aplicadas automaticamente.";
      AiState.messages.push(message);
      AiState.messages.push({
        role: "assistant",
        content: "Snapshot local salvo. Use o botão de desfazer se precisar reverter.",
        actionsStatus: "none"
      });
      return;
    }

    if (mode === "auto" && actionsNeedConfirmation(actions)) {
      message.actionsNote = "Modo automático pausado: há ação perigosa ou grande demais. Confirme para aplicar.";
    }

    AiState.messages.push(message);
  }

  function renderAiMessages() {
    if (!elements.aiMessages) {
      return;
    }

    elements.aiMessages.innerHTML = "";

    AiState.messages.forEach(function (message) {
      elements.aiMessages.appendChild(renderAiMessage(message));
    });

    if (AiState.isSending) {
      var thinking = document.createElement("div");
      thinking.className = "ai-thinking";
      thinking.textContent = "Pensando...";
      elements.aiMessages.appendChild(thinking);
    }

    elements.aiMessages.scrollTop = elements.aiMessages.scrollHeight;
  }

  function renderAiMessage(message) {
    var wrapper = document.createElement("div");
    var content = document.createElement("div");

    wrapper.className = "ai-message " + message.role;
    content.textContent = message.role === "user" ? getAiUserDisplayText(message.content) : message.content;
    wrapper.appendChild(content);

    if (message.role === "assistant" && message.actions && message.actions.length && message.actionsStatus === "pending") {
      wrapper.appendChild(renderAiActionsPreview(message));
    }

    if (message.role === "assistant" && message.actionsStatus === "applied") {
      var applied = document.createElement("div");
      applied.className = "ai-actions-preview";
      applied.textContent = "Ações aplicadas.";
      wrapper.appendChild(applied);
    }

    if (message.role === "assistant" && message.actionsStatus === "cancelled") {
      var cancelled = document.createElement("div");
      cancelled.className = "ai-actions-preview";
      cancelled.textContent = "Ações canceladas.";
      wrapper.appendChild(cancelled);
    }

    return wrapper;
  }

  function parseAiResponse(rawText) {
    var parsed;
    var extracted;
    var trimmed = (rawText || "").trim();

    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      extracted = extractJsonObject(trimmed);
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch (innerError) {
          parsed = null;
        }
      }
    }

    if (!parsed || typeof parsed !== "object" || !parsed.reply || !Array.isArray(parsed.actions)) {
      if (/```json/i.test(trimmed) || /^\{/.test(trimmed) || /"actions"\s*:/.test(trimmed)) {
        return {
          reply: "A IA retornou um JSON inválido. Texto bruto:\n\n" + rawText,
          actions: [],
          parseError: true
        };
      }

      return {
        reply: rawText,
        actions: []
      };
    }

    return {
      reply: String(parsed.reply),
      actions: parsed.actions
    };
  }

  function extractJsonObject(text) {
    var cleaned = (text || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    var start = cleaned.indexOf("{");
    var end = cleaned.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      return "";
    }

    return cleaned.slice(start, end + 1);
  }

  function renderAiActionsPreview(message) {
    var preview = document.createElement("div");
    var title = document.createElement("strong");
    var list = document.createElement("div");
    var buttons = document.createElement("div");
    var apply = document.createElement("button");
    var cancel = document.createElement("button");
    var note = null;

    preview.className = "ai-actions-preview" + (hasReplaceContentAction(message.actions) ? " has-danger" : "");
    title.textContent = "Ações sugeridas";
    list.className = "ai-action-list";

    if (message.actionsNote) {
      note = document.createElement("div");
      note.className = "ai-actions-note";
      note.textContent = message.actionsNote;
    }

    message.actions.forEach(function (action) {
      var item = document.createElement("div");
      item.className = "ai-action-item" + (action.type === "replaceContent" ? " ai-action-danger" : "");
      item.textContent = describeAiAction(action);
      list.appendChild(item);
    });

    if (hasReplaceContentAction(message.actions)) {
      var warning = document.createElement("div");
      warning.className = "ai-action-danger";
      warning.textContent = "Esta ação substituirá todo o conteúdo atual.";
      list.appendChild(warning);
    }

    buttons.className = "ai-actions-buttons";
    apply.type = "button";
    apply.className = "ai-apply-actions";
    apply.textContent = "Aplicar ações";
    cancel.type = "button";
    cancel.className = "ai-cancel-actions";
    cancel.textContent = "Cancelar";

    apply.addEventListener("click", function () {
      applyAiActionsFromMessage(message);
    });
    cancel.addEventListener("click", function () {
      message.actionsStatus = "cancelled";
      renderAiMessages();
    });

    buttons.appendChild(apply);
    buttons.appendChild(cancel);
    preview.appendChild(title);
    if (note) {
      preview.appendChild(note);
    }
    preview.appendChild(list);
    preview.appendChild(buttons);
    return preview;
  }

  function getAiUserDisplayText(content) {
    try {
      return JSON.parse(content).pedido || content;
    } catch (error) {
      return content;
    }
  }

  function buildAiContext() {
    var item = getSelectedItem();
    var projectId = item ? getRootProjectId(item.id) : null;
    var project = projectId ? getItem(projectId) : null;
    var options = getAiContextOptions();
    var context = {
      mode: AiState.mode,
      modeInstruction: getAiModeInstruction(AiState.mode),
      selectedContext: options,
      selectedItem: item ? getAiItemMetadata(item) : null,
      breadcrumb: item ? renderBreadcrumb(item.id) : "",
      rootProject: project ? getAiItemMetadata(project) : null,
      hubSummary: buildHubSummary(projectId),
      allowedActions: getAiAllowedActionExamples()
    };

    if (options.current) {
      context.currentItem = item ? getAiItemContentPayload(item, 18000) : null;
    }

    if (options.project && project) {
      context.projectTree = buildAiTreeSummary(project.id, 0);
      context.projectItems = buildAiProjectItems(project.id);
      context.documents = context.projectItems.filter(function (candidate) {
        return candidate.type === "document";
      });
    }

    if (options.links) {
      context.links = item ? extractAiLinksSummary(item) : null;
    }

    if (options.blocks) {
      context.structuredBlocks = item ? extractAiStructuredBlocks(item) : null;
    }

    if (options.related) {
      context.relatedDocuments = item && projectId ? buildAiRelatedDocuments(item, projectId) : [];
    }

    return context;
  }

  function buildAiTreeSummary(parentId, depth) {
    if (depth > 5) {
      return [];
    }

    return getChildren(parentId).filter(function (item) {
      return !item.deletedAt;
    }).map(function (item) {
      return {
        id: item.id,
        type: item.type,
        title: item.title || getDefaultTitle(item.type),
        parentId: item.parentId || null,
        visibility: item.visibility || "private",
        children: item.type === "document" ? [] : buildAiTreeSummary(item.id, depth + 1)
      };
    });
  }

  function getAiAllowedActionExamples() {
    return [
      { type: "appendContent", itemId: "id", html: "<h2>Nova seção</h2><p>Conteúdo...</p>" },
      { type: "prependContent", itemId: "id", html: "<p>Conteúdo inicial...</p>" },
      { type: "replaceContent", itemId: "id", html: "<h2>Novo conteúdo</h2>" },
      { type: "createDocument", parentId: "id-do-projeto-ou-pasta", title: "Novo documento", content: "<p>Conteúdo inicial</p>" },
      { type: "createFolder", parentId: "id-do-projeto-ou-pasta", title: "Nova pasta" },
      { type: "renameItem", itemId: "id", title: "Novo nome" },
      { type: "insertKanban", itemId: "id", title: "Kanban", columns: [{ title: "A Fazer", cards: [{ title: "Tarefa", checklist: [{ text: "Passo", checked: false }] }] }] },
      { type: "insertSpreadsheet", itemId: "id", rows: [["Aula", "Tema", "Status"], ["01", "Introdução", "Pendente"]] }
    ];
  }

  function getAiItemMetadata(item) {
    return {
      id: item.id,
      type: item.type,
      title: item.title || getDefaultTitle(item.type),
      parentId: item.parentId || null,
      visibility: item.visibility || "private",
      path: renderBreadcrumb(item.id)
    };
  }

  function getAiItemContentPayload(item, limit) {
    var payload = getAiItemMetadata(item);

    payload.content = (item.type === "document" || item.type === "project") ? prepareAiContent(item.content || "", limit || 3000) : "";
    payload.textLength = getPlainTextFromHtml(item.content || "").length;
    return payload;
  }

  function buildAiProjectItems(projectId) {
    if (!projectId) {
      return [];
    }

    return state.items.filter(function (candidate) {
      return !candidate.deletedAt && (candidate.id === projectId || getRootProjectId(candidate.id) === projectId);
    }).map(function (candidate) {
      return getAiItemContentPayload(candidate, 2500);
    });
  }

  function buildHubSummary(projectId) {
    var projects = state.items.filter(function (item) {
      return !item.deletedAt && item.type === "project";
    });
    var documents = state.items.filter(function (item) {
      return !item.deletedAt && item.type === "document";
    });
    var publicCount = state.items.filter(function (item) {
      return !item.deletedAt && item.visibility === "public";
    }).length;
    var emptyDocuments = documents.filter(function (item) {
      return getPlainTextFromHtml(item.content || "").trim().length < 40;
    });
    var documentsWithKanban = documents.filter(function (item) {
      return /class=["'][^"']*kanban-block/i.test(item.content || "");
    });
    var documentsWithSpreadsheets = documents.filter(function (item) {
      return /class=["'][^"']*spreadsheet-block/i.test(item.content || "");
    });
    var documentsWithManyLinks = documents.filter(function (item) {
      return countAiLinks(item.content || "") >= 6;
    });

    return {
      projectCount: projects.length,
      projects: projects.map(function (project) {
        return {
          id: project.id,
          title: project.title || getDefaultTitle(project.type),
          documentCount: getDescendants(project.id).filter(function (item) {
            return item.type === "document";
          }).length
        };
      }),
      documentCount: documents.length,
      publicItems: publicCount,
      privateItems: state.items.filter(function (item) {
        return !item.deletedAt && item.visibility !== "public";
      }).length,
      emptyDocuments: emptyDocuments.map(getAiItemMetadata).slice(0, 20),
      documentsWithKanban: documentsWithKanban.map(getAiItemMetadata).slice(0, 20),
      documentsWithSpreadsheets: documentsWithSpreadsheets.map(getAiItemMetadata).slice(0, 20),
      documentsWithManyLinks: documentsWithManyLinks.map(getAiItemMetadata).slice(0, 20),
      lastSelectedItem: state.selectedItemId || null,
      currentProjectTree: projectId ? buildAiTreeSummary(projectId, 0) : []
    };
  }

  function getPlainTextFromHtml(html) {
    var wrapper = document.createElement("div");

    wrapper.innerHTML = html || "";
    return wrapper.textContent || "";
  }

  function countAiLinks(html) {
    var wrapper = document.createElement("div");

    wrapper.innerHTML = html || "";
    return wrapper.querySelectorAll("a[href], img[src]").length + extractWikiLinkTitles(html || "").length;
  }

  function extractAiLinksSummary(item) {
    var wrapper = document.createElement("div");
    var externalLinks = [];
    var imageLinks = [];

    wrapper.innerHTML = item.content || "";
    Array.prototype.slice.call(wrapper.querySelectorAll("a[href]")).forEach(function (link) {
      externalLinks.push({
        text: (link.textContent || "").trim(),
        href: link.getAttribute("href")
      });
    });
    Array.prototype.slice.call(wrapper.querySelectorAll("img[src]")).forEach(function (image) {
      imageLinks.push({
        alt: image.getAttribute("alt") || "",
        src: image.getAttribute("src")
      });
    });

    return {
      item: getAiItemMetadata(item),
      externalLinks: externalLinks.slice(0, 80),
      imageLinks: imageLinks.slice(0, 40),
      wikilinks: extractWikiLinkTitles(item.content || "").slice(0, 80)
    };
  }

  function extractAiStructuredBlocks(item) {
    var wrapper = document.createElement("div");

    wrapper.innerHTML = item.content || "";
    return {
      item: getAiItemMetadata(item),
      kanbans: Array.prototype.slice.call(wrapper.querySelectorAll(".kanban-block")).map(extractAiKanbanSummary),
      spreadsheets: Array.prototype.slice.call(wrapper.querySelectorAll(".spreadsheet-block")).map(extractAiSpreadsheetSummary)
    };
  }

  function extractAiKanbanSummary(block) {
    return {
      title: block.querySelector(".kanban-title") ? block.querySelector(".kanban-title").textContent.trim() : "Kanban",
      columns: Array.prototype.slice.call(block.querySelectorAll(".kanban-column")).map(function (column) {
        var input = column.querySelector(".kanban-column-title");
        return {
          title: input ? input.getAttribute("value") || input.value || "" : "",
          cards: Array.prototype.slice.call(column.querySelectorAll(".kanban-card")).map(function (card) {
            return {
              title: card.querySelector(".kanban-card-title") ? card.querySelector(".kanban-card-title").textContent.trim() : "",
              checklist: Array.prototype.slice.call(card.querySelectorAll(".kanban-card-data .kanban-checklist-item")).map(function (check) {
                return {
                  text: check.textContent.trim(),
                  checked: check.getAttribute("data-checked") === "true"
                };
              })
            };
          })
        };
      })
    };
  }

  function extractAiSpreadsheetSummary(block) {
    return {
      title: block.querySelector(".spreadsheet-title") ? block.querySelector(".spreadsheet-title").textContent.trim() : "Planilha",
      rows: Array.prototype.slice.call(block.querySelectorAll(".spreadsheet-table tr")).slice(0, 20).map(function (row) {
        return Array.prototype.slice.call(row.cells).slice(0, 8).map(function (cell) {
          return cell.textContent.trim();
        });
      })
    };
  }

  function buildAiRelatedDocuments(item, projectId) {
    var seen = {};

    return extractWikiLinkTitles(item.content || "").map(function (title) {
      return findDocumentByTitleInProject(projectId, title);
    }).filter(function (documentItem) {
      if (!documentItem || seen[documentItem.id]) {
        return false;
      }
      seen[documentItem.id] = true;
      return true;
    }).map(function (documentItem) {
      return getAiItemContentPayload(documentItem, 3000);
    });
  }

  function prepareAiContent(content, limit) {
    return content.replace(/src="data:[^"]+"/gi, 'src="[imagem-base64-removida]"').slice(0, limit || 18000);
  }

  function describeAiAction(action) {
    var item = action.itemId ? getItem(action.itemId) : null;
    var parent = action.parentId ? getItem(action.parentId) : null;
    var itemTitle = item ? item.title || getDefaultTitle(item.type) : action.itemId || "item desconhecido";
    var parentTitle = parent ? parent.title || getDefaultTitle(parent.type) : action.parentId || "item desconhecido";

    if (action.type === "appendContent") {
      return "Adicionar conteúdo ao final de: " + itemTitle;
    }
    if (action.type === "prependContent") {
      return "Adicionar conteúdo ao início de: " + itemTitle;
    }
    if (action.type === "replaceContent") {
      return "Substituir todo o conteúdo de: " + itemTitle;
    }
    if (action.type === "createDocument") {
      return 'Criar documento "' + (action.title || "Sem título") + '" dentro de "' + parentTitle + '"';
    }
    if (action.type === "createFolder") {
      return 'Criar pasta "' + (action.title || "Sem título") + '" dentro de "' + parentTitle + '"';
    }
    if (action.type === "renameItem") {
      return 'Renomear "' + itemTitle + '" para "' + (action.title || "Sem título") + '"';
    }
    if (action.type === "insertKanban") {
      return "Inserir Kanban em: " + itemTitle;
    }
    if (action.type === "insertSpreadsheet") {
      return "Inserir planilha em: " + itemTitle;
    }

    return "Ação não suportada: " + (action.type || "sem tipo");
  }

  function hasReplaceContentAction(actions) {
    return actions.some(function (action) {
      return action.type === "replaceContent";
    });
  }

  function hasDangerousAiAction(actions) {
    return actions.some(isDangerousAiAction);
  }

  function actionsNeedConfirmation(actions) {
    return hasDangerousAiAction(actions) || actions.length > 8;
  }

  function isDangerousAiAction(action) {
    var html = "";
    var cardCount = 0;
    var cellCount = 0;

    if (!action || !action.type) {
      return true;
    }

    html = String(action.html || action.content || "");
    if (action.type === "insertKanban" && Array.isArray(action.columns)) {
      action.columns.forEach(function (column) {
        cardCount += Array.isArray(column.cards) ? column.cards.length : 0;
      });
      return action.columns.length > 8 || cardCount > 60;
    }
    if (action.type === "insertSpreadsheet" && Array.isArray(action.rows)) {
      action.rows.forEach(function (row) {
        cellCount += Array.isArray(row) ? row.length : 0;
      });
      return action.rows.length > 80 || cellCount > 800;
    }

    return action.type === "replaceContent" || /^delete/i.test(action.type) || html.length > 50000;
  }

  function applyAiActionsFromMessage(message) {
    var result;

    if (actionsNeedConfirmation(message.actions || []) && !confirm("Essa sugestão inclui ação perigosa ou grande. Aplicar mesmo assim?")) {
      return;
    }

    result = applyAiActions(message.actions || [], message.content);

    if (!result.ok) {
      AiState.messages.push({
        role: "error",
        content: result.errors.join("\n")
      });
      renderAiMessages();
      return;
    }

    message.actionsStatus = "applied";
    AiState.messages.push({
      role: "assistant",
      content: "Ações aplicadas com sucesso. Snapshot local salvo para desfazer.",
      actionsStatus: "none"
    });
    renderAiMessages();
  }

  function applyAiActions(actions, description) {
    var errors = validateAiActions(actions);
    var changedIds = [];
    var createdItem = null;
    var undoSnapshot;

    if (errors.length) {
      return {
        ok: false,
        errors: errors
      };
    }

    undoSnapshot = createAiUndoSnapshot(actions, description || "Alterações feitas pela IA");

    actions.forEach(function (action) {
      var item = action.itemId ? getItem(action.itemId) : null;
      var created;

      if (action.type === "appendContent") {
        item.content = (item.content || "") + sanitizeAiHtml(action.html);
        touchAiChangedItem(item, changedIds);
        return;
      }

      if (action.type === "prependContent") {
        item.content = sanitizeAiHtml(action.html) + (item.content || "");
        touchAiChangedItem(item, changedIds);
        return;
      }

      if (action.type === "replaceContent") {
        item.content = sanitizeAiHtml(action.html);
        touchAiChangedItem(item, changedIds);
        return;
      }

      if (action.type === "createDocument") {
        created = createAiItem("document", action.parentId, action.title, sanitizeAiHtml(action.content || ""));
        createdItem = created;
        changedIds.push(created.id);
        undoSnapshot.createdItems.push(created.id);
        return;
      }

      if (action.type === "createFolder") {
        created = createAiItem("folder", action.parentId, action.title, "");
        createdItem = created;
        changedIds.push(created.id);
        undoSnapshot.createdItems.push(created.id);
        return;
      }

      if (action.type === "renameItem") {
        item.title = action.title.trim();
        touchAiChangedItem(item, changedIds);
        return;
      }

      if (action.type === "insertKanban") {
        item.content = (item.content || "") + createKanbanHtmlFromAiAction(action);
        touchAiChangedItem(item, changedIds);
        return;
      }

      if (action.type === "insertSpreadsheet") {
        item.content = (item.content || "") + createSpreadsheetHtmlFromAiAction(action);
        touchAiChangedItem(item, changedIds);
      }
    });

    if (createdItem) {
      state.selectedItemId = createdItem.id;
    }

    finalizeAiUndoSnapshot(undoSnapshot);
    saveState(changedIds, state.selectedItemId);
    render();
    return {
      ok: true,
      errors: []
    };
  }

  function touchAiChangedItem(item, changedIds) {
    item.updatedAt = nowIso();
    if (changedIds.indexOf(item.id) === -1) {
      changedIds.push(item.id);
    }
  }

  function createAiItem(type, parentId, title, content) {
    var parent = getItem(parentId);
    var createdAt = nowIso();
    var item = {
      id: createId(type),
      type: type,
      title: (title || getDefaultTitle(type)).trim(),
      parentId: parentId,
      projectId: getProjectIdForNewItem(type, parentId, null),
      ownerId: state.session ? state.session.id : null,
      visibility: "private",
      sharedWith: parent && Array.isArray(parent.sharedWith) ? parent.sharedWith.slice() : [],
      createdAt: createdAt,
      updatedAt: createdAt
    };

    if (type === "document") {
      item.content = content || "";
    } else {
      item.isOpen = true;
      delete item.content;
    }

    if (parent && (parent.type === "project" || parent.type === "folder")) {
      parent.isOpen = true;
      parent.updatedAt = nowIso();
    }

    state.items.push(item);
    return item;
  }

  function cloneAiItemForUndo(item) {
    var snapshot;

    if (!item) {
      return null;
    }

    snapshot = {
      id: item.id,
      type: item.type,
      title: item.title || "",
      parentId: item.parentId || null,
      projectId: item.projectId || null,
      visibility: item.visibility || "private",
      sharedWith: Array.isArray(item.sharedWith) ? item.sharedWith : [],
      isOpen: item.isOpen === true,
      ownerId: item.ownerId || null,
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
      deletedAt: item.deletedAt || null
    };

    if (item.type === "document" || item.type === "project") {
      snapshot.content = item.content || "";
    }

    return JSON.parse(JSON.stringify(snapshot));
  }

  function createAiUndoSnapshot(actions, description) {
    var affectedIds = [];
    var snapshot;

    actions.forEach(function (action) {
      if (action.itemId && affectedIds.indexOf(action.itemId) === -1) {
        affectedIds.push(action.itemId);
      }
      if ((action.type === "createDocument" || action.type === "createFolder") && action.parentId && affectedIds.indexOf(action.parentId) === -1) {
        affectedIds.push(action.parentId);
      }
    });

    snapshot = {
      createdAt: nowIso(),
      description: description || "Alterações feitas pela IA",
      affectedItems: affectedIds.map(function (id) {
        return {
          id: id,
          before: cloneAiItemForUndo(getItem(id)),
          after: null
        };
      }).filter(function (entry) {
        return !!entry.before;
      }),
      createdItems: []
    };

    return snapshot;
  }

  function finalizeAiUndoSnapshot(snapshot) {
    snapshot.affectedItems.forEach(function (entry) {
      entry.after = cloneAiItemForUndo(getItem(entry.id));
    });
    localStorage.setItem(AI_UNDO_KEY, JSON.stringify(snapshot));
  }

  function restoreAiItemFromSnapshot(snapshotItem) {
    var existing = getItem(snapshotItem.id);
    var replacement = JSON.parse(JSON.stringify(snapshotItem));

    if (replacement.deletedAt === null) {
      delete replacement.deletedAt;
    }

    if (existing) {
      Object.keys(existing).forEach(function (key) {
        delete existing[key];
      });
      Object.assign(existing, replacement);
      return existing;
    }

    state.items.push(replacement);
    return replacement;
  }

  async function undoLastAiAction() {
    var saved = localStorage.getItem(AI_UNDO_KEY);
    var snapshot;
    var removeIds = [];
    var changedIds = [];
    var selectedWasRemoved = false;

    if (!saved) {
      AiState.messages.push({
        role: "assistant",
        content: "Nenhuma ação da IA para desfazer.",
        actionsStatus: "none"
      });
      renderAiMessages();
      return;
    }

    try {
      snapshot = JSON.parse(saved);
    } catch (error) {
      localStorage.removeItem(AI_UNDO_KEY);
      AiState.messages.push({
        role: "error",
        content: "Snapshot local de desfazer estava inválido e foi descartado."
      });
      renderAiMessages();
      return;
    }

    (snapshot.createdItems || []).forEach(function (id) {
      if (removeIds.indexOf(id) === -1) {
        removeIds.push(id);
      }
      getDescendants(id, {
        includeDeleted: true
      }).forEach(function (child) {
        if (removeIds.indexOf(child.id) === -1) {
          removeIds.push(child.id);
        }
      });
    });

    selectedWasRemoved = removeIds.indexOf(state.selectedItemId) !== -1;
    removeItems(removeIds);

    (snapshot.affectedItems || []).forEach(function (entry) {
      if (entry.before) {
        restoreAiItemFromSnapshot(entry.before);
        if (changedIds.indexOf(entry.id) === -1) {
          changedIds.push(entry.id);
        }
      }
    });

    if (selectedWasRemoved || !state.selectedItemId) {
      state.selectedItemId = changedIds[0] || null;
    }

    localStorage.removeItem(AI_UNDO_KEY);

    try {
      await DataStore.deleteItems(removeIds);
    } catch (error) {
      console.error("Falha ao remover itens criados pela IA no Firebase.", error);
    }

    try {
      await DataStore.save(state, {
        itemIds: changedIds,
        statusItemId: state.selectedItemId
      });
    } catch (error) {
      console.error("Falha ao salvar desfazer da IA.", error);
    }

    AiState.messages.push({
      role: "assistant",
      content: "Última ação da IA desfeita.",
      actionsStatus: "none"
    });
    render();
    renderAiMessages();
  }

  function validateAiActions(actions) {
    var errors = [];

    if (!Array.isArray(actions) || !actions.length) {
      return ["Nenhuma ação válida foi sugerida."];
    }

    actions.forEach(function (action, index) {
      var prefix = "Ação " + (index + 1) + ": ";
      var item = action && action.itemId ? getItem(action.itemId) : null;
      var parent = action && action.parentId ? getItem(action.parentId) : null;

      if (!action || typeof action !== "object" || !action.type) {
        errors.push(prefix + "ação sem tipo.");
        return;
      }

      if (["appendContent", "prependContent", "replaceContent"].indexOf(action.type) !== -1) {
        if (!item || (item.type !== "document" && item.type !== "project")) {
          errors.push(prefix + "itemId inexistente ou incompatível.");
        }
        if (item && !canEditItem(item)) {
          errors.push(prefix + "sem permissão para editar o item.");
        }
        if (typeof action.html !== "string") {
          errors.push(prefix + "html precisa ser string.");
        }
        if (typeof action.html === "string" && action.html.length > 120000) {
          errors.push(prefix + "html grande demais.");
        }
        return;
      }

      if (action.type === "createDocument" || action.type === "createFolder") {
        if (!parent || (parent.type !== "project" && parent.type !== "folder")) {
          errors.push(prefix + "parentId inexistente ou incompatível.");
        }
        if (parent && !canEditItem(parent)) {
          errors.push(prefix + "sem permissão para criar dentro do parentId.");
        }
        if (!action.title || !String(action.title).trim()) {
          errors.push(prefix + "title obrigatório.");
        }
        if (action.type === "createDocument" && action.content !== undefined && typeof action.content !== "string") {
          errors.push(prefix + "content precisa ser string.");
        }
        if (action.type === "createDocument" && typeof action.content === "string" && action.content.length > 120000) {
          errors.push(prefix + "content grande demais.");
        }
        return;
      }

      if (action.type === "renameItem") {
        if (!item) {
          errors.push(prefix + "itemId inexistente.");
        }
        if (item && !canEditItem(item)) {
          errors.push(prefix + "sem permissão para renomear o item.");
        }
        if (!action.title || !String(action.title).trim()) {
          errors.push(prefix + "title obrigatório.");
        }
        return;
      }

      if (action.type === "insertKanban") {
        if (!item || (item.type !== "document" && item.type !== "project")) {
          errors.push(prefix + "itemId inexistente ou incompatível.");
        }
        if (item && !canEditItem(item)) {
          errors.push(prefix + "sem permissão para editar o item.");
        }
        if (!Array.isArray(action.columns)) {
          errors.push(prefix + "columns precisa ser array.");
        }
        return;
      }

      if (action.type === "insertSpreadsheet") {
        if (!item || (item.type !== "document" && item.type !== "project")) {
          errors.push(prefix + "itemId inexistente ou incompatível.");
        }
        if (item && !canEditItem(item)) {
          errors.push(prefix + "sem permissão para editar o item.");
        }
        if (!Array.isArray(action.rows)) {
          errors.push(prefix + "rows precisa ser array.");
        }
        return;
      }

      errors.push(prefix + "tipo não suportado: " + action.type + ".");
    });

    return errors;
  }

  function sanitizeAiHtml(html) {
    var wrapper = document.createElement("div");
    var allowedTags = "p h1 h2 h3 h4 h5 h6 ul ol li strong b em i u a br pre code blockquote table thead tbody tfoot tr td th div span img hr".split(" ");

    wrapper.innerHTML = html || "";
    Array.prototype.slice.call(wrapper.querySelectorAll("script, iframe, object, embed, form, input, button, select, textarea, svg, math")).forEach(function (node) {
      node.remove();
    });
    Array.prototype.slice.call(wrapper.querySelectorAll("*")).forEach(function (node) {
      var tag = node.tagName.toLowerCase();

      if (allowedTags.indexOf(tag) === -1) {
        node.replaceWith(document.createTextNode(node.textContent || ""));
        return;
      }

      Array.prototype.slice.call(node.attributes).forEach(function (attribute) {
        var name = attribute.name.toLowerCase();
        var value = attribute.value || "";
        var safeUrl;

        if (name.indexOf("on") === 0) {
          node.removeAttribute(attribute.name);
          return;
        }

        if (name === "href" || name === "src") {
          safeUrl = sanitizeAiUrl(value, name);
          if (!safeUrl) {
            node.removeAttribute(attribute.name);
          } else {
            node.setAttribute(attribute.name, safeUrl);
          }
          return;
        }

        if (name === "style") {
          value = sanitizeAiStyle(value);
          if (value) {
            node.setAttribute("style", value);
          } else {
            node.removeAttribute(attribute.name);
          }
          return;
        }

        if (name === "class") {
          node.setAttribute("class", sanitizeAiClassValue(value));
          return;
        }

        if (["title", "alt", "target", "rel", "colspan", "rowspan", "width", "height"].indexOf(name) === -1) {
          node.removeAttribute(attribute.name);
        }
      });
    });

    return wrapper.innerHTML;
  }

  function sanitizeAiUrl(url, attributeName) {
    var value = String(url || "").trim();

    if (!value || /^(javascript|data|vbscript):/i.test(value)) {
      return "";
    }

    if (attributeName === "src") {
      return /^https?:\/\//i.test(value) ? value : "";
    }

    if (/^(https?:\/\/|mailto:|#)/i.test(value)) {
      return value;
    }

    return "";
  }

  function sanitizeAiStyle(style) {
    var safeRules = [];

    String(style || "").split(";").forEach(function (rule) {
      var parts = rule.split(":");
      var property = parts.shift();
      var value = parts.join(":").trim();

      property = property ? property.trim().toLowerCase() : "";

      if (["color", "background-color", "font-weight", "text-decoration"].indexOf(property) === -1) {
        return;
      }
      if (/url\s*\(|expression\s*\(|javascript:/i.test(value)) {
        return;
      }

      safeRules.push(property + ": " + value);
    });

    return safeRules.join("; ");
  }

  function sanitizeAiClassValue(value) {
    return String(value || "").split(/\s+/).filter(function (className) {
      return /^[a-z0-9_-]{1,48}$/i.test(className);
    }).slice(0, 8).join(" ");
  }

  function createKanbanHtmlFromAiAction(action) {
    var wrapper = document.createElement("div");
    var block;
    var board;

    wrapper.innerHTML = createKanbanBlockHtml(createId("kanban"));
    block = wrapper.querySelector(".kanban-block");
    board = block.querySelector(".kanban-board");
    board.innerHTML = "";

    if (action.title) {
      block.querySelector(".kanban-title").textContent = action.title;
    }

    action.columns.forEach(function (column) {
      var columnElement = createKanbanColumnElement(column.title || "Nova coluna");
      var cards = columnElement.querySelector(".kanban-cards");

      (Array.isArray(column.cards) ? column.cards : []).forEach(function (cardData) {
        var card = createKanbanCardElement(cardData.title || "Novo cartão");
        var data = getKanbanCardData(card);

        (Array.isArray(cardData.checklist) ? cardData.checklist : []).forEach(function (check) {
          data.appendChild(createKanbanChecklistItemElement(check.text || "Novo item", check.checked === true));
        });

        cards.appendChild(card);
      });

      board.appendChild(columnElement);
    });

    prepareKanbanBlocks(wrapper, false);
    block.removeAttribute("data-temp-kanban");
    return block.outerHTML + "<p><br></p>";
  }

  function createSpreadsheetHtmlFromAiAction(action) {
    var wrapper = document.createElement("div");
    var block;
    var tbody;

    wrapper.innerHTML = createSpreadsheetBlockHtml(createId("sheet"));
    block = wrapper.querySelector(".spreadsheet-block");
    tbody = block.querySelector("tbody");
    tbody.innerHTML = "";

    action.rows.forEach(function (rowData, rowIndex) {
      var row = document.createElement("tr");
      (Array.isArray(rowData) ? rowData : []).forEach(function (cellData) {
        var cell = document.createElement(rowIndex === 0 ? "th" : "td");
        cell.setAttribute("contenteditable", "true");
        cell.textContent = cellData == null ? "" : String(cellData);
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    });

    normalizeSpreadsheetTable(block.querySelector(".spreadsheet-table"), false);
    block.removeAttribute("data-temp-sheet");
    return block.outerHTML + "<p><br></p>";
  }

  async function renderAdminPanel() {
    var users = await AuthStore.syncUsers();
    var overlay = document.createElement("div");
    var panel = document.createElement("section");

    if (!isAdmin()) {
      return;
    }

    closeAdminPanel();
    overlay.className = "admin-overlay";
    overlay.id = "adminOverlay";
    panel.className = "admin-panel";
    panel.innerHTML = '<div class="admin-panel-header"><h2>Admin</h2><button class="text-button" id="closeAdminPanel" type="button">Fechar</button></div>';

    users.forEach(function (user) {
      var row = document.createElement("div");
      var info = document.createElement("div");
      var actions = document.createElement("div");

      row.className = "admin-user-row";
      info.className = "admin-user-info";
      actions.className = "admin-user-actions";
      info.innerHTML = "<strong>" + escapeHtml(user.name) + "</strong><span>" + escapeHtml(user.email) + " · " + user.role + " · " + getUserStatusLabel(user.status) + "</span>";

      if (user.status !== "approved") {
        actions.appendChild(createTextButton("Aprovar", function () {
          updateUserStatus(user.id, "approved");
        }));
      }

      if (user.status !== "banned" && user.id !== state.session.id) {
        actions.appendChild(createTextButton("Banir", function () {
          updateUserStatus(user.id, "banned");
        }, "danger"));
      }

      row.appendChild(info);
      row.appendChild(actions);
      panel.appendChild(row);
    });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.getElementById("closeAdminPanel").addEventListener("click", closeAdminPanel);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        closeAdminPanel();
      }
    });
  }

  function closeAdminPanel() {
    var overlay = document.getElementById("adminOverlay");

    if (overlay) {
      overlay.remove();
    }
  }

  function updateUserStatus(userId, status) {
    AuthStore.updateUser(userId, {
      status: status
    }).then(renderAdminPanel);
  }

  function getUserStatusLabel(status) {
    if (status === "approved") {
      return "aprovado";
    }
    if (status === "banned") {
      return "banido";
    }
    return "pendente";
  }

  function renderAuthView() {
    document.body.innerHTML =
      '<main class="auth-layout">' +
      '<section class="auth-panel">' +
      '<div class="auth-brand">Hub</div>' +
      '<div class="auth-tabs">' +
      '<button class="auth-tab active" id="showLogin" type="button">Entrar</button>' +
      '<button class="auth-tab" id="showRegister" type="button">Cadastrar</button>' +
      "</div>" +
      '<form class="auth-form" id="loginForm">' +
      '<label>Email<input id="loginEmail" type="email" autocomplete="email" required></label>' +
      '<label>Senha<input id="loginPassword" type="password" autocomplete="current-password" required></label>' +
      '<button class="auth-submit" type="submit">Entrar</button>' +
      "</form>" +
      '<form class="auth-form is-hidden" id="registerForm">' +
      '<label>Nome<input id="registerName" type="text" autocomplete="name" required></label>' +
      '<label>Email<input id="registerEmail" type="email" autocomplete="email" required></label>' +
      '<label>Senha<input id="registerPassword" type="password" autocomplete="new-password" required></label>' +
      '<label>Confirmar senha<input id="registerConfirmPassword" type="password" autocomplete="new-password" required></label>' +
      '<button class="auth-submit" type="submit">Criar conta</button>' +
      "</form>" +
      '<div class="auth-message" id="authMessage"></div>' +
      "</section>" +
      "</main>";

    bindAuthEvents();
  }

  function bindAuthEvents() {
    var showLogin = document.getElementById("showLogin");
    var showRegister = document.getElementById("showRegister");
    var loginForm = document.getElementById("loginForm");
    var registerForm = document.getElementById("registerForm");

    showLogin.addEventListener("click", function () {
      showLogin.classList.add("active");
      showRegister.classList.remove("active");
      loginForm.classList.remove("is-hidden");
      registerForm.classList.add("is-hidden");
      setAuthMessage("");
    });

    showRegister.addEventListener("click", function () {
      showRegister.classList.add("active");
      showLogin.classList.remove("active");
      registerForm.classList.remove("is-hidden");
      loginForm.classList.add("is-hidden");
      setAuthMessage("");
    });

    loginForm.addEventListener("submit", async function (event) {
      var result;
      event.preventDefault();
      result = await AuthStore.login(document.getElementById("loginEmail").value, document.getElementById("loginPassword").value);

      if (!result.ok) {
        setAuthMessage(result.message);
        return;
      }

      reloadWithoutQuery();
    });

    registerForm.addEventListener("submit", async function (event) {
      var result;
      event.preventDefault();
      result = await AuthStore.register({
        name: document.getElementById("registerName").value,
        email: document.getElementById("registerEmail").value,
        password: document.getElementById("registerPassword").value,
        confirmPassword: document.getElementById("registerConfirmPassword").value
      });

      if (!result.ok) {
        setAuthMessage(result.message);
        return;
      }

      if (result.user.status !== "approved") {
        setAuthMessage(result.message);
        showLogin.click();
        return;
      }

      reloadWithoutQuery();
    });
  }

  function setAuthMessage(message) {
    var element = document.getElementById("authMessage");

    if (element) {
      element.textContent = message;
    }
  }

  function reloadWithoutQuery() {
    window.location.href = window.location.origin + window.location.pathname;
  }

  function folderHasPublicDocuments(folderId) {
    return getDescendants(folderId).some(function (item) {
      return item.type === "document" && item.visibility === "public";
    });
  }

  function isPublicDocumentInProject(documentId, projectId) {
    var item = getItem(documentId);
    return !!item && item.type === "document" && item.visibility === "public" && getRootProjectId(item.id) === projectId;
  }

  function toggleTheme() {
    state.preferences.theme = state.preferences.theme === "dark" ? "light" : "dark";
    saveState([], null);
    applyTheme();
  }

  function isHeaderCollapsed() {
    return !!(state.preferences && state.preferences.headerCollapsed);
  }

  function toggleHeaderCollapsed() {
    var editor = document.getElementById("documentContent");

    if (editor && state.selectedItemId) {
      updateDocumentContent(state.selectedItemId, getEditorHtml(editor));
    }

    state.preferences.headerCollapsed = !isHeaderCollapsed();
    saveState([], null);
    render();
  }

  function applyTheme() {
    var theme = state.preferences.theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;

    if (elements.toggleTheme) {
      elements.toggleTheme.textContent = theme === "dark" ? "☀" : "🌙";
      elements.toggleTheme.setAttribute("aria-label", theme === "dark" ? "Ativar modo claro" : "Ativar modo noturno");
    }
  }

  function normalizeEmail(email) {
    return (email || "").trim().toLowerCase();
  }

  function encodePassword(password) {
    return btoa(unescape(encodeURIComponent(password || "")));
  }

  async function loadSession() {
    state.session = await AuthStore.getCurrentUser();
    if (!state.session) {
      AuthStore.clearSession();
    }
    return state.session;
  }

  function renderAccount() {
    if (elements.accountName && state.session) {
      elements.accountName.textContent = state.session.name + " · " + (isAdmin() ? "admin" : "moderador");
    }

    if (elements.adminButton) {
      elements.adminButton.style.display = isAdmin() ? "block" : "none";
    }

    if (elements.newItem) {
      elements.newItem.style.display = isAdmin() ? "inline-flex" : "none";
    }
  }

  function render() {
    renderApp();
  }

  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", handleGlobalShortcut);
  }

  function handleGlobalShortcut(event) {
    var key = event.key.toLowerCase();
    var isMod = event.ctrlKey || event.metaKey;
    var isShift = event.shiftKey;

    if (event.key === "Escape") {
      closeOpenOverlays();
      return;
    }

    if (isModifierShortcut(event, "s")) {
      event.preventDefault();
      saveState(state.selectedItemId ? [state.selectedItemId] : [], state.selectedItemId);
      return;
    }

    if (isMod && isShift && key === "f") {
      event.preventDefault();
      focusGlobalSearch();
      return;
    }

    if (state.ui.isPublicView || !isMod) {
      return;
    }

    if (!isShift && ["b", "i", "u"].indexOf(key) !== -1 && isEditorShortcutTarget(event.target)) {
      event.preventDefault();
      applyFormatting(key === "b" ? "bold" : (key === "i" ? "italic" : "underline"));
      return;
    }

    if (!isShift && key === "k" && isEditorShortcutTarget(event.target)) {
      event.preventDefault();
      applyLink();
      return;
    }

    if (!isShift || isTypingInFormField(event.target)) {
      return;
    }

    if (key === "c") {
      event.preventDefault();
      focusEditorForShortcut();
      insertCodeBlock();
      return;
    }

    if (key === "t") {
      event.preventDefault();
      focusEditorForShortcut();
      insertToggleBlock();
      return;
    }

    if (key === "k") {
      event.preventDefault();
      focusEditorForShortcut();
      insertKanbanBlock();
      return;
    }

    if (key === "p") {
      event.preventDefault();
      focusEditorForShortcut();
      insertSpreadsheetBlock();
    }
  }

  function isModifierShortcut(event, key) {
    return (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === key;
  }

  function isEditorShortcutTarget(target) {
    var editor = document.getElementById("documentContent");

    if (!editor || !target || !editor.contains(target)) {
      return false;
    }

    if (target.closest && (target.closest(".kanban-block") || target.closest(".spreadsheet-block") || target.closest(".kanban-card-modal"))) {
      return false;
    }

    return true;
  }

  function isTypingInFormField(target) {
    if (!target || !target.closest) {
      return false;
    }

    if (target.closest("input, textarea, select, .kanban-block, .spreadsheet-block, .kanban-card-modal")) {
      return true;
    }

    return !!(target.isContentEditable && !target.closest("#documentContent"));
  }

  function focusEditorForShortcut() {
    var editor = document.getElementById("documentContent");
    var selection = window.getSelection();
    var range;

    if (!editor) {
      return false;
    }

    editor.focus();

    if (!selection || selection.rangeCount === 0 || !editor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    return true;
  }

  function focusGlobalSearch() {
    if (!elements.sidebarSearch) {
      return;
    }

    state.sidebarCollapsed = false;
    renderSidebar();
    elements.sidebarSearch.focus();
    elements.sidebarSearch.select();
  }

  function closeOpenOverlays() {
    if (state.createMenu) {
      closeCreateMenu();
    }
    if (state.highlightMenu) {
      closeHighlightMenu();
    }
    if (state.textColorMenu) {
      closeTextColorMenu();
    }
    if (spreadsheetColorMenu) {
      closeSpreadsheetColorMenu();
    }
    if (activeKanbanModal) {
      closeKanbanCardModal();
    }
    closeAdminPanel();
    if (AiState.isOpen) {
      closeAiPanel();
    }
  }

  function bindEvents() {
    elements.toggleSidebar.addEventListener("click", function () {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      closeCreateMenu();
      closeHighlightMenu();
      render();
    });

    elements.toggleTheme.addEventListener("click", function () {
      toggleTheme();
    });

    elements.newItem.addEventListener("click", function (event) {
      event.stopPropagation();
      openCreateMenu(null, ["project", "document"], elements.newItem);
    });

    if (elements.sidebarSearch) {
      elements.sidebarSearch.addEventListener("input", function () {
        state.ui.searchQuery = elements.sidebarSearch.value;
        state.ui.showTrash = false;
        renderSidebar();
      });
    }

    if (elements.trashToggle) {
      elements.trashToggle.addEventListener("click", function () {
        state.ui.showTrash = !state.ui.showTrash;
        renderSidebar();
      });
    }

    if (elements.exportBackup) {
      elements.exportBackup.addEventListener("click", exportHubBackup);
    }

    if (elements.importBackup && elements.backupFileInput) {
      elements.importBackup.addEventListener("click", function () {
        elements.backupFileInput.value = "";
        elements.backupFileInput.click();
      });
      elements.backupFileInput.addEventListener("change", function () {
        importHubBackup(elements.backupFileInput.files && elements.backupFileInput.files[0]);
      });
    }

    elements.logoutButton.addEventListener("click", function () {
      AuthStore.clearSession();
      reloadWithoutQuery();
    });

    elements.adminButton.addEventListener("click", function () {
      renderAdminPanel();
    });

    loadAiPreferences();

    if (elements.aiClose) {
      elements.aiClose.addEventListener("click", closeAiPanel);
    }

    if (elements.aiOptionsToggle) {
      elements.aiOptionsToggle.addEventListener("click", toggleAiOptions);
    }

    if (elements.aiSetKey) {
      elements.aiSetKey.addEventListener("click", function () {
        var currentLabel = getDeepSeekApiKey() ? "Trocar API key da DeepSeek" : "Digite sua API key da DeepSeek";
        var key = prompt(currentLabel + ". Ela ficará apenas em memória até você recarregar ou fechar a página.");

        if (key && key.trim()) {
          setDeepSeekApiKey(key.trim());
        }
      });
    }

    if (elements.aiClearKey) {
      elements.aiClearKey.addEventListener("click", function () {
        clearDeepSeekApiKey();
      });
    }

    if (elements.aiForm) {
      elements.aiForm.addEventListener("submit", handleAiSubmit);
    }

    if (elements.aiModeSelect) {
      elements.aiModeSelect.addEventListener("change", function () {
        saveAiMode(elements.aiModeSelect.value);
      });
    }

    Array.prototype.slice.call(document.querySelectorAll("[data-ai-context]")).forEach(function (input) {
      input.addEventListener("change", function () {
        var key = input.getAttribute("data-ai-context");
        AiState.contextOptions[key] = input.checked;
        if (!hasAnyAiContextOption(AiState.contextOptions)) {
          AiState.contextOptions.current = true;
          syncAiControls();
        }
        saveAiContextOptions();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll(".ai-quick-prompt-btn")).forEach(function (button) {
      button.addEventListener("click", function () {
        if (!elements.aiPrompt) {
          return;
        }
        elements.aiPrompt.value = button.getAttribute("data-prompt") || "";
        elements.aiPrompt.focus();
      });
    });

    if (elements.aiUndoLastAction) {
      elements.aiUndoLastAction.addEventListener("click", function () {
        undoLastAiAction();
      });
    }

    renderAiPanel();
    setupKeyboardShortcuts();

    document.addEventListener("mousedown", function (event) {
      var menu = document.getElementById("createMenu");

      if (!menu || !state.createMenu) {
        var highlightMenu = document.getElementById("highlightMenu");
        var textColorMenu = document.getElementById("textColorMenu");

        if (highlightMenu && state.highlightMenu && !highlightMenu.contains(event.target) && !state.highlightMenu.anchor.contains(event.target)) {
          closeHighlightMenu();
        }
        if (textColorMenu && state.textColorMenu && !textColorMenu.contains(event.target) && !state.textColorMenu.anchor.contains(event.target)) {
          closeTextColorMenu();
        }
        if (spreadsheetColorMenu && !spreadsheetColorMenu.menu.contains(event.target) && !spreadsheetColorMenu.anchor.contains(event.target)) {
          closeSpreadsheetColorMenu();
        }
        return;
      }

      if (menu.contains(event.target) || state.createMenu.anchor.contains(event.target)) {
        return;
      }

      closeCreateMenu();
    });

    window.addEventListener("resize", function () {
      closeCreateMenu();
      closeHighlightMenu();
      closeTextColorMenu();
      closeSpreadsheetColorMenu();
    });

  }

  function waitForFirebaseAuth() {
    return new Promise(function (resolve) {
      var unsubscribe = onAuthStateChanged(auth, function () {
        unsubscribe();
        resolve();
      });
    });
  }

  async function init() {
    await waitForFirebaseAuth();
    detectPublicView();
    if (!state.ui.isPublicView) {
      await loadSession();
    }
    await loadState();
    applyTheme();
    if (state.ui.isPublicView) {
      renderPublicView();
      return;
    }
    if (!state.session) {
      renderAuthView();
      return;
    }
    renderAccount();
    bindEvents();
    render();
  }

  init();
})();
