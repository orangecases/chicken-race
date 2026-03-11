/**
 * 📢 치킨 런 - 최종 통합 및 UI 연출/싱글모드 로직 수정 버전(f1750ceef8d6a2363eabcd0cb22364b0c0a2bd43)
 */

// [네이버 로그인 팝업용 토큰 전달 로직]
if (window.location.hash.includes('access_token')) {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');

    // 이 창이 팝업창인지 확인하고 부모 창으로 토큰 전달
    if (window.opener) {
        window.opener.postMessage({ type: 'NAVER_LOGIN', token: token }, '*');
        window.close(); // 팝업 닫기
    }
    // 🚨 [추가됨] 팝업창에서는 더 이상 아래쪽의 게임 로직을 실행하지 않도록 강제로 멈춥니다!
    throw new Error("팝업창 처리를 완료하고 스크립트를 중지합니다. (정상적인 동작입니다)");
}

// [1. 전역 변수 및 게임 설정]
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
let level = 1; // [신규] 레벨 변수
let myScores = []; // 내 기록 배열
let bestScore = 0; // 최고 기록 (myScores에서 파생)
let top100Scores = []; // Top 100 더미 데이터
let nextLevelFrameThreshold = 600; // [수정] 난이도 상승 기준 (프레임 단위, 600프레임 ≒ 10초)
let currentGameMode = 'single';
let isGameReady = false;
let gameLoopId = null;
let isSoundOn = true; // [신규] 사운드 상태 (true: ON, false: OFF)
let isLoggedIn = false; // [신규] 로그인 상태
let currentUser = null; // [신규] 로그인한 사용자 정보
let unsubscribeUserData = null; // [신규] 유저 데이터 리스너 해제 함수
let guestCoins = parseInt(localStorage.getItem('chickenRunGuestCoins') || '10'); // [FIX] 삭제되었던 게스트 코인 변수 복원
let multiGamePlayers = []; // [신규] 멀티플레이 참여자 목록
let unsubscribeParticipantsListener = null; // [신규] 멀티플레이 참가자 실시간 리스너
let autoActionTimer = null; // [신규] 자동 액션 타이머
let lastFirestoreUpdateTime = 0; // [3단계] Firestore 업데이트 쓰로틀링용
const FIRESTORE_UPDATE_INTERVAL = 1000; // [3단계] 1초 간격으로 업데이트
let isJumpPressed = false; // [신규] 점프 버튼 누름 상태 유지 변수
let displayedMyRecordsCount = 20; // [신규] 내 기록 표시 개수 (무한 스크롤용)

// [수정] 관리자 식별 방식을 이메일에서 UID로 변경합니다.
// 아래 배열에 Firebase Console > Authentication에서 확인한 관리자 계정의 UID를 추가하세요.
const ADMIN_UIDS = ["zq4jlJbH47ZEasqIxNFVVhZIqwv1"]; // 예: "Abc123xyz..."

// [수정] 페이지네이션(Pagination) 설정: 1만개 이상의 방이 있어도 앱이 원활하게 동작하도록 합니다.
let lastVisibleRoomDoc = null; // 마지막으로 불러온 방의 문서 참조
let isFetchingRooms = false;   // 방 목록을 불러오는 중인지 여부 (중복 호출 방지)
let currentRoomLimit = 5;     // [신규] 현재 불러올 방의 개수 (limit)
let currentMyRoomLimit = 10;   // [신규] 참가중 탭의 목록 노출 개수 (limit)
let unsubscribeRoomListener = null; // [신규] 실시간 리스너 해제 함수
const ROOMS_PER_PAGE = 5;     // 한 번에 불러올 방의 개수
let allRoomsLoaded = false;    // 모든 방을 다 불러왔는지 여부 (더보기 버튼 표시 제어)
let myRooms = [];              // [신규] 참가중인 방 목록 데이터 별도 저장

// [신규] 광고 시스템 설정
const AD_CONFIG = {
    REWARD: 5,      // 1회당 지급 코인
    DAILY_LIMIT: 10, // 일일 최대 시청 횟수
    DURATION: 10000  // [신규] 광고 시청 시간 (10초, ms 단위)
};

// [데이터] 방 정보 및 현재 진행 상태
let currentRoom = null;
let targetRoom = null; // [신규] 비밀번호 입력 중인 대상 방
// [수정] 테스트 시나리오 다각화를 위해 레이스룸 데이터 확장
// [수정] usedAttempts 속성을 제거합니다. 이 정보는 이제 사용자별로 currentUser.joinedRooms에 저장됩니다.
let raceRooms = [
    { id: 1, title: "이 구역의 미친 닭 모여라!", limit: 5, current: 3, attempts: 3, status: "inprogress", rankType: 'total' },
    { id: 2, title: "초보만 오세요 제발", limit: 5, current: 1, attempts: 5, status: "inprogress", rankType: 'best' },
    { id: 3, title: "비밀의 방 (비번:1234)", limit: 5, current: 0, attempts: 3, status: "inprogress", isLocked: true, password: "1234", rankType: 'best' },
    { id: 4, title: "딱 한 자리 남음! (합산)", limit: 10, current: 9, attempts: 2, status: "inprogress", rankType: 'total' },
    { id: 5, title: "최고점 한판 승부", limit: 4, current: 1, attempts: 1, status: "inprogress", rankType: 'best' },
    { id: 6, title: "장기전: 끈기있는 닭들의 대결", limit: 8, current: 2, attempts: 5, status: "inprogress", rankType: 'total' },
    { id: 7, title: "완전히 종료된 방 (테스트용)", limit: 5, current: 5, attempts: 3, status: "finished", rankType: 'best' }
];
let unlockedRoomIds = []; // [신규] 비밀번호 해제된 방 ID 목록

// 물리 설정
let baseGameSpeed = 10; // 이 값은 게임 중에 점차 증가합니다.
let gameSpeed = 10;
let speedMultiplier = 1;
const FRICTION = 0.96;
const GRAVITY = 1.2;
const JUMP_FORCE = 30;
const FLOOR_Y = GAME_HEIGHT - 124 - 128;

// [2. 리소스 로딩]
const imageSources = {
    sky: 'assets/images/gamebg-sky.png', floor: 'assets/images/element_floor.png',
    chickenRun1: 'assets/images/chickenRun_01.png', chickenRun2: 'assets/images/chickenRun_02.png',
    chickenShock: 'assets/images/chicken_shock.png', chickenDead: 'assets/images/chicken_dead.png',
    eagle: 'assets/images/obstacle_eagle.png', dog1: 'assets/images/dogRun_01.png',
    dog2: 'assets/images/dogRun_02.png', dog3: 'assets/images/dogRun_03.png',
    fire1: 'assets/images/fireBurn_01.png', fire2: 'assets/images/fireBurn_02.png',
    fire3: 'assets/images/fireBurn_03.png', fire4: 'assets/images/fireBurn_04.png',
    fire5: 'assets/images/fireBurn_05.png', fire6: 'assets/images/fireBurn_06.png',
    // [신규] 깃털 이미지 추가
    featherLg: 'assets/images/feather_lg.png', featherMd: 'assets/images/feather_md.png', featherSm: 'assets/images/feather_sm.png'
};
const images = {};
let loadedCount = 0;
const totalImages = Object.keys(imageSources).length;
for (let key in imageSources) {
    images[key] = new Image(); images[key].src = imageSources[key];
    images[key].onload = () => { loadedCount++; if (loadedCount === totalImages) isGameReady = true; };
}
// [신규] 오디오 리소스 로딩
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
    if (key === 'bgm') { audios[key].loop = true; audios[key].volume = 0.2; } // [수정] 배경음악 볼륨 하향 (0.5 -> 0.2)
}

// [3. 게임 객체 클래스]

class ScrollingBackground {
    constructor(imageKey, speedRatio, width, height) {
        this.imageKey = imageKey; this.speedRatio = speedRatio; this.width = width; this.height = height; this.x = 0;
    }
    draw(yPosition) {
        const img = images[this.imageKey];
        if (!img || !img.complete) return;
        // [FIX] 게임이 'PLAYING' 또는 'CRASHED' 상태일 때 배경을 스크롤하여 자연스러운 감속 효과를 줍니다.
        if (gameState === STATE.PLAYING || gameState === STATE.CRASHED) {
            this.x -= gameSpeed * this.speedRatio;
            if (this.x <= -this.width) this.x = 0;
        }
        // [수정] 이미지 루프 시 틈새가 보이지 않도록 너비를 살짝(2px) 늘려서 겹치게 그립니다.
        ctx.drawImage(img, this.x, yPosition, this.width + 2, this.height);
        ctx.drawImage(img, this.x + this.width, yPosition, this.width + 2, this.height);
    }
}
const skyBg = new ScrollingBackground('sky', 0.2, 1242, 696);
const floorBg = new ScrollingBackground('floor', 1.0, 1240, 124);

const chicken = {
    width: 128, height: 128, x: 100, y: FLOOR_Y, dy: 0, isJumping: false, frameDelay: 8, isBoosting: false, targetX: 100,
    boostProgress: 0, // [신규] 부스트 게이지 (0~100)
    crashFrame: 0,
    update() {
        if (gameState === STATE.PLAYING) {
            if (this.isJumping) {
                this.y += this.dy; this.dy += GRAVITY;
                if (this.y > FLOOR_Y) { this.y = FLOOR_Y; this.dy = 0; this.isJumping = false; }
            } else {
                // [신규] 바닥에 있고 점프 버튼을 누르고 있으면 연속 점프
                if (isJumpPressed) {
                    this.jump();
                }
            }
            if (this.isBoosting) {
                this.targetX = 550; this.frameDelay = 4; this.x += (this.targetX - this.x) * 0.008;
                this.boostProgress = Math.min(100, this.boostProgress + 0.5); // [수정] 부스트 시 게이지 상승
            }
            else {
                this.targetX = 100; this.frameDelay = 8; this.x += (this.targetX - this.x) * 0.005;
                this.boostProgress = Math.max(0, this.boostProgress - 1); // [수정] 미사용 시 게이지 하락
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
            // [FIX] IDLE(준비), PAUSED(일시정지) 상태에서는 기본 달리기 자세로 보이도록 수정
            sprite = images.chickenRun1;
        }
        if (sprite && sprite.complete) ctx.drawImage(sprite, this.x, this.y, this.width, this.height);
    },
    jump() { if (!this.isJumping && gameState === STATE.PLAYING) { this.isJumping = true; this.dy = -JUMP_FORCE; playSound('jump'); } },
    /**
     * [신규] 점프를 중간에 멈추는 함수.
     * 상승 중일 때(dy < 0) 호출되면, 상승 속도를 줄여 낮은 점프를 만듭니다.
     */
    cutJump() {
        // 상승 속도가 일정 값 이상일 때만 적용하여 너무 낮은 점프가 되는 것을 방지
        // [수정] -20은 너무 낮고, -25는 너무 높다는 피드백을 반영하여 중간값인 -22로 조정
        // 적당한 높이의 숏 점프(소점프)가 가능하도록 설정
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
            // [수정] 불꽃 장애물의 판정 범위를 줄여서(width: 80->50) 피하기 쉽게 조정
            this.hitbox = { xOffset: 60, yOffset: 40, width: 50, height: 100 };
        } else {
            this.width = 280; this.height = 144; this.y = GAME_HEIGHT - 124 - 168 - 120;
            this.frame = 0; this.hitbox = { xOffset: 20, yOffset: 40, width: 240, height: 60 };
        }
        this.x = GAME_WIDTH;
    }
    update() {
        if (this.type === 'eagle') this.x -= (gameSpeed + 7); // [수정] 독수리가 게임 속도보다 항상 빠르게 날아옴
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
let feathers = []; // [신규] 깃털 파티클 배열
let obstacleTimer = 0;

// [신규] 깃털 파티클 클래스
class Feather {
    constructor(x, y) {
        this.x = x; this.y = y;
        const types = ['featherLg', 'featherMd', 'featherSm'];
        this.imageKey = types[Math.floor(Math.random() * types.length)];

        // 폭발하듯 퍼지는 초기 속도 (사방으로 퍼짐)
        const angle = Math.random() * Math.PI * 2;
        const speed = 5 + Math.random() * 15;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - 1; // [수정] 위쪽으로 솟구치는 힘을 줄임 (-5 -> -2)

        this.gravity = 0.4; // 가볍게 떨어지도록 낮은 중력
        this.friction = 0.94; // 공기 저항

        this.rotation = Math.random() * 360;
        this.rotationSpeed = (Math.random() - 0.5) * 15; // 빙글빙글 회전

        this.scale = 0.4 + Math.random() * 0.6; // 크기 랜덤
        this.opacity = 1;
        this.fadeSpeed = 0.01 + Math.random() * 0.02; // 천천히 사라짐

        this.flip = Math.random() < 0.5 ? 1 : -1; // [핵심] 좌우 반전 (1: 원본-왼쪽, -1: 반전-오른쪽)

        // 좌우 흔들림 (Sway) - 떨어질 때 살랑거리는 효과
        this.swayPhase = Math.random() * Math.PI * 2;
        this.swaySpeed = 0.1;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.vx *= this.friction;

        // 공기 저항으로 인한 좌우 흔들림 추가
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
        ctx.scale(this.scale * this.flip, this.scale); // 좌우 반전 적용
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
    }
}

function createFeatherExplosion(x, y) {
    // 충돌 시 15~25개의 깃털 생성
    const count = 15 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
        feathers.push(new Feather(x, y));
    }
    playSound('feather'); // [신규] 깃털 효과음 재생
}

function handleObstacles() {
    if (gameState === STATE.PLAYING) {
        obstacleTimer += speedMultiplier;
        // [수정] 장애물 빈도 증가 (기존: 110+60 -> 80+50) - 화면에 더 자주 등장하도록 조정
        if (obstacleTimer > 80 + Math.random() * 50) {
            obstacleTimer = 0; // 타이머를 즉시 리셋

            // [수정] 복합 패턴 등장 시점을 3000점에서 1000점으로 앞당김
            if (score > 1000) {
                const patternType = Math.random();
                if (patternType < 0.25) { // 25% 확률: 단일 불꽃
                    obstacles.push(new Obstacle('fire'));
                } else if (patternType < 0.5) { // 25% 확률: 단일 독수리
                    obstacles.push(new Obstacle('eagle'));
                } else if (patternType < 0.75) { // 25% 확률: 이중 불꽃 (붙음 - 긴 점프로 회피)
                    const fire1 = new Obstacle('fire');
                    const fire2 = new Obstacle('fire');
                    // [수정] 간격을 넓혀서(140) 한 번의 긴 점프로 넘도록 유도
                    fire2.x = fire1.x + 140;
                    obstacles.push(fire1, fire2);
                } else { // 25% 확률: 떨어진 이중 불꽃 (짧게 두 번 연속 점프)
                    const fire1 = new Obstacle('fire');
                    const fire2 = new Obstacle('fire');
                    // [수정] 간격을 좁혀서(260) 착지 후 즉시 다시 뛰어야 함 (따닥!)
                    fire2.x = fire1.x + 260;
                    obstacles.push(fire1, fire2);
                    obstacleTimer = -20; // 패턴 길이 보정
                }
            } else {
                // 1000점 미만일 때는 기본 장애물만 등장 (50% 확률)
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
                // [신규] 깃털 폭발 효과 생성
                createFeatherExplosion(chicken.x + chicken.width / 2, chicken.y + chicken.height / 2);
                chicken.dy = -5;
                playSound('crash'); // [신규] 충돌 효과음 재생
            }
        }
    });
    obstacles = obstacles.filter(obs => !obs.markedForDeletion);
}

// [4. 핵심 제어 함수]

/**
 * [신규] 코인 UI 업데이트 함수
 * 프로필 모달, 게임 오버레이(시작/일시정지/종료)의 코인 수치를 동기화합니다.
 */
function updateCoinUI() {
    // [수정] 로그인 여부에 따라 코인 표시 (게스트 코인 지원)
    const coinVal = currentUser ? currentUser.coins : guestCoins;
    if (document.getElementById('profile-coin-count')) document.getElementById('profile-coin-count').innerText = coinVal;
    document.querySelectorAll('.coin-stat strong').forEach(el => {
        el.innerText = coinVal;
    });
    // [신규] 코인 변동 시 유저 정보 저장 (영속성 유지)
    // [신규] 광고 버튼 텍스트 업데이트 (남은 횟수 표시)
    const btnRecharge = document.getElementById('btn-recharge-coin');
    if (btnRecharge) {
        const adData = getAdData();
        btnRecharge.innerText = `충전 (${adData.count}/${AD_CONFIG.DAILY_LIMIT})`;
    }
}

/**
 * [신규] 게임 시작/재시작 버튼의 코인 비용 표시를 업데이트합니다.
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
        // 멀티모드: 시작 버튼에는 방 설정 시의 시도 횟수(비용) 표시
        // [수정] 이미 지불했는지 확인하여 비용 표시 (지불했으면 0)
        const userRoomState = (currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[currentRoom.id] : null;
        const cost = (userRoomState && userRoomState.isPaid) ? 0 : currentRoom.attempts;
        if (startCostVal) startCostVal.innerText = cost;
        // 멀티모드: 재시작 버튼에서는 코인 표시 숨김 (이미 지불됨)
        if (restartCostSpan) restartCostSpan.style.display = 'none';
    }
}

/**
 * [신규] 게임 컨트롤러의 표시 상태를 설정하고, 그에 따라 #scene-game에 클래스를 토글합니다.
 * @param {boolean} visible - 컨트롤러를 표시할지 여부
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
 * [신규] 멀티플레이 종료 시 순위에 따른 뱃지 지급 및 저장
 */
