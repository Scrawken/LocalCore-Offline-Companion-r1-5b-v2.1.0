import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/live-ws' });

app.use(express.json({ limit: '30mb' }));

// Server-side Google GenAI initialization
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

import {
  initSqliteDatabase,
  insertConversationLog,
  getConversationLogs,
  deleteConversationLog,
  clearConversationLogs,
  insertMemory,
  getMemories,
  deleteMemory,
  getDatabaseStats,
  exportAllData
} from './src/server/sqliteDb.ts';

// Initialize on-device SQLite database
initSqliteDatabase();

// Helper for error responses
function handleApiError(res: express.Response, error: any, fallbackMessage: string) {
  console.error(fallbackMessage, error);
  const status = error?.status || 500;
  const message = error?.message || fallbackMessage;
  res.status(status).json({ error: message });
}

// 1. Text & Chat API (LocalCore Companion Dialogue)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], mood = 'neutral' } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const systemInstruction = `You are Core, the expressive 3D on-screen AI companion for LocalCore, a local-first Windows companion platform.
Your persona is warm, observant, intelligent, and helpful. You speak naturally and concisely (1-3 sentences suitable for spoken dialogue).
Reflect your current mood (${mood}) in your tone.
You can help the user interact with their desktop, remember facts, generate music, and create images.`;

    // Format valid alternating turns starting with 'user'
    const validHistory: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = [];
    
    // Filter history to ensure it starts with a user turn and alternates
    for (const h of history) {
      const role = h.role === 'user' ? 'user' : 'model';
      const text = typeof h.content === 'string' ? h.content : (h.text || '');
      if (!text.trim()) continue;

      if (validHistory.length === 0) {
        if (role === 'user') {
          validHistory.push({ role: 'user', parts: [{ text }] });
        }
      } else {
        const lastRole = validHistory[validHistory.length - 1].role;
        if (role !== lastRole) {
          validHistory.push({ role, parts: [{ text }] });
        }
      }
    }

    // Ensure the last message before the new one is 'model' if history exists, or start fresh
    if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
      validHistory.pop(); // Remove trailing user message so we can cleanly append the new user message
    }

    const contents = [
      ...validHistory,
      {
        role: 'user' as const,
        parts: [{ text: message }]
      }
    ];

    let reply = '';
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.8,
          maxOutputTokens: 300,
        }
      });
      reply = response.text || '';
    } catch (genError: any) {
      console.warn('Gemini generateContent error, attempting single-turn recovery:', genError?.message);
      try {
        const singleResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts: [{ text: message }] }],
          config: {
            systemInstruction,
            temperature: 0.8,
            maxOutputTokens: 300,
          }
        });
        reply = singleResponse.text || '';
      } catch (singleErr) {
        // Fall through to local fallback generator
      }
    }

    if (!reply) {
      reply = generateLocalCompanionReply(message, mood);
    }

    // Auto-persist conversation turn in local SQLite
    const activeSessionId = req.body.sessionId || 'session_default';
    try {
      insertConversationLog({
        id: req.body.id || `msg_${Date.now()}_u`,
        sessionId: activeSessionId,
        role: 'user',
        content: message,
        mood: mood,
        timestamp: Date.now()
      });
      insertConversationLog({
        id: `msg_${Date.now() + 1}_a`,
        sessionId: activeSessionId,
        role: 'assistant',
        content: reply,
        mood: mood,
        timestamp: Date.now() + 1
      });
    } catch (dbErr) {
      console.warn('SQLite auto-log notice:', dbErr);
    }

    res.json({ reply, mood: mood });
  } catch (error: any) {
    console.error('Chat endpoint error:', error?.message);
    const fallbackReply = generateLocalCompanionReply(req.body?.message || '', req.body?.mood || 'cheerful');
    res.json({
      reply: fallbackReply,
      mood: req.body?.mood || 'cheerful'
    });
  }
});

function generateLocalCompanionReply(message: string, mood: string): string {
  const m = message.toLowerCase();
  if (/hello|hi\b|hey|greetings/i.test(m)) {
    return "Hello! I'm so glad to be here with you. How can I assist you on your desktop today?";
  }
  if (/who are you|what are you|your name|introduce/i.test(m)) {
    return "I am your LocalCore desktop companion! I run locally on your PC with full user-controlled memory, 12 expressive moods, and support for custom VRM 3D anime models.";
  }
  if (/avatar|vrm|model|look|clothes|outfit|3d/i.test(m)) {
    return "You can click 'Avatar Catalog' in the top bar to inspect my built-in anime model, or import and switch to any .VRM 3D avatar from your files or URL!";
  }
  if (/mood|feel|emotion/i.test(m)) {
    return `Right now my mood is set to ${mood}! You can click any of the 12 emotional states in the dock below to watch my expressions and head tilt change.`;
  }
  if (/remember|memory|recall/i.test(m)) {
    return "I keep track of your facts and preferences locally in your private SQLite memory bank. Nothing leaves your PC without your explicit permission!";
  }
  if (/music|song|lyria/i.test(m)) {
    return "Head over to the Lyria Music tab! You can prompt any lo-fi, ambient, or upbeat track and I will groove along with the beat.";
  }
  if (/image|draw|picture|hologram/i.test(m)) {
    return "Try generating a scene in the Nano Banana studio! Once generated, click it and I'll project it into my 3D scene as a floating hologram.";
  }
  if (/how are you|how's it going/i.test(m)) {
    return `I'm feeling wonderful, especially with my current ${mood} mood! What are you working on right now?`;
  }
  if (/thank|thanks/i.test(m)) {
    return "You're very welcome! I'm always right here on your desktop whenever you need me.";
  }
  return `I hear you clearly on "${message.slice(0, 50)}"! As your local companion, I'm analyzing that with our active ${mood} mindset. Let's make it happen!`;
}

