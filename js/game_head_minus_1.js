/**
 * ?뱼 移섑궓 ??- 理쒖쥌 ?듯빀 諛?UI ?곗텧/?깃?紐⑤뱶 濡쒖쭅 ?섏젙 踰꾩쟾
 */

// [?ㅼ씠踰?濡쒓렇???앹뾽???좏겙 ?꾨떖 濡쒖쭅]
if (window.location.hash.includes('access_token')) {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    
    // ??李쎌씠 ?앹뾽李쎌씤吏 ?뺤씤?섍퀬 遺紐?李쎌쑝濡??좏겙 ?꾨떖
    if (window.opener) {
        window.opener.postMessage({ type: 'NAVER_LOGIN', token: token }, '*');
        window.close(); // ?앹뾽 ?リ린
    }
    // ?슚 [異붽??? ?앹뾽李쎌뿉?쒕뒗 ???댁긽 ?꾨옒履쎌쓽 寃뚯엫 濡쒖쭅???ㅽ뻾?섏? ?딅룄濡?媛뺤젣濡?硫덉땅?덈떎!
    throw new Error("?앹뾽李?泥섎━瑜??꾨즺?섍퀬 ?ㅽ겕由쏀듃瑜?以묒??⑸땲?? (?뺤긽?곸씤 ?숈옉?낅땲??");
}

// [1. ?꾩뿭 蹂??諛?寃뚯엫 ?ㅼ젙]
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const GAME_WIDTH = 1248;
const GAME_HEIGHT = 820;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

const STATE = { IDLE: 'idle', PLAYING: 'playing', PAUSED: 'paused', CRASHED: 'crashed', GAMEOVER: 'gameover' };
let gameState = STATE.PLAYING;
let gameFrame = 0;
let score = 0;
let level = 1; // [?좉퇋] ?덈꺼 蹂??
let myScores = []; // ??湲곕줉 諛곗뿴
let bestScore = 0; // 理쒓퀬 湲곕줉 (myScores?먯꽌 ?뚯깮)
let top100Scores = []; // Top 100 ?붾? ?곗씠??
let nextLevelFrameThreshold = 600; // [?섏젙] ?쒖씠???곸듅 湲곗? (?꾨젅???⑥쐞, 600?꾨젅????10珥?
let currentGameMode = 'single';
let isGameReady = false;
let gameLoopId = null; 
let isSoundOn = true; // [?좉퇋] ?ъ슫???곹깭 (true: ON, false: OFF)
let isLoggedIn = false; // [?좉퇋] 濡쒓렇???곹깭
let currentUser = null; // [?좉퇋] 濡쒓렇?명븳 ?ъ슜???뺣낫
let unsubscribeUserData = null; // [?좉퇋] ?좎? ?곗씠??由ъ뒪???댁젣 ?⑥닔
let guestCoins = parseInt(localStorage.getItem('chickenRunGuestCoins') || '10'); // [FIX] ??젣?섏뿀??寃뚯뒪??肄붿씤 蹂??蹂듭썝
let multiGamePlayers = []; // [?좉퇋] 硫?고뵆?덉씠 李몄뿬??紐⑸줉
let unsubscribeParticipantsListener = null; // [?좉퇋] 硫?고뵆?덉씠 李멸????ㅼ떆媛?由ъ뒪??
let autoActionTimer = null; // [?좉퇋] ?먮룞 ?≪뀡 ??대㉧
let lastFirestoreUpdateTime = 0; // [3?④퀎] Firestore ?낅뜲?댄듃 ?곕줈?留곸슜
const FIRESTORE_UPDATE_INTERVAL = 1000; // [3?④퀎] 1珥?媛꾧꺽?쇰줈 ?낅뜲?댄듃
let isJumpPressed = false; // [?좉퇋] ?먰봽 踰꾪듉 ?꾨쫫 ?곹깭 ?좎? 蹂??
let displayedMyRecordsCount = 20; // [?좉퇋] ??湲곕줉 ?쒖떆 媛쒖닔 (臾댄븳 ?ㅽ겕濡ㅼ슜)

// [?섏젙] 愿由ъ옄 ?앸퀎 諛⑹떇???대찓?쇱뿉??UID濡?蹂寃쏀빀?덈떎.
// ?꾨옒 諛곗뿴??Firebase Console > Authentication?먯꽌 ?뺤씤??愿由ъ옄 怨꾩젙??UID瑜?異붽??섏꽭??
const ADMIN_UIDS = ["zq4jlJbH47ZEasqIxNFVVhZIqwv1"]; // ?? "Abc123xyz..."

// [?섏젙] ?섏씠吏?ㅼ씠??Pagination) ?ㅼ젙: 1留뚭컻 ?댁긽??諛⑹씠 ?덉뼱???깆씠 ?먰솢?섍쾶 ?숈옉?섎룄濡??⑸땲??
let lastVisibleRoomDoc = null; // 留덉?留됱쑝濡?遺덈윭??諛⑹쓽 臾몄꽌 李몄“
let isFetchingRooms = false;   // 諛?紐⑸줉??遺덈윭?ㅻ뒗 以묒씤吏 ?щ? (以묐났 ?몄텧 諛⑹?)
let currentRoomLimit = 5;     // [?좉퇋] ?꾩옱 遺덈윭??諛⑹쓽 媛쒖닔 (limit)
let currentMyRoomLimit = 10;   // [?좉퇋] 李멸?以???쓽 紐⑸줉 ?몄텧 媛쒖닔 (limit)
let unsubscribeRoomListener = null; // [?좉퇋] ?ㅼ떆媛?由ъ뒪???댁젣 ?⑥닔
const ROOMS_PER_PAGE = 5;     // ??踰덉뿉 遺덈윭??諛⑹쓽 媛쒖닔
let allRoomsLoaded = false;    // 紐⑤뱺 諛⑹쓣 ??遺덈윭?붾뒗吏 ?щ? (?붾낫湲?踰꾪듉 ?쒖떆 ?쒖뼱)
let myRooms = [];              // [?좉퇋] 李멸?以묒씤 諛?紐⑸줉 ?곗씠??蹂꾨룄 ???

// [?좉퇋] 愿묎퀬 ?쒖뒪???ㅼ젙
const AD_CONFIG = {
    REWARD: 5,      // 1?뚮떦 吏湲?肄붿씤
    DAILY_LIMIT: 10, // ?쇱씪 理쒕? ?쒖껌 ?잛닔
    DURATION: 10000  // [?좉퇋] 愿묎퀬 ?쒖껌 ?쒓컙 (10珥? ms ?⑥쐞)
};

// [?곗씠?? 諛??뺣낫 諛??꾩옱 吏꾪뻾 ?곹깭
let currentRoom = null;
let targetRoom = null; // [?좉퇋] 鍮꾨?踰덊샇 ?낅젰 以묒씤 ???諛?
// [?섏젙] ?뚯뒪???쒕굹由ъ삤 ?ㅺ컖?붾? ?꾪빐 ?덉씠?ㅻ８ ?곗씠???뺤옣
// [?섏젙] usedAttempts ?띿꽦???쒓굅?⑸땲?? ???뺣낫???댁젣 ?ъ슜?먮퀎濡?currentUser.joinedRooms????λ맗?덈떎.
let raceRooms = [
    { id: 1, title: "??援ъ뿭??誘몄튇 ??紐⑥뿬??", limit: 5, current: 3, attempts: 3, status: "inprogress", rankType: 'total' },
    { id: 2, title: "珥덈낫留??ㅼ꽭???쒕컻", limit: 5, current: 1, attempts: 5, status: "inprogress", rankType: 'best' },
    { id: 3, title: "鍮꾨???諛?(鍮꾨쾲:1234)", limit: 5, current: 0, attempts: 3, status: "inprogress", isLocked: true, password: "1234", rankType: 'best' },
    { id: 4, title: "?????먮━ ?⑥쓬! (?⑹궛)", limit: 10, current: 9, attempts: 2, status: "inprogress", rankType: 'total' },
    { id: 5, title: "理쒓퀬???쒗뙋 ?밸?", limit: 4, current: 1, attempts: 1, status: "inprogress", rankType: 'best' },
    { id: 6, title: "?κ린?? ?덇린?덈뒗 ??뱾???寃?, limit: 8, current: 2, attempts: 5, status: "inprogress", rankType: 'total' },
    { id: 7, title: "?꾩쟾??醫낅즺??諛?(?뚯뒪?몄슜)", limit: 5, current: 5, attempts: 3, status: "finished", rankType: 'best' }
];
let unlockedRoomIds = []; // [?좉퇋] 鍮꾨?踰덊샇 ?댁젣??諛?ID 紐⑸줉

// 臾쇰━ ?ㅼ젙
let baseGameSpeed = 10; // ??媛믪? 寃뚯엫 以묒뿉 ?먯감 利앷??⑸땲??
let gameSpeed = 10;
let speedMultiplier = 1;
const FRICTION = 0.96;
const GRAVITY = 1.2;
const JUMP_FORCE = 30;
const FLOOR_Y = GAME_HEIGHT - 124 - 128; 

// [2. 由ъ냼??濡쒕뵫]
const imageSources = {
    sky: 'assets/images/gamebg-sky.png', floor: 'assets/images/element_floor.png',
    chickenRun1: 'assets/images/chickenRun_01.png', chickenRun2: 'assets/images/chickenRun_02.png',
    chickenShock: 'assets/images/chicken_shock.png', chickenDead: 'assets/images/chicken_dead.png',
    eagle: 'assets/images/obstacle_eagle.png', dog1: 'assets/images/dogRun_01.png',
    dog2: 'assets/images/dogRun_02.png', dog3: 'assets/images/dogRun_03.png',
    fire1: 'assets/images/fireBurn_01.png', fire2: 'assets/images/fireBurn_02.png',
    fire3: 'assets/images/fireBurn_03.png', fire4: 'assets/images/fireBurn_04.png',
    fire5: 'assets/images/fireBurn_05.png', fire6: 'assets/images/fireBurn_06.png',
    // [?좉퇋] 源껎꽭 ?대?吏 異붽?
    featherLg: 'assets/images/feather_lg.png', featherMd: 'assets/images/feather_md.png', featherSm: 'assets/images/feather_sm.png'
};
const images = {};
let loadedCount = 0;
const totalImages = Object.keys(imageSources).length;
for (let key in imageSources) {
    images[key] = new Image(); images[key].src = imageSources[key];
    images[key].onload = () => { loadedCount++; if (loadedCount === totalImages) isGameReady = true; };
}
// [?좉퇋] ?ㅻ뵒??由ъ냼??濡쒕뵫
const audioSources = {
    bgm: 'assets/sounds/bgm.mp3',
    jump: 'assets/sounds/jump.mp3',
    crash: 'assets/sounds/chicken-cluking.mp3',
    feather: 'assets/sounds/feather.mp3',
    start: 'assets/sounds/game-start.mp3'
};
const audios = {};
for (let key in audioSources) {
    audios[key] = new Audio(audioSources[key]);
    if (key === 'bgm') { audios[key].loop = true; audios[key].volume = 0.2; } // [?섏젙] 諛곌꼍?뚯븙 蹂쇰ⅷ ?섑뼢 (0.5 -> 0.2)
}

// [3. 寃뚯엫 媛앹껜 ?대옒??

class ScrollingBackground {
    constructor(imageKey, speedRatio, width, height) {
        this.imageKey = imageKey; this.speedRatio = speedRatio; this.width = width; this.height = height; this.x = 0;
    }
    draw(yPosition) {
        const img = images[this.imageKey];
        if (!img || !img.complete) return;
        // [FIX] 寃뚯엫??'PLAYING' ?먮뒗 'CRASHED' ?곹깭????諛곌꼍???ㅽ겕濡ㅽ븯???먯뿰?ㅻ윭??媛먯냽 ?④낵瑜?以띾땲??
        if (gameState === STATE.PLAYING || gameState === STATE.CRASHED) {
            this.x -= gameSpeed * this.speedRatio;
            if (this.x <= -this.width) this.x = 0;
        }
        // [?섏젙] ?대?吏 猷⑦봽 ???덉깉媛 蹂댁씠吏 ?딅룄濡??덈퉬瑜??댁쭩(2px) ?섎젮??寃뱀튂寃?洹몃┰?덈떎.
        ctx.drawImage(img, this.x, yPosition, this.width + 2, this.height);
        ctx.drawImage(img, this.x + this.width, yPosition, this.width + 2, this.height);
    }
}
const skyBg = new ScrollingBackground('sky', 0.2, 1242, 696);
const floorBg = new ScrollingBackground('floor', 1.0, 1240, 124);

const chicken = {
    width: 128, height: 128, x: 100, y: FLOOR_Y, dy: 0, isJumping: false, frameDelay: 8, isBoosting: false, targetX: 100,
    boostProgress: 0, // [?좉퇋] 遺?ㅽ듃 寃뚯씠吏 (0~100)
    crashFrame: 0,
    update() {
        if (gameState === STATE.PLAYING) {
            if (this.isJumping) {
                this.y += this.dy; this.dy += GRAVITY;
                if (this.y > FLOOR_Y) { this.y = FLOOR_Y; this.dy = 0; this.isJumping = false; }
            } else {
                // [?좉퇋] 諛붾떏???덇퀬 ?먰봽 踰꾪듉???꾨Ⅴ怨??덉쑝硫??곗냽 ?먰봽
                if (isJumpPressed) {
                    this.jump();
                }
            }
            if (this.isBoosting) { 
                this.targetX = 550; this.frameDelay = 4; this.x += (this.targetX - this.x) * 0.008; 
                this.boostProgress = Math.min(100, this.boostProgress + 0.5); // [?섏젙] 遺?ㅽ듃 ??寃뚯씠吏 ?곸듅
            }
            else { 
                this.targetX = 100; this.frameDelay = 8; this.x += (this.targetX - this.x) * 0.005; 
                this.boostProgress = Math.max(0, this.boostProgress - 1); // [?섏젙] 誘몄궗????寃뚯씠吏 ?섎씫
            }
        } else if (gameState === STATE.CRASHED) {
            this.crashFrame++;
            this.y += this.dy; this.dy += GRAVITY;
            if (this.y >= FLOOR_Y) { this.y = FLOOR_Y; this.dy = 0; }
        }
    },    
    draw() {
        let sprite;
        if (gameState === STATE.PLAYING) {
            sprite = (Math.floor(gameFrame / this.frameDelay) % 2 === 0) ? images.chickenRun1 : images.chickenRun2;
        } else if (gameState === STATE.CRASHED) {
            sprite = (this.crashFrame < 15) ? images.chickenShock : images.chickenDead;
        } else if (gameState === STATE.GAMEOVER) {
            sprite = images.chickenDead;
        } else {
            // [FIX] IDLE(以鍮?, PAUSED(?쇱떆?뺤?) ?곹깭?먯꽌??湲곕낯 ?щ━湲??먯꽭濡?蹂댁씠?꾨줉 ?섏젙
            sprite = images.chickenRun1;
        }
        if (sprite && sprite.complete) ctx.drawImage(sprite, this.x, this.y, this.width, this.height);
    },
    jump() { if (!this.isJumping && gameState === STATE.PLAYING) { this.isJumping = true; this.dy = -JUMP_FORCE; playSound('jump'); } },
    /**
     * [?좉퇋] ?먰봽瑜?以묎컙??硫덉텛???⑥닔.
     * ?곸듅 以묒씪 ??dy < 0) ?몄텧?섎㈃, ?곸듅 ?띾룄瑜?以꾩뿬 ??? ?먰봽瑜?留뚮벊?덈떎.
     */
    cutJump() {
        // ?곸듅 ?띾룄媛 ?쇱젙 媛??댁긽???뚮쭔 ?곸슜?섏뿬 ?덈Т ??? ?먰봽媛 ?섎뒗 寃껋쓣 諛⑹?
        // [?섏젙] -20? ?덈Т ??퀬, -25???덈Т ?믩떎???쇰뱶諛깆쓣 諛섏쁺?섏뿬 以묎컙媛믪씤 -22濡?議곗젙
        // ?곷떦???믪씠?????먰봽(?뚯젏??媛 媛?ν븯?꾨줉 ?ㅼ젙
        if (this.dy < -17) { this.dy = -17; }
    }
};

class Dog {
    constructor() {
        this.width = 320; this.height = 144; this.initialX = -350; this.x = this.initialX; this.y = GAME_HEIGHT - 124 - 144;
        this.frame = 0; this.frameDelay = 5; this.targetX = this.initialX; 
    }
    update() {
        if (gameState !== STATE.PLAYING) { this.targetX = this.initialX; this.x += (this.targetX - this.x) * 0.05; }
        else {
            if (chicken.isBoosting) { this.targetX = 50; this.x += (this.targetX - this.x) * 0.008; }
            else { this.targetX = this.initialX; this.x += (this.targetX - this.x) * 0.04; }
        }
        this.frame++;
    }
    draw() {
        let frameIndex = (Math.floor(this.frame / this.frameDelay) % 3) + 1;
        let sprite = images['dog' + frameIndex];
        if (sprite && sprite.complete) ctx.drawImage(sprite, this.x, this.y, this.width, this.height);
    }
}
const dog = new Dog();

class Obstacle {
    constructor(type) {
        this.type = type; this.markedForDeletion = false;
        if (type === 'fire') {
            this.width = 168; this.height = 168; this.y = GAME_HEIGHT - 124 - 168;
            this.frame = 0; this.maxFrame = 6; this.frameDelay = 4; 
            // [?섏젙] 遺덇퐙 ?μ븷臾쇱쓽 ?먯젙 踰붿쐞瑜?以꾩뿬??width: 80->50) ?쇳븯湲??쎄쾶 議곗젙
            this.hitbox = { xOffset: 60, yOffset: 40, width: 50, height: 100 };
        } else {
            this.width = 280; this.height = 144; this.y = GAME_HEIGHT - 124 - 168 - 120; 
            this.frame = 0; this.hitbox = { xOffset: 20, yOffset: 40, width: 240, height: 60 };
        }
        this.x = GAME_WIDTH;
    }
    update() {
        if (this.type === 'eagle') this.x -= (gameSpeed + 7); // [?섏젙] ?낆닔由ш? 寃뚯엫 ?띾룄蹂대떎 ??긽 鍮좊Ⅴ寃??좎븘??
        else this.x -= gameSpeed;
        this.frame++;
        if (this.x < -this.width) this.markedForDeletion = true;
    }
    draw() {
        if (this.type === 'fire') {
            let frameIndex = (Math.floor(this.frame / this.frameDelay) % this.maxFrame) + 1;
            let sprite = images['fire' + frameIndex];
            if (sprite) ctx.drawImage(sprite, this.x, this.y, this.width, this.height);
        } else if (images.eagle) {
            ctx.drawImage(images.eagle, this.x, this.y, this.width, this.height);
        }
    }
}

let obstacles = [];
let feathers = []; // [?좉퇋] 源껎꽭 ?뚰떚??諛곗뿴
let obstacleTimer = 0;

// [?좉퇋] 源껎꽭 ?뚰떚???대옒??
class Feather {
    constructor(x, y) {
        this.x = x; this.y = y;
        const types = ['featherLg', 'featherMd', 'featherSm'];
        this.imageKey = types[Math.floor(Math.random() * types.length)];
        
        // ??컻?섎벏 ?쇱???珥덇린 ?띾룄 (?щ갑?쇰줈 ?쇱쭚)
        const angle = Math.random() * Math.PI * 2;
        const speed = 5 + Math.random() * 15;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - 1; // [?섏젙] ?꾩そ?쇰줈 ?잕뎄移섎뒗 ?섏쓣 以꾩엫 (-5 -> -2)
        
        this.gravity = 0.4; // 媛蹂띻쾶 ?⑥뼱吏?꾨줉 ??? 以묐젰
        this.friction = 0.94; // 怨듦린 ???
        
        this.rotation = Math.random() * 360;
        this.rotationSpeed = (Math.random() - 0.5) * 15; // 鍮숆?鍮숆? ?뚯쟾
        
        this.scale = 0.4 + Math.random() * 0.6; // ?ш린 ?쒕뜡
        this.opacity = 1;
        this.fadeSpeed = 0.01 + Math.random() * 0.02; // 泥쒖쿇???щ씪吏?
        
        this.flip = Math.random() < 0.5 ? 1 : -1; // [?듭떖] 醫뚯슦 諛섏쟾 (1: ?먮낯-?쇱そ, -1: 諛섏쟾-?ㅻⅨ履?
        
        // 醫뚯슦 ?붾뱾由?(Sway) - ?⑥뼱吏????대옉嫄곕━???④낵
        this.swayPhase = Math.random() * Math.PI * 2;
        this.swaySpeed = 0.1;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.vx *= this.friction;
        
        // 怨듦린 ???쑝濡??명븳 醫뚯슦 ?붾뱾由?異붽?
        this.x += Math.sin(this.swayPhase) * 2;
        this.swayPhase += this.swaySpeed;
        
        this.rotation += this.rotationSpeed;
        this.opacity -= this.fadeSpeed;
    }
    draw() {
        if (this.opacity <= 0) return;
        const img = images[this.imageKey];
        if (!img || !img.complete) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.opacity);
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation * Math.PI / 180);
        ctx.scale(this.scale * this.flip, this.scale); // 醫뚯슦 諛섏쟾 ?곸슜
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
    }
}

function createFeatherExplosion(x, y) {
    // 異⑸룎 ??15~25媛쒖쓽 源껎꽭 ?앹꽦
    const count = 15 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
        feathers.push(new Feather(x, y));
    }
    playSound('feather'); // [?좉퇋] 源껎꽭 ?④낵???ъ깮
}

function handleObstacles() {
    if (gameState === STATE.PLAYING) {
        obstacleTimer += speedMultiplier;
        // [?섏젙] ?μ븷臾?鍮덈룄 利앷? (湲곗〈: 110+60 -> 80+50) - ?붾㈃?????먯＜ ?깆옣?섎룄濡?議곗젙
        if (obstacleTimer > 80 + Math.random() * 50) {
            obstacleTimer = 0; // ??대㉧瑜?利됱떆 由ъ뀑

            // [?섏젙] 蹂듯빀 ?⑦꽩 ?깆옣 ?쒖젏??3000?먯뿉??1000?먯쑝濡??욌떦源
            if (score > 1000) {
                const patternType = Math.random();
                if (patternType < 0.25) { // 25% ?뺣쪧: ?⑥씪 遺덇퐙
                    obstacles.push(new Obstacle('fire'));
                } else if (patternType < 0.5) { // 25% ?뺣쪧: ?⑥씪 ?낆닔由?
                    obstacles.push(new Obstacle('eagle'));
                } else if (patternType < 0.75) { // 25% ?뺣쪧: ?댁쨷 遺덇퐙 (遺숈쓬 - 湲??먰봽濡??뚰뵾)
                    const fire1 = new Obstacle('fire');
                    const fire2 = new Obstacle('fire');
                    // [?섏젙] 媛꾧꺽???볧???140) ??踰덉쓽 湲??먰봽濡??섎룄濡??좊룄
                    fire2.x = fire1.x + 140;
                    obstacles.push(fire1, fire2);
                } else { // 25% ?뺣쪧: ?⑥뼱吏??댁쨷 遺덇퐙 (吏㏐쾶 ??踰??곗냽 ?먰봽)
                    const fire1 = new Obstacle('fire');
                    const fire2 = new Obstacle('fire');
                    // [?섏젙] 媛꾧꺽??醫곹???260) 李⑹? ??利됱떆 ?ㅼ떆 ?곗뼱????(?곕떏!)
                    fire2.x = fire1.x + 260;
                    obstacles.push(fire1, fire2);
                    obstacleTimer = -20; // ?⑦꽩 湲몄씠 蹂댁젙
                }
            } else {
                // 1000??誘몃쭔???뚮뒗 湲곕낯 ?μ븷臾쇰쭔 ?깆옣 (50% ?뺣쪧)
                obstacles.push(new Obstacle(Math.random() < 0.5 ? 'fire' : 'eagle'));
            }
        }
    }
    obstacles.forEach(obs => {
        obs.update(); obs.draw();
        if (gameState === STATE.PLAYING) {
            const pX = chicken.x + 30, pY = chicken.y + 30, pW = chicken.width - 60, pH = chicken.height - 40;
            const oX = obs.x + obs.hitbox.xOffset, oY = obs.y + obs.hitbox.yOffset, oW = obs.hitbox.width, oH = obs.hitbox.height;
            if (pX < oX + oW && pX + pW > oX && pY < oY + oH && pY + pH > oY) {
                gameState = STATE.CRASHED;
                chicken.crashFrame = 0;
                // [?좉퇋] 源껎꽭 ??컻 ?④낵 ?앹꽦
                createFeatherExplosion(chicken.x + chicken.width / 2, chicken.y + chicken.height / 2);
                chicken.dy = -5;
                playSound('crash'); // [?좉퇋] 異⑸룎 ?④낵???ъ깮
            }
        }
    });
    obstacles = obstacles.filter(obs => !obs.markedForDeletion);
}

// [4. ?듭떖 ?쒖뼱 ?⑥닔]

/**
 * [?좉퇋] 肄붿씤 UI ?낅뜲?댄듃 ?⑥닔
 * ?꾨줈??紐⑤떖, 寃뚯엫 ?ㅻ쾭?덉씠(?쒖옉/?쇱떆?뺤?/醫낅즺)??肄붿씤 ?섏튂瑜??숆린?뷀빀?덈떎.
 */
function updateCoinUI() {
    // [?섏젙] 濡쒓렇???щ????곕씪 肄붿씤 ?쒖떆 (寃뚯뒪??肄붿씤 吏??
    const coinVal = currentUser ? currentUser.coins : guestCoins;
    if (document.getElementById('profile-coin-count')) document.getElementById('profile-coin-count').innerText = coinVal;
    document.querySelectorAll('.coin-stat strong').forEach(el => {
        el.innerText = coinVal;
    });
    // [?좉퇋] 肄붿씤 蹂?????좎? ?뺣낫 ???(?곸냽???좎?)
    // [?좉퇋] 愿묎퀬 踰꾪듉 ?띿뒪???낅뜲?댄듃 (?⑥? ?잛닔 ?쒖떆)
    const btnRecharge = document.getElementById('btn-recharge-coin');
    if (btnRecharge) {
        const adData = getAdData();
        btnRecharge.innerText = `異⑹쟾 (${adData.count}/${AD_CONFIG.DAILY_LIMIT})`;
    }
}

