const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors')({origin: true});

if (!admin.apps.length) {
    admin.initializeApp();
}

exports.naverLogin = functions.https.onCall(async (data, context) => {
    let accessToken = null;
    if (typeof data === 'string') accessToken = data;
    else if (data && data.accessToken) accessToken = data.accessToken;
    else if (data && data.data && data.data.accessToken) accessToken = data.data.accessToken;

    if (!accessToken) {
        throw new functions.https.HttpsError('invalid-argument', '액세스 토큰이 없습니다.');
    }

    try {
        // [1단계] 네이버 토큰으로 유저 정보 요청
        let response;
        try {
            response = await axios.get('https://openapi.naver.com/v1/nid/me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        } catch (apiErr) {
            const errorDetail = apiErr.response ? JSON.stringify(apiErr.response.data) : apiErr.message;
            throw new Error(`[1단계 실패] 네이버 API가 토큰을 거부했습니다: ${errorDetail}`);
        }

        const naverUser = response.data.response;
        if (!naverUser || !naverUser.id) {
            throw new Error('[1단계 실패] 네이버 응답에 유저 ID가 없습니다.');
        }

        // [2단계] 파이어베이스 유저 고유 ID 생성
        const uid = `naver:${naverUser.id}`;
        const email = naverUser.email || '';
        const nickname = naverUser.nickname || naverUser.name || '네이버유저';

        // [3단계] 파이어베이스 유저 및 Firestore 문서 등록/조회
        try {
            try {
                await admin.auth().getUser(uid);
            } catch (authErr) {
                if (authErr.code === 'auth/user-not-found') {
                    await admin.auth().createUser({
                        uid: uid,
                        email: email,
                        displayName: nickname
                    });
                } else {
                    throw authErr;
                }
            }
        } catch (userErr) {
            throw new Error(`[3단계 실패] 파이어베이스 유저 생성 오류: ${userErr.message}`);
        }

        // [4단계] 커스텀 토큰 발급 (★ 가장 에러가 많이 나는 구간)
        let customToken;
        try {
            customToken = await admin.auth().createCustomToken(uid);
        } catch (tokenErr) {
            throw new Error(`[4단계 실패] 커스텀 토큰 발급 권한 오류: ${tokenErr.message}`);
        }

        // 모든 관문을 통과하면 성공적으로 토큰 반환!
        return { customToken: customToken };

    } catch (error) {
        console.error("❌ 상세 서버 에러:", error.message);
        // 프론트엔드 콘솔에 정확히 어떤 단계에서 에러가 났는지 뿌려줍니다.
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * [수정] 다수의 사용자 ID(uid)를 받아 각 사용자의 최신 닉네임을 반환합니다.
 * - onCall에서 onRequest로 변경하고 cors 미들웨어를 사용하여 CORS 문제를 해결합니다.
 * - Top 100 랭킹은 누구나 볼 수 있어야 하므로 인증 체크를 제거합니다.
 */
exports.getNicknames = functions.https.onRequest((req, res) => {
    // CORS preflight 요청을 처리하고 실제 요청에 대한 헤더를 설정합니다.
    cors(req, res, async () => {
        // httpsCallable로 호출 시 데이터는 req.body.data에 있습니다.
        const uids = req.body.data.uids;

        if (!Array.isArray(uids) || uids.length === 0) {
            return res.status(400).send({ error: { message: 'UID 배열이 필요합니다.' } });
        }

        // 한 번에 너무 많은 요청을 보내는 것을 방지합니다 (최대 100명).
        if (uids.length > 100) {
            return res.status(400).send({ error: { message: '한 번에 100명 이상의 닉네임을 요청할 수 없습니다.' } });
        }

        const db = admin.firestore();
        const userDocsPromises = uids.map(uid => db.collection('users').doc(uid).get());

        try {
            const userDocs = await Promise.all(userDocsPromises);
            const nicknameMap = {};
            userDocs.forEach(doc => {
                if (doc.exists) {
                    nicknameMap[doc.id] = doc.data().nickname || '이름없음';
                } else {
                    // 랭킹에 있지만 삭제된 유저일 경우
                    nicknameMap[doc.id] = '알수없음';
                }
            });
            // httpsCallable은 응답이 { data: ... } 형태일 것으로 기대합니다.
            res.status(200).send({ data: nicknameMap });
        } catch (error) {
            console.error("❌ 닉네임 일괄 조회 실패:", error);
            res.status(500).send({ error: { message: '닉네임을 조회하는 중 서버 오류가 발생했습니다.' } });
        }
    });
});

/**
 * [신규] Firebase Auth에 새로운 사용자가 생성될 때마다 Firestore에 해당 사용자 문서를 자동으로 생성합니다.
 * 이 함수는 구글, 카카오, 페이스북 등 모든 신규 가입 시 트리거됩니다.
 */
exports.createUserDocument = functions.auth.user().onCreate(async (user) => {
    const { uid, email, displayName, providerData } = user;
    console.log(`새로운 사용자 생성됨: ${uid}, Email: ${email}`);

    const userRef = admin.firestore().collection('users').doc(uid);

    // 소셜 로그인 제공자 정보에서 닉네임 포맷팅
    const providerInfo = providerData && providerData[0] ? providerData[0] : null;
    const extractedNickname = displayName || (providerInfo ? providerInfo.displayName : null);
    let providerSuffix = "";
    if (providerInfo) {
        const providerId = providerInfo.providerId;
        if (providerId.includes('kakao')) providerSuffix = " (Kakao)";
        else if (providerId.includes('google')) providerSuffix = " (Google)";
        else if (providerId.includes('naver')) providerSuffix = " (Naver)";
    }
    const finalNickname = (extractedNickname || '이름없음') + providerSuffix;

    const initialUserData = {
        id: uid,
        email: email || '',
        nickname: finalNickname,
        coins: 10,
        badges: { '1': 0, '2': 0, '3': 0 },
        joinedRooms: {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        bestScore: 0, // [신규] 개인 최고 점수
        myScores: []  // [신규] 개인 상위 기록 목록
    };

    return userRef.set(initialUserData)
        .then(() => console.log(`✅ Firestore에 사용자 문서 생성 완료: ${uid}`))
        .catch(error => console.error(`❌ Firestore 사용자 문서 생성 실패: ${uid}`, error));
});