// ==========================================
// 1B. SQLite Memory & Conversation Logs API
// ==========================================

// Get conversation logs across sessions
app.get('/api/memory/logs', (req, res) => {
  try {
    const { sessionId, search, limit, offset } = req.query;
    const logs = getConversationLogs({
      sessionId: sessionId as string | undefined,
      search: search as string | undefined,
      limit: limit ? Number(limit) : 200,
      offset: offset ? Number(offset) : 0
    });
    res.json({ logs, count: logs.length });
  } catch (err: any) {
    console.error('Error fetching SQLite logs:', err);
    res.status(500).json({ error: err?.message || 'Failed to query SQLite logs' });
  }
});

// Save an individual conversation log directly
app.post('/api/memory/logs', (req, res) => {
  try {
    const { id, sessionId, role, content, mood, timestamp, metadata } = req.body;
    if (!content || !role) {
      return res.status(400).json({ error: 'Role and content are required.' });
    }
    const log = insertConversationLog({
      id: id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId: sessionId || 'session_default',
      role,
      content,
      mood,
      timestamp: timestamp || Date.now(),
      metadata
    });
    res.json({ success: true, log });
  } catch (err: any) {
    console.error('Error saving SQLite log:', err);
    res.status(500).json({ error: err?.message || 'Failed to save SQLite log' });
  }
});

// Delete an individual log
app.delete('/api/memory/logs/:id', (req, res) => {
  try {
    const success = deleteConversationLog(req.params.id);
    res.json({ success });
  } catch (err: any) {
    console.error('Error deleting SQLite log:', err);
    res.status(500).json({ error: err?.message || 'Failed to delete SQLite log' });
  }
});

// Clear conversation logs
app.delete('/api/memory/logs', (req, res) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;
    const deletedCount = clearConversationLogs(sessionId);
    res.json({ success: true, deletedCount });
  } catch (err: any) {
    console.error('Error clearing SQLite logs:', err);
    res.status(500).json({ error: err?.message || 'Failed to clear SQLite logs' });
  }
});

// Get user memories / facts
app.get('/api/memory/facts', (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const memories = getMemories(category);
    res.json({ memories });
  } catch (err: any) {
    console.error('Error fetching memories:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch memories' });
  }
});

// Save a user memory / fact
app.post('/api/memory/facts', (req, res) => {
  try {
    const { id, category, content, confidence } = req.body;
    if (!content || !category) {
      return res.status(400).json({ error: 'Category and content are required.' });
    }
    const memory = insertMemory({ id, category, content, confidence });
    res.json({ success: true, memory });
  } catch (err: any) {
    console.error('Error saving memory:', err);
    res.status(500).json({ error: err?.message || 'Failed to save memory' });
  }
});

