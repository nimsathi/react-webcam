const mediaSource = new MediaSource();
mediaSource.addEventListener('sourceopen', handleSourceOpen, false);
let mediaRecorder;
let recordedBlobs;
let sourceBuffer;


const handleSourceOpen = () => {
  console.log('MediaSource opened');
  sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8"');
  console.log('Source buffer: ', sourceBuffer);
};

function handleDataAvailable(event) {
  if (event.data && event.data.size > 0) {
    recordedBlobs.push(event.data);
  }
}

function handleStop(event) {
  console.log('Recorder stopped: ', event);
}

export const startRecording = () => {
  recordedBlobs = [];
  let options = {mimeType: 'video/webm;codecs=vp9'};
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    console.log(`${options.mimeType} is not Supported`);
    options = {mimeType: 'video/webm;codecs=vp8'};
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.log(`${options.mimeType} is not Supported`);
      options = {mimeType: 'video/webm'};
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log(`${options.mimeType} is not Supported`);
        options = {mimeType: ''};
      }
    }
  }
  try {
    mediaRecorder = new MediaRecorder(window.stream, options);
  } catch (e) {
    console.error(`Exception while creating MediaRecorder: ${e}`);
    alert(`Exception while creating MediaRecorder: ${e}. mimeType: ${options.mimeType}`);
    return;
  }
  console.log('Created MediaRecorder', mediaRecorder, 'with options', options);
  mediaRecorder.onstop = handleStop;
  mediaRecorder.ondataavailable = handleDataAvailable;
  mediaRecorder.start(10); // collect 10ms of data
  console.log('MediaRecorder started', mediaRecorder);
};

export const stopRecording = () => {
  mediaRecorder.stop();
  console.log('Recorded Blobs: ', recordedBlobs);
  // send callback that video has been stopped
};


// move this to onfido-sdk-ui
// function play() {
//   const superBuffer = new Blob(recordedBlobs, {type: 'video/webm'});
//   return window.URL.createObjectURL(superBuffer);
// }
