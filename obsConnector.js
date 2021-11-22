const OBSWebSocket = require('obs-websocket-js');
const { uploadVideo } = require('./thetaVideoManager');
const log = require('./log');

let obs;
let obsConnected = false;
let recordingFolder;
let lastVideoName = '';
let stateChangeListener;
let onVideoSaved = _ => _;

const init = async (_stateChangeListener) => {
  log.info(`[OC] OBS Connector - initialization`);
  await connect(false);
  stateChangeListener = _stateChangeListener;
};

const connect = async (reset) => {
  if (obsConnected && !reset) return;
  if (obsConnected) {
    obs.disconnect();
  }
  obs = new OBSWebSocket();
  try {
    log.info('[OC] stablishing connection to OBS WebSocket server');
    await obs.connect({ address: process.env.OBS_WEBSOCKET_ADDRESS, password: process.env.OBS_WEBSOCKET_PASSWORD });
    const res = await obs.send('GetRecordingFolder');
    recordingFolder = res['rec-folder'].replace(/\\/g, '/');
    log.info('[OC] recoding folder:', recordingFolder);
    obsConnected = true;
    stateChangeListener && stateChangeListener();
  } catch(error) {
    console.error(error);
    log.error('[OC] not connected');
    return;
  }
  log.info('[OC] connected');
  obs.on('RecordingStopped', async ({ recordingFilename }) => {
    log.info(`[OC] recordingFilename: ${ recordingFilename }`);
    recordingFilename = recordingFilename.replace(recordingFolder, process.env.OBS_RECORDING_PATH);
    log.info('[OC] updated to', recordingFilename);
    const video = await uploadVideo(recordingFilename, lastVideoName);
    onVideoSaved(video.id);
  });
  obs.on('ConnectionClosed', (data) => {
    log.warn('[OC] connection closed');
    obsConnected = false;
    stateChangeListener();
  });
};

const startRecording = async (filename) => {
  if (!obsConnected) return;
  try {
    await obs.send('SetFilenameFormatting', {'filename-formatting': filename});
    lastVideoName = filename;
    await obs.send('StartRecording');
  } catch(error) {
    console.error(error);
  }
};

const stopRecording = async () => {
  if (!obsConnected) return;
  await obs.send('StopRecording');
  await obs.send('SetFilenameFormatting', {'filename-formatting': '%CCYY-%MM-%DD %hh-%mm-%ss'});
};

const setScene = async (sceneName) => {
  if (!obsConnected) return;
  await obs.send('SetCurrentScene', {'scene-name': sceneName});
}

const test = async () => {
  await init();
  await startRecording('testing');
  await new Promise((resolve) => setTimeout(resolve, 5*60*1000));
  await stopRecording();
};

module.exports = {
  init,
  connect,
  startRecording,
  stopRecording,
  setScene,
  onVideoSaved: (cb) => onVideoSaved = cb,
  isConnected: () => obsConnected
};