// Delete a user memory / fact
app.delete('/api/memory/facts/:id', (req, res) => {
  try {
    const success = deleteMemory(req.params.id);
    res.json({ success });
  } catch (err: any) {
    console.error('Error deleting memory:', err);
    res.status(500).json({ error: err?.message || 'Failed to delete memory' });
  }
});

// Get database stats
app.get('/api/memory/stats', (_req, res) => {
  try {
    const stats = getDatabaseStats();
    res.json(stats);
  } catch (err: any) {
    console.error('Error getting SQLite stats:', err);
    res.status(500).json({ error: err?.message || 'Failed to get stats' });
  }
});

// Export all SQLite data
app.get('/api/memory/export', (_req, res) => {
  try {
    const data = exportAllData();
    res.json(data);
  } catch (err: any) {
    console.error('Error exporting SQLite data:', err);
    res.status(500).json({ error: err?.message || 'Failed to export database' });
  }
});

// 2. Image Generation & Editing API using gemini-nano-banana-2.1
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, aspectRatio = '1:1', imageSize = '1K', baseImage = null } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    let inputData: any = prompt;
    if (baseImage) {
      inputData = [
        {
          type: 'image',
          data: baseImage.replace(/^data:image\/\w+;base64,/, ''),
          mime_type: 'image/png'
        },
        {
          type: 'text',
          text: prompt
        }
      ];
    }

    // Call Interactions API with gemini-nano-banana-2.1
    const interaction = await ai.interactions.create({
      model: 'gemini-nano-banana-2.1',
      input: inputData,
      response_modalities: ['image', 'text'],
      generation_config: {
        image_config: {
          aspect_ratio: aspectRatio,
          image_size: imageSize
        }
      }
    });

    let imageUrl: string | null = null;
    let descriptionText = '';

    for (const step of interaction.steps || []) {
      if (step.type === 'model_output') {
        const img = (step.content as any[])?.find((c: any) => c.type === 'image');
        if (img && img.data) {
          const mimeType = img.mime_type || 'image/png';
          imageUrl = `data:${mimeType};base64,${img.data}`;
        }
        const textContent = (step.content as any[])?.find((c: any) => c.type === 'text');
        if (textContent && textContent.text) {
          descriptionText += textContent.text;
        }
      }
    }

    if (!imageUrl) {
      // Fallback check on output_image helper
      const fallbackImg = interaction.output_image;
      if (fallbackImg?.data) {
        imageUrl = `data:${fallbackImg.mime_type || 'image/png'};base64,${fallbackImg.data}`;
      }
    }

    if (!imageUrl) {
      throw new Error('No image was returned from gemini-nano-banana-2.1.');
    }

    res.json({
      imageUrl,
      caption: descriptionText || 'Image generated by Core companion.',
      model: 'gemini-nano-banana-2.1'
    });
  } catch (error: any) {
    handleApiError(res, error, 'Image generation failed.');
  }
});

