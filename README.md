# LiuSocial Video Server

Servidor de vídeos para o app LiuSocial usando Pexels API e MongoDB.

## Configuração

1. **Instalar dependências:**
```bash
npm install
```

2. **Configurar variáveis de ambiente:**
```bash
cp .env.example .env
```

Editar `.env` e adicionar:
- `PEXELS_API_KEY` - Obter em https://www.pexels.com/api/
- `MONGODB_URI` - URL do MongoDB (padrão: `mongodb://localhost:27017/liusocial`)

3. **Iniciar MongoDB:**
```bash
# Windows (se instalado localmente)
net start MongoDB

# Ou usar Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

4. **Iniciar servidor:**
```bash
npm start

# Ou com auto-reload
npm run dev
```

## Endpoints

### Vídeos

#### GET /api/videos
Lista vídeos com paginação.

**Query params:**
- `page` (opcional, padrão: 1)
- `limit` (opcional, padrão: 20)

**Exemplo:**
```bash
curl http://localhost:3000/api/videos?page=1&limit=10
```

#### GET /api/videos/:id
Busca vídeo específico por ID.

**Exemplo:**
```bash
curl http://localhost:3000/api/videos/507f1f77bcf86cd799439011
```

#### POST /api/videos/sync
Sincroniza vídeos da Pexels para MongoDB.

**Body:**
```json
{
  "query": "party",
  "perPage": 15,
  "page": 1
}
```

**Exemplo:**
```bash
curl -X POST http://localhost:3000/api/videos/sync \
  -H "Content-Type: application/json" \
  -d '{"query":"party","perPage":20}'
```

#### POST /api/videos/:id/view
Incrementa contador de visualizações.

**Exemplo:**
```bash
curl -X POST http://localhost:3000/api/videos/507f1f77bcf86cd799439011/view
```

#### POST /api/videos/:id/like
Incrementa contador de likes.

**Exemplo:**
```bash
curl -X POST http://localhost:3000/api/videos/507f1f77bcf86cd799439011/like
```

## Modelo de Dados (MongoDB)

```javascript
{
  pexelsId: Number,        // ID único da Pexels
  url: String,             // URL do vídeo
  thumbnail: String,       // URL da thumbnail
  duration: Number,        // Duração em segundos
  width: Number,
  height: Number,
  user: {
    name: String,
    url: String
  },
  tags: [String],
  views: Number,           // Contador de visualizações
  likes: Number,           // Contador de likes
  createdAt: Date,
  updatedAt: Date
}
```

## Uso no Flutter

```dart
// Exemplo de integração
class VideoService {
  final String baseUrl = 'http://localhost:3000/api';
  
  Future<List<Video>> fetchVideos({int page = 1}) async {
    final response = await http.get(
      Uri.parse('$baseUrl/videos?page=$page&limit=20'),
    );
    
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return (data['videos'] as List)
          .map((v) => Video.fromJson(v))
          .toList();
    }
    throw Exception('Erro ao buscar vídeos');
  }
  
  Future<void> syncVideos({String query = 'party'}) async {
    await http.post(
      Uri.parse('$baseUrl/videos/sync'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'query': query, 'perPage': 30}),
    );
  }
}
```

## Próximos Passos

- [ ] Criar service no Flutter para consumir API
- [ ] Implementar player de vídeo no app
- [ ] Adicionar busca por tags
- [ ] Implementar sistema de favoritos
- [ ] Adicionar autenticação nos endpoints
