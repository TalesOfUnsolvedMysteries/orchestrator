
require('dotenv').config();
const thetaConnector = require('./thetaConnector');
const userManager = require('./userManager');
const lineManager = require('./lineManager');
const gameManager = require('./gameManager');
const obsConnector = require('./obsConnector');
const connectionManager = require('./connectionManager');
const log = require('./log');


const SERVER_STATE = {
  OFFLINE: 0,
  SETTING_UP: 1,
  READY: 2
};

let serverState = SERVER_STATE.OFFLINE;

const setup = async () => {
  serverState = SERVER_STATE.SETTING_UP;
  await thetaConnector.init();
  connectionManager.init();
  userManager.init();
  await lineManager.init();
  await obsConnector.init();
  gameManager.init(connectionManager);
  serverState = SERVER_STATE.SETTING_UP;
};

(async () => {
  log.info('\n\n\n');
  log.info('===== THE BUG ADVENTURE SHOW =====');
  log.info('       initializating server      ');
  log.info('==================================');
  log.info('');
  log.info('');
  log.info('[NS] Node Server - initialization');
  await setup();
  log.info('[NS] Node Server is ready!');
})();

