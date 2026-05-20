import { auth, db, storage } from "./firebase-config.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";

const authPersistenceReady = setPersistence(auth, browserLocalPersistence);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

async function ensureAuthPersistence() {
  await authPersistenceReady;
}

async function getCurrentUserOnce() {
  await ensureAuthPersistence();

  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

function getUserProfile(uid) {
  return getDoc(doc(db, "users", uid));
}

function isApprovedAdminProfile(profile) {
  return profile?.status === "approved" && profile?.role === "admin";
}

async function requireAdmin() {
  await ensureAuthPersistence();
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Faça login como admin para continuar.");
  }

  const profile = await getCurrentApprovedProfile(user);
  if (!isApprovedAdminProfile(profile)) {
    throw new Error("Este usuário não tem permissão de admin.");
  }

  return { user, profile };
}

function timestampToValue(value) {
  return value?.toDate ? value.toDate().toISOString() : value || "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeSection(section, type) {
  const validSections = ["curadoria", "profissionais", "empresas"];
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

function normalizeResourceSnapshot(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    ...data,
    section: normalizeSection(data.section, data.type),
    tags: Array.isArray(data.tags) ? data.tags : [],
    image: data.imageUrl || "",
    wallpaper: Boolean(data.wallpaper),
    special: Boolean(data.special),
    pinned: Boolean(data.pinned),
    useLibraryGif: Boolean(data.useLibraryGif),
    libraryGifKey: data.libraryGifKey || "",
    imagePositionY: Number.isFinite(Number(data.imagePositionY))
      ? Number(data.imagePositionY)
      : 50,
    libraryGifMode: data.libraryGifMode === "contain" ? "contain" : "cover",
    libraryGifPositionY: Number.isFinite(Number(data.libraryGifPositionY))
      ? Number(data.libraryGifPositionY)
      : 50,
    createdAt: timestampToValue(data.createdAt),
    updatedAt: timestampToValue(data.updatedAt)
  };
}

function sanitizeResourcePayload(resource) {
  return {
    title: resource.title || "",
    section: normalizeSection(resource.section, resource.type),
    type: resource.type || "",
    country: resource.country || "Global",
    description: resource.description || "",
    tags: Array.isArray(resource.tags) ? resource.tags : [],
    url: resource.url || "",
    cta: resource.cta || "",
    wallpaper: Boolean(resource.wallpaper),
    imagePositionY: Number.isFinite(Number(resource.imagePositionY))
      ? Number(resource.imagePositionY)
      : 50,
    useLibraryGif: Boolean(resource.useLibraryGif),
    libraryGifKey: resource.useLibraryGif ? resource.libraryGifKey || "" : "",
    libraryGifMode: resource.libraryGifMode === "contain" ? "contain" : "cover",
    libraryGifPositionY: Number.isFinite(Number(resource.libraryGifPositionY))
      ? Number(resource.libraryGifPositionY)
      : 50,
    featured: Boolean(resource.featured),
    special: Boolean(resource.special),
    pinned: Boolean(resource.pinned),
    status: resource.status === "draft" ? "draft" : "published"
  };
}

async function unpinOtherResources(activeResourceId) {
  const pinnedQuery = query(collection(db, "resources"), where("pinned", "==", true));
  const snapshot = await getDocs(pinnedQuery);
  const batch = writeBatch(db);
  let hasUpdates = false;

  snapshot.docs.forEach((resourceDoc) => {
    if (resourceDoc.id === activeResourceId) {
      return;
    }

    batch.update(resourceDoc.ref, { pinned: false });
    hasUpdates = true;
  });

  if (hasUpdates) {
    await batch.commit();
  }
}

function validateImageFile(file) {
  if (!file) {
    return;
  }

  const isWebp =
    file.type === "image/webp" ||
    String(file.name || "").toLowerCase().endsWith(".webp");

  if (!isWebp) {
    throw new Error("Use uma imagem WEBP.");
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("A imagem precisa ter até 5 MB.");
  }
}

