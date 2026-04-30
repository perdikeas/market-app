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
# ML Helpers
# ─────────────────────────────────────────────

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes technical indicator features for each trading day.
    Returns a DataFrame aligned to df.index.
    All features are normalized/ratio-based so they work across
    different price levels and time periods.
    """
    close  = df["close"]
    high   = df["high"]
    low    = df["low"]
    volume = df["volume"]

    feat = pd.DataFrame(index=df.index)

    # ── Momentum ──────────────────────────────
    feat["rsi_14"] = _rsi_series(close, 14)
    feat["rsi_7"]  = _rsi_series(close, 7)

    # ── MACD ──────────────────────────────────
    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()
    macd_line   = ema_12 - ema_26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    feat["macd"]      = macd_line / close          # normalize by price
    feat["macd_signal"] = signal_line / close
    feat["macd_hist"] = (macd_line - signal_line) / close

    # ── Trend: distance from moving averages ──
    sma_20  = close.rolling(20).mean()
    sma_50  = close.rolling(50).mean()
    sma_200 = close.rolling(200).mean()
    feat["sma_dist_20"]  = (close - sma_20)  / sma_20   # % above/below
    feat["sma_dist_50"]  = (close - sma_50)  / sma_50
    feat["sma_dist_200"] = (close - sma_200) / sma_200
    feat["above_200"]    = (close > sma_200).astype(int)

    # ── Volatility ────────────────────────────
    atr = compute_atr(df, 14)
    feat["atr_pct"] = atr / close                  # ATR as % of price

    std_20 = close.rolling(20).std()
    bb_upper = sma_20 + 2 * std_20
    bb_lower = sma_20 - 2 * std_20
    bb_width = (bb_upper - bb_lower) / sma_20
    feat["bb_width"] = bb_width
    feat["bb_position"] = (close - bb_lower) / (bb_upper - bb_lower + 1e-9)

    # ── Volume ────────────────────────────────
    vol_avg_20 = volume.rolling(20).mean()
    feat["volume_ratio"] = volume / (vol_avg_20 + 1)  # +1 avoids division by zero

    # On-balance volume slope
    obv = (np.sign(close.diff()) * volume).fillna(0).cumsum()
    obv_slope = obv - obv.shift(10)
    feat["obv_slope"] = obv_slope / (vol_avg_20 * 10 + 1)  # normalize

    # ── Price patterns ────────────────────────
    feat["return_1d"]  = close.pct_change(1)
    feat["return_5d"]  = close.pct_change(5)
    feat["return_20d"] = close.pct_change(20)

    # Where did price close within today's high-low range?
    day_range = (high - low).replace(0, np.nan)
    feat["close_position"] = (close - low) / day_range   # 0=closed at low, 1=at high
    feat["high_low_ratio"] = day_range / close            # range as % of price

    # ── Calendar ─────────────────────────────
    feat["day_of_week"] = df.index.dayofweek   # 0=Mon, 4=Fri
    feat["month"]       = df.index.month

    return feat

def build_targets(df: pd.DataFrame, forward_days: int = 5,
                  threshold: float = 0.02) -> pd.Series:
    """
    For each day, looks forward N days and labels it:
      +1 if price rises more than threshold  (buy)
      -1 if price falls more than threshold  (sell)
       0 if price stays within threshold     (hold)

    The last forward_days rows will be NaN — they have no future yet.
    These are dropped before training.
    """
    close = df["close"]
    future_return = close.shift(-forward_days) / close - 1

    target = pd.Series(0, index=df.index)
    target[future_return >  threshold] =  1
    target[future_return < -threshold] = -1
    target[future_return.isna()]       =  np.nan

    return target

def walk_forward_predict(features: pd.DataFrame, targets: pd.Series,
                         min_train_days: int = 200,
                         retrain_every: int = 63) -> pd.Series:
    """
    Walk-forward validation — the only honest way to backtest an ML model.

    Timeline:
      [──── train (min 2 years) ────][─ predict 63 days ─]
                [──── train ────────────][─ predict 63 days ─]
                          [──── train ──────────────][─ predict ─]

    We never predict on data the model was trained on.
    We retrain every retrain_every days (default ~1 quarter).
    """
    try:
        import lightgbm as lgb
    except ImportError:
        raise ImportError("Run: pip install lightgbm --break-system-packages")

    from sklearn.preprocessing import LabelEncoder

    signals = pd.Series(0, index=features.index)

    # Drop NaN rows (warmup period + last forward_days rows)
    valid_mask = targets.notna() & features.notna().all(axis=1)
    feat_clean = features[valid_mask]
    targ_clean = targets[valid_mask]

    n = len(feat_clean)
    if n < min_train_days + retrain_every:
        print(f"Not enough data: need {min_train_days + retrain_every} days, got {n}")
        return signals

    # Encode targets: -1 → 0, 0 → 1, 1 → 2 (LightGBM needs 0-indexed classes)
    le = LabelEncoder()
    targ_encoded = le.fit_transform(targ_clean)   # learns [-1, 0, 1] → [0, 1, 2]

    model = None
    predict_start = min_train_days

    for i in range(predict_start, n, retrain_every):
        # ── Retrain on everything up to i ──
        X_train = feat_clean.iloc[:i]
        y_train = targ_encoded[:i]

        model = lgb.LGBMClassifier(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=4,           # shallow trees — prevents overfitting
            num_leaves=15,
            min_child_samples=20,  # need at least 20 samples per leaf
            subsample=0.8,         # use 80% of rows per tree
            colsample_bytree=0.8,  # use 80% of features per tree
            class_weight='balanced',  # handles unequal class sizes
            random_state=42,
            verbose=-1             # suppress output
        )
        model.fit(X_train, y_train)

        # ── Predict next retrain_every days ──
        predict_end = min(i + retrain_every, n)
        X_pred = feat_clean.iloc[i:predict_end]

        if len(X_pred) == 0:
            continue

        pred_encoded = model.predict(X_pred)
        pred_labels  = le.inverse_transform(pred_encoded)  # back to -1, 0, 1

        # ── Write predictions to signal series ──
        signal_dates = feat_clean.index[i:predict_end]
        for date, label in zip(signal_dates, pred_labels):
            signals[date] = int(label)

    return signals


#Machine learning model that trains on trading data
def lightgbm_signal(df: pd.DataFrame, forward_days: int = 5,
                    threshold: float = 0.02, min_train_days: int = 200,
                    retrain_every: int = 63) -> pd.Series:
    """
    ML-based signal using LightGBM gradient boosting.
    Uses walk-forward validation — never trains on future data.
    
    Requires at least 3-5 years of data to generate meaningful signals.
    Use period='5y' for best results.
    """
    features = build_features(df)
    targets  = build_targets(df, forward_days=forward_days, threshold=threshold)
    signals  = walk_forward_predict(features, targets,
                                    min_train_days=min_train_days,
                                    retrain_every=retrain_every)
    return signals

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
    "lightgbm": {
        "fn": lightgbm_signal,
        "name": "LightGBM ML Signal",
        "description": "Gradient boosting model trained on 20 technical indicators. Uses walk-forward validation to prevent lookahead bias. Requires 5y period.",
        "params": {
            "forward_days":   {"type": "int",   "default": 5,    "min": 3,    "max": 20,   "label": "Forecast Horizon (days)"},
            "threshold":      {"type": "float", "default": 0.02, "min": 0.01, "max": 0.05, "label": "Signal Threshold"},
            "retrain_every":  {"type": "int",   "default": 63,   "min": 21,   "max": 126,  "label": "Retrain Frequency (days)"},
        }
    },
}