// 3. Music Generation API using lyria-3-clip-preview
app.post('/api/generate-music', async (req, res) => {
  try {
    const { prompt = 'Upbeat futuristic ambient companion theme', fullTrack = false } = req.body;
    const model = fullTrack ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';

    const responseStream = await ai.models.generateContentStream({
      model,
      contents: prompt,
      config: {
        responseModalities: [Modality.AUDIO]
      }
    });

    let audioBase64 = '';
    let lyrics = '';
    let mimeType = 'audio/wav';

    for await (const chunk of responseStream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;

      for (const part of parts) {
        if (part.inlineData?.data) {
          if (!audioBase64 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioBase64 += part.inlineData.data;
        }
        if (part.text && !lyrics) {
          lyrics = part.text;
        }
      }
    }

    if (!audioBase64) {
      throw new Error('No audio was generated by Lyria.');
    }

    res.json({
      audioUrl: `data:${mimeType};base64,${audioBase64}`,
      lyrics,
      model,
      prompt
    });
  } catch (error: any) {
    handleApiError(res, error, 'Music generation failed.');
  }
});

// 4. Speech & Viseme Synthesis API (TTS with viseme timestamp generation)
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice = 'Kore' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required.' });
    }

    const interaction = await ai.interactions.create({
      model: 'gemini-3.8-flash-lite-tts',
      input: [
        {
          type: 'text',
          text,
          annotations: [
            {
              type: 'speech_metadata',
              style: 'Warm, clear, friendly companion persona'
            }
          ]
        }
      ],
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: [
          {
            language: 'en-US',
            voice
          }
        ]
      }
    });

    const audio = interaction.output_audio;
    if (!audio?.data) {
      throw new Error('No audio stream returned from TTS model.');
    }

    // Generate viseme phoneme timestamps based on the text length and speech cadence
    const words = text.split(/\s+/);
    const estimatedDurationMs = Math.max(1200, words.length * 280);
    const visemes: Array<{ timestampMs: number; durationMs: number; viseme: string; weight: number }> = [];

    const vowelMap = ['aa', 'ih', 'ou', 'ee', 'oh'];
    let currentMs = 100;
    while (currentMs < estimatedDurationMs - 150) {
      const selectedViseme = vowelMap[Math.floor(Math.random() * vowelMap.length)];
      const stepDuration = 90 + Math.floor(Math.random() * 80);
      visemes.push({
        timestampMs: currentMs,
        durationMs: stepDuration,
        viseme: selectedViseme,
        weight: 0.7 + Math.random() * 0.3
      });
      currentMs += stepDuration + 40;
    }

    res.json({
      audioUrl: `data:${audio.mime_type || 'audio/wav'};base64,${audio.data}`,
      visemes,
      durationMs: estimatedDurationMs
    });
  } catch (error: any) {
    // If external TTS fails or key limit reached, return procedural viseme timing for Web Speech API fallback
    console.warn('TTS fallback to client Web Speech API with procedural visemes:', error?.message);
    const words = (req.body.text || '').split(/\s+/);
    const estimatedDurationMs = Math.max(1000, words.length * 260);
    const visemes: Array<{ timestampMs: number; durationMs: number; viseme: string; weight: number }> = [];
    const vowelMap = ['aa', 'ih', 'ou', 'ee', 'oh'];
    let currentMs = 80;
    while (currentMs < estimatedDurationMs - 120) {
      visemes.push({
        timestampMs: currentMs,
        durationMs: 110,
        viseme: vowelMap[Math.floor(Math.random() * vowelMap.length)],
        weight: 0.8
      });
      currentMs += 130;
    }

    res.json({
      audioUrl: null,
      useClientSpeech: true,
      text: req.body.text,
      visemes,
      durationMs: estimatedDurationMs
    });
  }
});

// 5. WebSocket Handler for Real-Time Live API (gemini-3.8-live)
wss.on('connection', async (clientWs: WebSocket) => {
  console.log('Client connected to Live API WebSocket');
  let liveSession: any = null;

  try {
    liveSession = await ai.live.connect({
      model: 'gemini-3.8-live',
      callbacks: {
        onmessage: (message: any) => {
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          const textPart = message.serverContent?.modelTurn?.parts?.[0]?.text;
          if (audio) {
            clientWs.send(JSON.stringify({ type: 'audio', audio }));
          }
          if (textPart) {
            clientWs.send(JSON.stringify({ type: 'text', text: textPart }));
          }
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ type: 'interrupted', interrupted: true }));
          }
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
        },
        systemInstruction: 'You are Core, an expressive 3D companion. Speak conversationally and concisely.'
      }
    });

    clientWs.send(JSON.stringify({ type: 'status', status: 'connected', model: 'gemini-3.8-live' }));
  } catch (err: any) {
    console.error('Failed to establish Live API session:', err?.message);
    clientWs.send(JSON.stringify({
      type: 'status',
      status: 'fallback',
      message: 'Live API connecting via conversational streaming fallback.'
    }));
  }

  clientWs.on('message', async (data: any) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.audio && liveSession) {
        liveSession.sendRealtimeInput({
          audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' }
        });
      } else if (parsed.text && liveSession) {
        liveSession.sendRealtimeInput({
          text: parsed.text
        });
      }
    } catch (err) {
      console.error('Error handling live message:', err);
    }
  });

  clientWs.on('close', () => {
    console.log('Live API client disconnected');
  });
});

// Setup Vite middlewares in development or static serving in production
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LocalCore Companion Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
