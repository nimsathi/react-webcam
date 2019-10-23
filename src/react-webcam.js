/* @flow */
import React, { Component } from 'react';
import { createMediaRecorder, startRecording } from './video';

/*
Deliberately ignoring the old api, due to very inconsistent behaviour
*/
const mediaDevices = navigator.mediaDevices;
const getUserMedia = mediaDevices && mediaDevices.getUserMedia ? mediaDevices.getUserMedia.bind(mediaDevices) : null;
const hasGetUserMedia = !!(getUserMedia);

const DEBUG = false;
const debugConsole = (...args) => {
  if (DEBUG) console.log(...args);
};

type constraintTypes = number | Object;
type facingModeLiterals = 'user' | 'environment'
type facingModeType = facingModeLiterals | { exact: facingModeLiterals}

type CameraType = {
  audio?: boolean,
  onUserMedia: Function,
  onFailure: Function,
  height?: constraintTypes,
  width?: constraintTypes,
  fallbackHeight?: constraintTypes,
  fallbackWidth?: constraintTypes,
  facingMode?: facingModeType,
  screenshotFormat?: 'image/webp' |
    'image/png' |
    'image/jpeg'
  ,
  className?: String,
}

type State = {
  hasUserMedia: boolean,
  mirrored: boolean
}

const permissionErrors = ['PermissionDeniedError', 'NotAllowedError','NotFoundError'];

const stopStreamTracks = (stream: MediaStream) => {
  if (stream.getVideoTracks) {
    for (let track of stream.getVideoTracks()) {
      track.stop();
    }
  }
  if (stream.getAudioTracks) {
    for (let track of stream.getAudioTracks()) {
      track.stop();
    }
  }
};

export default class Webcam extends Component<CameraType, State> {
  static defaultProps = {
    audio: false,
    screenshotFormat: 'image/webp',
    onUserMedia: () => {},
    onFailure: () => {}
  };

  static mountedInstances = [];

  static userMediaRequested = false;

  state = {
    hasUserMedia: false,
    mirrored: false
  };

  stream: MediaStream
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  video: ?HTMLVideoElement
  recordedBlobs: Array<any>
  mediaRecorder: Object

  constructor(props: CameraType) {
    super(props);

    if (!hasGetUserMedia) {
      const error = new Error('getUserMedia is not supported by this browser');
      this.props.onFailure(error);
    }
  }

  componentDidMount() {
    Webcam.mountedInstances.push(this);
    this.requestUserMedia();
  }

  getConstraints(width: *, height: *, facingMode?: facingModeType, audio?: boolean): Object {
    /*
    Safari 11 has a bug where if you specify both the height and width
    constraints you must chose a resolution supported by the web cam. If an
    unsupported resolution is used getUserMedia(constraints) will hit a
    OverconstrainedError complaining that width is an invalid constraint.
    This bug exists for ideal constraints as well as min and max.

    However if only a height is specified safari will correctly chose the
    nearest resolution supported by the web cam.

    Reference: https://developer.mozilla.org/en-US/docs/Web/API/Media_Streams_API/Constraints
    */

    // if `{facingMode: 'user'}` Firefox will still allow the user to choose which camera to use (Front camera will be the first option)
    // if `{facingMode: {exact: 'user'}}` Firefox won't give the user a choice and will show the front camera
    const constraints: Object = { video: { facingMode }, audio };

    if (width) {
      constraints.video.width = parseInt(width, 10) || width; // some devices need a Number type
    }

    if (height) {
      constraints.video.height = parseInt(height, 10) || height;
    }

    return constraints;
  }

  requestUserMedia() {
    if (!getUserMedia || !mediaDevices || Webcam.userMediaRequested) return;
    const { width, height, facingMode, audio, fallbackWidth, fallbackHeight } = this.props;

    const constraints = this.getConstraints(width, height, facingMode, audio);
    const fallbackConstraints = this.getConstraints(fallbackWidth, fallbackHeight, facingMode, audio);

    const logError = e => console.log('error', e, typeof e);

    const onSuccess = stream => {
      Webcam.userMediaRequested = false;
      Webcam.mountedInstances.forEach((instance) => instance.handleUserMedia(stream));
    };

    let hasTriedFallbackConstraints;
    const onError = e => {
      Webcam.userMediaRequested = false;
      logError(e);
      const isPermissionError = permissionErrors.includes(e.name);
      if (isPermissionError || hasTriedFallbackConstraints) {
        Webcam.mountedInstances.forEach((instance) => instance.handleError(e));
      } else {
        hasTriedFallbackConstraints = true;
        getUserMedia(fallbackConstraints).then(onSuccess).catch(onError);
      }
    };
    Webcam.userMediaRequested = true;
    getUserMedia(constraints).then(onSuccess).catch(onError);
  }

