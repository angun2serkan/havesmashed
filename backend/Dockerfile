# ── Stage 1: Build ────────────────────────────────────────────
FROM rust:1.93-slim AS builder

WORKDIR /app

# Proje runtime query kullaniyor, compile-time DB baglantisi gerekmez
ENV SQLX_OFFLINE=true

# Dependency cache: sadece Cargo dosyalarini kopyalayip derle
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm -rf src

# Gercek kaynak kodu kopyala ve derle
COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs
RUN cargo build --release

# ── Stage 2: Runtime ─────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Binary'yi kopyala
COPY --from=builder /app/target/release/havesmashed-backend .

# Migration dosyalarini kopyala (runtime'da otomatik calisir)
COPY migrations ./migrations

# Uploads dizini
RUN mkdir -p uploads

# Non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

CMD ["./havesmashed-backend"]
