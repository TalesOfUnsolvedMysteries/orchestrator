
require('dotenv').config();
const blockchainConnector = require('./nearConnector');
const userManager = require('./userManager');
const lineManager = require('./lineManager');
const gameManager = require('./gameManager');
const obsConnector = require('./obsConnector');
//const connectionManager = require('./connectionManager');
const requestServer = require('./requestServer');
const log = require('./log');
const db = require('./dataManager');
const readline = require("readline");


const SERVER_STATE = {
  OFFLINE: 0,
  SETTING_UP: 1,
  NOT_READY: 2,
  READY: 3
};
let serverState = SERVER_STATE.OFFLINE;
let servingClients = false;

const setup = async () => {
  await db.init();
  serverState = SERVER_STATE.SETTING_UP;
  await blockchainConnector.init();
  //connectionManager.init();
  requestServer.startServer();
  userManager.init();
  await lineManager.init(checkLine);
  gameManager.init(checkServerStatus);
  await obsConnector.init(checkServerStatus);
  checkServerStatus();
};

const checkLine = async () => {
  if (serverState != SERVER_STATE.READY || !servingClients) return;
  log.info('[NS] checking players in line ========================');
  if (gameManager.getState() !== gameManager.GAME_STATE.READY) {
    return log.warn(`[NS] Game Manager is not ready ${gameManager.GAME_STATE_NAME[gameManager.getState()]}`);
  };
  if (lineManager.isLineEmpty()) {
    return log.warn('[NS] There are no players in line');
  };
  const first = lineManager.getFirstInLine();
  if (!first) {
    log.warn('[NS] player is not ready to play');
    lineManager.peek();
    return;
  }
  log.info(`[NS] first player in line is ${ first.getUserID() }`);
  const isPlayerPlaying = await gameManager.servePlayer(first);
  if (!isPlayerPlaying) {
    log.warn('[NS] player couldn\'t connect to the game.');
    lineManager.peek();
    return;
  }
  // if there is a second player then ask to connect to lobby
  const nextPlayer = lineManager.getNextPlayer();
  if (nextPlayer) {
    gameManager.setupNextPlayer(nextPlayer);
  }
};

const checkServerStatus = () => {
  let ready = true;
  ready &&= blockchainConnector.isConnected();
  console.log('\n========================================================================');
  log.info(`[NS] CHECKING STATUS:`);
  log.info(`[TC] status=${ blockchainConnector.isConnected() ? 'OK': 'FAIL' }`);
  // ready &&= connectionManager.isStarted();
  // log.info(`[CM] status=${ connectionManager.isStarted() ? 'OK': 'FAIL' }`);
  log.info(`[UM] status=OK`);
  log.info(`[LM] status=OK`);
  ready &&= obsConnector.isConnected();
  log.info(`[OC] status=${ obsConnector.isConnected() ? 'OK': 'FAIL' }`);
  ready &&= gameManager.getState() >= gameManager.GAME_STATE.READY;
  log.info(`[GM] status=${ ['OFFLINE', 'CONNECTING', 'READY', 'PLAYING', 'BUSY'][gameManager.getState()] }`);
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
      case 'OBS start':
        log.info(`[NS] admin request OBS connector to start recording`);
        await obsConnector.startRecording('aaa');
        break;
      case 'OBS stop':
        log.info(`[NS] admin request OBS connector to stop recording`);
        await obsConnector.stopRecording();
        break;
      case 'status':
        log.info(`[NS] admin request for status`);
        checkServerStatus();
        break;
      case 'start':
        log.info(`[NS] admin request to start serving clients`);
        servingClients = true;
        checkLine();
        break;
      case 'pause':
        log.info(`[NS] admin request to pause serving clients`);
        servingClients = false;
        break;
      case 'init contract':
        log.info(`[NS] admin request to initialize contract metadata`);
        await blockchainConnector.initContract();
        break
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