  handleError(error: Object) {
    this.setState({
      hasUserMedia: false
    });
    this.props.onFailure(error);
  }

  handleUserMedia(stream: MediaStream) {
    this.stream = stream;
    const videoSettings = stream.getVideoTracks()[0].getSettings();
    debugConsole('video track settings', videoSettings);
    this.setState({
      hasUserMedia: true,
      mirrored: videoSettings.facingMode === 'user'
                /* #HACK desktop cameras seem to have `facingMode` undefined,
                therefore we are assuming all desktop cameras are user facing*/
                || !videoSettings.facingMode
    });

    this.props.onUserMedia();
  }

  componentWillUnmount() {
    const index = Webcam.mountedInstances.indexOf(this);
    Webcam.mountedInstances.splice(index, 1);

    /*
    We need to call `stopStreamTracks` since otherwise devices will continue
    holding onto the stream (e.g. recording through the webcam, even though we
    no longer need the stream)
    However - some devices (namely iOS Safari) have issues with calling
    `getUserMedia` multiple times from cold (i.e. without any existing streams
    already running in the background), so we don't stop the stream for
    `stopDelay` milliseconds, in an attempt to re-use the same stream, if a new
    component is mounted soon after.
    This issue of iOS Safari was pinpointed by unmounting and remounting the
    webcam component multiple times, and confirming that the error occurred in
    the `getUserMedia` request - and then testing that the error did _not_ occur
    if we never called `.stop()` on the tracks (however we do need to relinquish
    the stream eventually)
    The precise value for `stopDelay` is a finger-in-the-air value, that is
    a nice balance between the stream being relinquished (so the webcam light
    turns off etc.), and the crash not occuring (because of the wait)
    */
    const stopDelay = 1000;
    setTimeout(() => stopStreamTracks(this.stream), stopDelay);
  }

  getScreenshot() {
    const canvas = this.getCanvas();
    if (!canvas) return null;
    return canvas.toDataURL(this.props.screenshotFormat);
  }

  getCanvas(): HTMLCanvasElement | null {
    if (!this.state.hasUserMedia || !this.video) return null;

    const video = this.video;

    if (!this.canvas) this.canvas = document.createElement('canvas');
    const { canvas } = this;

    if (!this.ctx) this.ctx = canvas.getContext('2d');
    const { ctx } = this;

    // This is set every time incase the video element has resized
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    debugConsole(`drawn image to canvas: ${canvas.width}x${canvas.height}`);
    return canvas;
  }

  startRecording() {
    this.mediaRecorder = createMediaRecorder(this.stream);
    this.recordedBlobs = startRecording(this.mediaRecorder);
  }

  stopRecording() {
    this.mediaRecorder.stop(this.recordedBlobs);
  }

  getVideoBlob() {
    return new Blob(this.recordedBlobs, {type: "video/webm"});
  }

  render() {
    // React will try and optimise this on re-mounts, so make sure to explicitly
    // not render with a stream that no longer exists
    // This is likely related to https://github.com/onfido/onfido-sdk-ui/blob/249f54264f3a1674a2702b95967bb91ec6e3b90d/src/components/Confirm/index.js#L37
    // as the `video` element should not _should_ not show anything if the stream
    // is `null` anyway
    if (!this.stream) return null;

    return (
      <video
        style={{
          // not necessary to add prefixes, since all browsers that support camera
          // support transform
          transform: this.state.mirrored ? 'scaleX(-1)' : ''
        }}
        ref={(el) => this.video = el}
        autoPlay
        playsinline// necessary for iOS, see https://github.com/webrtc/samples/issues/929
        srcObject={this.stream}
        muted={true} // muted must be true for recording videos
        className={this.props.className}
      />
    );
  }
}
