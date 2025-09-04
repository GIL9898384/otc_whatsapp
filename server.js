require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
      type: 'text',
      text: { body: `Seu código de verificação Tokstar é: *${code}*\nNão compartilhe com ninguém.` }
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

// Armazenamento simples em memória
const otcs = {};

// Endpoint para solicitar OTC (One Time Code)
app.post('/request-otc', async (req, res) => {
  const { phone } = req.body;
  console.log('Número recebido no /request-otc:', phone);
  const code = Math.floor(100000 + Math.random() * 900000); // 6 dígitos
  // Salva o código com expiração de 5 minutos
  otcs[phone] = { code, expires: Date.now() + 5 * 60 * 1000 };
  // Envia o código via WhatsApp
  const enviado = await enviarWhatsApp(phone, code);
  if (enviado) {
    res.json({ success: true, message: 'Código enviado via WhatsApp', code });
  } else {
    res.status(500).json({ success: false, message: 'Falha ao enviar WhatsApp' });
  }
});

// Endpoint para validar OTC
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
  delete otcs[phone]; // Remove após validação
  res.json({ success: true, message: 'Código validado!' });
});

app.listen(PORT, () => {
  console.log(`Servidor OTC WhatsApp rodando na porta ${PORT}`);
});
