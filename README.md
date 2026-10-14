# YoutubeDL-Material

[![GitHub issues badge](https://img.shields.io/github/issues/technotenshi/YoutubeDL-Material)](https://github.com/technotenshi/YoutubeDL-Material/issues)
[![License badge](https://img.shields.io/github/license/technotenshi/YoutubeDL-Material)](https://github.com/technotenshi/YoutubeDL-Material/blob/main/LICENSE.md)

YoutubeDL-Material is a Material Design frontend for [youtube-dl](https://rg3.github.io/youtube-dl/). It's coded using [Angular 15](https://angular.io/) for the frontend, and [Node.js](https://nodejs.org/) on the backend.

This is a fork of [Tzahi12345/YoutubeDL-Material](https://github.com/Tzahi12345/YoutubeDL-Material). Credit for the original work goes to its author and contributors (see [Authors](#authors)). Wiki pages linked below are maintained upstream and may not match this fork.

Now with [Docker](#Docker) support!

<hr>

## Getting Started

Check out the prerequisites, and go to the [installation](#Installing) section. Easy as pie!

Here's an image of what it'll look like once you're done:

<img src="https://i.imgur.com/C6vFGbL.png" width="800">

Dark mode:

<img src="https://i.imgur.com/vOtvH5w.png" width="800">

### Prerequisites

NOTE: If you would like to use Docker, you can skip down to the [Docker](#Docker) section for a setup guide.

Required dependencies:

* Node.js 16
* Python

Optional dependencies:

* AtomicParsley (for embedding thumbnails, package name `atomicparsley`)
* [Twitch Downloader CLI](https://github.com/lay295/TwitchDownloader) (for downloading Twitch VOD chats)

<details>
  <summary>Debian/Ubuntu</summary>

```bash
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install nodejs youtube-dl ffmpeg unzip python npm
```

</details>

<details>
  <summary>CentOS 7</summary>

```bash
sudo yum install epel-release
sudo yum localinstall --nogpgcheck https://download1.rpmfusion.org/free/el/rpmfusion-free-release-7.noarch.rpm
sudo yum install centos-release-scl-rh
sudo yum install rh-nodejs12
scl enable rh-nodejs12 bash
curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash -
sudo yum install nodejs youtube-dl ffmpeg ffmpeg-devel
```

</details>

### Installing

If you are using Docker, skip to the [Docker](#Docker) section.

This fork does not publish release packages for now. To run it without Docker, build it from source by following [Build it yourself](#build-it-yourself) below.

If you experience problems, know that it's usually caused by a configuration problem. The first thing you should do is check the console. To get there, right click anywhere on the page and click "Inspect element." Then on the menu that pops up, click console. Look at the error there, and try to investigate.

## Build it yourself

If you want to run YoutubeDL-Material without Docker, or develop the repository, this section is for you.

To deploy, simply clone the repository (`git clone https://github.com/technotenshi/YoutubeDL-Material.git`), and go into its directory. Type `npm install` and all the dependencies will install. Then type `cd backend` and again type `npm install` to install the dependencies for the backend.

Once you do that, you're almost up and running. All you need to do is edit the configuration in `backend/appdata/default.json`, go back into the repository's root directory, and type `npm run build`. This will build the app, and put the output files in the `backend/public` folder.

Lastly, type `npm -g install pm2` to install pm2 globally.

The frontend is now complete. The backend is much easier. Just go into the `backend` folder, and type `npm start`.

Finally, if you want your instance to be available from outside your network, you can set up a reverse proxy (see the [upstream wiki](https://github.com/Tzahi12345/YoutubeDL-Material/wiki/Reverse-Proxy-Setup)).

Alternatively, you can port forward the port specified in the config (defaults to `17442`) and point it to the server's IP address. Make sure the port is also allowed through the server's firewall.

## Docker

### Host-specific instructions

If you're on a Synology NAS, unRAID, Raspberry Pi 4 or any other possible special case you can check if there's known issues or instructions both in the issue tracker and in the [upstream Wiki](https://github.com/Tzahi12345/YoutubeDL-Material/wiki#environment-specific-guideshelp)

### Setup

If you are looking to setup YoutubeDL-Material with Docker, this section is for you.

This fork has no released or supported Docker image and no standalone `docker-compose.yml` for now. A manual workflow run pushes a development build to `ghcr.io/technotenshi/youtubedl-material` (tags `nightly` and `sha-<commit>`). It is not a release, it can change at any time, and the steps below do not use it. Docker runs by building the image from a clone of this repository, so the `docker-compose.yml` in the repository root only works next to the rest of the source (it builds from the included `Dockerfile`).

1. Clone the repository and change into it: `git clone https://github.com/technotenshi/YoutubeDL-Material.git`, then `cd YoutubeDL-Material`.
2. Run `docker compose up --build`. This builds the image from the `Dockerfile` and starts the app together with its MongoDB container. The first build can take a while.
3. When the app is ready it logs a line like "YoutubeDL-Material started on PORT 17442". That is the *container-internal* port. The *external* port is set in `docker-compose.yml` and defaults to **8998**.
4. Make sure you can connect to the server's address + the *external* port (for example `http://localhost:8998`), and if so, you are done!

Your data is kept in folders created next to `docker-compose.yml` (`appdata`, `audio`, `video`, `subscriptions`, `users` and `db`). They are excluded from Git and from the image build.

NOTE: By default there is no login (multi-user mode is off) and the port is published on all host interfaces. Run it on a trusted network, or turn on multi-user mode, before exposing it.

### Custom UID/GID

By default, the Docker container runs as non-root with UID=1000 and GID=1000. To set this to your own UID/GID, simply update the `environment` section in your `docker-compose.yml` like so:

```yml
environment:
    UID: YOUR_UID
    GID: YOUR_GID
```

## MongoDB

For much better scaling with large datasets please run your YoutubeDL-Material instance with MongoDB backend rather than the json file-based default. It will fix a lot of performance problems (especially with datasets in the tens of thousands videos/audios)!

[Tutorial (upstream wiki)](https://github.com/Tzahi12345/YoutubeDL-Material/wiki/Setting-a-MongoDB-backend-to-use-as-database-provider-for-YTDL-M).

## API

[API Docs](https://youtubedl-material.stoplight.io/docs/youtubedl-material/Public%20API%20v1.yaml)

To get started, go to the settings menu and enable the public API from the *Extra* tab. You can generate an API key if one is missing.

Once you have enabled the API and have the key, you can start sending requests by adding the query param `apiKey=API_KEY`. Replace `API_KEY` with your actual API key, and you should be good to go! Nearly all of the backend should be at your disposal. View available endpoints in the link above.

## iOS Shortcut 

If you are using iOS, try YoutubeDL-Material more conveniently with a Shortcut. With this Shortcut, you can easily start downloading YouTube video with just two taps! (Or maybe three?)

You can download Shortcut [here.](https://routinehub.co/shortcut/10283/)

## Contributing

If you're interested in contributing, first: awesome! Second, please refer to the guidelines/setup information located in the [Contributing](https://github.com/Tzahi12345/YoutubeDL-Material/wiki/Contributing) page of the upstream wiki, it's a helpful way to get you on your feet and coding away.

Pull requests are always appreciated! If you're a bit rusty with coding, that's no problem: we can always help you learn. And if that's too scary, that's OK too! You can create issues for features you'd like to see or bugs you encounter, it all helps this project grow. Issues and pull requests for this fork go to [technotenshi/YoutubeDL-Material](https://github.com/technotenshi/YoutubeDL-Material).

If you're interested in translating the app into a new language, check out the [Translate](https://github.com/Tzahi12345/YoutubeDL-Material/wiki/Translate) page of the upstream wiki.

## Authors

* **Isaac Grynsztein** (original author of upstream) - *Initial work*

Official translators:

* Spanish - tzahi12345
* German - UnlimitedCookies
* Chinese - TyRoyal

See also the list of contributors who participated in this project: [this fork](https://github.com/technotenshi/YoutubeDL-Material/graphs/contributors) and [upstream](https://github.com/Tzahi12345/YoutubeDL-Material/graphs/contributors).

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Legal Disclaimer

This project is in no way affiliated with Google LLC, Alphabet Inc. or YouTube (or their subsidiaries) nor endorsed by them.

## Acknowledgments

* youtube-dl
* [AllTube](https://github.com/Rudloff/alltube) (for the inspiration)