/**
 * [?좉퇋] 寃뚯엫 ?쒖옉/?ъ떆??踰꾪듉??肄붿씤 鍮꾩슜 ?쒖떆瑜??낅뜲?댄듃?⑸땲??
 */
function updateButtonCosts() {
    const startCostVal = document.querySelector('#btn-race-start .play-cost strong');
    const restartCostSpan = document.querySelector('#btn-restart .play-cost');
    const restartCostVal = document.querySelector('#btn-restart .play-cost strong');

    if (currentGameMode === 'single') {
        if (startCostVal) startCostVal.innerText = '1';
        if (restartCostSpan) restartCostSpan.style.display = 'flex';
        if (restartCostVal) restartCostVal.innerText = '1';
    } else if (currentGameMode === 'multi' && currentRoom) {
        // 硫?곕え?? ?쒖옉 踰꾪듉?먮뒗 諛??ㅼ젙 ?쒖쓽 ?쒕룄 ?잛닔(鍮꾩슜) ?쒖떆
        // [?섏젙] ?대? 吏遺덊뻽?붿? ?뺤씤?섏뿬 鍮꾩슜 ?쒖떆 (吏遺덊뻽?쇰㈃ 0)
        const userRoomState = (currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[currentRoom.id] : null;
        const cost = (userRoomState && userRoomState.isPaid) ? 0 : currentRoom.attempts;
        if (startCostVal) startCostVal.innerText = cost;
        // 硫?곕え?? ?ъ떆??踰꾪듉?먯꽌??肄붿씤 ?쒖떆 ?④? (?대? 吏遺덈맖)
        if (restartCostSpan) restartCostSpan.style.display = 'none';
    }
}

/**
 * [?좉퇋] 寃뚯엫 而⑦듃濡ㅻ윭???쒖떆 ?곹깭瑜??ㅼ젙?섍퀬, 洹몄뿉 ?곕씪 #scene-game???대옒?ㅻ? ?좉??⑸땲??
 * @param {boolean} visible - 而⑦듃濡ㅻ윭瑜??쒖떆?좎? ?щ?
 */
function setControlsVisibility(visible) {
    const controlContainer = document.getElementById('control-container');
    const sceneGame = document.getElementById('scene-game');
    if (controlContainer && sceneGame) {
        if (visible) {
            controlContainer.classList.remove('slide-out');
            sceneGame.classList.remove('controls-hidden');
        } else {
            controlContainer.classList.add('slide-out');
            sceneGame.classList.add('controls-hidden');
        }
    }
}

/**
 * [?좉퇋] 硫?고뵆?덉씠 醫낅즺 ???쒖쐞???곕Ⅸ 諭껋? 吏湲?諛????
 */
function awardBadgeIfEligible() {
    if (!isLoggedIn || !currentUser || currentGameMode !== 'multi' || !currentRoom) return;

    // [?좉퇋] 4???댁긽 李몄뿬??寃뚯엫?먯꽌留?諭껋? 吏湲?
    if (multiGamePlayers.length < 4) return;

    const myId = currentUser.id;
    const isTotalMode = currentRoom.rankType === 'total';

    const sortedPlayers = [...multiGamePlayers].map(p => {
        let displayScore = 0;
        if (isTotalMode) {
            displayScore = p.totalScore + (p.status === 'playing' ? p.score : 0);
        } else {
            displayScore = Math.max(p.bestScore, p.score);
        }
        return { ...p, displayScore };
    }).sort((a, b) => b.displayScore - a.displayScore);

    const myRank = sortedPlayers.findIndex(p => p.id === myId) + 1;
    if (myRank >= 1 && myRank <= 3) {
        currentUser.badges[myRank] = (currentUser.badges[myRank] || 0) + 1;
        saveUserDataToFirestore();
    }
}

// [?좉퇋] ?ъ슫???ъ깮 ?ы띁 ?⑥닔
function playSound(key) {
    if (!isSoundOn || !audios[key]) return;
    if (key === 'bgm') {
        audios[key].play().catch((e) => console.warn('BGM ?ъ깮 ?ㅽ뙣:', e));
    } else {
        const sound = audios[key].cloneNode();
        if (key === 'jump') {
            sound.volume = 0.1; // [?섏젙] ?먰봽 ?뚮━媛 而ㅼ꽌 蹂꾨룄濡?以꾩엫
        } else if (key === 'crash' || key === 'feather' || key === 'start') {
            sound.volume = 0.8; // [?섏젙] 異⑸룎 諛?源껎꽭 ?뚮━?????ㅻ━寃??ㅼ?
        } else {
            sound.volume = 0.1; // [?섏젙] 洹????④낵?뚮룄 ?쎄컙 以꾩엫
        }
        sound.play().catch((e) => console.warn('?④낵???ъ깮 ?ㅽ뙣:', e));
    }
}
function pauseBGM() {
    if (audios['bgm']) audios['bgm'].pause();
}
function stopBGM() {
    if (audios['bgm']) { audios['bgm'].pause(); audios['bgm'].currentTime = 0; }
}

function clearAutoActionTimer() {
    if (autoActionTimer) {
        clearInterval(autoActionTimer);
        autoActionTimer = null;
    }
    // 紐⑤뱺 硫붿떆吏 ?④?
    document.querySelectorAll('.time-message').forEach(el => el.style.display = 'none');
}

function startAutoActionTimer(duration, type, selector) {
    // [?섏젙] ?대? ??대㉧媛 ?ㅽ뻾 以묒씤 寃쎌슦 (?? ?덊솕硫댁뿉 ?섍컮????寃쎌슦),
    // ??대㉧瑜??덈줈 ?쒖옉?섏? ?딄퀬, 硫붿떆吏留??ㅼ떆 蹂댁씠?꾨줉 泥섎━?⑸땲??
    // ?? 'deductAttempt' ??낆쓽 ??대㉧媛 ?대? ?ㅽ뻾 以묒씤??
    // ?ㅼ떆 'deductAttempt'濡??몄텧?섎뒗 寃쎌슦??(?? ??대㉧ 留뚮즺 ???ы샇異?
    // 湲곗〈 ??대㉧瑜??대━?댄븯怨??덈줈 ?쒖옉?댁빞 ?⑸땲??
    if (autoActionTimer && type === 'deductAttempt') {
        clearAutoActionTimer();
    }

    if (autoActionTimer) {
        const el = document.querySelector(selector);
        if (el) el.style.display = 'block';
        return;
    }
    const el = document.querySelector(selector);
    if (!el) return;
    
    el.style.display = 'block';
    let timeLeft = duration;
    
    const updateText = () => {
        if (type === 'exit') el.innerText = `${timeLeft}珥????먮룞 ?꾩썐`; // 濡쒕퉬 ?댁옣
        else if (type === 'deductAttempt') el.innerText = `${timeLeft}珥???1??李④컧`; // ?쒕룄 ?잛닔 李④컧
        else el.innerText = `${timeLeft}珥????먮룞 ?쒖옉`;
    };
    updateText();
    
    autoActionTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearAutoActionTimer();
            if (type === 'exit') {
                // [FIX] ?쒖옉 ?붾㈃ ??꾩븘?껋? '?꾩쟾 ?댁옣'?쇰줈 泥섎━?댁빞 ?⑸땲??
                exitToLobby(true);
            } else if (type === 'deductAttempt') { // [?좉퇋] ?쒕룄 ?잛닔 李④컧 濡쒖쭅
                if (currentGameMode === 'multi' && currentRoom) {
                    // [?섏젙] ?ъ슜?먮퀎 ?쒕룄 ?잛닔 李④컧
                    if (currentUser && currentUser.joinedRooms[currentRoom.id]) {
                        currentUser.joinedRooms[currentRoom.id].usedAttempts++;
                        saveUserDataToFirestore(); // [FIX] ?쒕룄 ?잛닔 蹂寃????쒕쾭??利됱떆 ???
                    }
                    const myId = currentUser ? currentUser.id : 'me';
                    handleGameOverUI(); // UI 媛깆떊 諛??ㅼ쓬 ??대㉧ ?쒖옉 ?먮뒗 寃뚯엫 ?ㅻ쾭 泥섎━
                }
            }
            else { // [湲곗〈] ?먮룞 ?쒖옉/?ш컻 (?쇱떆?뺤? ?붾㈃?먯꽌留??좏슚)
                if (gameState === STATE.PAUSED) togglePause();
                // [?섏젙] 寃뚯엫 ?ㅻ쾭 ?곹깭?먯꽌???먮룞 ?ъ떆?묓븯吏 ?딆쓬 (deductAttempt ??낆뿉??泥섎━)
                // else if (gameState === STATE.GAMEOVER) {
                //     const btnRestart = document.getElementById('btn-restart');
                //     if (btnRestart && btnRestart.style.display !== 'none') btnRestart.click();
                // }
            }        } else {
            updateText();
        }
    }, 1000);
}

function resetGame() {
    clearAutoActionTimer(); // [?좉퇋] ??대㉧ 珥덇린??
    gameState = STATE.IDLE; // [?섏젙] 珥덇린 ?곹깭瑜?IDLE(?湲?濡??ㅼ젙?섏뿬 遊??쒕??덉씠?섎쭔 ?섑뻾
    stopBGM(); // [?좉퇋] 由ъ뀑 ??BGM ?뺤? (?쒖옉 踰꾪듉 ?꾨? ???ъ깮)
    baseGameSpeed = 15; // [?섏젙] 湲곕낯 ?띾룄 ?곹뼢 (10 -> 12)
    gameSpeed = baseGameSpeed; 
    gameFrame = 0; 
    score = 0; 
    level = 1; // [?좉퇋] ?덈꺼 珥덇린??
    nextLevelFrameThreshold = 600; // [?섏젙] ?쒓컙 湲곗? 珥덇린??
    isJumpPressed = false; // [?섏젙] ?먰봽 ?낅젰 ?곹깭 利됱떆 珥덇린??
    obstacleTimer = 0;
    skyBg.x = 0; floorBg.x = 0; obstacles = []; feathers = []; // [?좉퇋] 源껎꽭 珥덇린??
    chicken.y = FLOOR_Y; chicken.dy = 0; chicken.x = 100; chicken.targetX = 100; 
    chicken.isBoosting = false; chicken.boostProgress = 0; chicken.crashFrame = 0; // [?섏젙] 遺?ㅽ듃 諛?寃뚯씠吏 利됱떆 珥덇린??
    dog.x = dog.initialX; dog.targetX = dog.initialX;
    
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('game-start-screen').classList.add('hidden');
    document.getElementById('game-pause-screen').classList.add('hidden');

    // [?섏젙] 踰꾪듉 UI???뚮┝ ?곹깭(CSS ?대옒?? 媛뺤젣 ?쒓굅
    const btnJump = document.getElementById('btn-jump');
    if (btnJump) btnJump.classList.remove('pressed');
    const btnBoost = document.getElementById('btn-boost');
    if (btnBoost) btnBoost.classList.remove('pressed');
    
    // HUD ?먯닔 珥덇린??
    const scoreEl = document.querySelector('.hud-score');
    const levelEl = document.querySelector('.hud-level');
    if (scoreEl) {
        scoreEl.querySelector('.score-val').innerText = '0';
        scoreEl.classList.remove('green', 'yellow', 'orange', 'red');
    }
    if (levelEl) levelEl.innerText = 'LV.' + level;
    
    // ?쇱떆?뺤? 踰꾪듉 ?꾩씠肄?珥덇린??
    const btnPauseToggle = document.getElementById('btn-pause-toggle');
    if (btnPauseToggle) btnPauseToggle.classList.remove('paused');
}

function drawStaticFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    skyBg.draw(0); floorBg.draw(GAME_HEIGHT - 124);
    dog.draw(); chicken.draw();
}

/**
 * [?좉퇋] Firebase Firestore???먯닔 ???
 */
function saveScoreToFirebase(finalScore) {
    const userNickname = (currentUser && currentUser.nickname) ? currentUser.nickname : "吏?섍???蹂묒븘由?;
    const uid = (currentUser && currentUser.id) ? currentUser.id : null;

    // Firebase Firestore???곗씠????ν븯湲?
    db.collection("rankings").add({
        uid: uid,
        nickname: userNickname,
        score: finalScore,
        timestamp: firebase.firestore.FieldValue.serverTimestamp() // ?쒕쾭 ?쒓컙 湲곕줉
    })
    .then((docRef) => {
        console.log("???먯닔媛 ?쒕쾭??湲곕줉?섏뿀?듬땲?? ID:", docRef.id);
    })
    .catch((error) => {
        console.error("???먯닔 ????ㅽ뙣:", error);
    });
}

function handleGameOverUI() {
    const govTitle = document.getElementById('gov-title');
    const govMsg = document.getElementById('gov-message');
    const btnRestart = document.getElementById('btn-restart');
    const btnDeleteRoom = document.getElementById('btn-delete-room');
    const govScreen = document.getElementById('game-over-screen');
    stopBGM(); // [?좉퇋] 寃뚯엫 ?ㅻ쾭 ??BGM ?뺤?

    if (currentGameMode === 'single') {
        const finalScore = Math.floor(score);
        
        // [?좉퇋] ?대쾲 湲곕줉??'??湲곕줉'?????
        saveMyScore(finalScore);
        saveScoreToFirebase(finalScore); // [?좉퇋] Firebase???먯닔 ???
        govTitle.innerText = "GAME OVER";
        govMsg.innerText = ``; // 湲곕줉 硫붿떆吏瑜??쒖떆?섏? ?딅룄濡?鍮꾩썙?〓땲??
        btnRestart.style.display = 'block';
        if (btnDeleteRoom) btnDeleteRoom.style.display = 'none';
    } else {
        if (!currentRoom) return;

        const myId = currentUser ? currentUser.id : 'me';
        const userUsedAttempts = (currentUser && currentUser.joinedRooms[currentRoom.id]) ? currentUser.joinedRooms[currentRoom.id].usedAttempts : 0;
        const myPlayer = multiGamePlayers.find(p => p.id === myId);
        if (!myPlayer) return;

        const participantDocRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(myId);

        // [FIX] myPlayer.attemptsLeft??onSnapshot???섑빐 ??뼱?곗뿬吏????덉쑝誘濡? 吏??蹂?섎줈 ?⑥? ?잛닔瑜?紐낇솗?섍쾶 怨꾩궛?섍퀬 ?ъ슜?⑸땲??
        const attemptsLeft = currentRoom.attempts - userUsedAttempts;
        
        // [FIX] 異⑸룎 吏곹썑 ?먯닔媛 NaN???섎뒗 臾몄젣 ?닿껐
        // 異⑸룎 ??score媛 NaN???섎뒗 寃쎌슦瑜?諛⑹??섍린 ?꾪빐 ?좏슚??寃??異붽?
        let validScore = score;
        if (isNaN(validScore)) validScore = 0;

        // [FIX] ??궧 ?쒖떆???먯닔(displayScore) 怨꾩궛
        // 湲곗〈?먮뒗 ?꾩옱 ???먯닔(validScore)瑜?displayScore濡???ν븯?? ?⑹궛 ?먯닔媛 ?꾨땶 留덉?留??먯닔留??쒖떆?섎뒗 臾몄젣媛 ?덉뿀?듬땲??
        let finalDisplayScore = 0;
        if (currentRoom.rankType === 'total') {
            finalDisplayScore = (myPlayer.totalScore || 0);
        } else {
            finalDisplayScore = (myPlayer.bestScore || 0);
        }

        if (attemptsLeft > 0) { // ?⑥? ?쒕룄 ?잛닔媛 ?덉쓣 寃쎌슦
            govTitle.innerText = "WOOPS!";
            govMsg.innerText = `?⑥? ?잛닔 : ${attemptsLeft}/${currentRoom.attempts}`;
            myPlayer.status = 'waiting'; // ?湲??곹깭濡?蹂寃?
            // [2?④퀎] Firestore ?곹깭 ?낅뜲?댄듃
            participantDocRef.update({ status: 'waiting' }).catch(e => console.error("?곹깭 ?낅뜲?댄듃 ?ㅽ뙣(waiting)", e));
            startAutoActionTimer(30, 'deductAttempt', '#game-over-screen .time-message'); // [?섏젙] 1??李④컧 ??대㉧ ?쒖옉
            btnRestart.style.display = 'block';
            if (btnDeleteRoom) btnDeleteRoom.style.display = 'none';
        } else {
            govTitle.innerText = "GAME OVER";
            govMsg.innerText = "紐⑤뱺 ?쒕룄 ?잛닔瑜??ъ슜?덉뒿?덈떎.";
            
            // [?좉퇋] 硫?고뵆?덉씠 ?곹깭 ?낅뜲?댄듃 (?덈씫/醫낅즺)
            if (myPlayer) myPlayer.status = 'dead';
            // [2?④퀎] Firestore ?곹깭 ?낅뜲?댄듃
            participantDocRef.update({ status: 'dead' }).catch(e => console.error("?곹깭 ?낅뜲?댄듃 ?ㅽ뙣(dead)", e));

            awardBadgeIfEligible(); // [?좉퇋] 紐⑤뱺 湲고쉶 ?뚯쭊 ??諭껋? ?섏뿬 ?먮떒

            btnRestart.style.display = 'none';
            if (btnDeleteRoom) btnDeleteRoom.style.display = 'block';
            // [?섏젙] ?섎쭔 ?앸궗?ㅺ퀬 ?댁꽌 諛??꾩껜瑜?醫낅즺 ?곹깭濡?蹂寃쏀븯吏 ?딆쓬
            // (紐⑤뱺 ?ъ슜?먭? ?꾨즺?댁빞 醫낅즺??- ?꾩옱???쒕??덉씠?섏씠誘濡??곹깭 ?좎?)
        }

        // [由ы뙥?좊쭅] 理쒖쥌 ?먯닔 ?낅뜲?댄듃 濡쒖쭅??if/else 釉붾줉 諛뽰쑝濡??대룞?섏뿬 以묐났???쒓굅?⑸땲??
        // ???쒖젏??myPlayer.totalScore? myPlayer.bestScore??gameLoop?먯꽌 留덉?留??먯쓽 ?먯닔媛 ?대? 諛섏쁺???곹깭?낅땲??
        participantDocRef.update({
            totalScore: myPlayer.totalScore,
            bestScore: myPlayer.bestScore,
            displayScore: finalDisplayScore
        }).then(() => {
            console.log(`??理쒖쥌 ?먯닔(${Math.floor(finalDisplayScore)})瑜??쒕쾭????ν뻽?듬땲??`);
        }).catch(error => {
            console.error("??理쒖쥌 ?먯닔 ?쒕쾭 ????ㅽ뙣:", error);
        });
    }

    govScreen.classList.remove('hidden');
    setControlsVisibility(false); // [?섏젙] 寃뚯엫 醫낅즺 ??而⑦듃濡?踰꾪듉 ?④?

    renderRoomLists(); 
    renderMultiRanking(); // [?좉퇋] 寃뚯엫 ?ㅻ쾭 ????궧 利됱떆 媛깆떊
}

/**
 * [3?④퀎] 硫?고뵆?덉씠 寃뚯엫 ?곹깭瑜??ㅼ떆媛꾩쑝濡?泥섎━?섍퀬 Firestore? ?숆린?뷀빀?덈떎.
 * ???⑥닔??gameLoop ?댁뿉???몄텧?⑸땲??
 */
function handleMultiplayerTick() {
    if (currentGameMode !== 'multi' || !currentRoom || !currentUser) return;

    // 1. 理쒖쥌 寃곌낵媛 ?뺤젙??諛⑹? ???댁긽 ?낅뜲?댄듃?섏? ?딆뒿?덈떎.
    if (currentRoom.status === 'finished') return;

    const now = Date.now();
    const myId = currentUser.id;
    const isHost = currentUser.id === currentRoom.creatorUid;
    const isAdmin = currentUser && currentUser.isAdmin; // [?좉퇋] 愿由ъ옄 ?щ? ?뺤씤
    const participantsRef = db.collection('rooms').doc(currentRoom.id).collection('participants');

    // 2. ?뚮젅?댁뼱 ?먯떊??濡쒖뺄 ?먯닔瑜?利됱떆 ?낅뜲?댄듃?⑸땲?? (UI 諛섏쓳?깆슜)
    const myPlayer = multiGamePlayers.find(p => p.id === myId);
    // [FIX] playing 肉먮쭔 ?꾨땲??crashed ?곹깭?먯꽌???먯닔 ?숆린??(onSnapshot?쇰줈 媛앹껜媛 援먯껜?섏뼱???먯닔 ?좎?)
    if (myPlayer && (gameState === STATE.PLAYING || gameState === STATE.CRASHED)) {
        myPlayer.score = score;
    }

    // 3. Firestore ?낅뜲?댄듃 (?곕줈?留??곸슜)
    if (now - lastFirestoreUpdateTime > FIRESTORE_UPDATE_INTERVAL) {
        lastFirestoreUpdateTime = now;
        const batch = db.batch();

        // 3a. ???뺣낫 ?낅뜲?댄듃 (?닿? ?뚮젅??以묒씪 ?뚮쭔)
        // [FIX] CRASHED ?곹깭?먯꽌???낅뜲?댄듃 ?덉슜 (status??濡쒖뺄?먯꽌 ?꾩쭅 playing?????덉쓬)
        if (myPlayer && (myPlayer.status === 'playing' || myPlayer.status === 'waiting')) {
            const myDocRef = participantsRef.doc(myId);
            
            // [FIX] NaN 臾몄젣 ?닿껐: onSnapshot?쇰줈 ??뼱?곗뿬吏????덈뒗 myPlayer.score ???
            // ??긽 理쒖떊 ?곹깭???꾩뿭 蹂??score瑜?吏곸젒 ?ъ슜?섏뿬 怨꾩궛?⑸땲??
            const currentRunScore = (typeof score === 'number' && !isNaN(score)) ? score : 0;
            
            const displayScore = (currentRoom.rankType === 'total')
                ? (myPlayer.totalScore || 0) + currentRunScore
                : Math.max((myPlayer.bestScore || 0), currentRunScore);
            
            // NaN 泥댄겕 ??displayScore留??낅뜲?댄듃 (status ?낅뜲?댄듃???ㅻⅨ 怨녹뿉???대떦)
            if (!isNaN(displayScore)) {
                batch.update(myDocRef, {
                    displayScore: Math.floor(displayScore)
                });
            }
        }

        // 3b. 遊??뺣낫 ?낅뜲?댄듃 (諛⑹옣留??섑뻾)
        // 3b. 遊??뺣낫 ?낅뜲?댄듃 (諛⑹옣 ?먮뒗 愿由ъ옄 ?섑뻾)
        if (isHost || isAdmin) {
            // [FIX] 遊??쒕??덉씠??濡쒖쭅??onSnapshot???섑븳 '湲곗뼲?곸떎'??媛뺥븯?꾨줉 ?섏젙?⑸땲??
            // 濡쒖뺄 諛곗뿴??吏곸젒 ?섏젙?섎뒗 ??? ?꾩옱 ?곹깭瑜??쎌뼱 ?ㅼ쓬 ?곹깭瑜?怨꾩궛?섍퀬 ?쒕쾭???낅뜲?댄듃?⑸땲??
            multiGamePlayers.forEach(bot => {
                if (!bot.isBot || bot.status === 'dead') return;

                let { status, score, totalScore, bestScore, attemptsLeft, startDelay, targetScore } = bot;
                score = score || 0;
                totalScore = totalScore || 0;
                bestScore = bestScore || 0;
                startDelay = startDelay || 0;
                targetScore = targetScore || 1500;
                attemptsLeft = attemptsLeft !== undefined ? attemptsLeft : currentRoom.attempts;

                if (status === 'waiting') {
                    startDelay -= (FIRESTORE_UPDATE_INTERVAL / 16.67);
                    if (startDelay <= 0) status = 'playing';
                } else if (status === 'playing') {
                    score += baseGameSpeed * 0.05 * (bot.speedFactor || 1) * (FIRESTORE_UPDATE_INTERVAL / 16.67);
                    if (score >= targetScore) {
                        attemptsLeft -= 1;
                        if (currentRoom.rankType === 'total') totalScore += score;
                        else bestScore = Math.max(bestScore, score);
                        score = 0;
                        targetScore = 750 + Math.floor(Math.random() * 1500); // [?섏젙] 遊?紐⑺몴 ?먯닔 ?섑뼢 議곗젙
                        if (attemptsLeft > 0) {
                            status = 'waiting';
                            startDelay = 60 + Math.floor(Math.random() * 120);
                        } else {
                            status = 'dead';
                        }
                    }
                }

                const botDisplayScore = (currentRoom.rankType === 'total') ? totalScore + score : Math.max(bestScore, score);
                
                // [FIX] NaN ?먯닔媛 ?곗씠?곕쿋?댁뒪??湲곕줉?섎뒗 寃껋쓣 諛⑹??⑸땲??
                if (isNaN(botDisplayScore)) {
                    console.error("Bot display score is NaN! Skipping update for bot:", bot.id);
                    return;
                }

                const botDocRef = participantsRef.doc(bot.id);
                batch.update(botDocRef, {
                    status,
                    displayScore: Math.floor(botDisplayScore),
                    score,
                    totalScore: Math.floor(totalScore),
                    bestScore: Math.floor(bestScore),
                    attemptsLeft,
                    startDelay,
                    targetScore
                });
            });
        }

        batch.commit().catch(err => console.error("Firestore ?쇨큵 ?낅뜲?댄듃 ?ㅽ뙣:", err));
    }
    
    // 4. 紐⑤뱺 ?뚮젅?댁뼱??寃뚯엫 醫낅즺 ?щ? ?뺤씤
    // [?섏젙] 諛⑹씠 苑?李쇨퀬(currentPlayers === maxPlayers), 紐⑤뱺 李멸??먭? 寃뚯엫???꾨즺?덉쓣 ?뚮쭔 'finished' ?곹깭濡?蹂寃쏀빀?덈떎.
    // ?댁쟾 濡쒖쭅? 諛⑹씠 苑?李⑥? ?딆븘???꾩옱 李멸????꾩썝???꾨즺?섎㈃ 'finished'濡?蹂寃쏀븯??臾몄젣媛 ?덉뿀?듬땲??
    const isRoomFull = currentRoom && multiGamePlayers.length >= currentRoom.limit;
    const areAllPlayersDead = multiGamePlayers.length > 0 && multiGamePlayers.every(p => p.status === 'dead');

    if (isRoomFull && areAllPlayersDead && currentRoom.status !== 'finished') {
        currentRoom.status = 'finished';
        db.collection('rooms').doc(currentRoom.id).update({ status: 'finished' })
            .then(() => console.log(`??諛?[${currentRoom.id}] ?곹깭瑜?'finished'濡?理쒖쥌 蹂寃쏀뻽?듬땲??`));
    }
}

