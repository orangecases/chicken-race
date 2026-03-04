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

        // [3단계] 파이어베이스 유저 등록 및 조회
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