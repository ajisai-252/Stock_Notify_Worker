type Env = {
  SLACK_WEBHOOK_URL: string;
  SLACK_TEST_TOKEN: string;
  TWELVE_DATA_API_KEY: string;
  DB: D1Database;
};

type TwelveDataQuote = {
  symbol?: string;
  close?: string;
  currency?: string;
  exchange?: string;
  timestamp?: number;
  datetime?: string;
  is_market_open?: boolean;
  code?: number;
  message?: string;
  status?: string;
};

const DEFAULT_SYMBOL = 'QQQ';
const SYMBOL_PATTERN = /^[A-Z0-9.:^=-]{1,20}$/i;
const TWELVE_DATA_TIMEOUT_MS = 5000;
const CACHE_CONTROL_HEADER = 'public, max-age=15';


type StockPricePayload = {
  symbol: string;
  price: number;
  currency: string | null;
  exchange: string | null;
  marketState: string | null;
  marketTime: number | null;
  marketTimeIso: string | null;
};

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': CACHE_CONTROL_HEADER,
      ...headers
    }
  });
}

function validateSymbol(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol);
}

async function fetchStockQuote(symbol: string, env: Env): Promise<TwelveDataQuote | null> {
  if (!env.TWELVE_DATA_API_KEY) {
    throw new Error('TWELVE_DATA_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TWELVE_DATA_TIMEOUT_MS);

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(env.TWELVE_DATA_API_KEY)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });
  } catch (error) {
    console.error('Twelve Data request failed', { symbol, error });
    throw new Error('Failed to fetch stock price from upstream service');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 429) {
      console.error('Twelve Data rate limit exceeded', { symbol, status: 429 });
      throw new Error('Twelve Data rate limit exceeded');
    }

    console.error('Twelve Data API returned non-OK response', {
      symbol,
      status: response.status
    });
    throw new Error('Failed to fetch stock price from upstream service');
  }

  let data: TwelveDataQuote;
  try {
    data = (await response.json()) as TwelveDataQuote;
  } catch (error) {
    console.error('Twelve Data response JSON parse failed', { symbol, error });
    throw new Error('Invalid response from upstream service');
  }

  if (data.code === 429 || data.status === '429') {
    console.error('Twelve Data rate limit exceeded', { symbol, upstream: data });
    throw new Error('Twelve Data rate limit exceeded');
  }

  if (data.code || data.status === 'error') {
    console.error('Twelve Data error response received', { symbol, upstreamError: data });
    throw new Error(data.message || 'Failed to fetch stock price from upstream service');
  }

  if (!data || Number.isNaN(Number(data.close))) {
    return null;
  }

  return data;
}



