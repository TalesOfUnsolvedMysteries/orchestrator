
require('dotenv').config();
const thetaConnector = require('./thetaConnector');
const userManager = require('./userManager');
const lineManager = require('./lineManager');
const gameManager = require('./gameManager');
const connectionManager = require('./connectionManager');


const init = async () => {
  await thetaConnector.init();
  connectionManager.init();
  // const contract = thetaConnector.getContract();
  // const accessories = await contract.getGlobalAccessories();
  userManager.init();
  gameManager.init(connectionManager);
  await lineManager.syncLine();
};

init();

