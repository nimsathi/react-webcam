import React, { Component, PropTypes } from 'react';
import { findDOMNode } from 'react-dom';

/*
Deliberately ignoring the old api, due to very inconsistent behaviour
*/
const mediaDevices = navigator.mediaDevices;
const getUserMedia = mediaDevices && mediaDevices.getUserMedia ? mediaDevices.getUserMedia.bind(mediaDevices) : null;
const hasGetUserMedia = !!(getUserMedia);

const constraintTypes = PropTypes.oneOfType([PropTypes.number, PropTypes.object]);

export default class Webcam extends Component {
  static propTypes = {
    audio: PropTypes.bool,
    muted: PropTypes.bool,
    onUserMedia: PropTypes.func,
    onFailure: PropTypes.func,
    height: constraintTypes,
    width: constraintTypes,
    screenshotFormat: PropTypes.oneOf([
      'image/webp',
      'image/png',
      'image/jpeg'
    ]),
    className: PropTypes.string,
    audioSource: PropTypes.string,
    videoSource: PropTypes.string
  };

  static defaultProps = {
    audio: true,
    screenshotFormat: 'image/webp',
    onUserMedia: () => {},
    onFailure: () => {}
  };

  static mountedInstances = [];

  static userMediaRequested = false;

  constructor(props) {
    super(props);
    this.state = {
      hasUserMedia: false
    };

    if (!hasGetUserMedia) {
      const error = new Error('getUserMedia is not supported by this browser');
      this.props.onFailure(error);
    }
  }

  componentDidMount() {
    Webcam.mountedInstances.push(this);

    if (!Webcam.userMediaRequested) {
      this.requestUserMedia();
    }
  }

  requestUserMedia() {
    const sourceSelected = (audioSource, videoSource) => {
      const { height, width } = this.props;
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
      const constraints = {
        video: {
          sourceId: videoSource,
          width, height
        }
      };

      if (this.props.audio) {
        constraints.audio = {
          sourceId: audioSource
        };
      }

      const logError = e => console.log('error', e, typeof e);

      const onSuccess = stream => {
        Webcam.mountedInstances.forEach((instance) => instance.handleUserMedia(stream));
      };

      const onError = e => {
        logError(e);
        Webcam.mountedInstances.forEach((instance) => instance.handleError(e));
      };
      getUserMedia(constraints).then(onSuccess).catch(onError);
    };

    if (this.props.audioSource && this.props.videoSource) {
      sourceSelected(this.props.audioSource, this.props.videoSource);
    } else {
      mediaDevices.enumerateDevices().then((devices) => {
        let audioSource = null;
        let videoSource = null;

        devices.forEach((device) => {
          if (device.kind === 'audio') {
            audioSource = device.id;
          } else if (device.kind === 'video') {
            videoSource = device.id;
          }
        });

        sourceSelected(audioSource, videoSource);
      })
      .catch((error) => {
        console.log(`${error.name}: ${error.message}`); // eslint-disable-line no-console
      });
    }

    Webcam.userMediaRequested = true;
  }

  handleError(error) {
    this.setState({
      hasUserMedia: false
    });
    this.props.onFailure(error);
  }

  handleUserMedia(stream) {
    this.stream = stream;
    this.setState({
      hasUserMedia: true,
    });

    this.props.onUserMedia();
  }

  componentWillUnmount() {
    const index = Webcam.mountedInstances.indexOf(this);
    Webcam.mountedInstances.splice(index, 1);

    if (Webcam.mountedInstances.length === 0 && this.state.hasUserMedia) {
      if (this.stream.stop) {
        this.stream.stop();
      } else {
        if (this.stream.getVideoTracks) {
          for (let track of this.stream.getVideoTracks()) {
            track.stop();
          }
        }
        if (this.stream.getAudioTracks) {
          for (let track of this.stream.getAudioTracks()) {
            track.stop();
          }
        }
      }
      Webcam.userMediaRequested = false;
    }
  }

  getScreenshot() {
    if (!this.state.hasUserMedia) return null;

    const canvas = this.getCanvas();
    return canvas.toDataURL(this.props.screenshotFormat);
  }

  getCanvas() {
    if (!this.state.hasUserMedia) return null;

    const video = findDOMNode(this);

    if (!this.canvas) this.canvas = document.createElement('canvas');
    const { canvas } = this;

    if (!this.ctx) this.ctx = canvas.getContext('2d');
    const { ctx } = this;

    // This is set every time incase the video element has resized
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas;
  }

  render() {
    return (
      <video
        autoPlay
        srcObject={this.stream}
        muted={this.props.muted}
        className={this.props.className}
      />
    );
  }
}
