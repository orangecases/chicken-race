const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

// Admin 권한 초기화
admin.initializeApp();

exports.naverLogin = functions.https.onCall(async (data, context) => {
    const accessToken = data.accessToken;
    if (!accessToken) {
        throw new functions.https.HttpsError('invalid-argument', '액세스 토큰이 없습니다.');
    }

    try {
        // 1. 프론트엔드에서 보낸 토큰으로 네이버 서버에 유저 정보(UserInfo) 요청
        const response = await axios.get('https://openapi.naver.com/v1/nid/me', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        const naverUser = response.data.response;
        if (!naverUser || !naverUser.id) {
            throw new functions.https.HttpsError('internal', '네이버 유저 정보를 가져오지 못했습니다.');
        }

        // 2. 고유한 Firebase UID와 정보 생성
        const uid = `naver:${naverUser.id}`;
        const email = naverUser.email || '';
        const nickname = naverUser.nickname || naverUser.name || '네이버유저';

        // 3. Firebase Auth에 유저가 존재하는지 확인 후, 없으면 신규 가입 처리
        try {
            await admin.auth().getUser(uid);
            // 기존 유저인 경우 무사 통과
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                // 신규 유저 생성
                await admin.auth().createUser({
                    uid: uid,
                    email: email,
                    displayName: nickname
                });
            } else {
                throw error;
            }
        }

        // 4. 대망의 '커스텀 토큰' 생성 및 프론트엔드로 반환!
        const customToken = await admin.auth().createCustomToken(uid);
        return { customToken: customToken };

    } catch (error) {
        console.error('네이버 로그인 백엔드 에러:', error);
        throw new functions.https.HttpsError('internal', '인증 처리 중 서버 오류가 발생했습니다.');
    }
});