function gameLoop() {
    // [?좉퇋] IDLE ?곹깭: 寃뚯엫 ?쒖옉 ???湲??곹깭 (遊??쒕??덉씠?섏? 怨꾩냽 ?섑뻾)
    if (gameState === STATE.IDLE) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        skyBg.draw(0); floorBg.draw(GAME_HEIGHT - 124);
        dog.draw(); chicken.draw(); // ?뺤쟻 洹몃━湲?
        
        // [?듭떖] ?湲??곹깭?먯꽌??硫?고뵆?덉씠 濡쒖쭅(遊??먯닔 怨꾩궛 ??? 怨꾩냽 ?ㅽ뻾?섏뼱????
        handleMultiplayerTick();
        
        gameLoopId = requestAnimationFrame(gameLoop);
        return;
    }

    if (gameState === STATE.PLAYING) {        
        // 1. 遺?ㅽ듃 蹂대꼫??怨꾩궛 (?섏씠由ъ뒪???섏씠由ы꽩)
        let boostBonus = 0;
        if (chicken.boostProgress >= 100) boostBonus = 0.6;     // MAX ?꾨떖 ?쒖뿉留? +60% (RED)
        else if (chicken.boostProgress >= 70) boostBonus = 0.4; // 70% ?댁긽: +40% (ORANGE)
        else if (chicken.boostProgress >= 40) boostBonus = 0.25;// 40% ?댁긽: +25% (YELLOW)
        else if (chicken.boostProgress >= 10) boostBonus = 0.1; // 10% ?댁긽: +10% (GREEN)

        // 2. 嫄곕━(?먯닔) 怨꾩궛: 寃뚯엫 ?띾룄??蹂대꼫??諛곗쑉 ?곸슜
        score += (gameSpeed * 0.05) * (1 + boostBonus);
        
        // 3. ?쒖씠??議곗젅: ?쒓컙???곕씪 寃뚯엫 ?띾룄 利앷? (?꾨젅??湲곗?)
        if (gameFrame >= nextLevelFrameThreshold) {
            baseGameSpeed += 0.8; 
            nextLevelFrameThreshold += 600; // ?ㅼ쓬 ?덈꺼源뚯? 10珥?異붽?
            level++;
            const levelEl = document.querySelector('.hud-level');
            if (levelEl) levelEl.innerText = 'LV.' + level;
        }

        // 4. HUD ?먯닔???낅뜲?댄듃
        const scoreEl = document.querySelector('.hud-score');
        if (scoreEl) {
            // 遺?ㅽ듃 ?④퀎???곕Ⅸ ?됱긽 ?대옒???곸슜
            scoreEl.classList.remove('green', 'yellow', 'orange', 'red');
            if (chicken.boostProgress >= 100) scoreEl.classList.add('red');
            else if (chicken.boostProgress >= 70) scoreEl.classList.add('orange');
            else if (chicken.boostProgress >= 40) scoreEl.classList.add('yellow');
            else if (chicken.boostProgress >= 10) scoreEl.classList.add('green');

            let displayVal = Math.floor(score);
            // [?섏젙] ?⑹궛 紐⑤뱶??寃쎌슦 ?꾩쟻 ?먯닔 ?ы븿?섏뿬 ?쒖떆
            if (currentGameMode === 'multi' && currentRoom && currentRoom.rankType === 'total') {
                const myId = currentUser ? currentUser.id : 'me';
                const myPlayer = multiGamePlayers.find(p => p.id === myId);
                if (myPlayer) displayVal += Math.floor(myPlayer.totalScore);
            }
            
            // [?섏젙] 援ъ“?붾맂 HUD ?낅뜲?댄듃
            scoreEl.querySelector('.score-val').innerText = displayVal.toLocaleString();
        }

        // 遺?ㅽ듃 諛?湲곕낯 ?띾룄 議곗젅
        if (chicken.isBoosting) { 
            if (gameSpeed < baseGameSpeed + 5) gameSpeed += 0.2; // [?섏젙] 遺?ㅽ듃 媛?띾룄 諛?理쒕? ?띾룄 媛먯냼 (+10 -> +5, 0.5 -> 0.2)
            speedMultiplier = 2; 
        } else { 
            if (gameSpeed > baseGameSpeed) gameSpeed -= 0.2; // 遺?ㅽ듃 ?댁젣 ??湲곕낯 ?띾룄濡??쒖꽌??蹂듦?
            else gameSpeed = baseGameSpeed; // ?띾룄媛 湲곕낯蹂대떎 ??븘吏吏 ?딅룄濡?蹂댁젙
            speedMultiplier = 1; 
        }
    } else if (gameState === STATE.CRASHED) {
        gameSpeed *= FRICTION;
        if (gameSpeed < 0.1) {
            gameSpeed = 0;
            if (chicken.y >= FLOOR_Y) {
                gameState = STATE.GAMEOVER;
                // [?좉퇋] 硫?고뵆?덉씠 ?먯닔 諛섏쁺 濡쒖쭅 (寃뚯엫 ?쒕룄 醫낅즺 ?쒖젏????踰덈쭔 ?ㅽ뻾)
                if (currentGameMode === 'multi' && currentRoom && currentUser) { // [?섏젙] currentUser 泥댄겕
                    const myId = currentUser.id;
                    const myPlayer = multiGamePlayers.find(p => p.id === myId);
                    if (myPlayer) {
                        // 濡쒖뺄 諛곗뿴 ?낅뜲?댄듃 (onSnapshot????뼱?곌린 ?꾧퉴吏 利됯컖?곸씤 UI 諛섏쓳??
                        if (currentRoom.rankType === 'total') {
                            // [FIX] score媛 NaN???섎뒗 寃쎌슦瑜?諛⑹??섍린 ?꾪빐 ?좏슚??寃??異붽?
                            if (isNaN(score)) score = 0;

                            myPlayer.totalScore = (myPlayer.totalScore || 0) + score;
                        } else {
                            myPlayer.bestScore = Math.max((myPlayer.bestScore || 0), score);
                        }
                        myPlayer.score = 0; // ?꾩옱 ???먯닔 珥덇린??(?ㅼ쓬 ?쒕룄瑜??꾪빐)

                    } // [?섏젙] ?먯닔 ?낅뜲?댄듃??handleGameOverUI?먯꽌 displayScore? ?④퍡 泥섎━?섎?濡??ш린?쒕뒗 濡쒖뺄 ?먯닔留?怨꾩궛?⑸땲??
                    // [?섏젙] 異⑸룎 ???쒕룄 ?잛닔瑜?利됱떆 1??李④컧?⑸땲??
                    // [?섏젙] ?ъ슜?먮퀎 ?쒕룄 ?잛닔 李④컧
                    if (currentUser && currentUser.joinedRooms[currentRoom.id]) {
                        currentUser.joinedRooms[currentRoom.id].usedAttempts++;
                        saveUserDataToFirestore(); // [FIX] ?쒕룄 ?잛닔 蹂寃????쒕쾭??利됱떆 ???
                    }
                }

                handleGameOverUI();
            }
        }
    }

    // [3?④퀎] 硫?고뵆?덉씠 ?ㅼ떆媛?濡쒖쭅 泥섎━
    handleMultiplayerTick();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    skyBg.draw(0); floorBg.draw(GAME_HEIGHT - 124);
    dog.update(); dog.draw();
    handleObstacles(); chicken.update(); chicken.draw();
    feathers.forEach(f => { f.update(); f.draw(); });
    feathers = feathers.filter(f => f.opacity > 0); // ?щ씪吏?源껎꽭 ?쒓굅
    
    gameFrame++;

    gameLoopId = requestAnimationFrame(gameLoop);
}

// [5. UI ?뚮뜑留?諛??λ㈃ ?쒖뼱]

/**
 * [?좉퇋] Top 100 ?붾? ??궧 ?곗씠?곕? ?앹꽦?⑸땲?? (???ㅽ뻾 ????踰덈쭔)
 */
function generateTop100Scores() {
    if (top100Scores.length > 0) return;

    const names = ["遺덈㈇?섏튂??, "移섑궓怨좎닔", "?щ━?붿쁺怨?, "吏덉＜蹂몃뒫", "移섑궓?덇쿊", "怨꾩＜?좎닔", "諛붿궘?쒕궇媛?, "?⑷툑??, "瑗ш섕??, "?덊띁??];
    let score = 125430;

    for (let i = 0; i < 30; i++) {
        top100Scores.push({
            rank: i + 1,
            score: Math.floor(score),
            name: `${names[i % names.length]}${i + 1}`
        });
        score *= (0.95 - Math.random() * 0.05);
    }
}

/**
 * [?좉퇋] ??理쒓퀬 ?먯닔???꾩껜 ?쒖쐞瑜?怨꾩궛?⑸땲??
 * @param {number} myBestScore - ?섏쓽 理쒓퀬 ?먯닔
 * @returns {number|null} - 怨꾩궛???쒖쐞 ?먮뒗 null
 */
function getMyOverallRank(myBestScore) {
    if (myBestScore <= 0) return null;
    for (let i = 0; i < top100Scores.length; i++) {
        if (myBestScore > top100Scores[i].score) return i + 1;
    }
    return top100Scores.length + 1;
}

/**
 * [?좉퇋] '??湲곕줉'??localStorage????ν븯怨?紐⑸줉???ㅼ떆 洹몃┰?덈떎.
 * @param {number} newScore - ?덈줈 異붽????먯닔
 */
function saveMyScore(newScore) {
    if (newScore <= 0) return; // 0?먯? ??ν븯吏 ?딆뒿?덈떎.

    const scoreEntry = {
        score: newScore,
        date: new Date().toISOString() // 湲곕줉 ?쒓컙??ISO ?쒖? 臾몄옄?대줈 ???
    };
    myScores.push(scoreEntry);
    myScores.sort((a, b) => b.score - a.score); // ?먯닔 ?믪? ?쒖쑝濡??뺣젹

    if (myScores.length > 100) { // [?섏젙] 理쒕? 100媛?湲곕줉 ???
        myScores.length = 100;
    }

    localStorage.setItem('chickenRunMyScores', JSON.stringify(myScores));
    bestScore = myScores[0].score; // 理쒓퀬 ?먯닔 ?낅뜲?댄듃
    renderMyRecordList(); // 紐⑸줉 UI 媛깆떊
}

/**
 * [?좉퇋] '??湲곕줉' ??쓽 紐⑸줉??洹몃┰?덈떎.
 * @param {boolean} append - true??寃쎌슦 湲곗〈 紐⑸줉??異붽?濡??㏓텤?낅땲??
 */
function renderMyRecordList(append = false) {
    const listEl = document.querySelector('#content-my-record .score-list');
    if (!listEl) return;

    if (!append) {
        listEl.innerHTML = '';
        displayedMyRecordsCount = 20; // 珥덇린??
    }

    if (myScores.length === 0) {
        listEl.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>?꾩쭅 湲곕줉???놁뒿?덈떎. 泥??꾩쟾???대낫?몄슂!</p></div></li>';
        return;
    }

    const myRank = getMyOverallRank(bestScore);

    // ?꾩옱 ?쒖떆??媛쒖닔 ?댄썑遺???ㅼ쓬 20媛쒕? 媛?몄샂
    const currentItemsCount = listEl.querySelectorAll('li:not(.top)').length + (listEl.querySelector('li.top') ? 1 : 0);
    const startIndex = append ? currentItemsCount : 0;
    
    // [蹂댁젙] ?쒖떆??媛쒖닔媛 ?꾩껜 ?곗씠??湲몄씠瑜??섏? ?딅룄濡??ㅼ젙
    const itemsToShow = myScores.slice(startIndex, Math.min(displayedMyRecordsCount, myScores.length));

    itemsToShow.forEach((record, idx) => {
        const globalIndex = startIndex + idx;
        const li = document.createElement('li');
        const d = new Date(record.date);
        const dateString = `${d.getFullYear()}??${d.getMonth() + 1}??${d.getDate()}??br />${d.getHours()}??${d.getMinutes()}遺?;

        if (globalIndex === 0 && bestScore > 0) {
            li.className = 'top';
            const rankText = myRank ? `${myRank}?? : '?쒖쐞 ?놁쓬';
            li.innerHTML = `<div class="info"><label><img class="top" src="assets/images/icon_top.png"/><small>${rankText}</small></label><p class="score-display">${record.score.toLocaleString()}<small>M</small></p></div><div class="more"><span>${dateString}</span></div>`;
        } else {
            li.innerHTML = `<div class="info"><p class="score-display">${record.score.toLocaleString()}<small>M</small></p></div><div class="more"><span>${dateString}</span></div>`;
        }
        listEl.appendChild(li);
    });
}

/**
 * [?좉퇋] 'Top 100' ??쓽 ?붾? ?곗씠??紐⑸줉??洹몃┰?덈떎.
 */
function renderTop100List() {
    const listEl = document.querySelector('#content-top-100 .score-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    top100Scores.forEach(entry => {
        const rank = entry.rank;
        const li = document.createElement('li');
        let rankDisplay = (rank === 1) ? `<img class="icon" src="assets/images/icon_flag1th.png" />` : (rank === 2) ? `<img class="icon" src="assets/images/icon_flag2th.png" />` : (rank === 3) ? `<img class="icon" src="assets/images/icon_flag3th.png" />` : `${rank}<small>th</small>`;
        
        li.innerHTML = `<span class="stat">${rankDisplay}</span><div class="info"><p class="score-display">${entry.score.toLocaleString()}<small>M</small></p></div><div class="more"><span>${entry.name}</span></div>`;
        listEl.appendChild(li);
    });
}

/**
 * [?좉퇋] ?쒕쾭 ??궧 ?곗씠?곕? ?붾㈃???쒖떆
 */
function displayRankings(rankData) {
    top100Scores = rankData.map((data, index) => ({
        rank: index + 1,
        score: data.score,
        name: data.nickname
    }));
    renderTop100List();
}

function loadLeaderboard() {
    // 1. 'rankings' ?곸옄?먯꽌 ?먯닔(score)媛 ?믪? ??desc)?쇰줈 10媛쒕쭔 媛?몄???
    db.collection("rankings")
      .orderBy("score", "desc")
      .limit(10)
      .get()
      .then((querySnapshot) => {
          console.log("?룇 ??궧 ?곗씠?곕? 媛?몄솕?듬땲??");
          
          let rankData = [];
          querySnapshot.forEach((doc) => {
              rankData.push(doc.data()); // nickname, score ?깆씠 ?닿꺼 ?덉쓬
          });

          // 2. ???곗씠?곕? ?붾㈃??洹몃━???⑥닔???꾨떖?섏꽭??
          displayRankings(rankData); 
      })
      .catch((error) => {
          console.error("????궧 遺덈윭?ㅺ린 ?ㅽ뙣:", error);
      });
}

/**
 * [?좉퇋] Firestore 臾몄꽌 ?곗씠?곕? 濡쒖뺄 諛?媛앹껜 ?뺤떇?쇰줈 蹂?섑븯???ы띁 ?⑥닔?낅땲??
 */
function mapFirestoreDocToRoom(doc) {
    const roomData = doc.data();
    return {
        id: doc.id,
        title: roomData.title,
        limit: roomData.maxPlayers,
        current: roomData.currentPlayers,
        attempts: roomData.attempts,
        status: roomData.status,
        rankType: roomData.rankType,
        isLocked: !!roomData.password,
        password: roomData.password,
        creatorUid: roomData.creatorUid,
        createdAt: roomData.createdAt // [?좉퇋] ?뺣젹 諛??ㅻ깄???좎?瑜??꾪빐 ?앹꽦 ?쒓컙 ?꾨뱶 異붽?
    };
}

/**
 * [FIX] 諛?紐⑸줉 濡쒕뵫 諛⑹떇???섏씠吏?ㅼ씠?섏쑝濡??꾨㈃ 援먯껜?⑸땲??
 * 1留뚭컻 ?댁긽??諛⑹씠 ?앹꽦??寃쎌슦, 紐⑤뱺 諛⑹쓣 ??踰덉뿉 遺덈윭?ㅻ뒗 湲곗〈 諛⑹떇? ?깅뒫 ???諛?鍮꾩슜 臾몄젣瑜??쇨린?⑸땲??
 * ???⑥닔??Firestore?먯꽌 ?섏씠吏 ?⑥쐞濡?諛?紐⑸줉???⑥쑉?곸쑝濡?遺덈윭?듬땲??
 * @description ?ㅼ떆媛??낅뜲?댄듃(`onSnapshot`) ???'?붾낫湲?? '?덈줈怨좎묠'???듯븳 ?섎룞 ?낅뜲?댄듃 諛⑹떇?쇰줈 蹂寃쎈맗?덈떎.
 * [FIX] 諛?紐⑸줉 濡쒕뵫 諛⑹떇???ㅼ떆媛?由ъ뒪??+ Limit 利앷? 諛⑹떇?쇰줈 蹂寃쏀빀?덈떎.
 * - ?ㅼ떆媛??낅뜲?댄듃(移쒓뎄 ?낆옣 ??瑜?諛섏쁺?섍린 ?꾪빐 onSnapshot???ъ슜?⑸땲??
 * - ?깅뒫 ?댁뒋(1留뚭컻 諛?瑜??닿껐?섍린 ?꾪빐 limit()瑜??ъ슜?섏뿬 ?꾩슂??留뚰겮留?援щ룆?⑸땲??
 * - '?붾낫湲? ?대┃ ??limit瑜?利앷??쒖폒 ?ш뎄?낇빀?덈떎.
 * @param {boolean} loadMore - true?대㈃ '?붾낫湲?濡??ㅼ쓬 ?섏씠吏瑜? false?대㈃ 紐⑸줉???덈줈怨좎묠?⑸땲??
 */
let roomFetchPromise = null; // [?좉퇋] 以묐났 ?몄텧 諛⑹? 諛??湲?泥섎━瑜??꾪븳 Promise 蹂??
function fetchRaceRooms(loadMore = false) {
    // [FIX] 以묐났 ?몄텧 諛⑹?: ?대? 濡쒕뵫 以묒씠怨??⑥닚 議고쉶?쇰㈃ 湲곗〈 Promise 諛섑솚
    // ?? loadMore??寃쎌슦??limit???섎젮 ?덈줈 ?몄텧?댁빞 ?섎?濡??쒖쇅
    if (roomFetchPromise && !loadMore) return roomFetchPromise;

    roomFetchPromise = new Promise((resolve, reject) => {
        if (loadMore) {
            currentRoomLimit += ROOMS_PER_PAGE;
        } else {
            currentRoomLimit = ROOMS_PER_PAGE;
        }

        const loader = document.getElementById('race-room-loader');
        if (loader) loader.classList.remove('hidden');

        // 湲곗〈 由ъ뒪???댁젣 (limit??蹂寃쎈릺硫??ш뎄?낇빐????
        if (unsubscribeRoomListener) {
            unsubscribeRoomListener();
            unsubscribeRoomListener = null;
        }

        let isFirstCallback = true;

        // [?듭떖] get() ???onSnapshot()???ъ슜?섏뿬 ?ㅼ떆媛??곗씠???숆린??
        unsubscribeRoomListener = db.collection('rooms')
            // [?섏젙] 蹂듯빀 ?몃뜳??臾몄젣 ?뚰뵾瑜??꾪빐 where ???쒓굅. ???limit???됰꼮??媛?몄????대씪?댁뼵?몄뿉???꾪꽣留?
            .orderBy('createdAt', 'desc')
            .limit(currentRoomLimit + 5) // ?꾪꽣留곷맆 寃껋쓣 ?鍮꾪빐 ?ъ쑀?덇쾶 媛?몄샂
            .onSnapshot((querySnapshot) => {
                // [FIX] ?ㅼ떆媛??낅뜲?댄듃 ??紐⑸줉???붾뱾由щ뒗 臾몄젣(flickering) 諛???ぉ ?섍? 蹂?섎뒗 臾몄젣 ?닿껐
                // ?먯씤: onSnapshot???몄텧???뚮쭏??raceRooms 諛곗뿴 ?꾩껜瑜?援먯껜?섏뿬 紐⑸줉???ъ젙?щ릺嫄곕굹 湲몄씠媛 蹂寃쎈맖.
                // ?닿껐: 泥?濡쒕뱶 ?쒖뿉留??꾩껜 紐⑸줉??媛?몄삤怨? ?댄썑?먮뒗 docChanges()瑜??ъ슜?섏뿬 蹂寃쎈맂 ??ぉ留?'蹂묓빀'?⑸땲??
                //       'removed'????ぉ? 諛곗뿴?먯꽌 ?쒓굅?섏? ?딆븘, ?ъ슜?먭? ?대┃ ??"議댁옱?섏? ?딅뒗 諛? ?뚮┝???꾩슱 ???덈룄濡??⑸땲??
                if (isFirstCallback) {
                    // 1. 泥?濡쒕뱶: ?꾩껜 紐⑸줉??媛?몄? raceRooms瑜?梨꾩슦怨? ?붾㈃???뚮뜑留곹빀?덈떎.
                    const newRooms = [];
                    querySnapshot.forEach(doc => {
                        newRooms.push(mapFirestoreDocToRoom(doc));
                    });
                    raceRooms = newRooms;

                    // ???댁긽 遺덈윭??諛⑹씠 ?녿뒗吏 ?뺤씤
                    if (querySnapshot.docs.length <= currentRoomLimit) {
                        allRoomsLoaded = true;
                        if (loader) loader.classList.add('hidden');
                    } else {
                        allRoomsLoaded = false;
                        if (loader) loader.classList.remove('hidden');
                    }

                    renderRoomLists(true);
                    isFirstCallback = false;
                    resolve(); // ?곗씠??濡쒕뵫 ?꾨즺 ??Promise ?닿껐
                } else {
                    // 2. ?ㅼ떆媛??낅뜲?댄듃: 蹂寃쎈맂 ?댁슜留?raceRooms 諛곗뿴??諛섏쁺?⑸땲??
                    querySnapshot.docChanges().forEach((change) => {
                        const roomData = mapFirestoreDocToRoom(change.doc);
                        const index = raceRooms.findIndex(r => r.id === roomData.id);

                        if (change.type === 'modified') {
                            // '?섏젙': 湲곗〈 諛??뺣낫瑜??낅뜲?댄듃?⑸땲??
                            if (index > -1) Object.assign(raceRooms[index], roomData);
                        } else if (change.type === 'removed') {
                            // '??젣': 紐⑸줉?먯꽌 ?쒓굅?섏? ?딄퀬, ?몄썝?섎? 0?쇰줈 留뚮뱾??'?좊졊 諛??쇰줈 ?④꺼?〓땲??
                            // ?대젃寃??섎㈃ 紐⑸줉 湲몄씠媛 ?좎??섍퀬, ?대┃ ??"議댁옱?섏? ?딅뒗 諛? 泥섎━媛 媛?ν빐吏묐땲??
                            if (index > -1) raceRooms[index].current = 0;
                        }
                        // '異붽?(added)'??臾댁떆?⑸땲?? ??諛⑹? '?덈줈怨좎묠'?대굹 '?붾낫湲? ?쒖뿉留?紐⑸줉???섑??섏빞 ?⑸땲??
                    });
                    // 蹂寃??ы빆??諛섏쁺??紐⑸줉???ㅼ떆 洹몃━吏留? ?ㅻ깄?룹? ?좎??섏뿬 紐⑸줉 ?쒖꽌??湲몄씠媛 蹂?섏? ?딄쾶 ?⑸땲??
                    renderRoomLists(false);
                }
            }, (error) => {
                console.error("??諛?紐⑸줉 由ъ뒪???ㅻ쪟:", error);
                if (loader) loader.classList.add('hidden');
                reject(error);
            });
    });

    return roomFetchPromise;
}

/**
 * [?좉퇋] 李멸?以묒씤 諛?紐⑸줉??蹂꾨룄濡?遺덈윭?듬땲??
 * raceRooms(?꾩껜 紐⑸줉)???녿뒗 ?ㅻ옒??諛⑹씠?쇰룄 ?닿? 李멸? 以묒씠硫?蹂댁뿬???섍린 ?뚮Ц?낅땲??
 */
