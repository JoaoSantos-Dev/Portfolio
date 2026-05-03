import {
    addDoc,
    collection,
    deleteDoc,
    getDocs,
    query,
    setDoc,
    doc,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

export function createRoomService({ db, CONFIG, state }) {
    return {
        async listRooms() {
            const snapshot = await getDocs(collection(db, CONFIG.collections.rooms));

            return snapshot.docs
                .map(docSnapshot => ({
                    id: docSnapshot.id,
                    ...docSnapshot.data()
                }))
                .sort((first, second) => {
                    const firstOrder = first.ordem ?? Number.MAX_SAFE_INTEGER;
                    const secondOrder = second.ordem ?? Number.MAX_SAFE_INTEGER;

                    if (firstOrder !== secondOrder) {
                        return firstOrder - secondOrder;
                    }

                    return (first.nome || "").localeCompare(second.nome || "", "pt-BR");
                });
        },

        async ensureSeedRooms() {
            const existingRooms = await this.listRooms();

            if (existingRooms.length > 0) {
                const hasMissingOrder = existingRooms.some(room => typeof room.ordem !== "number");

                if (hasMissingOrder) {
                    await this.normalizeOrder();
                    return this.listRooms();
                }

                return existingRooms;
            }

            await Promise.all(CONFIG.defaultRooms.map(room =>
                setDoc(doc(db, CONFIG.collections.rooms, room.id), {
                    nome: room.nome,
                    ordem: room.ordem,
                    criadoEm: new Date().toISOString()
                })
            ));

            return this.listRooms();
        },

        async refreshRooms() {
            state.rooms = await this.listRooms();

            if (!state.selectedRoom || !state.rooms.some(room => room.id === state.selectedRoom)) {
                state.selectedRoom = state.rooms[0]?.id || null;
            }

            return state.rooms;
        },

        async createRoom(nome) {
            const rooms = await this.listRooms();
            const nextOrder = rooms.length === 0
                ? 1
                : Math.max(...rooms.map(room => room.ordem || 0)) + 1;

            await addDoc(collection(db, CONFIG.collections.rooms), {
                nome,
                ordem: nextOrder,
                criadoEm: new Date().toISOString()
            });
        },

        async renameRoom(roomId, nome) {
            await updateDoc(doc(db, CONFIG.collections.rooms, roomId), {
                nome
            });
        },

        async deleteRoom(roomId) {
            const usersSnapshot = await getDocs(query(
                collection(db, CONFIG.collections.users),
                where("sala", "==", roomId)
            ));

            if (!usersSnapshot.empty) {
                throw new Error("A sala não pode ser excluída porque ainda está sendo usada por usuários.");
            }

            const rooms = await this.listRooms();

            if (rooms.length <= 1) {
                throw new Error("O sistema precisa manter pelo menos uma sala cadastrada.");
            }

            await deleteDoc(doc(db, CONFIG.collections.rooms, roomId));
            await this.normalizeOrder();
        },

        async moveRoom(roomId, direction) {
            const rooms = await this.listRooms();
            const currentIndex = rooms.findIndex(room => room.id === roomId);

            if (currentIndex === -1) {
                return;
            }

            const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

            if (targetIndex < 0 || targetIndex >= rooms.length) {
                return;
            }

            const currentRoom = rooms[currentIndex];
            const targetRoom = rooms[targetIndex];

            await Promise.all([
                updateDoc(doc(db, CONFIG.collections.rooms, currentRoom.id), {
                    ordem: targetRoom.ordem
                }),
                updateDoc(doc(db, CONFIG.collections.rooms, targetRoom.id), {
                    ordem: currentRoom.ordem
                })
            ]);
        },

        async normalizeOrder() {
            const rooms = await this.listRooms();

            await Promise.all(rooms.map((room, index) => updateDoc(
                doc(db, CONFIG.collections.rooms, room.id),
                { ordem: index + 1 }
            )));
        }
    };
}
