export interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

/**
 * Searches the web using the Tavily Search API.
 * If TAVILY_API_KEY is not set or represents a mock key, it returns an empty array.
 */
export async function searchTavily(query: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey || apiKey === 'mock_key' || apiKey.startsWith('mock-')) {
    return []
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: 'basic',
        include_answer: false,
        max_results: 5,
      }),
    })

    if (!response.ok) {
      console.warn(`Tavily API responded with status ${response.status}`)
      return []
    }

    const data = await response.json()
    return (data.results || []).map((r: any) => ({
      title: r.title || 'Untitled Result',
      url: r.url || '',
      content: r.content || '',
      score: r.score || 0.8,
    }))
  } catch (err) {
    console.error('Tavily search execution failed:', err)
    return []
  }
}
