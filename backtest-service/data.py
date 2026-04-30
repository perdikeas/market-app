"""
Data Layer - Alpha Vantage
"""
import json, os, hashlib, urllib.request
import pandas as pd
from datetime import date, timedelta, datetime
from dotenv import load_dotenv
 
load_dotenv()
ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY", "demo")
CACHE_DIR = "./data_cache"
os.makedirs(CACHE_DIR, exist_ok=True)
 
PERIOD_DAYS = {"1mo":30,"3mo":90,"6mo":99,"1y":99,"2y":99,"5y":99}
 
def _cache_path(symbol, period):
    key = hashlib.md5(f"{symbol}_{period}".encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{key}.json")
 
def _is_fresh(path):
    if not os.path.exists(path): return False
    return datetime.fromtimestamp(os.path.getmtime(path)).date() == date.today()
 
def fetch_ohlcv(symbol: str, period: str = "1y") -> pd.DataFrame:
    if period not in PERIOD_DAYS:
        raise ValueError(f"Invalid period. Valid: {list(PERIOD_DAYS)}")
 
    cache_path = _cache_path(symbol, period)
    if _is_fresh(cache_path):
        with open(cache_path) as f: records = json.load(f)
        df = pd.DataFrame(records)
        df["date"] = pd.to_datetime(df["date"])
        return df.set_index("date")
 
    output_size = "compact"
    url = (f"https://www.alphavantage.co/query?function=TIME_SERIES_DAILY"
           f"&symbol={symbol}&outputsize={output_size}&apikey={ALPHA_VANTAGE_KEY}")
 
    with urllib.request.urlopen(url) as resp:
        raw = json.loads(resp.read().decode())
 
    if "Time Series (Daily)" not in raw:
        info = raw.get("Information") or raw.get("Note") or str(raw)
        raise ValueError(f"No data for '{symbol}': {info[:200]}")
 
    rows = [{"date": pd.Timestamp(d),
             "open": float(v["1. open"]), "high": float(v["2. high"]),
             "low": float(v["3. low"]),  "close": float(v["4. close"]),
             "volume": float(v["5. volume"])}
            for d, v in raw["Time Series (Daily)"].items()]
 
    df = pd.DataFrame(rows).sort_values("date").set_index("date")
    cutoff = pd.Timestamp(date.today() - timedelta(days=PERIOD_DAYS[period]))
    df = df[df.index >= cutoff]
 
    if len(df) < 20:
        raise ValueError(f"Not enough data for '{symbol}' ({len(df)} rows)")
 
    records = df.reset_index()
    records["date"] = records["date"].astype(str)
    with open(cache_path, "w") as f: json.dump(records.to_dict(orient="records"), f)
    return df