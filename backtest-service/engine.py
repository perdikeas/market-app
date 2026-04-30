"""
Backtesting Engine
------------------
Takes a price series (OHLCV) and a list of signals (+1 buy, -1 sell, 0 hold)
and simulates a portfolio, returning all the metrics an investor cares about.
"""

import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Trade:
    entry_date: str
    exit_date: Optional[str]
    symbol: str
    shares: float
    entry_price: float
    exit_price: Optional[float]
    pnl: Optional[float]
    pnl_pct: Optional[float]
    direction: str = "long"
    exit_reason: str = "signal"


@dataclass
class BacktestResult:
    symbol: str
    strategy: str
    start_date: str
    end_date: str
    equity_curve: list = field(default_factory=list)
    trades: list = field(default_factory=list)
    total_return_pct: float = 0.0
    benchmark_return_pct: float = 0.0
    sharpe_ratio: float = 0.0
    max_drawdown_pct: float = 0.0
    win_rate_pct: float = 0.0
    total_trades: int = 0
    avg_trade_pnl: float = 0.0
    annualized_return_pct: float = 0.0
    volatility_pct: float = 0.0
    stop_loss_exits: int = 0


def _compute_atr(df, period=14):
    high, low, close = df["high"], df["low"], df["close"]
    prev = close.shift(1)
    tr = pd.concat([
        (high - low),
        (high - prev).abs(),
        (low - prev).abs(),
    ], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def run_backtest(
    df, signals, symbol, strategy_name,
    initial_capital=10_000.0,
    commission_pct=0.001,
    atr_multiplier=3.0,        # disabled by default — calibrate per strategy later
    risk_per_trade=0.02,
    max_position=0.99,         # invest 25% of capital per trade
    max_drawdown_pct=100.0,    # circuit breaker disabled by default
    min_holding_days=1,
) -> BacktestResult:
    """
    Simulate a long-only strategy on daily OHLCV data.

    Rules:
      - Signal = 1  → buy max_position% of capital at next bar's open
      - Signal = -1 → sell entire position at next bar's open (after min_holding_days)
      - Signal = 0  → hold
      - One position at a time (fully in or fully out)
    """

    df = df.copy()
    df["signal"] = signals.reindex(df.index).fillna(0)
    df["atr"] = _compute_atr(df)

    capital = initial_capital
    shares = 0.0
    position_open = False
    entry_price = 0.0
    entry_date = None
    stop_price = 0.0
    peak_value = initial_capital
    circuit_broken = False
    stop_loss_exits = 0
    days_held = 0

    portfolio_values = []
    trades: list[Trade] = []

    for i in range(len(df)):
        row = df.iloc[i]
        date_str = str(df.index[i].date())
        signal = row["signal"]
        open_p = row["open"]
        close_p = row["close"]
        atr_val = row["atr"]
        
        # --- NEW TRAILING STOP LOGIC ---
        if position_open and atr_multiplier > 0:
            # Calculate what the stop would be based on today's price
            potential_stop = close_p - (atr_val * atr_multiplier)
            # Only move the stop UP, never DOWN
            stop_price = max(stop_price, potential_stop)
        # --- END TRAILING STOP LOGIC ---

        # Update peak and check circuit breaker
        current_value = capital + shares * close_p
        if current_value > peak_value:
            peak_value = current_value
        dd_now = (current_value - peak_value) / peak_value * 100
        if dd_now < -max_drawdown_pct:
            circuit_broken = True
        if circuit_broken and current_value >= peak_value * 0.75:
            circuit_broken = False

        # ATR stop loss check
        if position_open and atr_multiplier > 0 and stop_price > 0:
            if open_p <= stop_price:
                proceeds = shares * open_p * (1 - commission_pct)
                pnl = proceeds - shares * entry_price
                trades.append(Trade(
                    entry_date=entry_date,
                    exit_date=date_str,
                    symbol=symbol,
                    shares=round(shares, 4),
                    entry_price=round(entry_price, 4),
                    exit_price=round(open_p, 4),
                    pnl=round(pnl, 2),
                    pnl_pct=round((open_p - entry_price) / entry_price * 100, 2),
                    exit_reason="stop_loss",
                ))
                stop_loss_exits += 1
                capital += proceeds
                shares = 0.0
                stop_price = 0.0
                entry_price = 0.0
                position_open = False
                entry_date = None
                days_held = 0
                current_value = capital

        # Execute signals (Look at signal from previous day, execute on current open)
        prev_signal = df.iloc[i-1]["signal"] if i > 0 else 0
        
        # Execute signals
        if prev_signal == 1 and not position_open and not circuit_broken and capital > 10:
            # --- NEW DYNAMIC SIZING LOGIC START ---
            target_vol = 0.40 # 20% target annualized volatility
            # Calculate rolling 20-day volatility
            window_returns = df["close"].pct_change().iloc[max(0, i-20):i]
            current_vol = (window_returns.std() * np.sqrt(252))
            
            if not np.isnan(current_vol) and current_vol > 0:
                # Scale: If vol is 30% (double target), dynamic_position becomes 0.5
                dynamic_position = min(max_position, target_vol / current_vol)
                shares = (capital * dynamic_position) / open_p
            else:
                shares = (capital * max_position) / open_p
            # --- NEW DYNAMIC SIZING LOGIC END ---
            cost = shares * open_p
            commission = cost * commission_pct
            capital -= cost + commission
            capital = max(capital, 0)
            position_open = True
            entry_price = open_p
            entry_date = date_str
            if atr_multiplier > 0 and not np.isnan(atr_val) and atr_val > 0:
                stop_price = entry_price - atr_multiplier * atr_val
            else:
                stop_price = 0.0
            days_held = 0

        elif prev_signal == -1 and position_open:
            if days_held >= min_holding_days:
                proceeds = shares * open_p * (1 - commission_pct)
                pnl = proceeds - shares * entry_price
                trades.append(Trade(
                    entry_date=entry_date,
                    exit_date=date_str,
                    symbol=symbol,
                    shares=round(shares, 4),
                    entry_price=round(entry_price, 4),
                    exit_price=round(open_p, 4),
                    pnl=round(pnl, 2),
                    pnl_pct=round((open_p - entry_price) / entry_price * 100, 2),
                    exit_reason="signal",
                ))
                capital += proceeds
                shares = 0.0
                position_open = False
                stop_price = 0.0
                entry_price = 0.0
                entry_date = None
                days_held = 0

        # Increment days held once per bar, after all signal logic
        if position_open:
            days_held += 1

        # Always append portfolio value exactly once per bar
        portfolio_values.append(capital + shares * close_p)

    # Close open position at end
    if position_open and shares > 0:
        last_price = df.iloc[-1]["close"]
        proceeds = shares * last_price * (1 - commission_pct)
        pnl = proceeds - shares * entry_price
        trades.append(Trade(
            entry_date=entry_date,
            exit_date=str(df.index[-1].date()),
            symbol=symbol,
            shares=round(shares, 4),
            entry_price=round(entry_price, 4),
            exit_price=round(last_price, 4),
            pnl=round(pnl, 2),
            pnl_pct=round((last_price - entry_price) / entry_price * 100, 2),
            exit_reason="end_of_period",
        ))
        portfolio_values[-1] = capital + proceeds

    # Build equity curve
    portfolio_series = pd.Series(portfolio_values, index=df.index)
    benchmark_series = initial_capital * (df["close"] / df["close"].iloc[0])

    equity_curve = [
        {
            "date": str(df.index[i].date()),
            "value": round(portfolio_values[i], 2),
            "benchmark": round(benchmark_series.iloc[i], 2),
        }
        for i in range(len(df))
    ]

    # Compute metrics
    daily_returns = portfolio_series.pct_change().dropna()

    total_return = (portfolio_series.iloc[-1] - initial_capital) / initial_capital * 100
    benchmark_return = (benchmark_series.iloc[-1] - initial_capital) / initial_capital * 100

    if daily_returns.std() > 0:
        sharpe = (daily_returns.mean() / daily_returns.std()) * np.sqrt(252)
    else:
        sharpe = 0.0

    rolling_max = portfolio_series.cummax()
    drawdowns = (portfolio_series - rolling_max) / rolling_max * 100
    max_drawdown = drawdowns.min()

    n_days = len(df)
    if n_days > 0 and initial_capital > 0:
        ann_return = ((portfolio_series.iloc[-1] / initial_capital) ** (252 / n_days) - 1) * 100
    else:
        ann_return = 0.0

    closed_trades = [t for t in trades if t.pnl is not None]
    win_rate = (sum(1 for t in closed_trades if t.pnl > 0) / len(closed_trades) * 100) if closed_trades else 0.0
    avg_pnl = sum(t.pnl for t in closed_trades) / len(closed_trades) if closed_trades else 0.0
    volatility = daily_returns.std() * np.sqrt(252) * 100

    return BacktestResult(
        symbol=symbol,
        strategy=strategy_name,
        start_date=str(df.index[0].date()),
        end_date=str(df.index[-1].date()),
        equity_curve=equity_curve,
        trades=[
            {
                "entry_date": t.entry_date,
                "exit_date": t.exit_date,
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "shares": t.shares,
                "pnl": t.pnl,
                "pnl_pct": t.pnl_pct,
                "exit_reason": t.exit_reason,
            }
            for t in trades
        ],
        total_return_pct=round(total_return, 2),
        benchmark_return_pct=round(benchmark_return, 2),
        sharpe_ratio=round(sharpe, 3),
        max_drawdown_pct=round(max_drawdown, 2),
        win_rate_pct=round(win_rate, 1),
        total_trades=len(closed_trades),
        avg_trade_pnl=round(avg_pnl, 2),
        annualized_return_pct=round(ann_return, 2),
        volatility_pct=round(volatility, 2),
        stop_loss_exits=stop_loss_exits,
    )