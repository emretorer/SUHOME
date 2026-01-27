cleaned = []

with open("productDatabase.csv", "r", encoding="utf-8") as f:
    for line in f:
        # Satırı ; ile böl
        parts = line.strip().split(";")
        # Sadece ilk 17 sütunu al
        parts = parts[:17]
        # Tekrar birleştir
        cleaned.append(";".join(parts))

# Yeni, temiz dosya yaz
with open("productDatabase_clean.csv", "w", encoding="utf-8") as f:
    for row in cleaned:
        f.write(row + "\n")

print("Temiz CSV oluşturuldu: productDatabase_clean.csv")
