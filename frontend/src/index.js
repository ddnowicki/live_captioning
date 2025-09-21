import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import SubtitlesOverlay from './SubtitlesOverlay';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/subtitles" element={<SubtitlesOverlay />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);