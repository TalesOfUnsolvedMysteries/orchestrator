require('dotenv').config();
const OBSWebSocket = require('obs-websocket-js');
const { uploadVideo } = require('./thetaVideoManager');

const obs = new OBSWebSocket();
let obsConnected = false;
let recordingFolder;
let lastVideoName = '';

const init = async () => {
  console.log('going to connect');
  try {
    await obs.connect({ address: process.env.OBS_WEBSOCKET_ADDRESS, password: process.env.OBS_WEBSOCKET_PASSWORD });
    const res = await obs.send('GetRecordingFolder');
    recordingFolder = res['rec-folder'].replace(/\\/g, '/');
    console.log('recoding folder:', recordingFolder);
    obsConnected = true;
  } catch(error) {
    console.error(error);
    console.log('not connected');
    return;
  }
  console.log('connected');
  obs.on('RecordingStopped', async ({recordingFilename}) => {
    console.log(recordingFilename);
    recordingFilename = recordingFilename.replace(recordingFolder, process.env.OBS_RECORDING_PATH);
    console.log('updated to', recordingFilename);
    await uploadVideo(recordingFilename, lastVideoName);
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

const test = async () => {
  await init();
  await startRecording('testing');
  await new Promise((resolve) => setTimeout(resolve, 5*60*1000));
  await stopRecording();
};

test();
