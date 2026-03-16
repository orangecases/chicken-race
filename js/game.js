/**
 * 📢 치킨 런 - 최종 통합 및 UI 연출/싱글모드 로직 수정 버전
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
let unsubscribeMyRoomsListeners = []; // [신규] '내 방' 목록 실시간 리스너 해제 함수 배열
let lastJoinedRoomIdsJSON = ''; // [신규] 참가중인 방 목록 변경 감지용 변수

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
    // { id: 1, title: "이 구역의 미친 닭 모여라!", limit: 5, current: 3, attempts: 3, status: "inprogress", rankType: 'total' },
    // { id: 2, title: "초보만 오세요 제발", limit: 5, current: 1, attempts: 5, status: "inprogress", rankType: 'best' },
    // { id: 3, title: "비밀의 방 (비번:1234)", limit: 5, current: 0, attempts: 3, status: "inprogress", isLocked: true, password: "1234", rankType: 'best' },
    // { id: 4, title: "딱 한 자리 남음! (합산)", limit: 10, current: 9, attempts: 2, status: "inprogress", rankType: 'total' },
    // { id: 5, title: "최고점 한판 승부", limit: 4, current: 1, attempts: 1, status: "inprogress", rankType: 'best' },
    // { id: 6, title: "장기전: 끈기있는 닭들의 대결", limit: 8, current: 2, attempts: 5, status: "inprogress", rankType: 'total' },
    // { id: 7, title: "완전히 종료된 방 (테스트용)", limit: 5, current: 5, attempts: 3, status: "finished", rankType: 'best' }
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
        let validScore = score;
        if (isNaN(validScore)) validScore = 0;

        // [FIX] 랭킹 표시용 점수(displayScore) 계산
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
        }

        // [리팩토링] 최종 점수 업데이트 로직을 if/else 블록 밖으로 이동하여 중복을 제거합니다.
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

    renderRoomLists(); // 목록 갱신
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
    // [FIX] playing 뿐만 아니라 crashed 상태에서도 점수 동기화
    if (myPlayer && (gameState === STATE.PLAYING || gameState === STATE.CRASHED)) {
        myPlayer.score = score;
    }

    // 3. Firestore 업데이트 (쓰로틀링 적용)
    if (now - lastFirestoreUpdateTime > FIRESTORE_UPDATE_INTERVAL) {
        lastFirestoreUpdateTime = now;
        const batch = db.batch();

        // 3a. 내 정보 업데이트 (내가 플레이 중일 때만)
        if (myPlayer && (myPlayer.status === 'playing' || myPlayer.status === 'waiting')) {
            const myDocRef = participantsRef.doc(myId);

            const currentRunScore = (typeof score === 'number' && !isNaN(score)) ? score : 0;

            const displayScore = (currentRoom.rankType === 'total')
                ? (myPlayer.totalScore || 0) + currentRunScore
                : Math.max((myPlayer.bestScore || 0), currentRunScore);

            if (!isNaN(displayScore)) {
                batch.update(myDocRef, {
                    displayScore: Math.floor(displayScore)
                });
            }
        }

        // 3b. 봇 정보 업데이트 (방장 또는 관리자 수행)
        if (isHost || isAdmin) {
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
            if (gameSpeed < baseGameSpeed + 5) gameSpeed += 0.2; // [수정] 부스트 가속도 및 최대 속도 감소
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
                if (currentGameMode === 'multi' && currentRoom && currentUser) {
                    const myId = currentUser.id;
                    const myPlayer = multiGamePlayers.find(p => p.id === myId);
                    if (myPlayer) {
                        if (currentRoom.rankType === 'total') {
                            if (isNaN(score)) score = 0;
                            myPlayer.totalScore = (myPlayer.totalScore || 0) + score;
                        } else {
                            myPlayer.bestScore = Math.max((myPlayer.bestScore || 0), score);
                        }
                        myPlayer.score = 0; // 현재 판 점수 초기화
                    }
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
 */
async function saveMyScore(newScore) {
    if (newScore <= 0) return;

    // [수정] 로그인한 유저만 서버에 기록을 저장합니다.
    if (!currentUser) {
        console.log("게스트 유저는 '내 기록'이 서버에 저장되지 않습니다.");
        // 게스트 기록은 저장하지 않음으로써 서버 저장 방식으로 통일합니다.
        return;
    }

    const scoreEntry = {
        score: newScore,
        date: new Date().toISOString()
    };

    // [수정] Firestore에서 가져온 유저 데이터의 myScores를 사용합니다.
    const userScores = currentUser.myScores || [];
    userScores.push(scoreEntry);
    userScores.sort((a, b) => b.score - a.score);

    const MAX_SCORES = 50; // 최대 50개 기록 저장
    if (userScores.length > MAX_SCORES) {
        userScores.length = MAX_SCORES;
    }

    const newBestScore = userScores.length > 0 ? userScores[0].score : 0;

    // 로컬 currentUser 객체 업데이트 (UI 즉시 반영용)
    currentUser.myScores = userScores;
    currentUser.bestScore = newBestScore;

    // UI 갱신을 위해 전역 변수에도 동기화
    myScores = currentUser.myScores;
    bestScore = currentUser.bestScore;
    renderMyRecordList();

    // [수정] Firestore에 변경된 myScores와 bestScore를 업데이트합니다.
    try {
        const userRef = db.collection("users").doc(currentUser.id);
        await userRef.update({
            myScores: userScores,
            bestScore: newBestScore
        });
        console.log("✅ '내 기록'이 서버에 성공적으로 업데이트되었습니다.");
    } catch (error) {
        console.error("❌ '내 기록' 서버 업데이트 실패:", error);
    }
}

/**
 * [신규] '내 기록' 탭의 목록을 그립니다.
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
 * [신규] Cloud Function을 호출하여 여러 사용자의 닉네임을 안전하게 가져옵니다.
 * @param {string[]} uids - 닉네임을 조회할 사용자 UID 배열
 * @returns {Promise<Object>} UID를 키로, 닉네임을 값으로 하는 객체
 */
async function fetchNicknames(uids) {
    if (uids.length === 0) {
        return {};
    }
    try {
        // 'getNicknames'는 위에서 생성한 Cloud Function의 이름입니다.
        const getNicknamesFunction = firebase.functions().httpsCallable('getNicknames');
        const result = await getNicknamesFunction({ uids: uids });
        return result.data; // { uid1: 'nickname1', uid2: 'nickname2', ... }
    } catch (error) {
        console.error("❌ 닉네임 가져오기 함수 호출 실패:", error);
        // 함수 호출에 실패하더라도 앱이 중단되지 않도록 빈 객체를 반환합니다.
        return {};
    }
}

/**
 * [신규] 서버 랭킹 데이터를 화면에 표시
 */
async function displayRankings(rankData) {
    const uids = rankData.filter(data => data.uid).map(data => data.uid);
    const uniqueUids = [...new Set(uids)];

    // [수정] 클라이언트에서 직접 DB를 읽는 대신, Cloud Function을 호출합니다.
    const nicknameMap = await fetchNicknames(uniqueUids);

    top100Scores = rankData.map((data, index) => ({
        rank: index + 1,
        score: data.score,
        // [수정] 반환된 맵을 사용하여 닉네임을 설정합니다.
        name: (data.uid && nicknameMap[data.uid]) || data.nickname
    }));
    renderTop100List();
}

async function loadLeaderboard() {
    try {
        const querySnapshot = await db.collection("rankings")
            .orderBy("score", "desc")
            .limit(10)
            .get();

        console.log("🏆 랭킹 데이터를 가져왔습니다:");
        const rankData = [];
        querySnapshot.forEach((doc) => {
            rankData.push(doc.data());
        });
        await displayRankings(rankData);
    } catch (error) {
        console.error("❌ 랭킹 불러오기 실패:", error);
    }
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
        createdAt: roomData.createdAt 
    };
}

let roomFetchPromise = null; 