function awardBadgeIfEligible() {
    if (!isLoggedIn || !currentUser || currentGameMode !== 'multi' || !currentRoom) return;

    // [신규] 4인 이상 참여한 게임에서만 뱃지 지급
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

// [신규] 사운드 재생 헬퍼 함수
function playSound(key) {
    if (!isSoundOn || !audios[key]) return;
    if (key === 'bgm') {
        audios[key].play().catch((e) => console.warn('BGM 재생 실패:', e));
    } else {
        const sound = audios[key].cloneNode();
        if (key === 'jump') {
            sound.volume = 0.1; // [수정] 점프 소리가 커서 별도로 줄임
        } else if (key === 'crash' || key === 'feather' || key === 'start') {
            sound.volume = 0.8; // [수정] 충돌 및 깃털 소리는 잘 들리게 키움
        } else {
            sound.volume = 0.1; // [수정] 그 외 효과음도 약간 줄임
        }
        sound.play().catch((e) => console.warn('효과음 재생 실패:', e));
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
    // 모든 메시지 숨김
    document.querySelectorAll('.time-message').forEach(el => el.style.display = 'none');
}

function startAutoActionTimer(duration, type, selector) {
    // [수정] 이미 타이머가 실행 중인 경우 (예: 홈화면에 나갔다 온 경우),
    // 타이머를 새로 시작하지 않고, 메시지만 다시 보이도록 처리합니다.
    // 단, 'deductAttempt' 타입의 타이머가 이미 실행 중인데,
    // 다시 'deductAttempt'로 호출되는 경우는 (예: 타이머 만료 후 재호출)
    // 기존 타이머를 클리어하고 새로 시작해야 합니다.
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
        if (type === 'exit') el.innerText = `${timeLeft}초 후 자동 아웃`; // 로비 퇴장
        else if (type === 'deductAttempt') el.innerText = `${timeLeft}초 후 1회 차감`; // 시도 횟수 차감
        else el.innerText = `${timeLeft}초 후 자동 시작`;
    };
    updateText();

    autoActionTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearAutoActionTimer();
            if (type === 'exit') {
                // [FIX] 시작 화면 타임아웃은 '완전 퇴장'으로 처리해야 합니다.
                exitToLobby(true);
            } else if (type === 'deductAttempt') { // [신규] 시도 횟수 차감 로직
                if (currentGameMode === 'multi' && currentRoom) {
                    // [수정] 사용자별 시도 횟수 차감
                    if (currentUser && currentUser.joinedRooms[currentRoom.id]) {
                        currentUser.joinedRooms[currentRoom.id].usedAttempts++;
                        saveUserDataToFirestore(); // [FIX] 시도 횟수 변경 시 서버에 즉시 저장
                    }
                    const myId = currentUser ? currentUser.id : 'me';
                    handleGameOverUI(); // UI 갱신 및 다음 타이머 시작 또는 게임 오버 처리
                }
            }
            else { // [기존] 자동 시작/재개 (일시정지 화면에서만 유효)
                if (gameState === STATE.PAUSED) togglePause();
                // [수정] 게임 오버 상태에서는 자동 재시작하지 않음 (deductAttempt 타입에서 처리)
                // else if (gameState === STATE.GAMEOVER) {
                //     const btnRestart = document.getElementById('btn-restart');
                //     if (btnRestart && btnRestart.style.display !== 'none') btnRestart.click();
                // }
            }
        } else {
            updateText();
        }
    }, 1000);
}

function resetGame() {
    clearAutoActionTimer(); // [신규] 타이머 초기화
    gameState = STATE.IDLE; // [수정] 초기 상태를 IDLE(대기)로 설정하여 봇 시뮬레이션만 수행
    stopBGM(); // [신규] 리셋 시 BGM 정지 (시작 버튼 누를 때 재생)
    baseGameSpeed = 15; // [수정] 기본 속도 상향 (10 -> 12)
    gameSpeed = baseGameSpeed;
    gameFrame = 0;
    score = 0;
    level = 1; // [신규] 레벨 초기화
    nextLevelFrameThreshold = 600; // [수정] 시간 기준 초기화
    isJumpPressed = false; // [수정] 점프 입력 상태 즉시 초기화
    obstacleTimer = 0;
    skyBg.x = 0; floorBg.x = 0; obstacles = []; feathers = []; // [신규] 깃털 초기화
    chicken.y = FLOOR_Y; chicken.dy = 0; chicken.x = 100; chicken.targetX = 100;
    chicken.isBoosting = false; chicken.boostProgress = 0; chicken.crashFrame = 0; // [수정] 부스트 및 게이지 즉시 초기화
    dog.x = dog.initialX; dog.targetX = dog.initialX;

    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('game-start-screen').classList.add('hidden');
    document.getElementById('game-pause-screen').classList.add('hidden');

    // [수정] 버튼 UI의 눌림 상태(CSS 클래스) 강제 제거
    const btnJump = document.getElementById('btn-jump');
    if (btnJump) btnJump.classList.remove('pressed');
    const btnBoost = document.getElementById('btn-boost');
    if (btnBoost) btnBoost.classList.remove('pressed');

    // HUD 점수 초기화
    const scoreEl = document.querySelector('.hud-score');
    const levelEl = document.querySelector('.hud-level');
    if (scoreEl) {
        scoreEl.querySelector('.score-val').innerText = '0';
        scoreEl.classList.remove('green', 'yellow', 'orange', 'red');
    }
    if (levelEl) levelEl.innerText = 'LV.' + level;

    // 일시정지 버튼 아이콘 초기화
    const btnPauseToggle = document.getElementById('btn-pause-toggle');
    if (btnPauseToggle) btnPauseToggle.classList.remove('paused');
}

function drawStaticFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    skyBg.draw(0); floorBg.draw(GAME_HEIGHT - 124);
    dog.draw(); chicken.draw();
}

/**
 * [신규] Firebase Firestore에 점수 저장
 */
function saveScoreToFirebase(finalScore) {
    const userNickname = (currentUser && currentUser.nickname) ? currentUser.nickname : "지나가던 병아리";
    const uid = (currentUser && currentUser.id) ? currentUser.id : null;

    // Firebase Firestore에 데이터 저장하기
    db.collection("rankings").add({
        uid: uid,
        nickname: userNickname,
        score: finalScore,
        timestamp: firebase.firestore.FieldValue.serverTimestamp() // 서버 시간 기록
    })
        .then((docRef) => {
            console.log("✅ 점수가 서버에 기록되었습니다! ID:", docRef.id);
        })
        .catch((error) => {
            console.error("❌ 점수 저장 실패:", error);
        });
}

function handleGameOverUI() {
    const govTitle = document.getElementById('gov-title');
    const govMsg = document.getElementById('gov-message');
    const btnRestart = document.getElementById('btn-restart');
    const btnDeleteRoom = document.getElementById('btn-delete-room');
    const govScreen = document.getElementById('game-over-screen');
    stopBGM(); // [신규] 게임 오버 시 BGM 정지

    if (currentGameMode === 'single') {
        const finalScore = Math.floor(score);

        // [신규] 이번 기록을 '내 기록'에 저장
        saveMyScore(finalScore);
        saveScoreToFirebase(finalScore); // [신규] Firebase에 점수 저장
        govTitle.innerText = "GAME OVER";
        govMsg.innerText = ``; // 기록 메시지를 표시하지 않도록 비워둡니다.
        btnRestart.style.display = 'block';
        if (btnDeleteRoom) btnDeleteRoom.style.display = 'none';
    } else {
        if (!currentRoom) return;

        const myId = currentUser ? currentUser.id : 'me';
        const userUsedAttempts = (currentUser && currentUser.joinedRooms[currentRoom.id]) ? currentUser.joinedRooms[currentRoom.id].usedAttempts : 0;
        const myPlayer = multiGamePlayers.find(p => p.id === myId);
        if (!myPlayer) return;

        const participantDocRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(myId);

        // [FIX] myPlayer.attemptsLeft는 onSnapshot에 의해 덮어쓰여질 수 있으므로, 지역 변수로 남은 횟수를 명확하게 계산하고 사용합니다.
        const attemptsLeft = currentRoom.attempts - userUsedAttempts;

        // [FIX] 충돌 직후 점수가 NaN이 되는 문제 해결
        // 충돌 시 score가 NaN이 되는 경우를 방지하기 위해 유효성 검사 추가
        let validScore = score;
        if (isNaN(validScore)) validScore = 0;

        // [FIX] 랭킹 표시용 점수(displayScore) 계산
        // 기존에는 현재 판 점수(validScore)를 displayScore로 저장하여, 합산 점수가 아닌 마지막 점수만 표시되는 문제가 있었습니다.
        let finalDisplayScore = 0;
        if (currentRoom.rankType === 'total') {
            finalDisplayScore = (myPlayer.totalScore || 0);
        } else {
            finalDisplayScore = (myPlayer.bestScore || 0);
        }

        if (attemptsLeft > 0) { // 남은 시도 횟수가 있을 경우
            govTitle.innerText = "WOOPS!";
            govMsg.innerText = `남은 횟수 : ${attemptsLeft}/${currentRoom.attempts}`;
            myPlayer.status = 'waiting'; // 대기 상태로 변경
            // [2단계] Firestore 상태 업데이트
            participantDocRef.update({ status: 'waiting' }).catch(e => console.error("상태 업데이트 실패(waiting)", e));
            startAutoActionTimer(30, 'deductAttempt', '#game-over-screen .time-message'); // [수정] 1회 차감 타이머 시작
            btnRestart.style.display = 'block';
            if (btnDeleteRoom) btnDeleteRoom.style.display = 'none';
        } else {
            govTitle.innerText = "GAME OVER";
            govMsg.innerText = "모든 시도 횟수를 사용했습니다.";

            // [신규] 멀티플레이 상태 업데이트 (탈락/종료)
            if (myPlayer) myPlayer.status = 'dead';
            // [2단계] Firestore 상태 업데이트
            participantDocRef.update({ status: 'dead' }).catch(e => console.error("상태 업데이트 실패(dead)", e));

            awardBadgeIfEligible(); // [신규] 모든 기회 소진 시 뱃지 수여 판단

            btnRestart.style.display = 'none';
            if (btnDeleteRoom) btnDeleteRoom.style.display = 'block';
            // [수정] 나만 끝났다고 해서 방 전체를 종료 상태로 변경하지 않음
            // (모든 사용자가 완료해야 종료됨 - 현재는 시뮬레이션이므로 상태 유지)
        }

        // [리팩토링] 최종 점수 업데이트 로직을 if/else 블록 밖으로 이동하여 중복을 제거합니다.
        // 이 시점의 myPlayer.totalScore와 myPlayer.bestScore는 gameLoop에서 마지막 판의 점수가 이미 반영된 상태입니다.
        participantDocRef.update({
            totalScore: myPlayer.totalScore,
            bestScore: myPlayer.bestScore,
            displayScore: finalDisplayScore
        }).then(() => {
            console.log(`✅ 최종 점수(${Math.floor(finalDisplayScore)})를 서버에 저장했습니다.`);
        }).catch(error => {
            console.error("❌ 최종 점수 서버 저장 실패:", error);
        });
    }

    govScreen.classList.remove('hidden');
    setControlsVisibility(false); // [수정] 게임 종료 시 컨트롤 버튼 숨김

    renderRoomLists();
    renderMultiRanking(); // [신규] 게임 오버 시 랭킹 즉시 갱신
}

/**
 * [3단계] 멀티플레이 게임 상태를 실시간으로 처리하고 Firestore와 동기화합니다.
 * 이 함수는 gameLoop 내에서 호출됩니다.
 */
function handleMultiplayerTick() {
    if (currentGameMode !== 'multi' || !currentRoom || !currentUser) return;

    // 1. 최종 결과가 확정된 방은 더 이상 업데이트하지 않습니다.
    if (currentRoom.status === 'finished') return;

    const now = Date.now();
    const myId = currentUser.id;
    const isHost = currentUser.id === currentRoom.creatorUid;
    const isAdmin = currentUser && currentUser.isAdmin; // [신규] 관리자 여부 확인
    const participantsRef = db.collection('rooms').doc(currentRoom.id).collection('participants');

    // 2. 플레이어 자신의 로컬 점수를 즉시 업데이트합니다. (UI 반응성용)
    const myPlayer = multiGamePlayers.find(p => p.id === myId);
    // [FIX] playing 뿐만 아니라 crashed 상태에서도 점수 동기화 (onSnapshot으로 객체가 교체되어도 점수 유지)
    if (myPlayer && (gameState === STATE.PLAYING || gameState === STATE.CRASHED)) {
        myPlayer.score = score;
    }

    // 3. Firestore 업데이트 (쓰로틀링 적용)
    if (now - lastFirestoreUpdateTime > FIRESTORE_UPDATE_INTERVAL) {
        lastFirestoreUpdateTime = now;
        const batch = db.batch();

        // 3a. 내 정보 업데이트 (내가 플레이 중일 때만)
        // [FIX] CRASHED 상태에서도 업데이트 허용 (status는 로컬에서 아직 playing일 수 있음)
        if (myPlayer && (myPlayer.status === 'playing' || myPlayer.status === 'waiting')) {
            const myDocRef = participantsRef.doc(myId);

            // [FIX] NaN 문제 해결: onSnapshot으로 덮어쓰여질 수 있는 myPlayer.score 대신,
            // 항상 최신 상태인 전역 변수 score를 직접 사용하여 계산합니다.
            const currentRunScore = (typeof score === 'number' && !isNaN(score)) ? score : 0;

            const displayScore = (currentRoom.rankType === 'total')
                ? (myPlayer.totalScore || 0) + currentRunScore
                : Math.max((myPlayer.bestScore || 0), currentRunScore);

            // NaN 체크 후 displayScore만 업데이트 (status 업데이트는 다른 곳에서 담당)
            if (!isNaN(displayScore)) {
                batch.update(myDocRef, {
                    displayScore: Math.floor(displayScore)
                });
            }
        }

        // 3b. 봇 정보 업데이트 (방장만 수행)
        // 3b. 봇 정보 업데이트 (방장 또는 관리자 수행)
        if (isHost || isAdmin) {
            // [FIX] 봇 시뮬레이션 로직을 onSnapshot에 의한 '기억상실'에 강하도록 수정합니다.
            // 로컬 배열을 직접 수정하는 대신, 현재 상태를 읽어 다음 상태를 계산하고 서버에 업데이트합니다.
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
                        targetScore = 750 + Math.floor(Math.random() * 1500); // [수정] 봇 목표 점수 하향 조정
                        if (attemptsLeft > 0) {
                            status = 'waiting';
                            startDelay = 60 + Math.floor(Math.random() * 120);
                        } else {
                            status = 'dead';
                        }
                    }
                }

                const botDisplayScore = (currentRoom.rankType === 'total') ? totalScore + score : Math.max(bestScore, score);

                // [FIX] NaN 점수가 데이터베이스에 기록되는 것을 방지합니다.
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

        batch.commit().catch(err => console.error("Firestore 일괄 업데이트 실패:", err));
    }

    // 4. 모든 플레이어의 게임 종료 여부 확인
    // [수정] 방이 꽉 찼고(currentPlayers === maxPlayers), 모든 참가자가 게임을 완료했을 때만 'finished' 상태로 변경합니다.
    // 이전 로직은 방이 꽉 차지 않아도 현재 참가자 전원이 완료하면 'finished'로 변경하는 문제가 있었습니다.
    const isRoomFull = currentRoom && multiGamePlayers.length >= currentRoom.limit;
    const areAllPlayersDead = multiGamePlayers.length > 0 && multiGamePlayers.every(p => p.status === 'dead');

    if (isRoomFull && areAllPlayersDead && currentRoom.status !== 'finished') {
        currentRoom.status = 'finished';
        db.collection('rooms').doc(currentRoom.id).update({ status: 'finished' })
            .then(() => console.log(`✅ 방 [${currentRoom.id}] 상태를 'finished'로 최종 변경했습니다.`));
    }
}

