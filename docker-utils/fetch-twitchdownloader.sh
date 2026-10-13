#!/bin/sh

# THANK YOU TALULAH (https://github.com/nottalulah) for your help in figuring this out
# and also optimizing some code with this commit.
# xoxo :D

set -eu

# The release version and per architecture sha256 are pinned in twitchdownloader.env.
# shellcheck source=/dev/null
. "$(dirname "$0")/twitchdownloader.env"

case $(uname -m) in
  x86_64)
    ARCH=Linux-x64
    SHA256=$TWITCHDOWNLOADER_SHA256_LINUX_X64;;
  aarch64)
    ARCH=LinuxArm64
    SHA256=$TWITCHDOWNLOADER_SHA256_LINUX_ARM64;;
  armhf|armv7|armv7l)
    ARCH=LinuxArm
    SHA256=$TWITCHDOWNLOADER_SHA256_LINUX_ARM;;
  *)
    echo "Unsupported architecture: $(uname -m)"
    exit 1
esac

VERSION=$TWITCHDOWNLOADER_VERSION
echo "(INFO) Architecture detected: $ARCH, pinned version: $VERSION"
echo "(1/5) READY - Install unzip"
apt-get update && apt-get -y install unzip curl libicu70
echo "(2/5) DOWNLOAD - Acquire twitchdownloader"
curl -o twitchdownloader.zip \
    --fail \
    --connect-timeout 5 \
    --max-time 120 \
    --retry 5 \
    --retry-delay 0 \
    --retry-max-time 40 \
    -L "https://github.com/lay295/TwitchDownloader/releases/download/$VERSION/TwitchDownloaderCLI-$VERSION-$ARCH.zip"
echo "(3/5) VERIFY - Check the download against the pinned sha256"
echo "$SHA256  twitchdownloader.zip" | sha256sum -c -
unzip twitchdownloader.zip
chmod +x TwitchDownloaderCLI
echo "(4/5) Smoke test"
# The CLI exits 1 for --help and version, so check the version it reports instead of its exit code
./TwitchDownloaderCLI version 2>&1 | grep -q "^TwitchDownloaderCLI $VERSION"
echo "(5/5) PROVISION - Install into /usr/local/bin"
cp ./TwitchDownloaderCLI /usr/local/bin/TwitchDownloaderCLI
