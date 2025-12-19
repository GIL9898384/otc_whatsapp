require('dotenv').config();
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Conexão MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/liusocial')
  .then(() => {
    console.log('✅ Conectado ao MongoDB');
  })
  .catch(err => {
    console.error('❌ Erro ao conectar MongoDB:', err);
  });

// Schema para Vídeos
const videoSchema = new mongoose.Schema({
  pexelsId: { type: Number, unique: true, required: true },
  url: { type: String, required: true },
  thumbnail: String,
  duration: Number,
  width: Number,
  height: Number,
  user: {
    name: String,
    url: String
  },
  tags: [String],
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  consumed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Video = mongoose.model('Video', videoSchema);

// Função para enviar mensagem via WhatsApp Business API
async function enviarWhatsApp(phone, code) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  try {
    // Remove qualquer caractere não numérico (incluindo '+', espaços, traços)
    const phoneDigits = String(phone).replace(/\D/g, '');
    console.log('Número enviado para a API do WhatsApp:', phoneDigits);
    await axios.post(url, {
      messaging_product: 'whatsapp',
      to: phoneDigits,
      type: 'template',
      template: {
        name: 'codigo_verificacao',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: String(code) }
            ]
          },
          {
            type: 'button',
            sub_type: 'url',
            index: 0,
            parameters: [
              { type: 'text', text: 'codigo' }
            ]
          }
        ]
      }
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return true;
  } catch (error) {
    console.error('Erro ao enviar WhatsApp:', error.response?.data || error.message);
    return false;
  }
}

// Função para buscar vídeos da Pexels API
async function fetchVideosFromPexels(query = 'party', perPage = 15, page = 1) {
  const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
  
  if (!PEXELS_API_KEY) {
    throw new Error('PEXELS_API_KEY não configurada no .env');
  }

  try {
    const response = await axios.get('https://api.pexels.com/videos/search', {
      headers: {
        'Authorization': PEXELS_API_KEY
      },
      params: {
        query,
        per_page: perPage,
        page
      }
    });

    return response.data;
  } catch (error) {
    console.error('❌ Erro ao buscar vídeos da Pexels:', error.response?.data || error.message);
    throw error;
  }
}

// Função para salvar vídeos no MongoDB (apenas 9x16)
async function saveVideoToDatabase(videoData) {
  try {
    // Filtrar apenas vídeos verticais (9x16)
    const aspectRatio = videoData.width / videoData.height;
    const isVertical = aspectRatio < 0.7; // 9/16 = 0.5625
    
    if (!isVertical) {
      return null;
    }
    
    const videoFile = videoData.video_files.find(file => file.quality === 'hd' || file.quality === 'sd');
    
    const video = new Video({
      pexelsId: videoData.id,
      url: videoFile?.link || videoData.video_files[0].link,
      thumbnail: videoData.image,
      duration: videoData.duration,
      width: videoData.width,
      height: videoData.height,
      user: {
        name: videoData.user.name,
        url: videoData.user.url
      },
      tags: Array.isArray(videoData.tags) ? videoData.tags : (typeof videoData.tags === 'string' ? videoData.tags.split(',').map(tag => tag.trim()) : [])
    });

    await video.save();
    return video;
  } catch (error) {
    if (error.code === 11000) {
      return null;
    }
    throw error;
  }
}

// Auto-sync: manter 200 vídeos
async function autoSyncVideos() {
  try {
    const count = await Video.countDocuments({ consumed: false });
    console.log(`📊 Vídeos disponíveis: ${count}/200`);
    
    if (count < 50) {
      console.log('🔄 Iniciando auto-sync...');
      const queries = ['party', 'dance', 'music', 'celebration', 'fun'];
      let totalSaved = 0;
      
      for (const query of queries) {
        for (let page = 1; page <= 5; page++) {
          const current = await Video.countDocuments({ consumed: false });
          if (current >= 200) break;
          
          try {
            const pexelsData = await fetchVideosFromPexels(query, 15, page);
            for (const videoData of pexelsData.videos) {
              const result = await saveVideoToDatabase(videoData);
              if (result) totalSaved++;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error(`❌ Erro ${query} p${page}:`, error.message);
          }
        }
      }
      console.log(`✅ Auto-sync: ${totalSaved} vídeos 9x16 adicionados`);
    }
  } catch (error) {
    console.error('❌ Erro no auto-sync:', error);
  }
}

// ===== ENDPOINTS DE VÍDEOS =====

// GET /api/videos - Buscar vídeos não consumidos
app.get('/api/videos', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const videos = await Video.find({ consumed: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Video.countDocuments({ consumed: false });

    if (total < 50) {
      autoSyncVideos();
    }

    res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      videos
    });
  } catch (error) {
    console.error('❌ Erro ao buscar vídeos:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar vídeos' });
  }
});