function gameLoop() {
    // [신규] IDLE 상태: 게임 시작 전 대기 상태 (봇 시뮬레이션은 계속 수행)
    if (gameState === STATE.IDLE) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        skyBg.draw(0); floorBg.draw(GAME_HEIGHT - 124);
        dog.draw(); chicken.draw(); // 정적 그리기

        // [핵심] 대기 상태에서도 멀티플레이 로직(봇 점수 계산 등)은 계속 실행되어야 함
        handleMultiplayerTick();

        gameLoopId = requestAnimationFrame(gameLoop);
        return;
    }

    if (gameState === STATE.PLAYING) {
        // 1. 부스트 보너스 계산 (하이리스크 하이리턴)
        let boostBonus = 0;
        if (chicken.boostProgress >= 100) boostBonus = 0.6;     // MAX 도달 시에만: +60% (RED)
        else if (chicken.boostProgress >= 70) boostBonus = 0.4; // 70% 이상: +40% (ORANGE)
        else if (chicken.boostProgress >= 40) boostBonus = 0.25;// 40% 이상: +25% (YELLOW)
        else if (chicken.boostProgress >= 10) boostBonus = 0.1; // 10% 이상: +10% (GREEN)

        // 2. 거리(점수) 계산: 게임 속도에 보너스 배율 적용
        score += (gameSpeed * 0.05) * (1 + boostBonus);

        // 3. 난이도 조절: 시간에 따라 게임 속도 증가 (프레임 기준)
        if (gameFrame >= nextLevelFrameThreshold) {
            baseGameSpeed += 0.8;
            nextLevelFrameThreshold += 600; // 다음 레벨까지 10초 추가
            level++;
            const levelEl = document.querySelector('.hud-level');
            if (levelEl) levelEl.innerText = 'LV.' + level;
        }

        // 4. HUD 점수판 업데이트
        const scoreEl = document.querySelector('.hud-score');
        if (scoreEl) {
            // 부스트 단계에 따른 색상 클래스 적용
            scoreEl.classList.remove('green', 'yellow', 'orange', 'red');
            if (chicken.boostProgress >= 100) scoreEl.classList.add('red');
            else if (chicken.boostProgress >= 70) scoreEl.classList.add('orange');
            else if (chicken.boostProgress >= 40) scoreEl.classList.add('yellow');
            else if (chicken.boostProgress >= 10) scoreEl.classList.add('green');

            let displayVal = Math.floor(score);
            // [수정] 합산 모드일 경우 누적 점수 포함하여 표시
            if (currentGameMode === 'multi' && currentRoom && currentRoom.rankType === 'total') {
                const myId = currentUser ? currentUser.id : 'me';
                const myPlayer = multiGamePlayers.find(p => p.id === myId);
                if (myPlayer) displayVal += Math.floor(myPlayer.totalScore);
            }

            // [수정] 구조화된 HUD 업데이트
            scoreEl.querySelector('.score-val').innerText = displayVal.toLocaleString();
        }

        // 부스트 및 기본 속도 조절
        if (chicken.isBoosting) {
            if (gameSpeed < baseGameSpeed + 5) gameSpeed += 0.2; // [수정] 부스트 가속도 및 최대 속도 감소 (+10 -> +5, 0.5 -> 0.2)
            speedMultiplier = 2;
        } else {
            if (gameSpeed > baseGameSpeed) gameSpeed -= 0.2; // 부스트 해제 시 기본 속도로 서서히 복귀
            else gameSpeed = baseGameSpeed; // 속도가 기본보다 낮아지지 않도록 보정
            speedMultiplier = 1;
        }
    } else if (gameState === STATE.CRASHED) {
        gameSpeed *= FRICTION;
        if (gameSpeed < 0.1) {
            gameSpeed = 0;
            if (chicken.y >= FLOOR_Y) {
                gameState = STATE.GAMEOVER;
                // [신규] 멀티플레이 점수 반영 로직 (게임 시도 종료 시점에 한 번만 실행)
                if (currentGameMode === 'multi' && currentRoom && currentUser) { // [수정] currentUser 체크
                    const myId = currentUser.id;
                    const myPlayer = multiGamePlayers.find(p => p.id === myId);
                    if (myPlayer) {
                        // 로컬 배열 업데이트 (onSnapshot이 덮어쓰기 전까지 즉각적인 UI 반응용)
                        if (currentRoom.rankType === 'total') {
                            // [FIX] score가 NaN이 되는 경우를 방지하기 위해 유효성 검사 추가
                            if (isNaN(score)) score = 0;

                            myPlayer.totalScore = (myPlayer.totalScore || 0) + score;
                        } else {
                            myPlayer.bestScore = Math.max((myPlayer.bestScore || 0), score);
                        }
                        myPlayer.score = 0; // 현재 판 점수 초기화 (다음 시도를 위해)

                    } // [수정] 점수 업데이트는 handleGameOverUI에서 displayScore와 함께 처리하므로 여기서는 로컬 점수만 계산합니다.
                    // [수정] 충돌 시 시도 횟수를 즉시 1회 차감합니다.
                    // [수정] 사용자별 시도 횟수 차감
                    if (currentUser && currentUser.joinedRooms[currentRoom.id]) {
                        currentUser.joinedRooms[currentRoom.id].usedAttempts++;
                        saveUserDataToFirestore(); // [FIX] 시도 횟수 변경 시 서버에 즉시 저장
                    }
                }

                handleGameOverUI();
            }
        }
    }

    // [3단계] 멀티플레이 실시간 로직 처리
    handleMultiplayerTick();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    skyBg.draw(0); floorBg.draw(GAME_HEIGHT - 124);
    dog.update(); dog.draw();
    handleObstacles(); chicken.update(); chicken.draw();
    feathers.forEach(f => { f.update(); f.draw(); });
    feathers = feathers.filter(f => f.opacity > 0); // 사라진 깃털 제거

    gameFrame++;

    gameLoopId = requestAnimationFrame(gameLoop);
}

// [5. UI 렌더링 및 장면 제어]

/**
 * [신규] Top 100 더미 랭킹 데이터를 생성합니다. (앱 실행 시 한 번만)
 */
