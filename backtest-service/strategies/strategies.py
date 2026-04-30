"""
Strategies
----------
Each function receives a DataFrame with OHLCV data and returns a
pd.Series of signals aligned to the same index:
  +1 = buy signal
  -1 = sell signal
   0 = hold / no signal

All strategies are stateless and purely functional.
"""

import pandas as pd
import numpy as np
from statsmodels.tsa.stattools import coint
from statsmodels.regression.linear_model import OLS
import statsmodels.api as sm


# ─────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────

def compute_atr(df, period=14):
    high, low, close = df["high"], df["low"], df["close"]
    prev = close.shift(1)
    tr = pd.concat([
        (high - low),
        (high - prev).abs(),
        (low - prev).abs(),
    ], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def _rsi_series(close: pd.Series, period: int = 14) -> pd.Series:
    """Pure helper: compute RSI from a price Series."""
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def regime_filter(df, period=200):
    return df["close"] > df["close"].rolling(period).mean()


# ─────────────────────────────────────────────
# 1. SMA Crossover
# ─────────────────────────────────────────────
def sma_crossover(df, fast=20, slow=50, use_regime_filter=False):
    close = df["close"]
    fast_ma = close.rolling(fast).mean()
    slow_ma = close.rolling(slow).mean()
    ma_dist = (fast_ma - slow_ma) / slow_ma

    # Only fire on the transition, not every day the condition holds
    signals = pd.Series(0, index=df.index)
    signals[(ma_dist > 0.005) & (ma_dist.shift(1) <= 0.005)]   =  1
    signals[(ma_dist < -0.005) & (ma_dist.shift(1) >= -0.005)] = -1

    if use_regime_filter:
        bull = regime_filter(df)
        signals[(signals == 1) & ~bull] = 0

    return signals

# ─────────────────────────────────────────────
# 2. RSI Mean Reversion
# ─────────────────────────────────────────────
def rsi_strategy(df: pd.DataFrame, period: int = 14, 
                 oversold: int = 45, overbought: int = 55, 
                 use_trend_filter: bool = False) -> pd.Series:
    
    rsi = _rsi_series(df["close"], period)
    signals = pd.Series(0, index=df.index)
    
    # Core Signals
    buy_signal = (rsi > oversold) & (rsi.shift(1) <= oversold)
    sell_signal = (rsi < overbought) & (rsi.shift(1) >= overbought)
    
    signals[buy_signal] = 1
    signals[sell_signal] = -1
    
    # Optimization: Trend Filter
    # Only buy if the price is above the 200-day Moving Average
    if use_trend_filter:
        bull = regime_filter(df)
        signals[(signals == 1) & ~bull] = 0
        
    return signals


def bollinger_breakout(df, period=20, std_dev=2.0, use_regime_filter=True):
    close = df["close"]
    sma = close.rolling(period).mean()
    std = close.rolling(period).std()
    upper = sma + std_dev * std
    # We keep the lower band for the calculation, but we won't use it for the exit
    lower = sma - std_dev * std

    signals = pd.Series(0, index=df.index)
    
    # ENTRY: Price crosses ABOVE the Upper Band
    signals[(close > upper) & (close.shift(1) <= upper.shift(1))] = 1
    
    # EXIT: Price crosses BELOW the Middle Band (SMA)
    # This is a much tighter exit than the lower band
    signals[(close < sma) & (close.shift(1) >= sma.shift(1))] = -1

    if use_regime_filter:
        bull = regime_filter(df)
        # Use .fillna(False) to prevent the "warm-up" period from breaking signals
        signals[(signals == 1) & ~bull.fillna(False)] = 0

    return signals

# ─────────────────────────────────────────────
# 4. MACD Crossover
# ─────────────────────────────────────────────
def macd_strategy(df: pd.DataFrame, fast: int = 12, slow: int = 26,
                  signal: int = 9, use_regime_filter=True) -> pd.Series:
    close = df["close"]
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()

    signals = pd.Series(0, index=df.index)
    signals[(macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1))] =  1
    signals[(macd_line < signal_line) & (macd_line.shift(1) >= signal_line.shift(1))] = -1

    if use_regime_filter:
        bull = regime_filter(df)
        signals[~bull & (signals == 1)] = 0

    return signals


