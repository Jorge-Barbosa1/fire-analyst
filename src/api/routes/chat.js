import express from 'express';

const router = express.Router();

// Configuração para OpenRouter
const openaiConfig = {
  apiKey: process.env.DP_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://proj4-severuspt.onrender.com/",
    "X-Title": "SeverusBot"
  }
};

// RAG search via rag-vector-lab (Python service, ver services/ragvl_server.py)
const RAGVL_URL = process.env.RAGVL_URL || 'http://127.0.0.1:8765';

async function performEnhancedRAGSearch(query) {
  const res = await fetch(`${RAGVL_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, k: 5 }),
  });
  if (!res.ok) throw new Error(`ragvl service error: ${res.status}`);
  const { results } = await res.json();

  if (!results || results.length === 0) {
    return { context: '', results: [] };
  }

  const context = results
    .map((r, i) => `[${i + 1}] (${r.source}) ${r.text}`)
    .join('\n\n');

  return { context, results: results.map((r) => ({ content: r.text, score: r.score, source: r.source })) };
}

router.post('/', async (req, res) => {
  try {
    const { messages } = req.body;
    const lastUserMessage = messages[messages.length - 1];

    if (!messages?.length || lastUserMessage?.role !== "user") {
      return res.status(400).json({ error: "Mensagem de usuário inválida" });
    }

    // RAG search
    let context = "";
    let ragStatus = "sem_contexto";
    let searchResults = [];
    
    try {
      const ragPromise = performEnhancedRAGSearch(lastUserMessage.content);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('RAG timeout')), 10000)
      );
      
      const ragResult = await Promise.race([ragPromise, timeoutPromise]);
      context = ragResult.context;
      searchResults = ragResult.results;
      ragStatus = context ? "contexto_encontrado" : "sem_contexto";
      
    } catch (ragError) {
      console.error("Erro/Timeout RAG:", ragError);
      ragStatus = "erro_rag";
    }

    // System prompt
    const systemPrompt = `Você é o SeverusBot, um assistente especializado em incêndios florestais em Portugal. ${
      context
        ? `Use o seguinte contexto (excertos de relatórios do ICNF) para responder:\n\n${context}\n\nRegras: use apenas números que estejam no contexto, sem os alterar nem misturar anos diferentes; indique de que relatório/ano e período vêm os dados; se o contexto não responder à pergunta, diga-o em vez de inventar.`
        : "Responda com base no seu conhecimento geral sobre incêndios florestais."
    }`;

    // Prepare messages for OpenAI
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    // Call OpenRouter API
    const response = await fetch(`${openaiConfig.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiConfig.apiKey}`,
        'Content-Type': 'application/json',
        ...openaiConfig.defaultHeaders
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openrouter/free",
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";

    res.json({
      reply: assistantMessage, // campo lido pelo ChatWidget
      message: assistantMessage,
      ragStatus,
      sourcesUsed: searchResults.length,
      sources: searchResults.map(r => ({
        content: r.content.substring(0, 200) + '...',
        score: r.score
      }))
    });

  } catch (error) {
    console.error("Erro no chat:", error);
    res.status(500).json({ 
      error: "Erro ao processar mensagem",
      details: error.message 
    });
  }
});

export default router;