function generateTop100Scores() {
    if (top100Scores.length > 0) return;

    const names = ["불멸의치킨", "치킨고수", "달리는영계", "질주본능", "치킨너겟", "계주선수", "바삭한날개", "황금알", "꼬꼬댁", "슈퍼닭"];
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
 * [신규] 내 최고 점수의 전체 순위를 계산합니다.
 * @param {number} myBestScore - 나의 최고 점수
 * @returns {number|null} - 계산된 순위 또는 null
 */
function getMyOverallRank(myBestScore) {
    if (myBestScore <= 0) return null;
    for (let i = 0; i < top100Scores.length; i++) {
        if (myBestScore > top100Scores[i].score) return i + 1;
    }
    return top100Scores.length + 1;
}

/**
 * [신규] '내 기록'을 localStorage에 저장하고 목록을 다시 그립니다.
 * @param {number} newScore - 새로 추가할 점수
 */
function saveMyScore(newScore) {
    if (newScore <= 0) return; // 0점은 저장하지 않습니다.

    const scoreEntry = {
        score: newScore,
        date: new Date().toISOString() // 기록 시간을 ISO 표준 문자열로 저장
    };
    myScores.push(scoreEntry);
    myScores.sort((a, b) => b.score - a.score); // 점수 높은 순으로 정렬

    if (myScores.length > 100) { // [수정] 최대 100개 기록 저장
        myScores.length = 100;
    }

    localStorage.setItem('chickenRunMyScores', JSON.stringify(myScores));
    bestScore = myScores[0].score; // 최고 점수 업데이트
    renderMyRecordList(); // 목록 UI 갱신
}

/**
 * [신규] '내 기록' 탭의 목록을 그립니다.
 * @param {boolean} append - true일 경우 기존 목록에 추가로 덧붙입니다.
 */
function renderMyRecordList(append = false) {
    const listEl = document.querySelector('#content-my-record .score-list');
    if (!listEl) return;

    if (!append) {
        listEl.innerHTML = '';
        displayedMyRecordsCount = 20; // 초기화
    }

    if (myScores.length === 0) {
        listEl.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>아직 기록이 없습니다. 첫 도전을 해보세요!</p></div></li>';
        return;
    }

    const myRank = getMyOverallRank(bestScore);

    // 현재 표시된 개수 이후부터 다음 20개를 가져옴
    const currentItemsCount = listEl.querySelectorAll('li:not(.top)').length + (listEl.querySelector('li.top') ? 1 : 0);
    const startIndex = append ? currentItemsCount : 0;

    // [보정] 표시할 개수가 전체 데이터 길이를 넘지 않도록 설정
    const itemsToShow = myScores.slice(startIndex, Math.min(displayedMyRecordsCount, myScores.length));

    itemsToShow.forEach((record, idx) => {
        const globalIndex = startIndex + idx;
        const li = document.createElement('li');
        const d = new Date(record.date);
        const dateString = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일<br />${d.getHours()}시 ${d.getMinutes()}분`;

        if (globalIndex === 0 && bestScore > 0) {
            li.className = 'top';
            const rankText = myRank ? `${myRank}위` : '순위 없음';
            li.innerHTML = `<div class="info"><label><img class="top" src="assets/images/icon_top.png"/><small>${rankText}</small></label><p class="score-display">${record.score.toLocaleString()}<small>M</small></p></div><div class="more"><span>${dateString}</span></div>`;
        } else {
            li.innerHTML = `<div class="info"><p class="score-display">${record.score.toLocaleString()}<small>M</small></p></div><div class="more"><span>${dateString}</span></div>`;
        }
        listEl.appendChild(li);
    });
}

/**
 * [신규] 'Top 100' 탭의 더미 데이터 목록을 그립니다.
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
 * [신규] 서버 랭킹 데이터를 화면에 표시
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
    // 1. 'rankings' 상자에서 점수(score)가 높은 순(desc)으로 10개만 가져와라!
    db.collection("rankings")
        .orderBy("score", "desc")
        .limit(10)
        .get()
        .then((querySnapshot) => {
            console.log("🏆 랭킹 데이터를 가져왔습니다:");

            let rankData = [];
            querySnapshot.forEach((doc) => {
                rankData.push(doc.data()); // nickname, score 등이 담겨 있음
            });

            // 2. 이 데이터를 화면에 그리는 함수에 전달하세요!
            displayRankings(rankData);
        })
        .catch((error) => {
            console.error("❌ 랭킹 불러오기 실패:", error);
        });
}

/**
 * [신규] Firestore 문서 데이터를 로컬 방 객체 형식으로 변환하는 헬퍼 함수입니다.
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
        createdAt: roomData.createdAt // [신규] 정렬 및 스냅샷 유지를 위해 생성 시간 필드 추가
    };
}

/**
 * [FIX] 방 목록 로딩 방식을 페이지네이션으로 전면 교체합니다.
 * 1만개 이상의 방이 생성될 경우, 모든 방을 한 번에 불러오는 기존 방식은 성능 저하 및 비용 문제를 야기합니다.
 * 이 함수는 Firestore에서 페이지 단위로 방 목록을 효율적으로 불러옵니다.
 * @description 실시간 업데이트(`onSnapshot`) 대신 '더보기'와 '새로고침'을 통한 수동 업데이트 방식으로 변경됩니다.
 * [FIX] 방 목록 로딩 방식을 실시간 리스너 + Limit 증가 방식으로 변경합니다.
 * - 실시간 업데이트(친구 입장 등)를 반영하기 위해 onSnapshot을 사용합니다.
 * - 성능 이슈(1만개 방)를 해결하기 위해 limit()를 사용하여 필요한 만큼만 구독합니다.
 * - '더보기' 클릭 시 limit를 증가시켜 재구독합니다.
 * @param {boolean} loadMore - true이면 '더보기'로 다음 페이지를, false이면 목록을 새로고침합니다.
 */
let roomFetchPromise = null; // [신규] 중복 호출 방지 및 대기 처리를 위한 Promise 변수
function fetchRaceRooms(loadMore = false) {
    // [FIX] 중복 호출 방지: 이미 로딩 중이고 단순 조회라면 기존 Promise 반환
    // 단, loadMore인 경우는 limit을 늘려 새로 호출해야 하므로 제외
    if (roomFetchPromise && !loadMore) return roomFetchPromise;

    roomFetchPromise = new Promise((resolve, reject) => {
        if (loadMore) {
            currentRoomLimit += ROOMS_PER_PAGE;
        } else {
            currentRoomLimit = ROOMS_PER_PAGE;
        }

        const loader = document.getElementById('race-room-loader');
        if (loader) loader.classList.remove('hidden');

        // 기존 리스너 해제 (limit이 변경되면 재구독해야 함)
        if (unsubscribeRoomListener) {
            unsubscribeRoomListener();
            unsubscribeRoomListener = null;
        }

        let isFirstCallback = true;

        // [핵심] get() 대신 onSnapshot()을 사용하여 실시간 데이터 동기화
        unsubscribeRoomListener = db.collection('rooms')
            // [수정] 복합 인덱스 문제 회피를 위해 where 절 제거. 대신 limit을 넉넉히 가져와서 클라이언트에서 필터링
            .orderBy('createdAt', 'desc')
            .limit(currentRoomLimit + 5) // 필터링될 것을 대비해 여유있게 가져옴
            .onSnapshot((querySnapshot) => {
                // [FIX] 실시간 업데이트 시 목록이 흔들리는 문제(flickering) 및 항목 수가 변하는 문제 해결
                // 원인: onSnapshot이 호출될 때마다 raceRooms 배열 전체를 교체하여 목록이 재정렬되거나 길이가 변경됨.
                // 해결: 첫 로드 시에만 전체 목록을 가져오고, 이후에는 docChanges()를 사용하여 변경된 항목만 '병합'합니다.
                //       'removed'된 항목은 배열에서 제거하지 않아, 사용자가 클릭 시 "존재하지 않는 방" 알림을 띄울 수 있도록 합니다.
                if (isFirstCallback) {
                    // 1. 첫 로드: 전체 목록을 가져와 raceRooms를 채우고, 화면에 렌더링합니다.
                    const newRooms = [];
                    querySnapshot.forEach(doc => {
                        newRooms.push(mapFirestoreDocToRoom(doc));
                    });
                    raceRooms = newRooms;

                    // 더 이상 불러올 방이 없는지 확인
                    if (querySnapshot.docs.length <= currentRoomLimit) {
                        allRoomsLoaded = true;
                        if (loader) loader.classList.add('hidden');
                    } else {
                        allRoomsLoaded = false;
                        if (loader) loader.classList.remove('hidden');
                    }

                    renderRoomLists(true);
                    isFirstCallback = false;
                    resolve(); // 데이터 로딩 완료 시 Promise 해결
                } else {
                    // 2. 실시간 업데이트: 변경된 내용만 raceRooms 배열에 반영합니다.
                    querySnapshot.docChanges().forEach((change) => {
                        const roomData = mapFirestoreDocToRoom(change.doc);
                        const index = raceRooms.findIndex(r => r.id === roomData.id);

                        if (change.type === 'modified') {
                            // '수정': 기존 방 정보를 업데이트합니다.
                            if (index > -1) Object.assign(raceRooms[index], roomData);
                        } else if (change.type === 'removed') {
                            // '삭제': 목록에서 제거하지 않고, 인원수를 0으로 만들어 '유령 방'으로 남겨둡니다.
                            // 이렇게 하면 목록 길이가 유지되고, 클릭 시 "존재하지 않는 방" 처리가 가능해집니다.
                            if (index > -1) raceRooms[index].current = 0;
                        }
                        // '추가(added)'는 무시합니다. 새 방은 '새로고침'이나 '더보기' 시에만 목록에 나타나야 합니다.
                    });
                    // 변경 사항이 반영된 목록을 다시 그리지만, 스냅샷은 유지하여 목록 순서나 길이가 변하지 않게 합니다.
                    renderRoomLists(false);
                }
            }, (error) => {
                console.error("❌ 방 목록 리스너 오류:", error);
                if (loader) loader.classList.add('hidden');
                reject(error);
            });
    });

    return roomFetchPromise;
}

/**
 * [신규] 참가중인 방 목록을 별도로 불러옵니다.
 * raceRooms(전체 목록)에 없는 오래된 방이라도 내가 참가 중이면 보여야 하기 때문입니다.
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

    // [수정] currentMyRoomLimit 만큼 ID를 가져옵니다.
    const targetIds = roomIds.slice(0, currentMyRoomLimit);

    // [수정] Firestore 'in' 쿼리는 최대 10개 제한이 있으므로, 10개씩 끊어서 요청합니다.
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
        console.error("❌ 내 방 목록 로드 실패:", e);
    }
}

/**
 * [신규] 사용자 정보 모달을 열고 데이터를 채웁니다.
 */
function showUserProfile() {
    // [수정] 로그인 상태는 전역 변수 currentUser로 확인합니다.
    if (!currentUser) {
        // 로그인되지 않은 상태에서 프로필을 열려고 할 경우, 로그인 창을 띄웁니다.
        document.getElementById('scene-auth').classList.remove('hidden');
        return;
    }

    const scene = document.getElementById('scene-user-profile');
    if (!scene) return;

    // [리팩토링] 이제 loadUserData의 '자가 치유' 로직 덕분에 currentUser 객체는 항상 신뢰할 수 있는 최신 정보를 가집니다.
    // 따라서 프로필을 열 때마다 Firestore에서 데이터를 다시 가져오는 복잡한 비동기 로직이 더 이상 필요하지 않습니다.
    // 코드를 단순화하여 currentUser의 데이터를 직접 사용합니다.

    document.getElementById('profile-id').value = currentUser.email || currentUser.id;
    document.getElementById('profile-nickname').value = currentUser.nickname || '';
    document.getElementById('badge-count-1').innerText = (currentUser.badges && currentUser.badges['1']) || 0;
    document.getElementById('badge-count-2').innerText = (currentUser.badges && currentUser.badges['2']) || 0;
    document.getElementById('badge-count-3').innerText = (currentUser.badges && currentUser.badges['3']) || 0;

    // 프로필을 열 때 코인 정보도 최신화합니다.
    updateCoinUI();

    scene.classList.remove('hidden');
}

/**
 * [신규] 게임을 일시정지하거나 이어합니다.
 */
function togglePause() {
    // 게임오버 또는 충돌 상태에서는 일시정지/재개 불가
    if (gameState === STATE.GAMEOVER || gameState === STATE.CRASHED) return;

    const scenePauseMenu = document.getElementById('game-pause-screen');
    const btnPauseToggle = document.getElementById('btn-pause-toggle');

    if (gameState === STATE.PAUSED) {
        // --- 게임 이어하기 ---
        clearAutoActionTimer(); // [신규] 타이머 해제
        if (currentGameMode === 'multi') {
            const myId = currentUser ? currentUser.id : 'me';
            const myPlayer = multiGamePlayers.find(p => p.id === myId);
            if (myPlayer) myPlayer.status = 'playing';
        }
        gameState = STATE.PLAYING;
        scenePauseMenu.classList.add('hidden');
        btnPauseToggle.classList.remove('paused');
        gameLoopId = requestAnimationFrame(gameLoop); // 게임 루프 재시작
    } else {
        // --- 게임 일시정지 ---
        pauseBGM(); // [신규] 일시정지 시 BGM 일시정지
        if (currentGameMode === 'multi') {
            const myId = currentUser ? currentUser.id : 'me';
            const myPlayer = multiGamePlayers.find(p => p.id === myId);
            if (myPlayer) myPlayer.status = 'paused';
        }
        gameState = STATE.PAUSED;
        cancelAnimationFrame(gameLoopId); // 게임 루프 정지
        scenePauseMenu.classList.remove('hidden');
        btnPauseToggle.classList.add('paused');

        // [신규] 멀티플레이 일시정지 타이머 (30초)
        if (currentGameMode === 'multi') {
            startAutoActionTimer(30, 'start', '#game-pause-screen .time-message');
        }
    }
}

/**
 * [신규] 서버에서 사용자를 방에서 퇴장시키는 백엔드 로직.
 * 데이터 정합성을 보장하기 위해 모든 퇴장 시나리오(정상, 비정상)에서 호출됩니다.
 * @param {string} roomId - 퇴장할 방의 ID
 * @param {boolean} isFullExit - true일 경우 참가자 목록에서 완전히 제거(환불/인원감소), false일 경우 게임 포기로 간주하고 'dead' 처리.
 */
async function performServerExit(roomId, isFullExit) {
    if (!currentUser || !roomId) return;

    const myId = currentUser.id;
    const roomRef = db.collection('rooms').doc(roomId);

    try {
        if (isFullExit) {
            console.log(`🚀 Server Exit: Performing FULL exit from room [${roomId}].`);

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
            console.log(`🚀 Server Exit: Performing SOFT exit (forfeit) from room [${roomId}].`);

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

            // 포기 시에도 뱃지 획득 여부 확인
            awardBadgeIfEligible();
        }
    } catch (error) {
        console.error(`❌ Server exit from room [${roomId}] failed:`, error);
    }
}

/**
 * [신규] 게임을 종료하고 로비(인트로) 화면으로 돌아갑니다.
 */
async function exitToLobby(isFullExit = false) { // [FIX] "완전 퇴장" 여부를 인자로 받음
    // [수정] 비정상 종료 복구를 위해 세션 스토리지의 활성 방 ID를 제거합니다.
    sessionStorage.removeItem('activeRoomId');

    if (unsubscribeParticipantsListener) {
        unsubscribeParticipantsListener();
        unsubscribeParticipantsListener = null;
        console.log("🎧 Participants listener detached.");
    }

    stopBGM();
    if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }

    // [리팩토링] 서버의 데이터 정합성을 맞추는 로직을 performServerExit 함수로 분리/통합했습니다.
    if (currentGameMode === 'multi' && currentRoom && currentUser) {
        await performServerExit(currentRoom.id, isFullExit);
    }

    // --- 공통 UI 정리 및 화면 전환 ---
    multiGamePlayers = [];
    clearAutoActionTimer();
    currentRoom = null; // 현재 방 컨텍스트 초기화

    updateCoinUI();

    // [FIX] 방 퇴장 후 목록이 갱신되지 않는 문제 해결:
    // fetchRaceRooms가 캐시된 Promise를 반환하지 않고 강제로 새로고침하도록 Promise를 초기화합니다.
    roomFetchPromise = null;
    
    // [FIX] 데이터 로딩 실패가 화면 전환을 막지 않도록 예외 처리 추가
    try {
        await fetchRaceRooms(false);
        fetchMyRooms();
    } catch (e) {
        console.warn("⚠️ 방 목록 갱신 실패 (무시하고 로비로 이동):", e);
    }

    document.getElementById('scene-intro').classList.remove('hidden');
    document.getElementById('scene-game').classList.add('hidden');
    document.getElementById('btn-pause-toggle').classList.remove('paused');
}

/**
 * [신규] 멀티플레이 방 참가를 시도하는 통합 함수.
 * 코인, 인원 제한, 로그인 상태를 체크하고 참가 로직을 수행합니다.
 * @param {object} room - 참가하려는 방 객체
 */
async function attemptToJoinRoom(room) {
    if (!isLoggedIn) {
        const sceneAuth = document.getElementById('scene-auth');
        if (sceneAuth) {
            sceneAuth.classList.remove('hidden');
            const authMsg = sceneAuth.querySelector('.auth-message');
            if (authMsg) {
                authMsg.style.display = 'block';
                authMsg.innerText = '멀티플레이는 로그인 후 이용 가능합니다.';
            }
        }
        return;
    }

    const hasJoined = currentUser && currentUser.joinedRooms && currentUser.joinedRooms[room.id];

    // [FIX] 봇 추가/삭제(+/-) 버튼을 누른 직후 입장/재입장 시, 클라이언트의 방 정보(인원 수)가
    // 서버와 일치하지 않는 상태(Stale)에서 진입하여 플레이어 수가 맞지 않는 문제를 해결합니다.
    // 원인: onSnapshot의 비동기적 업데이트 지연으로 인해, stale 데이터로 게임 씬에 진입함.
    // 해결: 입장/재입장 시 항상 서버로부터 최신 방 정보를 가져와 로컬 데이터를 갱신한 후 진입합니다.

    if (hasJoined) {
        // --- 재입장 ---
        // 서버에서 최신 인원 수를 가져와 로컬 room 객체를 갱신합니다.
        const roomRef = db.collection('rooms').doc(room.id);
        try {
            const roomDoc = await roomRef.get();
            if (roomDoc.exists) {
                const serverData = roomDoc.data();
                room.current = serverData.currentPlayers;
                room.status = serverData.status;
            }
        } catch (error) {
            console.error("❌ 재입장 시 방 정보 갱신 실패:", error);
        }
        enterGameScene('multi', room);
        return;
    }

    // --- 신규 입장 ---
    const cost = room.attempts;
    if (currentUser.coins < cost) {
        alert(`코인이 부족합니다. (필요: ${cost}, 보유: ${currentUser.coins})`);
        return;
    }

    const roomRef = db.collection('rooms').doc(room.id);
    try {
        // [FIX] 방 참가 로직을 단일 트랜잭션으로 통합하여 원자성을 보장합니다.
        // 인원 수 증가와 참가자 목록 추가가 동시에 성공하거나 실패하도록 하여 데이터 불일치를 원천 차단합니다.
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) { throw "레이스룸이 존재하지 않습니다."; }

            const serverRoomData = roomDoc.data();
            if (serverRoomData.currentPlayers >= serverRoomData.maxPlayers) { throw "방이 가득 찼습니다."; }

            // 1. 인원 수를 1 증가시키고, 필요 시 상태를 'inprogress'로 변경합니다.
            const updates = { currentPlayers: firebase.firestore.FieldValue.increment(1) };
            if (serverRoomData.status === 'finished') {
                updates.status = 'inprogress';
            }
            transaction.update(roomRef, updates);

            // 2. 참가자(participants) 하위 컬렉션에 내 정보를 추가합니다.
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

        console.log(`✅ 방 [${room.id}] 입장 트랜잭션 성공. (인원수 증가 및 참가자 등록 완료)`);

        // 트랜잭션이 성공했으므로 로컬 데이터도 1 증가시킵니다.
        room.current++;

        // 다른 '미시작' 방에서 자동으로 나가고 코인 환불
        if (currentUser.joinedRooms) {
            const unstartedJoinedRoomIds = Object.keys(currentUser.joinedRooms).filter(id => {
                const roomState = currentUser.joinedRooms[id];
                // [수정] Firestore ID는 문자열이므로 parseInt 제거
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
        console.error("❌ 방 입장 실패:", error);
        alert(error); // "방이 가득 찼습니다." 또는 "존재하지 않는 방입니다." 등의 메시지 표시
        renderRoomLists(true); // 목록을 최신 상태로 갱신하여 사용자에게 정확한 정보를 보여줍니다.
    }
}

/**
 * [신규] 멀티플레이 랭킹 목록을 렌더링합니다.
 */
function renderMultiRanking() {
    const listEl = document.getElementById('multi-score-list');
    if (!listEl || !currentRoom) return;

    // 1. 정렬 기준에 따라 점수 계산 및 정렬
    const isTotalMode = currentRoom.rankType === 'total';
    const myId = currentUser ? currentUser.id : 'me';

    const sortedPlayers = [...multiGamePlayers].sort((a, b) => {
        // [FIX] 내 점수는 로컬 점수를 기준으로 정렬에 참여시켜 순위가 즉시 반영되도록 합니다.
        const scoreA = a.id === myId ? calculateMyLocalDisplayScore() : (a.displayScore || 0);
        const scoreB = b.id === myId ? calculateMyLocalDisplayScore() : (b.displayScore || 0);
        return scoreB - scoreA;
    });

    // [신규] 모든 플레이어가 종료되었는지 확인 (방 전체 완료 여부)
    const isAllFinished = multiGamePlayers.every(p => p.status === 'dead');

    // 2. HTML 생성
    listEl.innerHTML = '';
    sortedPlayers.forEach((p, index) => {
        const rank = index + 1;
        const li = document.createElement('li');

        // [신규] 방장 여부 확인
        const isHost = currentRoom.creatorUid && p.id === currentRoom.creatorUid;
        const hostIndicatorText = isHost ? `(방장)` : '';
        const hostIconHtml = isHost ? `<img class="master-key-icon" src="assets/images/icon_masterkey.png">` : '';

        // 상태에 따른 캐릭터 스타일 및 이미지
        let charClass = 'character';
        let charImg = 'assets/images/chicken_back.png'; // 기본(대기)

        if (p.status === 'playing') {
            charClass += ' active';
            charImg = 'assets/images/chickenRun.gif';
        } else if (p.status === 'dead') {
            charClass += ' dead';
            // [수정] 전체 완료 상태일 때만 정면 이미지(chicken_front)로 변경, 진행 중일 땐 죽은 이미지 유지
            charImg = isAllFinished ? 'assets/images/chicken_front.png' : 'assets/images/chicken_dead.png';
        }

        // [신규] 본인 캐릭터 강조 (.me 클래스 추가)
        if (p.id === myId) {
            charClass += ' me';
        }

        // [수정] 점수가 0이면서 대기중인 경우에만 '대기중' 표시 (그 외에는 순위 표시)
        // [3단계] displayScore가 0이고 waiting 상태일 때 '대기중' 표시
        let statHtml = '';
        if (p.status === 'waiting' && p.displayScore === 0) {
            statHtml = `<span class="more">대기중</span>`;
        } else {
            let rankDisplay = '';
            if (rank === 1) rankDisplay = `<img class="icon" src="assets/images/icon_flag1th.png"/>`;
            else if (rank === 2) rankDisplay = `<img class="icon" src="assets/images/icon_flag2th.png"/>`;
            else if (rank === 3) rankDisplay = `<img class="icon" src="assets/images/icon_flag3th.png"/>`;
            else rankDisplay = `${rank}<small>th</small>`;
            statHtml = `<span class="stat">${rankDisplay}</span>`;
        }

        // [요청수정] 봇 전용 컨트롤 버튼 HTML 생성
        let botControlButtonsHTML = '';
        if (currentUser && currentUser.isAdmin && p.isBot) { // [수정] 관리자만 봇 컨트롤 가능 (!p.exited 조건 제거)
            botControlButtonsHTML = `
                <div>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-start">게임실행</button>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-end">게임종료</button>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-delete">목록삭제</button>
                </div>
            `;
        }

        // [FIX] 내 점수는 로컬 변수에서 직접 계산하여 시차 없이 표시하고, 다른 플레이어는 서버 점수(displayScore)를 사용합니다.
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
 * [신규] 현재 플레이어의 로컬 점수를 실시간으로 계산하여 반환합니다.
 * 게임 HUD 점수와 랭킹 목록의 내 점수를 동기화하는 데 사용됩니다.
 * @returns {number} 계산된 현재 플레이어의 최종 점수
 */
function calculateMyLocalDisplayScore() {
    if (!currentUser || !currentRoom) return 0;

    const myId = currentUser.id;
    const myPlayer = multiGamePlayers.find(p => p.id === myId);
    if (!myPlayer) return 0;

    // 현재 게임이 진행 중(PLAYING, CRASHED)일 때의 실시간 점수
    const currentRunScore = (gameState === STATE.PLAYING || gameState === STATE.CRASHED) ? score : 0;

    let displayScore = 0;
    if (currentRoom.rankType === 'total') {
        // 합산 모드: 누적 점수 + 현재 판의 점수
        displayScore = (myPlayer.totalScore || 0) + currentRunScore;
    } else {
        // 최고점 모드: 기존 최고점과 현재 판의 점수 중 더 큰 값
        displayScore = Math.max((myPlayer.bestScore || 0), currentRunScore);
    }
    return displayScore;
}

let raceRoomSnapshot = [];
let myRoomSnapshot = [];

function renderRoomLists(refreshSnapshot = false) {
    const raceRoomList = document.querySelector('#content-race-room .score-list');
    const myRoomList = document.querySelector('#content-my-rooms .score-list');
    if (!raceRoomList || !myRoomList) return;

    // [신규] 스냅샷 갱신 로직: 목록이 흔들리지 않도록 특정 시점에만 목록 구성을 확정합니다.
    if (refreshSnapshot) {
        // [FIX] 레이스룸 스냅샷 필터링 규칙 변경
        // 1. 인원이 꽉 찬 방은 목록에서 제외 (`r.current < r.limit` 조건 추가)
        // [수정] 꽉 찬 방도 목록에 노출하되 입장을 막는 방식으로 변경하여, 불러온 10개가 모두 보이도록 함 (`r.current < r.limit` 제거)
        // [수정] 서버 쿼리에서 where를 뺐으므로 여기서 status 필터링 수행
        // [FIX] 필터링 후 설정된 개수(currentRoomLimit)만큼만 잘라서 보여줍니다.
        // [요청반영] 모집 마감된(꽉 찬) 방은 목록에서 제외합니다.
        // [수정] 'finished' 상태의 방도 정원이 차지 않았다면 목록에 표시하여 재입장/부활이 가능하도록 r.status !== 'finished' 조건 제거
        raceRoomSnapshot = raceRooms.filter(r => r.current > 0 && r.current < r.limit)
            .slice(0, currentRoomLimit)
            .map(r => r.id);

        // 2. 내 방 스냅샷: fetchMyRooms로 가져온 데이터 사용
        myRoomSnapshot = myRooms.map(r => r.id);
    }

    raceRoomList.innerHTML = '';
    myRoomList.innerHTML = '';

    // [FIX] 사용자가 참가한 모든 방의 ID 목록을 미리 만듭니다. (레이스룸 목록에서 중복 제외용)
    const allMyJoinedRoomIds = (isLoggedIn && currentUser && currentUser.joinedRooms) ? Object.keys(currentUser.joinedRooms) : [];

    raceRooms.forEach(room => {
        // [수정] isFinished 상태를 사용자별 데이터(joinedRooms) 기준으로 판단
        const userRoomState = (isLoggedIn && currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[room.id] : null;
        const userUsedAttempts = userRoomState ? userRoomState.usedAttempts : 0;

        const rankTypeText = room.rankType === 'total' ? '합산점' : '최고점';
        const lockImg = room.isLocked ? `<img class="lock" src="assets/images/icon_lock.png">` : '';

        // [신규] 디버깅용 봇 추가/삭제 버튼 HTML
        const debugButtonsHTML = (currentUser && currentUser.isAdmin)
            ? `<button class="debug-btn" data-room-id="${room.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${room.id}" data-action="remove">-</button>`
            : '';

        // 1. 레이스룸 목록 (공개):
        // [FIX] 스냅샷에 포함되고, 사용자가 한 번도 참가한 적 없는 방만 렌더링합니다.
        // 이렇게 하면 '참가중인 목록'에서 숨긴 방이 여기에 다시 나타나지 않습니다.
        if (raceRoomSnapshot.includes(room.id) && !allMyJoinedRoomIds.includes(room.id)) {
            const raceLi = document.createElement('li');

            // [FIX] 'already-joined' 스타일이 방 생성 직후에도 적용되는 문제 수정
            // 방에 참가만 한 상태가 아니라, 실제로 게임을 시작(코인 지불)했거나 시도 횟수를 사용한 경우에만 적용합니다.
            if (userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0)) {
                raceLi.classList.add('already-joined');
            }

            // [FIX] 인원이 가득 찬 방의 상태와 입장 가능 여부를 명확히 처리합니다.
            const isFull = room.current >= room.limit;
            const statusClass = isFull ? 'finished' : 'inprogress';
            const aggIcon = room.limit >= 4 ? '<img class="agg" src="assets/images/icon_agg.png">' : '';
            const statusText = isFull ? `${aggIcon}마감: ${room.current}/${room.limit}명` : `${aggIcon}모집: ${room.current}/${room.limit}명`;

            // 내가 참가하지 않았고, 인원이 가득 찬 방은 입장 불가 처리
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
                // 입장 불가 방 클릭 시 알림
                if (!isJoinable) {
                    alert('인원이 모두 충원되었습니다.');
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

    // [수정] 참가중인 방 목록 렌더링 (myRooms 배열 사용)
    myRooms.forEach(room => {
        const userRoomState = (isLoggedIn && currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[room.id] : null;
        // [FIX] 사용자가 '목록에서 삭제'하여 숨김 처리한 방은 렌더링하지 않습니다.
        if (userRoomState && !userRoomState.hidden) {
            const rankTypeText = room.rankType === 'total' ? '합산점' : '최고점';
            // [신규] 디버깅용 봇 추가/삭제 버튼 HTML
            const debugButtonsHTML = (currentUser && currentUser.isAdmin)
                ? `<button class="debug-btn" data-room-id="${room.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${room.id}" data-action="remove">-</button>`
                : '';

            // [FIX] userUsedAttempts 변수가 정의되지 않아 렌더링이 중단되는 오류 수정
            const userUsedAttempts = userRoomState.usedAttempts;
            const isMyPlayFinished = userUsedAttempts >= room.attempts;
            const isRoomGloballyFinished = room.status === "finished";

            let myRoomStatusText;
            let myRoomStatusClass;

            if (isRoomGloballyFinished) {
                myRoomStatusText = "종료";
                myRoomStatusClass = "finished";
            } else {
                myRoomStatusText = `진행중 (${room.current}/${room.limit}명)`;
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
            myLi.onclick = () => { // [수정] 비로그인 상태에서 클릭 시 로그인 유도 (레이스룸 목록과 로직 통일)
                if (!isLoggedIn) {
                    const sceneAuth = document.getElementById('scene-auth');
                    if (sceneAuth) {
                        sceneAuth.classList.remove('hidden');
                        const authMsg = sceneAuth.querySelector('.auth-message');
                        if (authMsg) {
                            authMsg.style.display = 'block';
                            authMsg.innerText = '멀티플레이는 로그인 후 이용 가능합니다.';
                        }
                    }
                    return;
                }
                enterGameScene('multi', room);
            };
            myRoomList.appendChild(myLi);
        }
    });

    // [수정] 목록이 비어있을 때 안내 문구 표시 로직 개선
    if (raceRoomList.children.length === 0) {
        raceRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>참여 가능한 레이스룸이 없습니다.</p></div></li>';
    }
    // '참가중인 방' 목록 상태 메시지 처리
    if (!isLoggedIn) {
        myRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>로그인 후 이용 가능합니다.</p></div></li>';
    } else if (myRoomList.children.length === 0) {
        myRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>참가중인 레이스룸이 없습니다.</p></div></li>';
    }

    // [신규] 탭 상태에 따라 '더보기' 버튼(로더) 표시 여부 제어
    const loader = document.getElementById('race-room-loader');
    const myLoader = document.getElementById('my-room-loader');
    const tabRaceRoom = document.getElementById('tab-race-room');
    const isRaceTabActive = tabRaceRoom && tabRaceRoom.classList.contains('active');

    if (isRaceTabActive) {
        if (loader) {
            // 레이스룸 탭: fetchRaceRooms에서 설정한 allRoomsLoaded 상태 따름
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

async function enterGameScene(mode, roomData = null) { // [수정] 비동기 함수로 변경
    if (!isGameReady) { alert("리소스 로딩 중!"); return; }

    // [신규] 멀티플레이 회원 전용 체크 강화
    if (mode === 'multi' && !isLoggedIn) {
        const sceneAuth = document.getElementById('scene-auth');
        if (sceneAuth) {
            sceneAuth.classList.remove('hidden');
            const authMsg = sceneAuth.querySelector('.auth-message');
            if (authMsg) {
                authMsg.style.display = 'block';
                authMsg.innerText = '멀티플레이는 로그인 후 이용 가능합니다.';
            }
        }
        return;
    }

    currentGameMode = mode;
    currentRoom = roomData;

    // [신규] 비정상 종료 복구를 위해 현재 게임 상태를 세션 스토리지에 기록합니다.
    if (mode === 'multi' && roomData) {
        sessionStorage.setItem('activeRoomId', roomData.id);
    } else if (mode === 'single') {
        // 싱글 모드도 일관성을 위해 기록합니다.
        sessionStorage.setItem('activeRoomId', 'single_player_mode');
    }

    // [신규] 진입 시 버튼 비용 UI 업데이트 (싱글 1코인, 멀티 설정된 회차만큼)
    updateButtonCosts();

    document.getElementById('scene-intro').classList.add('hidden');
    document.getElementById('scene-game').classList.remove('hidden');

    if (mode === 'single') {
        currentRoom = { attempts: 1, usedAttempts: 0, title: "싱글 테스트", status: "inprogress" };
        document.getElementById('view-single-mode').classList.remove('hidden');
        document.getElementById('view-multi-rank').classList.add('hidden');
    } else {
        document.getElementById('view-single-mode').classList.add('hidden');
        document.getElementById('view-multi-rank').classList.remove('hidden');

        // [수정] 랭킹 방식(합산/최고점) 텍스트 동적 업데이트
        const rankSpan = document.querySelector('#view-multi-rank .list-title span');
        if (rankSpan) {
            rankSpan.innerText = currentRoom.rankType === 'total' ? '(점수합산)' : '(최고점수)';
        }

        // [신규] 게임 내 랭킹 목록에 디버깅용 봇 추가/삭제 버튼 추가
        const listTitle = document.querySelector('#view-multi-rank .list-title');
        if (listTitle) {
            // 기존 버튼 그룹이 있다면 제거
            const oldButtons = listTitle.querySelector('.debug-btn-group');
            if (oldButtons) oldButtons.remove();

            if (currentUser && currentUser.isAdmin) { // [수정] 관리자만 버튼 표시
                const buttonGroup = document.createElement('div');
                buttonGroup.className = 'debug-btn-group';
                buttonGroup.style.marginLeft = 'auto'; // 버튼을 오른쪽으로 밀기
                buttonGroup.innerHTML = `<button class="debug-btn" data-room-id="${currentRoom.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${currentRoom.id}" data-action="remove">-</button>`;
                listTitle.appendChild(buttonGroup);
            }
        }
    }

    // --- 멀티플레이어 모드 로직 ---
    if (mode === 'multi') {
        // [신규] 멀티플레이 모드에서는 진입 즉시 게임 루프를 실행하여 봇 상태를 동기화합니다.
        // 게임 시작 전(IDLE)이라도 봇 시뮬레이션은 돌아야 하기 때문입니다.
        if (!gameLoopId) {
            gameLoop();
        }

        // [FIX] 참가자 등록 로직을 enterGameScene에서 제거하고, 방 생성/참가 함수로 이전합니다.
        // enterGameScene은 이제 서버에 있는 참가자 목록을 그대로 읽어와 화면을 그리는 역할만 담당합니다.
        const myPlayerId = currentUser.id;
        const roomRef = db.collection('rooms').doc(currentRoom.id);
        const participantsRef = roomRef.collection('participants');

        try {
            // 초기 참가자 목록을 한 번 불러옵니다.
            const initialParticipantsSnapshot = await participantsRef.get();
            multiGamePlayers = initialParticipantsSnapshot.docs.map(doc => doc.data());

            // 참가자 목록에 대한 실시간 리스너를 부착합니다.
            if (unsubscribeParticipantsListener) unsubscribeParticipantsListener(); // 기존 리스너 해제
            unsubscribeParticipantsListener = participantsRef.onSnapshot((snapshot) => {
                multiGamePlayers = snapshot.docs.map(doc => doc.data());
                renderMultiRanking();
            }, (error) => {
                console.error("❌ Participants listener error:", error);
            });

        } catch (error) {
            console.error("❌ 참가자 목록 로딩 또는 리스너 설정 실패:", error);
            alert("방에 참가하는 중 오류가 발생했습니다. 로비로 돌아갑니다.");
            exitToLobby(false); // 에러 시 소프트 퇴장
            return;
        }

        const userRoomState = currentUser.joinedRooms[currentRoom.id];
        const userUsedAttempts = userRoomState ? userRoomState.usedAttempts : 0;
        const myPlayerInRoom = multiGamePlayers.find(p => p.id === myPlayerId); // 이제 myPlayerId는 항상 currentUser.id 입니다.

        // [FIX] 게임 완료(모든 기회 소진) 또는 방 종료 시 재입장하면 '시작' 화면이 뜨는 버그 수정
        // 원인: 1. 방이 종료('finished')되었거나 내 모든 기회를 소진했음에도, 조건문 로직의 문제로 시작 화면이 표시될 수 있었습니다.
        //       2. 시도 횟수(usedAttempts)가 서버에 즉시 저장되지 않아, 재입장 시 동기화가 깨지는 문제가 있었습니다.
        const isMyGameOver = userUsedAttempts >= currentRoom.attempts;
        const isRoomFinished = currentRoom.status === 'finished';

        if (myPlayerInRoom && (isMyGameOver || isRoomFinished)) {
            // 1. 방이 종료되었거나 내 게임이 끝난 상태이므로, 모든 플레이어 상태를 'dead'로 강제 동기화합니다.
            // [2단계] 서버 데이터가 진실 공급원이므로, 클라이언트에서 임의로 상태를 변경할 필요가 없습니다.
            // onSnapshot 리스너가 서버의 최종 상태를 정확히 반영해줍니다.
            if (myPlayerInRoom) myPlayerInRoom.status = 'dead';

            // 2. 'GAME OVER' 화면을 표시하고 즉시 함수를 종료하여, '시작' 화면이 표시되지 않도록 합니다.
            resetGame();
            gameState = STATE.GAMEOVER;
            // [FIX] 재입장 시 배경이 움직이는 버그 수정: 게임 루프는 봇 시뮬레이션을 위해 실행되지만,
            // 화면 요소(배경 등)가 움직이지 않도록 게임 속도를 0으로 설정합니다.
            gameSpeed = 0;
            drawStaticFrame();
            document.getElementById('game-over-screen').classList.remove('hidden');
            handleGameOverUI();
            renderMultiRanking();

            // [FIX] 내가 게임오버 상태라도, 내가 방장일 경우 다른 봇들을 시뮬레이션해야 하므로 게임 루프를 실행합니다.
            // 게임 루프는 gameState가 'gameover'일 때 플레이어 캐릭터는 움직이지 않지만, handleMultiplayerTick()은 계속 호출합니다.
            if (gameLoopId) cancelAnimationFrame(gameLoopId);
            gameLoop();

            return; // 나머지 진입 로직은 건너뜁니다.
        }

        // 2. 일시정지 상태에서 재입장
        if (myPlayerInRoom && myPlayerInRoom.status === 'paused') {
            drawStaticFrame();
            gameState = STATE.PAUSED;
            document.getElementById('game-pause-screen').classList.remove('hidden');
            document.getElementById('btn-pause-toggle').classList.add('paused');
            startAutoActionTimer(30, 'start', '#game-pause-screen .time-message');
            renderMultiRanking();
            return;
        }

        // 3. [수정] 시작화면이 아니라 재시작(WOOPS) 화면으로 시작되도록 로직 변경
        // [FIX] 재입장 시 상태 판정 로직을 서버 데이터(`userUsedAttempts`) 기준으로 단순화하여 동기화 문제를 해결합니다.
        // 기존 로직은 로컬 `gameState`나 캐시의 `status`에 의존하여, 데이터가 불일치할 경우 잘못된 화면(시작 화면)을 표시하는 문제가 있었습니다.
        if (myPlayerInRoom && userUsedAttempts > 0) {
            // 시도 횟수가 1회 이상 소진된 상태이므로, '재시도 대기' 상태로 동기화합니다.
            myPlayerInRoom.status = 'waiting';
            drawStaticFrame();
            gameState = STATE.GAMEOVER; // 상태 동기화
            document.getElementById('game-over-screen').classList.remove('hidden');
            handleGameOverUI();
            renderMultiRanking();
            return;
        }

        // 4. 그 외의 경우 (예: 첫 시작 대기)는 기본 시작 화면으로 진행합니다.
        if (myPlayerInRoom) myPlayerInRoom.status = 'waiting';

        // 첫 입장이거나, 재입장 시 이전 상태 복원이 필요 없는 경우(예: 첫 시작 대기)
        resetGame();
        // [수정] 시작 대기 화면이 보일 때만 컨트롤러를 숨김
        setControlsVisibility(false);
        drawStaticFrame();
        document.getElementById('game-start-screen').classList.remove('hidden');
        startAutoActionTimer(15, 'exit', '#game-start-screen .time-message');
        renderMultiRanking(); // 랭킹 목록 갱신
    } else { // 싱글 모드 로직 (기존과 동일)
        // [수정] 싱글 모드에서도 게임 시작 준비 화면을 띄워줍니다.
        resetGame();
        // [수정] 시작 대기 화면이 보일 때만 컨트롤러를 숨김
        setControlsVisibility(false);
        drawStaticFrame();
        document.getElementById('game-start-screen').classList.remove('hidden');
    }
}

/**
 * [신규] 비밀번호 입력 모달을 띄웁니다.
 */
function showPasswordInput(room) {
    targetRoom = room;
    const scene = document.getElementById('scene-password-input');
    const input = document.getElementById('input-room-password');
    const msg = document.getElementById('password-message');

    if (input) input.value = '';
    if (msg) {
        msg.innerText = '';
        msg.style.display = 'none'; // 초기화 시 메시지 숨김
    }
    if (scene) scene.classList.remove('hidden');
}

/**
 * [신규] 홈 버튼 클릭 시 처리 (상태에 따라 확인 팝업 또는 즉시 이동)
 */
function handleHomeButtonClick() {
    // 1. 일시정지 상태이거나
    // 2. 게임오버(충돌) 상태이지만 아직 시도 횟수가 남아서 재시작이 가능한 경우 ('WOOPS' 화면)
    // -> 확인 팝업 노출
    let isInProgress = false;

    if (gameState === STATE.PAUSED) {
        isInProgress = true;
    } else if (gameState === STATE.GAMEOVER) {
        // 멀티플레이 모드에서 시도 횟수가 남았는지 확인
        if (currentGameMode === 'multi' && currentRoom) {
            // [FIX] onSnapshot에 의해 myPlayer.attemptsLeft가 초기화될 수 있으므로,
            // currentUser.joinedRooms를 기준으로 남은 횟수를 직접 계산합니다.
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
        // [FIX] 게임 시작 전/후를 구분하여 퇴장 방식 결정
        const userRoomState = (currentUser && currentRoom) ? currentUser.joinedRooms[currentRoom.id] : null;
        const hasStartedPlaying = userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0);
        // 게임을 시작했으면 소프트 퇴장, 시작 전이면 완전 퇴장
        exitToLobby(!hasStartedPlaying);
    }
}

/**
 * [신규] 현재 방을 목록에서 삭제하고 로비로 이동
 */
async function deleteCurrentRoom() {
    if (!currentRoom || !currentRoom.id) {
        console.warn("삭제할 방 정보가 없습니다. 로비로 이동합니다.");
        exitToLobby(false);
        return;
    }

    const roomId = currentRoom.id;

    try {
        // 1. db.collection('rooms').doc(roomId).delete()를 사용하여 서버에서 해당 데이터를 삭제합니다.
        await db.collection('rooms').doc(roomId).delete();
        console.log(`✅ 방 [${roomId}]이(가) 서버에서 성공적으로 삭제(폭파)되었습니다.`);

        // 2. 삭제 성공 시 유저를 메인 로비로 이동시킵니다.
        // onSnapshot 리스너가 방 목록 UI를 자동으로 갱신할 것입니다.
        // exitToLobby()는 내부적으로 많은 로컬 정리를 수행하므로 재사용합니다.
        // exitToLobby()가 더 이상 존재하지 않는 방에 대한 로직을 수행하지 않도록 currentRoom을 null로 설정합니다.
        currentRoom = null;
        exitToLobby(false);
    } catch (error) {
        console.error(`❌ 방 [${roomId}] 삭제 실패:`, error);
        alert("방을 삭제하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
}

/**
 * [FIX] '참가중인 목록'에서 현재 방을 제거합니다. (DB에서 방을 삭제하지 않음)
 * 기존 deleteCurrentRoom은 방 자체를 DB에서 삭제하여 모든 참가자에게 영향을 주는 버그가 있었습니다.
 * 이 함수는 현재 로그인한 유저의 '참가 목록'에서만 방을 제거합니다.
 */
async function removeFromMyRooms() {
    if (!currentRoom || !currentRoom.id || !currentUser) {
        console.warn("목록에서 제거할 방 정보가 없습니다.");
        await exitToLobby(false);
        return;
    }

    const roomId = currentRoom.id;
    const myId = currentUser.id;

    try {
        // [수정] '목록에서 삭제'는 2단계로 동작합니다.
        // 1. 유저의 개인 joinedRooms 목록에 hidden 플래그를 설정하여 '참가중' 탭에서 보이지 않게 합니다.
        // 2. 중앙 데이터인 participants 서브컬렉션에도 hidden 플래그를 설정하여, 모든 유저가 나갔을 때 방을 최종 삭제할 수 있도록 합니다.
        if (currentUser.joinedRooms[roomId]) {
            currentUser.joinedRooms[roomId].hidden = true; // 로컬 상태 업데이트
            await db.collection("users").doc(myId).update({
                [`joinedRooms.${roomId}.hidden`]: true // Firestore에 'hidden' 플래그만 업데이트
            });
        }

        // 중앙 참가자 목록에도 숨김 처리
        const participantRef = db.collection('rooms').doc(roomId).collection('participants').doc(myId);
        await participantRef.update({ hidden: true });

        console.log(`✅ 방 [${roomId}]을(를) '참가중인 목록'에서 숨겼습니다.`);

        // UI 정리를 위해 로비로 이동합니다. (소프트 퇴장)
        await exitToLobby(false);

    } catch (error) {
        console.error("❌ '참가중인 목록'에서 방 숨기기 실패:", error);
        alert("목록에서 방을 제거하는 중 오류가 발생했습니다.");
    }
}

/**
 * [신규] 광고 데이터(오늘 시청 횟수)를 가져오고 날짜를 체크합니다.
 */
function getAdData() {
    const today = new Date().toDateString(); // "Mon Mar 13 2023" 형식
    let data = JSON.parse(localStorage.getItem('chickenRunAdData')) || { date: today, count: 0 };

    // 날짜가 바뀌었으면 횟수 초기화
    if (data.date !== today) {
        data = { date: today, count: 0 };
        localStorage.setItem('chickenRunAdData', JSON.stringify(data));
    }
    return data;
}

/**
 * [신규] 광고 시청 시뮬레이션 및 보상 지급
 */
function watchAdAndGetReward() {
    let adTimerInterval = null; // [신규] 타이머 ID를 저장할 변수
    if (!currentUser) {
        alert('로그인 후 이용해주세요.');
        return;
    }

    const adData = getAdData();
    if (adData.count >= AD_CONFIG.DAILY_LIMIT) {
        alert(`오늘의 광고 시청 횟수를 모두 소진했습니다.\n(매일 자정에 초기화됩니다.)`);
        return;
    }

    // 광고 오버레이 생성 (없으면 생성)
    let adOverlay = document.getElementById('scene-ad-overlay');
    if (!adOverlay) {
        adOverlay = document.createElement('div');
        adOverlay.id = 'scene-ad-overlay';
        document.body.appendChild(adOverlay);
    } else {
        adOverlay.classList.remove('hidden');
    }

    // [UX 개선] 광고 시청 중 UI와 보상 획득 UI를 분리하여 렌더링
    adOverlay.innerHTML = `
        <!-- 1. 광고 시청 중 화면 -->
        <div id="ad-view-loading" class="ad-view">
            <!-- 상단 진행률 표시 UI -->
            <div class="ad-ui-container">
                <div class="ad-progress-bar-wrapper">
                    <div id="ad-progress-bar"></div>
                </div>
            </div>

            <!-- [수정] 닫기(포기) 버튼: 상단 우측 -->
            <!-- [수정] 버튼 통합: 초기에는 닫기, 완료 시 시청완료 버튼으로 변신 -->
            <button id="btn-ad-close-video">✕ Close</button>

            <!-- (가상) 광고 컨텐츠 영역 -->
            <p>광고 영상이 재생되는 중입니다...</p>
            <div class="spinner"></div>
        </div>

        <!-- 2. 보상 획득 화면 (초기에는 숨김) -->
        <div id="ad-view-finished" class="ad-view" style="display:none;">
            <img src="assets/images/icon_coin.png" style="width:4rem; image-rendering: pixelated;">
            <p style="font-size: 1.5rem; color: #ffd02d; font-family: 'KoreanYNMYTM';">보상 획득!</p>
            <p style="font-size: 1rem;">+${AD_CONFIG.REWARD} 코인</p>
            <div style="width: 100%; display: flex; justify-content: center;">
                <button id="btn-ad-close" class="pixelbtn pixelbtn--primary">닫기</button>
            </div>
        </div>
    `;

    // UI 요소 가져오기
    const progressBar = document.getElementById('ad-progress-bar');
    const btnCloseVideo = document.getElementById('btn-ad-close-video');

    // 1. X 버튼 (Close) 이벤트: 보상 포기
    btnCloseVideo.onclick = () => {
        clearInterval(adTimerInterval);
        adOverlay.classList.add('hidden');
        alert('광고를 건너뛰어 보상을 받지 못했습니다.');
    };

    // 10초 카운트다운 및 프로그레스 바 시뮬레이션
    const adStartTime = Date.now();
    adTimerInterval = setInterval(() => {
        const elapsedTime = Date.now() - adStartTime;
        const progress = Math.min(100, (elapsedTime / AD_CONFIG.DURATION) * 100);

        if (progressBar) progressBar.style.width = `${progress}%`;

        // 광고 시청 시간 충족
        if (elapsedTime >= AD_CONFIG.DURATION) {
            clearInterval(adTimerInterval);

            // [수정] 버튼 하나로 통합: 텍스트와 스타일, 동작을 변경
            if (btnCloseVideo) {
                btnCloseVideo.innerText = "시청완료 ❯❯";

                // 클릭 이벤트 재정의 (보상 획득 로직으로 교체)
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
    }, 50); // 50ms 간격으로 부드럽게 업데이트

    // 보상 획득 화면의 닫기 버튼 이벤트 (미리 바인딩)
    // (innerHTML로 새로 생성되므로 여기서 바인딩 필요)
    // 주의: 위쪽 btnRewardSkip.onclick 내부가 아니라 바깥에서 바인딩해야 함.
    // 하지만 btn-ad-close 요소는 btnRewardSkip 클릭 후 화면이 전환되어야 보이므로
    // 이벤트 위임이나 화면 전환 시점에 바인딩하는 것이 안전함.
    // 여기서는 간단히 document 레벨에서 처리하거나, 화면 전환 시점에 처리.
    // 위 코드 구조상 btnRewardSkip 클릭 핸들러 안에서는 DOM이 이미 존재하므로
    // btn-ad-close에 대한 처리는 아래와 같이 수정합니다.

    // [수정] 보상 화면 닫기 버튼은 정적 HTML 문자열에 포함되어 있으므로
    // 화면 전환 로직과 무관하게 미리 바인딩 가능 (단, 요소가 DOM에 추가된 직후)
    const btnCloseReward = document.getElementById('btn-ad-close');
    if (btnCloseReward) {
        btnCloseReward.onclick = () => {
            adOverlay.classList.add('hidden');
        };
    }
}

/**
 * [개발용] 광고 시청 횟수를 초기화합니다.
 * 브라우저 개발자 콘솔에서 `resetAdCount()`를 호출하여 사용할 수 있습니다.
 */
function resetAdCount() {
    // 가장 간단한 방법은 저장된 광고 데이터를 삭제하는 것입니다.
    // getAdData() 함수는 데이터가 없을 경우 자동으로 오늘 날짜와 0회로 새로 생성합니다.
    localStorage.removeItem('chickenRunAdData');
    console.log('광고 시청 횟수 데이터가 초기화되었습니다.');
    alert('광고 시청 횟수가 초기화되었습니다.');
    // UI의 횟수 표시를 즉시 갱신합니다.
    updateCoinUI();
}

/**
 * [개발용] 모든 방의 참가자 정보를 초기화하여 목록을 리셋합니다.
 * 브라우저 개발자 콘솔에서 `resetRoomData()`를 호출하여 사용할 수 있습니다.
 */
function resetRoomData() {
    if (confirm('정말로 모든 방의 참가자 정보를 초기화하시겠습니까? 방이 모두 "모집중" 상태로 돌아갑니다.')) {
        localStorage.removeItem('chickenRunRoomStates');
        console.log('방 데이터가 초기화되었습니다. 페이지를 새로고침합니다.');
        alert('방 데이터가 초기화되었습니다. 페이지를 새로고침합니다.');
    }
}

/**
 * [신규] 구글 로그인 함수
 */
function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    // [FIX] 구글 로그인 시 이메일과 프로필 정보를 명시적으로 요청합니다. (Scope 추가)
    provider.addScope('profile');
    provider.addScope('email');

    // signInWithPopup을 호출하면 onAuthStateChanged 리스너가 로그인 결과를 감지합니다.
    firebase.auth().signInWithPopup(provider).catch((error) => {
        console.error("❌ 로그인 팝업 실패:", error.message);
        // 사용자가 팝업을 닫는 등의 오류는 무시해도 괜찮습니다.
        if (error.code !== 'auth/popup-closed-by-user') {
            alert("로그인 중 오류가 발생했습니다: " + error.message);
        }
    });
}

/**
 * [신규] 서버에서 유저 데이터를 불러오거나, 신규 유저일 경우 생성합니다.
 * [수정] onSnapshot을 사용하여 실시간 데이터 동기화 구현
 */
/**
 * [신규] 서버에서 유저 데이터를 불러오거나, 신규 유저일 경우 생성합니다.
 * [수정] onSnapshot을 사용하여 실시간 데이터 동기화 구현 및 비정상 종료 복구 (F5 등)
 */
function loadUserData(user) {
    const userRef = db.collection("users").doc(user.uid);

    if (unsubscribeUserData) {
        unsubscribeUserData();
        unsubscribeUserData = null;
    }
 
    // [수정] 클라이언트에서 문서를 직접 생성하는 대신,
    // 백엔드(Cloud Function)에서 생성된 문서를 실시간으로 구독(listen)하는 방식으로 변경합니다.
    // 이 방식은 권한 문제를 원천적으로 해결하며 더 안전합니다.
    let initialLoadComplete = false;
 
    unsubscribeUserData = userRef.onSnapshot((snapshot) => {
        // 백엔드에서 문서 생성이 지연될 수 있으므로, 문서가 아직 없으면 기다립니다.
        if (!snapshot.exists) {
            console.log("사용자 프로필을 기다리는 중...");
            return;
        }
 
        const userData = snapshot.data();
        const providerInfo = user.providerData && user.providerData[0] ? user.providerData[0] : null;
        const correctEmail = user.email || (providerInfo ? providerInfo.email : null);
        const isAdminUser = ADMIN_UIDS.includes(user.uid);
 
        // currentUser 객체 설정/업데이트
        currentUser = {
            ...currentUser,
            ...userData,
            email: correctEmail || userData.email,
            isAdmin: isAdminUser
        };
 
        // 최초 로드 시에만 실행할 로직 (UI 초기화, 비정상 종료 복구 등)
        if (!initialLoadComplete) {
            initialLoadComplete = true;
 
            // Auth 정보와 Firestore 정보가 다를 경우 동기화
            if (correctEmail && userData.email !== correctEmail) {
                userRef.update({ email: correctEmail }).then(() => console.log("🔧 Firestore의 이메일 정보를 최신 정보로 수정했습니다."));
            }
 
            const lastActiveRoomId = sessionStorage.getItem('activeRoomId');
            if (lastActiveRoomId) {
                sessionStorage.removeItem('activeRoomId');
                if (lastActiveRoomId === 'single_player_mode') {
                    console.log('⚠️ 비정상 종료 감지: 싱글 플레이 게임을 종료 처리했습니다.');
                } else {
                    console.log(`⚠️ 비정상 종료 감지: 방 [${lastActiveRoomId}]에서 퇴장 처리를 시작합니다.`);
                    const userRoomState = userData.joinedRooms ? userData.joinedRooms[lastActiveRoomId] : null;
                    const hasStartedPlaying = userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0);
                    performServerExit(lastActiveRoomId, !hasStartedPlaying);
                }
            }
 
            console.log(`[Auth] User: ${currentUser.email}, IsAdmin: ${isAdminUser}`);
            isLoggedIn = true;
            const authScene = document.getElementById('scene-auth');
            if (authScene) authScene.classList.add('hidden');
 
            roomFetchPromise = null;
            fetchRaceRooms(false);
            fetchMyRooms();
        }
 
        // 데이터 변경 시마다 항상 실행할 UI 업데이트
        updateCoinUI();
        fetchMyRooms();
        const sceneUserProfile = document.getElementById('scene-user-profile');
        if (sceneUserProfile && !sceneUserProfile.classList.contains('hidden')) {
            showUserProfile();
        }
    }, (error) => {
        console.error("❌ 유저 데이터 실시간 수신 실패:", error);
        // 권한 오류 시 알림을 띄우지 않고 로깅만 합니다. (로그아웃 중 발생할 수 있음)
        // alert("유저 정보를 실시간으로 동기화하는 중 오류가 발생했습니다.");
    });
}

/**
 * [신규] 카카오 OIDC 로그인 함수
 */
function loginWithKakao() {
    const provider = new firebase.auth.OAuthProvider('oidc.kakao');
    // [FIX] 카카오 로그인 시 닉네임과 이메일 정보만 명시적으로 요청합니다. (프로필 사진 제외)
    provider.addScope('profile_nickname');
    provider.addScope('account_email');

    // signInWithPopup을 호출하면 onAuthStateChanged 리스너가 로그인 결과를 자동으로 감지합니다.
    firebase.auth().signInWithPopup(provider).catch((error) => {
        console.error("❌ 카카오 로그인 팝업 실패:", error.message);
        // 사용자가 팝업을 닫는 등의 오류는 무시합니다.
        if (error.code !== 'auth/popup-closed-by-user') {
            alert("카카오 로그인 중 오류가 발생했습니다: " + error.message);
        }
    });
}

/**
 * [신규] 페이스북 로그인 함수
 */
function loginWithFacebook() {
    const provider = new firebase.auth.FacebookAuthProvider();

    // 이메일과 공개 프로필 권한을 요청합니다.
    provider.addScope('email');
    provider.addScope('public_profile');

    // 팝업창으로 로그인을 진행합니다.
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            console.log("✅ 페이스북 로그인 성공!");
            // 로그인 후 유저 처리는 기존 onAuthStateChanged 리스너가 수행합니다.
        })
        .catch((error) => {
            console.error("❌ 페이스북 로그인 실패:", error.code, error.message);
            if (error.code === 'auth/account-exists-with-different-credential') {
                alert("이미 동일한 이메일로 가입된 다른 계정(구글/네이버 등)이 있습니다.");
            } else {
                alert("페이스북 로그인 중 오류가 발생했습니다: " + error.message);
            }
        });
}

/**
 * [수정됨] 네이버 팝업 로그인 & 커스텀 토큰 인증 로직
 */
function loginWithNaver() {
    // 1. 네이버 클라이언트 ID 
    const clientId = "YNgZCcwBzPp11G9wKmHS";

    // 2. 현재 게임이 실행 중인 주소 (이 주소로 팝업이 다시 돌아옵니다)
    const redirectUri = encodeURIComponent("https://orangecases.github.io/chicken-race/");
    const state = Math.random().toString(36).substr(2, 11);

    // 3. 네이버 로그인 팝업 띄우기
    const url = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;

    // 혹시 몰라 콘솔에 찍어보는 디버깅 코드
    console.log("🚀 최종 전송 URL:", url);

    window.open(url, 'naverlogin', 'width=450,height=600');

    // 4. 부모 창(게임 화면)에서 팝업이 보내는 토큰 기다리기
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'NAVER_LOGIN' && event.data.token) {
            const accessToken = event.data.token;

            console.log("🔑 네이버 Access Token 획득! 백엔드로 검증을 요청합니다...");
            // 👇 이 줄을 추가해서 진짜 토큰 글자가 잘 있는지 확인해 봅니다!
            console.log("🔑 프론트엔드가 낚아챈 토큰:", accessToken);

            try {
                // 방금 배포한 클라우드 함수 호출!
                const loginFunction = firebase.functions().httpsCallable('naverLogin');
                const result = await loginFunction({ accessToken: accessToken });

                // 백엔드가 안전하게 만들어준 커스텀 토큰 받기
                const customToken = result.data.customToken;

                // Firebase에 최종 로그인 처리!
                await firebase.auth().signInWithCustomToken(customToken);
                console.log("✅ 네이버 로그인(커스텀 토큰) 완벽 성공!");

            } catch (error) {
                console.error("❌ 백엔드 인증 처리 중 오류:", error);
                alert("네이버 로그인 처리 중 오류가 발생했습니다.");
            }
        }
    }, { once: true }); // 한 번만 실행되도록 설정
}

/**
 * [신규] 서버에 코인 수량만 업데이트하는 함수 (효율적)
 */
async function syncCoinsToServer(newCoinAmount) {
    if (!currentUser) return;
    const user = firebase.auth().currentUser;
    if (user) {
        try {
            await db.collection("users").doc(user.uid).update({
                coins: newCoinAmount
            });
            console.log("💰 서버 코인 동기화 완료:", newCoinAmount);
        } catch (error) {
            console.error("❌ 코인 동기화 실패:", error);
        }
    }
}

/**
 * [신규] 유저 객체 전체를 서버에 저장하는 함수 (닉네임, 뱃지 등)
 */
async function saveUserDataToFirestore() {
    if (!currentUser) return;
    const user = firebase.auth().currentUser;
    if (user) {
        try {
            // merge: true 옵션으로 기존 필드를 덮어쓰지 않고 병합합니다.
            await db.collection("users").doc(user.uid).set(currentUser, { merge: true });
            console.log("💾 유저 데이터 전체 저장 완료");
        } catch (error) {
            console.error("❌ 유저 데이터 전체 저장 실패:", error);
        }
    }
}

// [6. 이벤트 리스너]

document.addEventListener('DOMContentLoaded', () => {
    // [신규] Firebase 인증 상태 변경 감지 리스너
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
            console.log("❓ 로그아웃 상태");

            // UI 업데이트
            updateCoinUI(); // 게스트 코인으로 UI 업데이트
            // [FIX] F5 새로고침 또는 탭 전환 시 목록이 사라지는 문제를 해결합니다.
            // 원인: 로그인 상태 변경 시, 방 목록 데이터(raceRooms)를 다시 가져오지 않고
            //       UI 렌더링 함수(renderRoomLists)만 호출하여, 비어있는 데이터로 목록이 그려지는 레이스 컨디션이 있었습니다.
            // 해결: 로그인/로그아웃 시 항상 fetchRaceRooms()를 호출하여 데이터를 먼저 가져온 후 UI를 그리도록 순서를 보장합니다.
            roomFetchPromise = null; // [신규] 권한 변경 반영을 위해 목록 재로딩
            fetchRaceRooms(false);
            fetchMyRooms(); // [신규] 내 방 목록도 갱신 (비움)

            // 열려있을 수 있는 프로필 모달 닫기
            const sceneUserProfile = document.getElementById('scene-user-profile');
            if (sceneUserProfile) sceneUserProfile.classList.add('hidden');
        }
    });

    // [신규] 기록 로드 및 렌더링
    generateTop100Scores(); // 랭킹 데이터를 먼저 생성
    myScores = JSON.parse(localStorage.getItem('chickenRunMyScores')) || [];
    if (myScores.length > 0) {
        bestScore = myScores[0].score;
    }
    renderMyRecordList();
    renderTop100List();
    // [FIX] fetchRaceRooms() 호출을 onAuthStateChanged 내부로 이동하여,
    // 로그인 상태가 확정된 후에 방 목록을 불러오도록 수정합니다.

    // [신규] 더보기 버튼 이벤트 핸들러 (탭 구분)
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

    // [신규] 디버깅용 봇 추가/삭제 이벤트 핸들러 (이벤트 위임)
    // [수정] 서버 연동에 따라 Firestore 데이터를 직접 수정하도록 변경
    const handleDebugBotAction = async (e) => {
        // [신규] 관리자가 아니면 동작하지 않음
        if (!currentUser || !currentUser.isAdmin) return;

        const target = e.target.closest('.debug-btn');
        if (!target) return;

        // [FIX] 봇 제어 버튼(data-bot-id)은 이 핸들러가 아닌 handleBotControlAction에서 처리해야 하므로 무시합니다.
        // data-roomId가 있는 버튼(방 인원 조절)만 여기서 처리합니다.
        if (!target.dataset.roomId) return;

        e.stopPropagation(); // 부모 li의 방 입장 이벤트가 실행되는 것을 막습니다.
        const roomId = target.dataset.roomId;
        const action = target.dataset.action;

        const roomRef = db.collection('rooms').doc(roomId);
        const participantsRef = roomRef.collection('participants');

        try {
            if (action === 'add') {
                await db.runTransaction(async (transaction) => {
                    const roomDoc = await transaction.get(roomRef);
                    if (!roomDoc.exists) throw "존재하지 않는 방입니다.";
                    const roomData = roomDoc.data();

                    if (roomData.currentPlayers >= roomData.maxPlayers) {
                        console.warn(`[Debug] 방 [${roomId}]이(가) 가득 찼습니다.`);
                        return; // 트랜잭션 중단
                    }

                    const botId = `bot_debug_${Date.now()}`;
                    const botNames = ["초보닭", "중수닭", "고수닭", "치킨런봇", "AI닭"];
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
                        startDelay: 60 + Math.floor(Math.random() * 120), // 봇마다 시작 시간 다르게
                        targetScore: 750 + Math.floor(Math.random() * 1500) // [수정] 봇 목표 점수 하향 조정
                    };
                    transaction.set(participantsRef.doc(botId), botData);
                    // [FIX] 봇 추가 시 방이 finished 상태이면 inprogress로 변경합니다.
                    const updates = { currentPlayers: firebase.firestore.FieldValue.increment(1) };
                    if (roomData.status === 'finished') {
                        updates.status = 'inprogress';
                    }
                    transaction.update(roomRef, updates);
                });
            } else if (action === 'remove') {
                // [FIX] 트랜잭션 외부에서 쿼리를 실행하여 삭제할 봇을 먼저 찾습니다.
                const botQuerySnapshot = await participantsRef.where('isBot', '==', true).limit(1).get();
                if (botQuerySnapshot.empty) {
                    console.warn(`[Debug] 방 [${roomId}]에 제거할 봇이 없습니다.`);
                    return;
                }
                const botToRemoveRef = botQuerySnapshot.docs[0].ref;

                await db.runTransaction(async (transaction) => {
                    const roomDoc = await transaction.get(roomRef);
                    if (!roomDoc.exists) throw "존재하지 않는 방입니다.";
                    const roomData = roomDoc.data();

                    // 1. 찾은 봇 문서를 트랜잭션 내에서 삭제합니다.
                    transaction.delete(botToRemoveRef);

                    // 2. room 문서의 currentPlayers를 감소시키거나 방을 삭제합니다.
                    const newPlayerCount = roomData.currentPlayers - 1;
                    if (newPlayerCount <= 0) {
                        transaction.delete(roomRef);
                    } else {
                        // [수정] 봇을 삭제(하드 삭제)할 때, 방이 'finished' 상태였다면 다시 'inprogress'로 되돌립니다.
                        const updates = { currentPlayers: firebase.firestore.FieldValue.increment(-1) };
                        if (roomData.status === 'finished') {
                            updates.status = 'inprogress';
                        }
                        transaction.update(roomRef, updates);
                    }
                });
            }

            console.log(`[Debug] 방 [${roomId}]의 참가자 정보를 성공적으로 수정했습니다.`);

            // 트랜잭션 성공 후, 로비에 있다면 목록을 수동으로 갱신합니다.
            // 게임 씬 내부에 있다면 onSnapshot 리스너가 UI를 자동으로 업데이트합니다.
            const isInGame = !document.getElementById('scene-game').classList.contains('hidden');
            if (!isInGame) {
                fetchRaceRooms(false);
                fetchMyRooms();
            }
        } catch (error) {
            console.error("❌ 디버그 인원 수정 실패:", error);
        }
    };
    document.getElementById('content-race-room').addEventListener('click', handleDebugBotAction, true);
    document.getElementById('content-my-rooms').addEventListener('click', handleDebugBotAction, true);
    document.getElementById('view-multi-rank').addEventListener('click', handleDebugBotAction, true);

    // [요청수정] 봇 상태를 수동으로 제어하는 디버깅용 이벤트 핸들러
    const handleBotControlAction = async (e) => {
        const target = e.target.closest('.debug-btn[data-bot-id]');
        if (!target || !currentRoom) return;

        e.stopPropagation(); // 다른 이벤트(예: 방 입장)가 실행되는 것을 막습니다.

        const botId = target.dataset.botId;
        const action = target.dataset.action;
        const participantRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(botId);

        try {
            switch (action) {
                case 'force-start':
                    console.log(`[Debug] Bot [${botId}] 강제 시작`);
                    // [FIX] force-start 시 방이 finished 상태이면 inprogress로 변경해야 봇 시뮬레이션이 다시 동작합니다.
                    const roomRefForStart = db.collection('rooms').doc(currentRoom.id);
                    await db.runTransaction(async (transaction) => {
                        const roomDoc = await transaction.get(roomRefForStart);
                        if (!roomDoc.exists) return;

                        // 1. 봇 상태를 'playing'으로 변경
                        transaction.update(participantRef, { status: 'playing' });

                        // 2. 방 상태가 'finished'이면 'inprogress'로 변경
                        if (roomDoc.data().status === 'finished') {
                            transaction.update(roomRefForStart, { status: 'inprogress' });
                        }
                    });
                    break;
                case 'force-end':
                    console.log(`[Debug] Bot [${botId}] 강제 종료`);
                    await participantRef.update({ status: 'dead' });
                    break;
                case 'force-delete':
                    // [수정] '목록삭제'는 봇을 DB에서 삭제하는 것이 아니라, 일반 유저처럼 '목록에서 숨김' 처리하는 기능입니다.
                    console.log(`[Debug] Bot [${botId}] '목록에서 삭제' 시뮬레이션`);
                    const roomRefForDelete = db.collection('rooms').doc(currentRoom.id);
                    const participantsRefForDelete = roomRefForDelete.collection('participants');

                    await db.runTransaction(async (transaction) => {
                        // 1. 해당 방의 모든 참가자 정보를 가져옵니다.
                        const participantsSnapshot = await transaction.get(participantsRefForDelete);
                        const botDoc = participantsSnapshot.docs.find(doc => doc.id === botId);
                        if (!botDoc) return;

                        // 2. 대상 봇의 상태를 'hidden: true'로 업데이트합니다.
                        transaction.update(botDoc.ref, { hidden: true });

                        // 3. 이 봇을 제외한 다른 모든 참가자들도 hidden 상태인지 확인합니다.
                        let allParticipantsHidden = true;
                        participantsSnapshot.forEach(doc => {
                            // 현재 업데이트하려는 봇이 아니고, hidden 플래그가 없는 참가자가 있다면, 아직 모두 나간 것이 아닙니다.
                            if (doc.id !== botId && !doc.data().hidden) {
                                allParticipantsHidden = false;
                            }
                        });

                        // 4. 만약 모든 참가자가 hidden 상태가 되면, 방 자체를 삭제합니다.
                        if (allParticipantsHidden) {
                            console.log(`모든 참가자가 목록에서 방을 제거했습니다. 방 [${currentRoom.id}]을(를) 삭제합니다.`);
                            transaction.delete(roomRefForDelete);
                        }
                    });
                    break;
            }
        } catch (error) {
            console.error(`[Debug] 봇 컨트롤 실패 (Action: ${action}):`, error);
        }
    };
    document.getElementById('multi-score-list').addEventListener('click', handleBotControlAction);

    // [신규] 내 기록 목록 무한 스크롤 이벤트 리스너
    const myRecordScrollArea = document.querySelector('#content-my-record .list-scroll-area');
    if (myRecordScrollArea) {
        myRecordScrollArea.onscroll = () => {
            // [수정] 바닥 감지 범위를 50px로 확대하여 더 민감하게 반응하도록 함
            if (myRecordScrollArea.scrollTop + myRecordScrollArea.clientHeight >= myRecordScrollArea.scrollHeight - 50) {
                if (displayedMyRecordsCount < myScores.length && displayedMyRecordsCount < 100) {
                    displayedMyRecordsCount += 20;
                    renderMyRecordList(true); // 추가 로드
                }
            }
        };
    }
    updateCoinUI(); // [신규] 초기 코인 UI 갱신

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
    const btnExitFromStart = document.getElementById('btn-exit-from-start'); // [신규]
    const btnExitFromPause = document.getElementById('btn-exit-from-pause'); // [신규]
    const btnExitFromGameover = document.getElementById('btn-exit-from-gameover'); // [신규]
    const btnDeleteRoom = document.getElementById('btn-delete-room'); // [신규]
    const btnPauseToggle = document.getElementById('btn-pause-toggle');
    const btnResumeGame = document.getElementById('btn-resume-game');

    // [신규] 비밀번호 모달 관련 요소
    const scenePasswordInput = document.getElementById('scene-password-input');
    const btnPasswordConfirm = document.getElementById('btn-password-confirm');
    const btnPasswordCancel = document.getElementById('btn-password-cancel');

    // [신규] 게임 종료 확인 모달 관련 요소
    const sceneExitConfirm = document.getElementById('scene-exit-confirm');
    const btnExitConfirm = document.getElementById('btn-exit-confirm');
    const btnExitCancel = document.getElementById('btn-exit-cancel');

    // [신규] 방 삭제 확인 모달 관련 요소
    const sceneDeleteRoomConfirm = document.getElementById('scene-delete-room-confirm');
    const btnDeleteRoomConfirm = document.getElementById('btn-delete-room-confirm');
    const btnDeleteRoomCancel = document.getElementById('btn-delete-room-cancel');

    // [신규] 회원가입/로그인 관련 요소
    const sceneAuth = document.getElementById('scene-auth');

    // [신규] 사용자 정보 모달 관련 요소
    const sceneUserProfile = document.getElementById('scene-user-profile');
    const btnProfileConfirm = document.getElementById('btn-profile-confirm');
    const btnLogout = document.getElementById('btn-logout');
    const btnRechargeCoin = document.getElementById('btn-recharge-coin'); // [신규] 코인 충전 버튼

    if (btnCreateOpen) {
        btnCreateOpen.onclick = () => {
            // [신규] 방 만들기 로그인 체크
            if (!isLoggedIn) {
                if (sceneAuth) {
                    sceneAuth.classList.remove('hidden');
                    const authMsg = sceneAuth.querySelector('.auth-message');
                    if (authMsg) {
                        authMsg.style.display = 'block';
                        authMsg.innerText = '방 만들기는 로그인 후 이용 가능합니다.';
                    }
                }
                return;
            }
            document.getElementById('input-room-password-create').value = ''; // [신규] 비밀번호 입력 초기화
            sceneCreateRoom.classList.remove('hidden');
        };
    }
    if (btnCreateCancel) btnCreateCancel.onclick = () => sceneCreateRoom.classList.add('hidden');

    // [수정] 멤버 버튼 클릭 시 로그인 상태에 따라 다른 모달 표시
    if (btnMember) {
        btnMember.onclick = () => {
            if (isLoggedIn) {
                showUserProfile();
            } else {
                // [신규] 일반 로그인 진입 시 메시지 초기화
                const authMsg = sceneAuth.querySelector('.auth-message');
                if (authMsg) authMsg.style.display = 'none';
                sceneAuth.classList.remove('hidden');
            }
        };
    }

    // [신규] SNS 로그인 버튼 시뮬레이션
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
                // TODO: IOS 로그인 구현
                alert('해당 로그인 방식은 현재 지원되지 않습니다.');
            }
        };
    });

    // [신규] 사용자 정보 모달 확인 버튼
    if (btnProfileConfirm) {
        btnProfileConfirm.onclick = () => {
            const newNickname = document.getElementById('profile-nickname').value.trim();
            if (newNickname && currentUser) {
                currentUser.nickname = newNickname;
                saveUserDataToFirestore(); // [신규] 닉네임 변경 시 DB에 저장
                console.log('닉네임 변경됨:', currentUser.nickname);
            }
            if (sceneUserProfile) sceneUserProfile.classList.add('hidden');
        };
    }

    // [신규] 로그아웃 버튼
    if (btnLogout) {
        btnLogout.onclick = () => {
            firebase.auth().signOut().catch((error) => {
                console.error('❌ 로그아웃 실패:', error);
                alert('로그아웃 중 오류가 발생했습니다.');
            });
            // onAuthStateChanged 리스너가 나머지 UI 처리를 담당합니다.
        };
    }

    // [신규] 코인 충전 버튼
    if (btnRechargeCoin) {
        btnRechargeCoin.onclick = () => {
            watchAdAndGetReward();
        };
    }

    if (btnCreateConfirm) {
        btnCreateConfirm.onclick = async () => {
            const user = firebase.auth().currentUser;
            if (!user) {
                alert("방을 만들려면 로그인이 필요합니다.");
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
                alert(`코인이 부족합니다.\n(필요: ${attempts}, 보유: ${currentUser.coins})`);
                return;
            }

            try {
                // [FIX] 방 생성 로직을 Batch Write로 변경하여 원자성을 보장합니다.
                // 방 생성, 생성자 등록, 초기 봇 등록을 한 번의 작업으로 처리합니다.
                const batch = db.batch();
                const roomRef = db.collection("rooms").doc(); // 새 문서 ID 미리 생성

                // 1. 방 정보 설정
                const roomData = {
                    title: titleInput || "즐거운 레이스",
                    password: passwordInput.length > 0 ? passwordInput : null,
                    maxPlayers: parseInt(limitInput) || 5,
                    currentPlayers: 2, // 나 + 봇
                    creatorUid: user.uid,
                    attempts: attempts,
                    rankType: rankType,
                    status: "inprogress",
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                batch.set(roomRef, roomData);

                // 2. 생성자(나)를 참가자 목록에 추가
                const creatorRef = roomRef.collection('participants').doc(user.uid);
                const creatorData = { id: user.uid, name: currentUser.nickname, isBot: false, score: 0, totalScore: 0, bestScore: 0, status: 'waiting', displayScore: 0, attemptsLeft: attempts };
                batch.set(creatorRef, creatorData);

                // 3. 초기 봇 1명을 참가자 목록에 추가 (방 자동 폭파 방지)
                const botRef = roomRef.collection('participants').doc(`bot_${Date.now()}`);
                const botData = { id: botRef.id, name: '초보닭', isBot: true, score: 0, totalScore: 0, bestScore: 0, status: 'waiting', displayScore: 0, attemptsLeft: attempts, startDelay: 60, targetScore: 750 }; // [수정] 봇 목표 점수 하향 조정
                batch.set(botRef, botData);

                // 4. Batch 작업 실행
                await batch.commit();
                console.log("✅ 방 생성 및 초기 참가자 등록 완료! ID:", roomRef.id);

                // 5. 로컬 데이터 업데이트 및 게임 씬 진입
                const newRoomForGame = mapFirestoreDocToRoom({ id: roomRef.id, data: () => roomData });

                // [FIX] 방 생성 후 새로고침 시 방 목록이 사라지는 문제 및 '참가중' 목록에 방이 보이지 않는 문제 해결
                // 원인: 로컬 `raceRooms` 배열에만 추가하고, `currentUser.joinedRooms` 변경 사항이 Firestore에 제대로 저장되지 않았습니다.
                // 해결:
                // 1. 생성된 방 정보를 로컬 방 목록(`raceRooms`)의 맨 앞에 추가하여, 로비로 돌아왔을 때 즉시 보이도록 합니다.
                raceRooms.unshift(newRoomForGame);

                // 2. 현재 유저의 '참가중인 방' 목록에 이 방을 추가합니다.
                const newJoinedRoomEntry = { usedAttempts: 0, isPaid: false };
                currentUser.joinedRooms[newRoomForGame.id] = newJoinedRoomEntry;

                // 3. [핵심 수정] 유저의 `joinedRooms` 필드만 Firestore에 직접 업데이트하여 영속성을 확보합니다.
                //    `saveUserDataToFirestore()`를 호출하는 대신, `joinedRooms` 맵의 특정 필드만 업데이트합니다.
                //    [FIX] joinedRooms 필드가 없을 경우를 대비해 set({ ... }, { merge: true })를 사용합니다.
                await db.collection("users").doc(user.uid).set({
                    joinedRooms: {
                        [newRoomForGame.id]: newJoinedRoomEntry
                    }
                }, { merge: true });
                console.log("💾 유저의 joinedRooms에 새 방 정보 저장 완료");

                sceneCreateRoom.classList.add('hidden');
                enterGameScene('multi', newRoomForGame);

            } catch (error) {
                console.error("❌ 방 생성 실패:", error);
                alert("방을 만드는 중 오류가 발생했습니다.");
            }
        };
    }

    // [신규] 비밀번호 확인 버튼
    if (btnPasswordConfirm) {
        btnPasswordConfirm.onclick = () => {
            // 비밀번호 입력창에서도 인원 제한 체크 (혹시 그 사이 찼을 경우 대비)
            if (targetRoom && targetRoom.current >= targetRoom.limit) {
                alert('인원 제한으로 참여할 수 없습니다.');
                return;
            }
            // [신규] 비밀번호 방 입장 시에도 코인 체크
            const cost = targetRoom.attempts;
            if (!currentUser || currentUser.coins < cost) {
                alert(`코인이 부족합니다.\n(필요: ${cost}, 보유: ${currentUser ? currentUser.coins : 0})`);
                return;
            }

            const inputPw = document.getElementById('input-room-password').value;
            const msg = document.getElementById('password-message');

            if (targetRoom && inputPw === targetRoom.password) {
                unlockedRoomIds.push(targetRoom.id); // [신규] 해제된 방 ID 저장
                scenePasswordInput.classList.add('hidden');
                // [수정] 비밀번호 확인 후 통합 참가 함수 호출
                attemptToJoinRoom(targetRoom);
                targetRoom = null;
            } else {
                if (msg) {
                    msg.innerText = '비밀번호가 일치하지 않습니다.';
                    msg.style.display = 'block'; // 에러 메시지 표시
                }
            }
        };
    }
    // [신규] 비밀번호 취소 버튼
    if (btnPasswordCancel) {
        btnPasswordCancel.onclick = () => { if (scenePasswordInput) scenePasswordInput.classList.add('hidden'); targetRoom = null; };
    }

    // [신규] 게임 종료 확인 모달 버튼 이벤트
    if (btnExitConfirm) {
        btnExitConfirm.onclick = () => {
            if (sceneExitConfirm) sceneExitConfirm.classList.add('hidden');
            // [FIX] 게임 진행 중 퇴장은 '소프트 퇴장'으로 처리
            exitToLobby(false);
        };
    }
    if (btnExitCancel) {
        btnExitCancel.onclick = () => { if (sceneExitConfirm) sceneExitConfirm.classList.add('hidden'); };
    }

    // [신규] 방 삭제 확인 모달 버튼 이벤트
    if (btnDeleteRoomConfirm) {
        btnDeleteRoomConfirm.onclick = async () => {
            if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.add('hidden');
            await removeFromMyRooms();
        };
    }
    if (btnDeleteRoomCancel) {
        btnDeleteRoomCancel.onclick = () => { if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.add('hidden'); };
    }


    // [신규] 모든 모달의 닫기 버튼에 대한 공통 이벤트 리스너
    document.querySelectorAll('.modal-container .close_modal').forEach(btn => {
        btn.onclick = () => {
            // 버튼이 속한 가장 가까운 부모 <section> (모달 전체)을 찾아 숨깁니다.
            btn.closest('section').classList.add('hidden');
        };
    });

    // [신규] 일시정지 및 이어하기 버튼 이벤트
    if (btnPauseToggle) btnPauseToggle.onclick = togglePause;
    if (btnResumeGame) btnResumeGame.onclick = togglePause;

    if (btnSingle) btnSingle.onclick = () => enterGameScene('single');

    if (btnRaceStart) {
        btnRaceStart.onclick = () => {
            // [신규] 싱글 모드일 때만 시작 시 코인 차감 (1코인)
            if (currentGameMode === 'single') {
                // [신규] 게스트 코인이 부족할 경우 자동 충전 로직 추가
                if (!currentUser && guestCoins < 1) {
                    alert("게스트 코인이 모두 소진되어 10코인을 새로 충전해 드립니다! 다시 신나게 달려보세요.");
                    guestCoins = 10;
                    localStorage.setItem('chickenRunGuestCoins', guestCoins);
                    updateCoinUI();
                }

                const currentCoins = currentUser ? currentUser.coins : guestCoins;
                if (currentCoins < 1) {
                    alert("코인이 부족하여 게임을 시작할 수 없습니다.");
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

            // [신규] 멀티 모드 시작 시 비용 지불 확인 (방 생성자 등 미지불 상태인 경우)
            if (currentGameMode === 'multi' && currentRoom && currentUser) {
                const userRoomState = currentUser.joinedRooms[currentRoom.id];
                if (userRoomState && !userRoomState.isPaid) {
                    const cost = currentRoom.attempts;
                    if (currentUser.coins < cost) {
                        alert(`코인이 부족하여 게임을 시작할 수 없습니다.\n(필요: ${cost}, 보유: ${currentUser.coins})`);
                        return;
                    }
                    currentUser.coins -= cost;
                    userRoomState.isPaid = true;
                    updateCoinUI();
                    saveUserDataToFirestore(); // 코인과 isPaid 상태를 함께 저장
                    updateButtonCosts(); // UI 갱신
                }
            }

            clearAutoActionTimer();
            document.getElementById('game-start-screen').classList.add('hidden');
            setControlsVisibility(true); // [수정] 게임 시작 시 컨트롤러 표시
            // 0.5초 애니메이션 간격 후 게임 시작
            setTimeout(() => {
                // [수정] 루프를 새로 시작하는 대신 상태를 변경하여 게임 진행
                if (gameLoopId) cancelAnimationFrame(gameLoopId);

                // [3단계] 게임 시작 시 내 상태를 'playing'으로 서버에 업데이트
                if (currentGameMode === 'multi' && currentUser) {
                    const myId = currentUser.id;
                    const myPlayer = multiGamePlayers.find(p => p.id === myId);
                    if (myPlayer) {
                        myPlayer.status = 'playing';
                        const participantDocRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(myId);
                        participantDocRef.update({ status: 'playing' }).catch(e => console.error("상태 업데이트 실패(playing)", e));
                    }
                }
                playSound('start');
                playSound('bgm');
                gameState = STATE.PLAYING; // [FIX] 게임 상태를 'PLAYING'으로 변경하여 게임 로직 실행
                gameLoop();
            }, 500);
        };
    }

    if (btnRestart) {
        btnRestart.onclick = () => {
            // [신규] 싱글 모드일 때만 재시작 시 코인 차감 (1코인)
            if (currentGameMode === 'single') {
                // [신규] 게스트 코인이 부족할 경우 자동 충전 로직 추가
                if (!currentUser && guestCoins < 1) {
                    alert("게스트 코인이 모두 소진되어 10코인을 새로 충전해 드립니다! 다시 신나게 달려보세요.");
                    guestCoins = 10;
                    localStorage.setItem('chickenRunGuestCoins', guestCoins);
                    updateCoinUI();
                }

                const currentCoins = currentUser ? currentUser.coins : guestCoins;
                if (currentCoins < 1) {
                    alert("코인이 부족하여 게임을 시작할 수 없습니다.");
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
            setControlsVisibility(true); // [수정] 게임 재시작 시 컨트롤러 표시
            // 0.5초 애니메이션 간격 후 게임 재시작
            setTimeout(() => {
                resetGame();
                if (gameLoopId) cancelAnimationFrame(gameLoopId);

                // [3단계] 게임 재시작 시 내 상태를 'playing'으로 서버에 업데이트
                if (currentGameMode === 'multi' && currentUser) {
                    const myId = currentUser.id;
                    const myPlayer = multiGamePlayers.find(p => p.id === myId);
                    if (myPlayer) {
                        myPlayer.status = 'playing';
                        const participantDocRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(myId);
                        participantDocRef.update({ status: 'playing' }).catch(e => console.error("상태 업데이트 실패(playing)", e));
                    }
                }
                playSound('start');
                playSound('bgm');
                gameState = STATE.PLAYING; // [핵심] 상태를 PLAYING으로 변경하여 게임 시작
                gameLoop();
            }, 500);
        };
    }

    // [신규] 사운드 버튼 토글
    if (btnSoundToggle) {
        // 초기 상태 설정
        btnSoundToggle.classList.toggle('sound-on', isSoundOn);
        btnSoundToggle.classList.toggle('sound-off', !isSoundOn);

        btnSoundToggle.onclick = () => {
            isSoundOn = !isSoundOn; // 상태 토글
            btnSoundToggle.classList.toggle('sound-on', isSoundOn);
            btnSoundToggle.classList.toggle('sound-off', !isSoundOn);
            console.log(`사운드 상태: ${isSoundOn ? 'ON' : 'OFF'}`);
            // [신규] 사운드 토글 즉시 반영
            if (isSoundOn) {
                if (gameState === STATE.PLAYING) playSound('bgm');
            } else {
                pauseBGM();
            }
        };
    }

    // 탭 전환 로직 통합
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
    // [수정] 레이스룸/참가중 탭 전환 시에는 renderRoomLists 함수를 콜백으로 전달하여 목록을 새로고침합니다.
    initTabs('tab-race-room', 'tab-my-rooms', 'content-race-room', 'content-my-rooms', () => {
        renderRoomLists(true);
        fetchRaceRooms(false); // [FIX] 탭 전환 시 서버 데이터 갱신
        fetchMyRooms();        // [신규] 내 방 목록 갱신
    });

    // [수정] Top 100 탭 클릭 시 서버에서 랭킹 불러오기
    initTabs('tab-my-record', 'tab-top-100', 'content-my-record', 'content-top-100', () => {
        const tabTop100 = document.getElementById('tab-top-100');
        if (tabTop100 && tabTop100.classList.contains('active')) {
            loadLeaderboard();
        }
    });

    // [신규] 탭 내 새로고침 버튼 이벤트
    document.querySelectorAll('.list-tabgroup .refresh').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation(); // 부모인 탭의 클릭 이벤트가 전파되는 것을 막습니다.

            // [FIX] 새로고침 버튼이 동작하지 않는 문제 해결
            // 원인: 1. 중복 호출 방지 로직 때문에 새로고침이 무시됨. 2. '참가중' 목록 갱신 로직 누락.
            // 해결: 1. 기존 Promise를 초기화하여 강제로 목록을 다시 불러오도록 수정.
            //      2. '참가중' 목록도 함께 갱신하도록 fetchMyRooms()를 호출.
            console.log("🔄️ 목록 새로고침 버튼 클릭됨.");
            roomFetchPromise = null; // 기존 Promise를 초기화하여 fetchRaceRooms가 다시 실행되도록 함
            fetchRaceRooms(false);
            fetchMyRooms();
        };
    });

    // [수정] 'HOME' 버튼 클릭 시 handleHomeButtonClick 연결 (상황에 따라 팝업 뜸)
    if (btnExitFromStart) btnExitFromStart.onclick = () => exitToLobby(true);
    if (btnExitFromPause) btnExitFromPause.onclick = handleHomeButtonClick;
    if (btnExitFromGameover) btnExitFromGameover.onclick = handleHomeButtonClick;

    // [신규] 방 삭제 버튼
    if (btnDeleteRoom) {
        btnDeleteRoom.onclick = () => {
            if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.remove('hidden');
        };
    }

    // 점프/부스트 컨트롤
    const btnJump = document.getElementById('btn-jump');
    if (btnJump) {
        const startJumping = (e) => {
            e.preventDefault();
            if (gameState === STATE.PLAYING) {
                btnJump.classList.add('pressed');
                isJumpPressed = true; // 누름 상태 유지
                if (!chicken.isJumping) chicken.jump(); // 즉시 점프 시도
            }
        };
        const endJumping = (e) => {
            e.preventDefault();
            btnJump.classList.remove('pressed');
            isJumpPressed = false; // 누름 상태 해제
            if (gameState === STATE.PLAYING) {
                chicken.cutJump();
            }
        };
        // [수정] addEventListener 방식으로 변경하여 터치 반응성 개선
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
        // [수정] addEventListener 방식으로 변경하여 터치 반응성 개선
        btnBoost.addEventListener('mousedown', startBoosting);
        btnBoost.addEventListener('mouseup', endBoosting);
        btnBoost.addEventListener('mouseleave', endBoosting);
        btnBoost.addEventListener('touchstart', startBoosting, { passive: false });
        btnBoost.addEventListener('touchend', endBoosting);
        btnBoost.addEventListener('touchcancel', endBoosting);
    }

    // [수정] 모달 내 range input 값 표시 및 프로그레스 바 업데이트
    const setupRangeInput = (rangeId, displayId) => {
        const rangeInput = document.getElementById(rangeId);
        if (!rangeInput) return;

        const update = () => {
            // 1. 텍스트 값 업데이트
            const displayEl = document.getElementById(displayId);
            if (displayEl) displayEl.innerText = rangeInput.value;
            
            // [신규] 시도 횟수 슬라이더 변경 시 차감 코인 표시 업데이트
            const displayCost = document.getElementById('display-cost');
            if (rangeId === 'input-room-attempts' && displayCost) displayCost.innerText = rangeInput.value;

            // 2. CSS 변수를 이용한 프로그레스 바 업데이트
            const min = parseFloat(rangeInput.min) || 0;
            const max = parseFloat(rangeInput.max) || 100;
            const value = parseFloat(rangeInput.value);
            const percent = ((value - min) / (max - min)) * 100;
            rangeInput.style.setProperty('--progress-percent', `${percent}%`);
        };

        rangeInput.addEventListener('input', update);
        update(); // 초기 로드 시 한 번 실행하여 현재 값으로 프로그레스 바를 채웁니다.
    };
    setupRangeInput('input-room-limit', 'display-limit');
    setupRangeInput('input-room-attempts', 'display-attempts');

    // [신규] 순위 결정 방식 토글 버튼 이벤트
    document.querySelectorAll('#group-rank-type button').forEach(btn => {
        btn.onclick = () => {
            // 먼저 모든 버튼에서 active 클래스 제거
            document.querySelectorAll('#group-rank-type button').forEach(b => b.classList.remove('active'));
            // 클릭된 버튼에만 active 클래스 추가
            btn.classList.add('active');
        };
    });

    // 키보드 점프 (누르는 시간에 따라 높이 조절)
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && gameState === STATE.PLAYING) {
            e.preventDefault(); 
            if (!isJumpPressed) { // [신규] 처음 눌렀을 때만 실행
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

    // [개발용] 콘솔에서 초기화 함수를 쉽게 호출할 수 있도록 window 객체에 할당
    window.resetAdCount = resetAdCount;
    window.resetRoomData = resetRoomData;
});