async function fetchMyRooms() {
    if (!isLoggedIn || !currentUser || !currentUser.joinedRooms) {
        myRooms = [];
        renderRoomLists(true);
        return;
    }
    const roomIds = Object.keys(currentUser.joinedRooms);
    if (roomIds.length === 0) {
        myRooms = [];
        renderRoomLists(true);
        return;
    }

    // [?섏젙] currentMyRoomLimit 留뚰겮 ID瑜?媛?몄샃?덈떎.
    const targetIds = roomIds.slice(0, currentMyRoomLimit);
    
    // [?섏젙] Firestore 'in' 荑쇰━??理쒕? 10媛??쒗븳???덉쑝誘濡? 10媛쒖뵫 ?딆뼱???붿껌?⑸땲??
    const chunks = [];
    for (let i = 0; i < targetIds.length; i += 10) {
        chunks.push(targetIds.slice(i, i + 10));
    }

    try {
        const promises = chunks.map(chunk => db.collection('rooms').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get());
        const snapshots = await Promise.all(promises);
        
        myRooms = [];
        snapshots.forEach(snap => {
            snap.docs.forEach(doc => myRooms.push(mapFirestoreDocToRoom(doc)));
        });
        
        renderRoomLists(true);
    } catch (e) {
        console.error("????諛?紐⑸줉 濡쒕뱶 ?ㅽ뙣:", e);
    }
}

/**
 * [?좉퇋] ?ъ슜???뺣낫 紐⑤떖???닿퀬 ?곗씠?곕? 梨꾩썎?덈떎.
 */
function showUserProfile() {
    // [?섏젙] 濡쒓렇???곹깭???꾩뿭 蹂??currentUser濡??뺤씤?⑸땲??
    if (!currentUser) {
        // 濡쒓렇?몃릺吏 ?딆? ?곹깭?먯꽌 ?꾨줈?꾩쓣 ?대젮怨???寃쎌슦, 濡쒓렇??李쎌쓣 ?꾩썎?덈떎.
        document.getElementById('scene-auth').classList.remove('hidden');
        return;
    }

    const scene = document.getElementById('scene-user-profile');
    if (!scene) return;

    // [由ы뙥?좊쭅] ?댁젣 loadUserData??'?먭? 移섏쑀' 濡쒖쭅 ?뺣텇??currentUser 媛앹껜????긽 ?좊ː?????덈뒗 理쒖떊 ?뺣낫瑜?媛吏묐땲??
    // ?곕씪???꾨줈?꾩쓣 ???뚮쭏??Firestore?먯꽌 ?곗씠?곕? ?ㅼ떆 媛?몄삤??蹂듭옟??鍮꾨룞湲?濡쒖쭅?????댁긽 ?꾩슂?섏? ?딆뒿?덈떎.
    // 肄붾뱶瑜??⑥닚?뷀븯??currentUser???곗씠?곕? 吏곸젒 ?ъ슜?⑸땲??

    document.getElementById('profile-id').value = currentUser.email || currentUser.id;
    document.getElementById('profile-nickname').value = currentUser.nickname || '';
    document.getElementById('badge-count-1').innerText = (currentUser.badges && currentUser.badges['1']) || 0;
    document.getElementById('badge-count-2').innerText = (currentUser.badges && currentUser.badges['2']) || 0;
    document.getElementById('badge-count-3').innerText = (currentUser.badges && currentUser.badges['3']) || 0;

    // ?꾨줈?꾩쓣 ????肄붿씤 ?뺣낫??理쒖떊?뷀빀?덈떎.
    updateCoinUI();

    scene.classList.remove('hidden');
}

/**
 * [?좉퇋] 寃뚯엫???쇱떆?뺤??섍굅???댁뼱?⑸땲??
 */
function togglePause() {
    // 寃뚯엫?ㅻ쾭 ?먮뒗 異⑸룎 ?곹깭?먯꽌???쇱떆?뺤?/?ш컻 遺덇?
    if (gameState === STATE.GAMEOVER || gameState === STATE.CRASHED) return;

    const scenePauseMenu = document.getElementById('game-pause-screen');
    const btnPauseToggle = document.getElementById('btn-pause-toggle');

    if (gameState === STATE.PAUSED) {
        // --- 寃뚯엫 ?댁뼱?섍린 ---
        clearAutoActionTimer(); // [?좉퇋] ??대㉧ ?댁젣
        if (currentGameMode === 'multi') {
            const myId = currentUser ? currentUser.id : 'me';
            const myPlayer = multiGamePlayers.find(p => p.id === myId);
            if (myPlayer) myPlayer.status = 'playing';
        }
        gameState = STATE.PLAYING;
        scenePauseMenu.classList.add('hidden');
        btnPauseToggle.classList.remove('paused');
        gameLoopId = requestAnimationFrame(gameLoop); // 寃뚯엫 猷⑦봽 ?ъ떆??
    } else {
        // --- 寃뚯엫 ?쇱떆?뺤? ---
        pauseBGM(); // [?좉퇋] ?쇱떆?뺤? ??BGM ?쇱떆?뺤?
        if (currentGameMode === 'multi') {
            const myId = currentUser ? currentUser.id : 'me';
            const myPlayer = multiGamePlayers.find(p => p.id === myId);
            if (myPlayer) myPlayer.status = 'paused';
        }
        gameState = STATE.PAUSED;
        cancelAnimationFrame(gameLoopId); // 寃뚯엫 猷⑦봽 ?뺤?
        scenePauseMenu.classList.remove('hidden');
        btnPauseToggle.classList.add('paused');

        // [?좉퇋] 硫?고뵆?덉씠 ?쇱떆?뺤? ??대㉧ (30珥?
        if (currentGameMode === 'multi') {
            startAutoActionTimer(30, 'start', '#game-pause-screen .time-message');
        }
    }
}

/**
 * [?좉퇋] ?쒕쾭?먯꽌 ?ъ슜?먮? 諛⑹뿉???댁옣?쒗궎??諛깆뿏??濡쒖쭅.
 * ?곗씠???뺥빀?깆쓣 蹂댁옣?섍린 ?꾪빐 紐⑤뱺 ?댁옣 ?쒕굹由ъ삤(?뺤긽, 鍮꾩젙???먯꽌 ?몄텧?⑸땲??
 * @param {string} roomId - ?댁옣??諛⑹쓽 ID
 * @param {boolean} isFullExit - true??寃쎌슦 李멸???紐⑸줉?먯꽌 ?꾩쟾???쒓굅(?섎텋/?몄썝媛먯냼), false??寃쎌슦 寃뚯엫 ?ш린濡?媛꾩＜?섍퀬 'dead' 泥섎━.
 */
async function performServerExit(roomId, isFullExit) {
    if (!currentUser || !roomId) return;

    const myId = currentUser.id;
    const roomRef = db.collection('rooms').doc(roomId);

    try {
        if (isFullExit) {
            console.log(`?? Server Exit: Performing FULL exit from room [${roomId}].`);
            
            const participantsSnapshot = await roomRef.collection('participants').get();
            const myParticipantDoc = participantsSnapshot.docs.find(doc => doc.id === myId);

            if (myParticipantDoc) {
                await db.runTransaction(async (transaction) => {
                    const roomDoc = await transaction.get(roomRef);
                    if (!roomDoc.exists) return;

                    const roomData = roomDoc.data();
                    transaction.delete(myParticipantDoc.ref);

                    const newPlayerCount = roomData.currentPlayers - 1;
                    if (newPlayerCount <= 0) {
                        transaction.delete(roomRef);
                    } else {
                        const updates = { currentPlayers: firebase.firestore.FieldValue.increment(-1) };
                        if (roomData.creatorUid === myId) {
                            const otherPlayers = participantsSnapshot.docs.map(d => d.data()).filter(p => p.id !== myId);
                            if (otherPlayers.length > 0) {
                                updates.creatorUid = otherPlayers[0].id;
                            }
                        }
                        transaction.update(roomRef, updates);
                    }
                });
            }

            if (currentUser.joinedRooms[roomId]) {
                delete currentUser.joinedRooms[roomId];
                await db.collection("users").doc(myId).update({
                    [`joinedRooms.${roomId}`]: firebase.firestore.FieldValue.delete()
                });
            }
        } else { // Soft Exit (Forfeit)
            console.log(`?? Server Exit: Performing SOFT exit (forfeit) from room [${roomId}].`);
            
            const roomDoc = await roomRef.get();
            if (!roomDoc.exists) return;
            const roomData = roomDoc.data();

            if (currentUser.joinedRooms[roomId]) {
                await db.collection("users").doc(myId).update({
                    [`joinedRooms.${roomId}.usedAttempts`]: roomData.attempts
                });
            }

            const participantRef = roomRef.collection('participants').doc(myId);
            await participantRef.update({ status: 'dead' });

            // ?ш린 ?쒖뿉??諭껋? ?띾뱷 ?щ? ?뺤씤
            awardBadgeIfEligible();
        }
    } catch (error) {
        console.error(`??Server exit from room [${roomId}] failed:`, error);
    }
}

/**
 * [?좉퇋] 寃뚯엫??醫낅즺?섍퀬 濡쒕퉬(?명듃濡? ?붾㈃?쇰줈 ?뚯븘媛묐땲??
 */
async function exitToLobby(isFullExit = false) { // [FIX] "?꾩쟾 ?댁옣" ?щ?瑜??몄옄濡?諛쏆쓬
    // [?섏젙] 鍮꾩젙??醫낅즺 蹂듦뎄瑜??꾪빐 ?몄뀡 ?ㅽ넗由ъ????쒖꽦 諛?ID瑜??쒓굅?⑸땲??
    sessionStorage.removeItem('activeRoomId');

    if (unsubscribeParticipantsListener) {
        unsubscribeParticipantsListener();
        unsubscribeParticipantsListener = null;
        console.log("?렒 Participants listener detached.");
    }

    stopBGM();
    if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }

    // [由ы뙥?좊쭅] ?쒕쾭???곗씠???뺥빀?깆쓣 留욎텛??濡쒖쭅??performServerExit ?⑥닔濡?遺꾨━/?듯빀?덉뒿?덈떎.
    if (currentGameMode === 'multi' && currentRoom && currentUser) {
        await performServerExit(currentRoom.id, isFullExit);
    }

    // --- 怨듯넻 UI ?뺣━ 諛??붾㈃ ?꾪솚 ---
    multiGamePlayers = [];
    clearAutoActionTimer();
    currentRoom = null; // ?꾩옱 諛?而⑦뀓?ㅽ듃 珥덇린??
    
    updateCoinUI();

    // [FIX] 諛??댁옣 ??紐⑸줉??媛깆떊?섏? ?딅뒗 臾몄젣 ?닿껐:
    // fetchRaceRooms媛 罹먯떆??Promise瑜?諛섑솚?섏? ?딄퀬 媛뺤젣濡??덈줈怨좎묠?섎룄濡?Promise瑜?珥덇린?뷀빀?덈떎.
    roomFetchPromise = null;
    await fetchRaceRooms(false);
    fetchMyRooms();

    document.getElementById('scene-intro').classList.remove('hidden');
    document.getElementById('scene-game').classList.add('hidden');
    document.getElementById('btn-pause-toggle').classList.remove('paused');
}

/**
 * [?좉퇋] 硫?고뵆?덉씠 諛?李멸?瑜??쒕룄?섎뒗 ?듯빀 ?⑥닔.
 * 肄붿씤, ?몄썝 ?쒗븳, 濡쒓렇???곹깭瑜?泥댄겕?섍퀬 李멸? 濡쒖쭅???섑뻾?⑸땲??
 * @param {object} room - 李멸??섎젮??諛?媛앹껜
 */
async function attemptToJoinRoom(room) {
    if (!isLoggedIn) {
        const sceneAuth = document.getElementById('scene-auth');
        if (sceneAuth) {
            sceneAuth.classList.remove('hidden');
            const authMsg = sceneAuth.querySelector('.auth-message');
            if (authMsg) {
                authMsg.style.display = 'block';
                authMsg.innerText = '硫?고뵆?덉씠??濡쒓렇?????댁슜 媛?ν빀?덈떎.';
            }
        }
        return;
    }

    const hasJoined = currentUser && currentUser.joinedRooms && currentUser.joinedRooms[room.id];

    // [FIX] 遊?異붽?/??젣(+/-) 踰꾪듉???꾨Ⅸ 吏곹썑 ?낆옣/?ъ엯???? ?대씪?댁뼵?몄쓽 諛??뺣낫(?몄썝 ??媛
    // ?쒕쾭? ?쇱튂?섏? ?딅뒗 ?곹깭(Stale)?먯꽌 吏꾩엯?섏뿬 ?뚮젅?댁뼱 ?섍? 留욎? ?딅뒗 臾몄젣瑜??닿껐?⑸땲??
    // ?먯씤: onSnapshot??鍮꾨룞湲곗쟻 ?낅뜲?댄듃 吏?곗쑝濡??명빐, stale ?곗씠?곕줈 寃뚯엫 ?ъ뿉 吏꾩엯??
    // ?닿껐: ?낆옣/?ъ엯??????긽 ?쒕쾭濡쒕???理쒖떊 諛??뺣낫瑜?媛?몄? 濡쒖뺄 ?곗씠?곕? 媛깆떊????吏꾩엯?⑸땲??

    if (hasJoined) {
        // --- ?ъ엯??---
        // ?쒕쾭?먯꽌 理쒖떊 ?몄썝 ?섎? 媛?몄? 濡쒖뺄 room 媛앹껜瑜?媛깆떊?⑸땲??
        const roomRef = db.collection('rooms').doc(room.id);
        try {
            const roomDoc = await roomRef.get();
            if (roomDoc.exists) {
                const serverData = roomDoc.data();
                room.current = serverData.currentPlayers;
                room.status = serverData.status;
            }
        } catch (error) {
            console.error("???ъ엯????諛??뺣낫 媛깆떊 ?ㅽ뙣:", error);
        }
        enterGameScene('multi', room);
        return;
    }

    // --- ?좉퇋 ?낆옣 ---
    const cost = room.attempts;
    if (currentUser.coins < cost) {
        alert(`肄붿씤??遺議깊빀?덈떎. (?꾩슂: ${cost}, 蹂댁쑀: ${currentUser.coins})`);
        return;
    }
    
    const roomRef = db.collection('rooms').doc(room.id);
    try {
        // [FIX] 諛?李멸? 濡쒖쭅???⑥씪 ?몃옖??뀡?쇰줈 ?듯빀?섏뿬 ?먯옄?깆쓣 蹂댁옣?⑸땲??
        // ?몄썝 ??利앷?? 李멸???紐⑸줉 異붽?媛 ?숈떆???깃났?섍굅???ㅽ뙣?섎룄濡??섏뿬 ?곗씠??遺덉씪移섎? ?먯쿇 李⑤떒?⑸땲??
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) { throw "?덉씠?ㅻ８??議댁옱?섏? ?딆뒿?덈떎."; }

            const serverRoomData = roomDoc.data();
            if (serverRoomData.currentPlayers >= serverRoomData.maxPlayers) { throw "諛⑹씠 媛??李쇱뒿?덈떎."; }

            // 1. ?몄썝 ?섎? 1 利앷??쒗궎怨? ?꾩슂 ???곹깭瑜?'inprogress'濡?蹂寃쏀빀?덈떎.
            const updates = { currentPlayers: firebase.firestore.FieldValue.increment(1) };
            if (serverRoomData.status === 'finished') {
                updates.status = 'inprogress';
            }
            transaction.update(roomRef, updates);

            // 2. 李멸???participants) ?섏쐞 而щ젆?섏뿉 ???뺣낫瑜?異붽??⑸땲??
            const myParticipantRef = roomRef.collection('participants').doc(currentUser.id);
            const myParticipantData = {
                id: currentUser.id,
                name: currentUser.nickname,
                isBot: false,
                totalScore: 0,
                bestScore: 0,
                status: 'waiting',
                displayScore: 0,
                attemptsLeft: serverRoomData.attempts
            };
            transaction.set(myParticipantRef, myParticipantData);
        });

        console.log(`??諛?[${room.id}] ?낆옣 ?몃옖??뀡 ?깃났. (?몄썝??利앷? 諛?李멸????깅줉 ?꾨즺)`);

        // ?몃옖??뀡???깃났?덉쑝誘濡?濡쒖뺄 ?곗씠?곕룄 1 利앷??쒗궢?덈떎.
        room.current++;

        // ?ㅻⅨ '誘몄떆?? 諛⑹뿉???먮룞?쇰줈 ?섍?怨?肄붿씤 ?섎텋
        if (currentUser.joinedRooms) {
            const unstartedJoinedRoomIds = Object.keys(currentUser.joinedRooms).filter(id => {
                const roomState = currentUser.joinedRooms[id];
                // [?섏젙] Firestore ID??臾몄옄?댁씠誘濡?parseInt ?쒓굅
                return roomState && roomState.usedAttempts === 0 && id !== room.id;
            });
            unstartedJoinedRoomIds.forEach(idToLeave => {
                const roomToLeave = raceRooms.find(r => r.id === idToLeave);
                const roomState = currentUser.joinedRooms[idToLeave];
                if (roomToLeave && roomState && roomState.isPaid) { currentUser.coins += roomToLeave.attempts; }
                delete currentUser.joinedRooms[idToLeave];
            });
        }
        currentUser.joinedRooms[room.id] = { usedAttempts: 0, isPaid: false };
        enterGameScene('multi', room);
    } catch (error) {
        console.error("??諛??낆옣 ?ㅽ뙣:", error);
        alert(error); // "諛⑹씠 媛??李쇱뒿?덈떎." ?먮뒗 "議댁옱?섏? ?딅뒗 諛⑹엯?덈떎." ?깆쓽 硫붿떆吏 ?쒖떆
        renderRoomLists(true); // 紐⑸줉??理쒖떊 ?곹깭濡?媛깆떊?섏뿬 ?ъ슜?먯뿉寃??뺥솗???뺣낫瑜?蹂댁뿬以띾땲??
    }
}

/**
 * [?좉퇋] 硫?고뵆?덉씠 ??궧 紐⑸줉???뚮뜑留곹빀?덈떎.
 */
function renderMultiRanking() {
    const listEl = document.getElementById('multi-score-list');
    if (!listEl || !currentRoom) return;

    // 1. ?뺣젹 湲곗????곕씪 ?먯닔 怨꾩궛 諛??뺣젹
    const isTotalMode = currentRoom.rankType === 'total';
    const myId = currentUser ? currentUser.id : 'me';
    
    const sortedPlayers = [...multiGamePlayers].sort((a, b) => {
        // [FIX] ???먯닔??濡쒖뺄 ?먯닔瑜?湲곗??쇰줈 ?뺣젹??李몄뿬?쒖폒 ?쒖쐞媛 利됱떆 諛섏쁺?섎룄濡??⑸땲??
        const scoreA = a.id === myId ? calculateMyLocalDisplayScore() : (a.displayScore || 0);
        const scoreB = b.id === myId ? calculateMyLocalDisplayScore() : (b.displayScore || 0);
        return scoreB - scoreA;
    });

    // [?좉퇋] 紐⑤뱺 ?뚮젅?댁뼱媛 醫낅즺?섏뿀?붿? ?뺤씤 (諛??꾩껜 ?꾨즺 ?щ?)
    const isAllFinished = multiGamePlayers.every(p => p.status === 'dead');

    // 2. HTML ?앹꽦
    listEl.innerHTML = '';
    sortedPlayers.forEach((p, index) => {
        const rank = index + 1;
        const li = document.createElement('li');
        
        // [?좉퇋] 諛⑹옣 ?щ? ?뺤씤
        const isHost = currentRoom.creatorUid && p.id === currentRoom.creatorUid;
        const hostIndicatorText = isHost ? `(諛⑹옣)` : '';
        const hostIconHtml = isHost ? `<img class="master-key-icon" src="assets/images/icon_masterkey.png">` : '';

        // ?곹깭???곕Ⅸ 罹먮┃???ㅽ???諛??대?吏
        let charClass = 'character';
        let charImg = 'assets/images/chicken_back.png'; // 湲곕낯(?湲?
        
        if (p.status === 'playing') {
            charClass += ' active';
            charImg = 'assets/images/chickenRun.gif';
        } else if (p.status === 'dead') {
            charClass += ' dead';
            // [?섏젙] ?꾩껜 ?꾨즺 ?곹깭???뚮쭔 ?뺣㈃ ?대?吏(chicken_front)濡?蹂寃? 吏꾪뻾 以묒씪 ??二쎌? ?대?吏 ?좎?
            charImg = isAllFinished ? 'assets/images/chicken_front.png' : 'assets/images/chicken_dead.png';
        }

        // [?좉퇋] 蹂몄씤 罹먮┃??媛뺤“ (.me ?대옒??異붽?)
        if (p.id === myId) {
            charClass += ' me';
        }
        
        // [?섏젙] ?먯닔媛 0?대㈃???湲곗쨷??寃쎌슦?먮쭔 '?湲곗쨷' ?쒖떆 (洹??몄뿉???쒖쐞 ?쒖떆)
        // [3?④퀎] displayScore媛 0?닿퀬 waiting ?곹깭????'?湲곗쨷' ?쒖떆
        let statHtml = '';
        if (p.status === 'waiting' && p.displayScore === 0) {
            statHtml = `<span class="more">?湲곗쨷</span>`;
        } else {
            let rankDisplay = '';
            if (rank === 1) rankDisplay = `<img class="icon" src="assets/images/icon_flag1th.png"/>`;
            else if (rank === 2) rankDisplay = `<img class="icon" src="assets/images/icon_flag2th.png"/>`;
            else if (rank === 3) rankDisplay = `<img class="icon" src="assets/images/icon_flag3th.png"/>`;
            else rankDisplay = `${rank}<small>th</small>`;
            statHtml = `<span class="stat">${rankDisplay}</span>`;
        }

        // [?붿껌?섏젙] 遊??꾩슜 而⑦듃濡?踰꾪듉 HTML ?앹꽦
        let botControlButtonsHTML = '';
        if (currentUser && currentUser.isAdmin && p.isBot) { // [?섏젙] 愿由ъ옄留?遊?而⑦듃濡?媛??(!p.exited 議곌굔 ?쒓굅)
            botControlButtonsHTML = `
                <div>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-start">寃뚯엫?ㅽ뻾</button>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-end">寃뚯엫醫낅즺</button>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-delete">紐⑸줉??젣</button>
                </div>
            `;
        }

        // [FIX] ???먯닔??濡쒖뺄 蹂?섏뿉??吏곸젒 怨꾩궛?섏뿬 ?쒖감 ?놁씠 ?쒖떆?섍퀬, ?ㅻⅨ ?뚮젅?댁뼱???쒕쾭 ?먯닔(displayScore)瑜??ъ슜?⑸땲??
        let finalPlayerScore = p.displayScore || 0;
        if (p.id === myId) {
            finalPlayerScore = calculateMyLocalDisplayScore();
        }

        li.innerHTML = `
            <div class="${charClass}">
                <img src="${charImg}">
                ${hostIconHtml}
            </div>
            <div class="info">
                <small>${p.name} ${hostIndicatorText}</small>
                <p class="score-display">
                    <span>${Math.floor(finalPlayerScore).toLocaleString()}<small>M</small></span>
                    ${botControlButtonsHTML}
                </p>
            </div>
            ${statHtml}
        `;
        listEl.appendChild(li);
    });
}

/**
 * [?좉퇋] ?꾩옱 ?뚮젅?댁뼱??濡쒖뺄 ?먯닔瑜??ㅼ떆媛꾩쑝濡?怨꾩궛?섏뿬 諛섑솚?⑸땲??
 * 寃뚯엫 HUD ?먯닔? ??궧 紐⑸줉?????먯닔瑜??숆린?뷀븯?????ъ슜?⑸땲??
 * @returns {number} 怨꾩궛???꾩옱 ?뚮젅?댁뼱??理쒖쥌 ?먯닔
 */
function calculateMyLocalDisplayScore() {
    if (!currentUser || !currentRoom) return 0;

    const myId = currentUser.id;
    const myPlayer = multiGamePlayers.find(p => p.id === myId);
    if (!myPlayer) return 0;

    // ?꾩옱 寃뚯엫??吏꾪뻾 以?PLAYING, CRASHED)???뚯쓽 ?ㅼ떆媛??먯닔
    const currentRunScore = (gameState === STATE.PLAYING || gameState === STATE.CRASHED) ? score : 0;

    let displayScore = 0;
    if (currentRoom.rankType === 'total') {
        // ?⑹궛 紐⑤뱶: ?꾩쟻 ?먯닔 + ?꾩옱 ?먯쓽 ?먯닔
        displayScore = (myPlayer.totalScore || 0) + currentRunScore;
    } else {
        // 理쒓퀬??紐⑤뱶: 湲곗〈 理쒓퀬?먭낵 ?꾩옱 ?먯쓽 ?먯닔 以?????媛?
        displayScore = Math.max((myPlayer.bestScore || 0), currentRunScore);
    }
    return displayScore;
}

let raceRoomSnapshot = [];
let myRoomSnapshot = [];

