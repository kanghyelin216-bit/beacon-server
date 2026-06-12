import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 최신 유저 좌표 상태 저장 변수 (초기값: 전시장 정중앙)
let currentUserLocation = { x: 181, y: 383 };

// 📱 안드로이드에서 HTTP POST로 정밀 삼각측량 픽셀 좌표를 보낼 때 처리
app.post('/beacon', (req, res) => {
    console.log('--- 📱 안드로이드 비콘 삼각측량 데이터 수신 ---');
    console.log('수신 데이터:', req.body); // 안드로이드가 보낸 {"x": px, "y": px} 수신

    const { x, y } = req.body;

    // 들어온 데이터가 유효한 숫자인지 엄격히 검증
    if (typeof x === 'number' && typeof y === 'number') {
        
        // 안드로이드가 정밀 계산해서 보낸 픽셀 값을 전역 변수에 그대로 업데이트
        currentUserLocation = { x, y };
        console.log(`🎯 안드로이드 실시간 좌표 매핑 완료:`, currentUserLocation);

        // ✅ 변환된 진짜 좌표를 리액트에 즉시 실시간 웹소켓으로 발송!
        io.emit('location_update', currentUserLocation);
    } else {
        console.log('⚠️ 잘못된 형식의 좌표 데이터가 들어왔습니다. (req.body에 x, y 숫자가 있는지 확인하세요)');
    }

    res.send({ success: true, mappedLocation: currentUserLocation });
});

// 리액트 최초 로드 시 마지막 위치 스냅샷 서빙용 GET 엔드포인트
app.get('/beacon', (req, res) => {
    res.send(currentUserLocation);
});

// 웹소켓 자체 커넥션 관리 추가 (디버깅용)
io.on('connection', (socket) => {
    console.log('🌐 리액트 웹앱이 소켓 서버에 연결되었습니다! ID:', socket.id);
    
    // 연결되자마자 마지막으로 기록된 유저 위치 즉시 전송해서 멈춤 현상 방지
    socket.emit('location_update', currentUserLocation);

    socket.on('disconnect', () => {
        console.log('❌ 리액트 웹앱 소켓 연결 종료됨');
    });
});

// Gemini 챗봇 (기존 유지)
app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: '당신은 전통시장 및 AI 실습실 가이드 도우미 "Guidant"입니다. 친절하고 간결하게 한국어로 답변해주세요.'
            }
        });
        res.json({ reply: response.text });
    } catch (error) {
        console.error('Gemini API 에러:', error);
        res.status(500).json({ error: '제미나이 응답 중 오류가 발생했습니다.' });
    }
});

httpServer.listen(3000, () => {
    console.log('==================================================');
    console.log('🚀 Guidant 중계 서버가 3000번 포트에서 가동 중입니다.');
    console.log('👉 안드로이드 전송 주소: http://192.168.219.109:3000/beacon');
    console.log('👉 리액트 웹앱 소켓 연동 주소: http://192.168.219.109:3000');
    console.log('==================================================');
});