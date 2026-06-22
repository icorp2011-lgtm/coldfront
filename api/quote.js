// api/quote.js — Coldfront proxy

const yahooFinance = require("yahoo-finance2").default;
try { yahooFinance.suppressNotices(["yahooSurvey"]); } catch (e) {}

const cache = {};

module.exports = async (req, res) => {
  const { yahoo, hist, period } = req.query;

  // CHART DATA — use direct fetch
  if (hist && period) {
    const symbol = String(hist).trim();
    const cacheKey = `CHART:${symbol}:${period}`;
    const now = Date.now();
    
    if (cache[cacheKey] && now - cache[cacheKey].t < 300000) {  // 5 min cache
      return res.json(cache[cacheKey].data);
    }

    try {
      // Convert period to days
      const periodDays = {
        "1m": 30, "3m": 90, "6m": 180, "1y": 365,
        "5y": 1825, "10y": 3650, "20y": 7300, "all": 10000
      };
      const days = periodDays[period] || 365;
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - (days * 86400);

      // Fetch from Yahoo directly
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${startTime}&period2=${endTime}`;
      const r = await fetch(url);
      
      if (!r.ok) {
        return res.json({ history: [] });
      }

      const chartData = await r.json();
      const quotes = chartData?.chart?.result?.[0]?.timestamp || [];
      const closes = chartData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      const highs = chartData?.chart?.result?.[0]?.indicators?.quote?.[0]?.high || [];
      const lows = chartData?.chart?.result?.[0]?.indicators?.quote?.[0]?.low || [];
      const opens = chartData?.chart?.result?.[0]?.indicators?.quote?.[0]?.open || [];

      const history = quotes
        .map((time, i) => ({
          time: time,
          close: closes[i] ? parseFloat(closes[i].toFixed(2)) : null,
          open: opens[i] ? parseFloat(opens[i].toFixed(2)) : null,
          high: highs[i] ? parseFloat(highs[i].toFixed(2)) : null,
          low: lows[i] ? parseFloat(lows[i].toFixed(2)) : null
        }))
        .filter(d => d.close && d.close > 0)
        .slice(-500);

      const result = { history };
      cache[cacheKey] = { t: now, data: result };
      return res.json(result);

    } catch (e) {
      console.error("Chart error:", e.message);
      return res.json({ history: [] });
    }
  }

  // LIVE QUOTES
  const yahSyms = String(yahoo || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!yahSyms.length) return res.json({ yahoo: {} });

  const cacheKey = "QUOTES:" + yahSyms.join(",");
  const now = Date.now();

  if (cache[cacheKey] && now - cache[cacheKey].t < 60000) {
    return res.json(cache[cacheKey].data);
  }

  try {
    const quotes = await yahooFinance.quote(yahSyms);
    const map = {};

    (Array.isArray(quotes) ? quotes : [quotes]).forEach(q => {
      if (q?.symbol) {
        map[q.symbol] = {
          price: q.regularMarketPrice ? parseFloat(q.regularMarketPrice) : null,
          low: q.fiftyTwoWeekLow ? parseFloat(q.fiftyTwoWeekLow) : null,
          high: q.fiftyTwoWeekHigh ? parseFloat(q.fiftyTwoWeekHigh) : null,
          prevClose: q.regularMarketPreviousClose ? parseFloat(q.regularMarketPreviousClose) : null,
          volume: q.regularMarketVolume ? parseInt(q.regularMarketVolume) : null,
          name: q.shortName || q.longName || q.symbol
        };
      }
    });

    const result = { yahoo: map };
    cache[cacheKey] = { t: now, data: result };
    return res.json(result);

  } catch (e) {
    console.error("Quote error:", e.message);
    return res.json({ yahoo: {} });
  }
};
