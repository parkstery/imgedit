<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bc0b3d3b-a38d-43b2-9cd4-1c40c25b1310

## Gemini 이미지 분석

1. [Google AI Studio](https://aistudio.google.com/apikey)에서 API 키를 발급합니다.
2. 프로젝트 루트에 `.env.local` 파일을 만들고 `GEMINI_API_KEY=여기에_키` 형식으로 저장합니다. (이 파일은 Git에 올라가지 않습니다.)
3. `npm run dev`로 실행한 뒤, 툴바 **Gemini → 이미지 분석…**에서 사용합니다. API 키는 Vite 개발·프리뷰 서버에서만 사용되며, 정적 빌드물에는 포함되지 않습니다.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (선택) Gemini 기능을 쓰려면 `.env.local`에 `GEMINI_API_KEY`를 설정합니다.
3. Run the app:
   `npm run dev`