# ─────────────────────────────────────────────
# 5. Mean Reversion (Z-Score)
# ─────────────────────────────────────────────
def mean_reversion(df, period=20, entry_z=-1.5, exit_z=0.5, use_regime_filter=True):
    close = df["close"]
    rolling_mean = close.rolling(period).mean()
    rolling_std  = close.rolling(period).std()
    z_score = (close - rolling_mean) / rolling_std.replace(0, np.nan)

    signals = pd.Series(0, index=df.index)
    signals[(z_score < entry_z) & (z_score.shift(1) >= entry_z)] =  1
    signals[(z_score > exit_z)  & (z_score.shift(1) <= exit_z)]  = -1

    if use_regime_filter:
        bull = regime_filter(df)
        signals[~bull & (signals == 1)] = 0

    return signals


# ─────────────────────────────────────────────
# 6. Time Series Momentum
# ─────────────────────────────────────────────
def momentum_strategy(df, lookback=90, short_lookback=20, holding_period=1, use_regime_filter=False):
    close = df["close"]
    
    # Long-term trend (126 days)
    long_term_momo = close > close.shift(lookback)
    
    # Short-term trend (20 days) - ensures we aren't buying a massive dip
    short_term_momo = close > close.shift(short_lookback)
    
    signals = pd.Series(0, index=df.index)
    
    # Buy only when both long and short term agree
    signals[long_term_momo & short_term_momo] = 1
    signals[~long_term_momo] = -1 # Exit if the big trend breaks
    
    return signals


# ─────────────────────────────────────────────
# 7. Multi-Signal Combination
# ─────────────────────────────────────────────
def multi_signal(df, rsi_period=14, rsi_oversold=35, macd_fast=12,
                 macd_slow=26, macd_signal_period=9,
                 min_signals=2, use_regime_filter=True):
    close = df["close"]
    rsi = _rsi_series(close, rsi_period)

    ema_fast = close.ewm(span=macd_fast, adjust=False).mean()
    ema_slow = close.ewm(span=macd_slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=macd_signal_period, adjust=False).mean()
    macd_bull = macd_line > signal_line
    price_above = close > close.rolling(10).mean()

    buy_score  = (rsi < rsi_oversold).astype(int) + macd_bull.astype(int) + price_above.astype(int)
    sell_score = (rsi > 70).astype(int) + (~macd_bull).astype(int) + (~price_above).astype(int)

    signals = pd.Series(0, index=df.index)
    signals[(buy_score >= min_signals)  & (buy_score.shift(1)  < min_signals)]  =  1
    signals[(sell_score >= min_signals) & (sell_score.shift(1) < min_signals)]  = -1

    if use_regime_filter:
        bull = regime_filter(df)
        signals[~bull & (signals == 1)] = 0

    return signals


# ─────────────────────────────────────────────
# 8. Volatility Breakout
# ─────────────────────────────────────────────
def volatility_breakout(df, atr_period=14, atr_multiplier=1.5,
                        exit_period=10, use_regime_filter=True):
    close = df["close"]
    high  = df["high"]
    atr = compute_atr(df, atr_period)
    sma_exit = close.rolling(exit_period).mean()

    daily_move = high - close.shift(1)
    breakout   = daily_move > atr * atr_multiplier
    below_exit = close < sma_exit

    signals = pd.Series(0, index=df.index)
    signals[breakout   & ~breakout.shift(1).fillna(False)]   =  1
    signals[below_exit & ~below_exit.shift(1).fillna(False)] = -1

    if use_regime_filter:
        bull = regime_filter(df)
        signals[~bull & (signals == 1)] = 0

    return signals


# ─────────────────────────────────────────────
# 9. Trend + Mean Reversion Hybrid
# ─────────────────────────────────────────────
def trend_mean_reversion(df, trend_period=100, rsi_period=14,
                         rsi_oversold=40, rsi_overbought=65):
    close = df["close"]
    trend_sma = close.rolling(trend_period).mean()
    rsi = _rsi_series(close, rsi_period)

    in_uptrend = close > trend_sma

    signals = pd.Series(0, index=df.index)
    signals[in_uptrend & (rsi > rsi_oversold) & (rsi.shift(1) <= rsi_oversold)] = 1
    signals[(rsi > rsi_overbought) & (rsi.shift(1) <= rsi_overbought)] = -1

    return signals