async function saveStockPrice(db: D1Database, payload: StockPricePayload): Promise<void> {
  await db
    .prepare(`
      INSERT INTO stock_prices (
        symbol,
        price,
        currency,
        exchange,
        market_state,
        market_time,
        market_time_iso,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      payload.symbol,
      payload.price,
      payload.currency,
      payload.exchange,
      payload.marketState,
      payload.marketTime,
      payload.marketTimeIso,
      new Date().toISOString()
    )
    .run();
}

function formatQuotePayload(symbol: string, quote: TwelveDataQuote): StockPricePayload {
  const price = Number(quote.close);
  const marketTime = typeof quote.timestamp === 'number' ? quote.timestamp : null;

  return {
    symbol: quote.symbol ?? symbol,
    price,
    currency: quote.currency ?? null,
    exchange: quote.exchange ?? null,
    marketState: typeof quote.is_market_open === 'boolean' ? (quote.is_market_open ? 'OPEN' : 'CLOSED') : null,
    marketTime,
    marketTimeIso: marketTime !== null ? new Date(marketTime * 1000).toISOString() : quote.datetime ? new Date(quote.datetime).toISOString() : null
  };
}


function parseYyyyMmDd(dateText: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return null;
  }

  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

type HistoryRow = {
  symbol: string;
  price: number;
  currency: string | null;
  exchange: string | null;
  market_state: string | null;
  market_time: number | null;
  market_time_iso: string | null;
  created_at: string;
};

async function getStockPriceHistory(requestUrl: URL, env: Env): Promise<Response> {
  const symbol = (requestUrl.searchParams.get('symbol') ?? DEFAULT_SYMBOL).trim();
  if (!validateSymbol(symbol)) {
    return jsonResponse(
      {
        error: 'Invalid symbol parameter. Use 1-20 chars matching /^[A-Z0-9.:^=-]{1,20}$/i'
      },
      400
    );
  }

  const now = new Date();
  const defaultFrom = addDays(now, -30);

  const fromParam = requestUrl.searchParams.get('from');
  const toParam = requestUrl.searchParams.get('to');

  let fromDate = fromParam ? parseYyyyMmDd(fromParam) : defaultFrom;
  let toDate = toParam ? parseYyyyMmDd(toParam) : now;

  if (!fromDate || !toDate) {
    return jsonResponse({ error: 'from and to must be in YYYY-MM-DD format' }, 400);
  }

  fromDate = new Date(`${fromDate.toISOString().slice(0,10)}T00:00:00.000Z`);
  toDate = new Date(`${toDate.toISOString().slice(0,10)}T23:59:59.999Z`);

  if (fromDate.getTime() > toDate.getTime()) {
    return jsonResponse({ error: 'from must be less than or equal to to' }, 400);
  }

  const limitParam = requestUrl.searchParams.get('limit');
  let limit = 100;

  if (limitParam !== null) {
    if (!/^\d+$/.test(limitParam)) {
      return jsonResponse({ error: 'limit must be an integer between 1 and 500' }, 400);
    }

    limit = Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return jsonResponse({ error: 'limit must be an integer between 1 and 500' }, 400);
    }
  }

  try {
    const result = await env.DB
      .prepare(`
        SELECT
          symbol,
          price,
          currency,
          exchange,
          market_state,
          market_time,
          market_time_iso,
          created_at
        FROM stock_prices
        WHERE symbol = ?
          AND created_at >= ?
          AND created_at <= ?
        ORDER BY created_at ASC
        LIMIT ?
      `)
      .bind(symbol, fromDate.toISOString(), toDate.toISOString(), limit)
      .all<HistoryRow>();

    const rows = result.results ?? [];

    return jsonResponse({
      symbol,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      count: rows.length,
      items: rows.map((row) => ({
        symbol: row.symbol,
        price: row.price,
        currency: row.currency,
        exchange: row.exchange,
        marketState: row.market_state,
        marketTime: row.market_time,
        marketTimeIso: row.market_time_iso,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error('Failed to fetch stock price history from D1', { symbol, error });
    return jsonResponse({ error: 'Failed to fetch stock price history' }, 500);
  }
}

async function getStockPrice(symbol: string, env: Env): Promise<Response> {
  let quote: TwelveDataQuote | null;
  try {
    quote = await fetchStockQuote(symbol, env);
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 502);
  }

  if (!quote || Number.isNaN(Number(quote.close))) {
    return jsonResponse(
      {
        error: 'Stock price not found',
        symbol
      },
      404
    );
  }

  const payload = formatQuotePayload(symbol, quote);

  try {
    await saveStockPrice(env.DB, payload);
  } catch (error) {
    console.error('Failed to save stock price to D1', { symbol: payload.symbol, error });
  }

  return jsonResponse(payload);
}

async function postToSlack(webhookUrl: string, message: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text: message })
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '[unreadable slack response body]');
    throw new Error(`Slack webhook request failed with status ${response.status}: ${responseBody}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405, { Allow: 'GET' });
    }

    const url = new URL(request.url);

    if (url.pathname === '/history') {
      return getStockPriceHistory(url, env);
    }

    if (url.pathname === '/slack-test') {
      if (!env.SLACK_WEBHOOK_URL) {
        return jsonResponse({ error: 'SLACK_WEBHOOK_URL is not set' }, 500, {
          'Cache-Control': 'no-store'
        });
      }

      const token = url.searchParams.get('token');
      if (!token || token !== env.SLACK_TEST_TOKEN) {
        return jsonResponse({ error: 'Forbidden' }, 403, {
          'Cache-Control': 'no-store'
        });
      }

      const message = ['<!channel>', 'Slack test notification', 'Cloudflare Workers integration is working'].join('\n');

      try {
        await postToSlack(env.SLACK_WEBHOOK_URL, message);
        return jsonResponse({ ok: true }, 200, { 'Cache-Control': 'no-store' });
      } catch (error) {
        console.error('Failed to send Slack test notification', { error });
        return jsonResponse({ error: 'Failed to send Slack test notification' }, 500, {
          'Cache-Control': 'no-store'
        });
      }
    }

    const symbol = (url.searchParams.get('symbol') ?? DEFAULT_SYMBOL).trim();

    if (!validateSymbol(symbol)) {
      return jsonResponse(
        {
          error: 'Invalid symbol parameter. Use 1-20 chars matching /^[A-Z0-9.:^=-]{1,20}$/i'
        },
        400
      );
    }

    return getStockPrice(symbol, env);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    console.log(`Cron triggered at ${new Date(controller.scheduledTime).toISOString()}`);

    if (!env.SLACK_WEBHOOK_URL) {
      console.error('SLACK_WEBHOOK_URL is not set. Scheduled notification skipped.');
      return;
    }

    try {
      const quote = await fetchStockQuote(DEFAULT_SYMBOL, env);

      if (!quote || Number.isNaN(Number(quote.close))) {
        console.error('Stock price not found for scheduled notification', { symbol: DEFAULT_SYMBOL });
        return;
      }

      const payload = formatQuotePayload(DEFAULT_SYMBOL, quote);

      try {
        await saveStockPrice(env.DB, payload);
      } catch (error) {
        console.error('Failed to save stock price to D1', { symbol: payload.symbol, error });
      }
      const message = [
        '<!channel>',
        `銘柄コード: ${payload.symbol}`,
        `現在価格: ${payload.price}`,
        `通貨: ${payload.currency ?? 'N/A'}`,
        `市場状態: ${payload.marketState ?? 'N/A'}`,
        `時刻(ISO): ${payload.marketTimeIso ?? new Date().toISOString()}`
      ].join('\n');

      await postToSlack(env.SLACK_WEBHOOK_URL, message);
      console.log('Scheduled stock notification sent to Slack');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';

      if (!env.SLACK_WEBHOOK_URL) {
        console.error('Scheduled stock notification failed', {
          symbol: DEFAULT_SYMBOL,
          reason
        });
        return;
      }

      const errorMessage = ['<!channel>', `株価取得に失敗しました`, `銘柄コード: ${DEFAULT_SYMBOL}`, `理由: ${reason}`].join('\n');

      try {
        await postToSlack(env.SLACK_WEBHOOK_URL, errorMessage);
        console.log('Scheduled stock error notification sent to Slack');
      } catch (slackError) {
        console.error('Scheduled stock notification failed', {
          symbol: DEFAULT_SYMBOL,
          reason,
          slackError
        });
      }
    }
  }
};
