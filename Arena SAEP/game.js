import { auth, CONFIG, db } from "./game-config.js";
import { createAuthService } from "./game-auth.js";
import { createRoomService } from "./room-service.js";
import { createChallengeService } from "./challenge-service.js";
import { createDom } from "./game-dom.js";
import { createDefaultInventory, createState } from "./game-state.js";
import { createUtils } from "./game-utils.js";
import { createAudio } from "./game-audio.js";
import { createTimer } from "./game-timer.js";
import { createUI } from "./game-ui.js";
import { createRunService } from "./game-run-service.js";
import { createCombo } from "./game-combo.js";
import { createParser } from "./game-parser.js";
import { createScore } from "./game-score.js";
import { createItems } from "./game-items.js";
import { createFlow } from "./game-flow.js";
import { createBoot } from "./game-boot.js";

const dom = createDom();
const state = createState(CONFIG);
const AuthService = createAuthService({ auth, db, CONFIG, state });
const RoomService = createRoomService({ db, CONFIG, state });
const ChallengeService = createChallengeService({ db, CONFIG, AuthService });
const Utils = createUtils({ CONFIG, state });
const Audio = createAudio();
const UI = createUI({ dom, state, CONFIG, Utils });
const Timer = createTimer({ state, UI });
const RunService = createRunService({ db, CONFIG, state, Utils, UI, Timer });
const Parser = createParser({ Utils });
const Score = createScore({ CONFIG, state, Utils });
const Items = createItems({ dom, state, CONFIG, Utils, UI, Timer, RunService });
const Combo = createCombo({ CONFIG, state, Items });
const Flow = createFlow({
    auth,
    db,
    dom,
    state,
    CONFIG,
    Utils,
    UI,
    Audio,
    Timer,
    AuthService,
    RoomService,
    ChallengeService,
    RunService,
    Combo,
    Parser,
    Score,
    createDefaultInventory
});
const Boot = createBoot({ db, dom, state, CONFIG, UI, Flow, Items, RunService, AuthService, RoomService, ChallengeService });

UI.setDependencies({ Items, Flow, Timer });

Boot.bindEvents();
Boot.init();
