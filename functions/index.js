const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

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

        const uid = `naver:${naverUser.id}`;
        const email = naverUser.email || '';
        const nickname = naverUser.nickname || naverUser.name || '네이버유저';

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

        let customToken;
        try {
            customToken = await admin.auth().createCustomToken(uid);
        } catch (tokenErr) {
            throw new Error(`[4단계 실패] 커스텀 토큰 발급 권한 오류: ${tokenErr.message}`);
        }

        return { customToken: customToken };

    } catch (error) {
        console.error("❌ 상세 서버 에러:", error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * [수정] 다수의 사용자 ID(uid)를 받아 각 사용자의 최신 닉네임을 반환합니다.
 * - onRequest에서 onCall로 변경하여 클라이언트(game.js)의 httpsCallable 호출과 일치시킵니다.
 * - onCall 함수는 CORS를 자동으로 처리하므로 수동 CORS 설정이 필요 없습니다.
 * - 인증 검사를 제거하여 로그인하지 않은 사용자도 Top 100 랭킹을 볼 수 있도록 합니다.
 */
exports.getNicknames = functions.https.onCall(async (data, context) => {
    const uids = data.uids;

    if (!Array.isArray(uids) || uids.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'UID 배열이 필요합니다.');
    }

    if (uids.length > 100) {
        throw new functions.https.HttpsError('invalid-argument', '한 번에 100명 이상의 닉네임을 요청할 수 없습니다.');
    }

    const db = admin.firestore();
    const userDocsPromises = uids.map(uid => db.collection('users').doc(uid).get());

    try {
        const userDocs = await Promise.all(userDocsPromises);
        const nicknameMap = {};
        userDocs.forEach(doc => {
            nicknameMap[doc.id] = (doc.exists && doc.data().nickname) ? doc.data().nickname : '알수없음';
        });
        return nicknameMap;
    } catch (error) {
        console.error("❌ 닉네임 일괄 조회 실패:", error);
        throw new functions.https.HttpsError('internal', '닉네임을 조회하는 중 서버 오류가 발생했습니다.');
    }
});

exports.createUserDocument = functions.auth.user().onCreate(async (user) => {
    const { uid, email } = user;
    console.log(`새로운 사용자 생성됨: ${uid}, Email: ${email}`);

    const userRef = admin.firestore().collection('users').doc(uid);
    const initialNickname = `병아리-${uid.substring(0, 6)}`;

    const initialUserData = {
        id: uid,
        email: email || '',
        nickname: initialNickname,
        coins: 10,
        badges: { '1': 0, '2': 0, '3': 0 },
        joinedRooms: {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        bestScore: 0, 
        myScores: []  
    };

    try {
        await userRef.set(initialUserData);
        console.log(`✅ Firestore에 사용자 문서 생성 완료: ${uid}`);
        return null; // 성공 시 null 반환
    } catch (error) {
        console.error(`❌ Firestore 사용자 문서 생성 실패: ${uid}`, error);
        throw error; // 실패 시 에러를 다시 던져서 Cloud Functions에 실패를 알림
    }
});