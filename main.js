
require('dotenv').config();
const thetaConnector = require('./thetaConnector');
const userManager = require('./userManager');
const lineManager = require('./lineManager');
const gameManager = require('./gameManager');
const obsConnector = require('./obsConnector');
const connectionManager = require('./connectionManager');
const log = require('./log');
const readline = require("readline");


const SERVER_STATE = {
  OFFLINE: 0,
  SETTING_UP: 1,
  NOT_READY: 2,
  READY: 3
};

let serverState = SERVER_STATE.OFFLINE;

const setup = async () => {
  serverState = SERVER_STATE.SETTING_UP;
  await thetaConnector.init();
  connectionManager.init();
  userManager.init();
  await lineManager.init();
  gameManager.init(connectionManager, checkServerStatus);
  await obsConnector.init(checkServerStatus);
  checkServerStatus();
};

const checkServerStatus = () => {
  let ready = true;
  ready &&= thetaConnector.isConnected();
  console.log('\n========================================================================');
  log.info(`[NS] CHECKING STATUS:`);
  log.info(`[TC] status=${ thetaConnector.isConnected() ? 'OK': 'FAIL' }`);
  ready &&= connectionManager.isStarted();
  log.info(`[CM] status=${ connectionManager.isStarted() ? 'OK': 'FAIL' }`);
  log.info(`[UM] status=OK`);
  log.info(`[LM] status=OK`);
  ready &&= obsConnector.isConnected();
  log.info(`[OC] status=${ obsConnector.isConnected() ? 'OK': 'FAIL' }`);
  ready &&= gameManager.getState() > 2;
  log.info(`[GM] status=${ ['OFFLINE', 'CONNECTING', 'BUSY', 'READY', 'PLAYING'][gameManager.getState()] }`);
  serverState = ready ? SERVER_STATE.READY : SERVER_STATE.NOT_READY;
  log.info(`[NS] status=${ ready ? 'READY': 'NOT READY' }`);
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const handleCommands = () => {
  rl.question('', async (command) => {
    switch (command) {
      case 'OBS --reset':
        log.info(`[NS] admin request OBS connector reconnection`);
        await obsConnector.connect(true);
        checkServerStatus();
      break;
      case 'status':
        log.info(`[NS] admin request for status`);
        checkServerStatus();
      break;
      case 'start':
      break;
      case 'exit':
        log.info(`[NS] admin request for exit.\n\n\n`);
        process.exit(0);
      default:
        if (command.length > 0) console.log(`invalid input: <${ command }>`);
      break;
    }
    setTimeout(handleCommands, 1);
  });
}

(async () => {
  log.info('=============== THE BUG ADVENTURE SHOW ===============');
  log.info('*                                                    *');
  log.info('*              initializating server...              *');
  log.info('*                                                    *');
  log.info('======================================================');
  console.log('\n\n');
  log.info('[NS] Node Server - initialization');
  await setup();
  console.log('\n');
  log.info('[NS] listen for commands:');
  handleCommands();
})();

