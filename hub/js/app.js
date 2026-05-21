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
  var IMAGE_URL_PATTERN = /\.(png|jpe?g|webp|gif)(\?.*)?$/i;
  var URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;
  var WIKILINK_PATTERN = /\[\[([^\[\]]+)\]\]/g;
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

  var saveTimer = null;
  var normalizeTimer = null;
  var selectedImageBlock = null;
  var draggedImageBlock = null;
  var resizeState = null;

  var state = {
    items: [],
    selectedItemId: null,
    sidebarCollapsed: false,
    createMenu: null,
    highlightMenu: null,
    inlineEdit: null,
    preferences: {
      theme: "light"
    },
    ui: {
      isPublicView: false,
      publicView: null,
      publicId: null,
      publicActiveId: null,
      projectTab: "cover",
      copyFeedbackId: null
    },
    session: null
  };

  var elements = {
    sidebar: document.getElementById("sidebar"),
    toggleSidebar: document.getElementById("toggleSidebar"),
    toggleTheme: document.getElementById("toggleTheme"),
    newItem: document.getElementById("newItem"),
    treeList: document.getElementById("treeList"),
    editorPanel: document.getElementById("editorPanel"),
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
          theme: "light"
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
      this.save(state);
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
    save: async function (nextState) {
      var batchItems = nextState.items || [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        items: nextState.items,
        selectedItemId: nextState.selectedItemId,
        preferences: nextState.preferences || {
          theme: "light"
        }
      }));

      if (!auth.currentUser || state.ui.isPublicView) {
        return;
      }

      await Promise.all(batchItems.map(function (item) {
        return setDoc(doc(db, "items", item.id), item, {
          merge: true
        });
      }).concat([
        setDoc(doc(db, "preferences", auth.currentUser.uid), nextState.preferences || {
          theme: "light"
        }, {
          merge: true
        })
      ]));
    },
    getState: function () {
      return state;
    },
    setState: function (nextState) {
      state.items = Array.isArray(nextState.items) ? nextState.items : [];
      state.selectedItemId = nextState.selectedItemId || null;
      state.preferences = nextState.preferences || {
        theme: "light"
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
      this.save(state);
      setDoc(doc(db, "items", id), item, {
        merge: true
      });
      return item;
    },
    createItem: function (item) {
      state.items.push(item);
      this.save(state);
      setDoc(doc(db, "items", item.id), item, {
        merge: true
      });
      return item;
    },
    deleteItem: function (id) {
      state.items = state.items.filter(function (item) {
        return item.id !== id;
      });
      if (state.selectedItemId === id) {
        state.selectedItemId = null;
      }
      this.save(state);
      deleteDoc(doc(db, "items", id));
    },
    deleteItems: async function (ids) {
      if (!Array.isArray(ids) || ids.length === 0) {
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

  function saveState() {
    DataStore.save(state);
  }

  async function saveStateAsync() {
    await DataStore.save(state);
  }

  function getItem(id) {
    return DataStore.getItem(id);
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

    items.push(firebaseDocToItem(current));

    if (state.ui.publicView === "page") {
      projectId = items[0].projectId || null;
      if (projectId) {
        current = await getDoc(doc(db, "items", projectId));
        if (current.exists()) {
          items.push(firebaseDocToItem(current));
        }
      }
      return items;
    }

    snapshot = await getDocs(query(collection(db, "items"), where("projectId", "==", state.ui.publicId), where("visibility", "==", "public")));
    snapshot.docs.forEach(function (itemDoc) {
      if (!items.some(function (item) {
        return item.id === itemDoc.id;
      })) {
        items.push(firebaseDocToItem(itemDoc));
      }
    });

    return items;
  }

  function getChildren(parentId) {
    return state.items.filter(function (item) {
      return item.parentId === parentId;
    });
  }

  function getDescendants(itemId) {
    var descendants = [];

    getChildren(itemId).forEach(function (child) {
      descendants.push(child);
      descendants = descendants.concat(getDescendants(child.id));
    });

    return descendants;
  }

  function getSelectedItem() {
    return getItem(state.selectedItemId);
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

  function hasAccessibleDescendant(itemId) {
    return getDescendants(itemId).some(function (descendant) {
      if (descendant.type === "folder") {
        return false;
      }
      return canAccessItem(descendant);
    });
  }

  function getVisibleChildren(parentId) {
    return getChildren(parentId).filter(canAccessItem);
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

    DataStore.createItem(item);
    state.selectedItemId = item.id;
    saveState();
    return item;
  }

  async function deleteItem(id) {
    var item = getItem(id);

    if (!item || !canEditItem(item)) {
      return;
    }

    var descendants = getDescendants(id);
    var extra = descendants.length ? " e " + descendants.length + " item(ns) dentro dele" : "";
    var confirmed = confirm('Excluir "' + item.title + '"' + extra + "?");

    if (!confirmed) {
      return;
    }

    var ids = [id].concat(descendants.map(function (child) {
      return child.id;
    }));

    removeItems(ids);

    saveState();
    render();
    await DataStore.deleteItems(ids);
  }

  function removeItems(ids) {
    state.items = state.items.filter(function (item) {
      return ids.indexOf(item.id) === -1;
    });

    if (ids.indexOf(state.selectedItemId) !== -1) {
      state.selectedItemId = null;
    }
  }

  function selectItem(id) {
    var item = getItem(id);

    state.selectedItemId = id;
    if (item && item.type === "project") {
      state.ui.projectTab = "cover";
    }
    saveState();
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
    saveState();
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

    saveState();
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
    saveState();
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
    saveState();
    render();
  }

  function renderSidebar() {
    elements.sidebar.classList.toggle("is-collapsed", state.sidebarCollapsed);
    elements.treeList.innerHTML = "";

    var rootItems = getVisibleChildren(null);

    if (!rootItems.length && !state.sidebarCollapsed) {
      var empty = document.createElement("div");
      empty.className = "sidebar-empty";
      empty.textContent = "Nenhum item ainda";
      elements.treeList.appendChild(empty);
      return;
    }

    renderTree(null, 0);
  }

  function renderTree(parentId, depth) {
    getVisibleChildren(parentId).forEach(function (item) {
      renderTreeItem(item, depth);

      if ((item.type === "project" || item.type === "folder") && item.isOpen) {
        renderTree(item.id, depth + 1);
      }
    });
  }

  function renderTreeItem(item, depth) {
    var row = document.createElement("div");
    row.className = "tree-item tree-item-" + item.type;
    row.style.setProperty("--depth", depth);

    if (item.id === state.selectedItemId) {
      row.classList.add("is-active");
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
    elements.editorPanel.innerHTML =
      '<div class="empty-state">' +
      "<h2>Nenhum documento selecionado</h2>" +
      "<p>Crie ou selecione um documento na barra lateral.</p>" +
      "</div>";
  }

  function renderHeader(item, includeToolbar) {
    var header = document.createElement("div");
    header.className = "editor-header";

    if (item.type === "project") {
      header.classList.add("has-tabs");
    }

    if (!includeToolbar) {
      header.classList.add("is-compact");
    }

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
    status.textContent = item.type === "document" ? "Salvo localmente" : getHeaderStatus(item);

    heading.appendChild(title);
    heading.appendChild(breadcrumb);
    heading.appendChild(status);

    var actions = document.createElement("div");
    actions.className = "editor-actions";
    var actionGroup = document.createElement("div");
    actionGroup.className = "toolbar-group action-group";

    if (isAdmin() && (item.type === "project" || item.type === "document")) {
      if (item.visibility === "public") {
        actionGroup.appendChild(createTextButton("Copiar link", function () {
          copyPublicLink(item);
        }));
      }

      actionGroup.appendChild(createTextButton("Compartilhar", function () {
        shareItem(item.id);
      }));

      if (state.ui.copyFeedbackId === item.id) {
        var copied = document.createElement("span");
        copied.className = "copy-feedback";
        copied.textContent = "Link copiado";
        actionGroup.appendChild(copied);
      }
    }

    if (canEditItem(item)) {
      actionGroup.appendChild(createTextButton("Renomear", function () {
        startInlineRename(item.id);
      }));
      actionGroup.appendChild(createTextButton("Excluir", function () {
        deleteItem(item.id);
      }, "danger"));
    }
    actions.appendChild(actionGroup);

    header.appendChild(heading);

    if (item.type === "project") {
      header.appendChild(renderProjectTabs());
    }

    if (includeToolbar) {
      header.appendChild(renderToolbar());
    }

    header.appendChild(actions);
    return header;
  }

  function renderContainerState(item) {
    elements.editorPanel.innerHTML = "";
    elements.editorPanel.appendChild(renderHeader(item, false));

    var body = document.createElement("div");
    body.className = "container-message";
    body.innerHTML = "<p>Selecione ou crie um documento dentro deste item para começar a escrever.</p>";

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
    ensureLinksOpenInNewTab(editor);
    item.content = getEditorHtml(editor);
    saveState();

    editor.addEventListener("input", function () {
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

    editor.addEventListener("dragover", function (event) {
      if (!draggedImageBlock) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });

    editor.addEventListener("drop", function (event) {
      if (!draggedImageBlock) {
        return;
      }

      event.preventDefault();
      moveDraggedImage(editor, event.clientY);
      updateDocumentContent(item.id, getEditorHtml(editor));
    });

    editor.addEventListener("dragend", function () {
      draggedImageBlock = null;
    });

    editor.addEventListener("keydown", function (event) {
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
    toolbar.className = "format-toolbar";
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
        ["Código", "Inserir bloco de código", "code"],
        ["Link", "Inserir link", "link"],
        ["Imagem", "Inserir imagem", "image"]
      ]
    ].forEach(function (group) {
      toolbar.appendChild(createToolbarGroup(group));
    });

    return toolbar;
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

      if (command === "code") {
        insertCodeBlock();
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

  function handleEditorPaste(event, itemId, editor) {
    var clipboard = event.clipboardData;

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

    document.execCommand("insertHTML", false, plainTextToHtml(text));
    normalizeEditorContent();
    updateDocumentContent(itemId, getEditorHtml(editor));
  }

  function plainTextToHtml(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
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
    var clone = editor.cloneNode(true);

    Array.prototype.slice.call(clone.querySelectorAll(".image-block.selected")).forEach(function (block) {
      block.classList.remove("selected");
    });

    Array.prototype.slice.call(clone.querySelectorAll("img")).forEach(function (image) {
      if (/^data:/i.test(image.getAttribute("src") || "")) {
        image.closest(".image-block") ? image.closest(".image-block").remove() : image.remove();
      }
    });

    return clone.innerHTML;
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

        if (!parent || parent.closest("a") || parent.closest(".image-block") || parent.closest("script") || parent.closest("style")) {
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

        if (!parent || parent.closest("a") || parent.closest(".image-block") || parent.closest("script") || parent.closest("style")) {
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
    saveState();
    render();
  }

  function openGraphDocument(documentId) {
    var documentItem = getItem(documentId);

    if (!documentItem || documentItem.type !== "document") {
      return;
    }

    expandParents(documentItem.id);
    state.selectedItemId = documentItem.id;
    saveState();
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
    updateStatus("Salvo localmente");
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

    if (project) {
      project.visibility = "public";
      project.updatedAt = now;
    }

    getDocumentsInsideProject(projectId).forEach(function (documentItem) {
      documentItem.visibility = "public";
      documentItem.updatedAt = now;
    });

    saveState();
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
    prepareEditorMedia(root);
    Array.prototype.slice.call(root.querySelectorAll(".image-remove, .resize-handle")).forEach(function (control) {
      control.remove();
    });
    Array.prototype.slice.call(root.querySelectorAll(".image-block")).forEach(function (block) {
      block.removeAttribute("draggable");
    });
    ensureLinksOpenInNewTab(root);
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
    saveState();
    applyTheme();
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

    elements.logoutButton.addEventListener("click", function () {
      AuthStore.clearSession();
      reloadWithoutQuery();
    });

    elements.adminButton.addEventListener("click", function () {
      renderAdminPanel();
    });

    document.addEventListener("mousedown", function (event) {
      var menu = document.getElementById("createMenu");

      if (!menu || !state.createMenu) {
        var highlightMenu = document.getElementById("highlightMenu");

        if (highlightMenu && state.highlightMenu && !highlightMenu.contains(event.target) && !state.highlightMenu.anchor.contains(event.target)) {
          closeHighlightMenu();
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
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.createMenu) {
        closeCreateMenu();
      }
      if (event.key === "Escape" && state.highlightMenu) {
        closeHighlightMenu();
      }
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
