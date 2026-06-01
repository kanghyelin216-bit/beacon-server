import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const app = express();

// 1. CORS 및 JSON 설정 (프론트엔드와 안전하게 통신하기 위함)
app.use(cors());
app.use(express.json());

// 2. 구글 Gemini AI 초기화
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// [메모리 버퍼] 데이터베이스 대신 컴퓨터 메모리에 최신 비콘 데이터를 임시 저장합니다.
let latestBeacon = null;

// [기존 코드] 비콘 데이터 수신 (안드로이드 앱이 쏴주는 신호 받는 곳)
app.post('/beacon', (req, res) => {
  console.log('--- 📱 안드로이드 비콘 데이터 수신 ---');
  console.log(req.body); 
  latestBeacon = req.body; // 전역 변수에 실시간으로 덮어쓰기
  res.send({ success: true });
});

// [기존 코드] 비콘 데이터 조회 (리액트 웹앱이 위치 가져가는 곳)
app.get('/beacon', (req, res) => {
  res.send(latestBeacon || {}); // 데이터가 없으면 빈 객체{} 반환
});

// 🚀 [추가된 코드] 제미나이 AI 챗봇 라우터
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    // gemini-2.5-flash 모델로 질문 보내기
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: message,
      config: {
        // 우리 가이드 앱 "Guidant"에 맞게 정체성 부여
        systemInstruction: '당신은 전통시장 및 AI 실습실 가이드 도우미 "Guidant"입니다. 친절하고 간결하게 한국어로 답변해주세요.'
      }
    });

    // 제미나이가 준 답변을 리액트로 리턴
    res.json({ reply: response.text });
  } catch (error) {
    console.error('Gemini API 에러:', error);
    res.status(500).json({ error: '제미나이 응답 중 오류가 발생했습니다.' });
  }
});

// 3. 서버 포트 3000번 실행
app.listen(3000, () => {
  console.log('==================================================');
  console.log('🚀 Guidant 1단계 ESM 서버가 3000번 포트에서 가동 중입니다.');
  console.log('👉 안드로이드 전송 주소: http://컴퓨터IP:3000/beacon');
  console.log('👉 리액트 웹앱 조회 주소: http://localhost:3000/beacon');
  console.log('==================================================');
});