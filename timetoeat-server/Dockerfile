FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends g++ cmake pkg-config libcpp-httplib-dev nlohmann-json3-dev libmariadb-dev libssl-dev libcurl4-openssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends make && rm -rf /var/lib/apt/lists/*
COPY CMakeLists.txt ./
COPY src ./src
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j2
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libcpp-httplib0.11 libmariadb3 libssl3 libcurl4 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/build/timetoeat-server /usr/local/bin/
USER 65534:65534
EXPOSE 8080
CMD ["timetoeat-server"]