function fetchRaceRooms(loadMore = false) {
    if (roomFetchPromise && !loadMore) return roomFetchPromise;

    let resolvePromise;
    roomFetchPromise = new Promise((resolve, reject) => {
        resolvePromise = resolve; // Promise 종료를 나중에 제어하기 위해 저장
        
        if (loadMore) {
            currentRoomLimit += ROOMS_PER_PAGE;
        } else {
            currentRoomLimit = ROOMS_PER_PAGE;
        }

        const loader = document.getElementById('race-room-loader');
        if (loader) loader.classList.remove('hidden');

        if (unsubscribeRoomListener) {
            unsubscribeRoomListener();
            unsubscribeRoomListener = null;
        }

        let isFirstCallback = true;

        unsubscribeRoomListener = db.collection('rooms')
            .orderBy('createdAt', 'desc')
            // 💡 팁: 마감된 방이 필터링되면서 목록이 너무 적게 뜨는 것을 방지하기 위해 
            // DB에서 여유 있게(+10) 가져오도록 수정했습니다.
            .limit(currentRoomLimit + 10) 
            .onSnapshot((querySnapshot) => {
                
                if (querySnapshot.metadata.fromCache) {
                    console.log("⏳ 캐시 데이터 무시, 서버 응답 대기 중...");
                    return; 
                }

                if (isFirstCallback) {
                    const newRooms = [];
                    querySnapshot.forEach(doc => {
                        const roomData = mapFirestoreDocToRoom(doc);
                        
                        // 🚨 핵심 기획 반영: 
                        // 처음 불러올 때 '아직 인원이 덜 찼고, 종료되지 않은 방'만 배열에 담습니다.
                        if (roomData.current < roomData.limit && roomData.status !== 'finished') {
                            newRooms.push(roomData);
                        }
                    });
                    
                    raceRooms = newRooms; // 필터링된 깔끔한 데이터로 화면 갱신
                    
                    isFirstCallback = false; // 이제부터는 실시간 '레이아웃 안정' 모드로 전환

                    if (querySnapshot.docs.length <= currentRoomLimit) {
                        allRoomsLoaded = true;
                        if (loader) loader.classList.add('hidden');
                    } else {
                        allRoomsLoaded = false;
                        if (loader) loader.classList.remove('hidden');
                    }

                    if (resolvePromise) {
                        resolvePromise();
                        resolvePromise = null;
                    }

                } else {
                    // 화면에 머무는 동안의 실시간 동기화 (Laila님 의도대로 작동하는 마법의 구간)
                    querySnapshot.docChanges().forEach((change) => {
                        const roomData = mapFirestoreDocToRoom(change.doc);
                        const index = raceRooms.findIndex(r => r.id === roomData.id);

                        if (change.type === 'modified') {
                            // 1. 이미 배열에 있는 방이 마감됨 -> index가 있으므로 정보가 덮어씌워지고 '마감' 표시로 변경됨
                            // 2. 마감돼서 배열에 없던 방에 빈자리가 생김 -> index가 없으므로 무시됨 (새로고침 전까지 안 보임)
                            if (index > -1) Object.assign(raceRooms[index], roomData);
                        } else if (change.type === 'removed') {
                            if (index > -1) raceRooms[index].current = 0;
                        }
                    });
                }

                renderRaceRoomList();
                updateLoadMoreButtons();

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
 */
async function fetchMyRooms() {
    if (!isLoggedIn || !currentUser || !currentUser.joinedRooms) {
        myRooms = [];
        renderMyRoomList();
        updateLoadMoreButtons();
        return;
    }
    const roomIds = Object.keys(currentUser.joinedRooms).sort(); 
    if (roomIds.length === 0) {
        myRooms = [];
        renderMyRoomList();
        updateLoadMoreButtons();
        return;
    }

    const currentJoinedRoomIdsJSON = JSON.stringify(roomIds);
    if (unsubscribeMyRoomsListeners.length > 0 && lastJoinedRoomIdsJSON === currentJoinedRoomIdsJSON) {
        renderMyRoomList();
        updateLoadMoreButtons();
        return;
    }
    lastJoinedRoomIdsJSON = currentJoinedRoomIdsJSON;

    unsubscribeMyRoomsListeners.forEach(unsub => unsub());
    unsubscribeMyRoomsListeners = [];

    myRooms = [];
    const targetIds = roomIds.slice(0, currentMyRoomLimit);

    targetIds.forEach(roomId => {
        const unsub = db.collection('rooms').doc(roomId)
            .onSnapshot(doc => {
                const index = myRooms.findIndex(r => r.id === roomId);

                if (doc.exists) {
                    const roomData = mapFirestoreDocToRoom(doc);
                    if (index > -1) {
                        Object.assign(myRooms[index], roomData);
                    } else {
                        myRooms.push(roomData);
                    }
                } else {
                    if (index > -1) {
                        myRooms.splice(index, 1);
                    }
                }
                myRooms.sort((a, b) => {
                    const timeA = a.createdAt?.toMillis() || 0;
                    const timeB = b.createdAt?.toMillis() || 0;
                    return timeB - timeA;
                });
                renderRoomLists(); 
            }, error => {
                console.error(`❌ 내 방 [${roomId}] 실시간 수신 오류:`, error);
            });

        unsubscribeMyRoomsListeners.push(unsub);
    });
}

/**
 * [신규] 사용자 정보 모달을 열고 데이터를 채웁니다.
 */
function showUserProfile() {
    if (!currentUser) {
        document.getElementById('scene-auth').classList.remove('hidden');
        return;
    }

    const scene = document.getElementById('scene-user-profile');
    if (!scene) return;

    document.getElementById('profile-id').value = currentUser.email || currentUser.id;
    document.getElementById('profile-nickname').value = currentUser.nickname || '';
    document.getElementById('badge-count-1').innerText = (currentUser.badges && currentUser.badges['1']) || 0;
    document.getElementById('badge-count-2').innerText = (currentUser.badges && currentUser.badges['2']) || 0;
    document.getElementById('badge-count-3').innerText = (currentUser.badges && currentUser.badges['3']) || 0;

    updateCoinUI();

    scene.classList.remove('hidden');
}

/**
 * [신규] 게임을 일시정지하거나 이어합니다.
 */
function togglePause() {
    if (gameState === STATE.GAMEOVER || gameState === STATE.CRASHED) return;

    const scenePauseMenu = document.getElementById('game-pause-screen');
    const btnPauseToggle = document.getElementById('btn-pause-toggle');

    if (gameState === STATE.PAUSED) {
        clearAutoActionTimer();
        if (currentGameMode === 'multi') {
            const myId = currentUser ? currentUser.id : 'me';
            const myPlayer = multiGamePlayers.find(p => p.id === myId);
            if (myPlayer) myPlayer.status = 'playing';
        }
        gameState = STATE.PLAYING;
        scenePauseMenu.classList.add('hidden');
        btnPauseToggle.classList.remove('paused');
        gameLoopId = requestAnimationFrame(gameLoop); 
    } else {
        pauseBGM();
        if (currentGameMode === 'multi') {
            const myId = currentUser ? currentUser.id : 'me';
            const myPlayer = multiGamePlayers.find(p => p.id === myId);
            if (myPlayer) myPlayer.status = 'paused';
        }
        gameState = STATE.PAUSED;
        cancelAnimationFrame(gameLoopId); 
        scenePauseMenu.classList.remove('hidden');
        btnPauseToggle.classList.add('paused');

        if (currentGameMode === 'multi') {
            startAutoActionTimer(30, 'start', '#game-pause-screen .time-message');
        }
    }
}

/**
 * [신규] 싱글 플레이 시작/재시작 시 코인을 차감합니다.
 * @returns {boolean} 코인 차감에 성공하여 게임을 시작할 수 있으면 true, 아니면 false.
 */
function handleSinglePlayerStartCost() {
    if (currentGameMode !== 'single') return true; // 싱글 모드가 아니면 항상 통과

    // 게스트 코인 충전
    if (!currentUser && guestCoins < 1) {
        alert("게스트 코인이 모두 소진되어 10코인을 새로 충전해 드립니다! 다시 신나게 달려보세요.");
        guestCoins = 10;
        localStorage.setItem('chickenRunGuestCoins', guestCoins);
        updateCoinUI();
    }

    const cost = 1;
    const currentCoins = currentUser ? currentUser.coins : guestCoins;

    // 코인 부족 확인
    if (currentCoins < cost) {
        alert("코인이 부족하여 게임을 시작할 수 없습니다.");
        return false;
    }
    
    // 코인 차감
    if (currentUser) {
        currentUser.coins -= cost;
        syncCoinsToServer(currentUser.coins);
    } else {
        guestCoins -= cost;
        localStorage.setItem('chickenRunGuestCoins', guestCoins);
    }
    updateCoinUI();
    return true;
}

/**
 * [신규] 게임 플레이를 시작하는 핵심 로직 (애니메이션 및 상태 변경)
 */
function executeGameStart() {
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    
    // 멀티플레이 시, 내 상태를 'playing'으로 변경하고 서버에 알림
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
    gameState = STATE.PLAYING; 
    gameLoop();
}

/**
 * [신규] 서버에서 사용자를 방에서 퇴장시키는 백엔드 로직.
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

            awardBadgeIfEligible();

            // 🚨 [신규 추가] 내가 포기함(dead)으로써 방의 모든 인원이 dead 상태가 되었는지 즉시 확인합니다.
            const participantsSnapshot = await roomRef.collection('participants').get();
            let allDead = true;
            participantsSnapshot.forEach(doc => {
                const pData = doc.data();
                // 내 상태는 방금 dead로 업데이트 했으므로 dead로 간주, 나머지는 실제 DB 상태 확인
                if (pData.id !== myId && pData.status !== 'dead') {
                    allDead = false;
                }
            });

            const isRoomFull = roomData.currentPlayers >= roomData.maxPlayers;
            
            // 모든 조건이 충족되었다면 방을 즉시 'finished' 처리합니다.
            if (isRoomFull && allDead && roomData.status !== 'finished') {
                await roomRef.update({ status: 'finished' });
                console.log(`✅ 방 [${roomId}] 상태를 'finished'로 최종 변경했습니다 (Home버튼 퇴장).`);
            }
        }
    } catch (error) {
        console.error(`❌ Server exit from room [${roomId}] failed:`, error);
    }
}

/**
 * [신규] 게임을 종료하고 로비(인트로) 화면으로 돌아갑니다.
 */
async function exitToLobby(isFullExit = false) { 
    sessionStorage.removeItem('activeRoomId');

    if (unsubscribeParticipantsListener) {
        unsubscribeParticipantsListener();
        unsubscribeParticipantsListener = null;
        console.log("🎧 Participants listener detached.");
    }

    stopBGM();
    if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }

    if (currentGameMode === 'multi' && currentRoom && currentUser) {
        await performServerExit(currentRoom.id, isFullExit);
    }

    multiGamePlayers = [];
    clearAutoActionTimer();
    currentRoom = null; 

    updateCoinUI();

    // [수정] 로비로 돌아올 때, 항상 최신 방 목록을 가져오도록 강제합니다.
    // 캐시된 Promise를 초기화하여 fetchRaceRooms가 항상 서버에서 새 데이터를 가져오게 합니다.
    roomFetchPromise = null;
    fetchRaceRooms(false);
    fetchMyRooms();

    document.getElementById('scene-intro').classList.remove('hidden');
    document.getElementById('scene-game').classList.add('hidden');
    document.getElementById('btn-pause-toggle').classList.remove('paused');
}

/**
 * [신규] 멀티플레이 방 참가를 시도하는 통합 함수.
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

    if (hasJoined) {
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

    const cost = room.attempts;
    if (currentUser.coins < cost) {
        alert(`코인이 부족합니다. (필요: ${cost}, 보유: ${currentUser.coins})`);
        return;
    }

    const roomRef = db.collection('rooms').doc(room.id);
    try {
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) { throw "레이스룸이 존재하지 않습니다."; }

            const serverRoomData = roomDoc.data();
            if (serverRoomData.currentPlayers >= serverRoomData.maxPlayers) { throw "방이 가득 찼습니다."; }

            const updates = { currentPlayers: firebase.firestore.FieldValue.increment(1) };
            if (serverRoomData.status === 'finished') {
                updates.status = 'inprogress';
            }
            transaction.update(roomRef, updates);

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

        room.current++;

        if (currentUser.joinedRooms) {
            const unstartedJoinedRoomIds = Object.keys(currentUser.joinedRooms).filter(id => {
                const roomState = currentUser.joinedRooms[id];
                return roomState && roomState.usedAttempts === 0 && id !== room.id;
            });
            unstartedJoinedRoomIds.forEach(idToLeave => {
                const roomToLeave = raceRooms.find(r => r.id === idToLeave);
                const roomState = currentUser.joinedRooms[idToLeave];
                if (roomToLeave && roomState && roomState.isPaid) { currentUser.coins += roomToLeave.attempts; }
                delete currentUser.joinedRooms[idToLeave];
            });
        }
        const newJoinedRoomData = { usedAttempts: 0, isPaid: false };
        currentUser.joinedRooms[room.id] = newJoinedRoomData;

        await db.collection("users").doc(currentUser.id).update({
            [`joinedRooms.${room.id}`]: newJoinedRoomData
        });

        enterGameScene('multi', room);
    } catch (error) {
        console.error("❌ 방 입장 실패:", error);
        alert(String(error)); 
        renderRoomLists(); 
    }
}

/**
 * [신규] 멀티플레이 랭킹 목록을 렌더링합니다.
 */
async function renderMultiRanking() {
    const listEl = document.getElementById('multi-score-list');
    if (!listEl || !currentRoom) return;

    // [수정] 닉네임 조회를 위해 봇이 아닌 플레이어 ID 목록을 추출합니다.
    const playerIds = multiGamePlayers.filter(p => !p.isBot && p.id).map(p => p.id);
    const uniquePlayerIds = [...new Set(playerIds)];

    // [수정] Cloud Function을 호출하여 최신 닉네임 맵을 가져옵니다.
    const nicknameMap = await fetchNicknames(uniquePlayerIds);

    // [수정] 가져온 최신 닉네임으로 플레이어 목록을 업데이트합니다.
    const playersWithUpdatedNames = multiGamePlayers.map(p => {
        if (!p.isBot && nicknameMap[p.id]) {
            return { ...p, name: nicknameMap[p.id] };
        }
        return p;
    });

    const isTotalMode = currentRoom.rankType === 'total';
    const myId = currentUser ? currentUser.id : 'me';

    const sortedPlayers = [...playersWithUpdatedNames].sort((a, b) => {
        const scoreA = a.id === myId ? calculateMyLocalDisplayScore() : (a.displayScore || 0);
        const scoreB = b.id === myId ? calculateMyLocalDisplayScore() : (b.displayScore || 0);
        return scoreB - scoreA;
    });

    const isAllFinished = playersWithUpdatedNames.every(p => p.status === 'dead');

    listEl.innerHTML = '';
    sortedPlayers.forEach((p, index) => {
        const rank = index + 1;
        const li = document.createElement('li');

        const isHost = currentRoom.creatorUid && p.id === currentRoom.creatorUid;
        const hostIndicatorText = isHost ? `(방장)` : '';
        const hostIconHtml = isHost ? `<img class="master-key-icon" src="assets/images/icon_masterkey.png">` : '';

        let charClass = 'character';
        let charImg = 'assets/images/chicken_back.png'; 

        if (p.status === 'playing') {
            charClass += ' active';
            charImg = 'assets/images/chickenRun.gif';
        } else if (p.status === 'dead') {
            charClass += ' dead';
            charImg = isAllFinished ? 'assets/images/chicken_front.png' : 'assets/images/chicken_dead.png';
        }

        if (p.id === myId) {
            charClass += ' me';
        }

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

        let botControlButtonsHTML = '';
        if (currentUser && currentUser.isAdmin && p.isBot) { 
            // 🚨 봇이 이미 삭제(hidden) 처리되었다면 투명도 0.3 적용 및 클릭 방지
            const deleteBtnStyle = p.hidden ? 'opacity: 0.3; pointer-events: none; cursor: default;' : '';
            // (선택) 텍스트도 '삭제됨'으로 바꾸면 더 직관적이야! 원치 않으면 '목록삭제'로 유지해도 무방해.
            const deleteBtnText = p.hidden ? '삭제됨' : '목록삭제'; 

            botControlButtonsHTML = `
                <div>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-start">게임실행</button>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-end">게임종료</button>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-delete" style="${deleteBtnStyle}">${deleteBtnText}</button>
                </div>
            `;
        }

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
 */
function calculateMyLocalDisplayScore() {
    if (!currentUser || !currentRoom) return 0;

    const myId = currentUser.id;
    const myPlayer = multiGamePlayers.find(p => p.id === myId);
    if (!myPlayer) return 0;

    const currentRunScore = (gameState === STATE.PLAYING || STATE.CRASHED) ? score : 0;

    let displayScore = 0;
    if (currentRoom.rankType === 'total') {
        displayScore = (myPlayer.totalScore || 0) + currentRunScore;
    } else {
        displayScore = Math.max((myPlayer.bestScore || 0), currentRunScore);
    }
    return displayScore;
}

/**
 * [신규] 더보기 버튼 상태 업데이트 (누락된 함수 복원)
 */
function updateLoadMoreButtons() {
    const loader = document.getElementById('race-room-loader');
    const myLoader = document.getElementById('my-room-loader');
    const tabRaceRoom = document.getElementById('tab-race-room');
    const isRaceTabActive = tabRaceRoom && tabRaceRoom.classList.contains('active');

    if (isRaceTabActive) {
        if (loader) {
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

/**
 * [신규] 통합 렌더링 호출용 래퍼 함수 (누락된 함수 복원)
 */
function renderRoomLists() {
    renderRaceRoomList();
    renderMyRoomList();
    updateLoadMoreButtons();
}


/**
 * [리팩토링] 레이스룸 목록만 렌더링하는 함수
 */
function renderRaceRoomList() {
    const raceRoomList = document.querySelector('#content-race-room .score-list');
    if (!raceRoomList) return;
    raceRoomList.innerHTML = '';

    const allMyJoinedRoomIds = (isLoggedIn && currentUser && currentUser.joinedRooms) ? Object.keys(currentUser.joinedRooms) : [];

    const raceRoomsToRender = raceRooms
        .filter(r => r.current > 0 && !allMyJoinedRoomIds.includes(r.id))
        .slice(0, currentRoomLimit);

    raceRoomsToRender.forEach(room => {
        const userRoomState = (isLoggedIn && currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[room.id] : null;

        const rankTypeText = room.rankType === 'total' ? '합산점' : '최고점';
        const lockImg = room.isLocked ? `<img class="lock" src="assets/images/icon_lock.png">` : '';

        const debugButtonsHTML = (currentUser && currentUser.isAdmin)
            ? `<button class="debug-btn" data-room-id="${room.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${room.id}" data-action="remove">-</button>`
            : '';
        const raceLi = document.createElement('li');

        if (userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0)) {
            raceLi.classList.add('already-joined');
        }

        const isFull = room.current >= room.limit;
        const statusClass = isFull ? 'finished' : 'inprogress';
        const aggIcon = room.limit >= 4 ? '<img class="agg" src="assets/images/icon_agg.png">' : '';
        const statusText = isFull ? `${aggIcon}마감: ${room.current}/${room.limit}명` : `${aggIcon}모집: ${room.current}/${room.limit}명`;

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

        raceLi.onclick = (e) => {
            // [FIX] 이벤트 버블링 방지: 디버그 버튼 클릭 시 방 입장을 막습니다.
            if (e.target.closest('.debug-btn')) {
                return;
            }

            if (room.isLocked && !unlockedRoomIds.includes(room.id)) {
                showPasswordInput(room);
            } else {
                attemptToJoinRoom(room);
            }
        };
        raceRoomList.appendChild(raceLi);
    });

    if (raceRoomList.children.length === 0) {
        raceRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>참여 가능한 레이스룸이 없습니다.</p></div></li>';
    }
}

/**
 * [리팩토링] 참가중인 방 목록만 렌더링하는 함수
 */
function renderMyRoomList() {
    const myRoomList = document.querySelector('#content-my-rooms .score-list');
    if (!myRoomList) return;
    myRoomList.innerHTML = '';

    myRooms.forEach(room => {
        const userRoomState = (isLoggedIn && currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[room.id] : null;
        if (userRoomState && !userRoomState.hidden) {
            const rankTypeText = room.rankType === 'total' ? '합산점' : '최고점';
            const debugButtonsHTML = (currentUser && currentUser.isAdmin)
                ? `<button class="debug-btn" data-room-id="${room.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${room.id}" data-action="remove">-</button>`
                : '';

            const userUsedAttempts = userRoomState.usedAttempts;
            const isMyPlayFinished = userUsedAttempts >= room.attempts;
            const isRoomGloballyFinished = room.status === "finished";

            const myRoomStatusText = isRoomGloballyFinished ? "종료" : `진행중 (${room.current}/${room.limit}명)`;
            const myRoomStatusClass = isRoomGloballyFinished ? "finished" : "inprogress";

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
            myLi.onclick = (e) => {
                // [FIX] 이벤트 버블링 방지: 디버그 버튼 클릭 시 방 입장을 막습니다.
                if (e.target.closest('.debug-btn')) {
                    return;
                }

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

    if (!isLoggedIn) {
        myRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>로그인 후 이용 가능합니다.</p></div></li>';
    } else if (myRoomList.children.length === 0) {
        myRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>참가중인 레이스룸이 없습니다.</p></div></li>';
    }
}

async function enterGameScene(mode, roomData = null) { 
    if (!isGameReady) { alert("리소스 로딩 중!"); return; }

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

    if (mode === 'multi' && roomData) {
        sessionStorage.setItem('activeRoomId', roomData.id);
    } else if (mode === 'single') {
        sessionStorage.setItem('activeRoomId', 'single_player_mode');
    }

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

        const rankSpan = document.querySelector('#view-multi-rank .list-title span');
        if (rankSpan) {
            rankSpan.innerText = currentRoom.rankType === 'total' ? '(점수합산)' : '(최고점수)';
        }

        const listTitle = document.querySelector('#view-multi-rank .list-title');
        if (listTitle) {
            const oldButtons = listTitle.querySelector('.debug-btn-group');
            if (oldButtons) oldButtons.remove();

            if (currentUser && currentUser.isAdmin) { 
                const buttonGroup = document.createElement('div');
                buttonGroup.className = 'debug-btn-group';
                buttonGroup.style.marginLeft = 'auto'; 
                buttonGroup.innerHTML = `<button class="debug-btn" data-room-id="${currentRoom.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${currentRoom.id}" data-action="remove">-</button>`;
                listTitle.appendChild(buttonGroup);
            }
        }
    }

    // --- 멀티플레이어 모드 로직 ---
    if (mode === 'multi') {
        if (!gameLoopId) {
            gameLoop();
        }

        const myPlayerId = currentUser.id;
        const roomRef = db.collection('rooms').doc(currentRoom.id);
        const participantsRef = roomRef.collection('participants');

        try {
            const initialParticipantsSnapshot = await participantsRef.get();
            multiGamePlayers = initialParticipantsSnapshot.docs.map(doc => doc.data());

            if (unsubscribeParticipantsListener) unsubscribeParticipantsListener(); 
            unsubscribeParticipantsListener = participantsRef.onSnapshot((snapshot) => {
                multiGamePlayers = snapshot.docs.map(doc => doc.data());
                renderMultiRanking();
            }, (error) => {
                console.error("❌ Participants listener error:", error);
            });

        } catch (error) {
            console.error("❌ 참가자 목록 로딩 또는 리스너 설정 실패:", error);
            alert("방에 참가하는 중 오류가 발생했습니다. 로비로 돌아갑니다.");
            exitToLobby(false); 
            return;
        }

        const userRoomState = currentUser.joinedRooms[currentRoom.id];
        const userUsedAttempts = userRoomState ? userRoomState.usedAttempts : 0;
        const myPlayerInRoom = multiGamePlayers.find(p => p.id === myPlayerId); 

        const isMyGameOver = userUsedAttempts >= currentRoom.attempts;
        const isRoomFinished = currentRoom.status === 'finished';

        if (myPlayerInRoom && (isMyGameOver || isRoomFinished)) {
            if (myPlayerInRoom) myPlayerInRoom.status = 'dead';

            resetGame();
            gameState = STATE.GAMEOVER;
            gameSpeed = 0;
            drawStaticFrame();
            document.getElementById('game-over-screen').classList.remove('hidden');
            handleGameOverUI();
            renderMultiRanking();

            if (gameLoopId) cancelAnimationFrame(gameLoopId);
            gameLoop();

            return; 
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

        if (myPlayerInRoom && userUsedAttempts > 0) {
            myPlayerInRoom.status = 'waiting';
            drawStaticFrame();
            gameState = STATE.GAMEOVER; 
            document.getElementById('game-over-screen').classList.remove('hidden');
            handleGameOverUI();
            renderMultiRanking();
            return;
        }

        if (myPlayerInRoom) myPlayerInRoom.status = 'waiting';

        resetGame();
        setControlsVisibility(false);
        drawStaticFrame();
        document.getElementById('game-start-screen').classList.remove('hidden');
        startAutoActionTimer(15, 'exit', '#game-start-screen .time-message');
        renderMultiRanking(); 
    } else { 
        resetGame();
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
        msg.style.display = 'none'; 
    }
    if (scene) scene.classList.remove('hidden');
}

/**
 * [신규] 홈 버튼 클릭 시 처리 (상태에 따라 확인 팝업 또는 즉시 이동)
 */
function handleHomeButtonClick() {
    let isInProgress = false;

    if (gameState === STATE.PAUSED) {
        isInProgress = true;
    } else if (gameState === STATE.GAMEOVER) {
        if (currentGameMode === 'multi' && currentRoom) {
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
        const userRoomState = (currentUser && currentRoom) ? currentUser.joinedRooms[currentRoom.id] : null;
        const hasStartedPlaying = userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0);
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
        await db.collection('rooms').doc(roomId).delete();
        console.log(`✅ 방 [${roomId}]이(가) 서버에서 성공적으로 삭제(폭파)되었습니다.`);

        currentRoom = null;
        exitToLobby(false);
    } catch (error) {
        console.error(`❌ 방 [${roomId}] 삭제 실패:`, error);
        alert("방을 삭제하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
}

/**
 * [FIX] '참가중인 목록'에서 현재 방을 제거합니다. (DB에서 방을 삭제하지 않음)
 */
async function removeFromMyRooms() {
    if (!currentRoom || !currentRoom.id || !currentUser) {
        console.warn("목록에서 제거할 방 정보가 없습니다.");
        await exitToLobby(false);
        return;
    }

    const roomId = currentRoom.id;
    const myId = currentUser.id;
    const roomRef = db.collection('rooms').doc(roomId);
    const participantsRef = roomRef.collection('participants');

    try {
        // 1. 내 프로필의 joinedRooms에서 숨김 처리
        if (currentUser.joinedRooms[roomId]) {
            currentUser.joinedRooms[roomId].hidden = true; 
            await db.collection("users").doc(myId).update({
                [`joinedRooms.${roomId}.hidden`]: true 
            });
        }

        // 2. 방 안의 내 참가자(participant) 정보 숨김 처리
        await participantsRef.doc(myId).update({ hidden: true });
        console.log(`✅ 방 [${roomId}]을(를) '참가중인 목록'에서 숨겼습니다.`);

        // 3. 🚨 [신규] 나를 포함해 이 방의 '모든' 참가자가 숨김(hidden) 상태인지 확인
        const participantsSnapshot = await participantsRef.get();
        let allHidden = true;
        participantsSnapshot.forEach(doc => {
            if (!doc.data().hidden) {
                allHidden = false; // 한 명이라도 남아있으면 폭파 취소
            }
        });

        // 4. 모두가 목록에서 지웠다면, 방 자체를 서버에서 완전히 삭제(폭파)
        if (allHidden) {
            try {
                await roomRef.delete();
                console.log(`💣 모든 참가자가 나갔습니다. 방 [${roomId}] 완전 폭파 완료!`);
            } catch (deleteError) {
                console.warn(`⚠️ 방 삭제 권한이 없어 남겨둡니다 (관리자 청소 필요):`, deleteError);
            }
        }

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
    const today = new Date().toDateString(); 
    let data = JSON.parse(localStorage.getItem('chickenRunAdData')) || { date: today, count: 0 };

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
    let adTimerInterval = null; 
    if (!currentUser) {
        alert('로그인 후 이용해주세요.');
        return;
    }

    const adData = getAdData();
    if (adData.count >= AD_CONFIG.DAILY_LIMIT) {
        alert(`오늘의 광고 시청 횟수를 모두 소진했습니다.\n(매일 자정에 초기화됩니다.)`);
        return;
    }

    let adOverlay = document.getElementById('scene-ad-overlay');
    if (!adOverlay) {
        adOverlay = document.createElement('div');
        adOverlay.id = 'scene-ad-overlay';
        document.body.appendChild(adOverlay);
    } else {
        adOverlay.classList.remove('hidden');
    }

    adOverlay.innerHTML = `
        <div id="ad-view-loading" class="ad-view">
            <div class="ad-ui-container">
                <div class="ad-progress-bar-wrapper">
                    <div id="ad-progress-bar"></div>
                </div>
            </div>

            <button id="btn-ad-close-video">✕ Close</button>

            <p>광고 영상이 재생되는 중입니다...</p>
            <div class="spinner"></div>
        </div>

        <div id="ad-view-finished" class="ad-view" style="display:none;">
            <img src="assets/images/icon_coin.png" style="width:4rem; image-rendering: pixelated;">
            <p style="font-size: 1.5rem; color: #ffd02d; font-family: 'KoreanYNMYTM';">보상 획득!</p>
            <p style="font-size: 1rem;">+${AD_CONFIG.REWARD} 코인</p>
            <div style="width: 100%; display: flex; justify-content: center;">
                <button id="btn-ad-close" class="pixelbtn pixelbtn--primary">닫기</button>
            </div>
        </div>
    `;

    const progressBar = document.getElementById('ad-progress-bar');
    const btnCloseVideo = document.getElementById('btn-ad-close-video');

    btnCloseVideo.onclick = () => {
        clearInterval(adTimerInterval);
        adOverlay.classList.add('hidden');
        alert('광고를 건너뛰어 보상을 받지 못했습니다.');
    };

    const adStartTime = Date.now();
    adTimerInterval = setInterval(() => {
        const elapsedTime = Date.now() - adStartTime;
        const progress = Math.min(100, (elapsedTime / AD_CONFIG.DURATION) * 100);

        if (progressBar) progressBar.style.width = `${progress}%`;

        if (elapsedTime >= AD_CONFIG.DURATION) {
            clearInterval(adTimerInterval);

            if (btnCloseVideo) {
                btnCloseVideo.innerText = "시청완료 ❯❯";

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
    }, 50); 

    const btnCloseReward = document.getElementById('btn-ad-close');
    if (btnCloseReward) {
        btnCloseReward.onclick = () => {
            adOverlay.classList.add('hidden');
        };
    }
}

/**
 * [개발용] 광고 시청 횟수를 초기화합니다.
 */
function resetAdCount() {
    localStorage.removeItem('chickenRunAdData');
    console.log('광고 시청 횟수 데이터가 초기화되었습니다.');
    alert('광고 시청 횟수가 초기화되었습니다.');
    updateCoinUI();
}

/**
 * [개발용] 모든 방의 참가자 정보를 초기화하여 목록을 리셋합니다.
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
    provider.addScope('profile');
    provider.addScope('email');

    firebase.auth().signInWithPopup(provider).catch((error) => {
        console.error("❌ 로그인 팝업 실패:", error.message);
        if (error.code !== 'auth/popup-closed-by-user') {
            alert("로그인 중 오류가 발생했습니다: " + error.message);
        }
    });
}

/**
 * [신규] 서버에서 유저 데이터를 불러오거나, 신규 유저일 경우 생성합니다.
 */
async function loadUserData(user) {
    const userRef = db.collection("users").doc(user.uid);

    if (unsubscribeUserData) {
        unsubscribeUserData();
        unsubscribeUserData = null;
    }

    try {
        const providerInfo = user.providerData && user.providerData[0] ? user.providerData[0] : null;
        const extractedEmail = user.email || (providerInfo ? providerInfo.email : null);
        const extractedNickname = (providerInfo ? providerInfo.displayName : null) || user.displayName;
        let providerSuffix = "";
        if (providerInfo) {
            const providerId = providerInfo.providerId;
            if (providerId.includes('kakao')) providerSuffix = " (Kakao)";
            else if (providerId.includes('google')) providerSuffix = " (Google)";
            else if (providerId.includes('naver')) providerSuffix = " (Naver)";
        }
        const finalNickname = (extractedNickname || '이름없음') + providerSuffix;

        const initialUserData = {
            id: user.uid,
            email: extractedEmail,
            nickname: finalNickname,
            coins: 10,
            badges: { '1': 0, '2': 0, '3': 0 },
            joinedRooms: {}
        };

        const docSnap = await userRef.get();
        // [수정] 클라이언트에서 사용자 문서를 직접 생성하는 로직을 제거합니다.
        // 이제 모든 신규 사용자 문서 생성은 백엔드의 'createUserDocument' Cloud Function이 담당하여
        // 데이터 생성 로직을 일원화하고 안정성을 높입니다.
        let initialLoadComplete = false;
        unsubscribeUserData = userRef.onSnapshot((snapshot) => {
            if (!snapshot.exists) {
                console.error("FATAL: User document does not exist after set-merge.");
                return;
            }

            const userData = snapshot.data();
            const correctEmail = user.email || (providerInfo ? providerInfo.email : null);
            const isAdminUser = ADMIN_UIDS.includes(user.uid);

            currentUser = { ...currentUser, ...userData, email: correctEmail || userData.email, isAdmin: isAdminUser };

            // [신규] Firestore에서 불러온 데이터로 '내 기록' 관련 변수 초기화
            myScores = currentUser.myScores || [];
            bestScore = currentUser.bestScore || 0;
            renderMyRecordList(); // 기록을 불러온 후 목록 UI 갱신

            if (!initialLoadComplete) {
                initialLoadComplete = true;

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
                document.getElementById('scene-auth').classList.add('hidden');
                roomFetchPromise = null;
                fetchRaceRooms(false);
                fetchMyRooms();
            }

            updateCoinUI();
            fetchMyRooms();
            const sceneUserProfile = document.getElementById('scene-user-profile');
            if (sceneUserProfile && !sceneUserProfile.classList.contains('hidden')) {
                showUserProfile();
            }
        }, (error) => {
            console.error("❌ 유저 데이터 실시간 수신 실패:", error);
        });
    } catch (error) {
        console.error("❌ 유저 데이터 초기 로딩/생성 실패:", error);
        alert("유저 정보를 불러오는 중 오류가 발생했습니다.");
    }
}

/**
 * [신규] 카카오 OIDC 로그인 함수
 */
function loginWithKakao() {
    const provider = new firebase.auth.OAuthProvider('oidc.kakao');
    provider.addScope('profile_nickname');
    provider.addScope('account_email');

    firebase.auth().signInWithPopup(provider).catch((error) => {
        console.error("❌ 카카오 로그인 팝업 실패:", error.message);
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

    provider.addScope('email');
    provider.addScope('public_profile');

    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            console.log("✅ 페이스북 로그인 성공!");
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
    const clientId = "YNgZCcwBzPp11G9wKmHS";
    const redirectUri = encodeURIComponent("https://orangecases.github.io/chicken-race/");
    const state = Math.random().toString(36).substr(2, 11);
    const url = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;

    console.log("🚀 최종 전송 URL:", url);

    window.open(url, 'naverlogin', 'width=450,height=600');

    window.addEventListener('message', async (event) => {
        if (event.data.type === 'NAVER_LOGIN' && event.data.token) {
            const accessToken = event.data.token;

            console.log("🔑 네이버 Access Token 획득! 백엔드로 검증을 요청합니다...");
            console.log("🔑 프론트엔드가 낚아챈 토큰:", accessToken);

            try {
                const loginFunction = firebase.functions().httpsCallable('naverLogin');
                const result = await loginFunction({ accessToken: accessToken });
                const customToken = result.data.customToken;

                await firebase.auth().signInWithCustomToken(customToken);
                console.log("✅ 네이버 로그인(커스텀 토큰) 완벽 성공!");

            } catch (error) {
                console.error("❌ 백엔드 인증 처리 중 오류:", error);
                alert("네이버 로그인 처리 중 오류가 발생했습니다.");
            }
        }
    }, { once: true }); 
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
            await db.collection("users").doc(user.uid).set(currentUser, { merge: true });
            console.log("💾 유저 데이터 전체 저장 완료");
        } catch (error) {
            console.error("❌ 유저 데이터 전체 저장 실패:", error);
        }
    }
}

// [6. 이벤트 리스너]

document.addEventListener('DOMContentLoaded', () => {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            loadUserData(user);
        } else {
            if (unsubscribeUserData) {
                unsubscribeUserData();
                unsubscribeUserData = null;
            }
            isLoggedIn = false;
            currentUser = null;
            console.log("❓ 로그아웃 상태");

            // [신규] 로그아웃 시 '내 기록' 관련 변수 및 UI 초기화
            myScores = [];
            bestScore = 0;
            renderMyRecordList();

            updateCoinUI(); 
            roomFetchPromise = null; 
            fetchRaceRooms(false);
            fetchMyRooms(); 

            const sceneUserProfile = document.getElementById('scene-user-profile');
            if (sceneUserProfile) sceneUserProfile.classList.add('hidden');
        }
    });

    generateTop100Scores(); 
    // [수정] 로컬 스토리지에서 '내 기록'을 불러오는 로직을 제거합니다.
    // 이제 모든 기록은 onAuthStateChanged를 통해 Firestore에서 가져옵니다.
    renderMyRecordList(); // 초기에는 "기록 없음" 상태로 렌더링됩니다.
    renderTop100List();

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

    const handleDebugBotAction = async (e) => {
        if (!currentUser || !currentUser.isAdmin) return;

        const target = e.target.closest('.debug-btn');
        if (!target) return;

        if (!target.dataset.roomId) return;

        e.stopPropagation(); 
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
                        return; 
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
                        startDelay: 60 + Math.floor(Math.random() * 120), 
                        targetScore: 750 + Math.floor(Math.random() * 1500) 
                    };
                    transaction.set(participantsRef.doc(botId), botData);
                    const updates = { currentPlayers: firebase.firestore.FieldValue.increment(1) };
                    if (roomData.status === 'finished') {
                        updates.status = 'inprogress';
                    }
                    transaction.update(roomRef, updates);
                });
            } else if (action === 'remove') {
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

                    transaction.delete(botToRemoveRef);

                    const newPlayerCount = roomData.currentPlayers - 1;
                    if (newPlayerCount <= 0) {
                        transaction.delete(roomRef);
                    } else {
                        const updates = { currentPlayers: firebase.firestore.FieldValue.increment(-1) };
                        if (roomData.status === 'finished') {
                            updates.status = 'inprogress';
                        }
                        transaction.update(roomRef, updates);
                    }
                });
            }

            console.log(`[Debug] 방 [${roomId}]의 참가자 정보를 성공적으로 수정했습니다.`);

            const isInGame = !document.getElementById('scene-game').classList.contains('hidden');
            if (!isInGame) {
                fetchRaceRooms(false);
                fetchMyRooms();
            }
        } catch (error) {
            console.error("❌ 디버그 인원 수정 실패:", error);
        }
    };
    // [리팩토링] 여러 곳에 분산된 디버그 버튼 리스너를 상위 컨테이너(#app-container) 하나로 통합하여 코드 중복을 줄이고 관리를 용이하게 합니다.
    document.getElementById('app-container').addEventListener('click', handleDebugBotAction);
    const handleBotControlAction = async (e) => {
        const target = e.target.closest('.debug-btn[data-bot-id]');
        if (!target || !currentRoom) return;

        e.stopPropagation(); 

        const botId = target.dataset.botId;
        const action = target.dataset.action;
        const participantRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(botId);

        try {
            switch (action) {
                case 'force-start':
                    console.log(`[Debug] Bot [${botId}] 강제 시작`);
                    const roomRefForStart = db.collection('rooms').doc(currentRoom.id);
                    await db.runTransaction(async (transaction) => {
                        const roomDoc = await transaction.get(roomRefForStart);
                        if (!roomDoc.exists) return;

                        transaction.update(participantRef, { status: 'playing' });

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
                    console.log(`[Debug] Bot [${botId}] '목록에서 삭제' 시뮬레이션`);
                    
                    try {
                        // 1. 해당 봇의 상태만 hidden으로 업데이트 (데이터는 유지)
                        await participantRef.update({ hidden: true });
                        console.log(`✅ 봇 [${botId}]이(가) '목록 삭제'를 선언했습니다.`);

                        // 2. 방 안의 모든 참가자(유저+봇)의 hidden 상태 확인
                        const roomRefForDelete = db.collection('rooms').doc(currentRoom.id);
                        const participantsSnapshot = await roomRefForDelete.collection('participants').get();
                        
                        let allHidden = true;
                        participantsSnapshot.forEach(doc => {
                            if (!doc.data().hidden) {
                                allHidden = false; // 한 명이라도 기록을 보고 있다면 폭파 취소
                            }
                        });

                        // 3. 만약 모든 참가자가 목록 삭제를 선언했다면 방 완전 폭파!
                        if (allHidden) {
                            console.log(`💣 모든 참가자가 삭제 선언을 했습니다. 방 [${currentRoom.id}]을(를) 완전 삭제합니다.`);
                            await roomRefForDelete.delete();
                            
                            // 관리자 본인도 방이 폭파되었으므로 로비로 이동
                            exitToLobby(false);
                        }
                    } catch (err) {
                        console.error("❌ 봇 삭제 시뮬레이션 오류:", err);
                    }
                    break;
            }
        } catch (error) {
            console.error(`[Debug] 봇 컨트롤 실패 (Action: ${action}):`, error);
        }
    };
    document.getElementById('multi-score-list').addEventListener('click', handleBotControlAction);

    const myRecordScrollArea = document.querySelector('#content-my-record .list-scroll-area');
    if (myRecordScrollArea) {
        myRecordScrollArea.onscroll = () => {
            if (myRecordScrollArea.scrollTop + myRecordScrollArea.clientHeight >= myRecordScrollArea.scrollHeight - 50) {
                if (displayedMyRecordsCount < myScores.length && displayedMyRecordsCount < 100) {
                    displayedMyRecordsCount += 20;
                    renderMyRecordList(true); 
                }
            }
        };
    }
    updateCoinUI(); 

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
    const btnExitFromStart = document.getElementById('btn-exit-from-start'); 
    const btnExitFromPause = document.getElementById('btn-exit-from-pause'); 
    const btnExitFromGameover = document.getElementById('btn-exit-from-gameover'); 
    const btnDeleteRoom = document.getElementById('btn-delete-room'); 
    const btnPauseToggle = document.getElementById('btn-pause-toggle');
    const btnResumeGame = document.getElementById('btn-resume-game');

    const rankTypeGroup = document.getElementById('group-rank-type');
    if (rankTypeGroup) {
        rankTypeGroup.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                rankTypeGroup.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
            }
        });
    }

    const inputAttempts = document.getElementById('input-room-attempts');
    const displayAttempts = document.getElementById('display-attempts');
    const displayCost = document.getElementById('display-cost');
    if (inputAttempts && displayAttempts && displayCost) {
        const updateCost = () => {
            const attempts = inputAttempts.value;
            displayAttempts.innerText = attempts;
            displayCost.innerText = attempts;
        };
        inputAttempts.addEventListener('input', updateCost);
        updateCost();
    }

    const inputLimit = document.getElementById('input-room-limit');
    const displayLimit = document.getElementById('display-limit');
    if (inputLimit && displayLimit) {
        const updateLimit = () => {
            displayLimit.innerText = inputLimit.value;
        };
        inputLimit.addEventListener('input', updateLimit);
        updateLimit();
    }
    
    const rangeInputs = document.querySelectorAll('.modal-theme-orange input[type="range"]');
    rangeInputs.forEach(range => {
        const updateRangeProgress = () => {
            const value = (range.value - range.min) / (range.max - range.min) * 100;
            range.style.setProperty('--progress-percent', `${value}%`);
        };
        range.addEventListener('input', updateRangeProgress);
        updateRangeProgress();
    });

    const btnJump = document.getElementById('btn-jump');
    const btnBoost = document.getElementById('btn-boost');

    if (btnJump) {
        const handleJumpStart = (e) => { e.preventDefault(); isJumpPressed = true; btnJump.classList.add('pressed'); };
        const handleJumpEnd = (e) => { e.preventDefault(); isJumpPressed = false; chicken.cutJump(); btnJump.classList.remove('pressed'); };
        btnJump.addEventListener('mousedown', handleJumpStart);
        btnJump.addEventListener('mouseup', handleJumpEnd);
        btnJump.addEventListener('mouseleave', handleJumpEnd);
        btnJump.addEventListener('touchstart', handleJumpStart, { passive: false });
        btnJump.addEventListener('touchend', handleJumpEnd);
    }

    if (btnBoost) {
        const handleBoostStart = (e) => { e.preventDefault(); chicken.isBoosting = true; btnBoost.classList.add('pressed'); };
        const handleBoostEnd = (e) => { e.preventDefault(); chicken.isBoosting = false; btnBoost.classList.remove('pressed'); };
        btnBoost.addEventListener('mousedown', handleBoostStart);
        btnBoost.addEventListener('mouseup', handleBoostEnd);
        btnBoost.addEventListener('mouseleave', handleBoostEnd);
        btnBoost.addEventListener('touchstart', handleBoostStart, { passive: false });
        btnBoost.addEventListener('touchend', handleBoostEnd);
    }

    // [신규] PC 환경 스페이스바 점프 이벤트 추가
    window.addEventListener('keydown', (e) => {
        // 입력창(비밀번호, 닉네임, 방제 등)에 포커스가 있을 때는 스페이스바 점프 방지
        const targetTag = e.target.tagName.toLowerCase();
        if (targetTag === 'input' || targetTag === 'textarea') return;

        if (e.code === 'Space') {
            e.preventDefault(); // 스페이스바로 인한 화면 스크롤 방지
            if (!isJumpPressed && gameState === STATE.PLAYING) {
                isJumpPressed = true;
                if (btnJump) btnJump.classList.add('pressed');
                chicken.jump(); // 닭 점프 실행
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        const targetTag = e.target.tagName.toLowerCase();
        if (targetTag === 'input' || targetTag === 'textarea') return;

        if (e.code === 'Space') {
            e.preventDefault();
            isJumpPressed = false;
            if (btnJump) btnJump.classList.remove('pressed');
            chicken.cutJump(); // 스페이스바를 떼면 소점프 처리
        }
    });

    const scenePasswordInput = document.getElementById('scene-password-input');
    const btnPasswordConfirm = document.getElementById('btn-password-confirm');
    const btnPasswordCancel = document.getElementById('btn-password-cancel');

    const sceneExitConfirm = document.getElementById('scene-exit-confirm');
    const btnExitConfirm = document.getElementById('btn-exit-confirm');
    const btnExitCancel = document.getElementById('btn-exit-cancel');

    const sceneDeleteRoomConfirm = document.getElementById('scene-delete-room-confirm');
    const btnDeleteRoomConfirm = document.getElementById('btn-delete-room-confirm');
    const btnDeleteRoomCancel = document.getElementById('btn-delete-room-cancel');

    const sceneAuth = document.getElementById('scene-auth');

    const sceneUserProfile = document.getElementById('scene-user-profile');
    const btnProfileConfirm = document.getElementById('btn-profile-confirm');
    const btnLogout = document.getElementById('btn-logout');
    const btnRechargeCoin = document.getElementById('btn-recharge-coin'); 

    if (btnCreateOpen) {
        btnCreateOpen.onclick = () => {
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
            document.getElementById('input-room-password-create').value = ''; 
            sceneCreateRoom.classList.remove('hidden');
        };
    }
    if (btnCreateCancel) btnCreateCancel.onclick = () => sceneCreateRoom.classList.add('hidden');

    if (btnMember) {
        btnMember.onclick = () => {
            if (isLoggedIn) {
                showUserProfile();
            } else {
                const authMsg = sceneAuth.querySelector('.auth-message');
                if (authMsg) authMsg.style.display = 'none';
                sceneAuth.classList.remove('hidden');
            }
        };
    }

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
                alert('해당 로그인 방식은 현재 지원되지 않습니다.');
            }
        };
    });

    if (btnProfileConfirm) {
        btnProfileConfirm.onclick = () => {
            const newNickname = document.getElementById('profile-nickname').value.trim();
            if (newNickname && currentUser) {
                currentUser.nickname = newNickname;
                saveUserDataToFirestore(); 
                console.log('닉네임 변경됨:', currentUser.nickname);
            }
            if (sceneUserProfile) sceneUserProfile.classList.add('hidden');
        };
    }

    if (btnLogout) {
        btnLogout.onclick = () => {
            firebase.auth().signOut().catch((error) => {
                console.error('❌ 로그아웃 실패:', error);
                alert('로그아웃 중 오류가 발생했습니다.');
            });
        };
    }

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
                const roomRef = db.collection("rooms").doc(); 

                const roomData = {
                    title: titleInput || "즐거운 레이스",
                    password: passwordInput.length > 0 ? passwordInput : null,
                    maxPlayers: parseInt(limitInput) || 5,
                    currentPlayers: 1, 
                    creatorUid: user.uid,
                    attempts: attempts,
                    rankType: rankType,
                    status: "inprogress",
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                const initialBatch = db.batch();
                const creatorRef = roomRef.collection('participants').doc(user.uid);
                const creatorData = { id: user.uid, name: currentUser.nickname, isBot: false, score: 0, totalScore: 0, bestScore: 0, status: 'waiting', displayScore: 0, attemptsLeft: attempts };
                initialBatch.set(roomRef, roomData);
                initialBatch.set(creatorRef, creatorData);
                await initialBatch.commit();
                console.log("✅ 1단계: 방 및 생성자 정보 생성 완료! ID:", roomRef.id);
                
                // [수정] 관리자 계정으로 방 생성 시에만 봇을 추가합니다.
                if (currentUser && currentUser.isAdmin) {
                    const botBatch = db.batch();
                    const botRef = roomRef.collection('participants').doc(`bot_${Date.now()}`);
                    const botData = { id: botRef.id, name: '초보닭', isBot: true, score: 0, totalScore: 0, bestScore: 0, status: 'waiting', displayScore: 0, attemptsLeft: attempts, startDelay: 60, targetScore: 750 }; 
                    botBatch.set(botRef, botData);
                    botBatch.update(roomRef, { currentPlayers: firebase.firestore.FieldValue.increment(1) });
                    await botBatch.commit();
                    console.log("✅ 2단계: 초기 봇 추가 완료!");
    
                    roomData.currentPlayers = 2; 
                }
                const newRoomForGame = mapFirestoreDocToRoom({ id: roomRef.id, data: () => roomData });

                raceRooms.unshift(newRoomForGame);

                const newJoinedRoomEntry = { usedAttempts: 0, isPaid: false };
                currentUser.joinedRooms[newRoomForGame.id] = newJoinedRoomEntry;

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

    if (btnPasswordConfirm) {
        btnPasswordConfirm.onclick = () => {
            if (targetRoom && targetRoom.current >= targetRoom.limit) {
                alert('인원 제한으로 참여할 수 없습니다.');
                return;
            }
            const cost = targetRoom.attempts;
            if (!currentUser || currentUser.coins < cost) {
                alert(`코인이 부족합니다.\n(필요: ${cost}, 보유: ${currentUser ? currentUser.coins : 0})`);
                return;
            }

            const inputPw = document.getElementById('input-room-password').value;
            const msg = document.getElementById('password-message');

            if (targetRoom && inputPw === targetRoom.password) {
                unlockedRoomIds.push(targetRoom.id); 
                scenePasswordInput.classList.add('hidden');
                attemptToJoinRoom(targetRoom);
                targetRoom = null;
            } else {
                if (msg) {
                    msg.innerText = '비밀번호가 일치하지 않습니다.';
                    msg.style.display = 'block'; 
                }
            }
        };
    }

    if (btnPasswordCancel) {
        btnPasswordCancel.onclick = () => { if (scenePasswordInput) scenePasswordInput.classList.add('hidden'); targetRoom = null; };
    }

    if (btnExitConfirm) {
        btnExitConfirm.onclick = () => {
            if (sceneExitConfirm) sceneExitConfirm.classList.add('hidden');
            exitToLobby(false);
        };
    }
    if (btnExitCancel) {
        btnExitCancel.onclick = () => { if (sceneExitConfirm) sceneExitConfirm.classList.add('hidden'); };
    }
    // 🚨 [추가] '참가중인 목록에서 삭제' 버튼을 눌렀을 때 확인 모달 띄우기
    if (btnDeleteRoom) {
        btnDeleteRoom.onclick = () => {
            const sceneDeleteRoomConfirm = document.getElementById('scene-delete-room-confirm');
            if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.remove('hidden');
        };
    }
    if (btnDeleteRoomConfirm) {
        btnDeleteRoomConfirm.onclick = async () => {
            if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.add('hidden');
            await removeFromMyRooms();
        };
    }
    if (btnDeleteRoomCancel) {
        btnDeleteRoomCancel.onclick = () => { if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.add('hidden'); };
    }

    document.querySelectorAll('.modal-container .close_modal').forEach(btn => {
        btn.onclick = () => {
            btn.closest('section').classList.add('hidden');
        };
    });

    if (btnPauseToggle) btnPauseToggle.onclick = togglePause;
    if (btnResumeGame) btnResumeGame.onclick = togglePause;

    if (btnSingle) btnSingle.onclick = () => enterGameScene('single');

    if (btnRaceStart) {
        btnRaceStart.onclick = () => {
            // [리팩토링] 코인 차감 로직을 handleSinglePlayerStartCost 함수로 분리
            if (currentGameMode === 'single' && !handleSinglePlayerStartCost()) {
                return; // 코인이 부족하면 중단
            }
            
            // 멀티 모드 코인 처리 (방 입장 시 1회 지불)
            if (currentGameMode === 'multi' && currentRoom && currentUser) {
                const userRoomState = currentUser.joinedRooms[currentRoom.id];
                if (userRoomState && !userRoomState.isPaid) {
                    const cost = currentRoom.attempts;
                    if (currentUser.coins < cost) {
                        alert(`코인이 부족합니다.\n(필요: ${cost}, 보유: ${currentUser.coins})`);
                        return;
                    }
                    currentUser.coins -= cost;
                    userRoomState.isPaid = true;
                    updateCoinUI();
                    saveUserDataToFirestore(); 
                    updateButtonCosts(); 
                }
            }

            // [리팩토링] 게임 시작 로직을 executeGameStart 함수로 분리
            clearAutoActionTimer(); 
            document.getElementById('game-start-screen').classList.add('hidden');
            setControlsVisibility(true); 
            setTimeout(executeGameStart, 500);
        };
    }

    if (btnRestart) {
        btnRestart.onclick = () => {
            // [리팩토링] 코인 차감 로직을 handleSinglePlayerStartCost 함수로 분리
            if (currentGameMode === 'single' && !handleSinglePlayerStartCost()) {
                return; // 코인이 부족하면 중단
            }
            // 멀티 모드에서는 재시작 시 별도 코인 차감이 없음

            // [리팩토링] 게임 시작 로직을 executeGameStart 함수로 분리
            clearAutoActionTimer();
            document.getElementById('game-over-screen').classList.add('hidden');
            setControlsVisibility(true); 
            setTimeout(() => {
                resetGame();
                executeGameStart();
            }, 500);
        };
    }

    if (btnSoundToggle) {
        btnSoundToggle.classList.toggle('sound-on', isSoundOn);
        btnSoundToggle.classList.toggle('sound-off', !isSoundOn);

        btnSoundToggle.onclick = () => {
            isSoundOn = !isSoundOn; 
            btnSoundToggle.classList.toggle('sound-on', isSoundOn);
            btnSoundToggle.classList.toggle('sound-off', !isSoundOn);
            console.log(`사운드 상태: ${isSoundOn ? 'ON' : 'OFF'}`);
            if (isSoundOn) {
                if (gameState === STATE.PLAYING) playSound('bgm');
            } else {
                pauseBGM();
            }
        };
    }

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

    initTabs('tab-race-room', 'tab-my-rooms', 'content-race-room', 'content-my-rooms', () => {
        // [수정] 탭을 전환할 때마다 항상 최신 방 목록을 가져오도록 강제합니다.
        console.log("🔄️ 탭 전환으로 목록 새로고침을 요청합니다.");
        roomFetchPromise = null; // 캐시된 Promise를 초기화하여 재호출을 강제합니다.
        fetchRaceRooms(false);
        fetchMyRooms();
    });

    initTabs('tab-my-record', 'tab-top-100', 'content-my-record', 'content-top-100', () => {
        const tabTop100 = document.getElementById('tab-top-100');
        if (tabTop100 && tabTop100.classList.contains('active')) {
            loadLeaderboard();
        }
    });

    document.querySelectorAll('.list-tabgroup .refresh').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            // [수정] 새로고침 버튼 클릭 시, 항상 최신 방 목록을 가져오도록 강제합니다.
            console.log("🔄️ 새로고침 버튼으로 목록 새로고침을 요청합니다.");
            roomFetchPromise = null; // 캐시된 Promise를 초기화하여 재호출을 강제합니다.
            fetchRaceRooms(false);
            fetchMyRooms();
        };
    });

    if (btnExitFromStart) btnExitFromStart.onclick = () => exitToLobby(true);
    if (btnExitFromPause) btnExitFromPause.onclick = handleHomeButtonClick;
    if (btnExitFromGameover) btnExitFromGameover.onclick = handleHomeButtonClick;

    window.resetAdCount = resetAdCount;
    window.resetRoomData = resetRoomData;
});