function renderRoomLists(refreshSnapshot = false) {
    const raceRoomList = document.querySelector('#content-race-room .score-list');
    const myRoomList = document.querySelector('#content-my-rooms .score-list');
    if(!raceRoomList || !myRoomList) return;

    // [?좉퇋] ?ㅻ깄??媛깆떊 濡쒖쭅: 紐⑸줉???붾뱾由ъ? ?딅룄濡??뱀젙 ?쒖젏?먮쭔 紐⑸줉 援ъ꽦???뺤젙?⑸땲??
    if (refreshSnapshot) {
        // [FIX] ?덉씠?ㅻ８ ?ㅻ깄???꾪꽣留?洹쒖튃 蹂寃?
        // 1. ?몄썝??苑?李?諛⑹? 紐⑸줉?먯꽌 ?쒖쇅 (`r.current < r.limit` 議곌굔 異붽?)
        // [?섏젙] 苑?李?諛⑸룄 紐⑸줉???몄텧?섎릺 ?낆옣??留됰뒗 諛⑹떇?쇰줈 蹂寃쏀븯?? 遺덈윭??10媛쒓? 紐⑤몢 蹂댁씠?꾨줉 ??(`r.current < r.limit` ?쒓굅)
        // [?섏젙] ?쒕쾭 荑쇰━?먯꽌 where瑜?類먯쑝誘濡??ш린??status ?꾪꽣留??섑뻾
        // [FIX] ?꾪꽣留????ㅼ젙??媛쒖닔(currentRoomLimit)留뚰겮留??섎씪??蹂댁뿬以띾땲??
        // [?붿껌諛섏쁺] 紐⑥쭛 留덇컧??苑?李? 諛⑹? 紐⑸줉?먯꽌 ?쒖쇅?⑸땲??
        // [?섏젙] 'finished' ?곹깭??諛⑸룄 ?뺤썝??李⑥? ?딆븯?ㅻ㈃ 紐⑸줉???쒖떆?섏뿬 ?ъ엯??遺?쒖씠 媛?ν븯?꾨줉 r.status !== 'finished' 議곌굔 ?쒓굅
        raceRoomSnapshot = raceRooms.filter(r => r.current > 0 && r.current < r.limit)
            .slice(0, currentRoomLimit)
            .map(r => r.id);
        
        // 2. ??諛??ㅻ깄?? fetchMyRooms濡?媛?몄삩 ?곗씠???ъ슜
        myRoomSnapshot = myRooms.map(r => r.id);
    }

    raceRoomList.innerHTML = '';
    myRoomList.innerHTML = '';

    // [FIX] ?ъ슜?먭? 李멸???紐⑤뱺 諛⑹쓽 ID 紐⑸줉??誘몃━ 留뚮벊?덈떎. (?덉씠?ㅻ８ 紐⑸줉?먯꽌 以묐났 ?쒖쇅??
    const allMyJoinedRoomIds = (isLoggedIn && currentUser && currentUser.joinedRooms) ? Object.keys(currentUser.joinedRooms) : [];

    raceRooms.forEach(room => {
        // [?섏젙] isFinished ?곹깭瑜??ъ슜?먮퀎 ?곗씠??joinedRooms) 湲곗??쇰줈 ?먮떒
        const userRoomState = (isLoggedIn && currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[room.id] : null;
        const userUsedAttempts = userRoomState ? userRoomState.usedAttempts : 0;

        const rankTypeText = room.rankType === 'total' ? '?⑹궛?? : '理쒓퀬??;
        const lockImg = room.isLocked ? `<img class="lock" src="assets/images/icon_lock.png">` : '';
        
        // [?좉퇋] ?붾쾭源낆슜 遊?異붽?/??젣 踰꾪듉 HTML
        const debugButtonsHTML = (currentUser && currentUser.isAdmin) 
            ? `<button class="debug-btn" data-room-id="${room.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${room.id}" data-action="remove">-</button>`
            : '';

        // 1. ?덉씠?ㅻ８ 紐⑸줉 (怨듦컻):
        // [FIX] ?ㅻ깄?룹뿉 ?ы븿?섍퀬, ?ъ슜?먭? ??踰덈룄 李멸??????녿뒗 諛⑸쭔 ?뚮뜑留곹빀?덈떎.
        // ?대젃寃??섎㈃ '李멸?以묒씤 紐⑸줉'?먯꽌 ?④릿 諛⑹씠 ?ш린???ㅼ떆 ?섑??섏? ?딆뒿?덈떎.
        if (raceRoomSnapshot.includes(room.id) && !allMyJoinedRoomIds.includes(room.id)) {
            const raceLi = document.createElement('li');

            // [FIX] 'already-joined' ?ㅽ??쇱씠 諛??앹꽦 吏곹썑?먮룄 ?곸슜?섎뒗 臾몄젣 ?섏젙
            // 諛⑹뿉 李멸?留????곹깭媛 ?꾨땲?? ?ㅼ젣濡?寃뚯엫???쒖옉(肄붿씤 吏遺??덇굅???쒕룄 ?잛닔瑜??ъ슜??寃쎌슦?먮쭔 ?곸슜?⑸땲??
            if (userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0)) {
                raceLi.classList.add('already-joined');
            }

            // [FIX] ?몄썝??媛??李?諛⑹쓽 ?곹깭? ?낆옣 媛???щ?瑜?紐낇솗??泥섎━?⑸땲??
            const isFull = room.current >= room.limit;
            const statusClass = isFull ? 'finished' : 'inprogress'; 
            const aggIcon = room.limit >= 4 ? '<img class="agg" src="assets/images/icon_agg.png">' : '';
            const statusText = isFull ? `${aggIcon}留덇컧: ${room.current}/${room.limit}紐? : `${aggIcon}紐⑥쭛: ${room.current}/${room.limit}紐?;

            // ?닿? 李멸??섏? ?딆븯怨? ?몄썝??媛??李?諛⑹? ?낆옣 遺덇? 泥섎━
            const isJoinable = !isFull || (isFull && userRoomState);
            if (!isJoinable) {
                raceLi.classList.add('disabled');
            }

            raceLi.innerHTML = `
                <div class="info">
                    <label>
                        <span class="${statusClass}">${statusText}</span>
                        <span class="game_info">${rankTypeText}</span>
                        <img class="coin" src="assets/images/icon_coin.png">
                        <span class="game_info">X <strong>${room.attempts}</strong></span>
                    </label>
                    <p>${room.title} ${debugButtonsHTML}</p>
                </div>
                ${lockImg}
                <span class="stat"><img class="chevron" src="assets/images/ico128-chevron.png"/></span>`;

            raceLi.onclick = () => {
                // ?낆옣 遺덇? 諛??대┃ ???뚮┝
                if (!isJoinable) {
                    alert('?몄썝??紐⑤몢 異⑹썝?섏뿀?듬땲??');
                    return;
                }

                if (room.isLocked && !unlockedRoomIds.includes(room.id)) {
                    showPasswordInput(room);
                } else {
                    attemptToJoinRoom(room);
                }
            };
            raceRoomList.appendChild(raceLi);
        }

    });

    // [?섏젙] 李멸?以묒씤 諛?紐⑸줉 ?뚮뜑留?(myRooms 諛곗뿴 ?ъ슜)
    myRooms.forEach(room => {
        const userRoomState = (isLoggedIn && currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[room.id] : null;
        // [FIX] ?ъ슜?먭? '紐⑸줉?먯꽌 ??젣'?섏뿬 ?④? 泥섎━??諛⑹? ?뚮뜑留곹븯吏 ?딆뒿?덈떎.
        if (userRoomState && !userRoomState.hidden) {
            const rankTypeText = room.rankType === 'total' ? '?⑹궛?? : '理쒓퀬??;
            // [?좉퇋] ?붾쾭源낆슜 遊?異붽?/??젣 踰꾪듉 HTML
            const debugButtonsHTML = (currentUser && currentUser.isAdmin)
                ? `<button class="debug-btn" data-room-id="${room.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${room.id}" data-action="remove">-</button>`
                : '';

            // [FIX] userUsedAttempts 蹂?섍? ?뺤쓽?섏? ?딆븘 ?뚮뜑留곸씠 以묐떒?섎뒗 ?ㅻ쪟 ?섏젙
            const userUsedAttempts = userRoomState.usedAttempts;
            const isMyPlayFinished = userUsedAttempts >= room.attempts;
            const isRoomGloballyFinished = room.status === "finished";

            let myRoomStatusText;
            let myRoomStatusClass;

            if (isRoomGloballyFinished) {
                myRoomStatusText = "醫낅즺";
                myRoomStatusClass = "finished";
            } else {
                myRoomStatusText = `吏꾪뻾以?(${room.current}/${room.limit}紐?`;
                myRoomStatusClass = "inprogress";
            }

            const myLi = document.createElement('li');
            myLi.innerHTML = `
                <div class="info">
                    <label>
                        <span class="${myRoomStatusClass}">${myRoomStatusText}</span>
                        <span class="game_info">${rankTypeText}</span>
                        <img class="coin" src="assets/images/icon_coin.png">
                        <span class="game_info">X <strong>${room.attempts}</strong></span>
                    </label>
                    <p>${room.title} ${debugButtonsHTML}</p>
                </div>
                <span class="stat"><img class="chevron" src="assets/images/ico128-chevron.png"/></span>`;
            myLi.onclick = () => { // [?섏젙] 鍮꾨줈洹몄씤 ?곹깭?먯꽌 ?대┃ ??濡쒓렇???좊룄 (?덉씠?ㅻ８ 紐⑸줉怨?濡쒖쭅 ?듭씪)
                if (!isLoggedIn) {
                    const sceneAuth = document.getElementById('scene-auth');
                    if (sceneAuth) {
                        sceneAuth.classList.remove('hidden');
                        const authMsg = sceneAuth.querySelector('.auth-message');
                        if (authMsg) {
                            authMsg.style.display = 'block';
                            authMsg.innerText = '硫?고뵆?덉씠??濡쒓렇?????댁슜 媛?ν빀?덈떎.';
                        }
                    }
                    return;
                }
                enterGameScene('multi', room);
            };
            myRoomList.appendChild(myLi);
        }
    });

    // [?섏젙] 紐⑸줉??鍮꾩뼱?덉쓣 ???덈궡 臾멸뎄 ?쒖떆 濡쒖쭅 媛쒖꽑
    if (raceRoomList.children.length === 0) {
        raceRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>李몄뿬 媛?ν븳 ?덉씠?ㅻ８???놁뒿?덈떎.</p></div></li>';
    }
    // '李멸?以묒씤 諛? 紐⑸줉 ?곹깭 硫붿떆吏 泥섎━
    if (!isLoggedIn) {
        myRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>濡쒓렇?????댁슜 媛?ν빀?덈떎.</p></div></li>';
    } else if (myRoomList.children.length === 0) {
        myRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>李멸?以묒씤 ?덉씠?ㅻ８???놁뒿?덈떎.</p></div></li>';
    }

    // [?좉퇋] ???곹깭???곕씪 '?붾낫湲? 踰꾪듉(濡쒕뜑) ?쒖떆 ?щ? ?쒖뼱
    const loader = document.getElementById('race-room-loader');
    const myLoader = document.getElementById('my-room-loader');
    const tabRaceRoom = document.getElementById('tab-race-room');
    const isRaceTabActive = tabRaceRoom && tabRaceRoom.classList.contains('active');

    if (isRaceTabActive) {
        if (loader) {
            // ?덉씠?ㅻ８ ?? fetchRaceRooms?먯꽌 ?ㅼ젙??allRoomsLoaded ?곹깭 ?곕쫫
            if (allRoomsLoaded) loader.classList.add('hidden');
            else loader.classList.remove('hidden');
        }
    } else {
        if (myLoader) {
            const totalMyRooms = (isLoggedIn && currentUser && currentUser.joinedRooms) ? Object.keys(currentUser.joinedRooms).length : 0;
            if (totalMyRooms > currentMyRoomLimit) myLoader.classList.remove('hidden');
            else myLoader.classList.add('hidden');
        }
    }
}

async function enterGameScene(mode, roomData = null) { // [?섏젙] 鍮꾨룞湲??⑥닔濡?蹂寃?
    if (!isGameReady) { alert("由ъ냼??濡쒕뵫 以?"); return; }

    // [?좉퇋] 硫?고뵆?덉씠 ?뚯썝 ?꾩슜 泥댄겕 媛뺥솕
    if (mode === 'multi' && !isLoggedIn) {
        const sceneAuth = document.getElementById('scene-auth');
        if (sceneAuth) {
            sceneAuth.classList.remove('hidden');
            const authMsg = sceneAuth.querySelector('.auth-message');
            if (authMsg) {
                authMsg.style.display = 'block';
                authMsg.innerText = '硫?고뵆?덉씠??濡쒓렇?????댁슜 媛?ν빀?덈떎.';
            }
        }
        return;
    }

    currentGameMode = mode;
    currentRoom = roomData; 

    // [?좉퇋] 鍮꾩젙??醫낅즺 蹂듦뎄瑜??꾪빐 ?꾩옱 寃뚯엫 ?곹깭瑜??몄뀡 ?ㅽ넗由ъ???湲곕줉?⑸땲??
    if (mode === 'multi' && roomData) {
        sessionStorage.setItem('activeRoomId', roomData.id);
    } else if (mode === 'single') {
        // ?깃? 紐⑤뱶???쇨??깆쓣 ?꾪빐 湲곕줉?⑸땲??
        sessionStorage.setItem('activeRoomId', 'single_player_mode');
    }

    // [?좉퇋] 吏꾩엯 ??踰꾪듉 鍮꾩슜 UI ?낅뜲?댄듃 (?깃? 1肄붿씤, 硫???ㅼ젙???뚯감留뚰겮)
    updateButtonCosts();

    document.getElementById('scene-intro').classList.add('hidden');
    document.getElementById('scene-game').classList.remove('hidden');

    if (mode === 'single') {
        currentRoom = { attempts: 1, usedAttempts: 0, title: "?깃? ?뚯뒪??, status: "inprogress" };
        document.getElementById('view-single-mode').classList.remove('hidden');
        document.getElementById('view-multi-rank').classList.add('hidden');
    } else {
        document.getElementById('view-single-mode').classList.add('hidden');
        document.getElementById('view-multi-rank').classList.remove('hidden');

        // [?섏젙] ??궧 諛⑹떇(?⑹궛/理쒓퀬?? ?띿뒪???숈쟻 ?낅뜲?댄듃
        const rankSpan = document.querySelector('#view-multi-rank .list-title span');
        if (rankSpan) {
            rankSpan.innerText = currentRoom.rankType === 'total' ? '(?먯닔?⑹궛)' : '(理쒓퀬?먯닔)';
        }

        // [?좉퇋] 寃뚯엫 ????궧 紐⑸줉???붾쾭源낆슜 遊?異붽?/??젣 踰꾪듉 異붽?
        const listTitle = document.querySelector('#view-multi-rank .list-title');
        if (listTitle) {
            // 湲곗〈 踰꾪듉 洹몃９???덈떎硫??쒓굅
            const oldButtons = listTitle.querySelector('.debug-btn-group');
            if (oldButtons) oldButtons.remove();

            if (currentUser && currentUser.isAdmin) { // [?섏젙] 愿由ъ옄留?踰꾪듉 ?쒖떆
                const buttonGroup = document.createElement('div');
                buttonGroup.className = 'debug-btn-group';
                buttonGroup.style.marginLeft = 'auto'; // 踰꾪듉???ㅻⅨ履쎌쑝濡?諛湲?
                buttonGroup.innerHTML = `<button class="debug-btn" data-room-id="${currentRoom.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${currentRoom.id}" data-action="remove">-</button>`;
                listTitle.appendChild(buttonGroup);
            }
        }
    }

    // --- 硫?고뵆?덉씠??紐⑤뱶 濡쒖쭅 ---
    if (mode === 'multi') {
        // [?좉퇋] 硫?고뵆?덉씠 紐⑤뱶?먯꽌??吏꾩엯 利됱떆 寃뚯엫 猷⑦봽瑜??ㅽ뻾?섏뿬 遊??곹깭瑜??숆린?뷀빀?덈떎.
        // 寃뚯엫 ?쒖옉 ??IDLE)?대씪??遊??쒕??덉씠?섏? ?뚯븘???섍린 ?뚮Ц?낅땲??
        if (!gameLoopId) {
            gameLoop();
        }

        // [FIX] 李멸????깅줉 濡쒖쭅??enterGameScene?먯꽌 ?쒓굅?섍퀬, 諛??앹꽦/李멸? ?⑥닔濡??댁쟾?⑸땲??
        // enterGameScene? ?댁젣 ?쒕쾭???덈뒗 李멸???紐⑸줉??洹몃?濡??쎌뼱? ?붾㈃??洹몃━????븷留??대떦?⑸땲??
        const myPlayerId = currentUser.id;
        const roomRef = db.collection('rooms').doc(currentRoom.id);
        const participantsRef = roomRef.collection('participants');

        try {
            // 珥덇린 李멸???紐⑸줉????踰?遺덈윭?듬땲??
            const initialParticipantsSnapshot = await participantsRef.get();
            multiGamePlayers = initialParticipantsSnapshot.docs.map(doc => doc.data());

            // 李멸???紐⑸줉??????ㅼ떆媛?由ъ뒪?덈? 遺李⑺빀?덈떎.
            if (unsubscribeParticipantsListener) unsubscribeParticipantsListener(); // 湲곗〈 由ъ뒪???댁젣
            unsubscribeParticipantsListener = participantsRef.onSnapshot((snapshot) => {
                multiGamePlayers = snapshot.docs.map(doc => doc.data());
                renderMultiRanking();
            }, (error) => {
                console.error("??Participants listener error:", error);
            });

        } catch (error) {
            console.error("??李멸???紐⑸줉 濡쒕뵫 ?먮뒗 由ъ뒪???ㅼ젙 ?ㅽ뙣:", error);
            alert("諛⑹뿉 李멸??섎뒗 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. 濡쒕퉬濡??뚯븘媛묐땲??");
            exitToLobby(false); // ?먮윭 ???뚰봽???댁옣
            return;
        }

        const userRoomState = currentUser.joinedRooms[currentRoom.id];
        const userUsedAttempts = userRoomState ? userRoomState.usedAttempts : 0;
        const myPlayerInRoom = multiGamePlayers.find(p => p.id === myPlayerId); // ?댁젣 myPlayerId????긽 currentUser.id ?낅땲??

        // [FIX] 寃뚯엫 ?꾨즺(紐⑤뱺 湲고쉶 ?뚯쭊) ?먮뒗 諛?醫낅즺 ???ъ엯?ν븯硫?'?쒖옉' ?붾㈃???⑤뒗 踰꾧렇 ?섏젙
        // ?먯씤: 1. 諛⑹씠 醫낅즺('finished')?섏뿀嫄곕굹 ??紐⑤뱺 湲고쉶瑜??뚯쭊?덉쓬?먮룄, 議곌굔臾?濡쒖쭅??臾몄젣濡??쒖옉 ?붾㈃???쒖떆?????덉뿀?듬땲??
        //       2. ?쒕룄 ?잛닔(usedAttempts)媛 ?쒕쾭??利됱떆 ??λ릺吏 ?딆븘, ?ъ엯?????숆린?붽? 源⑥???臾몄젣媛 ?덉뿀?듬땲??
        const isMyGameOver = userUsedAttempts >= currentRoom.attempts;
        const isRoomFinished = currentRoom.status === 'finished';

        if (myPlayerInRoom && (isMyGameOver || isRoomFinished)) {
            // 1. 諛⑹씠 醫낅즺?섏뿀嫄곕굹 ??寃뚯엫???앸궃 ?곹깭?대?濡? 紐⑤뱺 ?뚮젅?댁뼱 ?곹깭瑜?'dead'濡?媛뺤젣 ?숆린?뷀빀?덈떎.
            // [2?④퀎] ?쒕쾭 ?곗씠?곌? 吏꾩떎 怨듦툒?먯씠誘濡? ?대씪?댁뼵?몄뿉???꾩쓽濡??곹깭瑜?蹂寃쏀븷 ?꾩슂媛 ?놁뒿?덈떎.
            // onSnapshot 由ъ뒪?덇? ?쒕쾭??理쒖쥌 ?곹깭瑜??뺥솗??諛섏쁺?댁쨳?덈떎.
            if (myPlayerInRoom) myPlayerInRoom.status = 'dead';
            
            // 2. 'GAME OVER' ?붾㈃???쒖떆?섍퀬 利됱떆 ?⑥닔瑜?醫낅즺?섏뿬, '?쒖옉' ?붾㈃???쒖떆?섏? ?딅룄濡??⑸땲??
            resetGame();
            gameState = STATE.GAMEOVER;
            // [FIX] ?ъ엯????諛곌꼍???吏곸씠??踰꾧렇 ?섏젙: 寃뚯엫 猷⑦봽??遊??쒕??덉씠?섏쓣 ?꾪빐 ?ㅽ뻾?섏?留?
            // ?붾㈃ ?붿냼(諛곌꼍 ??媛 ?吏곸씠吏 ?딅룄濡?寃뚯엫 ?띾룄瑜?0?쇰줈 ?ㅼ젙?⑸땲??
            gameSpeed = 0;
            drawStaticFrame();
            document.getElementById('game-over-screen').classList.remove('hidden');
            handleGameOverUI();
            renderMultiRanking();

            // [FIX] ?닿? 寃뚯엫?ㅻ쾭 ?곹깭?쇰룄, ?닿? 諛⑹옣??寃쎌슦 ?ㅻⅨ 遊뉖뱾???쒕??덉씠?섑빐???섎?濡?寃뚯엫 猷⑦봽瑜??ㅽ뻾?⑸땲??
            // 寃뚯엫 猷⑦봽??gameState媛 'gameover'?????뚮젅?댁뼱 罹먮┃?곕뒗 ?吏곸씠吏 ?딆?留? handleMultiplayerTick()? 怨꾩냽 ?몄텧?⑸땲??
            if (gameLoopId) cancelAnimationFrame(gameLoopId);
            gameLoop();

            return; // ?섎㉧吏 吏꾩엯 濡쒖쭅? 嫄대꼫?곷땲??
        }

        // 2. ?쇱떆?뺤? ?곹깭?먯꽌 ?ъ엯??
        if (myPlayerInRoom && myPlayerInRoom.status === 'paused') {
            drawStaticFrame();
            gameState = STATE.PAUSED;
            document.getElementById('game-pause-screen').classList.remove('hidden');
            document.getElementById('btn-pause-toggle').classList.add('paused');
            startAutoActionTimer(30, 'start', '#game-pause-screen .time-message');
            renderMultiRanking();
            return;
        }

        // 3. [?섏젙] ?쒖옉?붾㈃???꾨땲???ъ떆??WOOPS) ?붾㈃?쇰줈 ?쒖옉?섎룄濡?濡쒖쭅 蹂寃?
        // [FIX] ?ъ엯?????곹깭 ?먯젙 濡쒖쭅???쒕쾭 ?곗씠??`userUsedAttempts`) 湲곗??쇰줈 ?⑥닚?뷀븯???숆린??臾몄젣瑜??닿껐?⑸땲??
        // 湲곗〈 濡쒖쭅? 濡쒖뺄 `gameState`??罹먯떆??`status`???섏〈?섏뿬, ?곗씠?곌? 遺덉씪移섑븷 寃쎌슦 ?섎せ???붾㈃(?쒖옉 ?붾㈃)???쒖떆?섎뒗 臾몄젣媛 ?덉뿀?듬땲??
        if (myPlayerInRoom && userUsedAttempts > 0) {
            // ?쒕룄 ?잛닔媛 1???댁긽 ?뚯쭊???곹깭?대?濡? '?ъ떆???湲? ?곹깭濡??숆린?뷀빀?덈떎.
            myPlayerInRoom.status = 'waiting';
            drawStaticFrame();
            gameState = STATE.GAMEOVER; // ?곹깭 ?숆린??
            document.getElementById('game-over-screen').classList.remove('hidden');
            handleGameOverUI(); 
            renderMultiRanking();
            return;
        }

        // 4. 洹??몄쓽 寃쎌슦 (?? 泥??쒖옉 ?湲???湲곕낯 ?쒖옉 ?붾㈃?쇰줈 吏꾪뻾?⑸땲??
        if (myPlayerInRoom) myPlayerInRoom.status = 'waiting';

        // 泥??낆옣?닿굅?? ?ъ엯?????댁쟾 ?곹깭 蹂듭썝???꾩슂 ?녿뒗 寃쎌슦(?? 泥??쒖옉 ?湲?
        resetGame();
        // [?섏젙] ?쒖옉 ?湲??붾㈃??蹂댁씪 ?뚮쭔 而⑦듃濡ㅻ윭瑜??④?
        setControlsVisibility(false);
        drawStaticFrame();
        document.getElementById('game-start-screen').classList.remove('hidden');
        startAutoActionTimer(15, 'exit', '#game-start-screen .time-message');
        renderMultiRanking(); // ??궧 紐⑸줉 媛깆떊
    } else { // ?깃? 紐⑤뱶 濡쒖쭅 (湲곗〈怨??숈씪)
        // [?섏젙] ?깃? 紐⑤뱶?먯꽌??寃뚯엫 ?쒖옉 以鍮??붾㈃???꾩썙以띾땲??
        resetGame();
        // [?섏젙] ?쒖옉 ?湲??붾㈃??蹂댁씪 ?뚮쭔 而⑦듃濡ㅻ윭瑜??④?
        setControlsVisibility(false);
        drawStaticFrame();
        document.getElementById('game-start-screen').classList.remove('hidden');
    }
}

/**
 * [?좉퇋] 鍮꾨?踰덊샇 ?낅젰 紐⑤떖???꾩썎?덈떎.
 */
function showPasswordInput(room) {
    targetRoom = room;
    const scene = document.getElementById('scene-password-input');
    const input = document.getElementById('input-room-password');
    const msg = document.getElementById('password-message');
    
    if (input) input.value = '';
    if (msg) {
        msg.innerText = '';
        msg.style.display = 'none'; // 珥덇린????硫붿떆吏 ?④?
    }
    if (scene) scene.classList.remove('hidden');
}

/**
 * [?좉퇋] ??踰꾪듉 ?대┃ ??泥섎━ (?곹깭???곕씪 ?뺤씤 ?앹뾽 ?먮뒗 利됱떆 ?대룞)
 */
function handleHomeButtonClick() {
    // 1. ?쇱떆?뺤? ?곹깭?닿굅??
    // 2. 寃뚯엫?ㅻ쾭(異⑸룎) ?곹깭?댁?留??꾩쭅 ?쒕룄 ?잛닔媛 ?⑥븘???ъ떆?묒씠 媛?ν븳 寃쎌슦 ('WOOPS' ?붾㈃)
    // -> ?뺤씤 ?앹뾽 ?몄텧
    let isInProgress = false;

    if (gameState === STATE.PAUSED) {
        isInProgress = true;
    } else if (gameState === STATE.GAMEOVER) {
        // 硫?고뵆?덉씠 紐⑤뱶?먯꽌 ?쒕룄 ?잛닔媛 ?⑥븯?붿? ?뺤씤
        if (currentGameMode === 'multi' && currentRoom) {
            // [FIX] onSnapshot???섑빐 myPlayer.attemptsLeft媛 珥덇린?붾맆 ???덉쑝誘濡?
            // currentUser.joinedRooms瑜?湲곗??쇰줈 ?⑥? ?잛닔瑜?吏곸젒 怨꾩궛?⑸땲??
            const userRoomState = (currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[currentRoom.id] : null;
            const usedAttempts = userRoomState ? userRoomState.usedAttempts : 0;
            const attemptsLeft = currentRoom.attempts - usedAttempts;

            if (attemptsLeft > 0) {
                isInProgress = true;
            }
        }
    }

    if (isInProgress) {
        const sceneExitConfirm = document.getElementById('scene-exit-confirm');
        if (sceneExitConfirm) sceneExitConfirm.classList.remove('hidden');
    } else {
        // [FIX] 寃뚯엫 ?쒖옉 ???꾨? 援щ텇?섏뿬 ?댁옣 諛⑹떇 寃곗젙
        const userRoomState = (currentUser && currentRoom) ? currentUser.joinedRooms[currentRoom.id] : null;
        const hasStartedPlaying = userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0);
        // 寃뚯엫???쒖옉?덉쑝硫??뚰봽???댁옣, ?쒖옉 ?꾩씠硫??꾩쟾 ?댁옣
        exitToLobby(!hasStartedPlaying);
    }
}

/**
 * [?좉퇋] ?꾩옱 諛⑹쓣 紐⑸줉?먯꽌 ??젣?섍퀬 濡쒕퉬濡??대룞
 */
async function deleteCurrentRoom() {
    if (!currentRoom || !currentRoom.id) {
        console.warn("??젣??諛??뺣낫媛 ?놁뒿?덈떎. 濡쒕퉬濡??대룞?⑸땲??");
        exitToLobby(false);
        return;
    }

    const roomId = currentRoom.id;

    try {
        // 1. db.collection('rooms').doc(roomId).delete()瑜??ъ슜?섏뿬 ?쒕쾭?먯꽌 ?대떦 ?곗씠?곕? ??젣?⑸땲??
        await db.collection('rooms').doc(roomId).delete();
        console.log(`??諛?[${roomId}]??媛) ?쒕쾭?먯꽌 ?깃났?곸쑝濡???젣(??뙆)?섏뿀?듬땲??`);

        // 2. ??젣 ?깃났 ???좎?瑜?硫붿씤 濡쒕퉬濡??대룞?쒗궢?덈떎.
        // onSnapshot 由ъ뒪?덇? 諛?紐⑸줉 UI瑜??먮룞?쇰줈 媛깆떊??寃껋엯?덈떎.
        // exitToLobby()???대??곸쑝濡?留롮? 濡쒖뺄 ?뺣━瑜??섑뻾?섎?濡??ъ궗?⑺빀?덈떎.
        // exitToLobby()媛 ???댁긽 議댁옱?섏? ?딅뒗 諛⑹뿉 ???濡쒖쭅???섑뻾?섏? ?딅룄濡?currentRoom??null濡??ㅼ젙?⑸땲??
        currentRoom = null;
        exitToLobby(false);
    } catch (error) {
        console.error(`??諛?[${roomId}] ??젣 ?ㅽ뙣:`, error);
        alert("諛⑹쓣 ??젣?섎뒗 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.");
    }
}

/**
 * [FIX] '李멸?以묒씤 紐⑸줉'?먯꽌 ?꾩옱 諛⑹쓣 ?쒓굅?⑸땲?? (DB?먯꽌 諛⑹쓣 ??젣?섏? ?딆쓬)
 * 湲곗〈 deleteCurrentRoom? 諛??먯껜瑜?DB?먯꽌 ??젣?섏뿬 紐⑤뱺 李멸??먯뿉寃??곹뼢??二쇰뒗 踰꾧렇媛 ?덉뿀?듬땲??
 * ???⑥닔???꾩옱 濡쒓렇?명븳 ?좎???'李멸? 紐⑸줉'?먯꽌留?諛⑹쓣 ?쒓굅?⑸땲??
 */
async function removeFromMyRooms() {
    if (!currentRoom || !currentRoom.id || !currentUser) {
        console.warn("紐⑸줉?먯꽌 ?쒓굅??諛??뺣낫媛 ?놁뒿?덈떎.");
        await exitToLobby(false);
        return;
    }

    const roomId = currentRoom.id;
    const myId = currentUser.id;

    try {
        // [?섏젙] '紐⑸줉?먯꽌 ??젣'??2?④퀎濡??숈옉?⑸땲??
        // 1. ?좎???媛쒖씤 joinedRooms 紐⑸줉??hidden ?뚮옒洹몃? ?ㅼ젙?섏뿬 '李멸?以? ??뿉??蹂댁씠吏 ?딄쾶 ?⑸땲??
        // 2. 以묒븰 ?곗씠?곗씤 participants ?쒕툕而щ젆?섏뿉??hidden ?뚮옒洹몃? ?ㅼ젙?섏뿬, 紐⑤뱺 ?좎?媛 ?섍컮????諛⑹쓣 理쒖쥌 ??젣?????덈룄濡??⑸땲??
        if (currentUser.joinedRooms[roomId]) {
            currentUser.joinedRooms[roomId].hidden = true; // 濡쒖뺄 ?곹깭 ?낅뜲?댄듃
            await db.collection("users").doc(myId).update({
                [`joinedRooms.${roomId}.hidden`]: true // Firestore??'hidden' ?뚮옒洹몃쭔 ?낅뜲?댄듃
            });
        }

        // 以묒븰 李멸???紐⑸줉?먮룄 ?④? 泥섎━
        const participantRef = db.collection('rooms').doc(roomId).collection('participants').doc(myId);
        await participantRef.update({ hidden: true });

        console.log(`??諛?[${roomId}]??瑜? '李멸?以묒씤 紐⑸줉'?먯꽌 ?④꼈?듬땲??`);

        // UI ?뺣━瑜??꾪빐 濡쒕퉬濡??대룞?⑸땲?? (?뚰봽???댁옣)
        await exitToLobby(false);

    } catch (error) {
        console.error("??'李멸?以묒씤 紐⑸줉'?먯꽌 諛??④린湲??ㅽ뙣:", error);
        alert("紐⑸줉?먯꽌 諛⑹쓣 ?쒓굅?섎뒗 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
    }
}

/**
 * [?좉퇋] 愿묎퀬 ?곗씠???ㅻ뒛 ?쒖껌 ?잛닔)瑜?媛?몄삤怨??좎쭨瑜?泥댄겕?⑸땲??
 */
function getAdData() {
    const today = new Date().toDateString(); // "Mon Mar 13 2023" ?뺤떇
    let data = JSON.parse(localStorage.getItem('chickenRunAdData')) || { date: today, count: 0 };

    // ?좎쭨媛 諛붾뚯뿀?쇰㈃ ?잛닔 珥덇린??
    if (data.date !== today) {
        data = { date: today, count: 0 };
        localStorage.setItem('chickenRunAdData', JSON.stringify(data));
    }
    return data;
}

/**
 * [?좉퇋] 愿묎퀬 ?쒖껌 ?쒕??덉씠??諛?蹂댁긽 吏湲?
 */
function watchAdAndGetReward() {
    let adTimerInterval = null; // [?좉퇋] ??대㉧ ID瑜???ν븷 蹂??
    if (!currentUser) {
        alert('濡쒓렇?????댁슜?댁＜?몄슂.');
        return;
    }

    const adData = getAdData();
    if (adData.count >= AD_CONFIG.DAILY_LIMIT) {
        alert(`?ㅻ뒛??愿묎퀬 ?쒖껌 ?잛닔瑜?紐⑤몢 ?뚯쭊?덉뒿?덈떎.\n(留ㅼ씪 ?먯젙??珥덇린?붾맗?덈떎.)`);
        return;
    }

    // 愿묎퀬 ?ㅻ쾭?덉씠 ?앹꽦 (?놁쑝硫??앹꽦)
    let adOverlay = document.getElementById('scene-ad-overlay');
    if (!adOverlay) {
        adOverlay = document.createElement('div');
        adOverlay.id = 'scene-ad-overlay';
        document.body.appendChild(adOverlay);
    } else {
        adOverlay.classList.remove('hidden');
    }

    // [UX 媛쒖꽑] 愿묎퀬 ?쒖껌 以?UI? 蹂댁긽 ?띾뱷 UI瑜?遺꾨━?섏뿬 ?뚮뜑留?
    adOverlay.innerHTML = `
        <!-- 1. 愿묎퀬 ?쒖껌 以??붾㈃ -->
        <div id="ad-view-loading" class="ad-view">
            <!-- ?곷떒 吏꾪뻾瑜??쒖떆 UI -->
            <div class="ad-ui-container">
                <div class="ad-progress-bar-wrapper">
                    <div id="ad-progress-bar"></div>
                </div>
            </div>

            <!-- [?섏젙] ?リ린(?ш린) 踰꾪듉: ?곷떒 ?곗륫 -->
            <!-- [?섏젙] 踰꾪듉 ?듯빀: 珥덇린?먮뒗 ?リ린, ?꾨즺 ???쒖껌?꾨즺 踰꾪듉?쇰줈 蹂??-->
            <button id="btn-ad-close-video">??Close</button>

            <!-- (媛?? 愿묎퀬 而⑦뀗痢??곸뿭 -->
            <p>愿묎퀬 ?곸긽???ъ깮?섎뒗 以묒엯?덈떎...</p>
            <div class="spinner"></div>
        </div>

        <!-- 2. 蹂댁긽 ?띾뱷 ?붾㈃ (珥덇린?먮뒗 ?④?) -->
        <div id="ad-view-finished" class="ad-view" style="display:none;">
            <img src="assets/images/icon_coin.png" style="width:4rem; image-rendering: pixelated;">
            <p style="font-size: 1.5rem; color: #ffd02d; font-family: 'KoreanYNMYTM';">蹂댁긽 ?띾뱷!</p>
            <p style="font-size: 1rem;">+${AD_CONFIG.REWARD} 肄붿씤</p>
            <div style="width: 100%; display: flex; justify-content: center;">
                <button id="btn-ad-close" class="pixelbtn pixelbtn--primary">?リ린</button>
            </div>
        </div>
    `;

    // UI ?붿냼 媛?몄삤湲?
    const progressBar = document.getElementById('ad-progress-bar');
    const btnCloseVideo = document.getElementById('btn-ad-close-video');

    // 1. X 踰꾪듉 (Close) ?대깽?? 蹂댁긽 ?ш린
    btnCloseVideo.onclick = () => {
        clearInterval(adTimerInterval);
        adOverlay.classList.add('hidden');
        alert('愿묎퀬瑜?嫄대꼫?곗뼱 蹂댁긽??諛쏆? 紐삵뻽?듬땲??');
    };

    // 10珥?移댁슫?몃떎??諛??꾨줈洹몃젅??諛??쒕??덉씠??
    const adStartTime = Date.now();
    adTimerInterval = setInterval(() => {
        const elapsedTime = Date.now() - adStartTime;
        const progress = Math.min(100, (elapsedTime / AD_CONFIG.DURATION) * 100);

        if (progressBar) progressBar.style.width = `${progress}%`;

        // 愿묎퀬 ?쒖껌 ?쒓컙 異⑹”
        if (elapsedTime >= AD_CONFIG.DURATION) {
            clearInterval(adTimerInterval);

            // [?섏젙] 踰꾪듉 ?섎굹濡??듯빀: ?띿뒪?몄? ?ㅽ??? ?숈옉??蹂寃?
            if (btnCloseVideo) {
                btnCloseVideo.innerText = "?쒖껌?꾨즺 ??씚";
                
                // ?대┃ ?대깽???ъ젙??(蹂댁긽 ?띾뱷 濡쒖쭅?쇰줈 援먯껜)
                btnCloseVideo.onclick = () => {
                    const viewLoading = document.getElementById('ad-view-loading');
                    const viewFinished = document.getElementById('ad-view-finished');
                    if (viewLoading) viewLoading.style.display = 'none';
                    if (viewFinished) viewFinished.style.display = 'flex';

                    currentUser.coins += AD_CONFIG.REWARD;
                    const currentAdData = getAdData();
                    currentAdData.count++;
                    localStorage.setItem('chickenRunAdData', JSON.stringify(currentAdData));
                    syncCoinsToServer(currentUser.coins);
                    updateCoinUI();
                };
            }
        }
    }, 50); // 50ms 媛꾧꺽?쇰줈 遺?쒕읇寃??낅뜲?댄듃

    // 蹂댁긽 ?띾뱷 ?붾㈃???リ린 踰꾪듉 ?대깽??(誘몃━ 諛붿씤??
    // (innerHTML濡??덈줈 ?앹꽦?섎?濡??ш린??諛붿씤???꾩슂)
    // 二쇱쓽: ?꾩そ btnRewardSkip.onclick ?대?媛 ?꾨땲??諛붽묑?먯꽌 諛붿씤?⑺빐????
    // ?섏?留?btn-ad-close ?붿냼??btnRewardSkip ?대┃ ???붾㈃???꾪솚?섏뼱??蹂댁씠誘濡?
    // ?대깽???꾩엫?대굹 ?붾㈃ ?꾪솚 ?쒖젏??諛붿씤?⑺븯??寃껋씠 ?덉쟾??
    // ?ш린?쒕뒗 媛꾨떒??document ?덈꺼?먯꽌 泥섎━?섍굅?? ?붾㈃ ?꾪솚 ?쒖젏??泥섎━.
    // ??肄붾뱶 援ъ“??btnRewardSkip ?대┃ ?몃뱾???덉뿉?쒕뒗 DOM???대? 議댁옱?섎?濡?
    // btn-ad-close?????泥섎━???꾨옒? 媛숈씠 ?섏젙?⑸땲??
    
    // [?섏젙] 蹂댁긽 ?붾㈃ ?リ린 踰꾪듉? ?뺤쟻 HTML 臾몄옄?댁뿉 ?ы븿?섏뼱 ?덉쑝誘濡?
    // ?붾㈃ ?꾪솚 濡쒖쭅怨?臾닿??섍쾶 誘몃━ 諛붿씤??媛??(?? ?붿냼媛 DOM??異붽???吏곹썑)
    const btnCloseReward = document.getElementById('btn-ad-close');
    if (btnCloseReward) {
        btnCloseReward.onclick = () => {
            adOverlay.classList.add('hidden');
        };
    }
}

/**
 * [媛쒕컻?? 愿묎퀬 ?쒖껌 ?잛닔瑜?珥덇린?뷀빀?덈떎.
 * 釉뚮씪?곗? 媛쒕컻??肄섏넄?먯꽌 `resetAdCount()`瑜??몄텧?섏뿬 ?ъ슜?????덉뒿?덈떎.
 */
function resetAdCount() {
    // 媛??媛꾨떒??諛⑸쾿? ??λ맂 愿묎퀬 ?곗씠?곕? ??젣?섎뒗 寃껋엯?덈떎.
    // getAdData() ?⑥닔???곗씠?곌? ?놁쓣 寃쎌슦 ?먮룞?쇰줈 ?ㅻ뒛 ?좎쭨? 0?뚮줈 ?덈줈 ?앹꽦?⑸땲??
    localStorage.removeItem('chickenRunAdData');
    console.log('愿묎퀬 ?쒖껌 ?잛닔 ?곗씠?곌? 珥덇린?붾릺?덉뒿?덈떎.');
    alert('愿묎퀬 ?쒖껌 ?잛닔媛 珥덇린?붾릺?덉뒿?덈떎.');
    // UI???잛닔 ?쒖떆瑜?利됱떆 媛깆떊?⑸땲??
    updateCoinUI();
}

/**
 * [媛쒕컻?? 紐⑤뱺 諛⑹쓽 李멸????뺣낫瑜?珥덇린?뷀븯??紐⑸줉??由ъ뀑?⑸땲??
 * 釉뚮씪?곗? 媛쒕컻??肄섏넄?먯꽌 `resetRoomData()`瑜??몄텧?섏뿬 ?ъ슜?????덉뒿?덈떎.
 */
function resetRoomData() {
    if (confirm('?뺣쭚濡?紐⑤뱺 諛⑹쓽 李멸????뺣낫瑜?珥덇린?뷀븯?쒓쿋?듬땲源? 諛⑹씠 紐⑤몢 "紐⑥쭛以? ?곹깭濡??뚯븘媛묐땲??')) {
        localStorage.removeItem('chickenRunRoomStates');
        console.log('諛??곗씠?곌? 珥덇린?붾릺?덉뒿?덈떎. ?섏씠吏瑜??덈줈怨좎묠?⑸땲??');
        alert('諛??곗씠?곌? 珥덇린?붾릺?덉뒿?덈떎. ?섏씠吏瑜??덈줈怨좎묠?⑸땲??');
    }
}

/**
 * [?좉퇋] 援ш? 濡쒓렇???⑥닔
 */
function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    // [FIX] 援ш? 濡쒓렇?????대찓?쇨낵 ?꾨줈???뺣낫瑜?紐낆떆?곸쑝濡??붿껌?⑸땲?? (Scope 異붽?)
    provider.addScope('profile');
    provider.addScope('email');
    
    // signInWithPopup???몄텧?섎㈃ onAuthStateChanged 由ъ뒪?덇? 濡쒓렇??寃곌낵瑜?媛먯??⑸땲??
    firebase.auth().signInWithPopup(provider).catch((error) => {
        console.error("??濡쒓렇???앹뾽 ?ㅽ뙣:", error.message);
        // ?ъ슜?먭? ?앹뾽???ル뒗 ?깆쓽 ?ㅻ쪟??臾댁떆?대룄 愿쒖갖?듬땲??
        if (error.code !== 'auth/popup-closed-by-user') {
            alert("濡쒓렇??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: " + error.message);
        }
    });
}

/**
 * [?좉퇋] ?쒕쾭?먯꽌 ?좎? ?곗씠?곕? 遺덈윭?ㅺ굅?? ?좉퇋 ?좎???寃쎌슦 ?앹꽦?⑸땲??
 * [?섏젙] onSnapshot???ъ슜?섏뿬 ?ㅼ떆媛??곗씠???숆린??援ы쁽
 */
function loadUserData(user) {
    const userRef = db.collection("users").doc(user.uid);
    
    if (unsubscribeUserData) {
        unsubscribeUserData();
        unsubscribeUserData = null;
    }
    
    // [?섏젙] ?댁젣 ?ъ슜??臾몄꽌 ?앹꽦? 諛깆뿏??Cloud Function)?먯꽌 ?먮룞?쇰줈 泥섎━?⑸땲??
    // ?대씪?댁뼵?몃뒗 臾몄꽌媛 ?앹꽦???뚭퉴吏 湲곕떎?몃떎媛 ?곗씠?곕? ?쎄린留??섎㈃ ?섎?濡? 沅뚰븳 ?ㅻ쪟媛 諛쒖깮?섏? ?딆뒿?덈떎.
    // onSnapshot? 臾몄꽌媛 ?녿떎媛 ?앹꽦?섎㈃ ?먮룞?쇰줈 媛먯??섏뿬 ?곗씠?곕? 媛?몄샃?덈떎.
    let initialLoadComplete = false;
    unsubscribeUserData = userRef.onSnapshot((snapshot) => {
        // 臾몄꽌媛 ?꾩쭅 ?앹꽦?섏? ?딆븯?????덉뒿?덈떎. ??寃쎌슦 ?ㅻ깄?룹? 議댁옱?섏? ?딆쑝硫?
        // 諛깆뿏?쒖뿉??臾몄꽌瑜??앹꽦?섎㈃ ??由ъ뒪?덇? ?ㅼ떆 ?몄텧?⑸땲??
        if (!snapshot.exists) {
            console.log("?ъ슜???꾨줈?꾩쓣 湲곕떎由щ뒗 以?..");
            return;
        }

        const userData = snapshot.data();

        // currentUser 媛앹껜 ?ㅼ젙/?낅뜲?댄듃
        const providerInfo = user.providerData && user.providerData[0] ? user.providerData[0] : null;
        const correctEmail = user.email || (providerInfo ? providerInfo.email : null);
        const isAdminUser = ADMIN_UIDS.includes(user.uid);

        currentUser = {
            ...currentUser,
            ...userData,
            email: correctEmail || userData.email,
            isAdmin: isAdminUser
        };

        // 理쒖큹 濡쒕뱶 ?쒖뿉留??ㅽ뻾??濡쒖쭅 (UI 珥덇린?? 鍮꾩젙??醫낅즺 蹂듦뎄 ??
        if (!initialLoadComplete) {
            initialLoadComplete = true;

            if (correctEmail && userData.email !== correctEmail) {
                userRef.update({ email: correctEmail }).then(() => console.log("?뵩 Firestore???대찓???뺣낫瑜?理쒖떊 ?뺣낫濡??섏젙?덉뒿?덈떎."));
            }

            const lastActiveRoomId = sessionStorage.getItem('activeRoomId');
            if (lastActiveRoomId) {
                sessionStorage.removeItem('activeRoomId');
                if (lastActiveRoomId === 'single_player_mode') {
                    console.log('?좑툘 鍮꾩젙??醫낅즺 媛먯?: ?깃? ?뚮젅??寃뚯엫??醫낅즺 泥섎━?덉뒿?덈떎.');
                } else {
                    console.log(`?좑툘 鍮꾩젙??醫낅즺 媛먯?: 諛?[${lastActiveRoomId}]?먯꽌 ?댁옣 泥섎━瑜??쒖옉?⑸땲??`);
                     const userRoomState = userData.joinedRooms ? userData.joinedRooms[lastActiveRoomId] : null;
                    const hasStartedPlaying = userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0);
                    performServerExit(lastActiveRoomId, !hasStartedPlaying);
                }
            }

            console.log(`[Auth] User: ${currentUser.email}, IsAdmin: ${isAdminUser}`);
            isLoggedIn = true;
            document.getElementById('scene-auth').classList.add('hidden');
            roomFetchPromise = null;
            fetchRaceRooms(false);
            fetchMyRooms();
        }

        // ?곗씠??蹂寃??쒕쭏????긽 ?ㅽ뻾??UI ?낅뜲?댄듃
        updateCoinUI();
        fetchMyRooms();
        const sceneUserProfile = document.getElementById('scene-user-profile');
        if (sceneUserProfile && !sceneUserProfile.classList.contains('hidden')) {
            showUserProfile();
        }
    }, (error) => {
        console.error("???좎? ?곗씠???ㅼ떆媛??섏떊 ?ㅽ뙣:", error);
        alert("?좎? ?뺣낫瑜??ㅼ떆媛꾩쑝濡??숆린?뷀븯??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
    });
}

/**
 * [?좉퇋] 移댁뭅??OIDC 濡쒓렇???⑥닔
 */
function loginWithKakao() {
    const provider = new firebase.auth.OAuthProvider('oidc.kakao');
    // [FIX] 移댁뭅??濡쒓렇?????됰꽕?꾧낵 ?대찓???뺣낫留?紐낆떆?곸쑝濡??붿껌?⑸땲?? (?꾨줈???ъ쭊 ?쒖쇅)
    provider.addScope('profile_nickname');
    provider.addScope('account_email');
    
    // signInWithPopup???몄텧?섎㈃ onAuthStateChanged 由ъ뒪?덇? 濡쒓렇??寃곌낵瑜??먮룞?쇰줈 媛먯??⑸땲??
    firebase.auth().signInWithPopup(provider).catch((error) => {
        console.error("??移댁뭅??濡쒓렇???앹뾽 ?ㅽ뙣:", error.message);
        // ?ъ슜?먭? ?앹뾽???ル뒗 ?깆쓽 ?ㅻ쪟??臾댁떆?⑸땲??
        if (error.code !== 'auth/popup-closed-by-user') {
            alert("移댁뭅??濡쒓렇??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: " + error.message);
        }
    });
}

/**
 * [?좉퇋] ?섏씠?ㅻ턿 濡쒓렇???⑥닔
 */
function loginWithFacebook() {
    const provider = new firebase.auth.FacebookAuthProvider();
    
    // ?대찓?쇨낵 怨듦컻 ?꾨줈??沅뚰븳???붿껌?⑸땲??
    provider.addScope('email');
    provider.addScope('public_profile');

    // ?앹뾽李쎌쑝濡?濡쒓렇?몄쓣 吏꾪뻾?⑸땲??
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            console.log("???섏씠?ㅻ턿 濡쒓렇???깃났!");
            // 濡쒓렇?????좎? 泥섎━??湲곗〈 onAuthStateChanged 由ъ뒪?덇? ?섑뻾?⑸땲??
        })
        .catch((error) => {
            console.error("???섏씠?ㅻ턿 濡쒓렇???ㅽ뙣:", error.code, error.message);
            if (error.code === 'auth/account-exists-with-different-credential') {
                alert("?대? ?숈씪???대찓?쇰줈 媛?낅맂 ?ㅻⅨ 怨꾩젙(援ш?/?ㅼ씠踰??????덉뒿?덈떎.");
            } else {
                alert("?섏씠?ㅻ턿 濡쒓렇??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: " + error.message);
            }
        });
}