# ─────────────────────────────────────────────
# 10. Kalman Filter Trend
# ─────────────────────────────────────────────
def kalman_trend(df, observation_covariance=0.1, transition_covariance=0.01):
    close = df["close"].values

    x = np.array([close[0], 0.0])
    P = np.eye(2)
    F = np.array([[1, 1], [0, 1]])
    H = np.array([[1, 0]])
    Q = np.eye(2) * transition_covariance
    R = np.array([[observation_covariance]])

    velocities = []

    for price in close:
        x = F @ x
        P = F @ P @ F.T + Q
        y = price - H @ x
        S = H @ P @ H.T + R
        K = P @ H.T @ np.linalg.inv(S)
        x = x + K @ y
        P = (np.eye(2) - K @ H) @ P
        velocities.append(x[1])

    velocity = pd.Series(velocities, index=df.index)
    signals = pd.Series(0, index=df.index)
    signals[(velocity > 0) & (velocity.shift(1) <= 0)] =  1
    signals[(velocity < 0) & (velocity.shift(1) >= 0)] = -1

    return signals


# ─────────────────────────────────────────────
# 11. Opening Range Breakout
# ─────────────────────────────────────────────
def opening_range_breakout(df, range_days=5, atr_period=14,
                           atr_filter=True, use_regime_filter=True):
    close = df["close"]
    high  = df["high"]
    low   = df["low"]

    range_high = high.rolling(range_days).max().shift(1)
    range_low  = low.rolling(range_days).min().shift(1)

    range_width = (range_high - range_low) / close
    tight_range = range_width < range_width.rolling(60).median()

    signals = pd.Series(0, index=df.index)
    buy_signal  = (close > range_high) & (close.shift(1) <= range_high.shift(1))
    sell_signal = (close < range_low)  & (close.shift(1) >= range_low.shift(1))

    if atr_filter:
        signals[buy_signal & tight_range] =  1
        signals[sell_signal]              = -1
    else:
        signals[buy_signal]  =  1
        signals[sell_signal] = -1

    if use_regime_filter:
        bull = regime_filter(df)
        signals[~bull & (signals == 1)] = 0

    return signals


# ─────────────────────────────────────────────
# 12. VWAP Momentum
# ─────────────────────────────────────────────
def vwap_momentum(df, lookback=20, deviation_threshold=0.02):
    close  = df["close"]
    volume = df["volume"]

    typical_price = (df["high"] + df["low"] + close) / 3
    vwap = (typical_price * volume).rolling(lookback).sum() / volume.rolling(lookback).sum()

    deviation = (close - vwap) / vwap
    signals = pd.Series(0, index=df.index)
    signals[(deviation < -deviation_threshold) & (deviation > deviation.shift(1))]  =  1
    signals[(deviation > 0) & (deviation.shift(1) <= 0)]                            = -1

    return signals


# ─────────────────────────────────────────────
# 13. Dual Momentum (Antonacci — multi-asset)
# ─────────────────────────────────────────────
def dual_momentum(universe: dict[str, pd.DataFrame], lookback=252,
                  cash_proxy_return=0.04):
    closes  = pd.DataFrame({ticker: df["close"] for ticker, df in universe.items()})
    returns = (closes / closes.shift(lookback)) - 1
    signals = {ticker: pd.Series(0, index=df.index) for ticker, df in universe.items()}

    for date in closes.index[lookback:]:
        row = returns.loc[date].dropna().sort_values(ascending=False)
        if row.empty:
            continue
        best_ticker = row.index[0]
        best_return = row.iloc[0]
        if best_return > cash_proxy_return:
            signals[best_ticker][date] = 1

    return signals


