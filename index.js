const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Endpoint para solicitar OTC (One Time Code)
app.post('/request-otc', (req, res) => {
  const { phone } = req.body;
  // Aqui você geraria o código e enviaria via WhatsApp (exemplo: Twilio, Z-API)
  // Exemplo: enviarWhatsApp(phone, code);
  const code = Math.floor(100000 + Math.random() * 900000); // 6 dígitos
  // Salvar código em memória/banco (exemplo simplificado)
  // ...
  res.json({ success: true, message: 'Código enviado via WhatsApp', code });
});

// Endpoint para validar OTC
app.post('/validate-otc', (req, res) => {
  const { phone, code } = req.body;
  // Aqui você validaria o código recebido
  // Exemplo: buscar código salvo e comparar
  // ...
  res.json({ success: true, message: 'Código validado!' });
});

app.listen(PORT, () => {
  console.log(`Servidor OTC WhatsApp rodando na porta ${PORT}`);
});
