# Custom nginx image — prod config'i image layer'ına bake eder.
#
# NEDEN bind mount değil:
#   docker-compose.prod.yml'de prod.conf'u `volume: bind` ile mount
#   etmiştik. Ancak bu setup belirli deploy senaryolarında (container
#   önceden mount'suz başlatılmışsa, ya da edge-case timing) sessizce
#   eski/yanlış config ile çalışmaya devam ediyordu. İki kez login
#   sayfalarının swap olmasına yol açtı. Detaylı root cause analizi
#   için git log'a bak.
#
# COPY image layer'ına gömerek:
#   * Çalışan container her zaman bu Dockerfile'dan build edilmiş
#     config'i kullanır (host dosyasına bağımlı değil)
#   * `docker compose up --build nginx` config değişikliklerini
#     deterministic şekilde uygular
#   * `docker inspect` ile mount manipülasyonu artık alakasız
#
# SSL sertifikaları hâlâ bind-mount (certbot runtime'da yeniliyor).

FROM nginx:alpine

COPY prod.conf /etc/nginx/conf.d/default.conf
