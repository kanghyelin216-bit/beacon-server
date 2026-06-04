import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const app = express();
const httpServer = createServer(app);  // ← http 서버로 감싸기

const io = new Server(httpServer, {
    cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let latestBeacon = null;

// 안드로이드에서 데이터 수신
app.post('/beacon', (req, res) => {
    console.log('--- 📱 안드로이드 비콘 데이터 수신 ---');
    console.log(req.body);
    latestBeacon = req.body;

    // ✅ 연결된 React에 즉시 전송
    io.emit('location_update', latestBeacon);

    res.send({ success: true });
});

// 기존 GET (처음 접속 시 마지막 데이터 가져올 때 사용)
app.get('/beacon', (req, res) => {
    res.send(latestBeacon || {});
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

// ✅ app.listen → httpServer.listen 으로 변경
httpServer.listen(3000, () => {
    console.log('==================================================');
    console.log('🚀 Guidant 1단계 ESM 서버가 3000번 포트에서 가동 중입니다.');
    console.log('👉 안드로이드 전송 주소: http://컴퓨터IP:3000/beacon');
    console.log('👉 리액트 웹앱 조회 주소: http://localhost:3000/beacon');
    console.log('==================================================');
});