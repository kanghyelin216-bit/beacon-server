import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Groq from 'groq-sdk';
import 'dotenv/config';

// ==========================================
// 1. 초기화 및 미들웨어 설정
// ==========================================
const app = express();
const httpServer = createServer(app);

// 웹소켓 CORS 정책 전면 허용
const io = new Server(httpServer, {
    cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

// Groq AI 인스턴스 생성 (보안을 위해 .env의 GROQ_API_KEY 사용)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });


// ==========================================
// 2. [요구사항 3] 위치 추정 알고리즘 전략 패턴 (JavaScript 버전)
// ==========================================
/**
 * 그리드 기반 위치 추정 서비스 (Loose Coupling 구조)
 * 인터페이스 대신 명시적 클래스 구조를 사용하여 향후 교체가 용이하도록 격리했습니다.
 */
class GridPositionEstimator {
    /**
     * @param {string} scannerId 
     * @param {Array<{beaconId: string, rssi: number}>} beaconSignals 
     */
    estimate(scannerId, beaconSignals) {
        // [비즈니스 로직 복잡도 격리]
        // 안드로이드가 수신한 5개 비콘의 RSSI 값을 바탕으로 실제 삼각측량 알고리즘을 구현하는 공간입니다.
        if (beaconSignals && beaconSignals.length > 0) {
            // 알고리즘 연산 결과 예시 (현재는 요구사항 스냅샷 좌표 반영)
            return { x: 181, y: 383 }; 
        }
        return { x: 181, y: 383 }; // 기본값 (전시장 정중앙)
    }
}

// 의존성 주입 구조 유지를 위한 인스턴스 선언
const positionEstimator = new GridPositionEstimator();


// ==========================================
// 3. 인메모리 데이터 저장소 (멀티테넌시 / 다중 유저 대응)
// ==========================================
// 유저별 독립된 위치 정보를 유지하기 위해 Map 객체 사용
const userLocations = new Map();

// [요구사항 5] 스캐너 기반 혼잡도 트래킹 (스캐너 ID -> 접속 유저 Set)
const scannerCongestion = new Map();


// ==========================================
// 4. REST API 엔드포인트 설계
// ==========================================

/**
 * 📱 1. 안드로이드 실시간 비콘 신호 수신 엔드포인트
 * 안드로이드가 원본 데이터 배열을 던지면 서버의 독립 모듈이 위치를 추정합니다.
 */
app.post('/beacon', (req, res) => {
    console.log('📱 [안드로이드 RSSI 원본 데이터 수신]:', req.body); 

    const { scannerId, beaconSignals, userId } = req.body;

    // 데이터 유효성 검증
    if (!scannerId || !beaconSignals || !userId) {
        console.log('⚠️ req.body 내부에 필수 데이터(scannerId, beaconSignals, userId)가 누락되었습니다.');
        return res.status(400).send({ success: false, error: '필수 데이터 누락' });
    }

    try {
        // 1) Loose Coupling된 위치 추정 모듈 호출
        const estimatedLocation = positionEstimator.estimate(scannerId, beaconSignals);
        
        // 2) 다중 유저 상태 매핑 저장
        userLocations.set(userId, {
            x: Number(estimatedLocation.x),
            y: Number(estimatedLocation.y),
            updatedAt: Date.now()
        });

        // 3) 혼잡도 엔진 계산 (스캐너당 유저 수 트래킹)
        if (!scannerCongestion.has(scannerId)) {
            scannerCongestion.set(scannerId, new Set());
        }
        scannerCongestion.get(scannerId).add(userId);

        console.log(`🎯 유저 [${userId}]의 최종 추정 위치 확정:`, estimatedLocation);

        // 4) ✅ 즉시 리액트 웹앱으로 실시간 데이터 브로드캐스트
        io.emit('location_update', { userId, location: estimatedLocation });
        
        // 혼잡도 상태 실시간 동기화
        io.emit('congestion_update', { 
            scannerId, 
            count: scannerCongestion.get(scannerId).size 
        });

        res.send({ 
            success: true, 
            serverSavedLocation: estimatedLocation,
            currentCongestionCount: scannerCongestion.get(scannerId).size
        });

    } catch (error) {
        console.error('위치 처리 중 내부 에러 발생:', error);
        res.status(500).send({ success: false, error: '서버 내부 오류' });
    }
});

/**
 * 2. 리액트 최초 로드 시 특정 유저의 마지막 위치 반환 API
 */
app.get('/beacon/:userId', (req, res) => {
    const { userId } = req.params;
    const location = userLocations.get(userId);
    
    if (location) {
        res.send(location);
    } else {
        res.send({ x: 181, y: 383 });
    }
});

/**
 * 🤖 3. [요구사항 9] Groq AI 관광 가이드 대화 엔드포인트
 */
app.post('/chat', async (req, res) => {
    try {
        const { message, userId } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: '메시지 내용이 비어있습니다.' });
        }

        // 사용자의 현재 위치 컨텍스트 획득
        const userLoc = userLocations.get(userId) || { x: 181, y: 383 };
        
        // AI 시스템 가이드라인에 위치 컨텍스트 주입
        const systemInstruction = `당신은 전통시장 및 AI 실습실 스마트 내비게이션 관광 가이드 도우미 "Guidant"입니다. 
현재 질문을 한 사용자의 실시간 그리드 좌표 위치는 X: ${userLoc.x}m, Y: ${userLoc.y}m 입니다. 
상점 정보, 운영시간, 혼잡도 및 사용자의 이 현재 위치를 유기적으로 고려하여 상냥하고 친절하게 한국어로 아주 간결하게 답변해주세요.`;

        // Groq Chat Completion API 호출 (Llama 3.3 70B 최적 모델 선택)
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: message }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.6,
            max_tokens: 500
        });

        const reply = chatCompletion.choices[0]?.message?.content || '죄송합니다, 답변을 생성하지 못했습니다.';
        res.json({ reply });

    } catch (error) {
        console.error('Groq API 에러:', error);
        res.status(500).json({ error: '그록 AI 응답 중 오류가 발생했습니다.' });
    }
});


// ==========================================
// 5. 웹소켓 실시간 커넥션 관리
// ==========================================
io.on('connection', (socket) => {
    console.log('🌐 리액트 PWA 웹앱 소켓 연결 성공! ID:', socket.id);
    
    socket.emit('location_update', { userId: 'default_guest', location: { x: 181, y: 383 } });

    socket.on('disconnect', () => {
        console.log('❌ 리액트 웹앱 소켓 연결 종료:', socket.id);
    });
});


// ==========================================
// 6. 외부 IP 전면 개방 서버 오픈 ('0.0.0.0')
// ==========================================
const PORT = 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('==================================================');
    console.log(`🚀 MERN 실시간 위치기반 스마트관광 백엔드 서버가 구동되었습니다.`);
    console.log(`👉 포트번호: ${PORT} | 모든 네트워크 인터페이스(0.0.0.0) 개방 완료`);
    console.log(`📱 안드로이드 비콘 스캐너 앱 수신 대기 상태망: 활성화 완료`);
    console.log('==================================================');
});