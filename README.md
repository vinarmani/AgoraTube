# AgoraTube
## Fully Decentralized, Censorship-Resistant, Browser-Based Video Sharing Javascript Library For js-ipfs
AgoraTube is an add-on library to [js-ipfs](https://github.com/ipfs/js-ipfs) which allows a user to run an IPFS node in their browser and leverage that node to upload, download, and play media files. It's free, no centralized server (or database) is needed and the resulting files have all of the censorship resistance that [The Interplanetary File System](http://ipfs.io) brings to the party.

## The Challenge

The world is facing a challenge. Free speech is being stifled by the new gatekeepers of media. The big sites and social media networks, in concert with governments, are censoring thoughts and speech that challenges the status quo. IPFS presents a free, uncensorable alternative, but it currently lacks ease-of-use for those without a technical background. If we really want mass adoption of these new, censorship-resistant technologies, our challenge is to make uploading and viewing of content easy for end users. 

AgoraTube allows content to be uploaded to IPFS in the browser. The virtual machine in the browser, while running the IPFS node, has limitations on the size of file that can be uploaded. AgoraTube solves this by cutting the file into chunks and creating a playlist pointer file. This process is similar to the idea behind [HLS streaming](https://github.com/ipfs/js-ipfs/tree/master/examples/browser-video-streaming). On the other side: AgoraTube, when given the hash of the pointer, downloads the chunks and intelligently stitches them together in the media player or enables a download of the whole file to the user's local disk.

## Usage

AgoraTube is easy to implement. It was built using the js-ipfs example located [here](https://github.com/ipfs/js-ipfs/tree/master/examples/browser-script-tag).

First, include js-ipfs and the agoratube.js in this repository in your html file.
```
<script src="https://unpkg.com/ipfs/dist/index.js"></script>
<script src="agoratube.js"></script>
```
You can also pull agoratube.js from RawGit.
```
<script src="https://cdn.rawgit.com/vinarmani/AgoraTube/78d58177/agoratube.js"></script>
```
Then define and create a new AgoraTube object and tell it to initialize the IPFS node when it is ready
```
const atube = new AgoraTube(null);
	
atube.on('ready', e => {
  console.log("AgoraTube readyState:", e.detail);
  // Init the node once AgoraTube is ready
  node.init(handleInit)
});
```
Then start up the IPFS node
```
const repoPath = 'ipfs-' + Math.random()

// Create an IPFS node
const node = new Ipfs({
  init: false,
  start: false,
  repo: repoPath
})

function handleInit (err) {
  if (err) {
    throw err
  }

  node.start(() => {
    // Your code goes here. You have full use of js-ipfs functionality as well as the functionality of AgoraTube
  })
}
```

This repository includes simple examples for upload, download, and video playing.

## Limitations - PLEASE READ!

Because AgoraTube uses the native HTML5 video element, it is limited in what file types it can play. Currently, only MP4 files encoded with H.264 video and AAC audio are compatible with AgoraTube. Eventually, all files compatible with the HTML5 Video and Audio elements will be supported. All file types are supported for upload and straight download.

Video files also must be [MPEG DASH](https://en.wikipedia.org/wiki/Dynamic_Adaptive_Streaming_over_HTTP) compliant this means that content creators will nedd to take an additional step before uploading their content if they want it to play in the video player.

First you must have MP4Box, which can be downloaded [here](https://gpac.wp.imt.fr/mp4box/). Then, from the command line, you must run this command on your file:
```
MP4Box -dash 1000 your_file.mp4
```
This will generate a new file with 1 second DASH segmentation. That file will be compatible with AgoraTube. I hope, in the future, to find a way to provide this functionality without the user having to do this additional step.