/**
 * [?섏젙?? ?ㅼ씠踰??앹뾽 濡쒓렇??& 而ㅼ뒪? ?좏겙 ?몄쬆 濡쒖쭅
 */
function loginWithNaver() {
    // 1. ?ㅼ씠踰??대씪?댁뼵??ID 
    const clientId = "YNgZCcwBzPp11G9wKmHS";
    
    // 2. ?꾩옱 寃뚯엫???ㅽ뻾 以묒씤 二쇱냼 (??二쇱냼濡??앹뾽???ㅼ떆 ?뚯븘?듬땲??
    const redirectUri = encodeURIComponent("https://orangecases.github.io/chicken-race/");
    const state = Math.random().toString(36).substr(2, 11);

    // 3. ?ㅼ씠踰?濡쒓렇???앹뾽 ?꾩슦湲?
    const url = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;
    
    // ?뱀떆 紐곕씪 肄섏넄??李띿뼱蹂대뒗 ?붾쾭源?肄붾뱶
    console.log("?? 理쒖쥌 ?꾩넚 URL:", url);

    window.open(url, 'naverlogin', 'width=450,height=600');

    // 4. 遺紐?李?寃뚯엫 ?붾㈃)?먯꽌 ?앹뾽??蹂대궡???좏겙 湲곕떎由ш린
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'NAVER_LOGIN' && event.data.token) {
            const accessToken = event.data.token;

            console.log("?뵎 ?ㅼ씠踰?Access Token ?띾뱷! 諛깆뿏?쒕줈 寃利앹쓣 ?붿껌?⑸땲??..");
            // ?몙 ??以꾩쓣 異붽??댁꽌 吏꾩쭨 ?좏겙 湲?먭? ???덈뒗吏 ?뺤씤??遊낅땲??
            console.log("?뵎 ?꾨줎?몄뿏?쒓? ?싳븘梨??좏겙:", accessToken);

            try {
                // 諛⑷툑 諛고룷???대씪?곕뱶 ?⑥닔 ?몄텧!
                const loginFunction = firebase.functions().httpsCallable('naverLogin');
                const result = await loginFunction({ accessToken: accessToken });
                
                // 諛깆뿏?쒓? ?덉쟾?섍쾶 留뚮뱾?댁? 而ㅼ뒪? ?좏겙 諛쏄린
                const customToken = result.data.customToken;

                // Firebase??理쒖쥌 濡쒓렇??泥섎━!
                await firebase.auth().signInWithCustomToken(customToken);
                console.log("???ㅼ씠踰?濡쒓렇??而ㅼ뒪? ?좏겙) ?꾨꼍 ?깃났!");
                
            } catch (error) {
                console.error("??諛깆뿏???몄쬆 泥섎━ 以??ㅻ쪟:", error);
                alert("?ㅼ씠踰?濡쒓렇??泥섎━ 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
            }
        }
    }, { once: true }); // ??踰덈쭔 ?ㅽ뻾?섎룄濡??ㅼ젙
}