# ─────────────────────────────────────────────
# 14. Pairs Trading (Statistical Arbitrage)
# ─────────────────────────────────────────────
def pairs_trading(df_a: pd.DataFrame, df_b: pd.DataFrame, lookback=60,
                  entry_z=2.0, exit_z=0.5, coint_pvalue=0.05):
    close_a = df_a["close"]
    close_b = df_b["close"]
    close_a, close_b = close_a.align(close_b, join="inner")

    _, p_value, _ = coint(close_a, close_b)
    if p_value > coint_pvalue:
        print(f"Warning: pair not cointegrated (p={p_value:.3f}). Signals will be zero.")
        zero = pd.Series(0, index=close_a.index)
        return zero, zero

    signals_a = pd.Series(0, index=close_a.index)
    signals_b = pd.Series(0, index=close_b.index)

    for i in range(lookback, len(close_a)):
        window_a = close_a.iloc[i - lookback:i]
        window_b = close_b.iloc[i - lookback:i]

        X = sm.add_constant(window_b)
        model = OLS(window_a, X).fit()
        hedge_ratio = model.params.iloc[1]

        spread = window_a - hedge_ratio * window_b
        z_score = (spread.iloc[-1] - spread.mean()) / spread.std()

        date = close_a.index[i]

        if z_score < -entry_z:
            signals_a[date] =  1
            signals_b[date] = -1
        elif z_score > entry_z:
            signals_a[date] = -1
            signals_b[date] =  1
        elif abs(z_score) < exit_z:
            signals_a[date] = 0
            signals_b[date] = 0

    return signals_a, signals_b


# ─────────────────────────────────────────────
# 15. Triple Screen (Elder's System)
# ─────────────────────────────────────────────
def triple_screen(df_daily: pd.DataFrame, weekly_macd_fast=12, weekly_macd_slow=26,
                  weekly_macd_signal=9, daily_rsi_period=14, rsi_oversold=30):
    close = df_daily["close"]
    high  = df_daily["high"]

    weekly_close = close.resample("W").last()
    ema_fast    = weekly_close.ewm(span=weekly_macd_fast,  adjust=False).mean()
    ema_slow    = weekly_close.ewm(span=weekly_macd_slow,  adjust=False).mean()
    macd_line   = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=weekly_macd_signal,   adjust=False).mean()
    histogram   = macd_line - signal_line

    histogram_daily      = histogram.reindex(close.index, method="ffill")
    histogram_daily_prev = histogram.shift(1).reindex(close.index, method="ffill")
    weekly_bullish = histogram_daily > histogram_daily_prev

    rsi = _rsi_series(close, daily_rsi_period)
    daily_oversold = rsi < rsi_oversold
    breakout_entry = close > high.shift(1)

    signals = pd.Series(0, index=df_daily.index)
    signals[weekly_bullish & daily_oversold & breakout_entry] =  1
    signals[~weekly_bullish & (signals.shift(1) == 1)]        = -1

    return signals


