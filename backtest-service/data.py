"""
Data Layer - yfinance
Free, no API key needed, returns 20+ years of data.
"""
import json, os, hashlib
import pandas as pd
import yfinance as yf
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
CACHE_DIR = "./data_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

PERIOD_MAP = {
    "1mo":  "1mo",
    "3mo":  "3mo",
    "6mo":  "6mo",
    "1y":   "1y",
    "2y":   "2y",
    "5y":   "5y",
}

def _cache_path(symbol, period):
    key = hashlib.md5(f"{symbol}_{period}".encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{key}.json")

def _is_fresh(path):
    if not os.path.exists(path): return False
    return datetime.fromtimestamp(os.path.getmtime(path)).date() == datetime.today().date()

def fetch_ohlcv(symbol: str, period: str = "1y") -> pd.DataFrame:
    if period not in PERIOD_MAP:
        raise ValueError(f"Invalid period. Valid: {list(PERIOD_MAP)}")

    cache_path = _cache_path(symbol, period)
    if _is_fresh(cache_path):
        with open(cache_path) as f: records = json.load(f)
        df = pd.DataFrame(records)
        df["date"] = pd.to_datetime(df["date"])
        return df.set_index("date")

    raw = yf.download(symbol, period=period, progress=False, auto_adjust=True)

    if raw.empty:
        raise ValueError(f"No data found for '{symbol}'")

    # Fix yfinance MultiIndex columns (newer versions return ("Close", "AAPL") etc.)
    if isinstance(raw.columns, pd.MultiIndex):
        raw.columns = raw.columns.droplevel(1)

    df = raw[["Open", "High", "Low", "Close", "Volume"]].copy()
    df.columns = ["open", "high", "low", "close", "volume"]
    df.index.name = "date"
    df.dropna(inplace=True)

    if len(df) < 20:
        raise ValueError(f"Not enough data for '{symbol}' ({len(df)} rows)")

    records = df.reset_index()
    records["date"] = records["date"].astype(str)
    with open(cache_path, "w") as f:
        json.dump(records.to_dict(orient="records"), f)

    return df