/**
 * [?좉퇋] ?쒕쾭??肄붿씤 ?섎웾留??낅뜲?댄듃?섎뒗 ?⑥닔 (?⑥쑉??
 */
async function syncCoinsToServer(newCoinAmount) {
    if (!currentUser) return;
    const user = firebase.auth().currentUser;
    if (user) {
        try {
            await db.collection("users").doc(user.uid).update({
                coins: newCoinAmount
            });
            console.log("?뮥 ?쒕쾭 肄붿씤 ?숆린???꾨즺:", newCoinAmount);
        } catch (error) {
            console.error("??肄붿씤 ?숆린???ㅽ뙣:", error);
        }
    }
}

/**
 * [?좉퇋] ?좎? 媛앹껜 ?꾩껜瑜??쒕쾭????ν븯???⑥닔 (?됰꽕?? 諭껋? ??
 */
async function saveUserDataToFirestore() {
    if (!currentUser) return;
    const user = firebase.auth().currentUser;
    if (user) {
        try {
            // merge: true ?듭뀡?쇰줈 湲곗〈 ?꾨뱶瑜???뼱?곗? ?딄퀬 蹂묓빀?⑸땲??
            await db.collection("users").doc(user.uid).set(currentUser, { merge: true });
            console.log("?뮶 ?좎? ?곗씠???꾩껜 ????꾨즺");
        } catch (error) {
            console.error("???좎? ?곗씠???꾩껜 ????ㅽ뙣:", error);
        }
    }
}

// [6. ?대깽??由ъ뒪??

