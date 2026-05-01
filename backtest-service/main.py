"""
MarketDash Backtesting Service
-------------------------------
FastAPI microservice that runs trading strategy backtests.
Runs on port 8000, separate from the Node.js backend (port 3001).

Routes:
  GET  /strategies              → list all available strategies + their params
  POST /backtest                → run a backtest, returns metrics + equity curve + trades
  GET  /health                  → health check
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import traceback

from data import fetch_ohlcv
from engine import run_backtest
from strategies.strategies import STRATEGIES

app = FastAPI(
    title="MarketDash Backtesting Service",
    description="Runs trading strategy simulations on historical OHLCV data",
    version="1.0.0",
)

# Allow requests from the React frontend and Node backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request / Response Models ────────────────────────────────────────────────
class BacktestRequest(BaseModel):
    symbol: str = Field(..., description="Ticker symbol, e.g. AAPL")
    strategy: str = Field(..., description="Strategy key from /strategies")
    period: str = Field("1y", description="Lookback period: 1mo, 3mo, 6mo, 1y, 2y, 5y")
    initial_capital: float = Field(10000.0, ge=100, description="Starting capital in USD")
    params: Optional[dict] = Field(default_factory=dict, description="Strategy-specific parameters")
    min_holding_days: int = Field(1, ge=1, description="Minimum days to hold a position")
    atr_multiplier: float = Field(3.0, ge=0.0, description="ATR stop loss multiplier")
    max_drawdown_pct: float = Field(100.0, ge=1.0, description="Circuit breaker max drawdown %")


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "backtest"}


@app.get("/strategies")
def list_strategies():
    """Returns all available strategies with their parameter schemas."""
    return [
        {
            "key": key,
            "name": meta["name"],
            "description": meta["description"],
            "params": meta["params"],
        }
        for key, meta in STRATEGIES.items()
    ]

@app.post("/feature-importance")
def feature_importance(req: BacktestRequest):
    """
    Trains LightGBM on the requested ticker and returns
    feature importance scores ranked highest to lowest.
    """
    from strategies.strategies import build_features, build_targets
    from sklearn.preprocessing import LabelEncoder
    try:
        import lightgbm as lgb
    except ImportError:
        raise HTTPException(status_code=500, detail="lightgbm not installed")

    # Validate period and fetch data
    try:
        df = fetch_ohlcv(req.symbol.upper(), req.period)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Build features and targets
    features = build_features(df)
    targets  = build_targets(df, forward_days=req.params.get("forward_days", 5),
                             threshold=req.params.get("threshold", 0.02))

    valid = targets.notna() & features.notna().all(axis=1)
    X = features[valid]
    y = targets[valid]

    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    model = lgb.LGBMClassifier(
        n_estimators=200, learning_rate=0.05, max_depth=4,
        num_leaves=15, min_child_samples=20, subsample=0.8,
        colsample_bytree=0.8, class_weight='balanced',
        random_state=42, verbose=-1
    )
    model.fit(X, y_enc)

    importance = dict(zip(
        features.columns.tolist(),
        [int(v) for v in model.feature_importances_]
    ))

    # Sort highest to lowest
    importance_sorted = dict(
        sorted(importance.items(), key=lambda x: x[1], reverse=True)
    )

    return {
        "symbol": req.symbol.upper(),
        "period": req.period,
        "feature_importance": importance_sorted
    }

@app.post("/backtest")
def backtest(req: BacktestRequest):
    """
    Runs a backtest and returns:
    - Equity curve (strategy vs buy & hold)
    - Trade log
    - Performance metrics (return, Sharpe, drawdown, win rate, etc.)
    """

    # 1. Validate strategy
    if req.strategy not in STRATEGIES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown strategy '{req.strategy}'. Valid: {list(STRATEGIES.keys())}"
        )

    strategy_meta = STRATEGIES[req.strategy]

    # 2. Build strategy params (merge defaults + user overrides)
    params = {}
    for param_name, schema in strategy_meta["params"].items():
        raw = req.params.get(param_name, schema["default"])
        # Cast to the correct type
        try:
            if schema["type"] == "int":
                params[param_name] = int(raw)
            else:
                params[param_name] = float(raw)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid value for param '{param_name}': {raw}"
            )

    # 3. Fetch historical data
    try:
        df = fetch_ohlcv(req.symbol.upper(), req.period)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data fetch failed: {str(e)}")

    # 4. Generate signals
    try:
        signals = strategy_meta["fn"](df, **params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Strategy error: {str(e)}")

    # 5. Run backtest
    try:
        result = run_backtest(
            df=df,
            signals=signals,
            symbol=req.symbol.upper(),
            strategy_name=strategy_meta["name"],
            initial_capital=req.initial_capital,
            min_holding_days=req.min_holding_days,
            atr_multiplier=req.atr_multiplier,
            max_drawdown_pct=req.max_drawdown_pct,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(e)}")

    # 6. Return serialized result
    return {
        "symbol": result.symbol,
        "strategy": result.strategy,
        "period": req.period,
        "start_date": result.start_date,
        "end_date": result.end_date,
        "initial_capital": req.initial_capital,
        "params_used": params,
        "metrics": {
            "total_return_pct": result.total_return_pct,
            "benchmark_return_pct": result.benchmark_return_pct,
            "annualized_return_pct": result.annualized_return_pct,
            "sharpe_ratio": result.sharpe_ratio,
            "max_drawdown_pct": result.max_drawdown_pct,
            "volatility_pct": result.volatility_pct,
            "win_rate_pct": result.win_rate_pct,
            "total_trades": result.total_trades,
            "avg_trade_pnl": result.avg_trade_pnl,
        },
        "equity_curve": result.equity_curve,
        "trades": result.trades,
    }
