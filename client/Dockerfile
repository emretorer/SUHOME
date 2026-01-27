# 1. Adım: Node.js imajını indir
FROM node:18-alpine

# 2. Adım: Çalışma klasörünü ayarla
WORKDIR /app

# 3. Adım: Paketleri yükle
COPY package*.json ./
RUN npm install

# 4. Adım: Kodu kopyala ve Build al
COPY . .
RUN npm run build

# 5. Adım: Statik sunucu kur (serve paketi)
RUN npm install -g serve

# 6. Adım: Portu aç ve başlat (Cloud Run 8080 portunu sever)
ENV PORT=8080
CMD ["serve", "-s", "build", "-l", "8080"]