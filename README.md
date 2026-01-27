# CS308-Project

### Local Cloud Run-style smoke test

```bash
docker build -t cs308 .
docker run --rm -p 8081:8080 -e NODE_ENV=production cs308
curl -i http://localhost:8081/api/products
```

### Local Docker (production-like) with env file

- `.env` dosyaları image’a kopyalanmaz; çalıştırırken `--env-file` ile geçin.
- Eğer MySQL host makinede ise `DB_HOST=host.docker.internal` kullanın.

```bash
docker build -t cs308 .
docker run --rm -p 8081:8080 \
  --env-file server/.env \
  -e NODE_ENV=production \
  -e PORT=8080 \
  cs308

# Host makinedeki MySQL için
docker run --rm -p 8081:8080 \
  --env-file server/.env \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e DB_HOST=host.docker.internal \
  cs308

# Smoke test
curl -i http://localhost:8081/api/products
```
