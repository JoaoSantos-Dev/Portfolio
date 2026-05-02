import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";

export const CONFIG = {
    firebase: {
        apiKey: "AIzaSyCuc2r0zz22aZUbO99YG3MNnHxbpGBzgrw",
        authDomain: "onepieceestudantil.firebaseapp.com",
        projectId: "onepieceestudantil",
        storageBucket: "onepieceestudantil.firebasestorage.app",
        messagingSenderId: "655412606407",
        appId: "1:655412606407:web:08ce540dc5e25e996555e2",
        measurementId: "G-4PHP8XEG5M"
    },
    storageKeys: {
        playerName: "onepiecePlayerName",
        playerRoom: "onepiecePlayerRoom",
        activeRun: "onepieceActiveRun"
    },
    collections: {
        ranking: "ranking",
        runs: "tentativas",
        users: "usuarios",
        rooms: "salas",
        challenges: "desafios",
        challengeParticipations: "participacoesDesafio",
        meta: "meta"
    },
    scoring: {
        base: 10000,
        timePenaltyPerSecond: 1,
        answerErrorPenalty: 200,
        riddleErrorPenalty: 0,
        extraLifePenaltySeconds: 30,
        hourglassBonusSeconds: 20
    },
    reward: {
        comboRequired: 3,
        comboWindowMs: 120000,
        spinDurationMs: 1800,
        spinTickMs: 110
    },
    gameplay: {
        questionsPerRun: 10
    },
    defaultRooms: [
        { id: "sala1", nome: "Sala 1", ordem: 1 },
        { id: "sala2", nome: "Sala 2", ordem: 2 },
        { id: "sala3", nome: "Sala 3", ordem: 3 },
        { id: "sala4", nome: "Sala 4", ordem: 4 }
    ],
    difficulty: {
        facil: { label: "Fácil", initialLives: 5, scoreMultiplier: 1 / 3 },
        normal: { label: "Normal", initialLives: 3, scoreMultiplier: 2 / 3 },
        hardcore: { label: "Hardcore", initialLives: 1, scoreMultiplier: 1 }
    },
    items: {
        bussola: {
            label: "Bussola",
            description: "Revela a dica extra da charada atual."
        },
        lupa: {
            label: "Lupa",
            description: "Marca 2 alternativas erradas na questão atual."
        },
        escudo: {
            label: "Escudo",
            description: "Anula o próximo erro de resposta."
        },
        ampulheta: {
            label: "Ampulheta",
            description: "Reduz 20 segundos do cronômetro."
        },
        chaveMestra: {
            label: "Chave Mestra",
            description: "Abre a próxima questão sem precisar do código."
        }
    }
};

const app = initializeApp(CONFIG.firebase);

export const db = getFirestore(app);
export const auth = getAuth(app);