# ─────────────────────────────────────────────
# Registry
# ─────────────────────────────────────────────
STRATEGIES = {
    "sma_crossover": {
        "fn": sma_crossover,
        "name": "SMA Crossover",
        "description": "Buy when fast MA crosses above slow MA. Includes a 0.5% buffer to reduce whipsaws.",
        "params": {
            "fast": {"type": "int", "default": 20, "min": 5,  "max": 100, "label": "Fast Period"},
            "slow": {"type": "int", "default": 50, "min": 20, "max": 300, "label": "Slow Period"},
            # signal_lag removed — accepted by function but never used in body
            "use_regime_filter": {"type": "int", "default": 0, "min": 0, "max": 1, "label": "Regime Filter (1=On)"},
        }
    },
    "rsi": {
        "fn": rsi_strategy,
        "name": "RSI Mean Reversion",
        "description": "Buy when RSI exits oversold zone. Sell when RSI exits overbought zone.",
        "params": {
            "period":          {"type": "int", "default": 14, "min": 5,  "max": 50, "label": "RSI Period"},
            "oversold":        {"type": "int", "default": 30, "min": 10, "max": 45, "label": "Oversold Level"},
            "overbought":      {"type": "int", "default": 70, "min": 55, "max": 90, "label": "Overbought Level"},
            "use_trend_filter":{"type": "int", "default": 1,  "min": 0,  "max": 1,  "label": "Trend Filter (1=On)"},
        }
    },
    "bollinger": {
        "fn": bollinger_breakout,
        "name": "Bollinger Band Breakout",
        "description": "Sticky trend-following logic.",
        "params": {
            "period":  {"type": "int",   "default": 50,  "min": 20,  "max": 100, "label": "SMA Period"},
            "std_dev": {"type": "float", "default": 2.5, "min": 1.5, "max": 4.0, "label": "Std Dev"},
            "use_regime_filter": {"type": "int", "default": 0, "min": 0, "max": 1, "label": "Regime Filter"},
        }
    },
    "macd": {
        "fn": macd_strategy,
        "name": "MACD Crossover",
        "description": "Buy on bullish MACD/signal crossover. Sell on bearish crossover.",
        "params": {
            "fast":   {"type": "int", "default": 12, "min": 5,  "max": 30, "label": "Fast EMA"},
            "slow":   {"type": "int", "default": 26, "min": 15, "max": 60, "label": "Slow EMA"},
            "signal": {"type": "int", "default": 9,  "min": 3,  "max": 20, "label": "Signal Line"},
        }
    },
    "mean_reversion": {
        "fn": mean_reversion,
        "name": "Mean Reversion (Z-Score)",
        "description": "Buy when price drops 1.5σ below rolling mean. Sell when it reverts.",
        "params": {
            "period":  {"type": "int",   "default": 20,   "min": 10,  "max": 60,   "label": "Lookback Period"},
            "entry_z": {"type": "float", "default": -1.5, "min": -3.0,"max": -0.5, "label": "Entry Z-Score"},
            "exit_z":  {"type": "float", "default": 0.5,  "min": 0.0, "max": 2.0,  "label": "Exit Z-Score"},
        }
    },
    "momentum": {
        "fn": momentum_strategy,
        "name": "Time Series Momentum",
        "description": "Buy when both long and short-term trend agree. Exit when the long trend breaks.",
        "params": {
            "lookback":       {"type": "int", "default": 90, "min": 20, "max": 252, "label": "Long Lookback (days)"},
            "short_lookback": {"type": "int", "default": 20, "min": 5,  "max": 60,  "label": "Short Lookback (days)"},
            # holding_period removed — accepted by function but never used in body
        }
    },
    "multi_signal": {
        "fn": multi_signal,
        "name": "Multi-Signal Combination",
        "description": "Buy only when RSI, MACD, and price trend all agree.",
        "params": {
            "min_signals": {"type": "int", "default": 2, "min": 1, "max": 3, "label": "Min Signals"},
        }
    },
    "volatility_breakout": {
        "fn": volatility_breakout,
        "name": "Volatility Breakout",
        "description": "Buy when daily move exceeds ATR multiple. Exit below short-term SMA.",
        "params": {
            "atr_multiplier": {"type": "float", "default": 1.5, "min": 0.5, "max": 4.0, "label": "ATR Multiplier"},
            "exit_period":    {"type": "int",   "default": 10,  "min": 5,   "max": 50,  "label": "Exit SMA Period"},
        }
    },
    "trend_mean_reversion": {
        "fn": trend_mean_reversion,
        "name": "Trend + Mean Reversion",
        "description": "Buy RSI dips inside a long-term uptrend. Exit when RSI recovers.",
        "params": {
            "trend_period":   {"type": "int", "default": 100, "min": 50, "max": 300, "label": "Trend SMA Period"},
            "rsi_period":     {"type": "int", "default": 14,  "min": 5,  "max": 30,  "label": "RSI Period"},
            "rsi_oversold":   {"type": "int", "default": 40,  "min": 20, "max": 50,  "label": "RSI Oversold"},
            "rsi_overbought": {"type": "int", "default": 65,  "min": 55, "max": 85,  "label": "RSI Overbought"},
        }
    },
    "kalman_trend": {
        "fn": kalman_trend,
        "name": "Kalman Filter Trend",
        "description": "Adaptive trend following using a Kalman filter velocity signal.",
        "params": {
            "observation_covariance": {"type": "float", "default": 1.0,  "min": 0.1,  "max": 10.0, "label": "Observation Noise"},
            "transition_covariance":  {"type": "float", "default": 0.005, "min": 0.001, "max": 0.1, "label": "Transition Noise"},
        }
    },
    "opening_range_breakout": {
        "fn": opening_range_breakout,
        "name": "Opening Range Breakout",
        "description": "Buy breakout above N-day high from a tight consolidation range.",
        "params": {
            "range_days": {"type": "int", "default": 5, "min": 3, "max": 20, "label": "Range Days"},
        }
    },
    "vwap_momentum": {
        "fn": vwap_momentum,
        "name": "VWAP Momentum",
        "description": "Buy when price is below VWAP and recovering. Exit when price crosses VWAP.",
        "params": {
            "lookback":            {"type": "int",   "default": 20,   "min": 5,    "max": 60,  "label": "VWAP Lookback"},
            "deviation_threshold": {"type": "float", "default": 0.02, "min": 0.005,"max": 0.1, "label": "Deviation Threshold"},
        }
    },
}