document.addEventListener('DOMContentLoaded', () => {
    // [?좉퇋] Firebase ?몄쬆 ?곹깭 蹂寃?媛먯? 由ъ뒪??
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // User is signed in.
            loadUserData(user);
        } else {
            // User is signed out.
            if (unsubscribeUserData) {
                unsubscribeUserData();
                unsubscribeUserData = null;
            }
            isLoggedIn = false;
            currentUser = null;
            console.log("??濡쒓렇?꾩썐 ?곹깭");
            
            // UI ?낅뜲?댄듃
            updateCoinUI(); // 寃뚯뒪??肄붿씤?쇰줈 UI ?낅뜲?댄듃
            // [FIX] F5 ?덈줈怨좎묠 ?먮뒗 ???꾪솚 ??紐⑸줉???щ씪吏??臾몄젣瑜??닿껐?⑸땲??
            // ?먯씤: 濡쒓렇???곹깭 蹂寃??? 諛?紐⑸줉 ?곗씠??raceRooms)瑜??ㅼ떆 媛?몄삤吏 ?딄퀬
            //       UI ?뚮뜑留??⑥닔(renderRoomLists)留??몄텧?섏뿬, 鍮꾩뼱?덈뒗 ?곗씠?곕줈 紐⑸줉??洹몃젮吏???덉씠??而⑤뵒?섏씠 ?덉뿀?듬땲??
            // ?닿껐: 濡쒓렇??濡쒓렇?꾩썐 ????긽 fetchRaceRooms()瑜??몄텧?섏뿬 ?곗씠?곕? 癒쇱? 媛?몄삩 ??UI瑜?洹몃━?꾨줉 ?쒖꽌瑜?蹂댁옣?⑸땲??
            roomFetchPromise = null; // [?좉퇋] 沅뚰븳 蹂寃?諛섏쁺???꾪빐 紐⑸줉 ?щ줈??
            fetchRaceRooms(false);
            fetchMyRooms(); // [?좉퇋] ??諛?紐⑸줉??媛깆떊 (鍮꾩?)
            
            // ?대젮?덉쓣 ???덈뒗 ?꾨줈??紐⑤떖 ?リ린
            const sceneUserProfile = document.getElementById('scene-user-profile');
            if (sceneUserProfile) sceneUserProfile.classList.add('hidden');
        }
    });

    // [?좉퇋] 湲곕줉 濡쒕뱶 諛??뚮뜑留?
    generateTop100Scores(); // ??궧 ?곗씠?곕? 癒쇱? ?앹꽦
    myScores = JSON.parse(localStorage.getItem('chickenRunMyScores')) || [];
    if (myScores.length > 0) {
        bestScore = myScores[0].score;
    }
    renderMyRecordList();
    renderTop100List();
    // [FIX] fetchRaceRooms() ?몄텧??onAuthStateChanged ?대?濡??대룞?섏뿬,
    // 濡쒓렇???곹깭媛 ?뺤젙???꾩뿉 諛?紐⑸줉??遺덈윭?ㅻ룄濡??섏젙?⑸땲??

    // [?좉퇋] ?붾낫湲?踰꾪듉 ?대깽???몃뱾??(??援щ텇)
    const btnLoadMore = document.getElementById('btn-load-more');
    if (btnLoadMore) {
        btnLoadMore.onclick = () => {
            fetchRaceRooms(true);
        };
    }

    const btnLoadMoreMy = document.getElementById('btn-load-more-my');
    if (btnLoadMoreMy) {
        btnLoadMoreMy.onclick = () => {
            currentMyRoomLimit += 10;
            fetchMyRooms();
        };
    }
    
    // [?좉퇋] ?붾쾭源낆슜 遊?異붽?/??젣 ?대깽???몃뱾??(?대깽???꾩엫)
    // [?섏젙] ?쒕쾭 ?곕룞???곕씪 Firestore ?곗씠?곕? 吏곸젒 ?섏젙?섎룄濡?蹂寃?
    const handleDebugBotAction = async (e) => {
        // [?좉퇋] 愿由ъ옄媛 ?꾨땲硫??숈옉?섏? ?딆쓬
        if (!currentUser || !currentUser.isAdmin) return;

        const target = e.target.closest('.debug-btn');
        if (!target) return;

        // [FIX] 遊??쒖뼱 踰꾪듉(data-bot-id)? ???몃뱾?ш? ?꾨땶 handleBotControlAction?먯꽌 泥섎━?댁빞 ?섎?濡?臾댁떆?⑸땲??
        // data-roomId媛 ?덈뒗 踰꾪듉(諛??몄썝 議곗젅)留??ш린??泥섎━?⑸땲??
        if (!target.dataset.roomId) return;

        e.stopPropagation(); // 遺紐?li??諛??낆옣 ?대깽?멸? ?ㅽ뻾?섎뒗 寃껋쓣 留됱뒿?덈떎.
        const roomId = target.dataset.roomId;
        const action = target.dataset.action;

        const roomRef = db.collection('rooms').doc(roomId);
        const participantsRef = roomRef.collection('participants');

        try {
            if (action === 'add') {
                await db.runTransaction(async (transaction) => {
                    const roomDoc = await transaction.get(roomRef);
                    if (!roomDoc.exists) throw "議댁옱?섏? ?딅뒗 諛⑹엯?덈떎.";
                    const roomData = roomDoc.data();
                    
                    if (roomData.currentPlayers >= roomData.maxPlayers) {
                        console.warn(`[Debug] 諛?[${roomId}]??媛) 媛??李쇱뒿?덈떎.`);
                        return; // ?몃옖??뀡 以묐떒
                    }

                    const botId = `bot_debug_${Date.now()}`;
                    const botNames = ["珥덈낫??, "以묒닔??, "怨좎닔??, "移섑궓?곕큸", "AI??];
                    const botData = {
                        id: botId,
                        name: `${botNames[Math.floor(Math.random() * botNames.length)]}_${String(Date.now()).slice(-4)}`,
                        isBot: true,
                        score: 0,
                        totalScore: 0,
                        bestScore: 0,
                        status: 'waiting',
                        displayScore: 0,
                        attemptsLeft: roomData.attempts,
                        startDelay: 60 + Math.floor(Math.random() * 120), // 遊뉖쭏???쒖옉 ?쒓컙 ?ㅻⅤ寃?
                        targetScore: 750 + Math.floor(Math.random() * 1500) // [?섏젙] 遊?紐⑺몴 ?먯닔 ?섑뼢 議곗젙
                    };
                    transaction.set(participantsRef.doc(botId), botData);
                    // [FIX] 遊?異붽? ??諛⑹씠 finished ?곹깭?대㈃ inprogress濡?蹂寃쏀빀?덈떎.
                    const updates = { currentPlayers: firebase.firestore.FieldValue.increment(1) };
                    if (roomData.status === 'finished') {
                        updates.status = 'inprogress';
                    }
                    transaction.update(roomRef, updates);
                });
            } else if (action === 'remove') {
                // [FIX] ?몃옖??뀡 ?몃??먯꽌 荑쇰━瑜??ㅽ뻾?섏뿬 ??젣??遊뉗쓣 癒쇱? 李얠뒿?덈떎.
                const botQuerySnapshot = await participantsRef.where('isBot', '==', true).limit(1).get();
                if (botQuerySnapshot.empty) {
                    console.warn(`[Debug] 諛?[${roomId}]???쒓굅??遊뉗씠 ?놁뒿?덈떎.`);
                    return;
                }
                const botToRemoveRef = botQuerySnapshot.docs[0].ref;

                await db.runTransaction(async (transaction) => {
                    const roomDoc = await transaction.get(roomRef);
                    if (!roomDoc.exists) throw "議댁옱?섏? ?딅뒗 諛⑹엯?덈떎.";
                    const roomData = roomDoc.data();

                    // 1. 李얠? 遊?臾몄꽌瑜??몃옖??뀡 ?댁뿉????젣?⑸땲??
                    transaction.delete(botToRemoveRef);

                    // 2. room 臾몄꽌??currentPlayers瑜?媛먯냼?쒗궎嫄곕굹 諛⑹쓣 ??젣?⑸땲??
                    const newPlayerCount = roomData.currentPlayers - 1;
                    if (newPlayerCount <= 0) {
                        transaction.delete(roomRef);
                    } else {
                        // [?섏젙] 遊뉗쓣 ??젣(?섎뱶 ??젣)???? 諛⑹씠 'finished' ?곹깭??ㅻ㈃ ?ㅼ떆 'inprogress'濡??섎룎由쎈땲??
                        const updates = { currentPlayers: firebase.firestore.FieldValue.increment(-1) };
                        if (roomData.status === 'finished') {
                            updates.status = 'inprogress';
                        }
                        transaction.update(roomRef, updates);
                    }
                });
            }
            
            console.log(`[Debug] 諛?[${roomId}]??李멸????뺣낫瑜??깃났?곸쑝濡??섏젙?덉뒿?덈떎.`);
            
            // ?몃옖??뀡 ?깃났 ?? 濡쒕퉬???덈떎硫?紐⑸줉???섎룞?쇰줈 媛깆떊?⑸땲??
            // 寃뚯엫 ???대????덈떎硫?onSnapshot 由ъ뒪?덇? UI瑜??먮룞?쇰줈 ?낅뜲?댄듃?⑸땲??
            const isInGame = !document.getElementById('scene-game').classList.contains('hidden');
            if (!isInGame) {
                fetchRaceRooms(false);
                fetchMyRooms();
            }
        } catch (error) {
            console.error("???붾쾭洹??몄썝 ?섏젙 ?ㅽ뙣:", error);
        }
    };
    document.getElementById('content-race-room').addEventListener('click', handleDebugBotAction, true);
    document.getElementById('content-my-rooms').addEventListener('click', handleDebugBotAction, true);
    document.getElementById('view-multi-rank').addEventListener('click', handleDebugBotAction, true);

    // [?붿껌?섏젙] 遊??곹깭瑜??섎룞?쇰줈 ?쒖뼱?섎뒗 ?붾쾭源낆슜 ?대깽???몃뱾??
    const handleBotControlAction = async (e) => {
        const target = e.target.closest('.debug-btn[data-bot-id]');
        if (!target || !currentRoom) return;

        e.stopPropagation(); // ?ㅻⅨ ?대깽???? 諛??낆옣)媛 ?ㅽ뻾?섎뒗 寃껋쓣 留됱뒿?덈떎.

        const botId = target.dataset.botId;
        const action = target.dataset.action;
        const participantRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(botId);

        try {
            switch (action) {
                case 'force-start':
                    console.log(`[Debug] Bot [${botId}] 媛뺤젣 ?쒖옉`);
                    // [FIX] force-start ??諛⑹씠 finished ?곹깭?대㈃ inprogress濡?蹂寃쏀빐??遊??쒕??덉씠?섏씠 ?ㅼ떆 ?숈옉?⑸땲??
                    const roomRefForStart = db.collection('rooms').doc(currentRoom.id);
                    await db.runTransaction(async (transaction) => {
                        const roomDoc = await transaction.get(roomRefForStart);
                        if (!roomDoc.exists) return;

                        // 1. 遊??곹깭瑜?'playing'?쇰줈 蹂寃?
                        transaction.update(participantRef, { status: 'playing' });

                        // 2. 諛??곹깭媛 'finished'?대㈃ 'inprogress'濡?蹂寃?
                        if (roomDoc.data().status === 'finished') {
                            transaction.update(roomRefForStart, { status: 'inprogress' });
                        }
                    });
                    break;
                case 'force-end':
                    console.log(`[Debug] Bot [${botId}] 媛뺤젣 醫낅즺`);
                    await participantRef.update({ status: 'dead' });
                    break;
                case 'force-delete':
                    // [?섏젙] '紐⑸줉??젣'??遊뉗쓣 DB?먯꽌 ??젣?섎뒗 寃껋씠 ?꾨땲?? ?쇰컲 ?좎?泥섎읆 '紐⑸줉?먯꽌 ?④?' 泥섎━?섎뒗 湲곕뒫?낅땲??
                    console.log(`[Debug] Bot [${botId}] '紐⑸줉?먯꽌 ??젣' ?쒕??덉씠??);
                    const roomRefForDelete = db.collection('rooms').doc(currentRoom.id);
                    const participantsRefForDelete = roomRefForDelete.collection('participants');

                    await db.runTransaction(async (transaction) => {
                        // 1. ?대떦 諛⑹쓽 紐⑤뱺 李멸????뺣낫瑜?媛?몄샃?덈떎.
                        const participantsSnapshot = await transaction.get(participantsRefForDelete);
                        const botDoc = participantsSnapshot.docs.find(doc => doc.id === botId);
                        if (!botDoc) return;

                        // 2. ???遊뉗쓽 ?곹깭瑜?'hidden: true'濡??낅뜲?댄듃?⑸땲??
                        transaction.update(botDoc.ref, { hidden: true });

                        // 3. ??遊뉗쓣 ?쒖쇅???ㅻⅨ 紐⑤뱺 李멸??먮뱾??hidden ?곹깭?몄? ?뺤씤?⑸땲??
                        let allParticipantsHidden = true;
                        participantsSnapshot.forEach(doc => {
                            // ?꾩옱 ?낅뜲?댄듃?섎젮??遊뉗씠 ?꾨땲怨? hidden ?뚮옒洹멸? ?녿뒗 李멸??먭? ?덈떎硫? ?꾩쭅 紐⑤몢 ?섍컙 寃껋씠 ?꾨떃?덈떎.
                            if (doc.id !== botId && !doc.data().hidden) {
                                allParticipantsHidden = false;
                            }
                        });

                        // 4. 留뚯빟 紐⑤뱺 李멸??먭? hidden ?곹깭媛 ?섎㈃, 諛??먯껜瑜???젣?⑸땲??
                        if (allParticipantsHidden) {
                            console.log(`紐⑤뱺 李멸??먭? 紐⑸줉?먯꽌 諛⑹쓣 ?쒓굅?덉뒿?덈떎. 諛?[${currentRoom.id}]??瑜? ??젣?⑸땲??`);
                            transaction.delete(roomRefForDelete);
                        }
                    });
                    break;
            }
        } catch (error) {
            console.error(`[Debug] 遊?而⑦듃濡??ㅽ뙣 (Action: ${action}):`, error);
        }
    };
    document.getElementById('multi-score-list').addEventListener('click', handleBotControlAction);

    // [?좉퇋] ??湲곕줉 紐⑸줉 臾댄븳 ?ㅽ겕濡??대깽??由ъ뒪??
    const myRecordScrollArea = document.querySelector('#content-my-record .list-scroll-area');
    if (myRecordScrollArea) {
        myRecordScrollArea.onscroll = () => {
            // [?섏젙] 諛붾떏 媛먯? 踰붿쐞瑜?50px濡??뺣??섏뿬 ??誘쇨컧?섍쾶 諛섏쓳?섎룄濡???
            if (myRecordScrollArea.scrollTop + myRecordScrollArea.clientHeight >= myRecordScrollArea.scrollHeight - 50) {
                if (displayedMyRecordsCount < myScores.length && displayedMyRecordsCount < 100) {
                    displayedMyRecordsCount += 20;
                    renderMyRecordList(true); // 異붽? 濡쒕뱶
                }
            }
        };
    }
    updateCoinUI(); // [?좉퇋] 珥덇린 肄붿씤 UI 媛깆떊

    const sceneCreateRoom = document.getElementById('scene-create-room');
    const btnCreateOpen = document.getElementById('btn-create-room-open');
    const btnCreateConfirm = document.getElementById('btn-create-confirm');
    const btnCreateCancel = document.getElementById('btn-create-cancel');
    const btnRaceStart = document.getElementById('btn-race-start');
    const btnSingle = document.getElementById('btn-login-single');
    const btnRestart = document.getElementById('btn-restart');
    const controlContainer = document.getElementById('control-container');
    const btnSoundToggle = document.getElementById('btn-sound-toggle');
    const btnMember = document.getElementById('btn-member');
    const btnExitFromStart = document.getElementById('btn-exit-from-start'); // [?좉퇋]
    const btnExitFromPause = document.getElementById('btn-exit-from-pause'); // [?좉퇋]
    const btnExitFromGameover = document.getElementById('btn-exit-from-gameover'); // [?좉퇋]
    const btnDeleteRoom = document.getElementById('btn-delete-room'); // [?좉퇋]
    const btnPauseToggle = document.getElementById('btn-pause-toggle');
    const btnResumeGame = document.getElementById('btn-resume-game');

    // [?좉퇋] 鍮꾨?踰덊샇 紐⑤떖 愿???붿냼
    const scenePasswordInput = document.getElementById('scene-password-input');
    const btnPasswordConfirm = document.getElementById('btn-password-confirm');
    const btnPasswordCancel = document.getElementById('btn-password-cancel');

    // [?좉퇋] 寃뚯엫 醫낅즺 ?뺤씤 紐⑤떖 愿???붿냼
    const sceneExitConfirm = document.getElementById('scene-exit-confirm');
    const btnExitConfirm = document.getElementById('btn-exit-confirm');
    const btnExitCancel = document.getElementById('btn-exit-cancel');

    // [?좉퇋] 諛???젣 ?뺤씤 紐⑤떖 愿???붿냼
    const sceneDeleteRoomConfirm = document.getElementById('scene-delete-room-confirm');
    const btnDeleteRoomConfirm = document.getElementById('btn-delete-room-confirm');
    const btnDeleteRoomCancel = document.getElementById('btn-delete-room-cancel');

    // [?좉퇋] ?뚯썝媛??濡쒓렇??愿???붿냼
    const sceneAuth = document.getElementById('scene-auth');

    // [?좉퇋] ?ъ슜???뺣낫 紐⑤떖 愿???붿냼
    const sceneUserProfile = document.getElementById('scene-user-profile');
    const btnProfileConfirm = document.getElementById('btn-profile-confirm');
    const btnLogout = document.getElementById('btn-logout');
    const btnRechargeCoin = document.getElementById('btn-recharge-coin'); // [?좉퇋] 肄붿씤 異⑹쟾 踰꾪듉
    
    if (btnCreateOpen) {
        btnCreateOpen.onclick = () => {
            // [?좉퇋] 諛?留뚮뱾湲?濡쒓렇??泥댄겕
            if (!isLoggedIn) {
                if (sceneAuth) {
                    sceneAuth.classList.remove('hidden');
                    const authMsg = sceneAuth.querySelector('.auth-message');
                    if (authMsg) {
                        authMsg.style.display = 'block';
                        authMsg.innerText = '諛?留뚮뱾湲곕뒗 濡쒓렇?????댁슜 媛?ν빀?덈떎.';
                    }
                }
                return;
            }
            document.getElementById('input-room-password-create').value = ''; // [?좉퇋] 鍮꾨?踰덊샇 ?낅젰 珥덇린??
            sceneCreateRoom.classList.remove('hidden');
        };
    }
    if(btnCreateCancel) btnCreateCancel.onclick = () => sceneCreateRoom.classList.add('hidden');

    // [?섏젙] 硫ㅻ쾭 踰꾪듉 ?대┃ ??濡쒓렇???곹깭???곕씪 ?ㅻⅨ 紐⑤떖 ?쒖떆
    if (btnMember) {
        btnMember.onclick = () => {
            if (isLoggedIn) {
                showUserProfile();
            } else {
                // [?좉퇋] ?쇰컲 濡쒓렇??吏꾩엯 ??硫붿떆吏 珥덇린??
                const authMsg = sceneAuth.querySelector('.auth-message');
                if (authMsg) authMsg.style.display = 'none';
                sceneAuth.classList.remove('hidden');
            }
        };
    }

    // [?좉퇋] SNS 濡쒓렇??踰꾪듉 ?쒕??덉씠??
    document.querySelectorAll('.sns-btn').forEach(btn => {
        btn.onclick = () => {
            if (btn.classList.contains('google')) {
                loginWithGoogle();
            } else if (btn.classList.contains('kakao')) {
                loginWithKakao();
            } else if (btn.classList.contains('facebook')) {
                loginWithFacebook();
            } else if (btn.classList.contains('naver')) {
                loginWithNaver();
            } else {
                // TODO: IOS 濡쒓렇??援ы쁽
                alert('?대떦 濡쒓렇??諛⑹떇? ?꾩옱 吏?먮릺吏 ?딆뒿?덈떎.');
            }
        };
    });

    // [?좉퇋] ?ъ슜???뺣낫 紐⑤떖 ?뺤씤 踰꾪듉
    if (btnProfileConfirm) {
        btnProfileConfirm.onclick = () => {
            const newNickname = document.getElementById('profile-nickname').value.trim();
            if (newNickname && currentUser) {
                currentUser.nickname = newNickname;
                saveUserDataToFirestore(); // [?좉퇋] ?됰꽕??蹂寃???DB?????
                console.log('?됰꽕??蹂寃쎈맖:', currentUser.nickname);
            }
            if (sceneUserProfile) sceneUserProfile.classList.add('hidden');
        };
    }

    // [?좉퇋] 濡쒓렇?꾩썐 踰꾪듉
    if (btnLogout) {
        btnLogout.onclick = () => {
            firebase.auth().signOut().catch((error) => {
                console.error('??濡쒓렇?꾩썐 ?ㅽ뙣:', error);
                alert('濡쒓렇?꾩썐 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
            });
            // onAuthStateChanged 由ъ뒪?덇? ?섎㉧吏 UI 泥섎━瑜??대떦?⑸땲??
        };
    }

    // [?좉퇋] 肄붿씤 異⑹쟾 踰꾪듉
    if (btnRechargeCoin) {
        btnRechargeCoin.onclick = () => {
            watchAdAndGetReward();
        };
    }

    if (btnCreateConfirm) {
        btnCreateConfirm.onclick = async () => {
            const user = firebase.auth().currentUser;
            if (!user) {
                alert("諛⑹쓣 留뚮뱾?ㅻ㈃ 濡쒓렇?몄씠 ?꾩슂?⑸땲??");
                return;
            }

            const titleInput = document.getElementById('input-room-title').value;
            const passwordInput = document.getElementById('input-room-password-create').value.trim();
            const limitInput = document.getElementById('input-room-limit').value;
            const attemptsInput = document.getElementById('input-room-attempts').value;
            const activeRankBtn = document.querySelector('#group-rank-type button.active');
            const rankType = activeRankBtn ? activeRankBtn.dataset.val : 'best';
            const attempts = parseInt(attemptsInput) || 3;

            if (currentUser.coins < attempts) {
                alert(`肄붿씤??遺議깊빀?덈떎.\n(?꾩슂: ${attempts}, 蹂댁쑀: ${currentUser.coins})`);
                return;
            }

            try {
                // [FIX] 諛??앹꽦 濡쒖쭅??Batch Write濡?蹂寃쏀븯???먯옄?깆쓣 蹂댁옣?⑸땲??
                // 諛??앹꽦, ?앹꽦???깅줉, 珥덇린 遊??깅줉????踰덉쓽 ?묒뾽?쇰줈 泥섎━?⑸땲??
                const batch = db.batch();
                const roomRef = db.collection("rooms").doc(); // ??臾몄꽌 ID 誘몃━ ?앹꽦

                // 1. 諛??뺣낫 ?ㅼ젙
                const roomData = {
                    title: titleInput || "利먭굅???덉씠??,
                    password: passwordInput.length > 0 ? passwordInput : null,
                    maxPlayers: parseInt(limitInput) || 5,
                    currentPlayers: 2, // ??+ 遊?
                    creatorUid: user.uid,
                    attempts: attempts,
                    rankType: rankType,
                    status: "inprogress",
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                batch.set(roomRef, roomData);

                // 2. ?앹꽦????瑜?李멸???紐⑸줉??異붽?
                const creatorRef = roomRef.collection('participants').doc(user.uid);
                const creatorData = { id: user.uid, name: currentUser.nickname, isBot: false, score: 0, totalScore: 0, bestScore: 0, status: 'waiting', displayScore: 0, attemptsLeft: attempts };
                batch.set(creatorRef, creatorData);

                // 3. 珥덇린 遊?1紐낆쓣 李멸???紐⑸줉??異붽? (諛??먮룞 ??뙆 諛⑹?)
                const botRef = roomRef.collection('participants').doc(`bot_${Date.now()}`);
                const botData = { id: botRef.id, name: '珥덈낫??, isBot: true, score: 0, totalScore: 0, bestScore: 0, status: 'waiting', displayScore: 0, attemptsLeft: attempts, startDelay: 60, targetScore: 750 }; // [?섏젙] 遊?紐⑺몴 ?먯닔 ?섑뼢 議곗젙
                batch.set(botRef, botData);

                // 4. Batch ?묒뾽 ?ㅽ뻾
                await batch.commit();
                console.log("??諛??앹꽦 諛?珥덇린 李멸????깅줉 ?꾨즺! ID:", roomRef.id);

                // 5. 濡쒖뺄 ?곗씠???낅뜲?댄듃 諛?寃뚯엫 ??吏꾩엯
                const newRoomForGame = mapFirestoreDocToRoom({ id: roomRef.id, data: () => roomData });

                // [FIX] 諛??앹꽦 ???덈줈怨좎묠 ??諛?紐⑸줉???щ씪吏??臾몄젣 諛?'李멸?以? 紐⑸줉??諛⑹씠 蹂댁씠吏 ?딅뒗 臾몄젣 ?닿껐
                // ?먯씤: 濡쒖뺄 `raceRooms` 諛곗뿴?먮쭔 異붽??섍퀬, `currentUser.joinedRooms` 蹂寃??ы빆??Firestore???쒕?濡???λ릺吏 ?딆븯?듬땲??
                // ?닿껐:
                // 1. ?앹꽦??諛??뺣낫瑜?濡쒖뺄 諛?紐⑸줉(`raceRooms`)??留??욎뿉 異붽??섏뿬, 濡쒕퉬濡??뚯븘?붿쓣 ??利됱떆 蹂댁씠?꾨줉 ?⑸땲??
                raceRooms.unshift(newRoomForGame);

                // 2. ?꾩옱 ?좎???'李멸?以묒씤 諛? 紐⑸줉????諛⑹쓣 異붽??⑸땲??
                const newJoinedRoomEntry = { usedAttempts: 0, isPaid: false };
                currentUser.joinedRooms[newRoomForGame.id] = newJoinedRoomEntry;
                
                // 3. [?듭떖 ?섏젙] ?좎???`joinedRooms` ?꾨뱶留?Firestore??吏곸젒 ?낅뜲?댄듃?섏뿬 ?곸냽?깆쓣 ?뺣낫?⑸땲??
                //    `saveUserDataToFirestore()`瑜??몄텧?섎뒗 ??? `joinedRooms` 留듭쓽 ?뱀젙 ?꾨뱶留??낅뜲?댄듃?⑸땲??
                //    [FIX] joinedRooms ?꾨뱶媛 ?놁쓣 寃쎌슦瑜??鍮꾪빐 set({ ... }, { merge: true })瑜??ъ슜?⑸땲??
                await db.collection("users").doc(user.uid).set({
                    joinedRooms: {
                        [newRoomForGame.id]: newJoinedRoomEntry
                    }
                }, { merge: true });
                console.log("?뮶 ?좎???joinedRooms????諛??뺣낫 ????꾨즺");

                sceneCreateRoom.classList.add('hidden');
                enterGameScene('multi', newRoomForGame);

            } catch (error) {
                console.error("??諛??앹꽦 ?ㅽ뙣:", error);
                alert("諛⑹쓣 留뚮뱶??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
            }
        };
    }

    // [?좉퇋] 鍮꾨?踰덊샇 ?뺤씤 踰꾪듉
    if (btnPasswordConfirm) {
        btnPasswordConfirm.onclick = () => {
            // 鍮꾨?踰덊샇 ?낅젰李쎌뿉?쒕룄 ?몄썝 ?쒗븳 泥댄겕 (?뱀떆 洹??ъ씠 李쇱쓣 寃쎌슦 ?鍮?
            if (targetRoom && targetRoom.current >= targetRoom.limit) {
                alert('?몄썝 ?쒗븳?쇰줈 李몄뿬?????놁뒿?덈떎.');
                return;
            }
            // [?좉퇋] 鍮꾨?踰덊샇 諛??낆옣 ?쒖뿉??肄붿씤 泥댄겕
            const cost = targetRoom.attempts;
            if (!currentUser || currentUser.coins < cost) {
                alert(`肄붿씤??遺議깊빀?덈떎.\n(?꾩슂: ${cost}, 蹂댁쑀: ${currentUser ? currentUser.coins : 0})`);
                return;
            }

            const inputPw = document.getElementById('input-room-password').value;
            const msg = document.getElementById('password-message');
            
            if (targetRoom && inputPw === targetRoom.password) {
                unlockedRoomIds.push(targetRoom.id); // [?좉퇋] ?댁젣??諛?ID ???
                scenePasswordInput.classList.add('hidden');
                // [?섏젙] 鍮꾨?踰덊샇 ?뺤씤 ???듯빀 李멸? ?⑥닔 ?몄텧
                attemptToJoinRoom(targetRoom);
                targetRoom = null;
            } else {
                if (msg) {
                    msg.innerText = '鍮꾨?踰덊샇媛 ?쇱튂?섏? ?딆뒿?덈떎.';
                    msg.style.display = 'block'; // ?먮윭 硫붿떆吏 ?쒖떆
                }
            }
        };
    }
    // [?좉퇋] 鍮꾨?踰덊샇 痍⑥냼 踰꾪듉
    if (btnPasswordCancel) {
        btnPasswordCancel.onclick = () => { if (scenePasswordInput) scenePasswordInput.classList.add('hidden'); targetRoom = null; };
    }

    // [?좉퇋] 寃뚯엫 醫낅즺 ?뺤씤 紐⑤떖 踰꾪듉 ?대깽??
    if (btnExitConfirm) {
        btnExitConfirm.onclick = () => {
            if (sceneExitConfirm) sceneExitConfirm.classList.add('hidden');
            // [FIX] 寃뚯엫 吏꾪뻾 以??댁옣? '?뚰봽???댁옣'?쇰줈 泥섎━
            exitToLobby(false);
        };
    }
    if (btnExitCancel) {
        btnExitCancel.onclick = () => { if (sceneExitConfirm) sceneExitConfirm.classList.add('hidden'); };
    }

    // [?좉퇋] 諛???젣 ?뺤씤 紐⑤떖 踰꾪듉 ?대깽??
    if (btnDeleteRoomConfirm) {
        btnDeleteRoomConfirm.onclick = async () => {
            if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.add('hidden');
            await removeFromMyRooms();
        };
    }
    if (btnDeleteRoomCancel) {
        btnDeleteRoomCancel.onclick = () => { if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.add('hidden'); };
    }


    // [?좉퇋] 紐⑤뱺 紐⑤떖???リ린 踰꾪듉?????怨듯넻 ?대깽??由ъ뒪??
    document.querySelectorAll('.modal-container .close_modal').forEach(btn => {
        btn.onclick = () => {
            // 踰꾪듉???랁븳 媛??媛源뚯슫 遺紐?<section> (紐⑤떖 ?꾩껜)??李얠븘 ?④퉩?덈떎.
            btn.closest('section').classList.add('hidden');
        };
    });

    // [?좉퇋] ?쇱떆?뺤? 諛??댁뼱?섍린 踰꾪듉 ?대깽??
    if (btnPauseToggle) btnPauseToggle.onclick = togglePause;
    if (btnResumeGame) btnResumeGame.onclick = togglePause;

    if (btnSingle) btnSingle.onclick = () => enterGameScene('single');
    
    if (btnRaceStart) {
        btnRaceStart.onclick = () => {
            // [?좉퇋] ?깃? 紐⑤뱶???뚮쭔 ?쒖옉 ??肄붿씤 李④컧 (1肄붿씤)
            if (currentGameMode === 'single') {
                // [?좉퇋] 寃뚯뒪??肄붿씤??遺議깊븷 寃쎌슦 ?먮룞 異⑹쟾 濡쒖쭅 異붽?
                if (!currentUser && guestCoins < 1) {
                    alert("寃뚯뒪??肄붿씤??紐⑤몢 ?뚯쭊?섏뼱 10肄붿씤???덈줈 異⑹쟾???쒕┰?덈떎! ?ㅼ떆 ?좊굹寃??щ젮蹂댁꽭??");
                    guestCoins = 10;
                    localStorage.setItem('chickenRunGuestCoins', guestCoins);
                    updateCoinUI();
                }

                const currentCoins = currentUser ? currentUser.coins : guestCoins;
                if (currentCoins < 1) {
                    alert("肄붿씤??遺議깊븯??寃뚯엫???쒖옉?????놁뒿?덈떎.");
                    return;
                }
                
                if (currentUser) {
                    currentUser.coins -= 1;
                    syncCoinsToServer(currentUser.coins);
                } else {
                    guestCoins -= 1;
                    localStorage.setItem('chickenRunGuestCoins', guestCoins);
                }
                updateCoinUI();
            }
            
            // [?좉퇋] 硫??紐⑤뱶 ?쒖옉 ??鍮꾩슜 吏遺??뺤씤 (諛??앹꽦????誘몄?遺??곹깭??寃쎌슦)
            if (currentGameMode === 'multi' && currentRoom && currentUser) {
                const userRoomState = currentUser.joinedRooms[currentRoom.id];
                if (userRoomState && !userRoomState.isPaid) {
                    const cost = currentRoom.attempts;
                    if (currentUser.coins < cost) {
                        alert(`肄붿씤??遺議깊븯??寃뚯엫???쒖옉?????놁뒿?덈떎.\n(?꾩슂: ${cost}, 蹂댁쑀: ${currentUser.coins})`);
                        return;
                    }
                    currentUser.coins -= cost;
                    userRoomState.isPaid = true;
                    updateCoinUI();
                    saveUserDataToFirestore(); // 肄붿씤怨?isPaid ?곹깭瑜??④퍡 ???
                    updateButtonCosts(); // UI 媛깆떊
                }
            }

            clearAutoActionTimer(); 
            document.getElementById('game-start-screen').classList.add('hidden');
            setControlsVisibility(true); // [?섏젙] 寃뚯엫 ?쒖옉 ??而⑦듃濡ㅻ윭 ?쒖떆
            // 0.5珥??좊땲硫붿씠??媛꾧꺽 ??寃뚯엫 ?쒖옉
            setTimeout(() => {
                // [?섏젙] 猷⑦봽瑜??덈줈 ?쒖옉?섎뒗 ????곹깭瑜?蹂寃쏀븯??寃뚯엫 吏꾪뻾
                if (gameLoopId) cancelAnimationFrame(gameLoopId);
                
                // [3?④퀎] 寃뚯엫 ?쒖옉 ?????곹깭瑜?'playing'?쇰줈 ?쒕쾭???낅뜲?댄듃
                if (currentGameMode === 'multi' && currentUser) {
                    const myId = currentUser.id;
                    const myPlayer = multiGamePlayers.find(p => p.id === myId);
                    if (myPlayer) {
                        myPlayer.status = 'playing';
                        const participantDocRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(myId);
                        participantDocRef.update({ status: 'playing' }).catch(e => console.error("?곹깭 ?낅뜲?댄듃 ?ㅽ뙣(playing)", e));
                    }
                }
                playSound('start');
                playSound('bgm'); 
                gameState = STATE.PLAYING; // [FIX] 寃뚯엫 ?곹깭瑜?'PLAYING'?쇰줈 蹂寃쏀븯??寃뚯엫 濡쒖쭅 ?ㅽ뻾
                gameLoop();
            }, 500);
        };
    }

    if (btnRestart) {
        btnRestart.onclick = () => {
            // [?좉퇋] ?깃? 紐⑤뱶???뚮쭔 ?ъ떆????肄붿씤 李④컧 (1肄붿씤)
            if (currentGameMode === 'single') {
                // [?좉퇋] 寃뚯뒪??肄붿씤??遺議깊븷 寃쎌슦 ?먮룞 異⑹쟾 濡쒖쭅 異붽?
                if (!currentUser && guestCoins < 1) {
                    alert("寃뚯뒪??肄붿씤??紐⑤몢 ?뚯쭊?섏뼱 10肄붿씤???덈줈 異⑹쟾???쒕┰?덈떎! ?ㅼ떆 ?좊굹寃??щ젮蹂댁꽭??");
                    guestCoins = 10;
                    localStorage.setItem('chickenRunGuestCoins', guestCoins);
                    updateCoinUI();
                }

                const currentCoins = currentUser ? currentUser.coins : guestCoins;
                if (currentCoins < 1) {
                    alert("肄붿씤??遺議깊븯??寃뚯엫???쒖옉?????놁뒿?덈떎.");
                    return;
                }
                
                if (currentUser) {
                    currentUser.coins -= 1;
                    syncCoinsToServer(currentUser.coins);
                } else {
                    guestCoins -= 1;
                    localStorage.setItem('chickenRunGuestCoins', guestCoins);
                }
                updateCoinUI();
            }

            clearAutoActionTimer();
            document.getElementById('game-over-screen').classList.add('hidden');
            setControlsVisibility(true); // [?섏젙] 寃뚯엫 ?ъ떆????而⑦듃濡ㅻ윭 ?쒖떆
            // 0.5珥??좊땲硫붿씠??媛꾧꺽 ??寃뚯엫 ?ъ떆??
            setTimeout(() => {
                resetGame();
                if (gameLoopId) cancelAnimationFrame(gameLoopId);

                // [3?④퀎] 寃뚯엫 ?ъ떆???????곹깭瑜?'playing'?쇰줈 ?쒕쾭???낅뜲?댄듃
                if (currentGameMode === 'multi' && currentUser) {
                    const myId = currentUser.id;
                    const myPlayer = multiGamePlayers.find(p => p.id === myId);
                    if (myPlayer) {
                        myPlayer.status = 'playing';
                        const participantDocRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(myId);
                        participantDocRef.update({ status: 'playing' }).catch(e => console.error("?곹깭 ?낅뜲?댄듃 ?ㅽ뙣(playing)", e));
                    }
                }
                playSound('start');
                playSound('bgm'); 
                gameState = STATE.PLAYING; // [?듭떖] ?곹깭瑜?PLAYING?쇰줈 蹂寃쏀븯??寃뚯엫 ?쒖옉
                gameLoop();
            }, 500);
        };
    }

    // [?좉퇋] ?ъ슫??踰꾪듉 ?좉?
    if (btnSoundToggle) {
        // 珥덇린 ?곹깭 ?ㅼ젙
        btnSoundToggle.classList.toggle('sound-on', isSoundOn);
        btnSoundToggle.classList.toggle('sound-off', !isSoundOn);

        btnSoundToggle.onclick = () => {
            isSoundOn = !isSoundOn; // ?곹깭 ?좉?
            btnSoundToggle.classList.toggle('sound-on', isSoundOn);
            btnSoundToggle.classList.toggle('sound-off', !isSoundOn);
            console.log(`?ъ슫???곹깭: ${isSoundOn ? 'ON' : 'OFF'}`);
            // [?좉퇋] ?ъ슫???좉? 利됱떆 諛섏쁺
            if (isSoundOn) {
                if (gameState === STATE.PLAYING) playSound('bgm');
            } else {
                pauseBGM();
            }
        };
    }

    // ???꾪솚 濡쒖쭅 ?듯빀
    const initTabs = (t1Id, t2Id, c1Id, c2Id, onTabClickCallback = null) => {
        const t1 = document.getElementById(t1Id); const t2 = document.getElementById(t2Id);
        const c1 = document.getElementById(c1Id); const c2 = document.getElementById(c2Id);
        if (t1 && t2) {
            const handleTabClick = () => {
                if (onTabClickCallback) onTabClickCallback();
            };
            t1.onclick = () => { t1.classList.add('active'); t2.classList.remove('active'); c1.classList.remove('hidden'); c2.classList.add('hidden'); handleTabClick(); };
            t2.onclick = () => { t2.classList.add('active'); t1.classList.remove('active'); c2.classList.remove('hidden'); c1.classList.add('hidden'); handleTabClick(); };
        }
    };
    // [?섏젙] ?덉씠?ㅻ８/李멸?以????꾪솚 ?쒖뿉??renderRoomLists ?⑥닔瑜?肄쒕갚?쇰줈 ?꾨떖?섏뿬 紐⑸줉???덈줈怨좎묠?⑸땲??
    initTabs('tab-race-room', 'tab-my-rooms', 'content-race-room', 'content-my-rooms', () => {
        renderRoomLists(true);
        fetchRaceRooms(false); // [FIX] ???꾪솚 ???쒕쾭 ?곗씠??媛깆떊
        fetchMyRooms();        // [?좉퇋] ??諛?紐⑸줉 媛깆떊
    });
    
    // [?섏젙] Top 100 ???대┃ ???쒕쾭?먯꽌 ??궧 遺덈윭?ㅺ린
    initTabs('tab-my-record', 'tab-top-100', 'content-my-record', 'content-top-100', () => {
        const tabTop100 = document.getElementById('tab-top-100');
        if (tabTop100 && tabTop100.classList.contains('active')) {
            loadLeaderboard();
        }
    });

    // [?좉퇋] ?????덈줈怨좎묠 踰꾪듉 ?대깽??
    document.querySelectorAll('.list-tabgroup .refresh').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation(); // 遺紐⑥씤 ??쓽 ?대┃ ?대깽?멸? ?꾪뙆?섎뒗 寃껋쓣 留됱뒿?덈떎.
            
            // [FIX] ?덈줈怨좎묠 踰꾪듉???숈옉?섏? ?딅뒗 臾몄젣 ?닿껐
            // ?먯씤: 1. 以묐났 ?몄텧 諛⑹? 濡쒖쭅 ?뚮Ц???덈줈怨좎묠??臾댁떆?? 2. '李멸?以? 紐⑸줉 媛깆떊 濡쒖쭅 ?꾨씫.
            // ?닿껐: 1. 湲곗〈 Promise瑜?珥덇린?뷀븯??媛뺤젣濡?紐⑸줉???ㅼ떆 遺덈윭?ㅻ룄濡??섏젙.
            //      2. '李멸?以? 紐⑸줉???④퍡 媛깆떊?섎룄濡?fetchMyRooms()瑜??몄텧.
            console.log("?봽截?紐⑸줉 ?덈줈怨좎묠 踰꾪듉 ?대┃??");
            roomFetchPromise = null; // 湲곗〈 Promise瑜?珥덇린?뷀븯??fetchRaceRooms媛 ?ㅼ떆 ?ㅽ뻾?섎룄濡???
            fetchRaceRooms(false);
            fetchMyRooms();
        };
    });

    // [?섏젙] 'HOME' 踰꾪듉 ?대┃ ??handleHomeButtonClick ?곌껐 (?곹솴???곕씪 ?앹뾽 ??
    if (btnExitFromStart) btnExitFromStart.onclick = () => exitToLobby(true);
    if (btnExitFromPause) btnExitFromPause.onclick = handleHomeButtonClick;
    if (btnExitFromGameover) btnExitFromGameover.onclick = handleHomeButtonClick;

    // [?좉퇋] 諛???젣 踰꾪듉
    if (btnDeleteRoom) {
        btnDeleteRoom.onclick = () => {
            if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.remove('hidden');
        };
    }

    // ?먰봽/遺?ㅽ듃 而⑦듃濡?
    const btnJump = document.getElementById('btn-jump');
    if (btnJump) {
        const startJumping = (e) => {
            e.preventDefault();
            if (gameState === STATE.PLAYING) {
                btnJump.classList.add('pressed');
                isJumpPressed = true; // ?꾨쫫 ?곹깭 ?좎?
                if (!chicken.isJumping) chicken.jump(); // 利됱떆 ?먰봽 ?쒕룄
            }
        };
        const endJumping = (e) => {
            e.preventDefault();
            btnJump.classList.remove('pressed');
            isJumpPressed = false; // ?꾨쫫 ?곹깭 ?댁젣
            if (gameState === STATE.PLAYING) {
                chicken.cutJump();
            }
        };
        // [?섏젙] addEventListener 諛⑹떇?쇰줈 蹂寃쏀븯???곗튂 諛섏쓳??媛쒖꽑
        btnJump.addEventListener('mousedown', startJumping);
        btnJump.addEventListener('mouseup', endJumping);
        btnJump.addEventListener('mouseleave', endJumping);
        btnJump.addEventListener('touchstart', startJumping, { passive: false });
        btnJump.addEventListener('touchend', endJumping);
        btnJump.addEventListener('touchcancel', endJumping);
    }
    const btnBoost = document.getElementById('btn-boost');
    if (btnBoost) {
        const startBoosting = (e) => {
            e.preventDefault();
            if (gameState === STATE.PLAYING) {
                btnBoost.classList.add('pressed');
                chicken.isBoosting = true;
            }
        };
        const endBoosting = (e) => {
            e.preventDefault();
            btnBoost.classList.remove('pressed');
            chicken.isBoosting = false;
        };
        // [?섏젙] addEventListener 諛⑹떇?쇰줈 蹂寃쏀븯???곗튂 諛섏쓳??媛쒖꽑
        btnBoost.addEventListener('mousedown', startBoosting);
        btnBoost.addEventListener('mouseup', endBoosting);
        btnBoost.addEventListener('mouseleave', endBoosting);
        btnBoost.addEventListener('touchstart', startBoosting, { passive: false });
        btnBoost.addEventListener('touchend', endBoosting);
        btnBoost.addEventListener('touchcancel', endBoosting);
    }

    // [?섏젙] 紐⑤떖 ??range input 媛??쒖떆 諛??꾨줈洹몃젅??諛??낅뜲?댄듃
    const setupRangeInput = (rangeId, displayId) => {
        const rangeInput = document.getElementById(rangeId);
        if (!rangeInput) return;

        const update = () => {
            // 1. ?띿뒪??媛??낅뜲?댄듃
            const displayEl = document.getElementById(displayId);
            if (displayEl) displayEl.innerText = rangeInput.value;
            
            // [?좉퇋] ?쒕룄 ?잛닔 ?щ씪?대뜑 蹂寃???李④컧 肄붿씤 ?쒖떆 ?낅뜲?댄듃
            const displayCost = document.getElementById('display-cost');
            if (rangeId === 'input-room-attempts' && displayCost) displayCost.innerText = rangeInput.value;

            // 2. CSS 蹂?섎? ?댁슜???꾨줈洹몃젅??諛??낅뜲?댄듃
            const min = parseFloat(rangeInput.min) || 0;
            const max = parseFloat(rangeInput.max) || 100;
            const value = parseFloat(rangeInput.value);
            const percent = ((value - min) / (max - min)) * 100;
            rangeInput.style.setProperty('--progress-percent', `${percent}%`);
        };

        rangeInput.addEventListener('input', update);
        update(); // 珥덇린 濡쒕뱶 ????踰??ㅽ뻾?섏뿬 ?꾩옱 媛믪쑝濡??꾨줈洹몃젅??諛붾? 梨꾩썎?덈떎.
    };
    setupRangeInput('input-room-limit', 'display-limit');
    setupRangeInput('input-room-attempts', 'display-attempts');

    // [?좉퇋] ?쒖쐞 寃곗젙 諛⑹떇 ?좉? 踰꾪듉 ?대깽??
    document.querySelectorAll('#group-rank-type button').forEach(btn => {
        btn.onclick = () => {
            // 癒쇱? 紐⑤뱺 踰꾪듉?먯꽌 active ?대옒???쒓굅
            document.querySelectorAll('#group-rank-type button').forEach(b => b.classList.remove('active'));
            // ?대┃??踰꾪듉?먮쭔 active ?대옒??異붽?
            btn.classList.add('active');
        };
    });

    // ?ㅻ낫???먰봽 (?꾨Ⅴ???쒓컙???곕씪 ?믪씠 議곗젅)
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && gameState === STATE.PLAYING) {
            e.preventDefault(); 
            if (!isJumpPressed) { // [?좉퇋] 泥섏쓬 ?뚮????뚮쭔 ?ㅽ뻾
                isJumpPressed = true;
                if (!chicken.isJumping) chicken.jump();
            }
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && gameState === STATE.PLAYING) {
            e.preventDefault(); isJumpPressed = false; chicken.cutJump();
        }
    });

    // [媛쒕컻?? 肄섏넄?먯꽌 珥덇린???⑥닔瑜??쎄쾶 ?몄텧?????덈룄濡?window 媛앹껜???좊떦
    window.resetAdCount = resetAdCount;
    window.resetRoomData = resetRoomData;
});
