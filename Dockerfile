# Node 16.14.2 is required (that specific version is required as per: https://stackoverflow.com/a/72855258/8088021)
# This ARG is not tracked by Dependabot, so change it by hand.
ARG NODE_VERSION=16.14.2

# Fetching our utils
FROM ubuntu:22.10 AS utils
ENV DEBIAN_FRONTEND=noninteractive
# Use script due local build compability
# twitchdownloader.env pins the TwitchDownloaderCLI version and its sha256 per architecture
COPY docker-utils/*.sh docker-utils/twitchdownloader.env ./
RUN chmod +x *.sh
RUN sh ./ffmpeg-fetch.sh
RUN sh ./fetch-twitchdownloader.sh


# Pinned official Node image, used only as the source of the node and npm files for the base stage
FROM node:${NODE_VERSION}-slim AS node


# Create our Ubuntu 22.04 with node
# Go to 20.04
FROM ubuntu:22.10 AS base
ARG TARGETPLATFORM
ARG DEBIAN_FRONTEND=noninteractive
ARG NODE_VERSION
ENV UID=1000
ENV GID=1000
ENV USER=youtube
ENV NO_UPDATE_NOTIFIER=true
ENV PM2_HOME=/app/pm2
ENV ALLOW_CONFIG_MUTATIONS=true
ENV npm_config_cache=/app/.npm

ENV NODE_VERSION=${NODE_VERSION}
RUN groupadd -g $GID $USER && useradd --system -m -g $USER --uid $UID $USER && \
    apt update && \
    apt install -y --no-install-recommends curl ca-certificates tzdata libicu70 libatomic1 && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*

# Node and npm come from the pinned official image, so no installer script is downloaded and run
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Build frontend
ARG BUILDPLATFORM
FROM --platform=${BUILDPLATFORM} node:16 AS frontend
WORKDIR /build
# Dependencies first, so the install layer is reused when only source changes
COPY [ "package.json", "package-lock.json", "/build/" ]
RUN npm install
COPY [ "angular.json", "tsconfig.json", "/build/" ]
COPY [ "src/", "/build/src/" ]
RUN npm run build && \
    ls -al /build/backend/public
RUN rm -rf node_modules


# Install backend deps
FROM base AS backend
WORKDIR /app
# Dependencies first, so the install layer is reused when only source changes
COPY [ "backend/package.json", "backend/package-lock.json", "/app/" ]
RUN npm config set strict-ssl false && \
    npm install --prod && \
    ls -al && \
    rm -rf /app/.npm
COPY [ "backend/","/app/" ]

#FROM base as python
# armv7 need build from source
#WORKDIR /app
#COPY docker-utils/GetTwitchDownloader.py .
#RUN apt update && \
#    apt install -y --no-install-recommends python3-minimal python-is-python3 python3-pip python3-dev build-essential libffi-dev && \
#    apt clean && \
#    rm -rf /var/lib/apt/lists/*
#RUN pip install PyGithub requests
#RUN python GetTwitchDownloader.py

# Final image
FROM base
RUN npm install -g pm2@6.0.14 && \
    rm -rf /app/.npm && \
    apt update && \
    apt install -y --no-install-recommends gosu python3-minimal python-is-python3 python3-pip atomicparsley build-essential && \
    pip install pycryptodomex==3.24.1 && \
    apt remove -y --purge build-essential && \
    apt autoremove -y --purge && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
# User 1000 already exist from base image
COPY --chown=$UID:$GID --from=utils [ "/usr/local/bin/ffmpeg", "/usr/local/bin/ffmpeg" ]
COPY --chown=$UID:$GID --from=utils [ "/usr/local/bin/ffprobe", "/usr/local/bin/ffprobe" ]
COPY --chown=$UID:$GID --from=utils [ "/usr/local/bin/TwitchDownloaderCLI", "/usr/local/bin/TwitchDownloaderCLI"]
COPY --chown=$UID:$GID --from=backend ["/app/","/app/"]
COPY --chown=$UID:$GID --from=frontend [ "/build/backend/public/", "/app/public/" ]
#COPY --chown=$UID:$GID --from=python ["/app/TwitchDownloaderCLI","/usr/local/bin/TwitchDownloaderCLI"]
RUN chmod +x /app/fix-scripts/*.sh
# Add some persistence data
#VOLUME ["/app/appdata"]

EXPOSE 17442
# The container intentionally has no USER instruction. The entrypoint starts as root only long
# enough to fix ownership of the bind mounted data folders (appdata, video, audio, subscriptions,
# users) and to honor a custom UID and GID, then drops to UID/GID 1000 (or the values set in
# UID and GID) through gosu. The application itself never runs as root.
# nosemgrep: dockerfile.security.missing-user-entrypoint.missing-user-entrypoint
ENTRYPOINT [ "/app/entrypoint.sh" ]
# Same reason as above: the root phase is only the ownership fix, then gosu drops to UID/GID 1000.
# nosemgrep: dockerfile.security.missing-user.missing-user
CMD [ "npm","start" ]
