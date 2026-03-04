const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

// Admin 앱이 중복 초기화되지 않도록 안전장치 추가
if (!admin.apps.length) {
    admin.initializeApp();
}

exports.naverLogin = functions.https.onCall(async (data, context) => {
    // 🚨 [핵심 수정] 프론트엔드에서 보낸 토큰이 어떤 포장지로 감싸져 오든 찾아냅니다!
    let accessToken = null;
    if (typeof data === 'string') {
        accessToken = data;
    } else if (data && data.accessToken) {
        accessToken = data.accessToken;
    } else if (data && data.data && data.data.accessToken) {
        accessToken = data.data.accessToken; // 이중 포장된 경우
    }

    // 그래도 토큰이 없다면 에러를 뱉습니다.
    if (!accessToken) {
        console.error("❌ 토큰을 찾을 수 없습니다. 수신된 데이터 형태:", JSON.stringify(data));
        throw new functions.https.HttpsError('invalid-argument', '액세스 토큰이 없습니다.');
    }

    try {
        // 1. 네이버 서버에 유저 정보(UserInfo) 요청
        const response = await axios.get('https://openapi.naver.com/v1/nid/me', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        const naverUser = response.data.response;
        if (!naverUser || !naverUser.id) {
            throw new functions.https.HttpsError('internal', '네이버 유저 정보를 가져오지 못했습니다.');
        }

        // 2. Firebase 유저 생성
        const uid = `naver:${naverUser.id}`;
        const email = naverUser.email || '';
        const nickname = naverUser.nickname || naverUser.name || '네이버유저';

        try {
            await admin.auth().getUser(uid);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                await admin.auth().createUser({
                    uid: uid,
                    email: email,
                    displayName: nickname
                });
            } else {
                throw error;
            }
        }

        // 3. 커스텀 토큰 발급
        const customToken = await admin.auth().createCustomToken(uid);
        return { customToken: customToken };

    } catch (error) {
        console.error('네이버 로그인 백엔드 에러:', error);
        throw new functions.https.HttpsError('internal', '인증 처리 중 서버 오류가 발생했습니다.');
    }
});