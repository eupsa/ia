export async function searchWeb(query, { url = process.env.SEARCH_URL || 'http://search:8080', fetcher = fetch, signal } = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 300) throw Error('Busca na internet inválida.');
  const params = new URLSearchParams({ q: query.trim(), format: 'json', language: 'pt-BR', safesearch: '1' });
  const response = await fetcher(`${url}/search?${params}`, { signal: signal || AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw Error('A busca na internet está indisponível.');
  const data = await response.json();
  return (data.results || []).filter(item => /^https?:\/\//i.test(item.url || '')).slice(0, 5).map(item => ({
    title: String(item.title || '').slice(0, 180),
    url: item.url,
    snippet: String(item.content || '').replace(/<[^>]+>/g, '').slice(0, 500),
    published: item.publishedDate || null,
  }));
}

export function needsLiveData(text) {
  return /\b(hoje|hj|agora|atual|recent|últim|ultim|ontem|amanhã|amanha|eleiç|eleic|president|notícia|noticia|cotação|cotacao|preço|preco|clima|tempo|novidade|202[5-9])\b/i.test(text);
}