// GET /api/videos/:id - Buscar vídeo específico
app.get('/api/videos/:id', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ success: false, message: 'Vídeo não encontrado' });
    }

    res.json({ success: true, video });
  } catch (error) {
    console.error('❌ Erro ao buscar vídeo:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar vídeo' });
  }
});

// POST /api/videos/sync - Sincronizar vídeos da Pexels para MongoDB
app.post('/api/videos/sync', async (req, res) => {
  try {
    const { query = 'party', perPage = 15, page = 1 } = req.body;

    console.log(`🔄 Sincronizando vídeos da Pexels: query="${query}", page=${page}`);
    
    const pexelsData = await fetchVideosFromPexels(query, perPage, page);
    
    let saved = 0;
    let skipped = 0;

    for (const videoData of pexelsData.videos) {
      const result = await saveVideoToDatabase(videoData);
      if (result) {
        saved++;
      } else {
        skipped++;
      }
    }

    console.log(`✅ Sincronização concluída: ${saved} novos, ${skipped} já existentes`);

    res.json({
      success: true,
      message: 'Sincronização concluída',
      saved,
      skipped,
      total: pexelsData.videos.length
    });
  } catch (error) {
    console.error('❌ Erro ao sincronizar vídeos:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Erro ao sincronizar vídeos' 
    });
  }
});

// POST /api/videos/auto-sync - Forçar auto-sync até 200 vídeos
app.post('/api/videos/auto-sync', async (req, res) => {
  try {
    const count = await Video.countDocuments({ consumed: false });
    res.json({ success: true, message: 'Auto-sync iniciado em background', current: count });
    
    // Executa em background
    autoSyncVideos();
  } catch (error) {
    console.error('❌ Erro ao iniciar auto-sync:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/videos/:id/view - Marcar como consumido
app.post('/api/videos/:id/view', async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 }, consumed: true },
      { new: true }
    );

    if (!video) {
      return res.status(404).json({ success: false, message: 'Vídeo não encontrado' });
    }

    // Limpar vídeos consumidos com +7 dias
    Video.deleteMany({
      consumed: true,
      createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).then(result => {
      if (result.deletedCount > 0) {
        console.log(`🗑️ ${result.deletedCount} vídeos antigos removidos`);
      }
    });

    res.json({ success: true, views: video.views });
  } catch (error) {
    console.error('❌ Erro ao incrementar visualizações:', error);
    res.status(500).json({ success: false, message: 'Erro ao incrementar visualizações' });
  }
});

// POST /api/videos/:id/like - Incrementar likes
app.post('/api/videos/:id/like', async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );

    if (!video) {
      return res.status(404).json({ success: false, message: 'Vídeo não encontrado' });
    }

    res.json({ success: true, likes: video.likes });
  } catch (error) {
    console.error('❌ Erro ao incrementar likes:', error);
    res.status(500).json({ success: false, message: 'Erro ao incrementar likes' });
  }
});

// ===== ENDPOINTS LEGADOS (WhatsApp OTC) =====
const otcs = {};

app.post('/request-otc', async (req, res) => {
  const { phone } = req.body;
  console.log('Número recebido no /request-otc:', phone);
  const code = Math.floor(100000 + Math.random() * 900000);
  console.log(`[OTC] Código gerado para ${phone}: ${code}`);
  otcs[phone] = { code, expires: Date.now() + 5 * 60 * 1000 };
  const enviado = await enviarWhatsApp(phone, code);
  if (enviado) {
    res.json({ success: true, message: 'Código enviado via WhatsApp' });
  } else {
    res.status(500).json({ success: false, message: 'Falha ao enviar WhatsApp' });
  }
});

app.post('/validate-otc', (req, res) => {
  const { phone, code } = req.body;
  const registro = otcs[phone];
  if (!registro) {
    return res.status(400).json({ success: false, message: 'Código não solicitado ou expirado.' });
  }
  if (Date.now() > registro.expires) {
    delete otcs[phone];
    return res.status(400).json({ success: false, message: 'Código expirado.' });
  }
  if (String(registro.code) !== String(code)) {
    return res.status(400).json({ success: false, message: 'Código incorreto.' });
  }
  delete otcs[phone];
  res.json({ success: true, message: 'Código validado!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de Vídeos LiuSocial rodando na porta ${PORT}`);
  console.log(`📹 Endpoints disponíveis:`);
  console.log(`   GET  /api/videos - Listar vídeos`);
  console.log(`   GET  /api/videos/:id - Detalhes do vídeo`);
  console.log(`   POST /api/videos/sync - Sincronizar com Pexels`);
  console.log(`   POST /api/videos/:id/view - Incrementar views`);
  console.log(`   POST /api/videos/:id/like - Incrementar likes`);
});
