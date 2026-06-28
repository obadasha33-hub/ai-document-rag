export interface FirecrawlScrapeResult {
  markdown: string
  title?: string
  description?: string
}

/**
 * Scrapes a web page URL using the Firecrawl API and returns clean markdown.
 * If FIRECRAWL_API_KEY is not set or represents a mock key, it returns mock content.
 */
export async function scrapeUrlWithFirecrawl(url: string): Promise<FirecrawlScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey || apiKey === 'mock_key' || apiKey.startsWith('mock-')) {
    return {
      markdown: `# Mock Crawled Page: ${url}\n\nThis is a mock text representation of the crawled website content. RAG features are fully enabled.`,
      title: 'Mock Crawled Website',
      description: 'Mock website crawl response for testing.'
    }
  }

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: url,
        formats: ['markdown'],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Firecrawl API responded with status ${response.status}: ${errText}`)
    }

    const json = await response.json()
    if (!json.success || !json.data) {
      throw new Error(json.error || 'Firecrawl scraping unsuccessful')
    }

    return {
      markdown: json.data.markdown || '',
      title: json.data.metadata?.title,
      description: json.data.metadata?.description,
    }
  } catch (err) {
    console.error('Firecrawl scraping execution failed:', err)
    throw err
  }
}
