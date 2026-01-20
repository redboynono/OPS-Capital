## OPS Terminal Mock API

本目录提供前端联调用的 Mock API，不包含任何 Alpaca Key。

### 安全说明

请使用环境变量传入 Alpaca Key，严禁硬编码到前端或仓库中。

```bash
export ALPACA_BASE_URL=https://paper-api.alpaca.markets
export ALPACA_API_KEY=your_key
export ALPACA_SECRET_KEY=your_secret
# 兼容变量名：
# export ALPACA_API_SECRET=your_secret
export ALPACA_PAPER=true
export ALPACA_FEED=iex
export ALPACA_DATA_URL=https://data.alpaca.markets
```

### 运行

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

默认访问：

- `GET /api/health`
- `GET /api/clock`
- `GET /api/account`
- `GET /api/connectivity`
- `GET /api/market`
- `GET /api/positions`
- `GET /api/strategies`
- `GET /api/logs`
- `GET /api/portfolio/history`
- `GET /api/bars`
- `GET /api/assets/{symbol}`
- `POST /api/orders`
- `WS /ws/market`

前端会优先读取 `/api/*`，失败则回退到本地 mock 数据。