function dataUrlToBlob(dataUrl) {
  if (!String(dataUrl || "").startsWith("data:image/webp")) {
    return null;
  }

  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/webp";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

async function uploadResourceImage(resourceId, fileOrBlob) {
  validateImageFile(fileOrBlob);
  const imagePath = `resources/${resourceId}/${Date.now()}-cover.webp`;
  const imageRef = ref(storage, imagePath);
  await uploadBytes(imageRef, fileOrBlob, { contentType: "image/webp" });
  const imageUrl = await getDownloadURL(imageRef);

  return { imageUrl, imagePath };
}

async function deleteResourceImage(imagePath) {
  if (!imagePath) {
    return;
  }

  try {
    await deleteObject(ref(storage, imagePath));
  } catch (error) {
    if (error.code !== "storage/object-not-found") {
      throw error;
    }
  }
}

async function registerPendingUser({ name, email, password }) {
  await ensureAuthPersistence();

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const userRef = doc(db, "users", credential.user.uid);

  try {
    await setDoc(userRef, {
      uid: credential.user.uid,
      name: name.trim(),
      email: credential.user.email,
      status: "pending",
      role: "member",
      createdAt: serverTimestamp(),
      approvedAt: null
    });
  } finally {
    await signOut(auth);
  }
}

async function loginApprovedUser({ email, password }) {
  await ensureAuthPersistence();

  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profileSnap = await getUserProfile(credential.user.uid);

  if (!profileSnap.exists()) {
    await signOut(auth);
    throw new Error("Seu cadastro ainda não foi aprovado.");
  }

  const profile = profileSnap.data();
  if (profile.status === "banned") {
    await signOut(auth);
    throw new Error("Este usuário foi banido do Radar GameDev.");
  }

  if (profile.status !== "approved") {
    await signOut(auth);
    throw new Error("Seu cadastro ainda está pendente de aprovação.");
  }

  return { user: credential.user, profile };
}

async function getCurrentApprovedProfile(user) {
  if (!user) {
    return null;
  }

  const profileSnap = await getUserProfile(user.uid);
  if (!profileSnap.exists()) {
    return null;
  }

  const profile = profileSnap.data();
  return profile.status === "approved" ? profile : null;
}

async function getPendingUsers() {
  await requireAdmin();
  const pendingQuery = query(collection(db, "users"), where("status", "==", "pending"));
  const snapshot = await getDocs(pendingQuery);

  return snapshot.docs.map((pendingDoc) => ({
    id: pendingDoc.id,
    ...pendingDoc.data()
  }));
}

async function getApprovedUsers() {
  await requireAdmin();
  const approvedQuery = query(collection(db, "users"), where("status", "==", "approved"));
  const snapshot = await getDocs(approvedQuery);

  return snapshot.docs.map((approvedDoc) => ({
    id: approvedDoc.id,
    ...approvedDoc.data()
  }));
}

async function deletePendingUsers(userIds) {
  await requireAdmin();
  await Promise.all(userIds.map((userId) => deleteDoc(doc(db, "users", userId))));
}

async function banApprovedUser(userId) {
  await requireAdmin();
  await updateDoc(doc(db, "users", userId), {
    status: "banned",
    role: "member",
    bannedAt: serverTimestamp()
  });
}

async function getResources() {
  const resourcesQuery = query(
    collection(db, "resources"),
    where("status", "==", "published")
  );
  const snapshot = await getDocs(resourcesQuery);

  const resources = snapshot.docs
    .map(normalizeResourceSnapshot)
    .sort((a, b) =>
      String(b.updatedAt || b.createdAt || "").localeCompare(
        String(a.updatedAt || a.createdAt || "")
      )
    );
  const pinnedResource = resources.find((resource) => resource.pinned);

  if (!pinnedResource) {
    return resources;
  }

  return [
    pinnedResource,
    ...resources
      .filter((resource) => resource.id !== pinnedResource.id)
      .map((resource) => (resource.pinned ? { ...resource, pinned: false } : resource))
  ];
}

async function getResourceById(resourceId) {
  await requireAdmin();
  const snapshot = await getDoc(doc(db, "resources", resourceId));
  return snapshot.exists() ? normalizeResourceSnapshot(snapshot) : null;
}

async function createResource(resource, imageFile) {
  const { user } = await requireAdmin();
  const resourceRef = doc(collection(db, "resources"));
  const payload = sanitizeResourcePayload(resource);
  let imageData = {};

  if (imageFile) {
    imageData = await uploadResourceImage(resourceRef.id, imageFile);
  }

  if (payload.pinned) {
    await unpinOtherResources(resourceRef.id);
  }

  await setDoc(resourceRef, {
    ...payload,
    ...imageData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: user.uid,
    updatedBy: user.uid
  });

  return resourceRef.id;
}

async function updateResource(resourceId, resource, imageFile, removeImage = false) {
  const { user } = await requireAdmin();
  const resourceRef = doc(db, "resources", resourceId);
  const currentSnapshot = await getDoc(resourceRef);

  if (!currentSnapshot.exists()) {
    throw new Error("Card não encontrado.");
  }

  const current = currentSnapshot.data();
  const payload = sanitizeResourcePayload(resource);
  let imageData = {};

  if (removeImage) {
    await deleteResourceImage(current.imagePath);
    imageData = { imageUrl: "", imagePath: "" };
  }

  if (imageFile) {
    imageData = await uploadResourceImage(resourceId, imageFile);
    if (current.imagePath) {
      await deleteResourceImage(current.imagePath);
    }
  }

  if (payload.pinned) {
    await unpinOtherResources(resourceId);
  }

  await updateDoc(resourceRef, {
    ...payload,
    ...imageData,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid
  });
}

async function deleteResource(resourceId) {
  await requireAdmin();
  const resourceRef = doc(db, "resources", resourceId);
  const snapshot = await getDoc(resourceRef);

  if (snapshot.exists()) {
    await deleteResourceImage(snapshot.data().imagePath);
  }

  await deleteDoc(resourceRef);
}

async function migrateLocalResources(resources) {
  const { user } = await requireAdmin();
  let migratedCount = 0;

  for (const localResource of resources) {
    const resourceRef = doc(collection(db, "resources"));
    const payload = sanitizeResourcePayload({
      ...localResource,
      imagePositionY: localResource.imagePositionY || 50
    });
    let imageData = {};
    const imageBlob = dataUrlToBlob(localResource.image);

    if (imageBlob) {
      imageData = await uploadResourceImage(resourceRef.id, imageBlob);
    }

    if (payload.pinned) {
      await unpinOtherResources(resourceRef.id);
    }

    await setDoc(resourceRef, {
      ...payload,
      ...imageData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
      updatedBy: user.uid,
      migratedFrom: "localStorage"
    });
    migratedCount += 1;
  }

  return migratedCount;
}

async function clearLocalMigrationMarkers() {
  await requireAdmin();
  const resourcesQuery = query(collection(db, "resources"), where("migratedFrom", "==", "localStorage"));
  const snapshot = await getDocs(resourcesQuery);
  const batch = writeBatch(db);

  snapshot.docs.forEach((resourceDoc) => {
    batch.update(resourceDoc.ref, { migratedFrom: "" });
  });

  await batch.commit();
}

window.radarFirebase = {
  auth,
  authPersistenceReady,
  onAuthStateChanged,
  getCurrentUserOnce,
  signOut: () => signOut(auth),
  registerPendingUser,
  loginApprovedUser,
  getCurrentApprovedProfile,
  getPendingUsers,
  getApprovedUsers,
  deletePendingUsers,
  banApprovedUser,
  getResources,
  getResourceById,
  createResource,
  updateResource,
  deleteResource,
  migrateLocalResources,
  uploadResourceImage,
  deleteResourceImage,
  clearLocalMigrationMarkers
};
